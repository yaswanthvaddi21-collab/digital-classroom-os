import type { StorageInfo } from '@dcos/local-storage';
import { Badge, Button, Card, downloadBlob, useToast } from '@dcos/ui';
import { Download, HardDrive, ShieldCheck, Upload } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ThemeSwitcher } from '../components/AppShell';
import { formatBytes } from '../lib/format';
import { notifyStorageChanged, requestPersistentStorage, storage } from '../lib/storage';

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
      <div className="max-w-md">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="mt-1 text-sm text-muted">{description}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </Card>
  );
}

export function SettingsPage() {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [info, setInfo] = useState<StorageInfo | null>(null);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<{ usage: number; quota: number } | null>(null);

  const refresh = async () => {
    setInfo(await storage.info());
    setPersisted((await navigator.storage?.persisted?.()) ?? null);
    const est = await navigator.storage?.estimate?.();
    if (est) setUsage({ usage: est.usage ?? 0, quota: est.quota ?? 0 });
  };
  useEffect(() => {
    void refresh();
  }, []);

  const exportBackup = async () => {
    const backup = await storage.exportBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([JSON.stringify(backup)], { type: 'application/json' }), `classroom-os-backup-${stamp}.json`);
    toast(`Backup exported: ${backup.items.length} items, ${backup.versions.length} versions`, 'success');
  };

  const importBackup = async (file: File) => {
    try {
      const report = await storage.importBackup(JSON.parse(await file.text()));
      notifyStorageChanged();
      const parts = [`${report.added} added`, `${report.skipped} already present`];
      if (report.copied) parts.push(`${report.copied} restored as copies (local versions kept)`);
      toast(`Backup restored: ${parts.join(', ')}`, 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Could not read backup file', 'error');
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Section title="Appearance" description="Choose light, dark, or follow your device setting.">
        <ThemeSwitcher />
      </Section>

      <Section
        title="Backup and restore"
        description="Export everything on this device to one file. Restoring never overwrites newer local work: changed items come back as separate copies."
      >
        <Button icon={<Download size={15} />} onClick={exportBackup}>
          Export backup
        </Button>
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

      <Section
        title="Device storage"
        description="Your work lives in this browser's local database. Persistent storage asks the browser not to clear it when space runs low."
      >
        <div className="flex flex-col items-start gap-2 md:items-end">
          {persisted ? (
            <Badge tone="success">
              <ShieldCheck size={12} /> Persistent storage on
            </Badge>
          ) : (
            <Button
              size="sm"
              icon={<HardDrive size={14} />}
              onClick={async () => {
                const ok = await requestPersistentStorage();
                toast(ok ? 'Persistent storage enabled' : 'The browser declined; data is still saved but may be evicted under pressure', ok ? 'success' : 'info');
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

      {info && (
        <Card className="p-5 text-xs text-muted">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5">
            <dt>Storage engine</dt>
            <dd className="text-fg">{info.backend}</dd>
            <dt>Schema version</dt>
            <dd className="text-fg">{info.schemaVersion}</dd>
            <dt>Device ID</dt>
            <dd className="font-mono text-fg">{info.deviceId}</dd>
            <dt>App version</dt>
            <dd className="text-fg">0.1.0 · Phase 1 foundation</dd>
          </dl>
        </Card>
      )}
    </div>
  );
}
