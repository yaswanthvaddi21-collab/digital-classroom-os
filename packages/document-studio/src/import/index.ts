/** Importing Word (.docx), OpenDocument (.odt) and Classroom OS document (.dcosdoc) files as new documents. */
import { unzipSync } from 'fflate';
import { importDcosdoc, looksLikeDcosdoc } from './dcosdoc';
import { importDocx } from './docx';
import { importOdt } from './odt';
import type { ImportResult } from './common';

export { IMPORT_NOTES, ImportReport, importSummary, withStoredAttachments, type ImportedAttachment, type ImportResult } from './common';
export { importDcosdoc } from './dcosdoc';
export { importDocx } from './docx';
export { importOdt } from './odt';

/**
 * File types the import accepts (for a file input's `accept`). Phase 6: the Classroom OS document file (.dcosdoc,
 * import/dcosdoc.ts), whose pictures the app stores and re-links with withStoredAttachments.
 */
export const IMPORT_ACCEPT = '.docx,.odt,.dcosdoc,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.oasis.opendocument.text,application/vnd.dcos.document+json';

/**
 * Reads a Word or OpenDocument file into the content of a NEW document (never into an existing one). The format is
 * recognised from the file itself, so a renamed file still imports. Throws an Error with a readable message.
 */
export async function importDocumentFile(name: string, bytes: Uint8Array): Promise<ImportResult> {
  // Both formats are zip packages ("PK"): a Word file has word/document.xml, an OpenDocument file content.xml.
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (!zip && (looksLikeDcosdoc(bytes) || /\.dcosdoc$/i.test(name))) return importDcosdoc(bytes, name);
  if (!zip) {
    if (bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error('This is an older Word (.doc) file. Save it as .docx in Word first, then import it.');
    throw new Error('This file is not a Word (.docx) or OpenDocument (.odt) document.');
  }
  let names: string[];
  try {
    // Only the names are needed here: the filter keeps every entry's data out.
    const seen: string[] = [];
    unzipSync(bytes, { filter: (f) => (seen.push(f.name), false) });
    names = seen;
  } catch {
    throw new Error('This file is damaged or is not a Word (.docx) or OpenDocument (.odt) document.');
  }
  if (names.includes('word/document.xml')) return importDocx(bytes, name);
  if (names.includes('content.xml')) return importOdt(bytes, name);
  throw new Error('This file is not a Word (.docx) or OpenDocument (.odt) document.');
}
