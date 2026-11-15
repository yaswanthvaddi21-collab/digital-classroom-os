import {
  Clock,
  Database,
  FolderOpen,
  HardDriveDownload,
  Info,
  Keyboard,
  LayoutDashboard,
  Palette,
  SlidersHorizontal,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { matchPath } from 'react-router-dom';
import { MODULE_LIST } from './modules';

export interface NavEntry {
  to: string;
  label: string;
  icon: LucideIcon;
}

export interface NavSection {
  title: string;
  items: NavEntry[];
}

/**
 * The sidebar. Only working destinations appear here; a module gets its entry the day it works (every module in
 * MODULE_LIST has one). Modules that do not exist yet have no entry.
 */
export const NAV: NavSection[] = [
  {
    title: 'Workspace',
    items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard }, ...MODULE_LIST.map((m) => ({ to: `/${m.route}`, label: m.plural, icon: m.icon }))],
  },
  {
    title: 'Management',
    items: [
      { to: '/files', label: 'File Manager', icon: FolderOpen },
      { to: '/recent', label: 'Recent Files', icon: Clock },
      { to: '/favorites', label: 'Favorites', icon: Star },
      { to: '/trash', label: 'Trash', icon: Trash2 },
    ],
  },
];

export const SETTINGS_NAV: NavEntry[] = [
  { to: '/settings/general', label: 'General', icon: SlidersHorizontal },
  { to: '/settings/appearance', label: 'Appearance', icon: Palette },
  { to: '/settings/storage', label: 'Storage', icon: Database },
  { to: '/settings/backup', label: 'Backup and Restore', icon: HardDriveDownload },
  { to: '/settings/shortcuts', label: 'Keyboard Shortcuts', icon: Keyboard },
  { to: '/settings/about', label: 'About', icon: Info },
];

/** Page title for the shell header, from the same tables that drive the sidebar. */
export function titleFor(pathname: string): string {
  if (pathname === '/settings') return 'Settings';
  for (const entry of [...SETTINGS_NAV, ...NAV.flatMap((s) => s.items)]) {
    if (matchPath({ path: entry.to, end: true }, pathname)) return entry.to.startsWith('/settings/') ? `Settings · ${entry.label}` : entry.label;
  }
  return 'Classroom OS';
}
