// src/routes/AppRoutes.tsx
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MainLayout } from '../layouts/MainLayout';
import { LandingPage } from '../pages/LandingPage';
import { AboutPage } from '../pages/AboutPage';
import { AboutFAQPage } from '../pages/AboutFAQPage';
import { AboutContributingPage } from '../pages/AboutContributingPage';
import { ContactPage } from '../pages/ContactPage';
import { FeedbackIndexPage } from '../pages/FeedbackIndexPage';
import { FeedbackDetailPage } from '../pages/FeedbackDetailPage';
import { FeedbackNewPage } from '../pages/FeedbackNewPage';
import { CodeOfConductPage } from '../pages/CodeOfConductPage';
import { LegalPage } from '../pages/LegalPage';
import { LegalTermsPage } from '../pages/LegalTermsPage';
import { LegalPrivacyPage } from '../pages/LegalPrivacyPage';
import { EventsPage } from '../pages/EventsPage';
import { EventDetailPage } from '../pages/EventDetailPage';
import { TeamPage } from '../pages/TeamPage';
import { LoginPage } from '../pages/LoginPage';
import { UserPage } from '../pages/UserPage';
import { UserProfilePage } from '../pages/UserProfilePage';
import { NewUserPage } from '../pages/NewUserPage';
import { UserEventsPage } from '../pages/UserEventsPage';
import { UserBadgesPage } from '../pages/UserBadgesPage';
import { AdminHomePage } from '../pages/admin/AdminHomePage';
import { AdminCreateEventPage } from '../pages/admin/AdminCreateEventPage';
import { AdminEventsIndexPage } from '../pages/admin/AdminEventsIndexPage';
import { AdminBadgesIndexPage } from '../pages/admin/AdminBadgesIndexPage';
import { AdminBadgeDesignerPage } from '../pages/admin/AdminBadgeDesignerPage';
import { AdminManageUsersPage } from '../pages/admin/AdminManageUsersPage';
import { AdminEventOverviewPage } from '../pages/admin/AdminEventOverviewPage';
import { AdminEventStagesPage } from '../pages/admin/AdminEventStagesPage';
import { AdminEventAwardsPage } from '../pages/admin/AdminEventAwardsPage';
import { AdminStageEditorPage } from '../pages/admin/AdminStageEditorPage';
import { AdminStageDrawPage } from '../pages/admin/AdminStageDrawPage';
import { AdminStageBracketPage } from '../pages/admin/AdminStageBracketPage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { EventStatsPage } from '../pages/EventStatsPage';
import { StageDetailPage } from '../pages/StageDetailPage';
import { EventTeamResultsPage } from '../pages/EventTeamResultsPage';
import { SessionLivePage } from '../pages/SessionLivePage';
import { SessionTeamPage } from '../pages/SessionTeamPage';
import { RequireAdmin } from '../features/admin/guards/RequireAdmin';
import { RequireSuperAdmin } from '../features/admin/guards/RequireSuperAdmin';
import { AdminLayoutScreen } from '../features/admin/screens/AdminLayoutScreen';
import { AdminEventsLayoutScreen } from '../features/admin/screens/events/AdminEventsLayoutScreen';
import { AdminEventLayoutScreen } from '../features/admin/screens/events/AdminEventLayoutScreen';
import { AdminContentLayoutScreen } from '../features/admin/screens/content/AdminContentLayoutScreen';
import { AdminContentHomeScreen } from '../features/admin/screens/content/AdminContentHomeScreen';
import { AdminContentEditorScreen } from '../features/admin/screens/content/AdminContentEditorScreen';
import { AdminUsersLayoutScreen } from '../features/admin/screens/users/AdminUsersLayoutScreen';
import { AdminSystemLayoutScreen } from '../features/admin/screens/system/AdminSystemLayoutScreen';
import { AdminSystemHomeScreen } from '../features/admin/screens/system/AdminSystemHomeScreen';
import { useAuth, hasRole } from '../context/AuthContext';

