import type { StorageInfo } from '@dcos/local-storage';
import { Badge, Button, Card, downloadBlob, Input, Kbd, Select, useToast } from '@dcos/ui';
import { Download, Eraser, HardDrive, ShieldCheck, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitcher } from '../../components/AppShell';
import { formatBytes, relativeTime } from '../../lib/format';
import { setPreference, usePreferences } from '../../lib/preferences';
import { cleanUpAttachments, notifyStorageChanged, recordBackup, requestPersistentStorage, storage, useDataSafety } from '../../lib/storage';
import { Section } from './SettingsLayout';
import { UnsavedDrafts } from './UnsavedDrafts';

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

const stamp = () => new Date().toISOString().slice(0, 10);

export function GeneralSettings() {
  const prefs = usePreferences();
  return (
    <>
      {/* @phase4:review — the comment author name and the remembered spell check setting. */}
      <Section title="Your name" description="Shown on comments you write in documents, and written as the comment author when you export to Word (.docx). Kept on this device only.">
        <Input
          value={prefs.authorName}
          onChange={(e) => setPreference('authorName', e.target.value.slice(0, 200))}
          placeholder="e.g. Ada Lovelace"
          aria-label="Your name"
          autoComplete="name"
          className="h-9 md:w-64"
        />
      </Section>
      <Section title="Spell check" description="Whether documents open with the browser's spell checker on. Turning it on or off in a document changes this too.">
        <Select value={prefs.spellCheck ? 'on' : 'off'} onChange={(e) => setPreference('spellCheck', e.target.value === 'on')} aria-label="Spell check in documents" className="h-9">
          <option value="on">On</option>
          <option value="off">Off</option>
        </Select>
      </Section>
      <Section title="New blank documents" description="The editing mode a blank document starts in. Templates keep their own mode. You can switch at any time in the editor.">
        <Select value={prefs.newDocumentMode} onChange={(e) => setPreference('newDocumentMode', e.target.value as 'simple' | 'advanced')} aria-label="Mode for new blank documents" className="h-9">
          <option value="simple">Simple</option>
          <option value="advanced">Advanced</option>
        </Select>
      </Section>
      <Section title="Backup reminder" description="How long after your last backup export the Dashboard reminds you to make a new one.">
        <Select value={String(prefs.backupReminderDays)} onChange={(e) => setPreference('backupReminderDays', Number(e.target.value))} aria-label="Backup reminder interval" className="h-9">
          {[3, 7, 14, 30].map((d) => (
            <option key={d} value={d}>
              After {d} days
            </option>
          ))}
        </Select>
      </Section>
    </>
  );
}

export function AppearanceSettings() {
  return (
    <Section title="Theme" description="Choose light, dark, or follow your device setting. Documents and diagrams always print on white paper. Slides always keep their own backgrounds.">
      <ThemeSwitcher />
    </Section>
  );
}

