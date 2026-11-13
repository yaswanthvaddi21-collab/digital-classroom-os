import { Badge, cn, IconButton, useTheme, type ThemePreference } from '@dcos/ui';
import { Menu as MenuIcon, Monitor, Moon, Settings, Sun, WifiOff } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOnline } from '../lib/storage';
import { NAV, titleFor, type NavEntry } from '../navigation';

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
    isActive ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted hover:bg-surface-2 hover:text-fg',
  );

function NavItem({ entry, onNavigate }: { entry: NavEntry; onNavigate?: () => void }) {
  const Icon = entry.icon;
  return (
    <NavLink to={entry.to} end={entry.to === '/'} onClick={onNavigate} className={linkClass}>
      <Icon size={17} />
      {entry.label}
    </NavLink>
  );
}

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-6 overflow-y-auto px-3 py-4">
      <div className="flex items-center gap-2.5 px-2">
        <img src="./icon.svg" alt="" className="h-7 w-7" />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">Classroom OS</div>
          <div className="text-[11px] text-muted">Local workspace</div>
        </div>
      </div>

      {NAV.map((section) => (
        <div key={section.title} className="flex flex-col gap-0.5">
          <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{section.title}</div>
          {section.items.map((entry) => (
            <NavItem key={entry.to} entry={entry} onNavigate={onNavigate} />
          ))}
        </div>
      ))}

      <div className="mt-auto flex flex-col gap-0.5">
        <NavItem entry={{ to: '/settings', label: 'Settings', icon: Settings }} onNavigate={onNavigate} />
      </div>
    </nav>
  );
}

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme();
  const options: Array<{ value: ThemePreference; label: string; icon: ReactNode }> = [
    { value: 'light', label: 'Light theme', icon: <Sun size={15} /> },
    { value: 'dark', label: 'Dark theme', icon: <Moon size={15} /> },
    { value: 'system', label: 'Match system', icon: <Monitor size={15} /> },
  ];
  return (
    <div role="radiogroup" aria-label="Theme" className="flex rounded-lg border border-border bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={preference === o.value}
          title={o.label}
          aria-label={o.label}
          onClick={() => setPreference(o.value)}
          className={cn('flex h-7 w-8 items-center justify-center rounded-md text-muted', preference === o.value && 'bg-surface-2 text-fg')}
        >
          {o.icon}
        </button>
      ))}
    </div>
  );
}

export function OfflineBadge() {
  const online = useOnline();
  if (online) return null;
  return (
    <Badge tone="warning">
      <WifiOff size={12} /> <span className="hidden sm:inline">Offline — everything still saves on this device</span>
      <span className="sm:hidden">Offline</span>
    </Badge>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();

  return (
    <div className="flex h-full">
      <aside className="hidden w-60 shrink-0 border-r border-border bg-bg md:block">
        <SideNav />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <aside className="absolute inset-y-0 left-0 w-64 border-r border-border bg-bg shadow-xl" onClick={(e) => e.stopPropagation()}>
            <SideNav onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur md:px-8">
          <IconButton label="Open navigation" className="md:hidden" onClick={() => setMobileOpen(true)}>
            <MenuIcon size={18} />
          </IconButton>
          <h1 className="truncate text-[15px] font-semibold">{titleFor(pathname)}</h1>
          <div className="ml-auto flex items-center gap-3">
            <OfflineBadge />
            <ThemeSwitcher />
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
