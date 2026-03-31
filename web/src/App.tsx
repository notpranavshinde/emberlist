import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, ComponentType, FormEvent, ReactNode } from 'react';
import {
  Calendar,
  Check,
  ChevronRight,
  Cloud,
  Folder,
  Home,
  Import,
  Layers3,
  ListTodo,
  Plus,
  RefreshCw,
  Search,
  Settings,
  X,
} from 'lucide-react';
import {
  HashRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { format, isToday, isTomorrow, isYesterday, startOfDay } from 'date-fns';
import { RecoveryScreen } from './components/RecoveryScreen';
import { db } from './lib/db';
import { ensureSyncPayload } from './lib/syncPayload';
import { DriveSyncService, type CloudSession } from './lib/syncService';
import { SyncEngine } from './lib/syncEngine';
import {
  archiveTask,
  createProject,
  createSection,
  createTask,
  createTaskDraft,
  deleteProject,
  deleteSection,
  deleteTask,
  getActiveProjects,
  getInboxTasks,
  getProjectById,
  getProjectSections,
  getProjectTasks,
  getTaskById,
  getTodayViewData,
  getUpcomingGroups,
  searchTasks,
  toggleTaskCompletion,
  type SearchFilter,
  type TaskDraft,
  updateProject,
  updateSection,
  updateTask,
} from './lib/workspace';
import type { Priority, Project, Section, SyncPayload, Task } from './types/sync';

const syncEngine = new SyncEngine();
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';
const SEARCH_FILTERS: Array<{ label: string; value: SearchFilter }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Overdue', value: 'OVERDUE' },
  { label: 'Today', value: 'TODAY' },
  { label: 'This week', value: 'THIS_WEEK' },
  { label: 'High priority', value: 'HIGH_PRIORITY' },
  { label: 'Inbox', value: 'INBOX' },
  { label: 'No due', value: 'NO_DUE' },
  { label: 'Has deadline', value: 'HAS_DEADLINE' },
  { label: 'Recurring', value: 'RECURRING' },
  { label: 'Has reminder', value: 'HAS_REMINDER' },
];

type BootState = 'loading' | 'ready' | 'error';
type Banner = {
  tone: 'success' | 'error' | 'info';
  message: string;
};
type CloudStatusTone = 'ready' | 'idle' | 'warning' | 'muted';

