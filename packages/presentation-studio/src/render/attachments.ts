import { useEffect, useState } from 'react';
import type { PresentationImageHost } from '../hosts';

export type AttachmentUrl = { state: 'loading' } | { state: 'ready'; url: string } | { state: 'missing' };

/**
 * An object URL for a stored attachment (a picture, a picture background, a diagram preview), revoked when the
 * component goes away or the id changes. 'missing' when there is no host, no id, or the attachment is not on this
 * device.
 */
export function useAttachmentUrl(host: PresentationImageHost | undefined, id: string | undefined): AttachmentUrl {
  const [state, setState] = useState<AttachmentUrl>(() => (host && id ? { state: 'loading' } : { state: 'missing' }));
  useEffect(() => {
    if (!host || !id) {
      setState({ state: 'missing' });
      return;
    }
    let cancelled = false;
    let url: string | null = null;
    setState({ state: 'loading' });
    host.loadAttachment(id).then(
      (blob) => {
        if (cancelled) return;
        if (!blob) return setState({ state: 'missing' });
        url = URL.createObjectURL(blob);
        setState({ state: 'ready', url });
      },
      () => !cancelled && setState({ state: 'missing' }),
    );
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [host, id]);
  return state;
}
