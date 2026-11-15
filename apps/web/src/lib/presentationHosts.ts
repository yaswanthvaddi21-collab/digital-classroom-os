import type { PresentationImageHost } from '@dcos/presentation-studio';
import { storage } from './storage';

/**
 * Pictures on slides (and diagram previews) for Presentation Studio, kept in the attachments store (ADR 0014). The
 * presentation keeps only the attachment id, as its own string value, so attachment clean-up always counts it.
 */
export const presentationImageHost: PresentationImageHost = {
  putAttachment: async (data, mimeType) => {
    const { id, mimeType: type, sizeBytes } = await storage.putAttachment(data, mimeType);
    return { id, mimeType: type, sizeBytes };
  },
  loadAttachment: async (id) => {
    const a = await storage.getAttachment(id);
    return a ? new Blob([a.data], { type: a.mimeType }) : undefined;
  },
};
