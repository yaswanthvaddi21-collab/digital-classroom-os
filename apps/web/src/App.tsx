import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { DiagramPage } from './pages/DiagramPage';
import { DocumentPage } from './pages/DocumentPage';
import { FilesPage } from './pages/FilesPage';
import { SettingsPage } from './pages/SettingsPage';

/** Hash routing works identically on the web, inside Tauri and inside Capacitor (file:// and custom schemes). */
export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="documents" element={<FilesPage kind="document" />} />
          <Route path="diagrams" element={<FilesPage kind="diagram" />} />
          <Route path="trash" element={<FilesPage kind="document" trash />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="documents/:id" element={<DocumentPage />} />
        <Route path="diagrams/:id" element={<DiagramPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
}
