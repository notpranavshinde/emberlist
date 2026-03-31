import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ChangeEvent, ComponentType, FormEvent, ReactNode } from 'react';
import {
  Bell,
  Calendar,
  Check,
  Circle,
  ChevronRight,
  Cloud,
  Folder,
  Home,
  Import,
  Layers3,
  ListTodo,
  PanelLeft,
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
import { addDays, endOfDay, format, isToday, isTomorrow, isYesterday, startOfDay } from 'date-fns';
import { RecoveryScreen } from './components/RecoveryScreen';
import { extractBulkQuickAddLines, shouldPromptBulkQuickAdd } from './lib/bulkQuickAdd';
import { db } from './lib/db';
import { parseQuickAdd, type QuickAddResult, type ReminderSpec as ParsedReminderSpec } from './lib/quickParser';
import { ensureSyncPayload } from './lib/syncPayload';
import { DriveSyncService, type CloudSession } from './lib/syncService';
import { SyncEngine } from './lib/syncEngine';
import {
  archiveTask,
  createProject,
  createSection,
  createTask,
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
  type TaskReminderDraft,
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
type QuickAddContext = {
  defaultProjectId: string | null;
  defaultDueToday: boolean;
};

function App() {
  const [payload, setPayload] = useState<SyncPayload | null>(null);
  const [bootState, setBootState] = useState<BootState>('loading');
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [hasPendingLocalChanges, setHasPendingLocalChanges] = useState(false);
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
  const cloudSessionRef = useRef<CloudSession | null>(cloudSession);
  const isSyncingRef = useRef(false);
  const isOnlineRef = useRef(isOnline);
  const hasPendingLocalChangesRef = useRef(hasPendingLocalChanges);
  const followUpSyncRequestedRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const backoffTimerRef = useRef<number | null>(null);
  const backoffAttemptRef = useRef(0);
  const backoffUntilRef = useRef<number | null>(null);
  const hasAutoSyncedOnLoadRef = useRef(false);
  const syncService = useMemo(
    () => (GOOGLE_CLIENT_ID ? new DriveSyncService(GOOGLE_CLIENT_ID) : null),
    []
  );

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    cloudSessionRef.current = cloudSession;
  }, [cloudSession]);

  useEffect(() => {
    isSyncingRef.current = isSyncing;
  }, [isSyncing]);

  useEffect(() => {
    isOnlineRef.current = isOnline;
  }, [isOnline]);

  useEffect(() => {
    hasPendingLocalChangesRef.current = hasPendingLocalChanges;
  }, [hasPendingLocalChanges]);

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

  function clearDebounceTimer() {
    if (debounceTimerRef.current !== null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }

  function clearBackoffTimer() {
    if (backoffTimerRef.current !== null) {
      window.clearTimeout(backoffTimerRef.current);
      backoffTimerRef.current = null;
    }
  }

  async function runCloudSync({
    interactiveAuth,
    automatic,
  }: {
    interactiveAuth: boolean;
    automatic: boolean;
  }) {
    if (!syncService) {
      if (!automatic) {
        const message = 'Cloud sync is not configured for this deployment. Set VITE_GOOGLE_CLIENT_ID and redeploy.';
        setLastSyncError(message);
        setBanner({ tone: 'error', message });
      }
      return;
    }

    if (automatic && !cloudSessionRef.current) return;
    if (!interactiveAuth && !isOnlineRef.current) return;

    const backoffUntil = backoffUntilRef.current;
    if (automatic && backoffUntil !== null && Date.now() < backoffUntil) {
      return;
    }

    if (isSyncingRef.current) {
      followUpSyncRequestedRef.current = true;
      return;
    }

    clearDebounceTimer();
    clearBackoffTimer();
    setIsSyncing(true);
    setLastSyncError(null);

    try {
      const mergedPayload = await syncService.sync({ interactiveAuth });
      await persistPayload(mergedPayload, false);
      setLastCloudSyncAt(Date.now());
      setCloudSession(syncService.getSession());
      setHasPendingLocalChanges(false);
      backoffAttemptRef.current = 0;
      backoffUntilRef.current = null;
      if (!automatic) {
        setBanner({ tone: 'success', message: 'Cloud sync completed.' });
      }
    } catch (error) {
      console.error('Cloud sync failed', error);
      const message = error instanceof Error ? error.message : 'Cloud sync failed.';
      setLastSyncError(message);
      if (!automatic) {
        setBanner({ tone: 'error', message });
      } else {
        const delayMs = Math.min(5 * 60_000, 30_000 * 2 ** backoffAttemptRef.current);
        backoffAttemptRef.current += 1;
        backoffUntilRef.current = Date.now() + delayMs;
        backoffTimerRef.current = window.setTimeout(() => {
          void runCloudSync({ interactiveAuth: false, automatic: true });
        }, delayMs);
      }
    } finally {
      setIsSyncing(false);
      if (followUpSyncRequestedRef.current && isOnlineRef.current) {
        followUpSyncRequestedRef.current = false;
        clearDebounceTimer();
        debounceTimerRef.current = window.setTimeout(() => {
          void runCloudSync({ interactiveAuth: false, automatic: true });
        }, 5_000);
      }
    }
  }

  async function persistPayload(nextPayload: SyncPayload, markDirty: boolean = false) {
    await db.savePayload(nextPayload);
    payloadRef.current = nextPayload;
    setPayload(nextPayload);
    if (markDirty) {
      setHasPendingLocalChanges(true);
      if (isSyncingRef.current) {
        followUpSyncRequestedRef.current = true;
      } else if (isOnlineRef.current && syncService && cloudSessionRef.current) {
        clearDebounceTimer();
        debounceTimerRef.current = window.setTimeout(() => {
          void runCloudSync({ interactiveAuth: false, automatic: true });
        }, 5_000);
      }
    }
  }

  async function applyPayloadUpdate(
    updater: (current: SyncPayload) => SyncPayload
  ): Promise<SyncPayload | null> {
    const current = payloadRef.current;
    if (!current) return null;
    const nextPayload = updater(current);
    await persistPayload(nextPayload, true);
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
      await persistPayload(mergedPayload, true);
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
    await runCloudSync({ interactiveAuth: true, automatic: false });
    setBootState('ready');
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
      setLastSyncError(null);
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
    await persistPayload(nextPayload, true);
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

  useEffect(() => {
    if (bootState !== 'ready' || !syncService || !cloudSession || hasAutoSyncedOnLoadRef.current) return;
    hasAutoSyncedOnLoadRef.current = true;
    void runCloudSync({ interactiveAuth: false, automatic: true });
  }, [bootState, cloudSession, syncService]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      void runCloudSync({ interactiveAuth: false, automatic: true });
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [cloudSession, syncService]);

  useEffect(() => {
    const handleFocus = () => {
      void runCloudSync({ interactiveAuth: false, automatic: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        void runCloudSync({ interactiveAuth: false, automatic: true });
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [cloudSession, syncService]);

  useEffect(() => {
    if (!syncService || !cloudSession) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== 'visible' || !navigator.onLine) return;
      void runCloudSync({ interactiveAuth: false, automatic: true });
    }, 5 * 60_000);

    return () => window.clearInterval(intervalId);
  }, [cloudSession, syncService]);

  useEffect(() => {
    return () => {
      clearDebounceTimer();
      clearBackoffTimer();
    };
  }, []);

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
        hasPendingLocalChanges={hasPendingLocalChanges}
        isOnline={isOnline}
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
  hasPendingLocalChanges: boolean;
  isOnline: boolean;
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
  hasPendingLocalChanges,
  isOnline,
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
  const todayStartMs = useTodayStartMs();
  const todayViewData = useMemo(
    () => getTodayViewData(payload, todayStartMs, endOfDay(todayStartMs).getTime()),
    [payload, todayStartMs]
  );
  const title = getRouteTitle(location.pathname, payload);
  const projects = getActiveProjects(payload);
  const favoriteProjects = projects.filter(project => project.favorite);
  const regularProjects = projects.filter(project => !project.favorite);
  const noDueCount = payload.tasks.filter(task => !task.deletedAt && task.status === 'OPEN' && task.dueAt === null).length;
  const cloudStatus = getCloudStatus({
    cloudConfigured,
    cloudSession,
    lastSyncError,
    hasPendingLocalChanges,
    isOnline,
    isSyncing,
    lastCloudSyncAt,
  });
  const workspaceIdentity = getWorkspaceIdentity(cloudSession);
  const quickAddContext = useMemo(() => getQuickAddContext(location.pathname, payload), [location.pathname, payload]);

  return (
    <div className="min-h-screen bg-[#faf8f6] text-[#202020]">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside className="hidden w-[300px] shrink-0 border-r border-[#ece7e3] bg-[#fdfcfb] px-3 py-3 md:flex md:flex-col">
          <div className="flex items-center justify-between rounded-[16px] px-2 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4ea0d8] text-sm font-semibold text-white">
                {workspaceIdentity.initial}
              </div>
              <div className="flex items-center gap-1 text-sm font-semibold text-[#2b2b2b]">
                <span>{workspaceIdentity.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-[#6f6b66]">
              <button className="rounded-md p-2 transition hover:bg-[#f3efeb]" aria-label="Notifications">
                <Bell size={16} />
              </button>
              <button className="rounded-md p-2 transition hover:bg-[#f3efeb]" aria-label="Display options">
                <PanelLeft size={16} />
              </button>
            </div>
          </div>

          <button
            onClick={onOpenQuickAdd}
            className="mt-3 flex items-center gap-2 rounded-[10px] px-3 py-2 text-sm font-semibold text-[#dc4c3e] transition hover:bg-[#fff1ed]"
          >
            <Plus size={16} />
            <span>Add task</span>
          </button>

          <nav className="mt-3 space-y-0.5">
            <RailLink to="/search" icon={Search} label="Search" />
            <RailLink to="/inbox" icon={ListTodo} label="Inbox" count={getInboxTasks(payload).length} />
            <RailLink to="/today" icon={Home} label="Today" count={todayViewData.overdue.length + todayViewData.today.length} />
            <RailLink to="/upcoming" icon={Calendar} label="Upcoming" />
            <RailLink to="/browse" icon={Layers3} label="Browse" />
            <RailLink to="/settings" icon={Settings} label="Settings" />
          </nav>

          <div className="mt-8">
            <p className="px-3 text-xs font-semibold text-[#7e7a76]">Favorites</p>
            <div className="mt-2 space-y-0.5">
              <RailLink to="/search/no-due" icon={Circle} label="Tasks without due dates" count={noDueCount} compact />
              {favoriteProjects.map(project => (
                <RailLink
                  key={project.id}
                  to={`/project/${project.id}`}
                  icon={Folder}
                  label={project.name}
                  count={getProjectTasks(payload, project.id).length}
                  compact
                  tint={project.color}
                />
              ))}
            </div>
          </div>

          <div className="mt-8 flex items-center justify-between px-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#5f5b57]">My Projects</p>
              <span className="rounded bg-[#f1ece7] px-1.5 py-0.5 text-[10px] font-semibold text-[#7e7a76]">
                USED: {projects.filter(project => !project.archived).length}/5
              </span>
            </div>
          </div>
          <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto">
            {regularProjects.map(project => (
              <RailLink
                key={project.id}
                to={`/project/${project.id}`}
                icon={Folder}
                label={project.name}
                count={getProjectTasks(payload, project.id).length}
                compact
                tint={project.color}
              />
            ))}
          </div>

          <div className="mt-4 rounded-[18px] border border-[#ece7e3] bg-white px-3 py-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#2b2b2b]">Cloud sync</p>
              <StatusPill label={cloudStatus.label} tone={cloudStatus.tone} />
            </div>
            <p className="mt-2 text-xs leading-5 text-[#7a746d]">
              {cloudSession?.email ?? 'No Google account connected in this tab'}
            </p>
            <button
              onClick={onCloudSync}
              disabled={isSyncing || !cloudConfigured}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-full bg-[#dc4c3e] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c84335] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
              <span>{isSyncing ? 'Syncing...' : 'Sync now'}</span>
            </button>
            {cloudSession ? (
              <button
                onClick={onDisconnectCloud}
                className="mt-2 w-full rounded-full border border-[#ece7e3] bg-[#faf8f6] px-4 py-2.5 text-sm font-semibold text-[#2b2b2b] transition hover:bg-white"
              >
                Disconnect
              </button>
            ) : null}
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-[#ece7e3] bg-[#faf8f6]/95 px-4 py-4 backdrop-blur md:px-8">
            <div className="mx-auto flex w-full max-w-[760px] items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9d6b54] md:hidden">Emberlist</p>
                <h2 className="text-2xl font-semibold text-[#202020]">{title}</h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCloudSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2 rounded-full border border-[#ece7e3] bg-white px-4 py-2 text-sm font-semibold text-[#2b2b2b] transition hover:bg-[#f8f5f2] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSyncing ? <RefreshCw size={16} className="animate-spin" /> : <Cloud size={16} />}
                  <span className="hidden sm:inline">{isSyncing ? 'Syncing...' : 'Sync'}</span>
                </button>
                <button
                  onClick={onOpenQuickAdd}
                  className="flex items-center gap-2 rounded-full bg-[#dc4c3e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c84335]"
                >
                  <Plus size={16} />
                  <span className="hidden sm:inline">Quick add</span>
                </button>
              </div>
            </div>
            {banner ? (
              <div className={`mx-auto mt-4 flex w-full max-w-[760px] items-start justify-between gap-3 rounded-[16px] px-4 py-3 text-sm ${bannerClasses(banner.tone)}`}>
                <p>{banner.message}</p>
                <button onClick={onDismissBanner} className="rounded-full p-1 transition hover:bg-black/5" aria-label="Dismiss status message">
                  <X size={16} />
                </button>
              </div>
            ) : null}
          </header>

          <main className="flex-1 px-4 pb-24 pt-6 md:px-8 md:pb-8">
            <div className="mx-auto w-full max-w-[760px]">
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
                path="/search/no-due"
                element={<SearchPage payload={payload} onToggleTask={onToggleTask} forcedFilter="NO_DUE" />}
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
                    hasPendingLocalChanges={hasPendingLocalChanges}
                    isOnline={isOnline}
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
            </div>
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
        <QuickAddDialog
          payload={payload}
          context={quickAddContext}
          onClose={onCloseQuickAdd}
          onCreateTask={onCreateTask}
        />
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
  const todayStartMs = useTodayStartMs();
  const data = useMemo(
    () => getTodayViewData(payload, todayStartMs, endOfDay(todayStartMs).getTime()),
    [payload, todayStartMs]
  );

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
        payload={payload}
        todayStartMs={todayStartMs}
        tasks={data.overdue}
        emptyMessage="Nothing overdue."
        onToggleTask={onToggleTask}
        onOpenTask={taskId => navigate(`/task/${taskId}`)}
      />

      <TaskGroup
        title="Due today"
        subtitle="Tasks scheduled for today."
        payload={payload}
        todayStartMs={todayStartMs}
        tasks={data.today}
        emptyMessage="No tasks due today."
        onToggleTask={onToggleTask}
        onOpenTask={taskId => navigate(`/task/${taskId}`)}
      />

      {showCompletedToday ? (
        <TaskGroup
          title="Completed today"
          subtitle="Recently finished work."
          payload={payload}
          todayStartMs={todayStartMs}
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
  const todayStartMs = useTodayStartMs();
  const todayData = useMemo(
    () => getTodayViewData(payload, todayStartMs, endOfDay(todayStartMs).getTime()),
    [payload, todayStartMs]
  );
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
          payload={payload}
          todayStartMs={todayStartMs}
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
            payload={payload}
            todayStartMs={todayStartMs}
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
  forcedFilter,
}: {
  payload: SyncPayload;
  onToggleTask: (taskId: string) => void;
  forcedFilter?: SearchFilter;
}) {
  const navigate = useNavigate();
  const todayStartMs = useTodayStartMs();
  const [query, setQuery] = useState('');
  const [userFilters, setUserFilters] = useState<Set<SearchFilter>>(new Set());
  const deferredQuery = useDeferredValue(query);
  const filters = useMemo(() => {
    if (forcedFilter) {
      const next = new Set<SearchFilter>([forcedFilter]);
      userFilters.forEach(filter => {
        if (filter !== 'ALL' && filter !== forcedFilter) {
          next.add(filter);
        }
      });
      return next;
    }

    if (userFilters.size === 0) {
      return new Set<SearchFilter>(['ALL']);
    }

    const next = new Set<SearchFilter>();
    userFilters.forEach(filter => {
      if (filter !== 'ALL') {
        next.add(filter);
      }
    });
    return next.size ? next : new Set<SearchFilter>(['ALL']);
  }, [forcedFilter, userFilters]);
  const results = useMemo(
    () => searchTasks(payload, deferredQuery, filters),
    [deferredQuery, filters, payload]
  );

  function toggleFilter(filter: SearchFilter) {
    if (forcedFilter && filter === forcedFilter) return;

    setUserFilters(current => {
      const next = new Set(current);
      if (filter === 'ALL') {
        return new Set();
      }

      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }

      return next;
    });
  }

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Search"
        title={forcedFilter === 'NO_DUE' ? 'Tasks without due dates' : 'Find tasks'}
        description={
          forcedFilter === 'NO_DUE'
            ? 'This is a real filtered view of open tasks that do not have a due date yet.'
            : 'Search titles, descriptions, project names, and sections. Combine filters when you need to narrow the list fast.'
        }
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
            const active = filter.value === 'ALL'
              ? !forcedFilter && userFilters.size === 0
              : filters.has(filter.value);
            return (
              <button
                key={filter.value}
                onClick={() => toggleFilter(filter.value)}
                disabled={forcedFilter === filter.value}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${active
                  ? 'bg-[#EE6A3C] text-white'
                  : 'border border-[#E1D5CA] bg-[#FBF7F3] text-[#6D5C50] hover:bg-white'
                  } ${forcedFilter === filter.value ? 'cursor-default opacity-90' : ''}`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      <TaskGroup
        title={`${results.length} result${results.length === 1 ? '' : 's'}`}
        payload={payload}
        todayStartMs={todayStartMs}
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
  const todayStartMs = useTodayStartMs();
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
        payload={payload}
        todayStartMs={todayStartMs}
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
  const todayStartMs = useTodayStartMs();
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
            payload={payload}
            todayStartMs={todayStartMs}
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
                  payload={payload}
                  todayStartMs={todayStartMs}
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
  hasPendingLocalChanges,
  isOnline,
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
  hasPendingLocalChanges: boolean;
  isOnline: boolean;
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
    hasPendingLocalChanges,
    isOnline,
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
  context,
  onClose,
  onCreateTask,
}: {
  payload: SyncPayload;
  context: QuickAddContext;
  onClose: () => void;
  onCreateTask: (draft: TaskDraft) => Promise<string | null>;
}) {
  const navigate = useNavigate();
  const todayStartMs = useTodayStartMs();
  const [input, setInput] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [showBulkChoices, setShowBulkChoices] = useState(false);
  const bulkLines = useMemo(() => extractBulkQuickAddLines(input), [input]);
  const parsedPreview = useMemo(() => parseQuickAdd(input), [input]);
  const hasInput = input.trim().length > 0;
  const previewDraft = useMemo(
    () => buildDraftFromParsed(payload, parsedPreview, description, context, todayStartMs),
    [context, description, parsedPreview, payload, todayStartMs]
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!hasInput) return;
    if (shouldPromptBulkQuickAdd(input)) {
      setShowBulkChoices(true);
      return;
    }

    setIsSaving(true);
    try {
      const taskId = await onCreateTask(previewDraft);
      if (taskId) {
        onClose();
        navigate(`/task/${taskId}`);
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function createBulkTasks(mode: 'single' | 'many') {
    setIsSaving(true);
    try {
      if (mode === 'single') {
        const mergedDraft = createMergedBulkDraft(payload, bulkLines, description, context, todayStartMs);
        const taskId = await onCreateTask(mergedDraft);
        if (taskId) {
          onClose();
          navigate(`/task/${taskId}`);
        }
        return;
      }

      for (const line of bulkLines) {
        const parsedLine = parseQuickAdd(line);
        const draft = buildDraftFromParsed(payload, parsedLine, description, context, todayStartMs);
        await onCreateTask(draft);
      }
      onClose();
    } finally {
      setIsSaving(false);
      setShowBulkChoices(false);
    }
  }

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

        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Task parser">
            <textarea
              autoFocus
              value={input}
              onChange={event => {
                setInput(event.target.value);
                if (showBulkChoices) {
                  setShowBulkChoices(false);
                }
              }}
              rows={4}
              placeholder="Try: pay rent p1 tomorrow 9pm #bills\nOr paste a whole list"
              className="w-full rounded-[20px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#EE6A3C]"
            />
          </Field>

          <Field label="Notes">
            <textarea
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={4}
              placeholder="Add notes"
              className="w-full rounded-[20px] border border-[#E1D5CA] bg-white px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
            />
          </Field>

          <section className="rounded-[22px] border border-[#E1D5CA] bg-white px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-[#1E2D2F]">
                  {bulkLines.length > 1 ? `Bulk add preview · ${bulkLines.length} tasks` : 'Parsed metadata'}
                </p>
                <p className="mt-1 text-sm text-[#6D5C50]">
                  {bulkLines.length > 1
                    ? 'Each line will be parsed as its own task. Add 1 task joins all cleaned lines into one title.'
                    : 'Quick Add uses the same parser rules as Android: projects, dates, priorities, recurrence, and reminders.'}
                </p>
              </div>
              {context.defaultDueToday || context.defaultProjectId ? (
                <span className="rounded-full bg-[#FBF7F3] px-3 py-1 text-xs font-semibold text-[#9F7B63]">
                  {describeQuickAddContext(payload, context)}
                </span>
              ) : null}
            </div>

            {bulkLines.length > 1 ? (
              <div className="mt-4 rounded-[18px] border border-[#E7DDD4] bg-[#FBF7F3] px-4 py-3 text-sm text-[#6D5C50]">
                <p className="font-medium text-[#1E2D2F]">First task preview</p>
                <p className="mt-2">{bulkLines[0]}</p>
              </div>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {renderQuickAddMetadata(payload, previewDraft).map(item => (
                  <span
                    key={item}
                    className="rounded-full border border-[#E7DDD4] bg-[#FBF7F3] px-3 py-1.5 text-xs font-semibold text-[#6D5C50]"
                  >
                    {item}
                  </span>
                ))}
              </div>
            )}
          </section>

          {showBulkChoices ? (
            <section className="rounded-[22px] border border-[#F1C7B5] bg-[#FFF1EB] px-4 py-4">
              <p className="text-sm font-semibold text-[#A24628]">Add {bulkLines.length} tasks?</p>
              <p className="mt-1 text-sm text-[#8A5A44]">
                Cancel to keep editing. Add 1 task joins the cleaned lines into one task title. Add {bulkLines.length} tasks creates one task per line.
              </p>
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowBulkChoices(false)}
                  className="rounded-full border border-[#E1D5CA] bg-white px-4 py-2.5 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving || bulkLines.length === 0}
                  onClick={() => void createBulkTasks('single')}
                  className="rounded-full border border-[#E1D5CA] bg-white px-4 py-2.5 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? 'Adding...' : 'Add 1 task'}
                </button>
                <button
                  type="button"
                  disabled={isSaving || bulkLines.length === 0}
                  onClick={() => void createBulkTasks('many')}
                  className="rounded-full bg-[#EE6A3C] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? 'Adding...' : `Add ${bulkLines.length} tasks`}
                </button>
              </div>
            </section>
          ) : null}

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#E1D5CA] bg-white px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[#FBF7F3]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !hasInput}
              className="rounded-full bg-[#EE6A3C] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? 'Creating...' : bulkLines.length > 1 ? `Review ${bulkLines.length} tasks` : 'Create task'}
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
  payload,
  todayStartMs,
  tasks,
  emptyMessage,
  onToggleTask,
  onOpenTask,
}: {
  title: string;
  subtitle?: string;
  payload: SyncPayload;
  todayStartMs: number;
  tasks: Task[];
  emptyMessage: string;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  return (
    <section className="rounded-[18px] bg-transparent">
      <div className="mb-2 flex items-center justify-between gap-3 px-1">
        <div>
          <h3 className="text-[18px] font-semibold text-[#202020]">{title}</h3>
          {subtitle ? <p className="mt-0.5 text-xs text-[#8a8076]">{subtitle}</p> : null}
        </div>
        <span className="text-xs font-medium text-[#8a8076]">{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
      </div>
      <TaskListBlock
        payload={payload}
        todayStartMs={todayStartMs}
        tasks={tasks}
        emptyMessage={emptyMessage}
        onToggleTask={onToggleTask}
        onOpenTask={onOpenTask}
      />
    </section>
  );
}

function TaskListBlock({
  payload,
  todayStartMs,
  tasks,
  emptyMessage,
  onToggleTask,
  onOpenTask,
}: {
  payload: SyncPayload;
  todayStartMs: number;
  tasks: Task[];
  emptyMessage: string;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  if (!tasks.length) {
    return <p className="rounded-[12px] border border-[#ece7e3] bg-white px-4 py-5 text-sm text-[#7b736b]">{emptyMessage}</p>;
  }

  return (
    <div className="overflow-hidden rounded-[14px] border border-[#ece7e3] bg-white">
      {tasks.map(task => (
        <TaskRow
          key={task.id}
          payload={payload}
          todayStartMs={todayStartMs}
          task={task}
          onToggleTask={onToggleTask}
          onOpenTask={onOpenTask}
        />
      ))}
    </div>
  );
}

function TaskRow({
  payload,
  todayStartMs,
  task,
  onToggleTask,
  onOpenTask,
}: {
  payload: SyncPayload;
  todayStartMs: number;
  task: Task;
  onToggleTask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
}) {
  const completed = task.status === 'COMPLETED';
  const overdue = Boolean(task.dueAt && task.status === 'OPEN' && task.dueAt < todayStartMs);
  const locationLabel = getTaskLocationLabel(payload, task);
  const dueLabel = task.dueAt ? formatTaskDate(task.dueAt, task.allDay) : null;

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
      className="flex items-start gap-3 border-b border-[#f1eeeb] px-3 py-2.5 text-left transition hover:bg-[#fcfaf7] last:border-b-0"
    >
      <button
        onClick={event => {
          event.stopPropagation();
          onToggleTask(task.id);
        }}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${completed
          ? 'border-[#dc4c3e] bg-[#dc4c3e] text-white'
          : `${priorityCircleClasses(task.priority)} bg-white text-transparent`
          }`}
      >
        <Check size={12} />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`text-[15px] leading-5 ${completed ? 'text-[#9a928c] line-through' : 'text-[#202020]'}`}>{task.title}</p>
        {task.description ? (
          <p className={`mt-1 text-sm leading-5 ${completed ? 'text-[#a39a93]' : 'text-[#6d665e]'}`}>{task.description}</p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a8076]">
          {dueLabel ? (
            <span className={`inline-flex items-center gap-1 ${overdue ? 'text-[#d1453b]' : 'text-[#8a8076]'}`}>
              <Calendar size={11} />
              <span>{dueLabel}</span>
            </span>
          ) : null}
          {task.recurringRule ? <span className={overdue ? 'text-[#d1453b]' : ''}>↻</span> : null}
          {task.parentTaskId ? <span>Subtask</span> : null}
        </div>
      </div>
      <div className="mt-0.5 hidden min-w-[120px] shrink-0 text-right text-xs text-[#8a8076] md:block">
        {locationLabel}
      </div>
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
    <section className="px-1 pb-2 pt-1">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9d6b54]">{eyebrow}</p>
          <h2 className="mt-2 text-[32px] font-semibold text-[#202020]">{title}</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[#7a7168]">{description}</p>
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
  count,
  tint,
}: {
  to: string;
  icon: ComponentType<{ size?: number; className?: string; style?: CSSProperties }>;
  label: string;
  compact?: boolean;
  count?: number;
  tint?: string;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-[10px] px-3 py-2 text-sm transition ${isActive
          ? 'bg-[#fff1ed] text-[#dc4c3e]'
          : 'text-[#4f4a45] hover:bg-[#f7f3ef]'
        } ${compact ? 'py-1.5' : ''}`
      }
    >
      <Icon size={16} className={tint ? '' : undefined} style={tint ? { color: tint } : undefined} />
      <span className="truncate">{label}</span>
      {typeof count === 'number' ? <span className="ml-auto text-xs text-[#9a928a]">{count}</span> : null}
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

function priorityCircleClasses(priority: Priority): string {
  switch (priority) {
    case 'P1':
      return 'border-[#d1453b] text-[#d1453b] hover:border-[#d1453b]';
    case 'P2':
      return 'border-[#d97706] text-[#d97706] hover:border-[#d97706]';
    case 'P3':
      return 'border-[#2563eb] text-[#2563eb] hover:border-[#2563eb]';
    case 'P4':
    default:
      return 'border-[#c9c3bd] text-[#c9c3bd] hover:border-[#a79f97]';
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
  hasPendingLocalChanges,
  isOnline,
  isSyncing,
  lastCloudSyncAt,
}: {
  cloudConfigured: boolean;
  cloudSession: CloudSession | null;
  lastSyncError: string | null;
  hasPendingLocalChanges: boolean;
  isOnline: boolean;
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

  if (lastSyncError && hasPendingLocalChanges) {
    return {
      label: 'Attention',
      detail: 'The last cloud sync attempt failed and this browser still has local changes waiting to upload.',
      tone: 'warning',
    };
  }

  if (!isOnline && hasPendingLocalChanges) {
    return {
      label: 'Offline',
      detail: 'This browser has local changes waiting to sync. Emberlist will retry when the connection comes back.',
      tone: 'warning',
    };
  }

  if (hasPendingLocalChanges) {
    return {
      label: 'Pending',
      detail: 'Local changes are saved in this browser and queued for upload to Google Drive.',
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

function useTodayStartMs(): number {
  const [todayStartMs, setTodayStartMs] = useState(() => startOfDay(Date.now()).getTime());

  useEffect(() => {
    const now = Date.now();
    const nextMidnightMs = startOfDay(addDays(now, 1)).getTime();
    const timer = window.setTimeout(() => {
      setTodayStartMs(startOfDay(Date.now()).getTime());
    }, Math.max(nextMidnightMs - now + 1000, 1000));
    return () => window.clearTimeout(timer);
  }, [todayStartMs]);

  return todayStartMs;
}

function getTaskLocationLabel(payload: SyncPayload, task: Task): string {
  if (!task.projectId) return 'Inbox';
  const project = payload.projects.find(projectItem => projectItem.id === task.projectId && !projectItem.deletedAt);
  const section = task.sectionId
    ? payload.sections.find(sectionItem => sectionItem.id === task.sectionId && !sectionItem.deletedAt)
    : null;
  if (!project) return 'Inbox';
  return section ? `${project.name} / ${section.name}` : project.name;
}

function getQuickAddContext(pathname: string, payload: SyncPayload): QuickAddContext {
  if (pathname.startsWith('/today')) {
    return { defaultProjectId: null, defaultDueToday: true };
  }

  if (pathname.startsWith('/project/')) {
    const projectId = pathname.split('/')[2];
    const project = getProjectById(payload, projectId);
    return { defaultProjectId: project?.id ?? null, defaultDueToday: false };
  }

  if (pathname.startsWith('/inbox')) {
    return { defaultProjectId: null, defaultDueToday: false };
  }

  return { defaultProjectId: null, defaultDueToday: false };
}

function buildDraftFromParsed(
  payload: SyncPayload,
  parsed: QuickAddResult,
  description: string,
  context: QuickAddContext,
  todayStartMs: number
): TaskDraft {
  const projectMatch = parsed.projectName
    ? getActiveProjects(payload, true).find(project => project.name.localeCompare(parsed.projectName!, undefined, { sensitivity: 'base' }) === 0) ?? null
    : null;
  const contextProjectId = !parsed.projectName ? context.defaultProjectId : null;
  const projectId = projectMatch?.id ?? contextProjectId ?? null;
  const sectionMatch = parsed.sectionName && projectId
    ? getProjectSections(payload, projectId).find(section => section.name.localeCompare(parsed.sectionName!, undefined, { sensitivity: 'base' }) === 0) ?? null
    : null;
  const dueAt = parsed.dueAt ?? (context.defaultDueToday ? todayStartMs : null);
  const allDay = parsed.dueAt === null && context.defaultDueToday ? true : parsed.allDay;

  return {
    title: parsed.title.trim(),
    description: description.trim(),
    projectId,
    projectName: projectMatch ? null : parsed.projectName,
    sectionId: sectionMatch?.id ?? null,
    sectionName: sectionMatch ? null : parsed.sectionName,
    priority: parsed.priority,
    dueAt,
    allDay,
    deadlineAt: parsed.deadlineAt,
    deadlineAllDay: parsed.deadlineAllDay,
    recurringRule: parsed.recurrenceRule,
    deadlineRecurringRule: parsed.deadlineRecurringRule,
    parentTaskId: null,
    reminders: parsed.reminders.map(mapParsedReminder),
  };
}

function createMergedBulkDraft(
  payload: SyncPayload,
  lines: string[],
  description: string,
  context: QuickAddContext,
  todayStartMs: number
): TaskDraft {
  const baseDraft = buildDraftFromParsed(payload, parseQuickAdd(''), description, context, todayStartMs);
  return {
    ...baseDraft,
    title: lines.join(' ').trim() || 'Untitled task',
  };
}

function renderQuickAddMetadata(payload: SyncPayload, draft: TaskDraft): string[] {
  const items: string[] = [];
  const projectLabel = draft.projectId
    ? getProjectById(payload, draft.projectId)?.name ?? 'Inbox'
    : draft.projectName ?? 'Inbox';
  if (draft.sectionId) {
    const section = payload.sections.find(item => item.id === draft.sectionId && !item.deletedAt);
    items.push(`#${projectLabel}/${section?.name ?? 'Section'}`);
  } else if (draft.sectionName) {
    items.push(`#${projectLabel}/${draft.sectionName}`);
  } else {
    items.push(`#${projectLabel}`);
  }
  items.push(draft.priority);
  if (draft.dueAt !== null) {
    items.push(formatTaskDate(draft.dueAt, draft.allDay));
  } else {
    items.push('No due date');
  }
  if (draft.deadlineAt !== null) {
    items.push(`Deadline ${formatTaskDate(draft.deadlineAt, draft.deadlineAllDay)}`);
  }
  if (draft.recurringRule) {
    items.push(renderRecurrenceLabel(draft.recurringRule));
  }
  if (draft.reminders.length) {
    items.push(renderReminderLabel(draft.reminders));
  }
  return items;
}

function describeQuickAddContext(payload: SyncPayload, context: QuickAddContext): string {
  const labels: string[] = [];
  if (context.defaultDueToday) {
    labels.push('Defaults to Today');
  }
  if (context.defaultProjectId) {
    labels.push(`Project ${getProjectById(payload, context.defaultProjectId)?.name ?? 'current'}`);
  }
  return labels.join(' · ');
}

function mapParsedReminder(reminder: ParsedReminderSpec): TaskReminderDraft {
  return reminder.kind === 'ABSOLUTE'
    ? { kind: 'ABSOLUTE', timeAt: reminder.timeAt }
    : { kind: 'OFFSET', offsetMinutes: reminder.minutes };
}

function renderReminderLabel(reminders: TaskReminderDraft[]): string {
  if (reminders.length === 1) {
    const [reminder] = reminders;
    return reminder.kind === 'ABSOLUTE'
      ? `Reminder ${formatDateTime(reminder.timeAt)}`
      : `Reminder ${reminder.offsetMinutes}m before`;
  }
  return `${reminders.length} reminders`;
}

function renderRecurrenceLabel(rule: string): string {
  const frequency = /FREQ=([A-Z]+)/.exec(rule)?.[1] ?? 'CUSTOM';
  const interval = Number.parseInt(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? '1', 10);
  const byDay = /BYDAY=([A-Z,]+)/.exec(rule)?.[1];
  const byMonthDay = /BYMONTHDAY=(\d+)/.exec(rule)?.[1];

  if (byDay) {
    const days = byDay.split(',').map(token => ({
      MO: 'Mon',
      TU: 'Tue',
      WE: 'Wed',
      TH: 'Thu',
      FR: 'Fri',
      SA: 'Sat',
      SU: 'Sun',
    }[token] ?? token));
    return interval === 2 ? `Every other ${days.join(', ')}` : `Every ${days.join(', ')}`;
  }

  if (frequency === 'MONTHLY' && byMonthDay) {
    return `Every month on ${byMonthDay}`;
  }

  const label = frequency === 'DAILY'
    ? 'day'
    : frequency === 'WEEKLY'
      ? 'week'
      : frequency === 'MONTHLY'
        ? 'month'
        : frequency === 'YEARLY'
          ? 'year'
          : 'custom';
  return interval <= 1 ? `Every ${label}` : `Every ${interval} ${label}s`;
}

function getWorkspaceIdentity(cloudSession: CloudSession | null): { label: string; initial: string } {
  const label = cloudSession?.name?.trim()
    || cloudSession?.email?.trim()
    || 'Emberlist';
  const initial = label.charAt(0).toUpperCase() || 'E';
  return { label, initial };
}

function getRouteTitle(pathname: string, payload: SyncPayload): string {
  if (pathname.startsWith('/search/no-due')) return 'Tasks without due dates';
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
