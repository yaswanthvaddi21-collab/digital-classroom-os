import type { StorageInfo } from '@dcos/local-storage';
import { Badge, Button, Card, downloadBlob, Kbd, Select, useToast } from '@dcos/ui';
import { Download, HardDrive, ShieldCheck, ShieldAlert, Trash2, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ThemeSwitcher } from '../../components/AppShell';
import { formatBytes, relativeTime } from '../../lib/format';
import { setPreference, usePreferences } from '../../lib/preferences';
import { notifyStorageChanged, recordBackup, requestPersistentStorage, storage, useDataSafety } from '../../lib/storage';
import { Section } from './SettingsLayout';

const stamp = () => new Date().toISOString().slice(0, 10);

export function GeneralSettings() {
  const prefs = usePreferences();
  return (
    <>
      <Section title="New blank documents" description="The editing mode a blank document starts in. Templates keep their own mode. You can switch at any time in the editor.">
        <Select value={prefs.newDocumentMode} onChange={(e) => setPreference('newDocumentMode', e.target.value as 'simple' | 'advanced')} aria-label="Mode for new blank documents" className="h-9">
          <option value="simple">Simple</option>
          <option value="advanced">Advanced</option>
        </Select>
      </Section>
      <Section title="Backup reminder" description="How long after your last backup the Dashboard reminds you to make a new one.">
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
    <Section title="Theme" description="Choose light, dark, or follow your device setting. Documents and diagrams always print on white paper.">
      <ThemeSwitcher />
    </Section>
  );
}

export function StorageSettings() {
  const toast = useToast();
  const safety = useDataSafety();
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  const refresh = async () => {
    setInfo(await storage.info());
    const est = await navigator.storage?.estimate?.();
    if (est) setUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
    await safety.refresh();
  };
  useEffect(() => {
    void refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
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
                    const backup = await storage.exportSafetyCopy(name);
                    downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `classroom-os-${name}-${stamp()}.json`);
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
                    await storage.deleteSafetyCopy(name);
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
      await recordBackup();
      toast(`Backup exported: ${backup.items.length} items, ${backup.versions.length} versions`, 'success');
    } catch (err) {
      toast(`Backup failed — nothing was exported. ${err instanceof Error ? err.message : String(err)}`, 'error');
    }
  };

  const importBackup = async (file: File) => {
    try {
      const report = await storage.importBackup(JSON.parse(await file.text()));
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
            Saves every document, diagram and version on this device into one file. Keep it somewhere else, like a USB drive or cloud folder.
            <div className="mt-2 text-xs">{safety.lastBackupAt ? `Last backup: ${relativeTime(safety.lastBackupAt)}` : 'No backup has been made on this device yet.'}</div>
          </>
        }
      >
        <Button variant="primary" icon={<Download size={15} />} onClick={exportBackup}>
          Export backup
        </Button>
      </Section>
      <Section title="Restore from a backup" description="Restoring never overwrites newer work on this device: items that differ come back as separate copies, and importing the same file twice adds nothing.">
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
  { area: 'Everywhere in an editor', items: [[`${mod} S`, 'Save a version now'], [`${mod} Z`, 'Undo'], [`${mod} Shift Z`, 'Redo']] },
  {
    area: 'Documents',
    items: [
      [`${mod} B / I / U`, 'Bold / italic / underline'],
      [`${mod} K`, 'Insert or edit a link'],
      [`${mod} F`, 'Find and replace'],
      [`${mod} P`, 'Print or save as PDF'],
      [`${mod} Enter`, 'Page break'],
    ],
  },
  {
    area: 'Diagrams (with a shape selected)',
    items: [
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
      <p className="mt-1 text-muted">Version {__APP_VERSION__}. Offline-first documents and diagrams. Everything you make is stored on this device.</p>
      <p className="mt-3 text-muted">
        Built with free and open-source software, including React, Tiptap and ProseMirror, React Flow, docx and jsPDF (all MIT-licensed) and the Inter
        typeface (SIL Open Font License). The full list of components and licences is in the project's third-party notices.
      </p>
    </Card>
  );
}
