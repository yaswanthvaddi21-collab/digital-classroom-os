import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { documentExtensions } from './extensions';

let schema: Schema | null = null;
/** The ProseMirror schema of every document this build can edit (shared, built once). */
export function documentSchema(): Schema {
  schema ??= getSchema(documentExtensions());
  return schema;
}