function App() {
  const [payload, setPayload] = useState<SyncPayload | null>(null);
  const [bootState, setBootState] = useState<BootState>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isResettingCache, setIsResettingCache] = useState(false);
  const [isResettingCloud, setIsResettingCloud] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [showCompletedToday, setShowCompletedToday] = useState(() =>
    readStoredBoolean('emberlist.showCompletedToday', true)
  );
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(() =>
    readStoredNumber('emberlist.lastCloudSyncAt')
  );
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(() => readStoredCloudSession());
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);

  const payloadRef = useRef<SyncPayload | null>(null);
  const syncService = useMemo(
    () => (GOOGLE_CLIENT_ID ? new DriveSyncService(GOOGLE_CLIENT_ID) : null),
    []
  );

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    window.localStorage.setItem('emberlist.showCompletedToday', JSON.stringify(showCompletedToday));
  }, [showCompletedToday]);

  useEffect(() => {
    if (lastCloudSyncAt === null) {
      window.localStorage.removeItem('emberlist.lastCloudSyncAt');
      return;
    }
    window.localStorage.setItem('emberlist.lastCloudSyncAt', String(lastCloudSyncAt));
  }, [lastCloudSyncAt]);

  useEffect(() => {
    writeStoredCloudSession(cloudSession);
  }, [cloudSession]);

  const loadData = useMemo(
    () => async () => {
      setBootState('loading');
      setBootError(null);
      try {
        const data = await db.getPayload();
        payloadRef.current = data;
        setPayload(data);
        setBootState('ready');
      } catch (error) {
        console.error('Failed to load local workspace', error);
        payloadRef.current = null;
        setPayload(null);
        setBootError(error instanceof Error ? error.message : 'Failed to load local workspace.');
        setBootState('error');
      }
    },
    []
  );

  useEffect(() => {
    void loadData();
  }, [loadData]);

  async function persistPayload(nextPayload: SyncPayload) {
    await db.savePayload(nextPayload);
    payloadRef.current = nextPayload;
    setPayload(nextPayload);
  }

  async function applyPayloadUpdate(
    updater: (current: SyncPayload) => SyncPayload
  ): Promise<SyncPayload | null> {
    const current = payloadRef.current;
    if (!current) return null;
    const nextPayload = updater(current);
    await persistPayload(nextPayload);
    return nextPayload;
  }

  async function handleResetLocalCache() {
    setIsResettingCache(true);
    try {
      await db.reset();
      setBanner({ tone: 'info', message: 'Local web cache cleared. A fresh workspace was created.' });
      await loadData();
    } catch (error) {
      console.error('Failed to reset local web cache', error);
      setBootError(error instanceof Error ? error.message : 'Failed to reset local web cache.');
      setBootState('error');
    } finally {
      setIsResettingCache(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const remotePayload = ensureSyncPayload(JSON.parse(await file.text()), 'Imported JSON file');
      const localPayload = payloadRef.current ?? (await db.getPayload());
      const mergedPayload = syncEngine.mergePayloads(localPayload, remotePayload);
      await persistPayload(mergedPayload);
      setBootState('ready');
      setBanner({ tone: 'success', message: 'Imported JSON was merged into your local workspace.' });
    } catch (error) {
      console.error('Failed to import JSON', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to import JSON.',
      });
    }
  }

  async function handleCloudSync() {
    if (!syncService) {
      const message = 'Cloud sync is not configured for this deployment. Set VITE_GOOGLE_CLIENT_ID and redeploy.';
      setLastSyncError(message);
      setBanner({ tone: 'error', message });
      return;
    }

    setIsSyncing(true);
    setLastSyncError(null);
    try {
      const mergedPayload = await syncService.sync();
      await persistPayload(mergedPayload);
      setLastCloudSyncAt(Date.now());
      setCloudSession(syncService.getSession());
      setBootState('ready');
      setBanner({ tone: 'success', message: 'Cloud sync completed.' });
    } catch (error) {
      console.error('Cloud sync failed', error);
      const message = error instanceof Error ? error.message : 'Cloud sync failed.';
      setLastSyncError(message);
      setBanner({
        tone: 'error',
        message,
      });
    } finally {
      setIsSyncing(false);
    }
  }

  async function handleResetCloudSync() {
    if (!syncService) {
      const message = 'Cloud sync is not configured for this deployment. Set VITE_GOOGLE_CLIENT_ID and redeploy.';
      setLastSyncError(message);
      setBanner({ tone: 'error', message });
      return;
    }

    const confirmed = window.confirm(
      'Delete all Emberlist cloud sync files in Google Drive app data? Your local web data will stay intact.'
    );
    if (!confirmed) return;

    setIsResettingCloud(true);
    try {
      await syncService.resetRemoteSyncFile();
      setLastCloudSyncAt(null);
      setLastSyncError(null);
      setBanner({
        tone: 'success',
        message: 'Cloud sync storage was reset. Sync again from the side with the data you want to keep.',
      });
    } catch (error) {
      console.error('Failed to reset cloud sync', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to reset cloud sync.',
      });
    } finally {
      setIsResettingCloud(false);
    }
  }

  async function handleDisconnectCloud() {
    if (!syncService) return;

    try {
      await syncService.disconnect();
      setCloudSession(null);
      setBanner({ tone: 'info', message: 'Signed out of Google Drive for this browser session.' });
    } catch (error) {
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to disconnect Google Drive.',
      });
    }
  }

  async function handleCreateProject(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await applyPayloadUpdate(current => createProject(current, trimmed));
    setBanner({ tone: 'success', message: `Project "${trimmed}" created.` });
  }

  async function handleUpdateProject(projectId: string, updater: (project: Project) => Project) {
    await applyPayloadUpdate(current => updateProject(current, projectId, updater));
  }

  async function handleDeleteProject(projectId: string) {
    await applyPayloadUpdate(current => deleteProject(current, projectId));
  }

  async function handleCreateSection(projectId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await applyPayloadUpdate(current => createSection(current, projectId, trimmed));
  }

  async function handleUpdateSection(sectionId: string, updater: (section: Section) => Section) {
    await applyPayloadUpdate(current => updateSection(current, sectionId, updater));
  }

  async function handleDeleteSection(sectionId: string) {
    await applyPayloadUpdate(current => deleteSection(current, sectionId));
  }

  async function handleToggleTask(taskId: string) {
    await applyPayloadUpdate(current => toggleTaskCompletion(current, taskId));
  }

  async function handleArchiveTask(taskId: string) {
    await applyPayloadUpdate(current => archiveTask(current, taskId));
  }

  async function handleDeleteTask(taskId: string) {
    await applyPayloadUpdate(current => deleteTask(current, taskId));
  }

  async function handleCreateTask(draft: TaskDraft): Promise<string | null> {
    if (!draft.title.trim()) {
      setBanner({ tone: 'error', message: 'Task title is required.' });
      return null;
    }

    const current = payloadRef.current;
    if (!current) return null;

    const existingIds = new Set(current.tasks.map(task => task.id));
    const nextPayload = createTask(current, draft);
    const createdTask = nextPayload.tasks.find(task => !existingIds.has(task.id)) ?? null;
    await persistPayload(nextPayload);
    setBanner({ tone: 'success', message: `Task "${draft.title.trim()}" created.` });
    return createdTask?.id ?? null;
  }

  async function handleSaveTask(taskId: string, updater: (task: Task) => Task) {
    const nextPayload = await applyPayloadUpdate(current => updateTask(current, taskId, updater));
    const savedTask = nextPayload?.tasks.find(task => task.id === taskId);
    if (savedTask) {
      setBanner({ tone: 'success', message: `Saved "${savedTask.title}".` });
    }
  }

  if (bootState === 'loading') {
    return <LoadingScreen label="Loading your workspace..." />;
  }

  if (bootState === 'error') {
    return (
      <RecoveryScreen
        message={bootError ?? 'Failed to load local workspace.'}
        onRetry={() => void loadData()}
        onResetLocalCache={() => void handleResetLocalCache()}
        isResetting={isResettingCache}
      />
    );
  }

  if (!payload) {
    return (
      <RecoveryScreen
        message="Local workspace is unavailable."
        onRetry={() => void loadData()}
        onResetLocalCache={() => void handleResetLocalCache()}
        isResetting={isResettingCache}
      />
    );
  }

  return (
    <HashRouter>
      <WorkspaceShell
        payload={payload}
        banner={banner}
        onDismissBanner={() => setBanner(null)}
        onCloudSync={() => void handleCloudSync()}
        onResetCloudSync={() => void handleResetCloudSync()}
        onResetLocalCache={() => void handleResetLocalCache()}
        onImport={handleImport}
        onCreateTask={handleCreateTask}
        onToggleTask={taskId => void handleToggleTask(taskId)}
        onArchiveTask={taskId => void handleArchiveTask(taskId)}
        onDeleteTask={taskId => void handleDeleteTask(taskId)}
        onSaveTask={(taskId, updater) => void handleSaveTask(taskId, updater)}
        onCreateProject={name => void handleCreateProject(name)}
        onUpdateProject={(projectId, updater) => void handleUpdateProject(projectId, updater)}
        onDeleteProject={projectId => void handleDeleteProject(projectId)}
        onCreateSection={(projectId, name) => void handleCreateSection(projectId, name)}
        onUpdateSection={(sectionId, updater) => void handleUpdateSection(sectionId, updater)}
        onDeleteSection={sectionId => void handleDeleteSection(sectionId)}
        showCompletedToday={showCompletedToday}
        onToggleShowCompletedToday={() => setShowCompletedToday(value => !value)}
        cloudConfigured={Boolean(syncService)}
        cloudSession={cloudSession}
        lastSyncError={lastSyncError}
        isSyncing={isSyncing}
        isResettingCloud={isResettingCloud}
        isResettingCache={isResettingCache}
        lastCloudSyncAt={lastCloudSyncAt}
        onDisconnectCloud={() => void handleDisconnectCloud()}
        isQuickAddOpen={isQuickAddOpen}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        onCloseQuickAdd={() => setIsQuickAddOpen(false)}
      />
    </HashRouter>
  );
}

export default App;

type WorkspaceShellProps = {
  payload: SyncPayload;
  banner: Banner | null;
  onDismissBanner: () => void;
  onCloudSync: () => void;
  onResetCloudSync: () => void;
  onResetLocalCache: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onCreateTask: (draft: TaskDraft) => Promise<string | null>;
  onToggleTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onSaveTask: (taskId: string, updater: (task: Task) => Task) => void;
  onCreateProject: (name: string) => void;
  onUpdateProject: (projectId: string, updater: (project: Project) => Project) => void;
  onDeleteProject: (projectId: string) => void;
  onCreateSection: (projectId: string, name: string) => void;
  onUpdateSection: (sectionId: string, updater: (section: Section) => Section) => void;
  onDeleteSection: (sectionId: string) => void;
  showCompletedToday: boolean;
  onToggleShowCompletedToday: () => void;
  cloudConfigured: boolean;
  cloudSession: CloudSession | null;
  lastSyncError: string | null;
  isSyncing: boolean;
  isResettingCloud: boolean;
  isResettingCache: boolean;
  lastCloudSyncAt: number | null;
  onDisconnectCloud: () => void;
  isQuickAddOpen: boolean;
  onOpenQuickAdd: () => void;
  onCloseQuickAdd: () => void;
};