function AdminRoutes() {
  const { user } = useAuth();

  return (
    <Route
      path="admin"
      element={
        <RequireAdmin>
          <AdminLayoutScreen isSuperAdmin={hasRole(user, 'SUPERADMIN')} />
        </RequireAdmin>
      }
    >
      <Route index element={<AdminHomePage />} />

      <Route path="events" element={<AdminEventsLayoutScreen />}>
        <Route index element={<AdminEventsIndexPage />} />
        <Route path="create" element={<AdminCreateEventPage />} />
        <Route path="new" element={<AdminCreateEventPage />} />
        <Route path=":slug/edit" element={<AdminCreateEventPage />} />
        <Route path=":slug" element={<AdminEventLayoutScreen />}>
          <Route index element={<AdminEventOverviewPage />} />
          <Route path="stages" element={<AdminEventStagesPage />} />
          <Route path="stages/new" element={<AdminStageEditorPage />} />
          <Route path="stages/:stageId/edit" element={<AdminStageEditorPage />} />
          <Route path="stages/:stageId/draw" element={<AdminStageDrawPage />} />
          <Route path="stages/:stageId/bracket" element={<AdminStageBracketPage />} />
          <Route path="awards" element={<AdminEventAwardsPage />} />
        </Route>
      </Route>

      <Route path="badges">
        <Route index element={<AdminBadgesIndexPage />} />
        <Route path="new" element={<AdminBadgeDesignerPage />} />
        <Route path=":badgeSetId/edit" element={<AdminBadgeDesignerPage />} />
      </Route>

      <Route path="content" element={<AdminContentLayoutScreen />}>
        <Route index element={<AdminContentHomeScreen />} />
        <Route path=":slug" element={<AdminContentEditorScreen />} />
      </Route>

      <Route
        path="users"
        element={
          <RequireSuperAdmin>
            <AdminUsersLayoutScreen />
          </RequireSuperAdmin>
        }
      >
        <Route index element={<AdminManageUsersPage />} />
      </Route>

      <Route
        path="system"
        element={
          <RequireSuperAdmin>
            <AdminSystemLayoutScreen />
          </RequireSuperAdmin>
        }
      >
        <Route index element={<AdminSystemHomeScreen />} />
      </Route>

      <Route path="create-event" element={<Navigate to="/admin/events/create" replace />} />
      <Route path="manage-users" element={<Navigate to="/admin/users" replace />} />
      <Route path="data-deletion" element={<Navigate to="/admin/system" replace />} />
    </Route>
  );
}

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<MainLayout />}>
          {/* Home */}
          <Route index element={<LandingPage />} />
          <Route path="about" element={<AboutPage />} />
          <Route path="about/FAQ" element={<AboutFAQPage />} />
          <Route path="about/contributing" element={<AboutContributingPage />} />
          <Route path="contact" element={<ContactPage />} />
          <Route path="feedback">
            <Route index element={<FeedbackIndexPage />} />
            <Route path="new" element={<FeedbackNewPage />} />
            <Route path=":id" element={<FeedbackDetailPage />} />
          </Route>
          <Route path="code-of-conduct" element={<CodeOfConductPage />} />
          <Route path="legal" element={<LegalPage />} />
          <Route path="legal/terms" element={<LegalTermsPage />} />
          <Route path="legal/privacy" element={<LegalPrivacyPage />} />

          {/* Events */}
          <Route path="events">
            <Route index element={<EventsPage />} />
            <Route path=":slug" element={<EventDetailPage />} />
            <Route path=":slug/:teamSize" element={<EventDetailPage />} />
            <Route path=":slug/teams/:teamId" element={<TeamPage />} />
            <Route path=":slug/event-teams/:teamId" element={<EventTeamResultsPage />} />
            <Route path=":slug/stats" element={<EventStatsPage />} />
            <Route path=":slug/stages/:stageId" element={<StageDetailPage />} />
            <Route
              path=":slug/sessions/:sessionId/team/:roundId/:teamNo"
              element={<SessionTeamPage />}
            />
            <Route path=":slug/sessions/:sessionId/live" element={<SessionLivePage />} />
          </Route>

          {/* Auth */}
          <Route path="login" element={<LoginPage />} />
          <Route path="new-user" element={<NewUserPage />} />
          <Route path="me" element={<UserPage />} />
          <Route path="users/:username" element={<UserProfilePage />} />
          <Route path="users/:username/events" element={<UserEventsPage />} />
          <Route path="users/:username/badges" element={<UserBadgesPage />} />

          {/* Admin */}
          {AdminRoutes()}

          {/* Catch-all */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
