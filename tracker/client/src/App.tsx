import '@mantine/core/styles.css';
import { MantineProvider } from '@mantine/core';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { NavHeader } from './components/NavHeader.js';
import { TicketListPage } from './pages/TicketListPage.js';
import { TicketDetailPage } from './pages/TicketDetailPage.js';
import { SubmitTicketPage } from './pages/SubmitTicketPage.js';
import { NotificationsPage } from './pages/NotificationsPage.js';
import { AdminUsersPage } from './pages/AdminUsersPage.js';
import { AdminTemplatesPage } from './pages/AdminTemplatesPage.js';
import { AdminIntegrationsPage } from './pages/AdminIntegrationsPage.js';

export default function App() {
  return (
    <MantineProvider>
      <BrowserRouter basename="/tracker">
        <NavHeader />
        <Routes>
          <Route path="/" element={<TicketListPage />} />
          <Route path="/tickets/:id" element={<TicketDetailPage />} />
          <Route path="/submit" element={<SubmitTicketPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin/users" element={<AdminUsersPage />} />
          <Route path="/admin/templates" element={<AdminTemplatesPage />} />
          <Route path="/admin/integrations" element={<AdminIntegrationsPage />} />
        </Routes>
      </BrowserRouter>
    </MantineProvider>
  );
}
