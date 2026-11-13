import { Badge, cn, IconButton, useTheme, type ThemePreference } from '@dcos/ui';
import {
  BookOpen,
  ClipboardList,
  FileText,
  GitFork,
  LayoutDashboard,
  Menu as MenuIcon,
  Monitor,
  Moon,
  Presentation,
  Settings,
  Sun,
  Trash2,
  Users,
  WifiOff,
  FileType2,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useOnline } from '../lib/storage';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
}

const workspace: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={17} /> },
  { to: '/documents', label: 'Documents', icon: <FileText size={17} /> },
  { to: '/diagrams', label: 'Diagrams', icon: <GitFork size={17} /> },
  { to: '/trash', label: 'Trash', icon: <Trash2 size={17} /> },
];

/** Modules from later phases. Listed so the shape of the product is visible, but not yet built. */
const upcoming: Array<{ label: string; icon: ReactNode; phase: number }> = [
  { label: 'Notebook', icon: <BookOpen size={17} />, phase: 2 },
  { label: 'Assignments', icon: <ClipboardList size={17} />, phase: 2 },
  { label: 'Classroom', icon: <Users size={17} />, phase: 3 },
  { label: 'Presentations', icon: <Presentation size={17} />, phase: 4 },
  { label: 'PDF Studio', icon: <FileType2 size={17} />, phase: 4 },
];

function SideNav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex h-full flex-col gap-6 px-3 py-4">
      <div className="flex items-center gap-2.5 px-2">
        <img src="./icon.svg" alt="" className="h-7 w-7" />
        <div className="leading-tight">
          <div className="text-[13px] font-semibold">Classroom OS</div>
          <div className="text-[11px] text-muted">Local workspace</div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        {workspace.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors',
                isActive ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted hover:bg-surface-2 hover:text-fg',
              )
            }
          >
            {item.icon}
            {item.label}
          </NavLink>
        ))}
      </div>

      <div className="flex flex-col gap-0.5">
        <div className="px-2.5 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">Coming next</div>
        {upcoming.map((item) => (
          <div key={item.label} aria-disabled className="flex cursor-default items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] text-muted/70">
            {item.icon}
            <span className="flex-1">{item.label}</span>
            <span className="text-[10px] font-medium">P{item.phase}</span>
          </div>
        ))}
      </div>

      <div className="mt-auto flex flex-col gap-0.5">
        <NavLink
          to="/settings"
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium',
              isActive ? 'bg-surface text-fg shadow-xs ring-1 ring-border' : 'text-muted hover:bg-surface-2 hover:text-fg',
            )
          }
        >
          <Settings size={17} />
          Settings & backup
        </NavLink>
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
      <WifiOff size={12} /> Offline — everything still saves on this device
    </Badge>
  );
}

export function AppShell() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { pathname } = useLocation();
  const title = pathname === '/' ? 'Dashboard' : pathname.slice(1).replace(/^\w/, (c) => c.toUpperCase());

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
          <h1 className="text-[15px] font-semibold">{title}</h1>
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

