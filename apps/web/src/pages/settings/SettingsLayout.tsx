import { Card, cn } from '@dcos/ui';
import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { SETTINGS_NAV } from '../../navigation';

export function SettingsLayout() {
  return (
    <div className="flex flex-col gap-6 md:flex-row">
      <nav aria-label="Settings" className="flex shrink-0 gap-1 overflow-x-auto md:w-52 md:flex-col">
        {SETTINGS_NAV.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                'flex shrink-0 items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium',
                isActive ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            <Icon size={16} />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-4">
        <Outlet />
      </div>
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <Card className="flex flex-col gap-4 p-5 md:flex-row md:items-start md:justify-between">
      <div className="max-w-md">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </Card>
  );
}
