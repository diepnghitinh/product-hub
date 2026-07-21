import { Navigate, Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppLayout } from '@/layouts';
import { LoginPage } from '@/features/auth/LoginPage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { ProjectsPage } from '@/pages/ProjectsPage';
import { DesignPatternsPage } from '@/pages/DesignPatternsPage';
import { ProjectLayout } from '@/features/projects/ProjectLayout';
import { FeatureSummary } from '@/features/projects/FeatureSummary';
import { ReportView } from '@/features/reports/ReportView';
import { BugsBoardPage } from '@/features/bugs/BugsBoardPage';
import { BugDetailPage } from '@/features/bugs/BugDetailPage';
import { InboxPage } from '@/features/inbox/InboxPage';
import { MyTasksPage } from '@/features/tasks/MyTasksPage';
import { MyTaskListView } from '@/features/tasks/MyTaskListView';
import { NewTaskPage } from '@/features/tasks/NewTaskPage';
import { TaskDetailPage } from '@/features/tasks/TaskDetailPage';
import { TeamBoardPage } from '@/features/teams/TeamBoardPage';
import { RoadmapsPage } from '@/features/roadmaps/RoadmapsPage';
import { RoadmapBoardPage } from '@/features/roadmaps/RoadmapBoardPage';
import { MilestonesPage } from '@/features/milestones/MilestonesPage';
import { MilestoneDetailPage } from '@/features/milestones/MilestoneDetailPage';
import { AdminPeoplePage } from '@/features/admin/AdminPeoplePage';
import { AdminSettingsPage } from '@/features/admin/AdminSettingsPage';
import { PublicProjectPage } from '@/features/public/PublicProjectPage';
import { PublicRoadmapPage } from '@/features/public/PublicRoadmapPage';
import { PublicTeamBoardPage } from '@/features/public/PublicTeamBoardPage';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Public read-only — no auth, outside the app shell */}
      <Route path="/public/projects/:token" element={<PublicProjectPage />} />
      <Route path="/public/roadmaps/:token" element={<PublicRoadmapPage />} />
      <Route path="/public/teams/:token" element={<PublicTeamBoardPage />} />

      <Route element={<ProtectedRoute />}>
        {/* Full-screen project workspace — its own topbar + feature sidebar,
            rendered outside the global shell to match the report UI. */}
        <Route path="/testing/:projectId" element={<ProjectLayout />}>
          <Route index element={<ReportView />} />
          <Route path="reports/:reportId" element={<ReportView />} />
          <Route path="summary" element={<FeatureSummary />} />
        </Route>

        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/testing" element={<ProjectsPage />} />
          <Route path="/bugs" element={<BugsBoardPage />} />
          <Route path="/bugs/:bugId" element={<BugDetailPage />} />
          <Route path="/inbox" element={<InboxPage />} />
          <Route path="/tasks" element={<MyTasksPage />} />
          <Route path="/tasks/new" element={<NewTaskPage />} />
          <Route path="/tasks/today" element={<MyTaskListView mode="today" />} />
          <Route path="/tasks/personal" element={<MyTaskListView mode="personal" />} />
          <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
          {/* A team's own issue list — renders the bug or task board by issueType. */}
          <Route path="/teams/:teamId" element={<TeamBoardPage />} />
          <Route path="/roadmaps" element={<RoadmapsPage />} />
          <Route path="/roadmaps/:roadmapId" element={<RoadmapBoardPage />} />
          <Route path="/okrs" element={<MilestonesPage />} />
          <Route path="/okrs/:milestoneId" element={<MilestoneDetailPage />} />
          <Route path="/admin/people" element={<AdminPeoplePage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/design-patterns" element={<DesignPatternsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
