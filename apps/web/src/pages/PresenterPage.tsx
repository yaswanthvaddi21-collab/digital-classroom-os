import type { PresenterWindowProps } from '@dcos/presentation-studio';
import { useEffect, useState, type ComponentType } from 'react';
import { useParams } from 'react-router-dom';
import { presentationImageHost } from '../lib/presentationHosts';

/** The presenter window's route (Phase 7, ADR 0014): outside the app shell, with no editing session of its own. */
export const PRESENTER_ROUTE = 'presentations/presenter/:session';

/** The full address of the presenter window for a slide show session (window.open needs one in every shell). */
export function presenterUrl(session: string): string {
  const base = window.location.href.split('#')[0];
  return `${base}#/presentations/presenter/${encodeURIComponent(session)}`;
}

/**
 * The presenter window: the slide show (in the window that opened this one) sends it the presentation over a
 * BroadcastChannel. Nothing is read from or written to storage here except the pictures, so it never competes with
 * the editor for the presentation (no useEditableItem, open tabs or editor frame).
 */
export function PresenterPage() {
  const { session = '' } = useParams();
  const [Window, setWindow] = useState<ComponentType<PresenterWindowProps> | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let live = true;
    import('@dcos/presentation-studio').then(
      (m) => live && setWindow(() => m.PresenterWindow),
      (e) => live && setError(e),
    );
    return () => {
      live = false;
    };
  }, []);
  if (error) throw error;
  if (!Window) return <p className="p-6 text-sm text-muted">Opening the presenter view…</p>;
  return <Window session={session} imageHost={presentationImageHost} />;
}