function WorkspaceShell({
  payload,
  banner,
  onDismissBanner,
  onCloudSync,
  onResetCloudSync,
  onResetLocalCache,
  onImport,
  onCreateTask,
  onToggleTask,
  onArchiveTask,
  onDeleteTask,
  onSaveTask,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onCreateSection,
  onUpdateSection,
  onDeleteSection,
  showCompletedToday,
  onToggleShowCompletedToday,
  cloudConfigured,
  cloudSession,
  lastSyncError,
  isSyncing,
  isResettingCloud,
  isResettingCache,
  lastCloudSyncAt,
  onDisconnectCloud,
  isQuickAddOpen,
  onOpenQuickAdd,
  onCloseQuickAdd,
}: WorkspaceShellProps) {
  const location = useLocation();
  const title = getRouteTitle(location.pathname, payload);
  const projects = getActiveProjects(payload);
  const cloudStatus = getCloudStatus({
    cloudConfigured,
    cloudSession,
    lastSyncError,
    isSyncing,
    lastCloudSyncAt,
  });

  return (
    <div className="min-h-screen bg-[#F7F4F0] text-[#221E1C]">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col md:flex-row">
        <aside className="hidden w-[300px] shrink-0 border-r border-[#E7DDD4] bg-[#F3EEE8] px-5 py-6 md:flex md:flex-col">
          <div className="mb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#9F7B63]">Emberlist</p>
            <h1 className="mt-2 text-3xl font-semibold text-[#1E2D2F]">Workspace</h1>
          </div>
          <nav className="space-y-1">
            <RailLink to="/today" icon={Home} label="Today" />
            <RailLink to="/upcoming" icon={Calendar} label="Upcoming" />
            <RailLink to="/search" icon={Search} label="Search" />
            <RailLink to="/browse" icon={Layers3} label="Browse" />
            <RailLink to="/settings" icon={Settings} label="Settings" />
          </nav>

          <div className="mt-8 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">Projects</p>
            <button
              onClick={onOpenQuickAdd}
              className="rounded-full bg-[#EE6A3C] p-2 text-white transition hover:bg-[#d75e33]"
              aria-label="Quick add task"
            >
              <Plus size={16} />
            </button>
          </div>

          <div className="mt-3 space-y-1 overflow-y-auto pr-1">
            <RailLink to="/inbox" icon={ListTodo} label={`Inbox (${getInboxTasks(payload).length})`} compact />
            {projects.map(project => (
              <RailLink
                key={project.id}
                to={`/project/${project.id}`}
                icon={Folder}
                label={project.name}
                compact
              />
            ))}
          </div>

          <div className="mt-auto rounded-[28px] border border-[#E1D5CA] bg-white/90 p-4 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#1E2D2F]">Cloud sync</p>
              <StatusPill label={cloudStatus.label} tone={cloudStatus.tone} />
            </div>
            <p className="mt-3 text-sm text-[#1E2D2F]">
              {cloudSession?.email ?? 'No Google account connected in this tab'}
            </p>
            <p className="mt-2 text-sm leading-6 text-[#6D5C50]">{cloudStatus.detail}</p>
            <button
              onClick={onCloudSync}
              disabled={isSyncing || !cloudConfigured}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-[#EE6A3C] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
              <span>{isSyncing ? 'Syncing...' : 'Sync now'}</span>
            </button>
            {cloudSession ? (
              <button
                onClick={onDisconnectCloud}
                className="mt-3 w-full rounded-full border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-white"
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-[#E7DDD4] bg-[#F7F4F0]/95 px-4 py-4 backdrop-blur md:px-8">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63] md:hidden">Emberlist</p>
                <h2 className="text-2xl font-semibold text-[#1E2D2F]">{title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCloudSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2 rounded-full border border-[#E1D5CA] bg-white px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
                </button>
                <button
                  onClick={onOpenQuickAdd}
                  className="flex items-center gap-2 rounded-full bg-[#EE6A3C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d75e33]"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Quick add</span>
                </button>
              </div>
            </div>
            {banner ? (
              <div className={`mt-4 flex items-start justify-between gap-3 rounded-[24px] px-4 py-3 text-sm ${bannerClasses(banner.tone)}`}>
                <p>{banner.message}</p>
                <button onClick={onDismissBanner} className="rounded-full p-1 transition hover:bg-black/5" aria-label="Dismiss status message">
                  <X size={16} />
                </button>
              </div>
            ) : null}
          </header>

          <main className="flex-1 px-4 pb-24 pt-5 md:px-8 md:pb-8">
            <Routes>
              <Route path="/" element={<Navigate to="/today" replace />} />
              <Route
                path="/today"
                element={
                  <TodayPage
                    payload={payload}
                    showCompletedToday={showCompletedToday}
                    onToggleShowCompletedToday={onToggleShowCompletedToday}
                    onToggleTask={onToggleTask}
                  />
                }
              />
              <Route
                path="/upcoming"
                element={<UpcomingPage payload={payload} onToggleTask={onToggleTask} />}
              />
              <Route
                path="/search"
                element={<SearchPage payload={payload} onToggleTask={onToggleTask} />}
              />
              <Route
                path="/browse"
                element={<BrowsePage payload={payload} onCreateProject={onCreateProject} />}
              />
              <Route
                path="/inbox"
                element={<InboxPage payload={payload} onToggleTask={onToggleTask} />}
              />
              <Route
                path="/project/:projectId"
                element={
                  <ProjectPage
                    payload={payload}
                    onCreateSection={onCreateSection}
                    onUpdateProject={onUpdateProject}
                    onDeleteProject={onDeleteProject}
                    onUpdateSection={onUpdateSection}
                    onDeleteSection={onDeleteSection}
                    onToggleTask={onToggleTask}
                    onOpenQuickAdd={onOpenQuickAdd}
                  />
                }
              />
              <Route
                path="/task/:taskId"
                element={
                  <TaskDetailPage
                    payload={payload}
                    onSaveTask={onSaveTask}
                    onArchiveTask={onArchiveTask}
                    onDeleteTask={onDeleteTask}
                  />
                }
              />
              <Route
                path="/settings"
                element={
                  <SettingsPage
                    cloudConfigured={cloudConfigured}
                    cloudSession={cloudSession}
                    lastSyncError={lastSyncError}
                    showCompletedToday={showCompletedToday}
                    onToggleShowCompletedToday={onToggleShowCompletedToday}
                    onCloudSync={onCloudSync}
                    onDisconnectCloud={onDisconnectCloud}
                    onResetCloudSync={onResetCloudSync}
                    onResetLocalCache={onResetLocalCache}
                    onImport={onImport}
                    isSyncing={isSyncing}
                    isResettingCloud={isResettingCloud}
                    isResettingCache={isResettingCache}
                    lastCloudSyncAt={lastCloudSyncAt}
                  />
                }
              />
            </Routes>
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E7DDD4] bg-[#F7F4F0]/95 px-2 py-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          <BottomLink to="/today" icon={Home} label="Today" />
          <BottomLink to="/upcoming" icon={Calendar} label="Upcoming" />
          <BottomLink to="/search" icon={Search} label="Search" />
          <BottomLink to="/browse" icon={Layers3} label="Browse" />
          <BottomLink to="/settings" icon={Settings} label="Settings" />
        </div>
      </nav>

      {isQuickAddOpen ? (
        <QuickAddDialog payload={payload} onClose={onCloseQuickAdd} onCreateTask={onCreateTask} />
      ) : null}
    </div>
  );
}

function TodayPage({
  payload,
  showCompletedToday,
  onToggleShowCompletedToday,
  onToggleTask,
}: {
  payload: SyncPayload;
  showCompletedToday: boolean;
  onToggleShowCompletedToday: () => void;
  onToggleTask: (taskId: string) => void;
}) {
  const navigate = useNavigate();
  const data = getTodayViewData(payload);

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Focus"
        title="Today"
        description="Review what is due now, what slipped past due, and what you already finished today."
        actions={
          <label className="flex items-center gap-3 rounded-full border border-[#E1D5CA] bg-white px-4 py-2 text-sm font-medium text-[#6D5C50]">
            <input
              type="checkbox"
              checked={showCompletedToday}
              onChange={onToggleShowCompletedToday}
              className="h-4 w-4 accent-[#EE6A3C]"
            />
            Show completed today
          </label>
        }
      />

      <TaskGroup
        title="Overdue"
        subtitle="Open tasks that should already be done."
        tasks={data.overdue}
        emptyMessage="Nothing overdue."
        onToggleTask={onToggleTask}
        onOpenTask={taskId => navigate(`/task/${taskId}`)}
      />

      <TaskGroup
        title="Due today"
        subtitle="Tasks scheduled for today."
        tasks={data.today}
        emptyMessage="No tasks due today."
        onToggleTask={onToggleTask}
        onOpenTask={taskId => navigate(`/task/${taskId}`)}
      />

      {showCompletedToday ? (
        <TaskGroup
          title="Completed today"
          subtitle="Recently finished work."
          tasks={data.completedToday}
          emptyMessage="Nothing completed yet today."
          onToggleTask={onToggleTask}
          onOpenTask={taskId => navigate(`/task/${taskId}`)}
        />
      ) : null}
    </div>
  );
}

function UpcomingPage({
  payload,
  onToggleTask,
}: {
  payload: SyncPayload;
  onToggleTask: (taskId: string) => void;
}) {
  const navigate = useNavigate();
  const todayData = getTodayViewData(payload);
  const groups = getUpcomingGroups(payload);

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Timeline"
        title="Upcoming"
        description="Look ahead at upcoming deadlines and future work across the workspace."
      />

      {todayData.overdue.length ? (
        <TaskGroup
          title="Still overdue"
          subtitle="These are past due and still open."
          tasks={todayData.overdue}
          emptyMessage="Nothing overdue."
          onToggleTask={onToggleTask}
          onOpenTask={taskId => navigate(`/task/${taskId}`)}
        />
      ) : null}

      {groups.length ? (
        groups.map(group => (
          <TaskGroup
            key={group.dateKey}
            title={format(new Date(group.dateKey), 'EEEE, MMM d')}
            tasks={group.tasks}
            emptyMessage="No tasks."
            onToggleTask={onToggleTask}
            onOpenTask={taskId => navigate(`/task/${taskId}`)}
          />
        ))
      ) : (
        <EmptyState
          title="Nothing upcoming"
          description="Future-dated tasks will show up here as soon as you add due dates."
        />
      )}
    </div>
  );
}

function SearchPage({
  payload,
  onToggleTask,
}: {
  payload: SyncPayload;
  onToggleTask: (taskId: string) => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<Set<SearchFilter>>(new Set(['ALL']));
  const deferredQuery = useDeferredValue(query);
  const results = useMemo(
    () => searchTasks(payload, deferredQuery, filters),
    [deferredQuery, filters, payload]
  );

  function toggleFilter(filter: SearchFilter) {
    setFilters(current => {
      const next = new Set(current);
      if (filter === 'ALL') {
        return new Set(['ALL']);
      }

      next.delete('ALL');
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }

      return next.size ? next : new Set(['ALL']);
    });
  }

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Search"
        title="Find tasks"
        description="Search titles, descriptions, project names, and sections. Combine filters when you need to narrow the list fast."
      />

      <section className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3 rounded-[22px] border border-[#E7DDD4] bg-[#FBF7F3] px-4 py-3">
          <Search size={18} className="text-[#9F7B63]" />
          <input
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search tasks, projects, and notes"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[#9F7B63]"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SEARCH_FILTERS.map(filter => {
            const active = filters.has(filter.value);
            return (
              <button
                key={filter.value}
                onClick={() => toggleFilter(filter.value)}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${active
                  ? 'bg-[#EE6A3C] text-white'
                  : 'border border-[#E1D5CA] bg-[#FBF7F3] text-[#6D5C50] hover:bg-white'
                  }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      <TaskGroup
        title={`${results.length} result${results.length === 1 ? '' : 's'}`}
        tasks={results}
        emptyMessage="No open tasks match this search yet."
        onToggleTask={onToggleTask}
        onOpenTask={taskId => navigate(`/task/${taskId}`)}
      />
    </div>
  );
}

function BrowsePage({
  payload,
  onCreateProject,
}: {
  payload: SyncPayload;
  onCreateProject: (name: string) => void;
}) {
  const projects = getActiveProjects(payload);
  const inboxCount = getInboxTasks(payload).length;
  const [projectName, setProjectName] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreateProject(projectName);
    setProjectName('');
  }

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Browse"
        title="Projects"
        description="Use Inbox for unsorted tasks, create projects for focused work, and jump into a project to manage sections."
      />

      <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
          <NavLink
            to="/inbox"
            className="flex items-center justify-between rounded-[22px] border border-[#E7DDD4] bg-[#FBF7F3] px-4 py-4 transition hover:border-[#EE6A3C]/30 hover:bg-white"
          >
            <div>
              <p className="text-sm font-semibold text-[#1E2D2F]">Inbox</p>
              <p className="mt-1 text-sm text-[#6D5C50]">{inboxCount} open task{inboxCount === 1 ? '' : 's'}</p>
            </div>
            <ChevronRight size={18} className="text-[#9F7B63]" />
          </NavLink>

          <div className="mt-4 space-y-3">
            {projects.length ? (
              projects.map(project => {
                const taskCount = getProjectTasks(payload, project.id).length;
                return (
                  <NavLink
                    key={project.id}
                    to={`/project/${project.id}`}
                    className="flex items-center justify-between rounded-[22px] border border-[#E7DDD4] px-4 py-4 transition hover:border-[#EE6A3C]/30 hover:bg-[#FBF7F3]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[#1E2D2F]">{project.name}</p>
                      <p className="mt-1 text-sm text-[#6D5C50]">
                        {taskCount} active task{taskCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-[#9F7B63]" />
                  </NavLink>
                );
              })
            ) : (
              <EmptyState
                title="No projects yet"
                description="Create a project to start grouping tasks beyond Inbox."
              />
            )}
          </div>
        </div>

        <section className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">New project</p>
          <h3 className="mt-2 text-xl font-semibold text-[#1E2D2F]">Create a workspace lane</h3>
          <p className="mt-2 text-sm leading-6 text-[#6D5C50]">
            Projects sync directly to Android. Archive or delete them later from the project view.
          </p>
          <form onSubmit={submit} className="mt-5 space-y-3">
            <input
              value={projectName}
              onChange={event => setProjectName(event.target.value)}
              placeholder="Project name"
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            />
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-full bg-[#EE6A3C] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33]"
            >
              <Plus size={16} />
              Create project
            </button>
          </form>
        </section>
      </section>
    </div>
  );
}

function InboxPage({
  payload,
  onToggleTask,
}: {
  payload: SyncPayload;
  onToggleTask: (taskId: string) => void;
}) {
  const navigate = useNavigate();
  const tasks = getInboxTasks(payload);

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Inbox"
        title="Unsorted tasks"
        description="These tasks are not attached to a project yet. Open one to move it into a project or section."
      />
      <TaskGroup
        title="Inbox"
        tasks={tasks}
        emptyMessage="Inbox is clear."
        onToggleTask={onToggleTask}
        onOpenTask={taskId => navigate(`/task/${taskId}`)}
      />
    </div>
  );
}

function ProjectPage({
  payload,
  onCreateSection,
  onUpdateProject,
  onDeleteProject,
  onUpdateSection,
  onDeleteSection,
  onToggleTask,
  onOpenQuickAdd,
}: {
  payload: SyncPayload;
  onCreateSection: (projectId: string, name: string) => void;
  onUpdateProject: (projectId: string, updater: (project: Project) => Project) => void;
  onDeleteProject: (projectId: string) => void;
  onUpdateSection: (sectionId: string, updater: (section: Section) => Section) => void;
  onDeleteSection: (sectionId: string) => void;
  onToggleTask: (taskId: string) => void;
  onOpenQuickAdd: () => void;
}) {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [sectionName, setSectionName] = useState('');

  if (!projectId) {
    return <EmptyState title="Project not found" description="Select a project from Browse." />;
  }

  const project = getProjectById(payload, projectId);
  if (!project) {
    return <EmptyState title="Project not found" description="This project may have been deleted or archived elsewhere." />;
  }

  const currentProject = project;
  const tasks = getProjectTasks(payload, projectId);
  const sections = getProjectSections(payload, projectId);
  const unsectionedTasks = tasks.filter(task => !task.sectionId);

  function renameProject() {
    const nextName = window.prompt('Rename project', currentProject.name)?.trim();
    if (!nextName) return;
    onUpdateProject(currentProject.id, current => ({ ...current, name: nextName }));
  }

  function toggleArchiveProject() {
    onUpdateProject(currentProject.id, current => ({ ...current, archived: !current.archived }));
  }

  function removeProject() {
    const confirmed = window.confirm(
      `Delete "${currentProject.name}" and tombstone its tasks and sections? This will sync to Android.`
    );
    if (!confirmed) return;
    onDeleteProject(currentProject.id);
    navigate('/browse');
  }

  function submitSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onCreateSection(currentProject.id, sectionName);
    setSectionName('');
  }

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Project"
        title={currentProject.name}
        description="Manage tasks, sections, and project metadata. New tasks can be added from Quick add and assigned here."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={renameProject}
              className="rounded-full border border-[#E1D5CA] bg-white px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3]"
            >
              Rename
            </button>
            <button
              onClick={toggleArchiveProject}
              className="rounded-full border border-[#E1D5CA] bg-white px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3]"
            >
              {currentProject.archived ? 'Unarchive' : 'Archive'}
            </button>
            <button
              onClick={removeProject}
              className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-2 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1]"
            >
              Delete
            </button>
            <button
              onClick={onOpenQuickAdd}
              className="rounded-full bg-[#EE6A3C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d75e33]"
            >
              Quick add
            </button>
          </div>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
        <div className="space-y-4">
          <TaskGroup
            title="Loose tasks"
            subtitle="Tasks in this project without a section."
            tasks={unsectionedTasks}
            emptyMessage="No unsectioned tasks here."
            onToggleTask={onToggleTask}
            onOpenTask={taskId => navigate(`/task/${taskId}`)}
          />

          {sections.map(section => {
            const sectionTasks = tasks.filter(task => task.sectionId === section.id);
            return (
              <div key={section.id} className="space-y-3 rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1E2D2F]">{section.name}</h3>
                    <p className="text-sm text-[#6D5C50]">{sectionTasks.length} task{sectionTasks.length === 1 ? '' : 's'}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        const nextName = window.prompt('Rename section', section.name)?.trim();
                        if (!nextName) return;
                        onUpdateSection(section.id, current => ({ ...current, name: nextName }));
                      }}
                      className="rounded-full border border-[#E1D5CA] px-3 py-2 text-sm font-medium text-[#1E2D2F] transition hover:bg-[#FBF7F3]"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => {
                        const confirmed = window.confirm(`Delete section "${section.name}"? Tasks will move out of the section.`);
                        if (!confirmed) return;
                        onDeleteSection(section.id);
                      }}
                      className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-3 py-2 text-sm font-medium text-[#B64B28] transition hover:bg-[#FDE9E1]"
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <TaskListBlock
                  tasks={sectionTasks}
                  emptyMessage="No tasks in this section yet."
                  onToggleTask={onToggleTask}
                  onOpenTask={taskId => navigate(`/task/${taskId}`)}
                />
              </div>
            );
          })}
        </div>

        <section className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">Sections</p>
          <h3 className="mt-2 text-xl font-semibold text-[#1E2D2F]">Organize this project</h3>
          <p className="mt-2 text-sm leading-6 text-[#6D5C50]">
            Sections help break a project into swimlanes without changing the synced task model.
          </p>
          <form onSubmit={submitSection} className="mt-5 flex gap-3">
            <input
              value={sectionName}
              onChange={event => setSectionName(event.target.value)}
              placeholder="New section"
              className="flex-1 rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            />
            <button
              type="submit"
              className="rounded-full bg-[#EE6A3C] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33]"
            >
              Add
            </button>
          </form>

          <div className="mt-5 space-y-3">
            {sections.length ? (
              sections.map(section => {
                const sectionTaskCount = tasks.filter(task => task.sectionId === section.id).length;
                return (
                  <div key={section.id} className="rounded-[18px] border border-[#E7DDD4] bg-[#FBF7F3] px-4 py-3">
                    <p className="text-sm font-semibold text-[#1E2D2F]">{section.name}</p>
                    <p className="mt-1 text-sm text-[#6D5C50]">
                      {sectionTaskCount} task{sectionTaskCount === 1 ? '' : 's'}
                    </p>
                  </div>
                );
              })
            ) : (
              <EmptyState title="No sections yet" description="Add a section to break this project into parts." />
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function TaskDetailPage({
  payload,
  onSaveTask,
  onArchiveTask,
  onDeleteTask,
}: {
  payload: SyncPayload;
  onSaveTask: (taskId: string, updater: (task: Task) => Task) => void;
  onArchiveTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const { taskId } = useParams();
  const task = taskId ? getTaskById(payload, taskId) : undefined;

  if (!taskId || !task) {
    return <EmptyState title="Task not found" description="This task may have been deleted or archived elsewhere." />;
  }

  return (
    <TaskEditor
      key={task.id}
      payload={payload}
      task={task}
      onSaveTask={onSaveTask}
      onArchiveTask={onArchiveTask}
      onDeleteTask={onDeleteTask}
    />
  );
}

function TaskEditor({
  payload,
  task,
  onSaveTask,
  onArchiveTask,
  onDeleteTask,
}: {
  payload: SyncPayload;
  task: Task;
  onSaveTask: (taskId: string, updater: (task: Task) => Task) => void;
  onArchiveTask: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
}) {
  const navigate = useNavigate();
  const projects = getActiveProjects(payload, true);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [projectId, setProjectId] = useState<string>(task.projectId ?? '');
  const [sectionId, setSectionId] = useState<string>(task.sectionId ?? '');
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [allDay, setAllDay] = useState(task.allDay);
  const [dueAt, setDueAt] = useState(toInputValue(task.dueAt ?? null, task.allDay));
  const [deadlineEnabled, setDeadlineEnabled] = useState(Boolean(task.deadlineAt));
  const [deadlineAllDay, setDeadlineAllDay] = useState(task.deadlineAllDay ?? false);
  const [deadlineAt, setDeadlineAt] = useState(
    toInputValue(task.deadlineAt ?? null, task.deadlineAllDay ?? false)
  );
  const sectionOptions = projectId ? getProjectSections(payload, projectId) : [];

  function saveTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onSaveTask(task.id, current => ({
      ...current,
      title: trimmedTitle,
      description: description.trim(),
      projectId: projectId || null,
      sectionId: projectId ? sectionId || null : null,
      priority,
      allDay,
      dueAt: parseInputValue(dueAt, allDay),
      deadlineAt: deadlineEnabled ? parseInputValue(deadlineAt, deadlineAllDay) : null,
      deadlineAllDay: deadlineEnabled ? deadlineAllDay : false,
    }));
  }

  function deleteCurrentTask() {
    const confirmed = window.confirm(`Delete "${task.title}"? This will sync as a deletion tombstone.`);
    if (!confirmed) return;
    onDeleteTask(task.id);
    navigate(-1);
  }

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Task"
        title={task.title}
        description="Edit the task details that sync between Android and web."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onArchiveTask(task.id)}
              className="rounded-full border border-[#E1D5CA] bg-white px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3]"
            >
              {task.status === 'ARCHIVED' ? 'Unarchive' : 'Archive'}
            </button>
            <button
              onClick={deleteCurrentTask}
              className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-2 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1]"
            >
              Delete
            </button>
          </div>
        }
      />

      <form onSubmit={saveTask} className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-4 rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
          <Field label="Title">
            <input
              value={title}
              onChange={event => setTitle(event.target.value)}
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            />
          </Field>

          <Field label="Description">
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={6}
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            />
          </Field>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Project">
              <select
                value={projectId}
                onChange={event => {
                  setProjectId(event.target.value);
                  setSectionId('');
                }}
                className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
              >
                <option value="">Inbox</option>
                {projects.map(projectOption => (
                  <option key={projectOption.id} value={projectOption.id}>
                    {projectOption.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Section">
              <select
                value={sectionId}
                onChange={event => setSectionId(event.target.value)}
                disabled={!projectId}
                className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <option value="">No section</option>
                {sectionOptions.map(section => (
                  <option key={section.id} value={section.id}>
                    {section.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
          <Field label="Priority">
            <select
              value={priority}
              onChange={event => setPriority(event.target.value as Priority)}
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            >
              <option value="P1">P1 · Critical</option>
              <option value="P2">P2 · High</option>
              <option value="P3">P3 · Medium</option>
              <option value="P4">P4 · Low</option>
            </select>
          </Field>

          <label className="flex items-center gap-3 rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm font-medium text-[#1E2D2F]">
            <input
              type="checkbox"
              checked={allDay}
              onChange={event => setAllDay(event.target.checked)}
              className="h-4 w-4 accent-[#EE6A3C]"
            />
            Due date is all day
          </label>

          <Field label="Due date">
            <input
              type={allDay ? 'date' : 'datetime-local'}
              value={dueAt}
              onChange={event => setDueAt(event.target.value)}
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            />
          </Field>

          <label className="flex items-center gap-3 rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm font-medium text-[#1E2D2F]">
            <input
              type="checkbox"
              checked={deadlineEnabled}
              onChange={event => setDeadlineEnabled(event.target.checked)}
              className="h-4 w-4 accent-[#EE6A3C]"
            />
            Track a deadline separately
          </label>

          {deadlineEnabled ? (
            <>
              <label className="flex items-center gap-3 rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm font-medium text-[#1E2D2F]">
                <input
                  type="checkbox"
                  checked={deadlineAllDay}
                  onChange={event => setDeadlineAllDay(event.target.checked)}
                  className="h-4 w-4 accent-[#EE6A3C]"
                />
                Deadline is all day
              </label>
              <Field label="Deadline">
                <input
                  type={deadlineAllDay ? 'date' : 'datetime-local'}
                  value={deadlineAt}
                  onChange={event => setDeadlineAt(event.target.value)}
                  className="w-full rounded-[18px] border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
                />
              </Field>
            </>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-full bg-[#EE6A3C] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33]"
          >
            Save task
          </button>
        </section>
      </form>
    </div>
  );
}

function SettingsPage({
  cloudConfigured,
  cloudSession,
  lastSyncError,
  showCompletedToday,
  onToggleShowCompletedToday,
  onCloudSync,
  onDisconnectCloud,
  onResetCloudSync,
  onResetLocalCache,
  onImport,
  isSyncing,
  isResettingCloud,
  isResettingCache,
  lastCloudSyncAt,
}: {
  cloudConfigured: boolean;
  cloudSession: CloudSession | null;
  lastSyncError: string | null;
  showCompletedToday: boolean;
  onToggleShowCompletedToday: () => void;
  onCloudSync: () => void;
  onDisconnectCloud: () => void;
  onResetCloudSync: () => void;
  onResetLocalCache: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  isSyncing: boolean;
  isResettingCloud: boolean;
  isResettingCache: boolean;
  lastCloudSyncAt: number | null;
}) {
  const cloudStatus = getCloudStatus({
    cloudConfigured,
    cloudSession,
    lastSyncError,
    isSyncing,
    lastCloudSyncAt,
  });

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Settings"
        title="Web sync and workspace"
        description="Manage Google Drive sync, this browser's local workspace, and the display options that stay local to the web app."
      />

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">Cloud sync</p>
          <div className="mt-4 space-y-3">
            <InfoRow label="Status" value={cloudStatus.label} />
            <InfoRow label="Account" value={cloudSession?.email ?? 'No Google account connected in this tab'} />
            <InfoRow label="Last sync" value={lastCloudSyncAt ? formatDateTime(lastCloudSyncAt) : 'No recent sync'} />
            <p className="rounded-[18px] bg-[#FBF7F3] px-4 py-3 text-sm leading-6 text-[#6D5C50]">
              {cloudStatus.detail}
            </p>
            {lastSyncError ? (
              <p className="rounded-[18px] bg-[#FFF1EB] px-4 py-3 text-sm leading-6 text-[#A24628]">
                Last error: {lastSyncError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                onClick={onCloudSync}
                disabled={isSyncing || !cloudConfigured}
                className="rounded-full bg-[#EE6A3C] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSyncing ? 'Syncing...' : 'Sync now'}
              </button>
              {cloudSession ? (
                <button
                  onClick={onDisconnectCloud}
                  className="rounded-full border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-white"
                >
                  Disconnect
                </button>
              ) : null}
              <button
                onClick={onResetCloudSync}
                disabled={isResettingCloud || !cloudConfigured}
                className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-3 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isResettingCloud ? 'Resetting cloud sync...' : 'Reset cloud sync'}
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">Workspace recovery</p>
          <div className="mt-4 space-y-3">
            <p className="text-sm leading-6 text-[#6D5C50]">
              Reset the local web cache if IndexedDB gets stuck or import a JSON backup into the current workspace.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onResetLocalCache}
                disabled={isResettingCache}
                className="rounded-full border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isResettingCache ? 'Resetting web cache...' : 'Reset web cache'}
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#E1D5CA] bg-[#FBF7F3] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-white">
                <Import size={16} />
                Import JSON
                <input type="file" accept=".json" className="hidden" onChange={onImport} />
              </label>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">Display</p>
        <label className="mt-4 flex items-center justify-between gap-4 rounded-[20px] border border-[#E7DDD4] bg-[#FBF7F3] px-4 py-4">
          <div>
            <p className="text-sm font-semibold text-[#1E2D2F]">Show completed tasks in Today</p>
            <p className="mt-1 text-sm text-[#6D5C50]">This toggle is local to the web app and does not affect Android.</p>
          </div>
          <input
            type="checkbox"
            checked={showCompletedToday}
            onChange={onToggleShowCompletedToday}
            className="h-5 w-5 accent-[#EE6A3C]"
          />
        </label>
      </section>
    </div>
  );
}

function QuickAddDialog({
  payload,
  onClose,
  onCreateTask,
}: {
  payload: SyncPayload;
  onClose: () => void;
  onCreateTask: (draft: TaskDraft) => Promise<string | null>;
}) {
  const navigate = useNavigate();
  const projects = getActiveProjects(payload);
  const [draft, setDraft] = useState<TaskDraft>(createTaskDraft());
  const [isSaving, setIsSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    try {
      const taskId = await onCreateTask({
        ...draft,
        title: draft.title.trim(),
        description: draft.description.trim(),
      });
      if (taskId) {
        onClose();
        navigate(`/task/${taskId}`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  const availableSections = draft.projectId ? getProjectSections(payload, draft.projectId) : [];

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#221E1C]/40 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[32px] border border-[#E7DDD4] bg-[#F7F4F0] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">Quick add</p>
            <h3 className="mt-2 text-2xl font-semibold text-[#1E2D2F]">Create a task</h3>
          </div>
          <button onClick={onClose} className="rounded-full border border-[#E1D5CA] bg-white p-2 text-[#1E2D2F] transition hover:bg-[#FBF7F3]">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-5 grid gap-4 md:grid-cols-2">
          <div className="space-y-4 md:col-span-2">
            <Field label="Title">
              <input
                autoFocus
                value={draft.title}
                onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
                placeholder="What needs doing?"
                className="w-full rounded-[18px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
              />
            </Field>
            <Field label="Description">
              <textarea
                value={draft.description}
                onChange={event => setDraft(current => ({ ...current, description: event.target.value }))}
                rows={4}
                className="w-full rounded-[18px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
              />
            </Field>
          </div>

          <Field label="Project">
            <select
              value={draft.projectId ?? ''}
              onChange={event =>
                setDraft(current => ({
                  ...current,
                  projectId: event.target.value || null,
                  sectionId: null,
                }))
              }
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            >
              <option value="">Inbox</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Section">
            <select
              value={draft.sectionId ?? ''}
              onChange={event => setDraft(current => ({ ...current, sectionId: event.target.value || null }))}
              disabled={!draft.projectId}
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">No section</option>
              {availableSections.map(section => (
                <option key={section.id} value={section.id}>
                  {section.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Priority">
            <select
              value={draft.priority}
              onChange={event => setDraft(current => ({ ...current, priority: event.target.value as Priority }))}
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            >
              <option value="P1">P1 · Critical</option>
              <option value="P2">P2 · High</option>
              <option value="P3">P3 · Medium</option>
              <option value="P4">P4 · Low</option>
            </select>
          </Field>

          <Field label="Due date">
            <input
              type={draft.allDay ? 'date' : 'datetime-local'}
              value={toInputValue(draft.dueAt, draft.allDay)}
              onChange={event => setDraft(current => ({ ...current, dueAt: parseInputValue(event.target.value, current.allDay) }))}
              className="w-full rounded-[18px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            />
          </Field>

          <div className="md:col-span-2">
            <label className="flex items-center gap-3 rounded-[18px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm font-medium text-[#1E2D2F]">
              <input
                type="checkbox"
                checked={draft.allDay}
                onChange={event => setDraft(current => ({ ...current, allDay: event.target.checked }))}
                className="h-4 w-4 accent-[#EE6A3C]"
              />
              Due date is all day
            </label>
          </div>

          <div className="md:col-span-2 flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#E1D5CA] bg-white px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-full bg-[#EE6A3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? 'Creating...' : 'Create task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TaskGroup({
  title,
  subtitle,
  tasks,
  emptyMessage,
  onToggleTask,
  onOpenTask,
}: {
  title: string;
  subtitle?: string;
  tasks: Task[];
  emptyMessage: string;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <section className="rounded-[28px] border border-[#E1D5CA] bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-xl font-semibold text-[#1E2D2F]">{title}</h3>
        {subtitle ? <p className="mt-1 text-sm text-[#6D5C50]">{subtitle}</p> : null}
      </div>
      <TaskListBlock
        tasks={tasks}
        emptyMessage={emptyMessage}
        onToggleTask={onToggleTask}
        onOpenTask={onOpenTask}
      />
    </section>
  );
}

function TaskListBlock({
  tasks,
  emptyMessage,
  onToggleTask,
  onOpenTask,
}: {
  tasks: Task[];
  emptyMessage: string;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  if (!tasks.length) {
    return <p className="rounded-[20px] bg-[#FBF7F3] px-4 py-5 text-sm text-[#6D5C50]">{emptyMessage}</p>;
  }

  return (
    <div className="space-y-3">
      {tasks.map(task => (
        <TaskRow key={task.id} task={task} onToggleTask={onToggleTask} onOpenTask={onOpenTask} />
      ))}
    </div>
  );
}

function TaskRow({
  task,
  onToggleTask,
  onOpenTask,
}: {
  task: Task;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const completed = task.status === 'COMPLETED';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpenTask(task.id)}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpenTask(task.id);
        }
      }}
      className="flex items-start gap-4 rounded-[22px] border border-[#E7DDD4] bg-[#FBF7F3] px-4 py-4 text-left transition hover:border-[#EE6A3C]/30 hover:bg-white"
    >
      <button
        onClick={event => {
          event.stopPropagation();
          onToggleTask(task.id);
        }}
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition ${completed
          ? 'border-[#EE6A3C] bg-[#EE6A3C] text-white'
          : 'border-[#D8C8BC] bg-white text-transparent hover:border-[#EE6A3C]'
          }`}
      >
        <Check size={14} />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className={`text-sm font-semibold ${completed ? 'text-[#8B7C71] line-through' : 'text-[#1E2D2F]'}`}>{task.title}</p>
          <PriorityPill priority={task.priority} />
        </div>
        {task.description ? (
          <p className={`mt-2 text-sm leading-6 ${completed ? 'text-[#9F9288]' : 'text-[#6D5C50]'}`}>{task.description}</p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-[#7A675A]">
          {task.dueAt ? <MetaPill label={formatTaskDate(task.dueAt, task.allDay)} /> : <MetaPill label="No due date" />}
          {task.deadlineAt ? <MetaPill label={`Deadline ${formatTaskDate(task.deadlineAt, task.deadlineAllDay ?? false)}`} /> : null}
          {task.parentTaskId ? <MetaPill label="Subtask" /> : null}
        </div>
      </div>
      <ChevronRight size={16} className="mt-1 shrink-0 text-[#A18B7A]" />
    </div>
  );
}

function HeroCard({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="rounded-[32px] bg-[#1E2D2F] px-6 py-6 text-white shadow-[0_20px_50px_rgba(30,45,47,0.18)] md:px-8">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[#F2D0A4]">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-semibold">{title}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#D7C9BF]">{description}</p>
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-2">
      <span className="text-sm font-semibold text-[#1E2D2F]">{label}</span>
      {children}
    </label>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#D9CABC] bg-white px-6 py-10 text-center shadow-sm">
      <p className="text-lg font-semibold text-[#1E2D2F]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#6D5C50]">{description}</p>
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F7F4F0] px-6">
      <div className="rounded-[28px] border border-[#E1D5CA] bg-white px-6 py-5 text-sm font-medium text-[#6D5C50] shadow-sm">
        {label}
      </div>
    </div>
  );
}

function RailLink({
  to,
  icon: Icon,
  label,
  compact = false,
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
  compact?: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-[20px] px-4 py-3 text-sm font-medium transition ${isActive
          ? 'bg-white text-[#1E2D2F] shadow-sm'
          : 'text-[#6D5C50] hover:bg-white/70 hover:text-[#1E2D2F]'
        } ${compact ? 'py-2.5' : ''}`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

function BottomLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string }>;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2 text-[11px] font-semibold transition ${isActive
          ? 'bg-white text-[#EE6A3C]'
          : 'text-[#7A675A]'
        }`
      }
    >
      <Icon size={18} />
      <span>{label}</span>
    </NavLink>
  );
}

function PriorityPill({ priority }: { priority: Priority }) {
  return (
    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${priorityClasses(priority)}`}>
      {priority}
    </span>
  );
}

function MetaPill({ label }: { label: string }) {
  return <span className="rounded-full bg-white px-2 py-1">{label}</span>;
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#E7DDD4] bg-[#FBF7F3] px-4 py-3">
      <span className="text-sm font-medium text-[#6D5C50]">{label}</span>
      <span className="text-sm font-semibold text-[#1E2D2F]">{value}</span>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: CloudStatusTone }) {
  return (
    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${statusPillClasses(tone)}`}>
      {label}
    </span>
  );
}

function bannerClasses(tone: Banner['tone']): string {
  switch (tone) {
    case 'success':
      return 'border border-[#CDE3D4] bg-[#F1F8F3] text-[#24553A]';
    case 'error':
      return 'border border-[#F1C7B5] bg-[#FFF1EB] text-[#A24628]';
    case 'info':
    default:
      return 'border border-[#D6E4EA] bg-[#F1F7F9] text-[#315566]';
  }
}

function priorityClasses(priority: Priority): string {
  switch (priority) {
    case 'P1':
      return 'bg-[#FCE4DF] text-[#B23A2C]';
    case 'P2':
      return 'bg-[#FFE7DA] text-[#B85A23]';
    case 'P3':
      return 'bg-[#E7F0FA] text-[#396C97]';
    case 'P4':
    default:
      return 'bg-[#EFE6DD] text-[#6D5C50]';
  }
}

function statusPillClasses(tone: CloudStatusTone): string {
  switch (tone) {
    case 'ready':
      return 'bg-[#F1F8F3] text-[#24553A]';
    case 'warning':
      return 'bg-[#FFF1EB] text-[#A24628]';
    case 'idle':
      return 'bg-[#F1F7F9] text-[#315566]';
    case 'muted':
    default:
      return 'bg-[#EFE6DD] text-[#6D5C50]';
  }
}

function getCloudStatus({
  cloudConfigured,
  cloudSession,
  lastSyncError,
  isSyncing,
  lastCloudSyncAt,
}: {
  cloudConfigured: boolean;
  cloudSession: CloudSession | null;
  lastSyncError: string | null;
  isSyncing: boolean;
  lastCloudSyncAt: number | null;
}): { label: string; detail: string; tone: CloudStatusTone } {
  if (!cloudConfigured) {
    return {
      label: 'Unavailable',
      detail: 'This deployment is missing its Google client ID, so cloud sync is disabled until the site is redeployed with VITE_GOOGLE_CLIENT_ID.',
      tone: 'warning',
    };
  }

  if (isSyncing) {
    return {
      label: 'Syncing',
      detail: 'Emberlist is merging your local workspace with the latest Google Drive appData snapshot right now.',
      tone: 'idle',
    };
  }

  if (lastSyncError) {
    return {
      label: 'Attention',
      detail: 'The last cloud sync attempt failed. Review the last error below and retry after fixing the issue.',
      tone: 'warning',
    };
  }

  if (cloudSession?.email) {
    return {
      label: 'Connected',
      detail: lastCloudSyncAt
        ? `Signed in as ${cloudSession.email}. Last successful sync was ${formatDateTime(lastCloudSyncAt)}.`
        : `Signed in as ${cloudSession.email}. Run Sync now whenever you want to push or pull changes.`,
      tone: 'ready',
    };
  }

  if (lastCloudSyncAt) {
    return {
      label: 'Ready',
      detail: `Cloud sync is configured. The last successful sync was ${formatDateTime(lastCloudSyncAt)}. Google may ask you to sign in again in this browser.`,
      tone: 'idle',
    };
  }

  return {
    label: 'Ready',
    detail: 'Cloud sync is configured. The first sync in this browser session will prompt for Google sign-in if needed.',
    tone: 'muted',
  };
}

function getRouteTitle(pathname: string, payload: SyncPayload): string {
  if (pathname.startsWith('/today')) return 'Today';
  if (pathname.startsWith('/upcoming')) return 'Upcoming';
  if (pathname.startsWith('/search')) return 'Search';
  if (pathname.startsWith('/browse')) return 'Browse';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/inbox')) return 'Inbox';
  if (pathname.startsWith('/project/')) {
    const projectId = pathname.split('/')[2];
    return getProjectById(payload, projectId)?.name ?? 'Project';
  }
  if (pathname.startsWith('/task/')) {
    const taskId = pathname.split('/')[2];
    return getTaskById(payload, taskId)?.title ?? 'Task';
  }
  return 'Workspace';
}

function formatTaskDate(timestamp: number, allDay: boolean): string {
  if (isToday(timestamp)) {
    return allDay ? 'Today' : `Today · ${format(timestamp, 'p')}`;
  }
  if (isTomorrow(timestamp)) {
    return allDay ? 'Tomorrow' : `Tomorrow · ${format(timestamp, 'p')}`;
  }
  if (isYesterday(timestamp)) {
    return allDay ? 'Yesterday' : `Yesterday · ${format(timestamp, 'p')}`;
  }
  return allDay ? format(timestamp, 'MMM d') : format(timestamp, 'MMM d · p');
}

function formatDateTime(timestamp: number): string {
  return format(timestamp, 'MMM d, h:mm a');
}

function toInputValue(timestamp: number | null, allDay: boolean): string {
  if (!timestamp) return '';
  return allDay ? format(timestamp, 'yyyy-MM-dd') : format(timestamp, "yyyy-MM-dd'T'HH:mm");
}

function parseInputValue(value: string, allDay: boolean): number | null {
  if (!value) return null;
  if (allDay) {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return null;
    return startOfDay(new Date(year, month - 1, day)).getTime();
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === 'true' || raw === '1' || raw === JSON.stringify(true);
}

function readStoredNumber(key: string): number | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStoredCloudSession(): CloudSession | null {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem('emberlist.cloudSession');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { email?: string | null; name?: string | null };
    return {
      email: typeof parsed.email === 'string' ? parsed.email : null,
      name: typeof parsed.name === 'string' ? parsed.name : null,
    };
  } catch {
    return null;
  }
}

function writeStoredCloudSession(session: CloudSession | null) {
  if (typeof window === 'undefined') return;
  if (!session) {
    window.localStorage.removeItem('emberlist.cloudSession');
    return;
  }
  window.localStorage.setItem('emberlist.cloudSession', JSON.stringify(session));
}
