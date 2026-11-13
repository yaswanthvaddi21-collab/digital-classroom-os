import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ErrorBoundary } from './components/ErrorBoundary';
import { SystemBanners } from './components/SystemBanners';
import { MODULE_LIST } from './modules';
import { Dashboard } from './pages/Dashboard';
import { EditorPage } from './pages/EditorPage';
import { ItemListPage } from './pages/ItemListPage';
import { NotFound } from './pages/NotFound';
import { SettingsLayout } from './pages/settings/SettingsLayout';
import { AboutSettings, AppearanceSettings, BackupSettings, GeneralSettings, ShortcutSettings, StorageSettings } from './pages/settings/SettingsPages';

/**
 * Hash routing works identically on the web, inside Tauri and inside Capacitor (file:// and custom schemes).
 * Routes that existed in v0.1.0 (#/, #/documents, #/diagrams, #/trash, #/settings and the editor routes)
 * must keep working; e2e/navigation.spec.ts checks them.
 */
export function App() {
  return (
    <HashRouter>
      <div className="flex h-full flex-col">
        <SystemBanners />
        <div className="min-h-0 flex-1">
          <ErrorBoundary what="this page">
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              {MODULE_LIST.map((m) => (
                <Route key={m.kind} path={m.route} element={<ItemListPage view={{ type: 'kind', kind: m.kind }} />} />
              ))}
              <Route path="files" element={<ItemListPage view={{ type: 'files' }} />} />
              <Route path="recent" element={<ItemListPage view={{ type: 'recent' }} />} />
              <Route path="favorites" element={<ItemListPage view={{ type: 'favorites' }} />} />
              <Route path="trash" element={<ItemListPage view={{ type: 'trash' }} />} />
              <Route path="settings" element={<SettingsLayout />}>
                <Route index element={<Navigate to="general" replace />} />
                <Route path="general" element={<GeneralSettings />} />
                <Route path="appearance" element={<AppearanceSettings />} />
                <Route path="storage" element={<StorageSettings />} />
                <Route path="backup" element={<BackupSettings />} />
                <Route path="shortcuts" element={<ShortcutSettings />} />
                <Route path="about" element={<AboutSettings />} />
              </Route>
              <Route path="*" element={<NotFound />} />
            </Route>
            {MODULE_LIST.map((m) => (
              <Route key={m.kind} path={`${m.route}/:id`} element={<EditorPage module={m} />} />
            ))}
          </Routes>
          </ErrorBoundary>
        </div>
      </div>
    </HashRouter>
  );
}
