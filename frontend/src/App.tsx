import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/AppShell';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { DesignPatternsPage } from '@/pages/DesignPatternsPage';
import { ProjectLayout } from '@/features/projects/ProjectLayout';
import { ProjectOverview } from '@/features/projects/ProjectOverview';
import { FeatureSummary } from '@/features/projects/FeatureSummary';
import { ReportView } from '@/features/reports/ReportView';
import { BugsBoardPage } from '@/features/bugs/BugsBoardPage';
import { BugDetailPage } from '@/features/bugs/BugDetailPage';
import { InboxPage } from '@/features/inbox/InboxPage';
import { RoadmapsPage } from '@/features/roadmaps/RoadmapsPage';
import { RoadmapBoardPage } from '@/features/roadmaps/RoadmapBoardPage';
import { MilestonesPage } from '@/features/milestones/MilestonesPage';
import { MilestoneDetailPage } from '@/features/milestones/MilestoneDetailPage';
import { AdminPeoplePage } from '@/features/admin/AdminPeoplePage';
import { AdminSettingsPage } from '@/features/admin/AdminSettingsPage';
import { PublicProjectPage } from '@/features/public/PublicProjectPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Public read-only — no auth, outside the app shell */}
      <Route path="/public/projects/:token" element={<PublicProjectPage />} />

      <Route element={<ProtectedRoute />}>
        {/* Full-screen project workspace — its own topbar + feature sidebar,
            rendered outside the global AppShell to match the report UI. */}
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<ReportView />} />
          <Route path="reports/:reportId" element={<ReportView />} />
          <Route path="summary" element={<FeatureSummary />} />
          <Route path="overview" element={<ProjectOverview />} />
        </Route>

        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/bugs" element={<BugsBoardPage />} />
          <Route path="/bugs/:bugId" element={<BugDetailPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/roadmaps" element={<RoadmapsPage />} />
          <Route path="/roadmaps/:roadmapId" element={<RoadmapBoardPage />} />
          <Route path="/milestones" element={<MilestonesPage />} />
          <Route path="/milestones/:milestoneId" element={<MilestoneDetailPage />} />
          <Route path="/admin/people" element={<AdminPeoplePage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/design-patterns" element={<DesignPatternsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
