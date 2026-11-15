/**
 * What the app supplies to Presentation Studio. The package imports only @dcos/ui (tests/integration/boundaries.test.ts):
 * storage, Diagram Studio and the app's dialogs come in through these hosts, built in apps/web, the same way Document
 * Studio receives its DiagramHost (ADR 0013, ADR 0014).
 *
 * Toasts need no host: the editor uses @dcos/ui's useToast, which the app provides. The slide show (SHOW) is a modal
 * dialog, so the ToastProvider already draws toasts inside it, full screen too (the page, not the dialog, is made full
 * screen); the show's own messages are drawn inside it as well.
 */

/** What the app hands back after a diagram has been created or edited (document-studio EmbeddedDiagram). */
export interface PresentationEmbeddedDiagram {
  source: unknown;
  previewId: string;
  naturalWidth: number;
  naturalHeight: number;
  title: string;
  svgPreviewId?: string | null;
}

export interface PresentationRenderedDiagramPreview {
  png: Blob;
  svg?: string;
  width: number;
  height: number;
}

export interface PresentationDiagramStart {
  templateId?: string;
  source?: unknown;
  title?: string;
  notes?: string[];
}

/**
 * Structurally the same interface as document-studio's DiagramHost, so the app passes the host it already builds
 * (useDiagramHost). tests/integration/presentation-hosts.test.ts checks both ways that the two stay assignable.
 * @phase7:CONTENT — diagrams on slides: insert from a template, the library or a file; double-click to edit.
 */
export interface PresentationDiagramHost {
  templates: Array<{ id: string; name: string }>;
  edit(current: PresentationEmbeddedDiagram | null, start?: PresentationDiagramStart): Promise<PresentationEmbeddedDiagram | null>;
  pickFromLibrary(): Promise<PresentationDiagramStart | null>;
  importFile(): Promise<PresentationDiagramStart | null>;
  loadPreview(previewId: string): Promise<Blob | undefined>;
  toDrawio(source: unknown, title: string): Promise<string>;
  renderPreview?(source: unknown, title?: string): Promise<PresentationRenderedDiagramPreview | null>;
  storePreview?(image: Blob): Promise<string>;
  settle?(diagram: PresentationEmbeddedDiagram, applied: boolean): void;
  diagramFromShapes?(get: (type: string) => string): Promise<PresentationEmbeddedDiagram | null>;
}

/** A stored picture, as the app's attachment store describes it (without the bytes). */
export interface StoredPicture {
  id: string;
  mimeType: string;
  sizeBytes: number;
}

/**
 * Pictures on slides (images, picture backgrounds, diagram previews) are stored as attachments by the app. Content
 * keeps only the attachment id, as its own string value, so attachment clean-up always sees it.
 */
export interface PresentationImageHost {
  /** Stores the bytes (deduplicated by content) and resolves with the attachment. */
  putAttachment(data: Blob, mimeType: string): Promise<StoredPicture>;
  /** The stored bytes, or undefined when the attachment is not on this device. */
  loadAttachment(id: string): Promise<Blob | undefined>;
}