export function StorageSettings() {
  const toast = useToast();
  const safety = useDataSafety();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cleaning, setCleaning] = useState(false);
  const [cleanUpResult, setCleanUpResult] = useState<string | null>(null);

  const refresh = async () => {
    try {
      setInfo(await storage.info());
      setError(null);
    } catch (err) {
      setError(messageOf(err));
    }
    try {
      const est = await navigator.storage?.estimate?.();
      if (est) setUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    } catch {
      // The browser does not say how much space is used; nothing else depends on it.
    }
    await safety.refresh();
  };

  const freeUpSpace = async () => {
    setCleaning(true);
    setCleanUpResult(null);
    try {
      const { removed, freedBytes } = await cleanUpAttachments();
      setCleanUpResult(removed === 0 ? 'Nothing to remove' : `Removed ${removed} unused image${removed === 1 ? '' : 's'}, ${formatBytes(freedBytes)}`);
      void refresh();
    } catch (err) {
      setCleanUpResult(`Nothing was removed. ${messageOf(err)}`);
    } finally {
      setCleaning(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {error && (
        <Card role="alert" className="p-5 text-sm text-danger">
          Storage details could not be read. {error}
        </Card>
      )}
      <Section
        title="Keep my data on this device"
        description="Your work lives in this browser's local database. Without persistent storage, the browser may clear it when the device runs low on space."
      >
        <div className="flex flex-col items-start gap-2 md:items-end">
          {safety.persist === 'persisted' ? (
            <Badge tone="success">
              <ShieldCheck size={12} /> Persistent storage on
            </Badge>
          ) : safety.persist === 'unsupported' ? (
            <Badge tone="warning">
              <ShieldAlert size={12} /> Not available in this browser — keep regular backups
            </Badge>
          ) : (
            <Button
              size="sm"
              icon={<HardDrive size={14} />}
              onClick={async () => {
                const state = await requestPersistentStorage();
                toast(
                  state === 'persisted' ? 'Persistent storage is on' : 'The browser did not allow it yet. Keep regular backups; browsers often allow it after you use the app for a while.',
                  state === 'persisted' ? 'success' : 'info',
                );
                void refresh();
              }}
            >
              Make storage persistent
            </Button>
          )}
          {usage && (
            <span className="text-xs text-muted">
              {formatBytes(usage.usage)} used of {formatBytes(usage.quota)} available
            </span>
          )}
        </div>
      </Section>

      {info && info.safetyCopies.length > 0 && (
        <Section
          title="Copies kept from before updates"
          description="When Classroom OS updates how it stores data, it first keeps a full copy of your previous data on this device. You can export one as a backup file, or delete it to free space."
        >
          <div className="flex flex-col gap-2">
            {info.safetyCopies.map((name) => (
              <div key={name} className="flex items-center gap-2 text-xs">
                <span className="font-mono text-muted">{name}</span>
                <Button
                  size="sm"
                  icon={<Download size={13} />}
                  onClick={async () => {
                    try {
                      const backup = await storage.exportSafetyCopy(name);
                      downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `classroom-os-${name}-${stamp()}.json`);
                    } catch (err) {
                      toast(`The copy could not be exported. ${messageOf(err)}`, 'error');
                    }
                  }}
                >
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  icon={<Trash2 size={13} />}
                  onClick={async () => {
                    if (!confirm('Delete this copy? Your current data is not affected.')) return;
                    try {
                      await storage.deleteSafetyCopy(name);
                    } catch (err) {
                      toast(`The copy could not be deleted. ${messageOf(err)}`, 'error');
                    }
                    void refresh();
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section
        title="Free up space"
        description="Removes stored images that no document, diagram, presentation, saved version or draft uses any more. Images used in the last day are kept, in case a page that is still open needs them."
      >
        <div className="flex flex-col items-start gap-2 md:items-end">
          <Button size="sm" icon={<Eraser size={14} />} disabled={cleaning} onClick={() => void freeUpSpace()}>
            Free up space
          </Button>
          {cleanUpResult && (
            <span role="status" className="text-xs text-muted">
              {cleanUpResult}
            </span>
          )}
        </div>
      </Section>

      <UnsavedDrafts />

      {info && (
        <Card className="p-5 text-xs text-muted">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            <dt>Storage engine</dt>
            <dd className="text-fg">{info.backend}</dd>
            <dt>Database version</dt>
            <dd className="text-fg">{info.schemaVersion}</dd>
            <dt>Device ID</dt>
            <dd className="break-all font-mono text-fg">{info.deviceId}</dd>
          </dl>
        </Card>
      )}
    </>
  );
}

export function BackupSettings() {
  const toast = useToast();
  const safety = useDataSafety();
  const fileInput = useRef<HTMLInputElement>(null);

  const exportBackup = async () => {
    try {
      const backup = await storage.exportBackup();
      downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `classroom-os-backup-${stamp()}.json`);
      // Browsers don't report whether the download was kept, so this records the export, not a saved file (STOR-R9).
      await recordBackup();
      toast(`Backup exported: ${backup.items.length} items, ${backup.versions.length} versions. Check that your browser saved the file.`, 'success');
    } catch (err) {
      toast(`Backup failed — nothing was exported. ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const importBackup = async (file: File) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      toast('Nothing was imported. This file could not be read as a backup: it may be damaged or incomplete.', 'error');
      return;
    }
    try {
      const report = await storage.importBackup(parsed);
      notifyStorageChanged();
      void requestPersistentStorage();
      const parts = [`${report.added} added`, `${report.skipped} already present`];
      if (report.copied) parts.push(`${report.copied} restored as copies (your current versions were kept)`);
      if (report.unsupported) parts.push(`${report.unsupported} items need a newer version of the app and were left out`);
      toast(`Backup restored: ${parts.join(', ')}`, 'success');
    } catch (err) {
      toast(`Nothing was imported. ${err instanceof Error ? err.message : 'Could not read the backup file'}`, 'error');
    }
  };

  return (
    <>
      <Section
        title="Back up everything"
        description={
          <>
            Saves every document, diagram, presentation and version on this device into one file. Keep it somewhere else, like a USB drive or cloud folder.
            <div className="mt-2 text-xs">{safety.lastBackupAt ? `Last backup exported ${relativeTime(safety.lastBackupAt)}.` : 'No backup has been exported on this device yet.'}</div>
          </>
        }
      >
        <Button variant="primary" icon={<Download size={15} />} onClick={exportBackup}>
          Export backup
        </Button>
      </Section>
      <Section
        title="Restore from a backup"
        description="Restoring never overwrites work on this device. Items that are already here and unchanged are skipped. If you have changed an item since the backup was made, the backed-up version is added once, as a separate copy marked “(restored)”."
      >
        <Button icon={<Upload size={15} />} onClick={() => fileInput.current?.click()}>
          Restore from file
        </Button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importBackup(f);
            e.target.value = '';
          }}
        />
      </Section>
    </>
  );
}

const mod = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
const SHORTCUTS: Array<{ area: string; items: Array<[string, string]> }> = [
  {
    area: 'Everywhere in an editor',
    items: [
      [`${mod} S`, 'Save a version now'],
      [`${mod} Z`, 'Undo'],
      [`${mod} Shift Z`, 'Redo'],
      // G-FILES: the open-items tabs above the editor (Control+Option on a Mac, where ⌘+Option switches browser tabs).
      [mod === '⌘' ? 'Control Option → / ←' : 'Ctrl Alt → / ←', 'Next / previous open document, diagram or presentation'],
    ],
  },
  {
    area: 'Documents',
    items: [
      [`${mod} B / I / U`, 'Bold / italic / underline'],
      [`${mod} K`, 'Insert or edit a link'],
      [`${mod} F`, 'Find and replace'],
      [`${mod} P`, 'Print or save as PDF'],
      [`${mod} Enter`, 'Page break'],
      // @phase4:review
      [`${mod} ${mod === '⌘' ? 'Option' : 'Alt'} M`, 'New comment on the selected text'],
      [`${mod} Enter (in a comment box)`, 'Post the comment or reply'],
    ],
  },
  {
    area: 'Diagrams (with a shape selected)',
    items: [
      ['Alt Shift Arrow', 'Add a connected shape in that direction (or click a blue arrow)'],
      ['Tab', 'Add a child shape'],
      ['Enter', 'Add a sibling shape'],
      ['F2 or double-click', 'Edit the text'],
      ['Arrow keys', 'Nudge the selection'],
      ['Delete', 'Delete the selection'],
      [`${mod} D`, 'Duplicate'],
      [`${mod} C / ${mod} V`, 'Copy / paste'],
      [`${mod} A`, 'Select all shapes'],
    ],
  },
  {
    area: 'Presentations (in the slide list)',
    items: [
      ['↑ / ↓', 'Previous / next slide (← / → on a phone)'],
      ['Home / End', 'First / last slide'],
      ['Shift ↑ / ↓', 'Select more slides'],
      ['Alt ↑ / ↓', 'Move the selected slides up / down'],
      [`${mod} D`, 'Duplicate the selected slides'],
      ['Delete', 'Delete the selected slides'],
      ['Shift F10', 'Slide menu (move, hide, duplicate, play from this slide…)'],
      ['F5 / Shift F5', 'Slide show from the beginning / from the current slide'],
      ['Alt F5', 'Slide show with the presenter view'],
    ],
  },
  {
    // Phase 7 SHOW: the slide show and the presenter window (packages/presentation-studio/src/show/keys.ts).
    area: 'Presentations (during the slide show)',
    items: [
      ['→ ↓ Space Page Down N, or click', 'Next animation or slide'],
      ['← ↑ Page Up Backspace P', 'Previous animation or slide'],
      ['Home / End', 'First / last slide'],
      ['Number, then Enter', 'Go to that slide'],
      ['B or .', 'Black screen (press again to come back)'],
      ['W or ,', 'White screen (press again to come back)'],
      ['F', 'Full screen on or off'],
      ['Escape', 'End the slide show'],
      ['Swipe left / right, or tap', 'Next / previous on a touch screen (a tap on the left third goes back)'],
      ['Reduced motion', 'With “reduce motion” on in your system settings, transitions and animations play as cuts'],
    ],
  },
  {
    area: 'Presentations (on the slide)',
    items: [
      ['Tab / Shift Tab', 'Next / previous object'],
      ['Arrow keys', 'Move the selection (Shift: 10 pixels)'],
      ['Enter or F2', 'Edit the text of the selected text box'],
      ['Escape', 'Stop editing the text, then clear the selection'],
      [`${mod} C / X / V`, 'Copy / cut / paste objects, also to another slide or presentation'],
      [`${mod} D`, 'Duplicate'],
      [`${mod} ] / [`, 'Bring forward / send backward (with Shift: to front / to back)'],
      ['Shift while dragging', 'Move in a straight line, keep proportions, or turn in 15° steps'],
      ['Alt while dragging', 'Move or resize without snapping to the guides'],
    ],
  },
];

export function ShortcutSettings() {
  return (
    <>
      {SHORTCUTS.map((group) => (
        <Card key={group.area} className="p-5">
          <h3 className="mb-3 text-sm font-semibold">{group.area}</h3>
          <dl className="grid grid-cols-[minmax(9rem,auto)_1fr] gap-x-6 gap-y-2 text-sm">
            {group.items.map(([keys, action]) => (
              <div key={action} className="contents">
                <dt>
                  <Kbd>{keys}</Kbd>
                </dt>
                <dd className="text-muted">{action}</dd>
              </div>
            ))}
          </dl>
        </Card>
      ))}
    </>
  );
}

export function AboutSettings() {
  return (
    <Card className="p-5 text-sm">
      <h3 className="font-semibold">Digital Classroom OS</h3>
      <p className="mt-1 text-muted">Version {__APP_VERSION__}. Offline-first documents, diagrams and presentations. Everything you make is stored on this device.</p>
      <p className="mt-3 text-muted">
        Built with free and open-source software, including React, Tiptap and ProseMirror, React Flow, docx, jsPDF and PptxGenJS (all MIT-licensed) and the Inter
        typeface (SIL Open Font License). The full list of components and licences is in the project's third-party notices.
      </p>
    </Card>
  );
}
