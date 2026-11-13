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

export class InvalidBackupError extends Error {
  constructor(reason: string) {
    super(`Invalid backup file: ${reason}`);
    this.name = 'InvalidBackupError';
  }
}
