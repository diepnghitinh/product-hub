import { Navigate, Route, Routes, useLocation, useParams, useSearchParams } from 'react-router-dom';
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
import { InboxPage } from '@/features/inbox/InboxPage';
import { MyIssuesPage } from '@/features/issues/MyIssuesPage';
import { IssueDetailPage } from '@/features/issues/IssueDetailPage';
import { MyTaskListView } from '@/features/tasks/MyTaskListView';
import { PersonalBoardPage } from '@/features/tasks/PersonalBoardPage';
import { NewTaskPage } from '@/features/tasks/NewTaskPage';
import { MyTeamPage } from '@/features/my-team/MyTeamPage';
import { TeamBoardPage } from '@/features/teams/TeamBoardPage';
import { TeamCyclesPage } from '@/features/cycles/TeamCyclesPage';
import { RoadmapsPage } from '@/features/roadmaps/RoadmapsPage';
import { RoadmapBoardPage } from '@/features/roadmaps/RoadmapBoardPage';
import { RoadmapItemDetailPage } from '@/features/roadmaps/RoadmapItemDetailPage';
import { DocsHubPage } from '@/features/docs/DocsHubPage';
import { DocWorkspacePage } from '@/features/docs/DocWorkspacePage';
import { MilestonesPage } from '@/features/milestones/MilestonesPage';
import { MilestoneDetailPage } from '@/features/milestones/MilestoneDetailPage';
import { AdminPeoplePage } from '@/features/admin/AdminPeoplePage';
import { AdminSettingsPage } from '@/features/admin/AdminSettingsPage';
import { MyProfilePage } from '@/features/account/MyProfilePage';
import { PublicProjectPage } from '@/features/public/PublicProjectPage';
import { PublicRoadmapPage } from '@/features/public/PublicRoadmapPage';
import { PublicDocPage } from '@/features/public/PublicDocPage';
import { PublicTeamBoardPage } from '@/features/public/PublicTeamBoardPage';

/** A bare `/bugs` is now the unified Issues board scoped to bugs. But a
 * project/case/report-scoped `/bugs?projectId=…` is a real deep-link target (a
 * test report's "view bugs"), so that keeps the standalone, scoped bug board. */
function BugsRoute() {
  const [params] = useSearchParams();
  const scoped = params.has('projectId') || params.has('caseId') || params.has('reportId');
  return scoped ? <BugsBoardPage /> : <Navigate to="/issues?kind=bug" replace />;
}

/** Detail links used to split by kind (`/tasks/TSK-7`, `/bugs/BUG-3`); both now
 * live at `/issues/<ref>`. Bookmarks, pasted links and old descriptions land
 * here and are forwarded — query string and hash intact. */
function IssueRefRedirect() {
  const { taskId, bugId } = useParams<{ taskId: string; bugId: string }>();
  const { search, hash } = useLocation();
  return <Navigate to={`/issues/${taskId ?? bugId}${search}${hash}`} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      {/* Public read-only — no auth, outside the app shell */}
      <Route path="/public/projects/:token" element={<PublicProjectPage />} />
      <Route path="/public/roadmaps/:token" element={<PublicRoadmapPage />} />
      <Route path="/public/docs/:token" element={<PublicDocPage />} />
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
          {/* A bare /bugs folds into the unified Issues board; a scoped /bugs
              (project/case/report) stays the standalone bug list. */}
          <Route path="/bugs" element={<BugsRoute />} />
          <Route path="/bugs/:bugId" element={<IssueRefRedirect />} />
          <Route path="/inbox" element={<InboxPage />} />
          {/* The unified personal work area — tasks + bugs in one board. */}
          <Route path="/issues" element={<MyIssuesPage />} />
          <Route path="/issues/today" element={<MyTaskListView mode="today" />} />
          <Route path="/issues/personal" element={<PersonalBoardPage />} />
          {/* One detail URL for both kinds — the ref names the issue, the page
              works out whether it's a task or a bug. Static siblings above win
              the match, so `today`/`personal` are never read as refs. */}
          <Route path="/issues/:issueRef" element={<IssueDetailPage />} />
          {/* Old task routes fold into Issues; deep links + bookmarks still work.
              /tasks/new keeps its own page (create). */}
          <Route path="/tasks" element={<Navigate to="/issues" replace />} />
          <Route path="/tasks/new" element={<NewTaskPage />} />
          <Route path="/tasks/today" element={<Navigate to="/issues/today" replace />} />
          <Route path="/tasks/personal" element={<Navigate to="/issues/personal" replace />} />
          <Route path="/tasks/:taskId" element={<IssueRefRedirect />} />
          <Route path="/my-team" element={<MyTeamPage />} />
          {/* A team's own issue list — renders the bug or task board by issueType. */}
          <Route path="/teams/:teamId" element={<TeamBoardPage />} />
          <Route path="/teams/:teamId/cycles" element={<TeamCyclesPage />} />
          <Route path="/roadmaps" element={<RoadmapsPage />} />
          <Route path="/roadmaps/:roadmapId" element={<RoadmapBoardPage />} />
          <Route path="/roadmaps/:roadmapId/items/:itemId" element={<RoadmapItemDetailPage />} />
          {/* A doc's pages are deep-linkable: /docs/:docId/:pageId. */}
          <Route path="/docs" element={<DocsHubPage />} />
          <Route path="/docs/:docId" element={<DocWorkspacePage />} />
          <Route path="/docs/:docId/:pageId" element={<DocWorkspacePage />} />
          <Route path="/okrs" element={<MilestonesPage />} />
          <Route path="/okrs/:milestoneId" element={<MilestoneDetailPage />} />
          <Route path="/admin/people" element={<AdminPeoplePage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
          <Route path="/profile" element={<MyProfilePage />} />
          <Route path="/design-patterns" element={<DesignPatternsPage />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
