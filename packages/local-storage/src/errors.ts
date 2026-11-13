import type { WorkspaceItem } from './types';

/** Raised when a save is based on a stale version. Carries the stored item so the UI can offer a resolution. */
export class ConflictError extends Error {
  readonly current: WorkspaceItem;
  readonly expectedVersion: number;

  constructor(current: WorkspaceItem, expectedVersion: number) {
    super(`Version conflict on ${current.kind} ${current.id}: expected v${expectedVersion}, stored v${current.version}`);
    this.name = 'ConflictError';
    this.current = current;
    this.expectedVersion = expectedVersion;
  }
}

export class NotFoundError extends Error {
  constructor(kind: string, id: string) {
    super(`${kind} ${id} not found`);
    this.name = 'NotFoundError';
  }
}

const detail = (cause: unknown) => (cause instanceof Error && cause.message ? ` (${cause.message})` : '');

/**
 * A schema upgrade did not happen. `step` says where it stopped: making the copy of the old database that must
 * exist first ('copy'), or the upgrade itself ('upgrade', which IndexedDB rolls back as a whole). Either way the
 * old database is unchanged and can still be exported (IndexedDbAdapter.exportWithoutUpgrade).
 */
export class UpgradeError extends Error {
  /** Database version that was about to be upgraded. */
  readonly fromVersion: number;
  readonly step: 'copy' | 'upgrade';
  /** 'quota': the device is out of free space. 'error': anything else. */
  readonly reason: 'quota' | 'error';

  constructor(step: 'copy' | 'upgrade', fromVersion: number, cause: unknown) {
    const quota = isQuotaError(cause);
    const message =
      step === 'copy'
        ? quota
          ? "The update needs a safety copy of your data first, and there isn't enough free space on this device for it. Nothing was changed."
          : `The update needs a safety copy of your data first, and it could not be made${detail(cause)}. Nothing was changed.`
        : quota
          ? "The update could not finish because there isn't enough free space on this device. Nothing was changed."
          : `The update could not finish${detail(cause)}. Nothing was changed.`;
    super(message, { cause });
    this.name = step === 'copy' ? 'SafetyCopyError' : 'UpgradeError';
    this.fromVersion = fromVersion;
    this.step = step;
    this.reason = quota ? 'quota' : 'error';
  }
}

/** The copy of the old database that must exist before a schema upgrade could not be made (audit STOR-R5). */
export class SafetyCopyError extends UpgradeError {
  constructor(fromVersion: number, cause: unknown) {
    super('copy', fromVersion, cause);
  }
}

/** Storage full, as reported by IndexedDB (directly, or as the error of an aborted transaction). */
export function isQuotaError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { name?: unknown; message?: unknown; target?: { error?: unknown } };
  if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') return true;
  if (typeof e.message === 'string' && /quota/i.test(e.message)) return true;
  return e.target?.error !== undefined && e.target.error !== err ? isQuotaError(e.target.error) : false;
}

export class InvalidBackupError extends Error {
  constructor(reason: string) {
    super(`Invalid backup file: ${reason}`);
    this.name = 'InvalidBackupError';
  }
}
