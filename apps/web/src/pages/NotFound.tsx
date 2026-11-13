import { Link, useLocation } from 'react-router-dom';

/** Unknown addresses show what was asked for instead of silently jumping to the Dashboard (audit ARCH-3). */
export function NotFound() {
  const { pathname } = useLocation();
  return (
    <div className="flex flex-col items-center gap-3 py-16 text-center">
      <h2 className="text-lg font-semibold">This page doesn't exist</h2>
      <p className="max-w-sm text-sm text-muted">
        Nothing is at <span className="font-mono">#{pathname}</span>. It may need a newer version of Classroom OS.
      </p>
      <Link to="/" className="text-sm font-medium text-accent hover:underline">
        Go to the Dashboard
      </Link>
    </div>
  );
}
