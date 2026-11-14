/**
 * Reading a Classroom OS document file (.dcosdoc, written by export/dcosdoc.ts) as a NEW document. Strict: a file that
 * is not one, is damaged, comes from a newer version (file or content), or holds content this version cannot keep
 * exactly is refused with a readable message, never imported in part. Pictures that cannot be read are left out
 * (the diagram keeps its data) and reported.
 */
import { referencedAttachments, DCOSDOC_FORMAT, DCOSDOC_MAX_BYTES, DCOSDOC_PICTURE_TYPES, DCOSDOC_VERSION } from '../export/dcosdoc';
import { isPng } from '../export/diagramPng';
import { contentSchemaFor, DOCUMENT_SCHEMA } from '../migrate';
import { prepareDocument } from '../safety';
import type { DocumentContent } from '../types';
import { ImportReport, type ImportedAttachment, type ImportResult } from './common';

const NEWER = 'Update Classroom OS to open it.';
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Whether the bytes look like a .dcosdoc file (JSON naming the format near its start), for recognising the format. */
export function looksLikeDcosdoc(bytes: Uint8Array): boolean {
  const head = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 256))).replace(/^﻿/, '').trimStart();
  return head.startsWith('{') && head.includes(`"${DCOSDOC_FORMAT}"`);
}

function fromBase64(text: string): Uint8Array | null {
  try {
    const bin = atob(text);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** Reads a .dcosdoc file. Throws an Error with a readable message when it cannot be imported exactly. */
export function importDcosdoc(bytes: Uint8Array, fileName = 'Imported document'): ImportResult {
  if (bytes.length > DCOSDOC_MAX_BYTES) throw new Error('The file is too large to import (the limit is 100 MB).');
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, ''));
  } catch {
    throw new Error('This is not a Classroom OS document file: it is not valid JSON.');
  }
  if (!isObj(raw) || raw.format !== DCOSDOC_FORMAT) throw new Error('This is not a Classroom OS document file.');
  if (!Number.isInteger(raw.version) || (raw.version as number) < 1) throw new Error('The file has no valid format version.');
  if ((raw.version as number) > DCOSDOC_VERSION) throw new Error(`The file uses a newer file format (version ${String(raw.version)}). ${NEWER}`);
  if (raw.title !== undefined && typeof raw.title !== 'string') throw new Error('The file’s title is damaged.');
  if (!isObj(raw.content)) throw new Error('The file holds no document.');
  const declared = raw.content.schemaVersion;
  if (!Number.isInteger(declared) || (declared as number) < 1) throw new Error('The document in the file has no valid content version.');
  if ((declared as number) > DOCUMENT_SCHEMA) throw new Error(`The document was saved by a newer version of Classroom OS (content version ${String(declared)}). ${NEWER}`);
  // The same checks as opening a stored document: anything this version cannot keep exactly refuses the file.
  const prepared = prepareDocument(raw.content);
  if (prepared.state !== 'editable') throw new Error(`The document in the file cannot be imported: ${prepared.detail}`);
  if (raw.attachments !== undefined && !isObj(raw.attachments)) throw new Error('The file’s pictures are damaged.');

  const report = new ImportReport();
  const { schemaVersion: _migrated, ...rest } = prepared.content;
  const content = { ...rest, schemaVersion: contentSchemaFor(rest as unknown as Pick<DocumentContent, 'doc'> & Record<string, unknown>) } as DocumentContent;
  const files = (raw.attachments ?? {}) as Record<string, unknown>;
  const attachments: ImportedAttachment[] = [];
  let unreadable = 0;
  const referenced = referencedAttachments(content.doc);
  for (const id of referenced) {
    const entry = Object.hasOwn(files, id) ? files[id] : undefined;
    const type = isObj(entry) ? entry.type : undefined;
    const data = isObj(entry) && typeof entry.data === 'string' ? fromBase64(entry.data) : null;
    const ok =
      !!data &&
      (DCOSDOC_PICTURE_TYPES as readonly unknown[]).includes(type) &&
      (type === 'image/png' ? isPng(data) : /<svg[\s>]/i.test(new TextDecoder().decode(data.subarray(0, 4096))));
    if (ok) attachments.push({ id, data: data!, mimeType: type as ImportedAttachment['mimeType'] });
    else unreadable++;
  }
  if (unreadable) {
    report.add(
      'dcosdoc-picture',
      "1 diagram picture was missing from the file or could not be read; the diagram keeps its data and its preview can be drawn again",
      "{n} diagram pictures were missing from the file or could not be read; the diagrams keep their data and their previews can be drawn again",
      unreadable,
    );
  }
  const title = (typeof raw.title === 'string' && raw.title.trim()) || fileName.replace(/\.dcosdoc$/i, '') || 'Imported document';
  // Present (possibly empty) whenever the content refers to pictures, so the app always swaps the file's ids for its
  // own: an id whose picture could not be read becomes null, never a stored picture that happens to share the id.
  return { content, title, report, format: 'dcosdoc', ...(referenced.length ? { attachments } : {}) };
}
