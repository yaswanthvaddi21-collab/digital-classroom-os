import { InvalidBackupError } from './errors';
import { fromBase64 } from './base64';
import { ITEM_KINDS, type Attachment, type BackupFile, type ItemKind, type ItemVersion, type VersionReason, type WorkspaceItem } from './types';

/** Newest backup layout this build reads and writes. */
export const BACKUP_FORMAT_VERSION = 2;
/** Newest content schema this build understands inside backups (documents and diagrams). */
export const MAX_CONTENT_SCHEMA = 2;

const REASONS: VersionReason[] = ['create', 'manual', 'auto', 'restore'];
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isVersion = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1;
const isKnownKind = (k: unknown): k is ItemKind => ITEM_KINDS.includes(k as ItemKind);

/** Plain words for what a broken `content` value is, so the error tells the user what is wrong. */
function describeValue(v: unknown): string {
  if (v === null) return 'nothing (null)';
  if (Array.isArray(v)) return 'a list';
  if (typeof v === 'string') return 'text';
  return `a ${typeof v}`;
}

/**
 * Documents and diagrams always store their content as an object (every v0.1.0 and current file does).
 * Anything else would open as a blank item, so the whole file is refused instead (audit STOR-R7).
 */
function checkContent(where: string, kind: ItemKind, content: unknown) {
  if (content === undefined) throw new InvalidBackupError(`${where} has no content`);
  if (!isObj(content)) throw new InvalidBackupError(`${where} is damaged: its content should be a ${kind} but is ${describeValue(content)}`);
}

export function contentSchemaOf(content: unknown): number {
  return isObj(content) && typeof content.schemaVersion === 'number' ? content.schemaVersion : 1;
}

export interface ValidatedBackup {
  file: BackupFile;
  items: WorkspaceItem[];
  versions: ItemVersion[];
  attachments: Attachment[];
  unsupported: number;
}

/**
 * Checks every record and fills defaults for optional fields instead of rejecting older or partial files.
 * Records of unknown kinds (from a newer app) are counted and left out; anything structurally broken rejects
 * the whole file so an import is all-or-nothing.
 */
export function validateBackup(raw: unknown): ValidatedBackup {
  if (!isObj(raw)) throw new InvalidBackupError('not an object');
  if (raw.format !== 'dcos-backup') throw new InvalidBackupError('unrecognised format');
  const formatVersion = raw.formatVersion === undefined ? 1 : raw.formatVersion;
  if (!Number.isInteger(formatVersion) || (formatVersion as number) < 1) throw new InvalidBackupError(`invalid format version ${String(formatVersion)}`);
  if ((formatVersion as number) > BACKUP_FORMAT_VERSION) throw new InvalidBackupError('this backup was made by a newer version of the app — update to import it');
  if (!Number.isInteger(raw.schemaVersion) || (raw.schemaVersion as number) < 1) throw new InvalidBackupError(`invalid schema version ${String(raw.schemaVersion)}`);
  if ((raw.schemaVersion as number) > MAX_CONTENT_SCHEMA) throw new InvalidBackupError('this backup contains content from a newer version of the app — update to import it');
  if (!Array.isArray(raw.items) || !Array.isArray(raw.versions)) throw new InvalidBackupError('missing items or versions');
  const exportedAt = isIso(raw.exportedAt) ? raw.exportedAt : new Date(0).toISOString();
  const deviceId = typeof raw.deviceId === 'string' ? raw.deviceId : 'unknown-device';

  let unsupported = 0;
  const items: WorkspaceItem[] = [];
  raw.items.forEach((i, n) => {
    const where = `item ${n + 1}`;
    if (!isObj(i)) throw new InvalidBackupError(`${where} is not an object`);
    if (!isKnownKind(i.kind)) {
      if (typeof i.kind === 'string') return void unsupported++;
      throw new InvalidBackupError(`${where} has no kind`);
    }
    if (typeof i.id !== 'string' || !i.id) throw new InvalidBackupError(`${where} has no id`);
    if (!isVersion(i.version)) throw new InvalidBackupError(`${where} (${i.id}) has an invalid version`);
    checkContent(`${where} (${typeof i.title === 'string' && i.title ? `“${i.title}”, ` : ''}${i.id})`, i.kind, i.content);
    if (contentSchemaOf(i.content) > MAX_CONTENT_SCHEMA) throw new InvalidBackupError(`${where} (${i.id}) has content from a newer version of the app`);
    const createdAt = isIso(i.createdAt) ? i.createdAt : isIso(i.updatedAt) ? i.updatedAt : exportedAt;
    const item: WorkspaceItem = {
      ...(i as unknown as WorkspaceItem),
      title: typeof i.title === 'string' ? i.title : 'Untitled',
      createdAt,
      updatedAt: isIso(i.updatedAt) ? i.updatedAt : createdAt,
      deletedAt: i.deletedAt === null || i.deletedAt === undefined ? null : isIso(i.deletedAt) ? i.deletedAt : exportedAt,
      ownerDeviceId: typeof i.ownerDeviceId === 'string' ? i.ownerDeviceId : deviceId,
      favorite: i.favorite === true,
      templateId: typeof i.templateId === 'string' ? i.templateId : null,
      lastSnapshotAt: isIso(i.lastSnapshotAt) ? i.lastSnapshotAt : null,
    };
    items.push(item);
  });

  const versions: ItemVersion[] = [];
  raw.versions.forEach((v, n) => {
    const where = `version ${n + 1}`;
    if (!isObj(v)) throw new InvalidBackupError(`${where} is not an object`);
    if (!isKnownKind(v.kind)) {
      if (typeof v.kind === 'string') return void unsupported++;
      throw new InvalidBackupError(`${where} has no kind`);
    }
    if (typeof v.id !== 'string' || !v.id || typeof v.itemId !== 'string' || !v.itemId) throw new InvalidBackupError(`${where} has no id or item id`);
    checkContent(`${where} (${v.id}, of item ${v.itemId})`, v.kind, v.content);
    versions.push({
      ...(v as unknown as ItemVersion),
      version: isVersion(v.version) ? v.version : 1,
      title: typeof v.title === 'string' ? v.title : 'Untitled',
      createdAt: isIso(v.createdAt) ? v.createdAt : exportedAt,
      reason: REASONS.includes(v.reason as VersionReason) ? (v.reason as VersionReason) : 'manual',
    });
  });

  const attachments: Attachment[] = [];
  if (raw.attachments !== undefined) {
    if (!Array.isArray(raw.attachments)) throw new InvalidBackupError('attachments is not a list');
    raw.attachments.forEach((a, n) => {
      const where = `attachment ${n + 1}`;
      if (!isObj(a) || typeof a.id !== 'string' || !a.id || typeof a.base64 !== 'string') throw new InvalidBackupError(`${where} is incomplete`);
      let data: ArrayBuffer;
      try {
        data = fromBase64(a.base64);
      } catch {
        throw new InvalidBackupError(`${where} (${a.id}) is damaged`);
      }
      attachments.push({
        id: a.id,
        sha256: typeof a.sha256 === 'string' ? a.sha256 : '',
        mimeType: typeof a.mimeType === 'string' ? a.mimeType : 'application/octet-stream',
        sizeBytes: data.byteLength,
        data,
        createdAt: isIso(a.createdAt) ? a.createdAt : exportedAt,
      });
    });
  }

  return { file: raw as unknown as BackupFile, items, versions, attachments, unsupported };
}
