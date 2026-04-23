import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  ChangeEvent,
  ComponentType,
  DragEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import {
  Calendar,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CircleSlash,
  Download,
  Bell,
  Flag,
  Folder,
  GripVertical,
  Home,
  Import,
  ListTodo,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
  SunMedium,
  Sunrise,
  X,
} from "lucide-react";
import {
  HashRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  addDays,
  addMonths,
  eachDayOfInterval,
  endOfDay,
  format,
  isSameDay,
  isToday,
  isTomorrow,
  isYesterday,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { RecoveryScreen } from "./components/RecoveryScreen";
import {
  resolveBannerAutoDismissMs,
  shouldDismissBannerOnNavigation,
} from "./lib/banner";
import {
  AUTO_SYNC_DEBOUNCE_MS,
  shouldRunActivationSync,
  shouldRunConnectivityRegainSync,
  shouldScheduleDebouncedSync,
} from "./lib/autoSync";
import {
  appendActivityEntry,
  buildTaskTimeline,
  type ActivityEntry,
} from "./lib/activity";
import {
  extractBulkQuickAddLines,
  shouldPromptBulkQuickAdd,
} from "./lib/bulkQuickAdd";
import { db } from "./lib/db";
import { reconcileLocalPersistPayload } from "./lib/localSync";
import {
  advanceOnboardingStep,
  createInitialOnboardingState,
  createOnboardingSetup,
  createOnboardingTourState,
  type FirstRunOnboardingState,
  ONBOARDING_PRESETS,
  type OnboardingPresetId,
  type OnboardingSetupResult,
} from "./lib/onboarding";
import {
  buildDraftFromParsed,
  buildTaskDetailDraftFromInput,
  createMergedBulkDraft,
  mergeBulkDraftWithDefaults,
  type QuickAddContext,
} from "./lib/quickAddDrafts";
import {
  getQuickAddEscapeAction,
  shouldCloseQuickAddAfterCreate,
  type QuickAddSubmitMode,
} from "./lib/quickAddFlow";
import { parseQuickAdd } from "./lib/quickParser";
import {
  buildReminderEditors,
  createReminderEditor,
  getRecurrencePreset,
  getRuleForRecurrencePreset,
  hasIncompleteReminderEditors,
  serializeReminderEditors,
  type ReminderEditorDraft,
  type RecurrencePreset,
} from "./lib/taskEditing";
import { normalizeImportedPayload } from "./lib/syncPayload";
import { DriveSyncService, type CloudSession } from "./lib/syncService";
import { SyncEngine } from "./lib/syncEngine";
import {
  formatClock,
  formatDateTimeValue,
  getDefaultWebDisplayPreferences,
  getGlobalWebDisplayPreferences,
  setGlobalWebDisplayPreferences,
  type WeekStartsOn,
} from "./lib/webPreferences";
import { resolveGoShortcut, shortcutSections } from "./lib/webShortcuts";
import {
  archiveTask,
  canReparentTaskAsSubtask,
  createProject,
  createTaskRelative,
  createSection,
  createTask,
  deleteTasks,
  deleteProject,
  deleteSection,
  duplicateTask,
  flattenTasksWithSubtasks,
  getCompletedInboxTasks,
  getCompletedProjectTasks,
  getActiveProjects,
  getInboxTasks,
  getProjectById,
  getProjectSections,
  getProjectTasks,
  getTaskPostponeDueAt,
  getTaskReminderDrafts,
  getTaskById,
  getTodayViewData,
  getUpcomingCompletedTasks,
  getUpcomingGroups,
  getUpcomingOpenTasks,
  moveTasksToSection,
  moveTasksToProject,
  postponeTasks,
  promoteSubtask,
  repairRecurringTasks,
  reparentTaskAsSubtask,
  rescheduleTasksToDate,
  searchTasks,
  searchCompletedTasks,
  setPriorityForTasks,
  type TaskReminderDraft,
  toggleTaskCompletion,
  type SearchFilter,
  type TaskDraft,
  updateProject,
  updateSection,
  updateTaskFromDraft,
} from "./lib/workspace";
import type {
  Priority,
  Project,
  Section,
  SyncPayload,
  Task,
} from "./types/sync";

const syncEngine = new SyncEngine();
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim() ?? "";
const FIRST_RUN_WELCOME_DISMISSED_KEY = "emberlist.firstRunWelcomeDismissed";
const FIRST_RUN_ONBOARDING_STATE_KEY = "emberlist.firstRunOnboardingState";
const SEARCH_FILTERS: Array<{ label: string; value: SearchFilter }> = [
  { label: "All", value: "ALL" },
  { label: "Overdue", value: "OVERDUE" },
  { label: "Today", value: "TODAY" },
  { label: "This week", value: "THIS_WEEK" },
  { label: "High priority", value: "HIGH_PRIORITY" },
  { label: "Inbox", value: "INBOX" },
  { label: "No due", value: "NO_DUE" },
  { label: "Has deadline", value: "HAS_DEADLINE" },
  { label: "Recurring", value: "RECURRING" },
  { label: "Has reminder", value: "HAS_REMINDER" },
];

type BootState = "loading" | "ready" | "error";
type Banner = {
  id: number;
  tone: "success" | "error" | "info";
  message: string;
  actionLabel?: string;
  onAction?: (() => void | Promise<void>) | null;
  persistOnNavigation?: boolean;
  autoDismissMs?: number;
};
type CloudStatusTone = "ready" | "idle" | "warning" | "muted";
type FocusedTaskActionMode = "reschedule" | "move" | "priority" | "delete";

let activeDraggedTaskId: string | null = null;

function isPublicMarketingPath(pathname: string) {
  return pathname === "/privacy" || pathname === "/terms";
}

function isWorkspaceEmpty(payload: SyncPayload | null): boolean {
  if (!payload) return false;
  const hasLiveProjects = payload.projects.some(
    (project) => !project.deletedAt,
  );
  const hasLiveSections = payload.sections.some(
    (section) => !section.deletedAt,
  );
  const hasLiveTasks = payload.tasks.some((task) => !task.deletedAt);
  return !hasLiveProjects && !hasLiveSections && !hasLiveTasks;
}

function normalizeCloudSyncErrorMessage(message: string): string {
  if (message.includes("insufficientPermissions")) {
    return "Google sign-in finished, but Drive access was not granted. Try again and check the final box that allows Emberlist to access its own configuration data in Google Drive.";
  }

  if (message.includes("popup_closed")) {
    return "Google sign-in was closed before it finished. Try again and keep the Google window open until you return to Emberlist.";
  }

  return message;
}

function App() {
  const [payload, setPayload] = useState<SyncPayload | null>(null);
  const [bootState, setBootState] = useState<BootState>("loading");
  const [bootError, setBootError] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [hasPendingLocalChanges, setHasPendingLocalChanges] = useState(false);
  const [isResettingCache, setIsResettingCache] = useState(false);
  const [isResettingCloud, setIsResettingCloud] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddOverride, setQuickAddOverride] =
    useState<Partial<QuickAddContext> | null>(null);
  const [showCompletedToday, setShowCompletedToday] = useState(() =>
    readStoredBoolean("emberlist.showCompletedToday", true),
  );
  const [showSelectionButtons, setShowSelectionButtons] = useState(() =>
    readStoredBoolean("emberlist.showSelectionButtons", false),
  );
  const [weekStartsOn, setWeekStartsOn] = useState<WeekStartsOn>(() =>
    readStoredWeekStartsOn(
      "emberlist.weekStartsOn",
      getDefaultWebDisplayPreferences().weekStartsOn,
    ),
  );
  const [use24HourTime, setUse24HourTime] = useState(() =>
    readStoredBoolean(
      "emberlist.use24HourTime",
      getDefaultWebDisplayPreferences().use24HourTime,
    ),
  );
  const [autoSyncEnabled, setAutoSyncEnabled] = useState(() =>
    readStoredBoolean("emberlist.autoSyncEnabled", true),
  );
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(() =>
    readStoredBoolean("emberlist.autoBackupEnabled", true),
  );
  const [lastCloudSyncAt, setLastCloudSyncAt] = useState<number | null>(() =>
    readStoredNumber("emberlist.lastCloudSyncAt"),
  );
  const [lastLocalBackupAt, setLastLocalBackupAt] = useState<number | null>(
    () => readStoredNumber("emberlist.lastLocalBackupAt"),
  );
  const [cloudSession, setCloudSession] = useState<CloudSession | null>(() =>
    readStoredCloudSession(),
  );
  const [lastSyncError, setLastSyncError] = useState<string | null>(null);
  const [activityEntries, setActivityEntries] = useState<ActivityEntry[]>(() =>
    readStoredActivityEntries(),
  );
  const [hasDismissedFirstRunWelcome, setHasDismissedFirstRunWelcome] =
    useState(() => readStoredBoolean(FIRST_RUN_WELCOME_DISMISSED_KEY, false));
  const [firstRunOnboarding, setFirstRunOnboarding] =
    useState<FirstRunOnboardingState | null>(() => readStoredOnboardingState());
  const [isCloudConnectDialogOpen, setIsCloudConnectDialogOpen] =
    useState(false);

  const payloadRef = useRef<SyncPayload | null>(null);
  const cloudSessionRef = useRef<CloudSession | null>(cloudSession);
  const isSyncingRef = useRef(false);
  const isOnlineRef = useRef(isOnline);
  const hasPendingLocalChangesRef = useRef(hasPendingLocalChanges);
  const autoSyncEnabledRef = useRef(autoSyncEnabled);
  const autoBackupEnabledRef = useRef(autoBackupEnabled);
  const lastCloudSyncAtRef = useRef(lastCloudSyncAt);
  const followUpSyncRequestedRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const backoffTimerRef = useRef<number | null>(null);
  const backoffAttemptRef = useRef(0);
  const backoffUntilRef = useRef<number | null>(null);
  const hasAutoSyncedOnLoadRef = useRef(false);
  const previousAutoSyncStateRef = useRef({
    autoSyncEnabled,
    hasCloudSession: Boolean(cloudSession),
  });
  const bannerIdRef = useRef(0);
  const firstRunOnboardingRef = useRef<FirstRunOnboardingState | null>(
    firstRunOnboarding,
  );
  const undoActivityMapRef = useRef(
    new Map<
      string,
      {
        previousPayload: SyncPayload;
        undoMessage: string;
        taskIds: string[];
        title: string;
      }
    >(),
  );
  const syncService = useMemo(
    () => (GOOGLE_CLIENT_ID ? new DriveSyncService(GOOGLE_CLIENT_ID) : null),
    [],
  );

  function showBanner(
    tone: Banner["tone"],
    message: string,
    options?: Pick<
      Banner,
      "actionLabel" | "onAction" | "persistOnNavigation" | "autoDismissMs"
    >,
  ) {
    bannerIdRef.current += 1;
    setBanner({
      id: bannerIdRef.current,
      tone,
      message,
      actionLabel: options?.actionLabel,
      onAction: options?.onAction ?? null,
      persistOnNavigation: options?.persistOnNavigation ?? false,
      autoDismissMs: options?.autoDismissMs,
    });
  }

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  useEffect(() => {
    cloudSessionRef.current = cloudSession;
  }, [cloudSession]);

  useEffect(() => {
    syncService?.setPreferredLoginHint(cloudSession?.email ?? null);
  }, [cloudSession?.email, syncService]);

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
    autoSyncEnabledRef.current = autoSyncEnabled;
  }, [autoSyncEnabled]);

  useEffect(() => {
    autoBackupEnabledRef.current = autoBackupEnabled;
  }, [autoBackupEnabled]);

  useEffect(() => {
    lastCloudSyncAtRef.current = lastCloudSyncAt;
  }, [lastCloudSyncAt]);

  useEffect(() => {
    window.localStorage.setItem(
      "emberlist.showCompletedToday",
      JSON.stringify(showCompletedToday),
    );
  }, [showCompletedToday]);

  useEffect(() => {
    window.localStorage.setItem(
      "emberlist.showSelectionButtons",
      JSON.stringify(showSelectionButtons),
    );
  }, [showSelectionButtons]);

  useEffect(() => {
    window.localStorage.setItem("emberlist.weekStartsOn", String(weekStartsOn));
    setGlobalWebDisplayPreferences({ weekStartsOn, use24HourTime });
  }, [use24HourTime, weekStartsOn]);

  useEffect(() => {
    window.localStorage.setItem(
      "emberlist.use24HourTime",
      JSON.stringify(use24HourTime),
    );
  }, [use24HourTime]);

  useEffect(() => {
    window.localStorage.setItem(
      "emberlist.autoSyncEnabled",
      JSON.stringify(autoSyncEnabled),
    );
  }, [autoSyncEnabled]);

  useEffect(() => {
    window.localStorage.setItem(
      "emberlist.autoBackupEnabled",
      JSON.stringify(autoBackupEnabled),
    );
  }, [autoBackupEnabled]);

  useEffect(() => {
    if (lastCloudSyncAt === null) {
      window.localStorage.removeItem("emberlist.lastCloudSyncAt");
      return;
    }
    window.localStorage.setItem(
      "emberlist.lastCloudSyncAt",
      String(lastCloudSyncAt),
    );
  }, [lastCloudSyncAt]);

  useEffect(() => {
    writeStoredCloudSession(cloudSession);
  }, [cloudSession]);

  useEffect(() => {
    if (lastLocalBackupAt === null) {
      window.localStorage.removeItem("emberlist.lastLocalBackupAt");
      return;
    }
    window.localStorage.setItem(
      "emberlist.lastLocalBackupAt",
      String(lastLocalBackupAt),
    );
  }, [lastLocalBackupAt]);

  useEffect(() => {
    writeStoredActivityEntries(activityEntries);
  }, [activityEntries]);

  useEffect(() => {
    window.localStorage.setItem(
      FIRST_RUN_WELCOME_DISMISSED_KEY,
      JSON.stringify(hasDismissedFirstRunWelcome),
    );
  }, [hasDismissedFirstRunWelcome]);

  useEffect(() => {
    firstRunOnboardingRef.current = firstRunOnboarding;
    writeStoredOnboardingState(firstRunOnboarding);
  }, [firstRunOnboarding]);

  useEffect(() => {
    const autoDismissMs = resolveBannerAutoDismissMs(banner);
    if (!banner || autoDismissMs === null) return;
    const timeoutId = window.setTimeout(() => {
      setBanner((current) => (current?.id === banner.id ? null : current));
    }, autoDismissMs);
    return () => window.clearTimeout(timeoutId);
  }, [banner]);

  const loadData = useMemo(
    () => async () => {
      setBootState("loading");
      setBootError(null);
      try {
        const data = await db.getPayload();
        const repaired = repairRecurringTasks(data);
        const recurringMaintenance = describeRecurringMaintenance(repaired);
        if (recurringMaintenance) {
          await persistPayload(repaired.payload, true);
          showBanner("info", `${recurringMaintenance}.`);
        } else {
          payloadRef.current = data;
          setPayload(data);
        }
        setBootState("ready");
      } catch (error) {
        console.error("Failed to load local workspace", error);
        payloadRef.current = null;
        setPayload(null);
        setBootError(
          error instanceof Error
            ? error.message
            : "Failed to load local workspace.",
        );
        setBootState("error");
      }
    },
    [],
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

  function recordActivity(
    taskIds: string[],
    title: string,
    detail?: string | null,
  ): string {
    const entry: ActivityEntry = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      taskIds,
      title,
      detail: detail ?? null,
    };
    setActivityEntries((current) => appendActivityEntry(current, entry));
    return entry.id;
  }

  function saveBrowserBackupSnapshot(
    nextPayload: SyncPayload,
    automatic: boolean,
  ) {
    if (typeof window === "undefined") return;
    if (automatic && !autoBackupEnabledRef.current) return;
    window.localStorage.setItem(
      "emberlist.browserBackup",
      JSON.stringify(nextPayload),
    );
    setLastLocalBackupAt(Date.now());
  }

  function getRecurringMaintenanceChangeCount(result: {
    repairedCount: number;
    removedDuplicateCount: number;
  }) {
    return result.repairedCount + result.removedDuplicateCount;
  }

  function describeRecurringMaintenance(result: {
    repairedCount: number;
    removedDuplicateCount: number;
  }) {
    const parts: string[] = [];
    if (result.repairedCount > 0) {
      parts.push(
        `recovered ${result.repairedCount} recurring task${result.repairedCount === 1 ? "" : "s"}`,
      );
    }
    if (result.removedDuplicateCount > 0) {
      parts.push(
        `removed ${result.removedDuplicateCount} duplicate recurring task${result.removedDuplicateCount === 1 ? "" : "s"}`,
      );
    }
    if (!parts.length) {
      return null;
    }
    const [first, ...rest] = parts;
    return [first.charAt(0).toUpperCase() + first.slice(1), ...rest].join(
      " and ",
    );
  }

  async function handleUndoActivity(activityId: string) {
    const undoRecord = undoActivityMapRef.current.get(activityId);
    if (!undoRecord) return;
    undoActivityMapRef.current.delete(activityId);
    await persistPayload(undoRecord.previousPayload, true);
    recordActivity(
      undoRecord.taskIds,
      "Undid recent change",
      undoRecord.undoMessage,
    );
    showBanner("info", undoRecord.undoMessage);
  }

  function downloadPayloadBackup(nextPayload: SyncPayload) {
    const json = JSON.stringify(nextPayload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `emberlist-backup-${format(new Date(), "yyyyMMdd-HHmmss")}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
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
        const message =
          "Cloud sync is not configured for this deployment. Set VITE_GOOGLE_CLIENT_ID and redeploy.";
        setLastSyncError(message);
        showBanner("error", message);
      }
      return;
    }

    if (automatic && !autoSyncEnabledRef.current) return;
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
      const repaired = repairRecurringTasks(mergedPayload);
      const recurringMaintenance = describeRecurringMaintenance(repaired);
      await persistPayload(
        repaired.payload,
        getRecurringMaintenanceChangeCount(repaired) > 0,
      );
      setLastCloudSyncAt(Date.now());
      setCloudSession(syncService.getSession());
      setHasPendingLocalChanges(
        getRecurringMaintenanceChangeCount(repaired) > 0,
      );
      backoffAttemptRef.current = 0;
      backoffUntilRef.current = null;
      if (!automatic) {
        showBanner(
          "success",
          recurringMaintenance
            ? `Cloud sync completed. ${recurringMaintenance}.`
            : "Cloud sync completed.",
        );
      } else if (recurringMaintenance) {
        showBanner("info", `${recurringMaintenance} after sync.`);
      }
    } catch (error) {
      console.error("Cloud sync failed", error);
      const message = normalizeCloudSyncErrorMessage(
        error instanceof Error ? error.message : "Cloud sync failed.",
      );
      setLastSyncError(message);
      if (!automatic) {
        showBanner("error", message);
      } else {
        const delayMs = Math.min(
          5 * 60_000,
          30_000 * 2 ** backoffAttemptRef.current,
        );
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
        }, AUTO_SYNC_DEBOUNCE_MS);
      }
    }
  }

  async function persistPayload(
    nextPayload: SyncPayload,
    markDirty: boolean = false,
  ) {
    const storedPayload = await db.getPayload();
    const reconciled = reconcileLocalPersistPayload(storedPayload, nextPayload);
    await db.savePayload(reconciled.payload);
    payloadRef.current = reconciled.payload;
    setPayload(reconciled.payload);
    saveBrowserBackupSnapshot(reconciled.payload, markDirty);
    if (markDirty) {
      setHasPendingLocalChanges(true);
      if (isSyncingRef.current) {
        followUpSyncRequestedRef.current = true;
      } else if (
        syncService &&
        shouldScheduleDebouncedSync({
          autoSyncEnabled: autoSyncEnabledRef.current,
          hasCloudSession: Boolean(cloudSessionRef.current),
          isOnline: isOnlineRef.current,
          isSyncing: false,
          applyingRemoteChanges: false,
          lastSyncedAt: lastCloudSyncAtRef.current,
          now: Date.now(),
        })
      ) {
        clearDebounceTimer();
        debounceTimerRef.current = window.setTimeout(() => {
          void runCloudSync({ interactiveAuth: false, automatic: true });
        }, AUTO_SYNC_DEBOUNCE_MS);
      }
    }
  }

  function showUndoBanner(
    message: string,
    previousPayload: SyncPayload,
    undoMessage: string = "Change undone.",
    activityId?: string,
  ) {
    showBanner("success", message, {
      actionLabel: "Undo",
      persistOnNavigation: true,
      autoDismissMs: 8_000,
      onAction: async () => {
        if (activityId) {
          await handleUndoActivity(activityId);
          return;
        }
        await persistPayload(previousPayload, true);
        showBanner("info", undoMessage);
      },
    });
  }

  async function applyUndoablePayloadUpdate(
    updater: (current: SyncPayload) => SyncPayload,
    options: {
      message: string;
      undoMessage?: string;
      activity?: {
        taskIds: string[];
        title: string;
        detail?: string | null;
      };
    },
  ): Promise<SyncPayload | null> {
    const current = payloadRef.current;
    if (!current) return null;
    const nextPayload = updater(current);
    await persistPayload(nextPayload, true);
    let activityId: string | undefined;
    if (options.activity) {
      activityId = recordActivity(
        options.activity.taskIds,
        options.activity.title,
        options.activity.detail,
      );
      undoActivityMapRef.current.set(activityId, {
        previousPayload: current,
        undoMessage: options.undoMessage ?? "Change undone.",
        taskIds: options.activity.taskIds,
        title: options.activity.title,
      });
    }
    showUndoBanner(options.message, current, options.undoMessage, activityId);
    return nextPayload;
  }

  async function handleResetLocalCache() {
    setIsResettingCache(true);
    try {
      await db.reset();
      showBanner(
        "info",
        "Local web cache cleared. A fresh workspace was created.",
      );
      await loadData();
    } catch (error) {
      console.error("Failed to reset local web cache", error);
      setBootError(
        error instanceof Error
          ? error.message
          : "Failed to reset local web cache.",
      );
      setBootState("error");
    } finally {
      setIsResettingCache(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const remotePayload = normalizeImportedPayload(
        JSON.parse(await file.text()),
        "Imported JSON file",
      );
      const localPayload = payloadRef.current ?? (await db.getPayload());
      const mergedPayload = syncEngine.mergePayloads(
        localPayload,
        remotePayload,
      );
      const repaired = repairRecurringTasks(mergedPayload);
      await persistPayload(repaired.payload, true);
      const recurringMaintenance = describeRecurringMaintenance(repaired);
      setBootState("ready");
      showBanner(
        "success",
        recurringMaintenance
          ? `Imported JSON was merged. ${recurringMaintenance}.`
          : "Imported JSON was merged into your local workspace.",
      );
    } catch (error) {
      console.error("Failed to import JSON", error);
      showBanner(
        "error",
        error instanceof Error ? error.message : "Failed to import JSON.",
      );
    }
  }

  async function handleCloudSync() {
    if (!syncService) {
      const message =
        "Cloud sync is not configured for this deployment. Set VITE_GOOGLE_CLIENT_ID and redeploy.";
      setLastSyncError(message);
      showBanner("error", message);
      return;
    }

    if (!cloudSessionRef.current) {
      setIsCloudConnectDialogOpen(true);
      return;
    }

    await runCloudSync({ interactiveAuth: true, automatic: false });
    setBootState("ready");
  }

  async function handleConnectCloudSync() {
    setIsCloudConnectDialogOpen(false);
    await runCloudSync({ interactiveAuth: true, automatic: false });
    setBootState("ready");
  }

  async function handleCreateOnboardingWorkspace(
    presetId: OnboardingPresetId,
  ): Promise<OnboardingSetupResult | null> {
    const current = payloadRef.current;
    if (!current) return null;

    const result = createOnboardingSetup(
      current,
      presetId,
      startOfDay(Date.now()).getTime(),
    );
    await persistPayload(result.payload, true);
    return result;
  }

  async function handleResetCloudSync() {
    if (!syncService) {
      const message =
        "Cloud sync is not configured for this deployment. Set VITE_GOOGLE_CLIENT_ID and redeploy.";
      setLastSyncError(message);
      showBanner("error", message);
      return;
    }

    setIsResettingCloud(true);
    try {
      await syncService.resetRemoteSyncFile();
      setLastCloudSyncAt(null);
      setLastSyncError(null);
      showBanner(
        "success",
        "Cloud sync storage was reset. Sync again from the side with the data you want to keep.",
      );
    } catch (error) {
      console.error("Failed to reset cloud sync", error);
      showBanner(
        "error",
        error instanceof Error ? error.message : "Failed to reset cloud sync.",
      );
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
      showBanner(
        "info",
        "Signed out of Google Drive for this browser session.",
      );
    } catch (error) {
      showBanner(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to disconnect Google Drive.",
      );
    }
  }

  async function handleCreateProject(name: string): Promise<string | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const projectId = crypto.randomUUID();
    await applyUndoablePayloadUpdate(
      (current) => createProject(current, trimmed, projectId),
      {
        message: `Project "${trimmed}" created.`,
        undoMessage: `Removed project "${trimmed}".`,
      },
    );
    return projectId;
  }

  async function handleUpdateProject(
    projectId: string,
    updater: (project: Project) => Project,
  ) {
    await applyUndoablePayloadUpdate(
      (current) => updateProject(current, projectId, updater),
      {
        message: "Project updated.",
        undoMessage: "Reverted project changes.",
      },
    );
  }

  async function handleDeleteProject(projectId: string) {
    const projectName =
      payloadRef.current?.projects.find((project) => project.id === projectId)
        ?.name ?? "Project";
    await applyUndoablePayloadUpdate(
      (current) => deleteProject(current, projectId),
      {
        message: `Deleted "${projectName}".`,
        undoMessage: `Restored "${projectName}".`,
      },
    );
  }

  async function handleCreateSection(projectId: string, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await applyUndoablePayloadUpdate(
      (current) => createSection(current, projectId, trimmed),
      {
        message: `Section "${trimmed}" created.`,
        undoMessage: `Removed section "${trimmed}".`,
      },
    );
  }

  async function handleUpdateSection(
    sectionId: string,
    updater: (section: Section) => Section,
  ) {
    await applyUndoablePayloadUpdate(
      (current) => updateSection(current, sectionId, updater),
      {
        message: "Section updated.",
        undoMessage: "Reverted section changes.",
      },
    );
  }

  async function handleDeleteSection(sectionId: string) {
    const sectionName =
      payloadRef.current?.sections.find((section) => section.id === sectionId)
        ?.name ?? "Section";
    await applyUndoablePayloadUpdate(
      (current) => deleteSection(current, sectionId),
      {
        message: `Deleted section "${sectionName}".`,
        undoMessage: `Restored section "${sectionName}".`,
      },
    );
  }

  async function handleToggleTask(taskId: string) {
    const task = payloadRef.current?.tasks.find(
      (currentTask) => currentTask.id === taskId && !currentTask.deletedAt,
    );
    if (!task) return;
    const completed = task.status === "COMPLETED";
    await applyUndoablePayloadUpdate(
      (current) => toggleTaskCompletion(current, taskId),
      {
        message: completed
          ? `Reopened "${task.title}".`
          : `Completed "${task.title}".`,
        undoMessage: completed
          ? `Marked "${task.title}" complete again.`
          : `Reopened "${task.title}".`,
        activity: {
          taskIds: [taskId],
          title: completed ? "Reopened task" : "Completed task",
          detail: task.title,
        },
      },
    );
  }

  async function handleArchiveTask(taskId: string) {
    const task = payloadRef.current?.tasks.find(
      (currentTask) => currentTask.id === taskId && !currentTask.deletedAt,
    );
    if (!task) return;
    const archived = task.status === "ARCHIVED";
    await applyUndoablePayloadUpdate(
      (current) => archiveTask(current, taskId),
      {
        message: archived
          ? `Unarchived "${task.title}".`
          : `Archived "${task.title}".`,
        undoMessage: archived
          ? `Archived "${task.title}" again.`
          : `Unarchived "${task.title}".`,
        activity: {
          taskIds: [taskId],
          title: archived ? "Unarchived task" : "Archived task",
          detail: task.title,
        },
      },
    );
  }

  async function handleRescheduleTasks(
    taskIds: string[],
    dueAt: number | null,
  ) {
    if (!taskIds.length) return;
    await applyUndoablePayloadUpdate(
      (current) => rescheduleTasksToDate(current, taskIds, dueAt),
      {
        message:
          dueAt === null
            ? `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved to no date.`
            : `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} rescheduled.`,
        undoMessage:
          dueAt === null ? "Restored due dates." : "Reverted task dates.",
        activity: {
          taskIds,
          title:
            dueAt === null
              ? taskIds.length === 1
                ? "Cleared task date"
                : "Cleared task dates"
              : taskIds.length === 1
                ? "Rescheduled task"
                : "Rescheduled tasks",
          detail:
            dueAt === null
              ? `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved to no date.`
              : `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved to a new date.`,
        },
      },
    );
  }

  async function handlePostponeTasks(taskIds: string[]) {
    if (!taskIds.length) return;
    await applyUndoablePayloadUpdate(
      (current) => postponeTasks(current, taskIds),
      {
        message: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} postponed.`,
        undoMessage: "Reverted postponed tasks.",
        activity: {
          taskIds,
          title: taskIds.length === 1 ? "Postponed task" : "Postponed tasks",
          detail: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved to the next occurrence.`,
        },
      },
    );
  }

  async function handleMoveTasksToProject(
    taskIds: string[],
    projectId: string | null,
  ) {
    if (!taskIds.length) return;
    const targetName = projectId
      ? (payloadRef.current?.projects.find(
          (project) => project.id === projectId && !project.deletedAt,
        )?.name ?? "project")
      : "Inbox";
    await applyUndoablePayloadUpdate(
      (current) => moveTasksToProject(current, taskIds, projectId),
      {
        message: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved to ${targetName}.`,
        undoMessage: "Reverted task moves.",
        activity: {
          taskIds,
          title: taskIds.length === 1 ? "Moved task" : "Moved tasks",
          detail: `Moved into ${targetName}.`,
        },
      },
    );
  }

  async function handleMoveTasksToSection(
    taskIds: string[],
    sectionId: string | null,
  ) {
    if (!taskIds.length) return;
    const targetName = sectionId
      ? (payloadRef.current?.sections.find(
          (section) => section.id === sectionId && !section.deletedAt,
        )?.name ?? "section")
      : "Loose tasks";
    await applyUndoablePayloadUpdate(
      (current) => moveTasksToSection(current, taskIds, sectionId),
      {
        message: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} moved to ${targetName}.`,
        undoMessage: "Reverted section moves.",
        activity: {
          taskIds,
          title:
            taskIds.length === 1
              ? "Moved task within project"
              : "Moved tasks within project",
          detail: `Placed into ${targetName}.`,
        },
      },
    );
  }

  async function handleSetTasksPriority(taskIds: string[], priority: Priority) {
    if (!taskIds.length) return;
    await applyUndoablePayloadUpdate(
      (current) => setPriorityForTasks(current, taskIds, priority),
      {
        message: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} set to ${priority}.`,
        undoMessage: "Reverted task priorities.",
        activity: {
          taskIds,
          title:
            taskIds.length === 1 ? "Changed priority" : "Changed priorities",
          detail: `Updated to ${priority}.`,
        },
      },
    );
  }

  async function handleDeleteTasks(taskIds: string[]) {
    if (!taskIds.length) return;
    await applyUndoablePayloadUpdate(
      (current) => deleteTasks(current, taskIds),
      {
        message: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} deleted.`,
        undoMessage: "Restored deleted tasks.",
        activity: {
          taskIds,
          title: taskIds.length === 1 ? "Deleted task" : "Deleted tasks",
          detail: `${taskIds.length} task${taskIds.length === 1 ? "" : "s"} removed.`,
        },
      },
    );
  }

  async function handleReparentTaskAsSubtask(
    draggedTaskId: string,
    parentTaskId: string,
  ) {
    const current = payloadRef.current;
    if (
      !current ||
      !canReparentTaskAsSubtask(current, draggedTaskId, parentTaskId)
    )
      return;

    const draggedTask = current.tasks.find(
      (task) => task.id === draggedTaskId && !task.deletedAt,
    );
    const parentTask = current.tasks.find(
      (task) => task.id === parentTaskId && !task.deletedAt,
    );
    if (!draggedTask || !parentTask) return;

    await applyUndoablePayloadUpdate(
      (payload) => reparentTaskAsSubtask(payload, draggedTaskId, parentTaskId),
      {
        message: `Moved "${draggedTask.title}" under "${parentTask.title}".`,
        undoMessage: `Moved "${draggedTask.title}" back.`,
        activity: {
          taskIds: [draggedTaskId, parentTaskId],
          title: "Nested task",
          detail: `${draggedTask.title} now sits under ${parentTask.title}.`,
        },
      },
    );
  }

  async function handlePromoteSubtask(taskId: string) {
    const current = payloadRef.current;
    if (!current) return;

    const task = current.tasks.find(
      (candidate) => candidate.id === taskId && !candidate.deletedAt,
    );
    if (!task?.parentTaskId) return;

    const parentTask = current.tasks.find(
      (candidate) => candidate.id === task.parentTaskId && !candidate.deletedAt,
    );
    await applyUndoablePayloadUpdate(
      (payload) => promoteSubtask(payload, taskId),
      {
        message: parentTask
          ? `Moved "${task.title}" out from "${parentTask.title}".`
          : `Promoted "${task.title}".`,
        undoMessage: `Moved "${task.title}" back.`,
        activity: {
          taskIds: [taskId, ...(parentTask ? [parentTask.id] : [])],
          title: "Promoted subtask",
          detail: parentTask
            ? `${task.title} moved out from ${parentTask.title}.`
            : task.title,
        },
      },
    );
  }

  async function handleCreateTask(
    draft: TaskDraft,
    options?: { silent?: boolean; successMessage?: string },
  ): Promise<string | null> {
    if (!draft.title.trim()) {
      showBanner("error", "Task title is required.");
      return null;
    }

    const current = payloadRef.current;
    if (!current) return null;

    const existingIds = new Set(current.tasks.map((task) => task.id));
    const nextPayload = createTask(current, draft);
    const createdTask =
      nextPayload.tasks.find((task) => !existingIds.has(task.id)) ?? null;
    await persistPayload(nextPayload, true);
    const activityId = createdTask
      ? recordActivity([createdTask.id], "Created task", createdTask.title)
      : undefined;
    if (createdTask) {
      undoActivityMapRef.current.set(activityId!, {
        previousPayload: current,
        undoMessage: `Removed "${draft.title.trim()}".`,
        taskIds: [createdTask.id],
        title: "Created task",
      });
    }
    if (!options?.silent) {
      showUndoBanner(
        options?.successMessage ?? `Task "${draft.title.trim()}" created.`,
        current,
        `Removed "${draft.title.trim()}".`,
        activityId,
      );
    }
    const onboardingState = firstRunOnboardingRef.current;
    if (
      createdTask &&
      onboardingState?.step === "quick_add" &&
      onboardingState.projectId === createdTask.projectId
    ) {
      setFirstRunOnboarding(advanceOnboardingStep(onboardingState, "today"));
      setIsQuickAddOpen(false);
      setQuickAddOverride(null);
    }
    return createdTask?.id ?? null;
  }

  async function handleCreateTaskRelative(
    anchorTaskId: string,
    position: "before" | "after",
    draft: TaskDraft,
    options?: { silent?: boolean; successMessage?: string },
  ): Promise<string | null> {
    if (!draft.title.trim()) {
      showBanner("error", "Task title is required.");
      return null;
    }

    const current = payloadRef.current;
    if (!current) return null;

    const existingIds = new Set(current.tasks.map((task) => task.id));
    const nextPayload = createTaskRelative(
      current,
      draft,
      anchorTaskId,
      position,
    );
    const createdTask =
      nextPayload.tasks.find((task) => !existingIds.has(task.id)) ?? null;
    await persistPayload(nextPayload, true);
    const activityId = createdTask
      ? recordActivity([createdTask.id], "Created task", createdTask.title)
      : undefined;
    if (createdTask) {
      undoActivityMapRef.current.set(activityId!, {
        previousPayload: current,
        undoMessage: `Removed "${createdTask.title}".`,
        taskIds: [createdTask.id],
        title: "Created task",
      });
    }
    if (!options?.silent && createdTask) {
      showUndoBanner(
        options?.successMessage ?? `Task "${createdTask.title}" created.`,
        current,
        `Removed "${createdTask.title}".`,
        activityId,
      );
    }
    const onboardingState = firstRunOnboardingRef.current;
    if (
      createdTask &&
      onboardingState?.step === "quick_add" &&
      onboardingState.projectId === createdTask.projectId
    ) {
      setFirstRunOnboarding(advanceOnboardingStep(onboardingState, "today"));
      setIsQuickAddOpen(false);
      setQuickAddOverride(null);
    }
    return createdTask?.id ?? null;
  }

  async function handleSaveTask(taskId: string, draft: TaskDraft) {
    const nextPayload = await applyUndoablePayloadUpdate(
      (current) => updateTaskFromDraft(current, taskId, draft),
      {
        message: "Task saved.",
        undoMessage: "Reverted task edits.",
        activity: {
          taskIds: [taskId],
          title: "Saved task",
          detail: draft.title.trim(),
        },
      },
    );
    const savedTask = nextPayload?.tasks.find((task) => task.id === taskId);
    if (savedTask) {
      setBanner((current) =>
        current && current.onAction
          ? { ...current, message: `Saved "${savedTask.title}".` }
          : current,
      );
    }
  }

  async function handleDuplicateTask(taskId: string): Promise<string | null> {
    const current = payloadRef.current;
    const sourceTask =
      current?.tasks.find((task) => task.id === taskId && !task.deletedAt) ??
      null;
    if (!current || !sourceTask) return null;

    const existingIds = new Set(current.tasks.map((task) => task.id));
    const nextPayload = duplicateTask(current, taskId);
    const duplicatedTask =
      nextPayload.tasks.find((task) => !existingIds.has(task.id)) ?? null;
    await persistPayload(nextPayload, true);
    const activityId = duplicatedTask
      ? recordActivity(
          [duplicatedTask.id],
          "Duplicated task",
          duplicatedTask.title,
        )
      : undefined;
    if (duplicatedTask) {
      undoActivityMapRef.current.set(activityId!, {
        previousPayload: current,
        undoMessage: `Removed "${duplicatedTask.title}".`,
        taskIds: [duplicatedTask.id],
        title: "Duplicated task",
      });
      showUndoBanner(
        `Duplicated "${sourceTask.title}".`,
        current,
        `Removed "${duplicatedTask.title}".`,
        activityId,
      );
    }
    return duplicatedTask?.id ?? null;
  }

  function handleExportJson() {
    const current = payloadRef.current;
    if (!current) return;
    downloadPayloadBackup(current);
    showBanner("success", "Downloaded a JSON backup of this workspace.");
  }

  function handleSaveBrowserBackupNow() {
    const current = payloadRef.current;
    if (!current) return;
    saveBrowserBackupSnapshot(current, false);
    showBanner("success", "Saved a browser backup snapshot.");
  }

  async function handleRestoreBrowserBackup() {
    const raw = window.localStorage.getItem("emberlist.browserBackup");
    if (!raw) {
      showBanner(
        "error",
        "No browser backup snapshot is stored on this device yet.",
      );
      return;
    }

    try {
      const backupPayload = normalizeImportedPayload(
        JSON.parse(raw),
        "Browser backup snapshot",
      );
      const current = payloadRef.current ?? (await db.getPayload());
      const mergedPayload = syncEngine.mergePayloads(current, backupPayload);
      const repaired = repairRecurringTasks(mergedPayload);
      await persistPayload(repaired.payload, true);
      const recurringMaintenance = describeRecurringMaintenance(repaired);
      showBanner(
        "success",
        recurringMaintenance
          ? `Restored the stored browser backup snapshot. ${recurringMaintenance}.`
          : "Restored the stored browser backup snapshot.",
      );
    } catch (error) {
      console.error("Failed to restore browser backup snapshot", error);
      showBanner(
        "error",
        error instanceof Error
          ? error.message
          : "Failed to restore the browser backup snapshot.",
      );
    }
  }

  useEffect(() => {
    if (
      bootState !== "ready" ||
      !syncService ||
      !cloudSession ||
      hasAutoSyncedOnLoadRef.current
    )
      return;
    hasAutoSyncedOnLoadRef.current = true;
    void runCloudSync({ interactiveAuth: false, automatic: true });
  }, [bootState, cloudSession, syncService]);

  useEffect(() => {
    if (bootState !== "ready") return;
    if (hasDismissedFirstRunWelcome) {
      if (firstRunOnboarding !== null) {
        setFirstRunOnboarding(null);
      }
      return;
    }
    if (firstRunOnboarding) return;
    if (!isWorkspaceEmpty(payload)) return;
    setFirstRunOnboarding(createInitialOnboardingState());
  }, [bootState, firstRunOnboarding, hasDismissedFirstRunWelcome, payload]);

  useEffect(() => {
    if (
      !payload ||
      !firstRunOnboarding?.projectId ||
      firstRunOnboarding.step === "setup"
    ) {
      return;
    }
    if (!getProjectById(payload, firstRunOnboarding.projectId)) {
      setFirstRunOnboarding(null);
      setHasDismissedFirstRunWelcome(true);
    }
  }, [firstRunOnboarding, payload]);

  useEffect(() => {
    const previous = previousAutoSyncStateRef.current;
    const current = {
      autoSyncEnabled,
      hasCloudSession: Boolean(cloudSession),
    };
    previousAutoSyncStateRef.current = current;

    if (bootState !== "ready" || !syncService) {
      return;
    }

    if (
      shouldRunActivationSync(previous, current) &&
      hasAutoSyncedOnLoadRef.current
    ) {
      void runCloudSync({ interactiveAuth: false, automatic: true });
      return;
    }

    if (!current.autoSyncEnabled || !current.hasCloudSession) {
      clearDebounceTimer();
      clearBackoffTimer();
      followUpSyncRequestedRef.current = false;
    }
  }, [autoSyncEnabled, bootState, cloudSession, syncService]);

  useEffect(() => {
    const handleOnline = () => {
      const shouldSync = shouldRunConnectivityRegainSync(
        isOnlineRef.current,
        true,
        {
          autoSyncEnabled: autoSyncEnabledRef.current,
          hasCloudSession: Boolean(cloudSessionRef.current),
        },
      );
      setIsOnline(true);
      if (shouldSync) {
        void runCloudSync({ interactiveAuth: false, automatic: true });
      }
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [cloudSession, syncService]);

  useEffect(() => {
    const handleFocus = () => {
      void runCloudSync({ interactiveAuth: false, automatic: true });
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        void runCloudSync({ interactiveAuth: false, automatic: true });
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [cloudSession, syncService]);

  useEffect(() => {
    if (!syncService || !cloudSession) return;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
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

  if (bootState === "loading") {
    return <LoadingScreen label="Loading your workspace..." />;
  }

  if (bootState === "error") {
    return (
      <RecoveryScreen
        message={bootError ?? "Failed to load local workspace."}
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
      <AppFrame
        payload={payload}
        banner={banner}
        onDismissBanner={() => setBanner(null)}
        onShowBanner={showBanner}
        onCloudSync={() => void handleCloudSync()}
        onResetCloudSync={() => void handleResetCloudSync()}
        onResetLocalCache={() => void handleResetLocalCache()}
        onImport={handleImport}
        onCreateTask={handleCreateTask}
        onCreateTaskRelative={(anchorTaskId, position, draft, options) =>
          handleCreateTaskRelative(anchorTaskId, position, draft, options)
        }
        onToggleTask={(taskId) => void handleToggleTask(taskId)}
        onArchiveTask={(taskId) => void handleArchiveTask(taskId)}
        onRescheduleTasks={(taskIds, dueAt) =>
          void handleRescheduleTasks(taskIds, dueAt)
        }
        onPostponeTasks={(taskIds) => void handlePostponeTasks(taskIds)}
        onMoveTasksToProject={(taskIds, projectId) =>
          void handleMoveTasksToProject(taskIds, projectId)
        }
        onMoveTasksToSection={(taskIds, sectionId) =>
          void handleMoveTasksToSection(taskIds, sectionId)
        }
        onSetTasksPriority={(taskIds, priority) =>
          void handleSetTasksPriority(taskIds, priority)
        }
        onDeleteTasks={(taskIds) => void handleDeleteTasks(taskIds)}
        onReparentTaskAsSubtask={(draggedTaskId, parentTaskId) =>
          void handleReparentTaskAsSubtask(draggedTaskId, parentTaskId)
        }
        onPromoteSubtask={(taskId) => void handlePromoteSubtask(taskId)}
        onSaveTask={handleSaveTask}
        onDuplicateTask={(taskId) => handleDuplicateTask(taskId)}
        onCreateProject={handleCreateProject}
        onUpdateProject={(projectId, updater) =>
          void handleUpdateProject(projectId, updater)
        }
        onDeleteProject={(projectId) => void handleDeleteProject(projectId)}
        onCreateSection={(projectId, name) =>
          void handleCreateSection(projectId, name)
        }
        onUpdateSection={(sectionId, updater) =>
          void handleUpdateSection(sectionId, updater)
        }
        onDeleteSection={(sectionId) => void handleDeleteSection(sectionId)}
        showCompletedToday={showCompletedToday}
        onToggleShowCompletedToday={() =>
          setShowCompletedToday((value) => !value)
        }
        showSelectionButtons={showSelectionButtons}
        onToggleShowSelectionButtons={() =>
          setShowSelectionButtons((value) => !value)
        }
        weekStartsOn={weekStartsOn}
        onWeekStartsOnChange={(value) => setWeekStartsOn(value)}
        use24HourTime={use24HourTime}
        onToggleUse24HourTime={() => setUse24HourTime((value) => !value)}
        autoSyncEnabled={autoSyncEnabled}
        onToggleAutoSyncEnabled={() => setAutoSyncEnabled((value) => !value)}
        autoBackupEnabled={autoBackupEnabled}
        onToggleAutoBackupEnabled={() =>
          setAutoBackupEnabled((value) => !value)
        }
        cloudConfigured={Boolean(syncService)}
        cloudSession={cloudSession}
        lastSyncError={lastSyncError}
        hasPendingLocalChanges={hasPendingLocalChanges}
        isOnline={isOnline}
        isSyncing={isSyncing}
        isResettingCloud={isResettingCloud}
        isResettingCache={isResettingCache}
        lastCloudSyncAt={lastCloudSyncAt}
        lastLocalBackupAt={lastLocalBackupAt}
        onExportJson={handleExportJson}
        onSaveBrowserBackupNow={handleSaveBrowserBackupNow}
        onRestoreBrowserBackup={() => void handleRestoreBrowserBackup()}
        onDisconnectCloud={() => void handleDisconnectCloud()}
        isQuickAddOpen={isQuickAddOpen}
        quickAddOverride={quickAddOverride}
        onOpenQuickAdd={(overrides) => {
          setQuickAddOverride(overrides ?? null);
          setIsQuickAddOpen(true);
        }}
        onCloseQuickAdd={() => {
          setIsQuickAddOpen(false);
          setQuickAddOverride(null);
        }}
        onboardingQuickAddExample={
          firstRunOnboarding?.step === "quick_add"
            ? firstRunOnboarding.quickAddExample
            : null
        }
        activityEntries={activityEntries}
        onUndoActivity={(activityId) => void handleUndoActivity(activityId)}
        canUndoActivity={(activityId) =>
          undoActivityMapRef.current.has(activityId)
        }
        firstRunOnboarding={firstRunOnboarding}
        onSkipOnboarding={() => {
          setFirstRunOnboarding(null);
          setHasDismissedFirstRunWelcome(true);
          setIsQuickAddOpen(false);
          setQuickAddOverride(null);
        }}
        onConnectGoogleWelcome={() => {
          setIsCloudConnectDialogOpen(true);
        }}
        onCompleteWelcomeSetup={(presetId) =>
          handleCreateOnboardingWorkspace(presetId)
        }
        onAdvanceOnboarding={(nextState) => setFirstRunOnboarding(nextState)}
        isCloudConnectDialogOpen={isCloudConnectDialogOpen}
        onCloseCloudConnectDialog={() => setIsCloudConnectDialogOpen(false)}
        onConnectCloudDialog={() => {
          void handleConnectCloudSync();
        }}
      />
    </HashRouter>
  );
}

export default App;

type AppFrameProps = WorkspaceShellProps & {
  firstRunOnboarding: FirstRunOnboardingState | null;
  onSkipOnboarding: () => void;
  onConnectGoogleWelcome: () => void;
  onCompleteWelcomeSetup: (
    presetId: OnboardingPresetId,
  ) => Promise<OnboardingSetupResult | null>;
  onAdvanceOnboarding: (state: FirstRunOnboardingState | null) => void;
  isCloudConnectDialogOpen: boolean;
  onCloseCloudConnectDialog: () => void;
  onConnectCloudDialog: () => void;
};

function AppFrame({
  firstRunOnboarding,
  onSkipOnboarding,
  onConnectGoogleWelcome,
  onCompleteWelcomeSetup,
  onAdvanceOnboarding,
  isCloudConnectDialogOpen,
  onCloseCloudConnectDialog,
  onConnectCloudDialog,
  ...workspaceShellProps
}: AppFrameProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const isPublicRoute = isPublicMarketingPath(location.pathname);
  const shouldOfferSyncOnboarding =
    workspaceShellProps.cloudConfigured && !workspaceShellProps.cloudSession;

  useEffect(() => {
    if (isPublicRoute || !firstRunOnboarding?.projectId) return;

    if (
      firstRunOnboarding.step === "project" ||
      firstRunOnboarding.step === "quick_add"
    ) {
      const projectPath = `/project/${firstRunOnboarding.projectId}`;
      if (location.pathname !== projectPath) {
        navigate(projectPath, { replace: true });
      }
      return;
    }

    if (
      (firstRunOnboarding.step === "today" ||
        firstRunOnboarding.step === "sync") &&
      location.pathname !== "/today"
    ) {
      navigate("/today", { replace: true });
    }
  }, [firstRunOnboarding, isPublicRoute, location.pathname, navigate]);

  useEffect(() => {
    if (!firstRunOnboarding || firstRunOnboarding.step !== "sync") return;
    if (!workspaceShellProps.cloudConfigured || workspaceShellProps.cloudSession) {
      onSkipOnboarding();
    }
  }, [
    firstRunOnboarding,
    onSkipOnboarding,
    workspaceShellProps.cloudConfigured,
    workspaceShellProps.cloudSession,
  ]);

  useEffect(() => {
    if (isPublicRoute || firstRunOnboarding?.step !== "quick_add") return;
    if (!firstRunOnboarding.projectId) return;
    if (workspaceShellProps.isQuickAddOpen) return;

    workspaceShellProps.onOpenQuickAdd({
      defaultProjectId: firstRunOnboarding.projectId,
      defaultSectionId: null,
      defaultDueToday: false,
    });
  }, [
    firstRunOnboarding,
    isPublicRoute,
    workspaceShellProps.isQuickAddOpen,
    workspaceShellProps.onOpenQuickAdd,
  ]);

  return (
    <>
      <WorkspaceShell {...workspaceShellProps} />

      {!isPublicRoute &&
      firstRunOnboarding?.step === "setup" &&
      !isCloudConnectDialogOpen ? (
        <OnboardingSetupDialog
          cloudConfigured={workspaceShellProps.cloudConfigured}
          onSkip={onSkipOnboarding}
          onConnectGoogle={onConnectGoogleWelcome}
          onStart={async (presetId) => {
            const result = await onCompleteWelcomeSetup(presetId);
            if (!result) return;
            navigate(`/project/${result.projectId}`);
            onAdvanceOnboarding(createOnboardingTourState(presetId, result));
          }}
        />
      ) : null}

      {!isPublicRoute &&
      firstRunOnboarding &&
      firstRunOnboarding.step !== "setup" ? (
        <OnboardingCoachmark
          step={firstRunOnboarding.step}
          quickAddExample={firstRunOnboarding.quickAddExample}
          cloudConfigured={workspaceShellProps.cloudConfigured}
          cloudSession={workspaceShellProps.cloudSession}
          onNext={() => {
            if (firstRunOnboarding.step === "project") {
              onAdvanceOnboarding(
                advanceOnboardingStep(firstRunOnboarding, "quick_add"),
              );
              return;
            }
            if (firstRunOnboarding.step === "today") {
              if (shouldOfferSyncOnboarding) {
                onAdvanceOnboarding(
                  advanceOnboardingStep(firstRunOnboarding, "sync"),
                );
              } else {
                onSkipOnboarding();
              }
              return;
            }
            if (firstRunOnboarding.step === "sync") {
              onConnectGoogleWelcome();
            }
          }}
          onSkip={onSkipOnboarding}
        />
      ) : null}

      {!isPublicRoute && isCloudConnectDialogOpen ? (
        <CloudConnectDialog
          lastSyncError={workspaceShellProps.lastSyncError}
          onClose={onCloseCloudConnectDialog}
          onConnect={onConnectCloudDialog}
        />
      ) : null}
    </>
  );
}

type WorkspaceShellProps = {
  payload: SyncPayload;
  banner: Banner | null;
  onDismissBanner: () => void;
  onShowBanner: (
    tone: Banner["tone"],
    message: string,
    options?: Pick<
      Banner,
      "actionLabel" | "onAction" | "persistOnNavigation" | "autoDismissMs"
    >,
  ) => void;
  onCloudSync: () => void;
  onResetCloudSync: () => void;
  onResetLocalCache: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onCreateTask: (
    draft: TaskDraft,
    options?: { silent?: boolean; successMessage?: string },
  ) => Promise<string | null>;
  onCreateTaskRelative: (
    anchorTaskId: string,
    position: "before" | "after",
    draft: TaskDraft,
    options?: { silent?: boolean; successMessage?: string },
  ) => Promise<string | null>;
  onToggleTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
  onMoveTasksToProject: (taskIds: string[], projectId: string | null) => void;
  onMoveTasksToSection: (taskIds: string[], sectionId: string | null) => void;
  onSetTasksPriority: (taskIds: string[], priority: Priority) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onPromoteSubtask: (taskId: string) => void;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onDuplicateTask: (taskId: string) => Promise<string | null>;
  onCreateProject: (name: string) => Promise<string | null>;
  onUpdateProject: (
    projectId: string,
    updater: (project: Project) => Project,
  ) => void;
  onDeleteProject: (projectId: string) => void;
  onCreateSection: (projectId: string, name: string) => void;
  onUpdateSection: (
    sectionId: string,
    updater: (section: Section) => Section,
  ) => void;
  onDeleteSection: (sectionId: string) => void;
  showCompletedToday: boolean;
  onToggleShowCompletedToday: () => void;
  showSelectionButtons: boolean;
  onToggleShowSelectionButtons: () => void;
  weekStartsOn: WeekStartsOn;
  onWeekStartsOnChange: (value: WeekStartsOn) => void;
  use24HourTime: boolean;
  onToggleUse24HourTime: () => void;
  autoSyncEnabled: boolean;
  onToggleAutoSyncEnabled: () => void;
  autoBackupEnabled: boolean;
  onToggleAutoBackupEnabled: () => void;
  cloudConfigured: boolean;
  cloudSession: CloudSession | null;
  lastSyncError: string | null;
  hasPendingLocalChanges: boolean;
  isOnline: boolean;
  isSyncing: boolean;
  isResettingCloud: boolean;
  isResettingCache: boolean;
  lastCloudSyncAt: number | null;
  lastLocalBackupAt: number | null;
  onExportJson: () => void;
  onSaveBrowserBackupNow: () => void;
  onRestoreBrowserBackup: () => void;
  onDisconnectCloud: () => void;
  isQuickAddOpen: boolean;
  quickAddOverride: Partial<QuickAddContext> | null;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
  onCloseQuickAdd: () => void;
  onboardingQuickAddExample: string | null;
  activityEntries: ActivityEntry[];
  onUndoActivity: (activityId: string) => void;
  canUndoActivity: (activityId: string) => boolean;
};

function WorkspaceShell({
  payload,
  banner,
  onDismissBanner,
  onShowBanner,
  onCloudSync,
  onResetCloudSync,
  onResetLocalCache,
  onImport,
  onCreateTask,
  onCreateTaskRelative,
  onToggleTask,
  onArchiveTask,
  onRescheduleTasks,
  onPostponeTasks,
  onMoveTasksToProject,
  onMoveTasksToSection,
  onSetTasksPriority,
  onDeleteTasks,
  onReparentTaskAsSubtask,
  onPromoteSubtask,
  onSaveTask,
  onDuplicateTask,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
  onCreateSection,
  onUpdateSection,
  onDeleteSection,
  showCompletedToday,
  onToggleShowCompletedToday,
  showSelectionButtons,
  onToggleShowSelectionButtons,
  weekStartsOn,
  onWeekStartsOnChange,
  use24HourTime,
  onToggleUse24HourTime,
  autoSyncEnabled,
  onToggleAutoSyncEnabled,
  autoBackupEnabled,
  onToggleAutoBackupEnabled,
  cloudConfigured,
  cloudSession,
  lastSyncError,
  hasPendingLocalChanges,
  isOnline,
  isSyncing,
  isResettingCloud,
  isResettingCache,
  lastCloudSyncAt,
  lastLocalBackupAt,
  onExportJson,
  onSaveBrowserBackupNow,
  onRestoreBrowserBackup,
  onDisconnectCloud,
  isQuickAddOpen,
  quickAddOverride,
  onOpenQuickAdd,
  onCloseQuickAdd,
  onboardingQuickAddExample,
  activityEntries,
  onUndoActivity,
  canUndoActivity,
}: WorkspaceShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const todayStartMs = useTodayStartMs();
  const previousPathRef = useRef(location.key);
  const goSequenceTimeoutRef = useRef<number | null>(null);
  const pendingGoPrefixRef = useRef(false);
  const bannerActionRef = useRef<() => Promise<void>>(async () => undefined);
  const [isBannerActionRunning, setIsBannerActionRunning] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isShortcutDialogOpen, setIsShortcutDialogOpen] = useState(false);
  const [isProjectSwitcherOpen, setIsProjectSwitcherOpen] = useState(false);
  const [isCreateProjectDialogOpen, setIsCreateProjectDialogOpen] =
    useState(false);
  const [createProjectValue, setCreateProjectValue] = useState("");
  const [isResetCloudDialogOpen, setIsResetCloudDialogOpen] = useState(false);
  const [
    isRestoreBrowserBackupDialogOpen,
    setIsRestoreBrowserBackupDialogOpen,
  ] = useState(false);
  const [focusedTaskActionMode, setFocusedTaskActionMode] =
    useState<FocusedTaskActionMode | null>(null);
  const [focusedTaskActionRect, setFocusedTaskActionRect] =
    useState<DOMRect | null>(null);
  const [focusedTaskActionTaskIds, setFocusedTaskActionTaskIds] = useState<
    string[]
  >([]);
  const todayViewData = useMemo(
    () =>
      getTodayViewData(payload, todayStartMs, endOfDay(todayStartMs).getTime()),
    [payload, todayStartMs],
  );
  const isPublicPage = isPublicMarketingPath(location.pathname);
  const title = getRouteTitle(location.pathname, payload);
  const projects = getActiveProjects(payload);
  const favoriteProjects = projects.filter((project) => project.favorite);
  const regularProjects = projects.filter((project) => !project.favorite);
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
  const quickAddContext = useMemo(
    () => ({
      ...getQuickAddContext(location.pathname, payload),
      ...(quickAddOverride ?? {}),
    }),
    [location.pathname, payload, quickAddOverride],
  );

  useEffect(() => {
    document.title = `${title} · Emberlist`;
  }, [title]);

  useEffect(() => {
    if (previousPathRef.current !== location.key) {
      if (shouldDismissBannerOnNavigation(banner)) {
        onDismissBanner();
      }
      previousPathRef.current = location.key;
    }
  }, [banner, location.key, onDismissBanner]);

  async function handleBannerAction() {
    if (!banner?.onAction || isBannerActionRunning) return;
    setIsBannerActionRunning(true);
    try {
      await banner.onAction();
    } catch (error) {
      onShowBanner(
        "error",
        error instanceof Error ? error.message : "Undo failed.",
      );
    } finally {
      setIsBannerActionRunning(false);
    }
  }

  bannerActionRef.current = handleBannerAction;

  const focusedTaskActionTasks = useMemo(
    () =>
      focusedTaskActionTaskIds
        .map((taskId) => getTaskById(payload, taskId))
        .filter((task): task is Task => task !== undefined),
    [focusedTaskActionTaskIds, payload],
  );
  const focusedTaskActionCount = focusedTaskActionTasks.length;
  const focusedTaskActionLabel =
    focusedTaskActionCount === 1
      ? `"${focusedTaskActionTasks[0]?.title ?? "task"}"`
      : `${focusedTaskActionCount} tasks`;

  function closeFocusedTaskActionDialog(
    taskIdToFocus: string | null = focusedTaskActionTaskIds[0] ?? null,
  ) {
    setFocusedTaskActionMode(null);
    setFocusedTaskActionRect(null);
    setFocusedTaskActionTaskIds([]);
    if (taskIdToFocus) {
      window.setTimeout(() => focusTaskRow(taskIdToFocus), 40);
    }
  }

  function openFocusedTaskAction(mode: FocusedTaskActionMode) {
    if (typeof document === "undefined") return;
    const activeElement = document.activeElement;
    if (!(activeElement instanceof HTMLElement)) return;
    const row = activeElement.closest<HTMLElement>('[data-task-row="true"]');
    const focusedTaskId = row?.dataset.taskId ?? null;
    if (!focusedTaskId) return;
    setFocusedTaskActionTaskIds([focusedTaskId]);
    setFocusedTaskActionRect(row?.getBoundingClientRect() ?? null);
    setFocusedTaskActionMode(mode);
  }

  function submitFocusedTaskMove(projectId: string | null) {
    if (!focusedTaskActionTaskIds.length) return;
    const taskIdToFocus = focusedTaskActionTaskIds[0] ?? null;
    onMoveTasksToProject(focusedTaskActionTaskIds, projectId);
    closeFocusedTaskActionDialog(taskIdToFocus);
  }

  function submitFocusedTaskPriority(priority: Priority) {
    if (!focusedTaskActionTaskIds.length) return;
    const taskIdToFocus = focusedTaskActionTaskIds[0] ?? null;
    onSetTasksPriority(focusedTaskActionTaskIds, priority);
    closeFocusedTaskActionDialog(taskIdToFocus);
  }

  function submitFocusedTaskDelete() {
    if (!focusedTaskActionTaskIds.length) return;
    onDeleteTasks(focusedTaskActionTaskIds);
    closeFocusedTaskActionDialog(null);
  }

  function requestResetCloudSync() {
    setIsResetCloudDialogOpen(true);
  }

  function requestRestoreBrowserBackup() {
    setIsRestoreBrowserBackupDialogOpen(true);
  }

  function requestCreateProject(initialValue = "") {
    setCreateProjectValue(initialValue);
    setIsCreateProjectDialogOpen(true);
  }

  async function submitCreateProject(nextName: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    const projectId = await onCreateProject(trimmedName);
    setIsCreateProjectDialogOpen(false);
    setCreateProjectValue("");
    if (projectId) {
      navigate(`/project/${projectId}`);
    }
  }

  useEffect(() => {
    const clearGoPrefix = () => {
      if (goSequenceTimeoutRef.current !== null) {
        window.clearTimeout(goSequenceTimeoutRef.current);
        goSequenceTimeoutRef.current = null;
      }
      pendingGoPrefixRef.current = false;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key;
      const lowerKey = key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey || event.altKey;
      const typing = isTypingTarget(event.target);

      if (pendingGoPrefixRef.current) {
        const destination = resolveGoShortcut(lowerKey);
        clearGoPrefix();
        if (destination === "__project_switcher__") {
          event.preventDefault();
          setIsProjectSwitcherOpen(true);
          return;
        }
        if (destination) {
          event.preventDefault();
          navigate(destination);
        }
        return;
      }

      if (hasOpenOverlayDialog() && key !== "Escape") {
        return;
      }

      if (
        (event.metaKey || event.ctrlKey) &&
        event.shiftKey &&
        lowerKey === "s"
      ) {
        event.preventDefault();
        navigate("/settings");
        return;
      }

      if (typing) {
        if ((event.metaKey || event.ctrlKey) && lowerKey === "k") {
          event.preventDefault();
          navigate("/search", { state: { focusSearchToken: Date.now() } });
        }
        return;
      }

      if (key === "?") {
        event.preventDefault();
        setIsShortcutDialogOpen(true);
        return;
      }

      if (key === "Escape") {
        if (isShortcutDialogOpen) {
          event.preventDefault();
          setIsShortcutDialogOpen(false);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && lowerKey === "k") {
        event.preventDefault();
        navigate("/search", { state: { focusSearchToken: Date.now() } });
        return;
      }

      if (
        !hasModifier &&
        !hasFocusedTaskRow() &&
        (lowerKey === "j" || key === "ArrowDown")
      ) {
        event.preventDefault();
        focusEdgeTaskRow("start");
        return;
      }

      if (
        !hasModifier &&
        !hasFocusedTaskRow() &&
        (lowerKey === "k" || key === "ArrowUp")
      ) {
        event.preventDefault();
        focusEdgeTaskRow("end");
        return;
      }

      if (
        ((event.metaKey || event.ctrlKey) && lowerKey === "z") ||
        (!hasModifier && lowerKey === "z")
      ) {
        if (banner?.onAction && banner.actionLabel) {
          event.preventDefault();
          void bannerActionRef.current();
        }
        return;
      }

      if (!hasModifier && lowerKey === "q") {
        event.preventDefault();
        onOpenQuickAdd();
        return;
      }

      if (
        (!hasModifier && event.shiftKey && lowerKey === "s") ||
        (!hasModifier && lowerKey === "m")
      ) {
        event.preventDefault();
        setIsSidebarCollapsed((value) => !value);
        return;
      }

      if (!hasModifier && lowerKey === "h") {
        event.preventDefault();
        navigate("/today");
        return;
      }

      if (!hasModifier && lowerKey === "g") {
        event.preventDefault();
        pendingGoPrefixRef.current = true;
        if (goSequenceTimeoutRef.current !== null) {
          window.clearTimeout(goSequenceTimeoutRef.current);
        }
        goSequenceTimeoutRef.current = window.setTimeout(() => {
          pendingGoPrefixRef.current = false;
          goSequenceTimeoutRef.current = null;
        }, 1200);
        return;
      }

      if (!hasModifier && hasFocusedTaskRow() && !isTaskSelectionModeActive()) {
        if (lowerKey === "t") {
          event.preventDefault();
          openFocusedTaskAction("reschedule");
          return;
        }
        if (lowerKey === "v") {
          event.preventDefault();
          openFocusedTaskAction("move");
          return;
        }
        if (lowerKey === "p") {
          event.preventDefault();
          openFocusedTaskAction("priority");
          return;
        }
        if (key === "Delete" || key === "Backspace") {
          event.preventDefault();
          openFocusedTaskAction("delete");
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      clearGoPrefix();
    };
  }, [
    banner,
    isBannerActionRunning,
    isShortcutDialogOpen,
    navigate,
    onOpenQuickAdd,
  ]);

  if (isPublicPage) {
    if (location.pathname === "/privacy") {
      return <PrivacyPolicyPage />;
    }
    if (location.pathname === "/terms") {
      return <TermsOfServicePage />;
    }
    return <MarketingHomePage />;
  }

  return (
    <div className="min-h-screen bg-[var(--app-shell-bg)] text-[#202020]">
      <div className="flex min-h-screen flex-col md:flex-row">
        <aside
          className={`hidden shrink-0 border-r border-[var(--app-shell-border)] bg-[var(--app-shell-bg-sidebar)] px-3 py-3 transition-[width] duration-200 md:flex md:flex-col ${isSidebarCollapsed ? "w-[92px]" : "w-[300px]"}`}
        >
          <div className="flex items-center justify-between rounded-[16px] px-2 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#4ea0d8] text-sm font-semibold text-white">
                {workspaceIdentity.initial}
              </div>
              <div
                className={`flex items-center gap-1 text-sm font-semibold text-[#2b2b2b] ${isSidebarCollapsed ? "hidden" : ""}`}
              >
                <span>{workspaceIdentity.label}</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => onOpenQuickAdd()}
            className={`mt-3 flex rounded-[10px] px-3 py-2 text-sm font-semibold text-[#dc4c3e] transition hover:bg-[#fff1ed] ${isSidebarCollapsed ? "justify-center" : "items-center gap-2"}`}
            title="Add task (Q)"
          >
            <Plus size={16} />
            <span className={isSidebarCollapsed ? "hidden" : ""}>Add task</span>
          </button>

          <nav className="mt-3 space-y-0.5">
            <RailLink
              to="/search"
              icon={Search}
              label="Search"
              collapsed={isSidebarCollapsed}
            />
            <RailLink
              to="/inbox"
              icon={ListTodo}
              label="Inbox"
              count={getInboxTasks(payload).length}
              collapsed={isSidebarCollapsed}
            />
            <RailLink
              to="/today"
              icon={Home}
              label="Today"
              count={todayViewData.overdue.length + todayViewData.today.length}
              collapsed={isSidebarCollapsed}
            />
            <RailLink
              to="/upcoming"
              icon={Calendar}
              label="Upcoming"
              collapsed={isSidebarCollapsed}
            />
            <RailLink
              to="/settings"
              icon={Settings}
              label="Settings"
              collapsed={isSidebarCollapsed}
            />
          </nav>

          {favoriteProjects.length ? (
            <div className={`mt-8 ${isSidebarCollapsed ? "hidden" : ""}`}>
              <p className="px-3 text-xs font-semibold text-[#7e7a76]">
                Favorites
              </p>
              <div className="mt-2 space-y-0.5">
                {favoriteProjects.map((project) => (
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
          ) : null}

          <div
            className={`mt-8 flex items-center justify-between px-3 ${isSidebarCollapsed ? "hidden" : ""}`}
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-[#5f5b57]">
                My Projects
              </p>
            </div>
            <button
              type="button"
              onClick={() => requestCreateProject()}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] text-[#6D5C50] transition hover:border-[#EE6A3C]/40 hover:bg-[var(--app-surface-soft)] hover:text-[#1E2D2F]"
              title="Create project"
              aria-label="Create project"
            >
              <Plus size={14} />
            </button>
          </div>
          <div
            className={`mt-2 flex-1 space-y-0.5 overflow-y-auto ${isSidebarCollapsed ? "hidden" : ""}`}
          >
            {regularProjects.map((project) => (
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

          <div
            data-onboarding-target="sidebar-cloud-sync"
            className={`mt-4 rounded-[18px] border border-[#ece7e3] bg-[var(--app-surface)] px-3 py-3 ${isSidebarCollapsed ? "hidden" : ""}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#2b2b2b]">Cloud sync</p>
              <StatusPill label={cloudStatus.label} tone={cloudStatus.tone} />
            </div>
            <p className="mt-2 text-xs leading-5 text-[#7a746d]">
              {cloudSession?.email ??
                "Connect Google Drive to keep this workspace synced across browsers and devices."}
            </p>
            <button
              onClick={onCloudSync}
              disabled={isSyncing || !cloudConfigured}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#dc4c3e] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c84335] disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSyncing ? (
                <RefreshCw size={16} className="animate-spin" />
              ) : (
                <Cloud size={16} />
              )}
              <span>
                {isSyncing
                  ? "Syncing..."
                  : cloudSession
                    ? "Sync"
                    : "Connect Google Drive"}
              </span>
            </button>
            {cloudSession ? (
              <button
                onClick={onDisconnectCloud}
                className="mt-2 w-full rounded-lg border border-[var(--app-shell-border)] bg-[var(--app-shell-bg-card)] px-4 py-2.5 text-sm font-semibold text-[#2b2b2b] transition hover:bg-[var(--app-surface)]"
              >
                Disconnect
              </button>
            ) : null}
          </div>

          <div
            className={`mt-3 flex items-center justify-center gap-3 px-2 pb-1 text-[11px] text-[#b3aaa2] ${isSidebarCollapsed ? "hidden" : ""}`}
          >
            <NavLink to="/privacy" className="transition hover:text-[#7d6d62]">
              Privacy
            </NavLink>
            <span aria-hidden="true">·</span>
            <NavLink to="/terms" className="transition hover:text-[#7d6d62]">
              Terms
            </NavLink>
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="sticky top-0 z-20 border-b border-[var(--app-shell-border)] bg-[color-mix(in_srgb,var(--app-shell-bg)_95%,transparent)] px-4 py-4 backdrop-blur md:px-8">
            <div className="mx-auto flex w-full max-w-[1240px] items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9d6b54] md:hidden">
                  Emberlist
                </p>
                <h2 className="text-2xl font-semibold text-[#202020]">
                  {title}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onCloudSync}
                  disabled={isSyncing}
                  className={`flex items-center gap-2 rounded-lg border border-[#ece7e3] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#2b2b2b] transition hover:bg-[#f8f5f2] disabled:cursor-not-allowed disabled:opacity-70 ${isSidebarCollapsed ? "" : "md:hidden"}`}
                >
                  {isSyncing ? (
                    <RefreshCw size={16} className="animate-spin" />
                  ) : (
                    <Cloud size={16} />
                  )}
                  <span>{isSyncing ? "Syncing..." : "Sync"}</span>
                </button>
                <button
                  onClick={() => onOpenQuickAdd()}
                  className="flex items-center gap-2 rounded-lg bg-[#dc4c3e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c84335]"
                >
                  <Plus size={16} />
                  <span className="sm:hidden">Add</span>
                  <span className="hidden sm:inline">Quick add</span>
                </button>
              </div>
            </div>
            {banner ? (
              <div
                className={`mx-auto mt-4 flex w-full max-w-[1240px] items-start justify-between gap-3 rounded-lg px-4 py-3 text-sm ${bannerClasses(banner.tone)}`}
              >
                <p>{banner.message}</p>
                <div className="flex items-center gap-2">
                  {banner.actionLabel && banner.onAction ? (
                    <button
                      type="button"
                      onClick={() => void handleBannerAction()}
                      disabled={isBannerActionRunning}
                      className="rounded-md border border-black/10 bg-[var(--app-surface)]/70 px-3 py-1 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isBannerActionRunning
                        ? `${banner.actionLabel}...`
                        : banner.actionLabel}
                    </button>
                  ) : null}
                  <button
                    onClick={onDismissBanner}
                    className="rounded-lg p-1 transition hover:bg-black/5"
                    aria-label="Dismiss status message"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            ) : null}
          </header>

          <main className="flex-1 scroll-pb-32 px-4 pb-[calc(8.75rem+env(safe-area-inset-bottom))] pt-6 md:px-8 md:pb-10">
            <div className="mx-auto w-full max-w-[1240px]">
              <Routes>
                <Route path="/" element={<Navigate to="/today" replace />} />
                <Route
                  path="/today"
                  element={
                    <TodayPage
                      payload={payload}
                      showCompletedToday={showCompletedToday}
                      showSelectionButtons={showSelectionButtons}
                      onOpenQuickAdd={onOpenQuickAdd}
                      onToggleTask={onToggleTask}
                      onArchiveTask={onArchiveTask}
                      onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                      onRescheduleTasks={onRescheduleTasks}
                      onPostponeTasks={onPostponeTasks}
                      onMoveTasksToProject={onMoveTasksToProject}
                      onMoveTasksToSection={onMoveTasksToSection}
                      onSetTasksPriority={onSetTasksPriority}
                      onDeleteTasks={onDeleteTasks}
                      onPromoteSubtask={onPromoteSubtask}
                      onSaveTask={onSaveTask}
                      onDuplicateTask={onDuplicateTask}
                    />
                  }
                />
                <Route
                  path="/upcoming"
                  element={
                    <UpcomingPage
                      payload={payload}
                      showSelectionButtons={showSelectionButtons}
                      onOpenQuickAdd={onOpenQuickAdd}
                      onToggleTask={onToggleTask}
                      onArchiveTask={onArchiveTask}
                      onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                      onRescheduleTasks={onRescheduleTasks}
                      onPostponeTasks={onPostponeTasks}
                      onMoveTasksToProject={onMoveTasksToProject}
                      onMoveTasksToSection={onMoveTasksToSection}
                      onSetTasksPriority={onSetTasksPriority}
                      onDeleteTasks={onDeleteTasks}
                      onPromoteSubtask={onPromoteSubtask}
                      onSaveTask={onSaveTask}
                      onDuplicateTask={onDuplicateTask}
                    />
                  }
                />
                <Route
                  path="/search"
                  element={
                    <SearchPage
                      payload={payload}
                      showSelectionButtons={showSelectionButtons}
                      onOpenQuickAdd={onOpenQuickAdd}
                      onToggleTask={onToggleTask}
                      onArchiveTask={onArchiveTask}
                      onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                      onRescheduleTasks={onRescheduleTasks}
                      onPostponeTasks={onPostponeTasks}
                      onMoveTasksToProject={onMoveTasksToProject}
                      onMoveTasksToSection={onMoveTasksToSection}
                      onSetTasksPriority={onSetTasksPriority}
                      onDeleteTasks={onDeleteTasks}
                      onPromoteSubtask={onPromoteSubtask}
                      onSaveTask={onSaveTask}
                      onDuplicateTask={onDuplicateTask}
                    />
                  }
                />
                <Route
                  path="/search/no-due"
                  element={
                    <SearchPage
                      payload={payload}
                      showSelectionButtons={showSelectionButtons}
                      onOpenQuickAdd={onOpenQuickAdd}
                      onToggleTask={onToggleTask}
                      onArchiveTask={onArchiveTask}
                      onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                      onRescheduleTasks={onRescheduleTasks}
                      onPostponeTasks={onPostponeTasks}
                      onMoveTasksToProject={onMoveTasksToProject}
                      onMoveTasksToSection={onMoveTasksToSection}
                      onSetTasksPriority={onSetTasksPriority}
                      onDeleteTasks={onDeleteTasks}
                      onPromoteSubtask={onPromoteSubtask}
                      onSaveTask={onSaveTask}
                      onDuplicateTask={onDuplicateTask}
                      forcedFilter="NO_DUE"
                    />
                  }
                />
                <Route
                  path="/browse"
                  element={<Navigate to="/today" replace />}
                />
                <Route
                  path="/inbox"
                  element={
                    <InboxPage
                      payload={payload}
                      showSelectionButtons={showSelectionButtons}
                      onOpenQuickAdd={onOpenQuickAdd}
                      onToggleTask={onToggleTask}
                      onArchiveTask={onArchiveTask}
                      onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                      onRescheduleTasks={onRescheduleTasks}
                      onPostponeTasks={onPostponeTasks}
                      onMoveTasksToProject={onMoveTasksToProject}
                      onMoveTasksToSection={onMoveTasksToSection}
                      onSetTasksPriority={onSetTasksPriority}
                      onDeleteTasks={onDeleteTasks}
                      onPromoteSubtask={onPromoteSubtask}
                      onSaveTask={onSaveTask}
                      onDuplicateTask={onDuplicateTask}
                    />
                  }
                />
                <Route
                  path="/project/:projectId"
                  element={
                    <ProjectPage
                      payload={payload}
                      showSelectionButtons={showSelectionButtons}
                      onSaveTask={onSaveTask}
                      onArchiveTask={onArchiveTask}
                      onCreateSection={onCreateSection}
                      onUpdateProject={onUpdateProject}
                      onDeleteProject={onDeleteProject}
                      onUpdateSection={onUpdateSection}
                      onDeleteSection={onDeleteSection}
                      onToggleTask={onToggleTask}
                      onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                      onRescheduleTasks={onRescheduleTasks}
                      onPostponeTasks={onPostponeTasks}
                      onMoveTasksToProject={onMoveTasksToProject}
                      onMoveTasksToSection={onMoveTasksToSection}
                      onSetTasksPriority={onSetTasksPriority}
                      onDeleteTasks={onDeleteTasks}
                      onPromoteSubtask={onPromoteSubtask}
                      onDuplicateTask={onDuplicateTask}
                      onOpenQuickAdd={onOpenQuickAdd}
                    />
                  }
                />
                <Route
                  path="/task/:taskId"
                  element={
                    <LegacyTaskRouteRedirect
                      payload={payload}
                      todayStartMs={todayStartMs}
                      onOpenQuickAdd={onOpenQuickAdd}
                    />
                  }
                />
                <Route
                  path="/task/:taskId/activity"
                  element={
                    <TaskActivityPage
                      payload={payload}
                      todayStartMs={todayStartMs}
                      activityEntries={activityEntries}
                      onUndoActivity={onUndoActivity}
                      canUndoActivity={canUndoActivity}
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
                      showSelectionButtons={showSelectionButtons}
                      onToggleShowSelectionButtons={
                        onToggleShowSelectionButtons
                      }
                      weekStartsOn={weekStartsOn}
                      onWeekStartsOnChange={onWeekStartsOnChange}
                      use24HourTime={use24HourTime}
                      onToggleUse24HourTime={onToggleUse24HourTime}
                      autoSyncEnabled={autoSyncEnabled}
                      onToggleAutoSyncEnabled={onToggleAutoSyncEnabled}
                      autoBackupEnabled={autoBackupEnabled}
                      onToggleAutoBackupEnabled={onToggleAutoBackupEnabled}
                      onDisconnectCloud={onDisconnectCloud}
                      onResetCloudSync={requestResetCloudSync}
                      onResetLocalCache={onResetLocalCache}
                      onImport={onImport}
                      onExportJson={onExportJson}
                      onSaveBrowserBackupNow={onSaveBrowserBackupNow}
                      onRestoreBrowserBackup={requestRestoreBrowserBackup}
                      isSyncing={isSyncing}
                      isResettingCloud={isResettingCloud}
                      isResettingCache={isResettingCache}
                      lastCloudSyncAt={lastCloudSyncAt}
                      lastLocalBackupAt={lastLocalBackupAt}
                    />
                  }
                />
              </Routes>
            </div>
          </main>
        </div>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--app-shell-border)] bg-[color-mix(in_srgb,var(--app-shell-bg)_95%,transparent)] px-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          <BottomLink to="/today" icon={Home} label="Today" />
          <BottomLink to="/inbox" icon={ListTodo} label="Inbox" />
          <BottomLink to="/upcoming" icon={Calendar} label="Upcoming" />
          <BottomLink to="/search" icon={Search} label="Search" />
          <BottomLink to="/settings" icon={Settings} label="Settings" />
        </div>
      </nav>

      {isQuickAddOpen ? (
        <QuickAddDialog
          payload={payload}
          context={quickAddContext}
          onClose={onCloseQuickAdd}
          onCreateTask={onCreateTask}
          onCreateTaskRelative={onCreateTaskRelative}
          onSaveTask={onSaveTask}
          onboardingExample={onboardingQuickAddExample}
          onShowBanner={onShowBanner}
        />
      ) : null}

      {isShortcutDialogOpen ? (
        <KeyboardShortcutsDialog
          onClose={() => setIsShortcutDialogOpen(false)}
        />
      ) : null}

      {isProjectSwitcherOpen ? (
        <ProjectSwitcherDialog
          payload={payload}
          onClose={() => setIsProjectSwitcherOpen(false)}
          onOpenProject={(projectId) => navigate(`/project/${projectId}`)}
          onCreateProject={onCreateProject}
        />
      ) : null}

      {isCreateProjectDialogOpen ? (
        <TextInputDialog
          title="Create project"
          description="Create a project and open it immediately."
          label="Project name"
          value={createProjectValue}
          onChange={setCreateProjectValue}
          onClose={() => {
            setIsCreateProjectDialogOpen(false);
            setCreateProjectValue("");
          }}
          onSubmit={(value) => void submitCreateProject(value)}
          submitLabel="Create project"
        />
      ) : null}

      {isResetCloudDialogOpen ? (
        <ConfirmDialog
          title="Reset cloud sync"
          description="Delete all Emberlist cloud sync files in Google Drive app data? Your local web data will stay intact."
          confirmLabel={isResettingCloud ? "Resetting..." : "Reset cloud sync"}
          tone="destructive"
          disabled={isResettingCloud}
          onClose={() => setIsResetCloudDialogOpen(false)}
          onConfirm={() => {
            setIsResetCloudDialogOpen(false);
            void onResetCloudSync();
          }}
        />
      ) : null}

      {isRestoreBrowserBackupDialogOpen ? (
        <ConfirmDialog
          title="Restore browser backup"
          description="Restore the last browser backup snapshot into this workspace?"
          confirmLabel="Restore backup"
          onClose={() => setIsRestoreBrowserBackupDialogOpen(false)}
          onConfirm={() => {
            setIsRestoreBrowserBackupDialogOpen(false);
            void onRestoreBrowserBackup();
          }}
        />
      ) : null}

      {focusedTaskActionMode === "reschedule" ? (
        <RescheduleDialog
          title="Reschedule task"
          description={`Choose a new date for ${focusedTaskActionLabel}.`}
          tasks={focusedTaskActionTasks}
          anchorRect={focusedTaskActionRect}
          onClose={() => closeFocusedTaskActionDialog()}
          onRescheduleTasks={onRescheduleTasks}
          onPostponeTasks={onPostponeTasks}
        />
      ) : null}

      {focusedTaskActionMode === "move" ? (
        <ChoiceDialog
          title="Move task"
          description={`Move ${focusedTaskActionLabel} into a project or back to Inbox.`}
          onClose={() => closeFocusedTaskActionDialog()}
        >
          <div className="flex flex-wrap gap-2">
            <button
              data-dialog-autofocus="true"
              type="button"
              onClick={() => submitFocusedTaskMove(null)}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
            >
              Inbox
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => submitFocusedTaskMove(project.id)}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {project.name}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {focusedTaskActionMode === "priority" ? (
        <ChoiceDialog
          title="Change priority"
          description={`Update the priority for ${focusedTaskActionLabel}.`}
          onClose={() => closeFocusedTaskActionDialog()}
          anchorRect={focusedTaskActionRect}
        >
          <div className="flex flex-wrap gap-2 text-sm justify-center">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((priority) => (
              <button
                key={priority}
                data-dialog-autofocus={priority === "P1" ? "true" : undefined}
                type="button"
                onClick={() => submitFocusedTaskPriority(priority)}
                className="rounded-lg border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-3 py-1.5 font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {priority}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {focusedTaskActionMode === "delete" ? (
        <ChoiceDialog
          title="Delete task"
          description={`Delete ${focusedTaskActionLabel}? This syncs as a tombstone.`}
          onClose={() => closeFocusedTaskActionDialog()}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => closeFocusedTaskActionDialog()}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitFocusedTaskDelete}
                className="rounded-full bg-[#B64B28] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9e4122]"
              >
                Delete task
              </button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

const LEGAL_LAST_UPDATED = "April 11, 2026";
const SUPPORT_EMAIL = "codexemberlistwebdev@gmail.com";

function PublicSiteLayout({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[#faf8f6] text-[#1e2d2f]">
      <header className="border-b border-[#ece7e3] bg-[#fffdfb]">
        <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-5 py-4 md:px-8">
          <NavLink to="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#dc4c3e] text-base font-semibold text-white">
              E
            </div>
            <div>
              <p className="text-base font-semibold text-[#1e2d2f]">
                Emberlist
              </p>
              <p className="text-xs text-[#7a746d]">
                Offline-first tasks with Google Drive sync
              </p>
            </div>
          </NavLink>
          <div className="flex items-center gap-2">
            <NavLink
              to="/privacy"
              className="rounded-full px-4 py-2 text-sm font-semibold text-[#6d5c50] transition hover:bg-[#f5efe9]"
            >
              Privacy
            </NavLink>
            <NavLink
              to="/terms"
              className="rounded-full px-4 py-2 text-sm font-semibold text-[#6d5c50] transition hover:bg-[#f5efe9]"
            >
              Terms
            </NavLink>
            <NavLink
              to="/today"
              className="rounded-full bg-[#dc4c3e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c84335]"
            >
              Open app
            </NavLink>
          </div>
        </div>
      </header>

      <main className="px-5 py-10 md:px-8 md:py-14">
        <div className="mx-auto w-full max-w-[1120px]">
          <div className="max-w-[760px]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-[#b1775c]">
              {eyebrow}
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-[#1e2d2f] md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 text-lg leading-8 text-[#6d5c50]">
              {description}
            </p>
          </div>
          <div className="mt-10">{children}</div>
        </div>
      </main>
    </div>
  );
}

function PublicSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[#e1d5ca] bg-[var(--app-surface)] p-6 shadow-sm">
      <h2 className="text-xl font-semibold text-[#1e2d2f]">{title}</h2>
      <div className="mt-4 space-y-4 text-sm leading-7 text-[#4d4a45]">
        {children}
      </div>
    </section>
  );
}

function MarketingHomePage() {
  return (
    <PublicSiteLayout
      eyebrow="Task management"
      title="Emberlist keeps your tasks local-first and syncs through your own Google Drive."
      description="Emberlist is a personal task manager for people who want fast local task editing, recurring work, and cross-device sync without handing their whole workspace to a custom backend."
    >
      <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <PublicSection title="What Emberlist does">
          <p>
            Emberlist stores your tasks locally on each device so the app stays
            usable offline. When you connect Google Drive, Emberlist syncs the
            workspace through your personal Google Drive app-data area.
          </p>
          <p>
            The app is built for personal task planning: projects, sections,
            reminders, recurrence, subtasks, quick capture, and keyboard-heavy
            desktop workflows.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <NavLink
              to="/today"
              className="rounded-full bg-[#dc4c3e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c84335]"
            >
              Open Emberlist
            </NavLink>
            <NavLink
              to="/privacy"
              className="rounded-full border border-[#e1d5ca] bg-[#fbf7f3] px-5 py-2.5 text-sm font-semibold text-[#1e2d2f] transition hover:bg-[#f4ede7]"
            >
              Read privacy policy
            </NavLink>
          </div>
        </PublicSection>

        <PublicSection title="How sync works">
          <ul className="space-y-3">
            <li>
              1. Emberlist writes your workspace into local browser or device
              storage first.
            </li>
            <li>
              2. If you connect Google Drive, Emberlist syncs an app-specific
              file in your Drive appData folder.
            </li>
            <li>
              3. Emberlist does not browse or manage your normal Drive files.
            </li>
            <li>
              4. You can disconnect Google Drive and continue using the app
              locally.
            </li>
          </ul>
        </PublicSection>

        <PublicSection title="Data handling summary">
          <ul className="space-y-3">
            <li>
              Google account data used: basic profile identity needed to show
              which account is connected.
            </li>
            <li>
              Google Drive data used: only Emberlist&apos;s own sync file in the
              appData folder.
            </li>
            <li>
              Data shared or sold: Emberlist does not sell user task data.
            </li>
            <li>Support contact: {SUPPORT_EMAIL}</li>
          </ul>
        </PublicSection>

        <PublicSection title="Useful links">
          <div className="flex flex-col gap-3">
            <NavLink
              to="/terms"
              className="font-semibold text-[#dc4c3e] transition hover:text-[#c84335]"
            >
              Terms of service
            </NavLink>
            <NavLink
              to="/privacy"
              className="font-semibold text-[#dc4c3e] transition hover:text-[#c84335]"
            >
              Privacy policy
            </NavLink>
            <NavLink
              to="/today"
              className="font-semibold text-[#dc4c3e] transition hover:text-[#c84335]"
            >
              Open the app
            </NavLink>
          </div>
        </PublicSection>
      </div>
    </PublicSiteLayout>
  );
}

function PrivacyPolicyPage() {
  return (
    <PublicSiteLayout
      eyebrow="Privacy policy"
      title="How Emberlist stores and uses your data."
      description={`Last updated ${LEGAL_LAST_UPDATED}. This page explains what data Emberlist uses, where it is stored, and what happens when you connect Google Drive sync.`}
    >
      <div className="grid gap-5">
        <PublicSection title="What Emberlist collects">
          <p>
            Emberlist stores the task data you create in the app, including
            tasks, projects, sections, reminders, recurrence settings, and
            related task metadata.
          </p>
          <p>
            If you connect Google Drive sync, Emberlist also reads your Google
            account email address and basic profile name so the app can show
            which Google account is currently connected.
          </p>
        </PublicSection>

        <PublicSection title="How data is stored">
          <p>
            On the web, Emberlist stores workspace data locally in your browser.
            On supported clients, it may also store workspace data locally on
            your device.
          </p>
          <p>
            If you enable Google Drive sync, Emberlist stores a sync file in
            your Google Drive appData folder. That folder is reserved for
            app-specific data and is not used to access your ordinary Drive
            files.
          </p>
        </PublicSection>

        <PublicSection title="How Google Drive access is used">
          <p>Emberlist uses Google Drive access only to:</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>create the Emberlist sync file in your appData folder</li>
            <li>read the current sync file</li>
            <li>
              update or delete the Emberlist sync file when sync settings change
            </li>
          </ul>
          <p>
            Emberlist does not use Google Drive access to browse, read, or
            modify your general Drive documents.
          </p>
        </PublicSection>

        <PublicSection title="How Emberlist uses your data">
          <ul className="list-disc space-y-2 pl-5">
            <li>to show your tasks and projects inside the app</li>
            <li>to keep your local workspace usable offline</li>
            <li>
              to sync your workspace between devices when you enable Google
              Drive sync
            </li>
            <li>to show which account is connected for sync</li>
          </ul>
        </PublicSection>

        <PublicSection title="Sharing and retention">
          <p>
            Emberlist does not sell your personal data. Your data is stored
            locally and, if enabled, inside your own Google Drive appData
            storage.
          </p>
          <p>
            You can disconnect Google Drive sync, reset cloud sync, clear local
            browser data, or export your workspace from the app. Data retention
            therefore depends largely on the storage you choose to keep.
          </p>
        </PublicSection>

        <PublicSection title="Contact">
          <p>
            Questions about privacy or Google Drive sync can be sent to{" "}
            {SUPPORT_EMAIL}.
          </p>
        </PublicSection>
      </div>
    </PublicSiteLayout>
  );
}

function TermsOfServicePage() {
  return (
    <PublicSiteLayout
      eyebrow="Terms of service"
      title="Terms for using Emberlist."
      description={`Last updated ${LEGAL_LAST_UPDATED}. These terms are intentionally short and written to match the current state of the app.`}
    >
      <div className="grid gap-5">
        <PublicSection title="Use of the service">
          <p>
            Emberlist is a task-management application. You may use it to
            create, edit, organize, and sync personal or work task data.
          </p>
          <p>
            You agree not to use Emberlist in a way that breaks the service,
            interferes with other users, or violates applicable law.
          </p>
        </PublicSection>

        <PublicSection title="Accounts and sync">
          <p>
            Google Drive sync is optional. If you choose to connect Google
            Drive, you are responsible for the Google account you authorize and
            for the data stored there.
          </p>
          <p>
            You can disconnect sync at any time. Emberlist may continue to store
            your workspace locally on the device or browser you are using.
          </p>
        </PublicSection>

        <PublicSection title="Availability and backups">
          <p>
            Emberlist is provided on an as-is and as-available basis. Features
            may change, and sync or storage failures can happen.
          </p>
          <p>
            You are responsible for keeping backups of data you consider
            important. Emberlist includes local export and backup controls for
            that reason.
          </p>
        </PublicSection>

        <PublicSection title="Liability">
          <p>
            To the maximum extent allowed by law, Emberlist is not liable for
            indirect, incidental, special, or consequential damages, including
            loss of data, interruption of work, or other business or personal
            losses resulting from use of the app.
          </p>
        </PublicSection>

        <PublicSection title="Changes and contact">
          <p>
            These terms may be updated as Emberlist changes. The page date will
            be updated when that happens.
          </p>
          <p>Questions about these terms can be sent to {SUPPORT_EMAIL}.</p>
        </PublicSection>
      </div>
    </PublicSiteLayout>
  );
}

function buildFeedbackMailto(
  subject: string,
  pathname: string,
  cloudSession: CloudSession | null,
) {
  const userAgent =
    typeof navigator === "undefined" ? "unknown" : navigator.userAgent;
  const body = [
    "What happened?",
    "",
    "",
    "What did you expect?",
    "",
    "",
    "Route:",
    pathname,
    "",
    "Connected account:",
    cloudSession?.email ?? "none",
    "",
    "Browser:",
    userAgent,
  ].join("\n");
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function TodayPage({
  payload,
  showCompletedToday,
  showSelectionButtons,
  onOpenQuickAdd,
  onToggleTask,
  onArchiveTask,
  onReparentTaskAsSubtask,
  onRescheduleTasks,
  onPostponeTasks,
  onMoveTasksToProject,
  onMoveTasksToSection,
  onSetTasksPriority,
  onDeleteTasks,
  onPromoteSubtask,
  onSaveTask,
  onDuplicateTask,
}: {
  payload: SyncPayload;
  showCompletedToday: boolean;
  showSelectionButtons: boolean;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
  onToggleTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
  onMoveTasksToProject: (taskIds: string[], projectId: string | null) => void;
  onMoveTasksToSection: (taskIds: string[], sectionId: string | null) => void;
  onSetTasksPriority: (taskIds: string[], priority: Priority) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onPromoteSubtask: (taskId: string) => void;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onDuplicateTask: (taskId: string) => Promise<string | null>;
}) {
  const todayStartMs = useTodayStartMs();
  const openTaskEditor = (taskId: string) =>
    onOpenQuickAdd({ editTaskId: taskId });
  const data = useMemo(
    () =>
      getTodayViewData(payload, todayStartMs, endOfDay(todayStartMs).getTime()),
    [payload, todayStartMs],
  );
  const projects = useMemo(() => getActiveProjects(payload), [payload]);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeDialog, setActiveDialog] = useState<
    | null
    | "reschedule-selected"
    | "reschedule-overdue"
    | "move"
    | "priority"
    | "delete"
  >(null);
  const [rowActionState, setRowActionState] = useState<{
    mode: "reschedule" | "priority" | "deadline" | "reminders" | "move";
    taskId: string;
    anchorRect?: DOMRect | null;
  } | null>(null);
  const visibleTasks = useMemo(
    () =>
      showCompletedToday
        ? [...data.overdue, ...data.today, ...data.completedToday]
        : [...data.overdue, ...data.today],
    [data.completedToday, data.overdue, data.today, showCompletedToday],
  );
  const visibleTaskIds = useMemo(
    () => new Set(visibleTasks.map((task) => task.id)),
    [visibleTasks],
  );
  const selectedIds = useMemo(
    () =>
      Array.from(selectedTaskIds).filter((taskId) =>
        visibleTaskIds.has(taskId),
      ),
    [selectedTaskIds, visibleTaskIds],
  );
  const selectedTasks = useMemo(
    () =>
      selectedIds
        .map(
          (taskId) => visibleTasks.find((task) => task.id === taskId) ?? null,
        )
        .filter((task): task is Task => task !== null),
    [selectedIds, visibleTasks],
  );
  const selectedCount = selectedIds.length;

  function clearSelection() {
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }

  function toggleSelection(taskId: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function openSelection() {
    setSelectionMode(true);
  }

  function openDateDialog(mode: "reschedule-selected" | "reschedule-overdue") {
    setActiveDialog(mode);
  }

  function closeDialog() {
    setActiveDialog(null);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectionMode(true);
        setSelectedTaskIds(new Set(visibleTasks.map((task) => task.id)));
        return;
      }

      if (selectionMode && !activeDialog) {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "t"
        ) {
          event.preventDefault();
          openDateDialog("reschedule-selected");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "v"
        ) {
          event.preventDefault();
          setActiveDialog("move");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "p"
        ) {
          event.preventDefault();
          setActiveDialog("priority");
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          setActiveDialog("delete");
          return;
        }
      }

      if (event.key === "Escape") {
        if (activeDialog) {
          event.preventDefault();
          closeDialog();
          return;
        }
        if (selectionMode) {
          event.preventDefault();
          clearSelection();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, selectionMode, visibleTasks]);

  function submitMove(projectId: string | null) {
    if (!selectedIds.length) return;
    onMoveTasksToProject(selectedIds, projectId);
    closeDialog();
    clearSelection();
  }

  function submitPriority(priority: Priority) {
    if (!selectedIds.length) return;
    onSetTasksPriority(selectedIds, priority);
    closeDialog();
    clearSelection();
  }

  function submitDelete() {
    if (!selectedIds.length) return;
    onDeleteTasks(selectedIds);
    closeDialog();
    clearSelection();
  }

  function renderTaskRowActions(task: Task) {
    if (task.status !== "OPEN") return null;
    return (
      <TaskRowActions
        payload={payload}
        task={task}
        actionState={rowActionState}
        onSetActionState={setRowActionState}
        onSaveTask={onSaveTask}
        onOpenQuickAdd={onOpenQuickAdd}
        onArchiveTask={onArchiveTask}
        onRescheduleTasks={onRescheduleTasks}
        onPostponeTasks={onPostponeTasks}
        onMoveTasksToProject={onMoveTasksToProject}
        onMoveTasksToSection={onMoveTasksToSection}
        onSetTasksPriority={onSetTasksPriority}
        onDeleteTasks={onDeleteTasks}
        onDuplicateTask={onDuplicateTask}
      />
    );
  }

  return (
    <div
      className="space-y-6"
      data-task-selection-mode={selectionMode ? "true" : undefined}
    >
      <HeroCard
        eyebrow="Focus"
        title=""
        description="Review what is due now, what slipped past due, and what you already finished today."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {showSelectionButtons || selectionMode ? (
              <button
                type="button"
                onClick={() =>
                  selectionMode ? clearSelection() : openSelection()
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectionMode
                    ? "border border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28] hover:bg-[#FDE9E1]"
                    : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                {selectionMode ? "Cancel selection" : "Select tasks"}
              </button>
            ) : null}
            {selectionMode ? (
              <span className="rounded-full bg-[var(--app-surface-soft)] px-3 py-2 text-sm font-semibold text-[#6D5C50]">
                {selectedCount} selected
              </span>
            ) : null}
          </div>
        }
      />

      {selectionMode ? (
        <section className="rounded-[24px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => openDateDialog("reschedule-selected")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("move")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("priority")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Priority
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("delete")}
              className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-2 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </section>
      ) : null}

      {data.overdue.length ? (
        <TaskGroup
          title="Overdue"
          subtitle="Open tasks that should already be done."
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={data.overdue}
          emptyMessage="Nothing overdue."
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onOpenTask={openTaskEditor}
          selectionMode={selectionMode}
          selectedTaskIds={selectedTaskIds}
          onToggleSelection={toggleSelection}
          onStartSelection={openSelection}
          onPromoteSubtask={onPromoteSubtask}
          rowActions={renderTaskRowActions}
          headerActions={
            <button
              type="button"
              onClick={() => openDateDialog("reschedule-overdue")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
            >
              Reschedule overdue
            </button>
          }
        />
      ) : null}

      <div data-onboarding-target="today-due">
        <TaskGroup
          title="Due today"
          subtitle="Tasks scheduled for today."
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={data.today}
          emptyMessage="No tasks due today."
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onOpenTask={openTaskEditor}
          selectionMode={selectionMode}
          selectedTaskIds={selectedTaskIds}
          onToggleSelection={toggleSelection}
          onStartSelection={openSelection}
          onPromoteSubtask={onPromoteSubtask}
          rowActions={renderTaskRowActions}
        />
      </div>

      {showCompletedToday ? (
        <TaskGroup
          title="Completed today"
          subtitle="Recently finished work."
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={data.completedToday}
          emptyMessage="Nothing completed yet today."
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onOpenTask={openTaskEditor}
          collapsible
          defaultCollapsed
          selectionMode={selectionMode}
          selectedTaskIds={selectedTaskIds}
          onToggleSelection={toggleSelection}
          onStartSelection={openSelection}
          onPromoteSubtask={onPromoteSubtask}
          rowActions={renderTaskRowActions}
        />
      ) : null}

      {activeDialog === "reschedule-selected" ? (
        <RescheduleDialog
          title="Reschedule tasks"
          description={`Choose a new date for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          tasks={selectedTasks}
          onClose={closeDialog}
          onRescheduleTasks={(taskIds, dueAt) => {
            onRescheduleTasks(taskIds, dueAt);
            clearSelection();
          }}
          onPostponeTasks={(taskIds) => {
            onPostponeTasks(taskIds);
            clearSelection();
          }}
        />
      ) : null}

      {activeDialog === "reschedule-overdue" ? (
        <RescheduleDialog
          title="Reschedule overdue tasks"
          description={`Choose a new date for ${data.overdue.length} overdue task${data.overdue.length === 1 ? "" : "s"}.`}
          tasks={data.overdue}
          onClose={closeDialog}
          onRescheduleTasks={onRescheduleTasks}
          onPostponeTasks={onPostponeTasks}
        />
      ) : null}

      {activeDialog === "move" ? (
        <ChoiceDialog
          title="Move tasks"
          description={`Move ${selectedCount} selected task${selectedCount === 1 ? "" : "s"} into a project or back to Inbox.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => submitMove(null)}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
            >
              Inbox
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => submitMove(project.id)}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {project.name}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "priority" ? (
        <ChoiceDialog
          title="Change priority"
          description={`Update the priority for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => submitPriority(priority)}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {priority}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "delete" ? (
        <ChoiceDialog
          title="Delete tasks"
          description={`Delete ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}? This syncs as tombstones.`}
          onClose={closeDialog}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDelete}
                className="rounded-full bg-[#B64B28] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9e4122]"
              >
                Delete tasks
              </button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

function UpcomingPage({
  payload,
  showSelectionButtons,
  onOpenQuickAdd,
  onToggleTask,
  onArchiveTask,
  onReparentTaskAsSubtask,
  onRescheduleTasks,
  onPostponeTasks,
  onMoveTasksToProject,
  onMoveTasksToSection,
  onSetTasksPriority,
  onDeleteTasks,
  onPromoteSubtask,
  onSaveTask,
  onDuplicateTask,
}: {
  payload: SyncPayload;
  showSelectionButtons: boolean;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
  onToggleTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
  onMoveTasksToProject: (taskIds: string[], projectId: string | null) => void;
  onMoveTasksToSection: (taskIds: string[], sectionId: string | null) => void;
  onSetTasksPriority: (taskIds: string[], priority: Priority) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onPromoteSubtask: (taskId: string) => void;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onDuplicateTask: (taskId: string) => Promise<string | null>;
}) {
  const todayStartMs = useTodayStartMs();
  const openTaskEditor = (taskId: string) =>
    onOpenQuickAdd({ editTaskId: taskId });
  const todayData = useMemo(
    () =>
      getTodayViewData(payload, todayStartMs, endOfDay(todayStartMs).getTime()),
    [payload, todayStartMs],
  );
  const projects = useMemo(() => getActiveProjects(payload), [payload]);
  const groups = useMemo(() => getUpcomingGroups(payload), [payload]);
  const completedTasks = useMemo(
    () => getUpcomingCompletedTasks(payload),
    [payload],
  );
  const visibleTasks = useMemo(
    () => getUpcomingOpenTasks(payload, todayStartMs),
    [payload, todayStartMs],
  );
  const visibleTaskIds = useMemo(
    () => new Set(visibleTasks.map((task) => task.id)),
    [visibleTasks],
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeDialog, setActiveDialog] = useState<
    null | "reschedule-selected" | "move" | "priority" | "delete"
  >(null);
  const [rowActionState, setRowActionState] = useState<{
    mode: "reschedule" | "priority" | "deadline" | "reminders" | "move";
    taskId: string;
    anchorRect?: DOMRect | null;
  } | null>(null);
  const [activeDropDateKey, setActiveDropDateKey] = useState<string | null>(
    null,
  );
  const selectedIds = useMemo(
    () =>
      Array.from(selectedTaskIds).filter((taskId) =>
        visibleTaskIds.has(taskId),
      ),
    [selectedTaskIds, visibleTaskIds],
  );
  const selectedTasks = useMemo(
    () =>
      selectedIds
        .map(
          (taskId) => visibleTasks.find((task) => task.id === taskId) ?? null,
        )
        .filter((task): task is Task => task !== null),
    [selectedIds, visibleTasks],
  );
  const selectedCount = selectedIds.length;

  function clearSelection() {
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }

  function toggleSelection(taskId: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function openSelection() {
    setSelectionMode(true);
  }

  function openDateDialog() {
    setActiveDialog("reschedule-selected");
  }

  function closeDialog() {
    setActiveDialog(null);
  }

  function readDraggedTaskId(event: DragEvent<HTMLElement>) {
    const directValue = activeDraggedTaskId?.trim();
    if (directValue) return directValue;
    const transferValue = event.dataTransfer.getData("text/task-id").trim();
    return transferValue || null;
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectionMode(true);
        setSelectedTaskIds(new Set(visibleTasks.map((task) => task.id)));
        return;
      }

      if (selectionMode && !activeDialog) {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "t"
        ) {
          event.preventDefault();
          openDateDialog();
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "v"
        ) {
          event.preventDefault();
          setActiveDialog("move");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "p"
        ) {
          event.preventDefault();
          setActiveDialog("priority");
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          setActiveDialog("delete");
          return;
        }
      }

      if (event.key === "Escape") {
        if (activeDialog) {
          event.preventDefault();
          closeDialog();
          return;
        }
        if (selectionMode) {
          event.preventDefault();
          clearSelection();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, selectionMode, visibleTasks]);

  function submitMove(projectId: string | null) {
    if (!selectedIds.length) return;
    onMoveTasksToProject(selectedIds, projectId);
    closeDialog();
    clearSelection();
  }

  function submitPriority(priority: Priority) {
    if (!selectedIds.length) return;
    onSetTasksPriority(selectedIds, priority);
    closeDialog();
    clearSelection();
  }

  function submitDelete() {
    if (!selectedIds.length) return;
    onDeleteTasks(selectedIds);
    closeDialog();
    clearSelection();
  }

  function renderTaskRowActions(task: Task) {
    if (task.status !== "OPEN") return null;
    return (
      <TaskRowActions
        payload={payload}
        task={task}
        actionState={rowActionState}
        onSetActionState={setRowActionState}
        onSaveTask={onSaveTask}
        onOpenQuickAdd={onOpenQuickAdd}
        onArchiveTask={onArchiveTask}
        onRescheduleTasks={onRescheduleTasks}
        onPostponeTasks={onPostponeTasks}
        onMoveTasksToProject={onMoveTasksToProject}
        onMoveTasksToSection={onMoveTasksToSection}
        onSetTasksPriority={onSetTasksPriority}
        onDeleteTasks={onDeleteTasks}
        onDuplicateTask={onDuplicateTask}
      />
    );
  }

  return (
    <div
      className="space-y-6"
      data-task-selection-mode={selectionMode ? "true" : undefined}
    >
      <HeroCard
        eyebrow="Timeline"
        title="Upcoming"
        description="Look ahead at upcoming deadlines and future work across the workspace. Drag tasks into a date lane when you want to reschedule them quickly."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {showSelectionButtons || selectionMode ? (
              <button
                type="button"
                onClick={() =>
                  selectionMode ? clearSelection() : openSelection()
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectionMode
                    ? "border border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28] hover:bg-[#FDE9E1]"
                    : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                {selectionMode ? "Cancel selection" : "Select tasks"}
              </button>
            ) : null}
            {selectionMode ? (
              <span className="rounded-full bg-[var(--app-surface-soft)] px-3 py-2 text-sm font-semibold text-[#6D5C50]">
                {selectedCount} selected
              </span>
            ) : null}
          </div>
        }
      />

      {selectionMode ? (
        <section className="rounded-[24px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={openDateDialog}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("move")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("priority")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Priority
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("delete")}
              className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-2 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </section>
      ) : null}

      {todayData.overdue.length ? (
        <TaskGroup
          title="Still overdue"
          subtitle="These are past due and still open."
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={todayData.overdue}
          emptyMessage="Nothing overdue."
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onPromoteSubtask={onPromoteSubtask}
          onOpenTask={openTaskEditor}
          selectionMode={selectionMode}
          selectedTaskIds={selectedTaskIds}
          onToggleSelection={toggleSelection}
          onStartSelection={openSelection}
          rowActions={renderTaskRowActions}
        />
      ) : null}

      {groups.length ? (
        groups.map((group) => (
          <div
            key={group.dateKey}
            onDragOver={(event) => {
              const draggedTaskId = readDraggedTaskId(event);
              if (!draggedTaskId) return;
              event.preventDefault();
              setActiveDropDateKey(group.dateKey);
            }}
            onDragLeave={(event) => {
              if (
                event.currentTarget.contains(event.relatedTarget as Node | null)
              )
                return;
              setActiveDropDateKey((current) =>
                current === group.dateKey ? null : current,
              );
            }}
            onDrop={(event) => {
              const draggedTaskId = readDraggedTaskId(event);
              setActiveDropDateKey(null);
              if (!draggedTaskId) return;
              event.preventDefault();
              onRescheduleTasks(
                [draggedTaskId],
                startOfDay(new Date(group.dateKey)).getTime(),
              );
            }}
            className={`rounded-[24px] transition ${
              activeDropDateKey === group.dateKey
                ? "bg-[#FFF7F2] ring-1 ring-[#EE6A3C]"
                : ""
            }`}
          >
            <TaskGroup
              title={format(new Date(group.dateKey), "EEEE, MMM d")}
              subtitle={
                activeDropDateKey === group.dateKey
                  ? "Drop here to move the task onto this date."
                  : undefined
              }
              payload={payload}
              todayStartMs={todayStartMs}
              tasks={group.tasks}
              emptyMessage="No tasks."
              onToggleTask={onToggleTask}
              onReparentTaskAsSubtask={onReparentTaskAsSubtask}
              onPromoteSubtask={onPromoteSubtask}
              onOpenTask={openTaskEditor}
              selectionMode={selectionMode}
              selectedTaskIds={selectedTaskIds}
              onToggleSelection={toggleSelection}
              onStartSelection={openSelection}
              rowActions={renderTaskRowActions}
              headerActions={
                <span className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-1.5 text-[11px] font-semibold text-[#6D5C50]">
                  Drag tasks here to reschedule
                </span>
              }
            />
          </div>
        ))
      ) : (
        <EmptyState
          title="Nothing upcoming"
          description="Future-dated tasks will show up here as soon as you add due dates."
        />
      )}

      {completedTasks.length ? (
        <TaskGroup
          title="Completed"
          subtitle="Finished tasks with future due dates."
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={completedTasks}
          emptyMessage="No completed tasks."
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onPromoteSubtask={onPromoteSubtask}
          onOpenTask={openTaskEditor}
          rowActions={renderTaskRowActions}
          collapsible
          defaultCollapsed
        />
      ) : null}

      {activeDialog === "reschedule-selected" ? (
        <RescheduleDialog
          title="Reschedule tasks"
          description={`Choose a new date for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          tasks={selectedTasks}
          onClose={closeDialog}
          onRescheduleTasks={(taskIds, dueAt) => {
            onRescheduleTasks(taskIds, dueAt);
            clearSelection();
          }}
          onPostponeTasks={(taskIds) => {
            onPostponeTasks(taskIds);
            clearSelection();
          }}
        />
      ) : null}

      {activeDialog === "move" ? (
        <ChoiceDialog
          title="Move tasks"
          description={`Move ${selectedCount} selected task${selectedCount === 1 ? "" : "s"} into a project or back to Inbox.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => submitMove(null)}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
            >
              Inbox
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => submitMove(project.id)}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {project.name}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "priority" ? (
        <ChoiceDialog
          title="Change priority"
          description={`Update the priority for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => submitPriority(priority)}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {priority}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "delete" ? (
        <ChoiceDialog
          title="Delete tasks"
          description={`Delete ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}? This syncs as tombstones.`}
          onClose={closeDialog}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDelete}
                className="rounded-full bg-[#B64B28] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9e4122]"
              >
                Delete tasks
              </button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

function SearchPage({
  payload,
  showSelectionButtons,
  onOpenQuickAdd,
  onToggleTask,
  onArchiveTask,
  onReparentTaskAsSubtask,
  onRescheduleTasks,
  onPostponeTasks,
  onMoveTasksToProject,
  onMoveTasksToSection,
  onSetTasksPriority,
  onDeleteTasks,
  onPromoteSubtask,
  onSaveTask,
  onDuplicateTask,
  forcedFilter,
}: {
  payload: SyncPayload;
  showSelectionButtons: boolean;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
  onToggleTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
  onMoveTasksToProject: (taskIds: string[], projectId: string | null) => void;
  onMoveTasksToSection: (taskIds: string[], sectionId: string | null) => void;
  onSetTasksPriority: (taskIds: string[], priority: Priority) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onPromoteSubtask: (taskId: string) => void;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onDuplicateTask: (taskId: string) => Promise<string | null>;
  forcedFilter?: SearchFilter;
}) {
  const location = useLocation();
  const todayStartMs = useTodayStartMs();
  const openTaskEditor = (taskId: string) =>
    onOpenQuickAdd({ editTaskId: taskId });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [userFilters, setUserFilters] = useState<Set<SearchFilter>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeDialog, setActiveDialog] = useState<
    null | "reschedule" | "move" | "priority" | "delete"
  >(null);
  const [rowActionState, setRowActionState] = useState<{
    mode: "reschedule" | "priority" | "deadline" | "reminders" | "move";
    taskId: string;
    anchorRect?: DOMRect | null;
  } | null>(null);
  const deferredQuery = useDeferredValue(query);
  const filters = useMemo(() => {
    if (forcedFilter) {
      const next = new Set<SearchFilter>([forcedFilter]);
      userFilters.forEach((filter) => {
        if (filter !== "ALL" && filter !== forcedFilter) {
          next.add(filter);
        }
      });
      return next;
    }

    if (userFilters.size === 0) {
      return new Set<SearchFilter>(["ALL"]);
    }

    const next = new Set<SearchFilter>();
    userFilters.forEach((filter) => {
      if (filter !== "ALL") {
        next.add(filter);
      }
    });
    return next.size ? next : new Set<SearchFilter>(["ALL"]);
  }, [forcedFilter, userFilters]);
  const results = useMemo(
    () => searchTasks(payload, deferredQuery, filters),
    [deferredQuery, filters, payload],
  );
  const completedResults = useMemo(
    () => searchCompletedTasks(payload, deferredQuery, filters),
    [deferredQuery, filters, payload],
  );
  const projects = useMemo(() => getActiveProjects(payload), [payload]);
  const visibleTaskIds = useMemo(
    () => new Set(results.map((task) => task.id)),
    [results],
  );
  const selectedIds = useMemo(
    () =>
      Array.from(selectedTaskIds).filter((taskId) =>
        visibleTaskIds.has(taskId),
      ),
    [selectedTaskIds, visibleTaskIds],
  );
  const selectedTasks = useMemo(
    () =>
      selectedIds
        .map((taskId) => results.find((task) => task.id === taskId) ?? null)
        .filter((task): task is Task => task !== null),
    [results, selectedIds],
  );
  const selectedCount = selectedIds.length;

  function toggleFilter(filter: SearchFilter) {
    if (forcedFilter && filter === forcedFilter) return;

    setUserFilters((current) => {
      const next = new Set(current);
      if (filter === "ALL") {
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

  function clearSelection() {
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }

  function toggleSelection(taskId: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function openSelection() {
    setSelectionMode(true);
  }

  function openDateDialog() {
    setActiveDialog("reschedule");
  }

  function closeDialog() {
    setActiveDialog(null);
  }

  useEffect(() => {
    const focusToken = (location as { state?: { focusSearchToken?: number } })
      .state?.focusSearchToken;
    if (!focusToken) return;
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [location]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectionMode(true);
        setSelectedTaskIds(new Set(results.map((task) => task.id)));
        return;
      }

      if (selectionMode && !activeDialog) {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "t"
        ) {
          event.preventDefault();
          openDateDialog();
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "v"
        ) {
          event.preventDefault();
          setActiveDialog("move");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "p"
        ) {
          event.preventDefault();
          setActiveDialog("priority");
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          setActiveDialog("delete");
          return;
        }
      }

      if (event.key === "Escape") {
        if (activeDialog) {
          event.preventDefault();
          closeDialog();
          return;
        }
        if (selectionMode) {
          event.preventDefault();
          clearSelection();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, results, selectionMode]);

  function submitMove(projectId: string | null) {
    if (!selectedIds.length) return;
    onMoveTasksToProject(selectedIds, projectId);
    closeDialog();
    clearSelection();
  }

  function submitPriority(priority: Priority) {
    if (!selectedIds.length) return;
    onSetTasksPriority(selectedIds, priority);
    closeDialog();
    clearSelection();
  }

  function submitDelete() {
    if (!selectedIds.length) return;
    onDeleteTasks(selectedIds);
    closeDialog();
    clearSelection();
  }

  function renderTaskRowActions(task: Task) {
    if (task.status !== "OPEN") return null;
    return (
      <TaskRowActions
        payload={payload}
        task={task}
        actionState={rowActionState}
        onSetActionState={setRowActionState}
        onSaveTask={onSaveTask}
        onOpenQuickAdd={onOpenQuickAdd}
        onArchiveTask={onArchiveTask}
        onRescheduleTasks={onRescheduleTasks}
        onPostponeTasks={onPostponeTasks}
        onMoveTasksToProject={onMoveTasksToProject}
        onMoveTasksToSection={onMoveTasksToSection}
        onSetTasksPriority={onSetTasksPriority}
        onDeleteTasks={onDeleteTasks}
        onDuplicateTask={onDuplicateTask}
      />
    );
  }

  return (
    <div
      className="space-y-6"
      data-task-selection-mode={selectionMode ? "true" : undefined}
    >
      <HeroCard
        eyebrow="Search"
        title={
          forcedFilter === "NO_DUE" ? "Tasks without due dates" : "Find tasks"
        }
        description={
          forcedFilter === "NO_DUE"
            ? "This is a real filtered view of open tasks that do not have a due date yet."
            : "Search titles, descriptions, project names, and sections. Bulk actions stay available when you need to reschedule, move, reprioritize, or delete several tasks at once."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {showSelectionButtons || selectionMode ? (
              <button
                type="button"
                onClick={() =>
                  selectionMode ? clearSelection() : openSelection()
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectionMode
                    ? "border border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28] hover:bg-[#FDE9E1]"
                    : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                {selectionMode ? "Cancel selection" : "Select tasks"}
              </button>
            ) : null}
            {selectionMode ? (
              <span className="rounded-full bg-[var(--app-surface-soft)] px-3 py-2 text-sm font-semibold text-[#6D5C50]">
                {selectedCount} selected
              </span>
            ) : null}
          </div>
        }
      />

      <section className="rounded-[28px] border border-[#E1D5CA] bg-[var(--app-surface)] p-5 shadow-sm">
        <div className="flex items-center gap-3 rounded-[22px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-3">
          <Search size={18} className="text-[#9F7B63]" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search tasks, projects, and notes"
            className="w-full bg-transparent text-sm outline-none placeholder:text-[#9F7B63]"
          />
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {SEARCH_FILTERS.map((filter) => {
            const active =
              filter.value === "ALL"
                ? !forcedFilter && userFilters.size === 0
                : filters.has(filter.value);
            return (
              <button
                key={filter.value}
                onClick={() => toggleFilter(filter.value)}
                disabled={forcedFilter === filter.value}
                className={`rounded-full px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-[#EE6A3C] text-white"
                    : "border border-[#E1D5CA] bg-[var(--app-surface-soft)] text-[#6D5C50] hover:bg-[var(--app-surface)]"
                } ${forcedFilter === filter.value ? "cursor-default opacity-90" : ""}`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      </section>

      {selectionMode ? (
        <section className="rounded-[24px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={openDateDialog}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("move")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("priority")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Priority
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("delete")}
              className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-2 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </section>
      ) : null}

      <TaskGroup
        title="Results"
        subtitle={`${results.length} open task${results.length === 1 ? "" : "s"} matched.`}
        payload={payload}
        todayStartMs={todayStartMs}
        tasks={results}
        emptyMessage="No open tasks match this search yet."
        onToggleTask={onToggleTask}
        onReparentTaskAsSubtask={onReparentTaskAsSubtask}
        onPromoteSubtask={onPromoteSubtask}
        onOpenTask={openTaskEditor}
        selectionMode={selectionMode}
        selectedTaskIds={selectedTaskIds}
        onToggleSelection={toggleSelection}
        onStartSelection={openSelection}
        rowActions={renderTaskRowActions}
      />

      {completedResults.length ? (
        <TaskGroup
          title="Completed"
          subtitle="Finished tasks matching this search."
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={completedResults}
          emptyMessage="No completed tasks match this search."
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onPromoteSubtask={onPromoteSubtask}
          onOpenTask={openTaskEditor}
          rowActions={renderTaskRowActions}
          collapsible
          defaultCollapsed
        />
      ) : null}

      {activeDialog === "reschedule" ? (
        <RescheduleDialog
          title="Reschedule tasks"
          description={`Choose a new date for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          tasks={selectedTasks}
          onClose={closeDialog}
          onRescheduleTasks={(taskIds, dueAt) => {
            onRescheduleTasks(taskIds, dueAt);
            clearSelection();
          }}
          onPostponeTasks={(taskIds) => {
            onPostponeTasks(taskIds);
            clearSelection();
          }}
        />
      ) : null}

      {activeDialog === "move" ? (
        <ChoiceDialog
          title="Move tasks"
          description={`Move ${selectedCount} selected task${selectedCount === 1 ? "" : "s"} into a project or back to Inbox.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => submitMove(null)}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
            >
              Inbox
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => submitMove(project.id)}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {project.name}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "priority" ? (
        <ChoiceDialog
          title="Change priority"
          description={`Update the priority for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => submitPriority(priority)}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {priority}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "delete" ? (
        <ChoiceDialog
          title="Delete tasks"
          description={`Delete ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}? This syncs as tombstones.`}
          onClose={closeDialog}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDelete}
                className="rounded-full bg-[#B64B28] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#9e4122]"
              >
                Delete tasks
              </button>
            </div>
          }
        />
      ) : null}
    </div>
  );
}

function InboxPage({
  payload,
  showSelectionButtons,
  onOpenQuickAdd,
  onToggleTask,
  onArchiveTask,
  onReparentTaskAsSubtask,
  onRescheduleTasks,
  onPostponeTasks,
  onMoveTasksToProject,
  onMoveTasksToSection,
  onSetTasksPriority,
  onDeleteTasks,
  onPromoteSubtask,
  onSaveTask,
  onDuplicateTask,
}: {
  payload: SyncPayload;
  showSelectionButtons: boolean;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
  onToggleTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
  onMoveTasksToProject: (taskIds: string[], projectId: string | null) => void;
  onMoveTasksToSection: (taskIds: string[], sectionId: string | null) => void;
  onSetTasksPriority: (taskIds: string[], priority: Priority) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onPromoteSubtask: (taskId: string) => void;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onDuplicateTask: (taskId: string) => Promise<string | null>;
}) {
  const todayStartMs = useTodayStartMs();
  const openTaskEditor = (taskId: string) =>
    onOpenQuickAdd({ editTaskId: taskId });
  const tasks = getInboxTasks(payload);
  const completedTasks = getCompletedInboxTasks(payload);
  const projects = useMemo(() => getActiveProjects(payload), [payload]);
  const visibleTaskIds = useMemo(
    () => new Set(tasks.map((task) => task.id)),
    [tasks],
  );
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeDialog, setActiveDialog] = useState<
    null | "reschedule" | "move" | "priority" | "delete"
  >(null);
  const [rowActionState, setRowActionState] = useState<{
    mode: "reschedule" | "priority" | "deadline" | "reminders" | "move";
    taskId: string;
    anchorRect?: DOMRect | null;
  } | null>(null);
  const selectedIds = useMemo(
    () =>
      Array.from(selectedTaskIds).filter((taskId) =>
        visibleTaskIds.has(taskId),
      ),
    [selectedTaskIds, visibleTaskIds],
  );
  const selectedTasks = useMemo(
    () =>
      selectedIds
        .map((taskId) => tasks.find((task) => task.id === taskId) ?? null)
        .filter((task): task is Task => task !== null),
    [selectedIds, tasks],
  );
  const selectedCount = selectedIds.length;

  function clearSelection() {
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }

  function toggleSelection(taskId: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function openSelection() {
    setSelectionMode(true);
  }

  function closeDialog() {
    setActiveDialog(null);
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectionMode(true);
        setSelectedTaskIds(new Set(tasks.map((task) => task.id)));
        return;
      }

      if (selectionMode && !activeDialog) {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "t"
        ) {
          event.preventDefault();
          setActiveDialog("reschedule");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "v"
        ) {
          event.preventDefault();
          setActiveDialog("move");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "p"
        ) {
          event.preventDefault();
          setActiveDialog("priority");
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          setActiveDialog("delete");
          return;
        }
      }

      if (event.key === "Escape") {
        if (activeDialog) {
          event.preventDefault();
          closeDialog();
          return;
        }
        if (selectionMode) {
          event.preventDefault();
          clearSelection();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, selectionMode, tasks]);

  function renderTaskRowActions(task: Task) {
    if (task.status !== "OPEN") return null;
    return (
      <TaskRowActions
        payload={payload}
        task={task}
        actionState={rowActionState}
        onSetActionState={setRowActionState}
        onSaveTask={onSaveTask}
        onOpenQuickAdd={onOpenQuickAdd}
        onArchiveTask={onArchiveTask}
        onRescheduleTasks={onRescheduleTasks}
        onPostponeTasks={onPostponeTasks}
        onMoveTasksToProject={onMoveTasksToProject}
        onMoveTasksToSection={onMoveTasksToSection}
        onSetTasksPriority={onSetTasksPriority}
        onDeleteTasks={onDeleteTasks}
        onDuplicateTask={onDuplicateTask}
      />
    );
  }

  return (
    <div
      className="space-y-6"
      data-task-selection-mode={selectionMode ? "true" : undefined}
    >
      <HeroCard
        eyebrow="Inbox"
        title="Unsorted tasks"
        description="These tasks are not attached to a project yet. Open one to move it into a project or section."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {showSelectionButtons || selectionMode ? (
              <button
                type="button"
                onClick={() =>
                  selectionMode ? clearSelection() : openSelection()
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectionMode
                    ? "border border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28] hover:bg-[#FDE9E1]"
                    : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                {selectionMode ? "Cancel selection" : "Select tasks"}
              </button>
            ) : null}
            {selectionMode ? (
              <span className="rounded-full bg-[var(--app-surface-soft)] px-3 py-2 text-sm font-semibold text-[#6D5C50]">
                {selectedCount} selected
              </span>
            ) : null}
          </div>
        }
      />

      {selectionMode ? (
        <section className="rounded-[24px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("reschedule")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("move")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("priority")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Priority
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("delete")}
              className="rounded-full border border-[#F1C7B5] bg-[#FFF1EB] px-4 py-2 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE3D7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </section>
      ) : null}

      <TaskGroup
        title="Inbox"
        payload={payload}
        todayStartMs={todayStartMs}
        tasks={tasks}
        emptyMessage="Inbox is clear."
        onToggleTask={onToggleTask}
        onReparentTaskAsSubtask={onReparentTaskAsSubtask}
        onPromoteSubtask={onPromoteSubtask}
        onOpenTask={openTaskEditor}
        selectionMode={selectionMode}
        selectedTaskIds={selectedTaskIds}
        onToggleSelection={toggleSelection}
        onStartSelection={openSelection}
        rowActions={renderTaskRowActions}
      />

      {completedTasks.length ? (
        <TaskGroup
          title="Completed"
          subtitle="Finished Inbox tasks."
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={completedTasks}
          emptyMessage="No completed Inbox tasks."
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onPromoteSubtask={onPromoteSubtask}
          onOpenTask={openTaskEditor}
          rowActions={renderTaskRowActions}
          collapsible
          defaultCollapsed
        />
      ) : null}

      {activeDialog === "reschedule" ? (
        <RescheduleDialog
          title="Reschedule tasks"
          description={`Choose a new date for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          tasks={selectedTasks}
          onClose={closeDialog}
          onRescheduleTasks={(taskIds, dueAt) => {
            onRescheduleTasks(taskIds, dueAt);
            clearSelection();
          }}
          onPostponeTasks={(taskIds) => {
            onPostponeTasks(taskIds);
            clearSelection();
          }}
        />
      ) : null}

      {activeDialog === "move" ? (
        <ChoiceDialog
          title="Move tasks"
          description={`Move ${selectedCount} selected task${selectedCount === 1 ? "" : "s"} into a project or keep them in Inbox.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            <button
              data-dialog-autofocus="true"
              type="button"
              onClick={() => {
                onMoveTasksToProject(selectedIds, null);
                closeDialog();
                clearSelection();
              }}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
            >
              Inbox
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                type="button"
                onClick={() => {
                  onMoveTasksToProject(selectedIds, project.id);
                  closeDialog();
                  clearSelection();
                }}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {project.name}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "priority" ? (
        <ChoiceDialog
          title="Change priority"
          description={`Update the priority for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          onClose={closeDialog}
        >
          <div className="flex flex-wrap gap-2">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((priority, index) => (
              <button
                key={priority}
                data-dialog-autofocus={index === 0 ? "true" : undefined}
                type="button"
                onClick={() => {
                  onSetTasksPriority(selectedIds, priority);
                  closeDialog();
                  clearSelection();
                }}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {priority}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "delete" ? (
        <ConfirmDialog
          title="Delete tasks"
          description={`Delete ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}? This syncs as tombstones.`}
          confirmLabel="Delete tasks"
          tone="destructive"
          onClose={closeDialog}
          onConfirm={() => {
            onDeleteTasks(selectedIds);
            closeDialog();
            clearSelection();
          }}
        />
      ) : null}
    </div>
  );
}

function ProjectPage({
  payload,
  showSelectionButtons,
  onSaveTask,
  onArchiveTask,
  onCreateSection,
  onUpdateProject,
  onDeleteProject,
  onUpdateSection,
  onDeleteSection,
  onToggleTask,
  onReparentTaskAsSubtask,
  onRescheduleTasks,
  onPostponeTasks,
  onMoveTasksToProject,
  onMoveTasksToSection,
  onSetTasksPriority,
  onDeleteTasks,
  onPromoteSubtask,
  onDuplicateTask,
  onOpenQuickAdd,
}: {
  payload: SyncPayload;
  showSelectionButtons: boolean;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onArchiveTask: (taskId: string) => void;
  onCreateSection: (projectId: string, name: string) => void;
  onUpdateProject: (
    projectId: string,
    updater: (project: Project) => Project,
  ) => void;
  onDeleteProject: (projectId: string) => void;
  onUpdateSection: (
    sectionId: string,
    updater: (section: Section) => Section,
  ) => void;
  onDeleteSection: (sectionId: string) => void;
  onToggleTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
  onMoveTasksToProject: (taskIds: string[], projectId: string | null) => void;
  onMoveTasksToSection: (taskIds: string[], sectionId: string | null) => void;
  onSetTasksPriority: (taskIds: string[], priority: Priority) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onPromoteSubtask: (taskId: string) => void;
  onDuplicateTask: (taskId: string) => Promise<string | null>;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
}) {
  const navigate = useNavigate();
  const todayStartMs = useTodayStartMs();
  const openTaskEditor = (taskId: string) =>
    onOpenQuickAdd({ editTaskId: taskId });
  const { projectId } = useParams();
  const [sectionName, setSectionName] = useState("");
  const [activeBoardDropSectionId, setActiveBoardDropSectionId] = useState<
    string | "__loose__" | null
  >(null);
  const [isProjectRenameDialogOpen, setIsProjectRenameDialogOpen] =
    useState(false);
  const [projectRenameValue, setProjectRenameValue] = useState("");
  const [sectionRenameState, setSectionRenameState] = useState<{
    id: string;
    value: string;
  } | null>(null);
  const [sectionDeleteState, setSectionDeleteState] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [isProjectDeleteDialogOpen, setIsProjectDeleteDialogOpen] =
    useState(false);
  const [isAddSectionDialogOpen, setIsAddSectionDialogOpen] = useState(false);
  const [activeListDropSectionId, setActiveListDropSectionId] = useState<
    string | "__loose__" | null
  >(null);
  const [projectTaskActionState, setProjectTaskActionState] = useState<{
    mode: "reschedule" | "priority" | "deadline" | "reminders" | "move";
    taskId: string;
  } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [activeDialog, setActiveDialog] = useState<
    null | "reschedule" | "move" | "priority" | "delete"
  >(null);
  const project = useMemo(
    () => (projectId ? getProjectById(payload, projectId) : undefined),
    [payload, projectId],
  );
  const tasks = useMemo(
    () => (projectId ? getProjectTasks(payload, projectId) : []),
    [payload, projectId],
  );
  const completedTasks = useMemo(
    () => (projectId ? getCompletedProjectTasks(payload, projectId) : []),
    [payload, projectId],
  );
  const sections = useMemo(
    () => (projectId ? getProjectSections(payload, projectId) : []),
    [payload, projectId],
  );
  const visibleTaskIds = useMemo(
    () => new Set(tasks.map((task) => task.id)),
    [tasks],
  );
  const selectedIds = useMemo(
    () =>
      Array.from(selectedTaskIds).filter((taskId) =>
        visibleTaskIds.has(taskId),
      ),
    [selectedTaskIds, visibleTaskIds],
  );
  const selectedTasks = useMemo(
    () =>
      selectedIds
        .map((taskId) => tasks.find((task) => task.id === taskId) ?? null)
        .filter((task): task is Task => task !== null),
    [selectedIds, tasks],
  );
  const selectedCount = selectedIds.length;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        setSelectionMode(true);
        setSelectedTaskIds(new Set(tasks.map((task) => task.id)));
        return;
      }

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        !event.shiftKey &&
        event.key.toLowerCase() === "s"
      ) {
        event.preventDefault();
        setIsAddSectionDialogOpen(true);
        return;
      }

      if (selectionMode && !activeDialog) {
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "t"
        ) {
          event.preventDefault();
          setActiveDialog("reschedule");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "v"
        ) {
          event.preventDefault();
          setActiveDialog("move");
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key.toLowerCase() === "p"
        ) {
          event.preventDefault();
          setActiveDialog("priority");
          return;
        }
        if (event.key === "Delete" || event.key === "Backspace") {
          event.preventDefault();
          setActiveDialog("delete");
          return;
        }
      }

      if (event.key === "Escape") {
        if (activeDialog) {
          event.preventDefault();
          setActiveDialog(null);
          return;
        }
        if (selectionMode) {
          event.preventDefault();
          setSelectionMode(false);
          setSelectedTaskIds(new Set());
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeDialog, selectionMode, tasks]);

  if (!projectId) {
    return (
      <EmptyState
        title="Project not found"
        description="Choose a project from the sidebar or create a new one."
      />
    );
  }

  if (!project) {
    return (
      <EmptyState
        title="Project not found"
        description="This project may have been deleted or archived elsewhere."
      />
    );
  }

  const currentProject = project;
  const unsectionedTasks = tasks.filter((task) => !task.sectionId);
  const projectView = currentProject.viewPreference ?? "LIST";
  const boardColumns = [
    {
      id: "__loose__",
      title: "Loose tasks",
      subtitle: "Open tasks without a section.",
      tasks: unsectionedTasks,
      sectionId: null as string | null,
    },
    ...sections.map((section) => ({
      id: section.id,
      title: section.name,
      subtitle: `${tasks.filter((task) => task.sectionId === section.id).length} task${tasks.filter((task) => task.sectionId === section.id).length === 1 ? "" : "s"}`,
      tasks: tasks.filter((task) => task.sectionId === section.id),
      sectionId: section.id,
    })),
  ];

  function readDraggedTaskId(event: DragEvent<HTMLElement>) {
    const directValue = activeDraggedTaskId?.trim();
    if (directValue) return directValue;
    const transferValue = event.dataTransfer.getData("text/task-id").trim();
    return transferValue || null;
  }

  function canDropTaskIntoSection(
    draggedTaskId: string,
    targetSectionId: string | null,
  ) {
    const draggedTask = tasks.find(
      (task) => task.id === draggedTaskId && !task.deletedAt,
    );
    if (!draggedTask || draggedTask.status !== "OPEN") return false;
    if (draggedTask.projectId !== currentProject.id) return false;
    if ((draggedTask.sectionId ?? null) === targetSectionId) return false;
    return true;
  }

  function getListDropHandlers(targetSectionId: string | null) {
    const targetId = targetSectionId ?? "__loose__";
    return {
      onDragOver(event: DragEvent<HTMLElement>) {
        const draggedTaskId = readDraggedTaskId(event);
        if (
          !draggedTaskId ||
          !canDropTaskIntoSection(draggedTaskId, targetSectionId)
        )
          return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setActiveListDropSectionId(targetId);
      },
      onDragLeave(event: DragEvent<HTMLElement>) {
        if (event.currentTarget.contains(event.relatedTarget as Node | null))
          return;
        setActiveListDropSectionId((current) =>
          current === targetId ? null : current,
        );
      },
      onDrop(event: DragEvent<HTMLElement>) {
        const draggedTaskId = readDraggedTaskId(event);
        setActiveListDropSectionId((current) =>
          current === targetId ? null : current,
        );
        if (
          !draggedTaskId ||
          !canDropTaskIntoSection(draggedTaskId, targetSectionId)
        )
          return;
        event.preventDefault();
        event.stopPropagation();
        onMoveTasksToSection([draggedTaskId], targetSectionId);
      },
    };
  }

  function submitProjectRename(nextName: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    onUpdateProject(currentProject.id, (current) => ({
      ...current,
      name: trimmedName,
    }));
    setIsProjectRenameDialogOpen(false);
  }

  function toggleArchiveProject() {
    onUpdateProject(currentProject.id, (current) => ({
      ...current,
      archived: !current.archived,
    }));
  }

  function confirmDeleteProject() {
    onDeleteProject(currentProject.id);
    setIsProjectDeleteDialogOpen(false);
    navigate("/today");
  }

  function submitSectionRename() {
    const currentSectionRename = sectionRenameState;
    const nextName = currentSectionRename?.value.trim();
    if (!currentSectionRename || !nextName) return;
    onUpdateSection(currentSectionRename.id, (current) => ({
      ...current,
      name: nextName,
    }));
    setSectionRenameState(null);
  }

  function submitSectionName(nextName: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName) return;
    onCreateSection(currentProject.id, trimmedName);
    setSectionName("");
    setIsAddSectionDialogOpen(false);
  }

  function setProjectView(viewPreference: Project["viewPreference"]) {
    onUpdateProject(currentProject.id, (current) => ({
      ...current,
      viewPreference,
    }));
  }

  function renderProjectRowActions(task: Task) {
    if (task.status !== "OPEN") return null;
    return (
      <TaskRowActions
        payload={payload}
        task={task}
        actionState={projectTaskActionState}
        onSetActionState={setProjectTaskActionState}
        onSaveTask={onSaveTask}
        onOpenQuickAdd={onOpenQuickAdd}
        onArchiveTask={onArchiveTask}
        onRescheduleTasks={onRescheduleTasks}
        onPostponeTasks={onPostponeTasks}
        onMoveTasksToProject={onMoveTasksToProject}
        onMoveTasksToSection={onMoveTasksToSection}
        onSetTasksPriority={onSetTasksPriority}
        onDeleteTasks={onDeleteTasks}
        onDuplicateTask={onDuplicateTask}
      />
    );
  }

  function clearSelection() {
    setSelectionMode(false);
    setSelectedTaskIds(new Set());
  }

  function toggleSelection(taskId: string) {
    setSelectedTaskIds((current) => {
      const next = new Set(current);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  }

  function openSelection() {
    setSelectionMode(true);
  }

  return (
    <div
      className="space-y-6"
      data-task-selection-mode={selectionMode ? "true" : undefined}
    >
      <section className="px-1 pb-2 pt-1">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9d6b54]">
              Project
            </p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#7a7168]">
              Manage tasks, sections, and project metadata for{" "}
              {currentProject.name}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {showSelectionButtons || selectionMode ? (
              <button
                type="button"
                onClick={() =>
                  selectionMode ? clearSelection() : openSelection()
                }
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  selectionMode
                    ? "border border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28] hover:bg-[#FDE9E1]"
                    : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                {selectionMode ? "Cancel selection" : "Select tasks"}
              </button>
            ) : null}
            {selectionMode ? (
              <span className="rounded-full bg-[var(--app-surface-soft)] px-3 py-2 text-sm font-semibold text-[#6D5C50]">
                {selectedCount} selected
              </span>
            ) : null}
            <OverflowMenu
              label="Project actions"
              items={[
                {
                  label: "Add section",
                  onSelect: () => setIsAddSectionDialogOpen(true),
                },
                {
                  label:
                    projectView === "BOARD"
                      ? "Switch to list view"
                      : "Switch to board view",
                  onSelect: () =>
                    setProjectView(projectView === "BOARD" ? "LIST" : "BOARD"),
                },
                {
                  label: "Rename project",
                  onSelect: () => {
                    setProjectRenameValue(currentProject.name);
                    setIsProjectRenameDialogOpen(true);
                  },
                },
                {
                  label: currentProject.archived
                    ? "Unarchive project"
                    : "Archive project",
                  onSelect: toggleArchiveProject,
                },
                {
                  label: "Delete project",
                  tone: "destructive",
                  onSelect: () => setIsProjectDeleteDialogOpen(true),
                },
              ]}
            />
          </div>
        </div>
      </section>

      {selectionMode ? (
        <section className="rounded-[24px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("reschedule")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reschedule
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("move")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Move
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("priority")}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Priority
            </button>
            <button
              type="button"
              disabled={selectedCount === 0}
              onClick={() => setActiveDialog("delete")}
              className="rounded-full border border-[#F1C7B5] bg-[#FFF1EB] px-4 py-2 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE3D7] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Delete
            </button>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        {projectView === "BOARD" ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {boardColumns.map((column) => (
              <section
                key={column.id}
                onDragOver={(event) => {
                  const draggedTaskId = readDraggedTaskId(event);
                  if (!draggedTaskId) return;
                  event.preventDefault();
                  setActiveBoardDropSectionId(column.id);
                }}
                onDragLeave={(event) => {
                  if (
                    event.currentTarget.contains(
                      event.relatedTarget as Node | null,
                    )
                  )
                    return;
                  setActiveBoardDropSectionId((current) =>
                    current === column.id ? null : current,
                  );
                }}
                onDrop={(event) => {
                  const draggedTaskId = readDraggedTaskId(event);
                  setActiveBoardDropSectionId(null);
                  if (!draggedTaskId) return;
                  event.preventDefault();
                  onMoveTasksToSection([draggedTaskId], column.sectionId);
                }}
                className={`space-y-3 rounded-[28px] border p-5 shadow-sm transition ${
                  activeBoardDropSectionId === column.id
                    ? "border-[#EE6A3C] bg-[#FFF7F2]"
                    : "border-[#E1D5CA] bg-[var(--app-surface)]"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-[#1E2D2F]">
                      {column.title}
                    </h3>
                    <p className="text-sm text-[#6D5C50]">{column.subtitle}</p>
                  </div>
                  <button
                    onClick={() =>
                      onOpenQuickAdd({
                        defaultProjectId: currentProject.id,
                        defaultSectionId: column.sectionId,
                      })
                    }
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EE6A3C] text-white transition hover:bg-[#d75e33]"
                    title="Add task"
                    aria-label="Add task"
                  >
                    <Plus size={16} />
                  </button>
                </div>
                <TaskListBlock
                  payload={payload}
                  todayStartMs={todayStartMs}
                  tasks={column.tasks}
                  emptyMessage={
                    column.sectionId
                      ? "No tasks in this section yet."
                      : "No unsectioned tasks here."
                  }
                  onToggleTask={onToggleTask}
                  onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                  onPromoteSubtask={onPromoteSubtask}
                  onOpenTask={openTaskEditor}
                  selectionMode={selectionMode}
                  selectedTaskIds={selectedTaskIds}
                  onToggleSelection={toggleSelection}
                  onStartSelection={openSelection}
                  rowActions={renderProjectRowActions}
                />
              </section>
            ))}
          </div>
        ) : (
          <>
            <div data-onboarding-target="project-task-area">
              <TaskGroup
                title="Loose tasks"
                subtitle="Open tasks in this project without a section."
                payload={payload}
                todayStartMs={todayStartMs}
                tasks={unsectionedTasks}
                emptyMessage="No unsectioned tasks here."
                onToggleTask={onToggleTask}
                onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                onPromoteSubtask={onPromoteSubtask}
                onOpenTask={openTaskEditor}
                selectionMode={selectionMode}
                selectedTaskIds={selectedTaskIds}
                onToggleSelection={toggleSelection}
                onStartSelection={openSelection}
                rowActions={renderProjectRowActions}
                dropTargetState={{
                  active: activeListDropSectionId === "__loose__",
                  hint: "Drop task here to move it out of a section.",
                  ...getListDropHandlers(null),
                }}
                headerActions={
                  <button
                    onClick={() =>
                      onOpenQuickAdd({ defaultProjectId: currentProject.id })
                    }
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
                    title="Add task"
                    aria-label="Add task"
                  >
                    <Plus size={14} />
                  </button>
                }
              />
            </div>

            {sections.map((section) => {
              const sectionTasks = tasks.filter(
                (task) => task.sectionId === section.id,
              );
              const listDropHandlers = getListDropHandlers(section.id);
              return (
                <div
                  key={section.id}
                  className="space-y-3 rounded-[28px] border border-[#E1D5CA] bg-[var(--app-surface)] p-5 shadow-sm"
                >
                  <div
                    {...listDropHandlers}
                    className={`flex items-center justify-between gap-3 rounded-[18px] px-2 py-2 transition ${
                      activeListDropSectionId === section.id
                        ? "bg-[#FFF1EB] ring-1 ring-inset ring-[#EE6A3C]"
                        : ""
                    }`}
                  >
                    <div>
                      <h3 className="text-lg font-semibold text-[#1E2D2F]">
                        {section.name}
                      </h3>
                      <p className="text-sm text-[#6D5C50]">
                        {sectionTasks.length} task
                        {sectionTasks.length === 1 ? "" : "s"}
                      </p>
                      {activeListDropSectionId === section.id ? (
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#B64B28]">
                          Drop task to move it here
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() =>
                          onOpenQuickAdd({
                            defaultProjectId: currentProject.id,
                            defaultSectionId: section.id,
                          })
                        }
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-[#EE6A3C] text-white transition hover:bg-[#d75e33]"
                        title="Add task"
                        aria-label="Add task"
                      >
                        <Plus size={16} />
                      </button>
                      <OverflowMenu
                        label={`Actions for ${section.name}`}
                        items={[
                          {
                            label: "Rename section",
                            onSelect: () =>
                              setSectionRenameState({
                                id: section.id,
                                value: section.name,
                              }),
                          },
                          {
                            label: "Delete section",
                            tone: "destructive",
                            onSelect: () =>
                              setSectionDeleteState({
                                id: section.id,
                                name: section.name,
                              }),
                          },
                        ]}
                      />
                    </div>
                  </div>
                  <TaskListBlock
                    payload={payload}
                    todayStartMs={todayStartMs}
                    tasks={sectionTasks}
                    emptyMessage="No tasks in this section yet."
                    onToggleTask={onToggleTask}
                    onReparentTaskAsSubtask={onReparentTaskAsSubtask}
                    onPromoteSubtask={onPromoteSubtask}
                    onOpenTask={openTaskEditor}
                    selectionMode={selectionMode}
                    selectedTaskIds={selectedTaskIds}
                    onToggleSelection={toggleSelection}
                    onStartSelection={openSelection}
                    rowActions={renderProjectRowActions}
                  />
                </div>
              );
            })}
          </>
        )}

        {completedTasks.length ? (
          <TaskGroup
            title="Completed"
            subtitle="Finished tasks in this project."
            payload={payload}
            todayStartMs={todayStartMs}
            tasks={completedTasks}
            emptyMessage="No completed tasks in this project."
            onToggleTask={onToggleTask}
            onReparentTaskAsSubtask={onReparentTaskAsSubtask}
            onPromoteSubtask={onPromoteSubtask}
            onOpenTask={openTaskEditor}
            collapsible
            defaultCollapsed
          />
        ) : null}
      </section>

      {isAddSectionDialogOpen ? (
        <TextInputDialog
          title="Add section"
          description="Create a section for this project."
          label="Section name"
          value={sectionName}
          submitLabel="Create section"
          onChange={setSectionName}
          onClose={() => {
            setIsAddSectionDialogOpen(false);
            setSectionName("");
          }}
          onSubmit={submitSectionName}
        />
      ) : null}

      {isProjectRenameDialogOpen ? (
        <TextInputDialog
          title="Rename project"
          description="Choose the new name for this project."
          label="Project name"
          value={projectRenameValue}
          submitLabel="Save project"
          onChange={setProjectRenameValue}
          onClose={() => setIsProjectRenameDialogOpen(false)}
          onSubmit={submitProjectRename}
        />
      ) : null}

      {isProjectDeleteDialogOpen ? (
        <ConfirmDialog
          title="Delete project"
          description={`Delete "${currentProject.name}" and tombstone its tasks and sections? This will sync to Android.`}
          confirmLabel="Delete project"
          tone="destructive"
          onClose={() => setIsProjectDeleteDialogOpen(false)}
          onConfirm={confirmDeleteProject}
        />
      ) : null}

      {sectionRenameState ? (
        <TextInputDialog
          title="Rename section"
          description="Update the section name for this project."
          label="Section name"
          value={sectionRenameState.value}
          submitLabel="Save section"
          onChange={(value) =>
            setSectionRenameState((current) =>
              current ? { ...current, value } : current,
            )
          }
          onClose={() => setSectionRenameState(null)}
          onSubmit={submitSectionRename}
        />
      ) : null}

      {sectionDeleteState ? (
        <ConfirmDialog
          title="Delete section"
          description={`Delete section "${sectionDeleteState.name}"? Tasks will move out of the section.`}
          confirmLabel="Delete section"
          tone="destructive"
          onClose={() => setSectionDeleteState(null)}
          onConfirm={() => {
            onDeleteSection(sectionDeleteState.id);
            setSectionDeleteState(null);
          }}
        />
      ) : null}

      {activeDialog === "reschedule" ? (
        <RescheduleDialog
          title="Reschedule tasks"
          description={`Choose a new date for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          tasks={selectedTasks}
          onClose={() => setActiveDialog(null)}
          onRescheduleTasks={(taskIds, dueAt) => {
            onRescheduleTasks(taskIds, dueAt);
            clearSelection();
          }}
          onPostponeTasks={(taskIds) => {
            onPostponeTasks(taskIds);
            clearSelection();
          }}
        />
      ) : null}

      {activeDialog === "move" ? (
        <ChoiceDialog
          title="Move tasks"
          description={`Move ${selectedCount} selected task${selectedCount === 1 ? "" : "s"} into a section or keep them loose.`}
          onClose={() => setActiveDialog(null)}
        >
          <div className="flex flex-wrap gap-2">
            <button
              data-dialog-autofocus="true"
              type="button"
              onClick={() => {
                onMoveTasksToSection(selectedIds, null);
                setActiveDialog(null);
                clearSelection();
              }}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
            >
              Loose tasks
            </button>
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                onClick={() => {
                  onMoveTasksToSection(selectedIds, section.id);
                  setActiveDialog(null);
                  clearSelection();
                }}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {section.name}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "priority" ? (
        <ChoiceDialog
          title="Change priority"
          description={`Update the priority for ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}.`}
          onClose={() => setActiveDialog(null)}
        >
          <div className="flex flex-wrap gap-2">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((priority, index) => (
              <button
                key={priority}
                data-dialog-autofocus={index === 0 ? "true" : undefined}
                type="button"
                onClick={() => {
                  onSetTasksPriority(selectedIds, priority);
                  setActiveDialog(null);
                  clearSelection();
                }}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                {priority}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {activeDialog === "delete" ? (
        <ConfirmDialog
          title="Delete tasks"
          description={`Delete ${selectedCount} selected task${selectedCount === 1 ? "" : "s"}? This syncs as tombstones.`}
          confirmLabel="Delete tasks"
          tone="destructive"
          onClose={() => setActiveDialog(null)}
          onConfirm={() => {
            onDeleteTasks(selectedIds);
            setActiveDialog(null);
            clearSelection();
          }}
        />
      ) : null}
    </div>
  );
}

function LegacyTaskRouteRedirect({
  payload,
  todayStartMs,
  onOpenQuickAdd,
}: {
  payload: SyncPayload;
  todayStartMs: number;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
}) {
  const { taskId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (!taskId) {
      navigate("/today", { replace: true });
      return;
    }
    const task = getTaskById(payload, taskId);
    if (!task) {
      navigate("/today", { replace: true });
      return;
    }
    onOpenQuickAdd({ editTaskId: taskId });
    navigate(getTaskWorkspacePath(task, todayStartMs), {
      replace: true,
    });
  }, [navigate, onOpenQuickAdd, payload, taskId, todayStartMs]);

  return (
    <section className="rounded-[28px] border border-[#E1D5CA] bg-[var(--app-surface)] p-5 shadow-sm">
      <p className="text-sm text-[#6D5C50]">Opening task editor?</p>
    </section>
  );
}

function TaskActivityPage({
  payload,
  todayStartMs,
  activityEntries,
  onUndoActivity,
  canUndoActivity,
}: {
  payload: SyncPayload;
  todayStartMs: number;
  activityEntries: ActivityEntry[];
  onUndoActivity: (activityId: string) => void;
  canUndoActivity: (activityId: string) => boolean;
}) {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const task = taskId ? getTaskById(payload, taskId) : null;

  if (!task) {
    return <Navigate to="/today" replace />;
  }

  const taskReminderRecords = payload.reminders.filter(
    (reminder) => reminder.taskId === task.id && !reminder.deletedAt,
  );
  const taskTimeline = buildTaskTimeline(
    task,
    taskReminderRecords,
    activityEntries,
  );
  const backPath = getTaskWorkspacePath(task, todayStartMs);

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Activity"
        title={task.title}
        description="Review the recorded history for this task."
        actions={
          <button
            type="button"
            onClick={() => navigate(backPath)}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
          >
            Back
          </button>
        }
      />
      <section className="rounded-[28px] border border-[#E1D5CA] bg-[var(--app-surface)] p-5 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">
              Timeline
            </p>
            <h3 className="mt-2 text-xl font-semibold text-[#1E2D2F]">
              Recent changes for this task
            </h3>
            <p className="mt-2 text-sm leading-6 text-[#6D5C50]">
              Local web activity appears here alongside the task&apos;s saved
              schedule state.
            </p>
          </div>
          <span className="rounded-full bg-[var(--app-surface-soft)] px-3 py-1.5 text-xs font-semibold text-[#6D5C50]">
            {taskTimeline.length} event{taskTimeline.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="mt-5 space-y-3">
          {taskTimeline.length ? (
            taskTimeline.map((entry) => (
              <div
                key={entry.id}
                className="rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1E2D2F]">
                      {entry.title}
                    </p>
                    {entry.detail ? (
                      <p className="mt-1 text-sm text-[#6D5C50]">
                        {entry.detail}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#8A8076]">
                      {formatDateTime(entry.at)}
                    </span>
                    {entry.activityId && canUndoActivity(entry.activityId) ? (
                      <button
                        type="button"
                        onClick={() => onUndoActivity(entry.activityId!)}
                        className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
                      >
                        Undo
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4 text-sm text-[#6D5C50]">
              No task activity has been recorded yet.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function SettingsDisclosure({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className="rounded-[28px] border border-[#E1D5CA] bg-[var(--app-surface)] p-5 shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        className="flex w-full items-start justify-between gap-4 text-left"
        aria-expanded={isOpen}
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">
            {title}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#6D5C50]">{description}</p>
        </div>
        <ChevronDown
          size={18}
          className={`mt-1 shrink-0 text-[#9F7B63] transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen ? <div className="mt-4 space-y-4">{children}</div> : null}
    </section>
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
  showSelectionButtons,
  onToggleShowSelectionButtons,
  weekStartsOn,
  onWeekStartsOnChange,
  use24HourTime,
  onToggleUse24HourTime,
  autoSyncEnabled,
  onToggleAutoSyncEnabled,
  autoBackupEnabled,
  onToggleAutoBackupEnabled,
  onDisconnectCloud,
  onResetCloudSync,
  onResetLocalCache,
  onImport,
  onExportJson,
  onSaveBrowserBackupNow,
  onRestoreBrowserBackup,
  isSyncing,
  isResettingCloud,
  isResettingCache,
  lastCloudSyncAt,
  lastLocalBackupAt,
}: {
  cloudConfigured: boolean;
  cloudSession: CloudSession | null;
  lastSyncError: string | null;
  hasPendingLocalChanges: boolean;
  isOnline: boolean;
  showCompletedToday: boolean;
  onToggleShowCompletedToday: () => void;
  showSelectionButtons: boolean;
  onToggleShowSelectionButtons: () => void;
  weekStartsOn: WeekStartsOn;
  onWeekStartsOnChange: (value: WeekStartsOn) => void;
  use24HourTime: boolean;
  onToggleUse24HourTime: () => void;
  autoSyncEnabled: boolean;
  onToggleAutoSyncEnabled: () => void;
  autoBackupEnabled: boolean;
  onToggleAutoBackupEnabled: () => void;
  onDisconnectCloud: () => void;
  onResetCloudSync: () => void;
  onResetLocalCache: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onExportJson: () => void;
  onSaveBrowserBackupNow: () => void;
  onRestoreBrowserBackup: () => void;
  isSyncing: boolean;
  isResettingCloud: boolean;
  isResettingCache: boolean;
  lastCloudSyncAt: number | null;
  lastLocalBackupAt: number | null;
}) {
  const location = useLocation();
  const cloudStatus = getCloudStatus({
    cloudConfigured,
    cloudSession,
    lastSyncError,
    hasPendingLocalChanges,
    isOnline,
    isSyncing,
    lastCloudSyncAt,
  });
  const feedbackHref = buildFeedbackMailto(
    "Emberlist feedback",
    location.pathname,
    cloudSession,
  );
  const issueHref = buildFeedbackMailto(
    "Emberlist bug report",
    location.pathname,
    cloudSession,
  );

  return (
    <div className="space-y-6">
      <HeroCard
        eyebrow="Settings"
        title="Web sync and workspace"
        description="Manage Google Drive sync, this browser's local workspace, and the display options that stay local to the web app."
      />

      <div className="space-y-4">
        <SettingsDisclosure
          title="Cloud sync"
          description="Connection status, sync account, and whether this browser should sync automatically."
          defaultOpen
        >
          <div className="space-y-3">
            <InfoRow label="Status" value={cloudStatus.label} />
            <InfoRow
              label="Account"
              value={
                cloudSession?.email ?? "No Google account connected in this tab"
              }
            />
            <InfoRow
              label="Last sync"
              value={
                lastCloudSyncAt
                  ? formatDateTime(lastCloudSyncAt)
                  : "No recent sync"
              }
            />
            <InfoRow
              label="Auto sync"
              value={autoSyncEnabled ? "Enabled" : "Manual only"}
            />
            <p className="rounded-[18px] bg-[var(--app-surface-soft)] px-4 py-3 text-sm leading-6 text-[#6D5C50]">
              {cloudStatus.detail}
            </p>
            {lastSyncError ? (
              <p className="rounded-[18px] bg-[#FFF1EB] px-4 py-3 text-sm leading-6 text-[#A24628]">
                Last error: {lastSyncError}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 pt-2">
              {cloudSession ? (
                <button
                  onClick={onDisconnectCloud}
                  className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
                >
                  Disconnect
                </button>
              ) : null}
              <button
                onClick={onResetCloudSync}
                disabled={isResettingCloud || !cloudConfigured}
                className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-3 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isResettingCloud
                  ? "Resetting cloud sync..."
                  : "Reset cloud sync"}
              </button>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-[#1E2D2F]">
                  Run cloud sync automatically
                </p>
                <p className="mt-1 text-sm text-[#6D5C50]">
                  When enabled, the web app syncs on changes, reconnect, focus,
                  and load.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoSyncEnabled}
                onChange={onToggleAutoSyncEnabled}
                className="h-5 w-5 accent-[#EE6A3C]"
              />
            </label>
          </div>
        </SettingsDisclosure>

        <SettingsDisclosure
          title="Backups and recovery"
          description="Save a browser snapshot, export JSON, or recover this browser's local workspace."
        >
          <div className="space-y-3">
            <InfoRow
              label="Last browser backup"
              value={
                lastLocalBackupAt
                  ? formatDateTime(lastLocalBackupAt)
                  : "No browser backup saved yet"
              }
            />
            <p className="text-sm leading-6 text-[#6D5C50]">
              Keep a local browser backup snapshot, restore it, or download a
              JSON export you can keep outside the browser.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onSaveBrowserBackupNow}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                Save browser backup
              </button>
              <button
                onClick={onRestoreBrowserBackup}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                Restore browser backup
              </button>
              <button
                onClick={onExportJson}
                className="inline-flex items-center gap-2 rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                <Download size={16} />
                Export JSON
              </button>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]">
                <Import size={16} />
                Import JSON
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={onImport}
                />
              </label>
              <button
                onClick={onResetLocalCache}
                disabled={isResettingCache}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isResettingCache
                  ? "Resetting web cache..."
                  : "Reset web cache"}
              </button>
            </div>
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-[#1E2D2F]">
                  Maintain browser backups automatically
                </p>
                <p className="mt-1 text-sm text-[#6D5C50]">
                  Save a fresh local browser snapshot whenever the workspace
                  changes.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoBackupEnabled}
                onChange={onToggleAutoBackupEnabled}
                className="h-5 w-5 accent-[#EE6A3C]"
              />
            </label>
          </div>
        </SettingsDisclosure>

        <SettingsDisclosure
          title="Display and behavior"
          description="Local-only web preferences that do not affect Android."
          defaultOpen
        >
          <div className="space-y-4">
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-[#1E2D2F]">
                  Show completed tasks in Today
                </p>
                <p className="mt-1 text-sm text-[#6D5C50]">
                  This toggle is local to the web app and does not affect
                  Android.
                </p>
              </div>
              <input
                type="checkbox"
                checked={showCompletedToday}
                onChange={onToggleShowCompletedToday}
                className="h-5 w-5 accent-[#EE6A3C]"
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-[#1E2D2F]">
                  Show Select tasks buttons on list pages
                </p>
                <p className="mt-1 text-sm text-[#6D5C50]">
                  Keyboard selection with X still works even when this is off.
                </p>
              </div>
              <input
                type="checkbox"
                checked={showSelectionButtons}
                onChange={onToggleShowSelectionButtons}
                className="h-5 w-5 accent-[#EE6A3C]"
              />
            </label>
            <label className="flex items-center justify-between gap-4 rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4">
              <div>
                <p className="text-sm font-semibold text-[#1E2D2F]">
                  Use 24-hour time
                </p>
                <p className="mt-1 text-sm text-[#6D5C50]">
                  Applies to task times, reminders, and sync timestamps in the
                  web app.
                </p>
              </div>
              <input
                type="checkbox"
                checked={use24HourTime}
                onChange={onToggleUse24HourTime}
                className="h-5 w-5 accent-[#EE6A3C]"
              />
            </label>
            <div className="rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-[#1E2D2F]">
                    Week starts on
                  </p>
                  <p className="mt-1 text-sm text-[#6D5C50]">
                    Affects week-based filters and calendars in the web app.
                  </p>
                </div>
                <span className="text-sm font-semibold text-[#6D5C50]">
                  {weekStartsOn === 1 ? "Monday" : "Sunday"}
                </span>
              </div>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => onWeekStartsOnChange(0)}
                  className={`rounded-full px-4 py-3 text-sm font-semibold transition ${weekStartsOn === 0 ? "bg-[#EE6A3C] text-white" : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[#FFFDFC]"}`}
                >
                  Sunday
                </button>
                <button
                  type="button"
                  onClick={() => onWeekStartsOnChange(1)}
                  className={`rounded-full px-4 py-3 text-sm font-semibold transition ${weekStartsOn === 1 ? "bg-[#EE6A3C] text-white" : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[#FFFDFC]"}`}
                >
                  Monday
                </button>
              </div>
            </div>
          </div>
        </SettingsDisclosure>

        <SettingsDisclosure
          title="Feedback"
          description="Quick paths for bug reports and product feedback."
        >
          <div className="space-y-3">
            <p className="text-sm leading-6 text-[#6D5C50]">
              Send product feedback or a bug report straight from the app. The
              email draft includes the current route, connected sync account,
              and browser details so issues are easier to reproduce.
            </p>
            <div className="flex flex-wrap gap-3">
              <a
                href={feedbackHref}
                className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
              >
                Send feedback
              </a>
              <a
                href={issueHref}
                className="rounded-full bg-[#EE6A3C] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#d75e33]"
              >
                Report issue
              </a>
            </div>
            <p className="rounded-[18px] bg-[var(--app-surface-soft)] px-4 py-3 text-sm leading-6 text-[#6D5C50]">
              Support inbox: {SUPPORT_EMAIL}
            </p>
          </div>
        </SettingsDisclosure>
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
  onReparentTaskAsSubtask,
  onPromoteSubtask,
  onOpenTask,
  collapsible = false,
  defaultCollapsed = false,
  selectionMode = false,
  selectedTaskIds,
  onToggleSelection,
  onStartSelection,
  headerActions,
  rowActions,
  dropTargetState,
}: {
  title: string;
  subtitle?: string;
  payload: SyncPayload;
  todayStartMs: number;
  tasks: Task[];
  emptyMessage: string;
  onToggleTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onPromoteSubtask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleSelection?: (taskId: string) => void;
  onStartSelection?: () => void;
  headerActions?: ReactNode;
  rowActions?: (task: Task) => ReactNode;
  dropTargetState?: {
    active: boolean;
    hint: string;
    onDragOver: (event: DragEvent<HTMLElement>) => void;
    onDragLeave: (event: DragEvent<HTMLElement>) => void;
    onDrop: (event: DragEvent<HTMLElement>) => void;
  };
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsible && collapsed;

  return (
    <section className="rounded-[18px] bg-transparent">
      <div
        className={`mb-2 rounded-[18px] px-3 py-2 transition ${dropTargetState?.active ? "bg-[#FFF1EB] ring-1 ring-inset ring-[#EE6A3C]" : ""}`}
        onDragOver={dropTargetState?.onDragOver}
        onDragLeave={dropTargetState?.onDragLeave}
        onDrop={dropTargetState?.onDrop}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-[18px] font-semibold text-[#202020]">
              {title}
            </h3>
            {subtitle ? (
              <p className="mt-0.5 text-xs text-[#8a8076]">{subtitle}</p>
            ) : null}
            {dropTargetState?.active ? (
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#B64B28]">
                {dropTargetState.hint}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            {headerActions}
            <span className="text-xs font-medium text-[#8a8076]">
              {tasks.length} task{tasks.length === 1 ? "" : "s"}
            </span>
            {collapsible ? (
              <button
                type="button"
                onClick={() => setCollapsed((value) => !value)}
                className="rounded-full border border-[#e7ddd4] bg-[var(--app-surface)] px-3 py-1 text-xs font-semibold text-[#6d5c50] transition hover:bg-[#fbf7f3]"
              >
                {isCollapsed
                  ? `Show ${title.toLowerCase()}`
                  : `Hide ${title.toLowerCase()}`}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {!isCollapsed ? (
        <TaskListBlock
          payload={payload}
          todayStartMs={todayStartMs}
          tasks={tasks}
          emptyMessage={emptyMessage}
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onPromoteSubtask={onPromoteSubtask}
          onOpenTask={onOpenTask}
          selectionMode={selectionMode}
          selectedTaskIds={selectedTaskIds}
          onToggleSelection={onToggleSelection}
          onStartSelection={onStartSelection}
          rowActions={rowActions}
        />
      ) : null}
    </section>
  );
}

function TaskListBlock({
  payload,
  todayStartMs,
  tasks,
  emptyMessage,
  onToggleTask,
  onReparentTaskAsSubtask,
  onPromoteSubtask,
  onOpenTask,
  baseDepth = 0,
  selectionMode = false,
  selectedTaskIds,
  onToggleSelection,
  onStartSelection,
  rowActions,
}: {
  payload: SyncPayload;
  todayStartMs: number;
  tasks: Task[];
  emptyMessage: string;
  onToggleTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onPromoteSubtask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  baseDepth?: number;
  selectionMode?: boolean;
  selectedTaskIds?: Set<string>;
  onToggleSelection?: (taskId: string) => void;
  onStartSelection?: () => void;
  rowActions?: (task: Task) => ReactNode;
}) {
  const flattenedTasks = useMemo(
    () => flattenTasksWithSubtasks(tasks),
    [tasks],
  );

  if (!tasks.length) {
    return (
      <p className="rounded-[12px] border border-[#ece7e3] bg-[var(--app-surface)] px-4 py-5 text-sm text-[#7b736b]">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className="overflow-visible rounded-[14px] border border-[#ece7e3] bg-[var(--app-surface)]">
      {flattenedTasks.map((item) => (
        <TaskRow
          key={item.task.id}
          payload={payload}
          todayStartMs={todayStartMs}
          task={item.task}
          depth={item.depth + baseDepth}
          hasVisibleSubtasks={item.hasVisibleSubtasks}
          visibleSubtaskCount={item.visibleSubtaskCount}
          onToggleTask={onToggleTask}
          onReparentTaskAsSubtask={onReparentTaskAsSubtask}
          onPromoteSubtask={onPromoteSubtask}
          onOpenTask={onOpenTask}
          selectionMode={selectionMode}
          selected={selectedTaskIds?.has(item.task.id) ?? false}
          onToggleSelection={onToggleSelection}
          onStartSelection={onStartSelection}
          rowActions={rowActions}
        />
      ))}
    </div>
  );
}

function TaskRow({
  payload,
  todayStartMs,
  task,
  depth,
  hasVisibleSubtasks,
  visibleSubtaskCount,
  onToggleTask,
  onReparentTaskAsSubtask,
  onPromoteSubtask,
  onOpenTask,
  selectionMode = false,
  selected = false,
  onToggleSelection,
  onStartSelection,
  rowActions,
}: {
  payload: SyncPayload;
  todayStartMs: number;
  task: Task;
  depth: number;
  hasVisibleSubtasks: boolean;
  visibleSubtaskCount: number;
  onToggleTask: (taskId: string) => void;
  onReparentTaskAsSubtask: (
    draggedTaskId: string,
    parentTaskId: string,
  ) => void;
  onPromoteSubtask: (taskId: string) => void;
  onOpenTask: (taskId: string) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelection?: (taskId: string) => void;
  onStartSelection?: () => void;
  rowActions?: (task: Task) => ReactNode;
}) {
  const completed = task.status === "COMPLETED";
  const canDrag = !selectionMode && task.status === "OPEN";
  const canAcceptSubtaskDrop =
    task.status === "OPEN" && task.parentTaskId === null;
  const overdue = Boolean(
    task.dueAt && task.status === "OPEN" && task.dueAt < todayStartMs,
  );
  const locationLabel = getTaskLocationLabel(payload, task);
  const dueLabel = task.dueAt ? formatTaskDate(task.dueAt, task.allDay) : null;
  const [isDropActive, setIsDropActive] = useState(false);

  function handleRowAction() {
    if (selectionMode) {
      onToggleSelection?.(task.id);
      return;
    }
    onOpenTask(task.id);
  }

  function getDraggedTaskId(event: DragEvent<HTMLElement>): string | null {
    const directValue = activeDraggedTaskId?.trim();
    if (directValue) return directValue;
    const fallbackValue = event.dataTransfer.getData("text/task-id").trim();
    return fallbackValue || null;
  }

  function handleDragStart(event: DragEvent<HTMLElement>) {
    if (!canDrag) return;
    event.stopPropagation();
    activeDraggedTaskId = task.id;
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/task-id", task.id);
    event.dataTransfer.setData("text/plain", task.title);
  }

  function handleDragEnd() {
    activeDraggedTaskId = null;
    setIsDropActive(false);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    const draggedTaskId = getDraggedTaskId(event);
    if (
      !draggedTaskId ||
      !canAcceptSubtaskDrop ||
      !canReparentTaskAsSubtask(payload, draggedTaskId, task.id)
    ) {
      setIsDropActive(false);
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    if (!isDropActive) {
      setIsDropActive(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }
    setIsDropActive(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    const draggedTaskId = getDraggedTaskId(event);
    setIsDropActive(false);
    if (
      !draggedTaskId ||
      !canAcceptSubtaskDrop ||
      !canReparentTaskAsSubtask(payload, draggedTaskId, task.id)
    ) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    onReparentTaskAsSubtask(draggedTaskId, task.id);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      data-task-row="true"
      data-task-id={task.id}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleRowAction}
      onKeyDown={(event) => {
        const lowerKey = event.key.toLowerCase();
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleRowAction();
          return;
        }
        if (event.key === "ArrowDown" || lowerKey === "j") {
          event.preventDefault();
          focusAdjacentTaskRow(task.id, 1);
          return;
        }
        if (event.key === "ArrowUp" || lowerKey === "k") {
          event.preventDefault();
          focusAdjacentTaskRow(task.id, -1);
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          lowerKey === "e"
        ) {
          event.preventDefault();
          onToggleTask(task.id);
          return;
        }
        if ((event.metaKey || event.ctrlKey) && lowerKey === "e") {
          event.preventDefault();
          onOpenTask(task.id);
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          lowerKey === "x" &&
          onToggleSelection
        ) {
          event.preventDefault();
          if (!selectionMode) {
            onStartSelection?.();
          }
          onToggleSelection(task.id);
          return;
        }
        if (
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          event.key === "."
        ) {
          const menuTrigger = event.currentTarget.querySelector<HTMLElement>(
            '[data-task-row-menu-trigger="true"]',
          );
          if (menuTrigger) {
            event.preventDefault();
            menuTrigger.click();
            return;
          }
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "]") {
          event.preventDefault();
          const previousTaskId = getAdjacentTaskRowId(task.id, -1);
          if (
            previousTaskId &&
            canReparentTaskAsSubtask(payload, task.id, previousTaskId)
          ) {
            onReparentTaskAsSubtask(task.id, previousTaskId);
          }
          return;
        }
        if ((event.metaKey || event.ctrlKey) && event.key === "[") {
          event.preventDefault();
          onPromoteSubtask(task.id);
        }
      }}
      className={`group/task-row flex items-start gap-3 border-b border-[#f1eeeb] px-3 py-2 text-left transition last:border-b-0 md:px-4 ${
        isDropActive
          ? "bg-[#FFF6F0] ring-1 ring-inset ring-[#EE6A3C]"
          : selected
            ? "bg-[#FFF3EE]"
            : "hover:bg-[#fcfaf7]"
      } focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EE6A3C]`}
    >
      {canDrag ? (
        <button
          type="button"
          draggable
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onClick={(event) => event.stopPropagation()}
          aria-label={`Drag ${task.title}`}
          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-grab items-center justify-center rounded-full text-[#9F7B63] transition hover:bg-[var(--app-surface-soft)] active:cursor-grabbing"
        >
          <GripVertical size={14} />
        </button>
      ) : (
        <div className="h-5 w-5 shrink-0" aria-hidden="true" />
      )}
      {depth > 0 ? <TaskHierarchyGutter depth={depth} /> : null}
      {selectionMode ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onToggleSelection?.(task.id);
          }}
          aria-label={
            selected ? `Deselect ${task.title}` : `Select ${task.title}`
          }
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition ${
            selected
              ? "border-[#EE6A3C] bg-[#EE6A3C] text-white"
              : "border-[#D8C9BC] bg-[var(--app-surface)] text-transparent"
          }`}
        >
          <Check size={12} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onToggleTask(task.id);
        }}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition ${
          completed
            ? "border-[#dc4c3e] bg-[#dc4c3e] text-white"
            : `${priorityCircleClasses(task.priority)} bg-[var(--app-surface)] text-transparent`
        }`}
      >
        <Check size={12} />
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[15px] leading-5 ${completed ? "text-[#9a928c] line-through" : "text-[#202020]"}`}
        >
          {task.title}
        </p>
        {task.description ? (
          <p
            className={`mt-1 text-sm leading-5 ${completed ? "text-[#a39a93]" : "text-[#6d665e]"}`}
          >
            {task.description}
          </p>
        ) : null}
        {isDropActive ? (
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#B64B28]">
            Drop to make subtask
          </p>
        ) : null}
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-[#8a8076]">
          {depth > 0 ? <span>Subtask</span> : null}
          {hasVisibleSubtasks ? (
            <span>
              {visibleSubtaskCount} subtask
              {visibleSubtaskCount === 1 ? "" : "s"}
            </span>
          ) : null}
          {dueLabel ? (
            <span
              className={`inline-flex items-center gap-1 ${overdue ? "text-[#d1453b]" : "text-[#8a8076]"}`}
            >
              <Calendar size={11} />
              <span>{dueLabel}</span>
            </span>
          ) : null}
          {task.recurringRule ? (
            <span className={overdue ? "text-[#d1453b]" : ""}>↻</span>
          ) : null}
          {task.parentTaskId && depth === 0 ? <span>Subtask</span> : null}
          <span className="md:hidden">{locationLabel}</span>
        </div>
      </div>
      <div className="pointer-events-none mt-0.5 hidden min-w-[120px] shrink-0 items-start justify-end gap-3 text-right text-xs text-[#8a8076] md:flex">
        {rowActions ? (
          <div className="pointer-events-auto flex flex-wrap justify-end gap-1.5 opacity-0 transition group-hover/task-row:opacity-100 group-focus-within/task-row:opacity-100">
            {rowActions(task)}
          </div>
        ) : null}
        <div>{locationLabel}</div>
      </div>
    </div>
  );
}

function TaskHierarchyGutter({ depth }: { depth: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 self-stretch items-stretch"
      style={{ width: depth * 18 }}
    >
      {Array.from({ length: depth }).map((_, index) => {
        const isLast = index === depth - 1;
        return (
          <div key={index} className="relative h-full w-[18px] shrink-0">
            {isLast ? (
              <>
                <div className="absolute bottom-1/2 left-1/2 top-0 w-px -translate-x-1/2 bg-[#E6D8CC]" />
                <div className="absolute left-1/2 top-1/2 h-px w-[12px] -translate-y-1/2 bg-[#E6D8CC]" />
              </>
            ) : (
              <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-[#F0E5DB]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChoiceDialog({
  title,
  description,
  children,
  footer,
  onClose,
  dialogClassName,
  childrenClassName,
  anchorRect,
}: {
  title: string;
  description: string;
  children?: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  dialogClassName?: string;
  childrenClassName?: string;
  anchorRect?: DOMRect | null;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);

  function stopDialogEvent(event: ReactMouseEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const preferredTarget = dialog.querySelector<HTMLElement>(
      '[data-dialog-autofocus="true"]',
    );
    if (preferredTarget) {
      preferredTarget.focus();
      return;
    }
    const fallbackTarget = dialog.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    fallbackTarget?.focus();
  }, []);

  return (
    <div
      data-overlay-dialog="true"
      onMouseDown={stopDialogEvent}
      onClick={stopDialogEvent}
      className={`fixed inset-0 z-40 flex items-center justify-center bg-[#241b17]/35 px-4 py-6 ${anchorRect ? "items-start justify-start !bg-transparent" : ""}`}
    >
      <div
        ref={dialogRef}
        onMouseDown={stopDialogEvent}
        onClick={stopDialogEvent}
        style={
          anchorRect
            ? {
                position: "absolute",
                top: Math.min(anchorRect.bottom + 8, window.innerHeight - 400),
                left: Math.min(anchorRect.left, window.innerWidth - 680), // Approx width calculation
                maxHeight: "min(82vh, 760px)",
              }
            : undefined
        }
        className={`flex max-h-[min(82vh,760px)] w-full ${dialogClassName ?? "max-w-lg"} flex-col overflow-hidden rounded-xl border border-[#E1D5CA] bg-[var(--app-surface)] p-4 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-[#1E2D2F]">{title}</h3>
            <p className="mt-1 text-sm leading-6 text-[#6D5C50]">
              {description}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-2 text-[#6D5C50] transition hover:bg-[var(--app-surface-soft)]"
          >
            <X size={16} />
          </button>
        </div>
        {children ? (
          <div
            className={`mt-4 overflow-y-auto pr-1 ${childrenClassName ?? ""}`}
          >
            {children}
          </div>
        ) : null}
        {footer ? <div className="mt-4 shrink-0">{footer}</div> : null}
      </div>
    </div>
  );
}

function QuickAddDialog({
  payload,
  context,
  onClose,
  onCreateTask,
  onCreateTaskRelative,
  onSaveTask,
  onboardingExample,
  onShowBanner,
}: {
  payload: SyncPayload;
  context: QuickAddContext;
  onClose: () => void;
  onCreateTask: (
    draft: TaskDraft,
    options?: { silent?: boolean; successMessage?: string },
  ) => Promise<string | null>;
  onCreateTaskRelative: (
    anchorTaskId: string,
    position: "before" | "after",
    draft: TaskDraft,
    options?: { silent?: boolean; successMessage?: string },
  ) => Promise<string | null>;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onboardingExample: string | null;
  onShowBanner: (
    tone: Banner["tone"],
    message: string,
    options?: Pick<
      Banner,
      "actionLabel" | "onAction" | "persistOnNavigation" | "autoDismissMs"
    >,
  ) => void;
}) {
  const todayStartMs = useTodayStartMs();
  const editTask = useMemo(
    () => (context.editTaskId ? getTaskById(payload, context.editTaskId) : null),
    [context.editTaskId, payload],
  );
  const editReminderDrafts = useMemo(
    () => (editTask ? getTaskReminderDrafts(payload, editTask.id) : []),
    [editTask, payload],
  );
  const isEditMode = editTask !== null;
  const [input, setInput] = useState(() =>
    editTask
      ? serializeTaskToQuickAddInput(payload, editTask, editReminderDrafts)
      : "",
  );
  const [description, setDescription] = useState(
    () => editTask?.description ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showBulkChoices, setShowBulkChoices] = useState(false);
  const [showAdvancedFields, setShowAdvancedFields] = useState(false);
  const [showReminderEditor, setShowReminderEditor] = useState(false);
  const [showDueDialog, setShowDueDialog] = useState(false);
  const [showPriorityMenu, setShowPriorityMenu] = useState(false);
  const [showProjectMenu, setShowProjectMenu] = useState(false);
  const [subtaskInput, setSubtaskInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const projectMenuRef = useRef<HTMLDivElement | null>(null);
  const priorityMenuRef = useRef<HTMLDivElement | null>(null);
  const projectQueryRef = useRef<HTMLInputElement | null>(null);
  const lastAppliedContextKeyRef = useRef<string | null>(null);
  const [relativeAnchorTaskId, setRelativeAnchorTaskId] = useState<string | null>(
    isEditMode ? null : (context.relativeAnchorTaskId ?? null),
  );
  const submitDraftRef = useRef<(mode?: QuickAddSubmitMode) => Promise<void>>(
    async () => undefined,
  );
  const createBulkTasksRef = useRef<(mode: "single" | "many") => Promise<void>>(
    async () => undefined,
  );
  const bulkLines = useMemo(() => extractBulkQuickAddLines(input), [input]);
  const parsedPreview = useMemo(() => parseQuickAdd(input), [input]);
  const hasInput = input.trim().length > 0;
  const parserContext = useMemo<QuickAddContext>(
    () =>
      isEditMode
        ? {
            defaultProjectId: null,
            defaultSectionId: null,
            defaultDueToday: false,
            relativeAnchorTaskId: null,
            relativePosition: null,
            editTaskId: context.editTaskId ?? null,
          }
        : context,
    [context, isEditMode],
  );
  const previewDraft = useMemo(
    () =>
      isEditMode
        ? buildTaskDetailDraftFromInput(
            payload,
            input,
            description,
            parserContext,
            todayStartMs,
          )
        : buildDraftFromParsed(
            payload,
            parsedPreview,
            description,
            parserContext,
            todayStartMs,
          ),
    [
      description,
      input,
      isEditMode,
      parsedPreview,
      parserContext,
      payload,
      todayStartMs,
    ],
  );
  const [projectOverrideId, setProjectOverrideId] = useState<
    string | null | undefined
  >(undefined);
  const [sectionOverrideId, setSectionOverrideId] = useState<
    string | null | undefined
  >(undefined);
  const [priorityOverride, setPriorityOverride] = useState<
    Priority | undefined
  >(undefined);
  const [recurrenceOverride, setRecurrenceOverride] = useState<
    string | null | undefined
  >(
    editTask && editTask.recurringRule && !recurrenceRuleToQuickAddPhrase(editTask.recurringRule)
      ? editTask.recurringRule
      : undefined,
  );
  const [reminderEditorsOverride, setReminderEditorsOverride] = useState<
    ReminderEditorDraft[] | undefined
  >(
    editTask && editReminderDrafts.length > 1
      ? buildReminderEditors(editReminderDrafts)
      : undefined,
  );
  const [dueOverrideAt, setDueOverrideAt] = useState<number | null | undefined>();
  const [dueOverrideAllDay, setDueOverrideAllDay] = useState<boolean | undefined>();
  const [deadlineEnabledOverride, setDeadlineEnabledOverride] = useState<
    boolean | undefined
  >();
  const [deadlineAllDayOverride, setDeadlineAllDayOverride] = useState<
    boolean | undefined
  >();
  const [deadlineInputOverride, setDeadlineInputOverride] = useState<
    string | undefined
  >();
  const [projectQuery, setProjectQuery] = useState("");
  const deferredProjectQuery = useDeferredValue(
    projectQuery.trim().toLowerCase(),
  );
  const effectiveProjectId =
    projectOverrideId === undefined
      ? previewDraft.projectId
      : projectOverrideId;
  const effectiveProjectName =
    projectOverrideId === undefined ? previewDraft.projectName : null;
  const effectiveSectionId = effectiveProjectId
    ? sectionOverrideId === undefined
      ? previewDraft.sectionId
      : sectionOverrideId
    : null;
  const effectiveSectionName = effectiveProjectId
    ? sectionOverrideId === undefined
      ? previewDraft.sectionName
      : null
    : null;
  const effectiveDueAt =
    dueOverrideAt === undefined ? previewDraft.dueAt : dueOverrideAt;
  const effectiveAllDay =
    dueOverrideAt === undefined
      ? previewDraft.allDay
      : (dueOverrideAllDay ?? true);
  const effectivePriority = priorityOverride ?? previewDraft.priority;
  const effectiveRecurrenceRule =
    recurrenceOverride === undefined
      ? previewDraft.recurringRule
      : recurrenceOverride;
  const effectiveDeadlineEnabled =
    deadlineEnabledOverride ?? previewDraft.deadlineAt !== null;
  const effectiveDeadlineAllDay =
    deadlineAllDayOverride ?? previewDraft.deadlineAllDay;
  const effectiveDeadlineInput =
    deadlineInputOverride ??
    toInputValue(
      previewDraft.deadlineAt ?? null,
      previewDraft.deadlineAllDay ?? false,
    );
  const effectiveDeadlineAt = effectiveDeadlineEnabled
    ? parseInputValue(effectiveDeadlineInput, effectiveDeadlineAllDay)
    : null;
  const parsedReminderEditors = useMemo(
    () => buildReminderEditors(previewDraft.reminders),
    [previewDraft.reminders],
  );
  const effectiveReminderEditors =
    reminderEditorsOverride ?? parsedReminderEditors;
  const effectiveReminderDrafts = useMemo(
    () => serializeReminderEditors(effectiveReminderEditors),
    [effectiveReminderEditors],
  );
  const effectiveDraft = useMemo<TaskDraft>(
    () => ({
      ...previewDraft,
      dueAt: effectiveDueAt,
      allDay: effectiveAllDay,
      projectId: effectiveProjectId ?? null,
      projectName: effectiveProjectName,
      sectionId: effectiveSectionId ?? null,
      sectionName: effectiveSectionName,
      priority: effectivePriority,
      deadlineAt: effectiveDeadlineAt,
      deadlineAllDay: effectiveDeadlineEnabled
        ? effectiveDeadlineAllDay
        : false,
      recurringRule: effectiveRecurrenceRule,
      reminders: effectiveReminderDrafts,
      parentTaskId: editTask?.parentTaskId ?? previewDraft.parentTaskId,
    }),
    [
      effectiveAllDay,
      effectiveDeadlineAllDay,
      effectiveDeadlineAt,
      effectiveDeadlineEnabled,
      effectiveDueAt,
      effectivePriority,
      effectiveProjectId,
      effectiveProjectName,
      effectiveRecurrenceRule,
      effectiveReminderDrafts,
      effectiveSectionId,
      effectiveSectionName,
      editTask,
      previewDraft,
    ],
  );
  const quickAddPreviewTask = useMemo(
    () => buildQuickAddPreviewTask(effectiveDraft),
    [effectiveDraft],
  );
  const activeProjects = useMemo(
    () => getActiveProjects(payload, true),
    [payload],
  );
  const filteredProjects = useMemo(
    () =>
      activeProjects.filter((project) =>
        project.name.toLowerCase().includes(deferredProjectQuery),
      ),
    [activeProjects, deferredProjectQuery],
  );
  const quickAddSubtaskLines = useMemo(
    () =>
      subtaskInput
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    [subtaskInput],
  );
  const dueSummaryLabel =
    effectiveDraft.dueAt !== null
      ? formatTaskDate(effectiveDraft.dueAt, effectiveDraft.allDay)
      : isEditMode
        ? "No date"
        : "Today";
  const reminderSummaryLabel = effectiveDraft.reminders.length
    ? renderReminderLabel(effectiveDraft.reminders)
    : "Reminders";
  const prioritySummaryLabel =
    effectivePriority === "P4" && priorityOverride === undefined
      ? "Priority"
      : effectivePriority;
  const hasManualMetadataOverrides =
    dueOverrideAt !== undefined ||
    deadlineEnabledOverride !== undefined ||
    deadlineAllDayOverride !== undefined ||
    deadlineInputOverride !== undefined ||
    projectOverrideId !== undefined ||
    sectionOverrideId !== undefined ||
    priorityOverride !== undefined ||
    recurrenceOverride !== undefined ||
    reminderEditorsOverride !== undefined;
  const dialogContextKey = [
    context.editTaskId ?? "",
    context.defaultProjectId ?? "",
    context.defaultSectionId ?? "",
    context.defaultDueToday ? "today" : "none",
    context.relativeAnchorTaskId ?? "",
    context.relativePosition ?? "",
  ].join("|");

  useEffect(() => {
    if (!showProjectMenu) return;
    window.setTimeout(() => projectQueryRef.current?.focus(), 0);
  }, [showProjectMenu]);

  useEffect(() => {
    function handlePointerDown(event: globalThis.MouseEvent) {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setShowProjectMenu(false);
      }
      if (
        priorityMenuRef.current &&
        !priorityMenuRef.current.contains(target)
      ) {
        setShowPriorityMenu(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const lowerKey = event.key.toLowerCase();
      const typing = isTypingTarget(event.target);
      if (
        (event.metaKey || event.ctrlKey) &&
        lowerKey === "enter" &&
        !event.altKey
      ) {
        if (!typing) return;
        event.preventDefault();
        if (showBulkChoices) return;
        void submitDraftRef.current("continue");
        return;
      }

      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey &&
        event.key === "Enter" &&
        !event.shiftKey
      ) {
        if (!typing) return;
        event.preventDefault();
        if (showBulkChoices) return;
        void submitDraftRef.current("close");
        return;
      }

      if (event.key !== "Escape") return;
      if (isSaving) return;

      event.preventDefault();
      const action = getQuickAddEscapeAction(showBulkChoices);
      if (action === "dismiss-bulk") {
        setShowBulkChoices(false);
        return;
      }
      onClose();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSaving, onClose, showBulkChoices]);

  function resetDialogFields() {
    setInput("");
    setDescription("");
    setSubtaskInput("");
    setShowBulkChoices(false);
    setShowAdvancedFields(false);
    setShowReminderEditor(false);
    setShowDueDialog(false);
    setShowPriorityMenu(false);
    setShowProjectMenu(false);
    setProjectQuery("");
    setProjectOverrideId(undefined);
    setSectionOverrideId(undefined);
    setPriorityOverride(undefined);
    setRecurrenceOverride(undefined);
    setReminderEditorsOverride(undefined);
    setDueOverrideAt(undefined);
    setDueOverrideAllDay(undefined);
    setDeadlineEnabledOverride(undefined);
    setDeadlineAllDayOverride(undefined);
    setDeadlineInputOverride(undefined);
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);
  }

  useEffect(() => {
    if (lastAppliedContextKeyRef.current === dialogContextKey) {
      return;
    }
    lastAppliedContextKeyRef.current = dialogContextKey;
    if (editTask) {
      setInput(serializeTaskToQuickAddInput(payload, editTask, editReminderDrafts));
      setDescription(editTask.description);
      setSubtaskInput("");
      setShowBulkChoices(false);
      setShowAdvancedFields(false);
      setShowReminderEditor(false);
      setShowDueDialog(false);
      setShowPriorityMenu(false);
      setShowProjectMenu(false);
      setProjectQuery("");
      setRelativeAnchorTaskId(null);
      setProjectOverrideId(undefined);
      setSectionOverrideId(undefined);
      setPriorityOverride(undefined);
      setRecurrenceOverride(
        editTask.recurringRule &&
          !recurrenceRuleToQuickAddPhrase(editTask.recurringRule)
          ? editTask.recurringRule
          : undefined,
      );
      setReminderEditorsOverride(
        editReminderDrafts.length > 1
          ? buildReminderEditors(editReminderDrafts)
          : undefined,
      );
      setDueOverrideAt(undefined);
      setDueOverrideAllDay(undefined);
      setDeadlineEnabledOverride(undefined);
      setDeadlineAllDayOverride(undefined);
      setDeadlineInputOverride(undefined);
      window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.setSelectionRange(0, inputRef.current.value.length);
      }, 0);
      return;
    }
    resetDialogFields();
    setRelativeAnchorTaskId(context.relativeAnchorTaskId ?? null);
  }, [
    dialogContextKey,
    context.editTaskId,
    context.defaultDueToday,
    context.defaultProjectId,
    context.defaultSectionId,
    context.relativeAnchorTaskId,
    context.relativePosition,
    editReminderDrafts,
    editTask?.id,
    editTask,
    payload,
  ]);

  async function createTaskFromQuickAdd(
    draft: TaskDraft,
    options?: { silent?: boolean; successMessage?: string },
  ) {
    if (relativeAnchorTaskId && context.relativePosition) {
      return onCreateTaskRelative(
        relativeAnchorTaskId,
        context.relativePosition,
        draft,
        options,
      );
    }
    return onCreateTask(draft, options);
  }

  async function createQuickAddSubtasks(parentTaskId: string) {
    let createdSubtasks = 0;

    for (const line of quickAddSubtaskLines) {
      const subtaskDraft = {
        ...buildDraftFromParsed(
          payload,
          parseQuickAdd(line, new Date(todayStartMs)),
          "",
          {
            defaultProjectId: effectiveDraft.projectId,
            defaultSectionId: effectiveDraft.sectionId,
            defaultDueToday: false,
            relativeAnchorTaskId: null,
            relativePosition: null,
            editTaskId: null,
          },
          todayStartMs,
        ),
        parentTaskId,
      };
      const createdSubtaskId = await onCreateTask(subtaskDraft, {
        silent: true,
      });
      if (createdSubtaskId) {
        createdSubtasks += 1;
      }
    }

    return createdSubtasks;
  }

  async function submitDraft(mode: QuickAddSubmitMode = "close") {
    if (!hasInput) return;
    if (!isEditMode && shouldPromptBulkQuickAdd(input)) {
      setShowBulkChoices(true);
      return;
    }
    if (hasIncompleteReminderEditors(effectiveReminderEditors)) {
      onShowBanner(
        "error",
        "Complete each reminder row or remove it before creating the task.",
      );
      return;
    }
    if (
      effectiveReminderEditors.some((editor) => editor.mode === "OFFSET") &&
      effectiveDraft.dueAt === null
    ) {
      onShowBanner(
        "error",
        "Relative reminders need a due date. Add one in the parser or switch the reminder to a fixed time.",
      );
      return;
    }
    if (effectiveDeadlineEnabled && effectiveDeadlineAt === null) {
      onShowBanner(
        "error",
        "Choose a valid deadline before creating the task.",
      );
      return;
    }

    setIsSaving(true);
    try {
      const shouldCreateSubtasks = quickAddSubtaskLines.length > 0;
      if (editTask) {
        await Promise.resolve(onSaveTask(editTask.id, effectiveDraft));
        if (shouldCreateSubtasks) {
          await createQuickAddSubtasks(editTask.id);
        }
        onClose();
        return;
      }
      const taskId = await createTaskFromQuickAdd(effectiveDraft, {
        silent: shouldCreateSubtasks,
      });
      if (taskId) {
        if (shouldCreateSubtasks) {
          const createdSubtasks = await createQuickAddSubtasks(taskId);
          onShowBanner(
            "success",
            `Task "${effectiveDraft.title.trim()}" created${createdSubtasks > 0 ? ` with ${createdSubtasks} subtask${createdSubtasks === 1 ? "" : "s"}` : ""}.`,
          );
        }
        if (context.relativePosition === "after") {
          setRelativeAnchorTaskId(taskId);
        }
        if (shouldCloseQuickAddAfterCreate(mode)) {
          onClose();
        } else {
          resetDialogFields();
        }
      }
    } finally {
      setIsSaving(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitDraft("close");
  }

  async function createBulkTasks(mode: "single" | "many") {
    if (hasIncompleteReminderEditors(effectiveReminderEditors)) {
      onShowBanner(
        "error",
        "Complete each reminder row or remove it before creating tasks.",
      );
      return;
    }
    setIsSaving(true);
    try {
      if (mode === "single") {
        const mergedDraft = mergeBulkDraftWithDefaults(
          createMergedBulkDraft(
            payload,
            bulkLines,
            description,
            context,
            todayStartMs,
          ),
          effectiveDraft,
          "",
        );
        if (
          mergedDraft.reminders.some(
            (reminder) => reminder.kind === "OFFSET",
          ) &&
          mergedDraft.dueAt === null
        ) {
          onShowBanner(
            "error",
            "Relative reminders need a due date before they can be applied to the combined task.",
          );
          return;
        }
        const taskId = await createTaskFromQuickAdd(mergedDraft, {
          successMessage: "Combined list into 1 task.",
        });
        if (taskId) {
          if (context.relativePosition === "after") {
            setRelativeAnchorTaskId(taskId);
          }
          onClose();
        }
        return;
      }

      let currentAnchorTaskId = relativeAnchorTaskId;
      for (const line of bulkLines) {
        const parsedLine = parseQuickAdd(line);
        const baseDraft = buildDraftFromParsed(
          payload,
          parsedLine,
          description,
          context,
          todayStartMs,
        );
        const draft = mergeBulkDraftWithDefaults(
          baseDraft,
          effectiveDraft,
          line,
        );
        if (
          draft.reminders.some((reminder) => reminder.kind === "OFFSET") &&
          draft.dueAt === null
        ) {
          onShowBanner(
            "error",
            "Each task needs a due date before a relative reminder can be applied.",
          );
          return;
        }
        if (currentAnchorTaskId && context.relativePosition) {
          const createdTaskId = await onCreateTaskRelative(
            currentAnchorTaskId,
            context.relativePosition,
            draft,
            { silent: true },
          );
          if (context.relativePosition === "after" && createdTaskId) {
            currentAnchorTaskId = createdTaskId;
          }
        } else {
          await onCreateTask(draft, { silent: true });
        }
      }
      if (context.relativePosition === "after") {
        setRelativeAnchorTaskId(currentAnchorTaskId);
      }
      onShowBanner("success", `${bulkLines.length} tasks created.`);
      onClose();
    } finally {
      setIsSaving(false);
      setShowBulkChoices(false);
    }
  }

  submitDraftRef.current = submitDraft;
  createBulkTasksRef.current = createBulkTasks;

  function applyQuickAddDueAt(nextDueAt: number | null, nextAllDay = true) {
    setDueOverrideAt(nextDueAt);
    setDueOverrideAllDay(nextAllDay);
    setShowDueDialog(false);
  }

  function applyQuickAddPostpone() {
    const postponedDueAt = getPostponeDate(quickAddPreviewTask, todayStartMs);
    if (postponedDueAt === null) {
      applyQuickAddDueAt(null, false);
      return;
    }
    applyQuickAddDueAt(
      postponedDueAt,
      postponedDueAt === startOfDay(postponedDueAt).getTime(),
    );
  }

  return (
    <div
      data-overlay-dialog="true"
      className="fixed inset-0 z-40 flex items-center justify-center bg-[#221E1C]/40 px-4 py-8 backdrop-blur-sm"
    >
      <div className="w-full max-w-xl rounded-2xl border border-[var(--app-shell-border)] bg-[var(--app-shell-bg-soft)] p-4 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[#9F7B63]">
              Quick add
            </p>
            <h3 className="mt-1 text-xl font-semibold text-[#1E2D2F]">
              {isEditMode ? "Edit task" : "Create a task"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg border border-[#E1D5CA] bg-[var(--app-surface)] p-1.5 text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="mt-4 space-y-3">
          <section className="rounded-xl border border-[#E1D5CA] bg-[var(--app-surface)] p-4 shadow-sm">
            <label className="block">
              <span className="sr-only">Task parser</span>
              <textarea
                autoFocus
                ref={inputRef}
                data-onboarding-target="quick-add-parser"
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  if (showBulkChoices) setShowBulkChoices(false);
                }}
                rows={1}
                placeholder="Pay rent every month on the 1st at 9am p1 #bills"
                className="min-h-[44px] w-full resize-none border-0 bg-transparent px-0 py-0 text-base font-semibold text-[#1E2D2F] outline-none placeholder:text-[#9A9188]"
              />
            </label>
            <p className="mt-1 text-xs text-[#8A8076]">
              Use plain language for dates, priorities, projects, reminders, and
              repeat rules. Example: `Pay rent every month on the 1st at 9am p1
              #bills`.
            </p>
            {onboardingExample && !input.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setInput(onboardingExample);
                  window.setTimeout(() => inputRef.current?.focus(), 0);
                }}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-3 py-1.5 text-xs font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1]"
              >
                <span>Try example</span>
                <span className="text-[#8A5A44]">{onboardingExample}</span>
              </button>
            ) : null}

            <label className="mt-3 block">
              <span className="sr-only">Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={2}
                placeholder="Description"
                className="w-full resize-none border-0 bg-transparent px-0 py-0 text-sm text-[#6D5C50] outline-none placeholder:text-[#9A9188]"
              />
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowDueDialog(true);
                  setShowPriorityMenu(false);
                  setShowProjectMenu(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E1D5CA] bg-[var(--app-surface)] px-2.5 py-1.5 text-xs font-medium text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
              >
                <CalendarDays size={14} className="text-[#4E9A57]" />
                <span>{dueSummaryLabel}</span>
                {effectiveDraft.dueAt !== null ? (
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(event) => {
                      event.stopPropagation();
                      setDueOverrideAt(null);
                      setDueOverrideAllDay(false);
                    }}
                    className="rounded-full p-0.5 text-[#8A8076] transition hover:bg-[#F1ECE7] hover:text-[#1E2D2F]"
                  >
                    <X size={12} />
                  </span>
                ) : null}
              </button>

              <div ref={priorityMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowPriorityMenu((current) => !current);
                    setShowProjectMenu(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[#E1D5CA] bg-[var(--app-surface)] px-2.5 py-1.5 text-xs font-medium text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
                >
                  <Flag size={14} className="text-[#6D5C50]" />
                  <span>{prioritySummaryLabel}</span>
                  <ChevronDown size={14} className="text-[#8A8076]" />
                </button>
                {showPriorityMenu ? (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-20 w-36 rounded-xl border border-[#E1D5CA] bg-[var(--app-surface)] p-1.5 shadow-xl">
                    {(["P1", "P2", "P3", "P4"] as Priority[]).map(
                      (priority) => (
                        <button
                          key={priority}
                          type="button"
                          onClick={() => {
                            setPriorityOverride(priority);
                            setShowPriorityMenu(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition ${
                            effectivePriority === priority
                              ? "bg-[#FFF1EB] text-[#B64B28]"
                              : "text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                          }`}
                        >
                          <span>{priority}</span>
                          {effectivePriority === priority ? (
                            <Check size={14} />
                          ) : null}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPriorityOverride(undefined);
                        setShowPriorityMenu(false);
                      }}
                      className="mt-1 flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs font-medium text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
                    >
                      <span>Use parser</span>
                      {priorityOverride === undefined ? (
                        <Check size={14} />
                      ) : null}
                    </button>
                  </div>
                ) : null}
              </div>

              <button
                type="button"
                onClick={() => setShowReminderEditor((current) => !current)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  showReminderEditor || effectiveDraft.reminders.length
                    ? "border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28] hover:bg-[#FDE9E1]"
                    : "border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                <Bell
                  size={14}
                  className={
                    showReminderEditor || effectiveDraft.reminders.length
                      ? "text-[#B64B28]"
                      : "text-[#6D5C50]"
                  }
                />
                <span>{reminderSummaryLabel}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowAdvancedFields((current) => !current);
                  setShowProjectMenu(false);
                  setShowPriorityMenu(false);
                }}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition ${
                  showAdvancedFields || hasManualMetadataOverrides
                    ? "border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28] hover:bg-[#FDE9E1]"
                    : "border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                }`}
              >
                <MoreHorizontal
                  size={14}
                  className={
                    showAdvancedFields || hasManualMetadataOverrides
                      ? "text-[#B64B28]"
                      : "text-[#6D5C50]"
                  }
                />
                <span>More</span>
              </button>
            </div>

            {showReminderEditor ? (
              <section className="mt-4 rounded-[22px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1E2D2F]">
                      Reminders
                    </p>
                    <p className="mt-1 text-sm text-[#6D5C50]">
                      Add fixed-time or relative reminders for this task.
                    </p>
                  </div>
                  {reminderEditorsOverride !== undefined ? (
                    <button
                      type="button"
                      onClick={() => setReminderEditorsOverride(undefined)}
                      className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
                    >
                      Use parser
                    </button>
                  ) : null}
                </div>
                <ReminderListEditor
                  reminders={effectiveReminderEditors}
                  dueAt={effectiveDraft.dueAt}
                  onChange={(nextEditors) =>
                    setReminderEditorsOverride(nextEditors)
                  }
                  autoLabel={
                    reminderEditorsOverride !== undefined
                      ? renderReminderSourceLabel(previewDraft.reminders)
                      : undefined
                  }
                  onReset={
                    reminderEditorsOverride !== undefined
                      ? () => setReminderEditorsOverride(undefined)
                      : undefined
                  }
                />
              </section>
            ) : null}

            {showAdvancedFields ? (
              <section className="mt-4 rounded-[22px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1E2D2F]">
                      More options
                    </p>
                  </div>
                  {hasManualMetadataOverrides ? (
                    <button
                      type="button"
                      onClick={() => {
                        setProjectOverrideId(undefined);
                        setSectionOverrideId(undefined);
                        setPriorityOverride(undefined);
                        setRecurrenceOverride(undefined);
                        setReminderEditorsOverride(undefined);
                        setDueOverrideAt(undefined);
                        setDueOverrideAllDay(undefined);
                        setDeadlineEnabledOverride(undefined);
                        setDeadlineAllDayOverride(undefined);
                        setDeadlineInputOverride(undefined);
                      }}
                      className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
                    >
                      Use parser values
                    </button>
                  ) : null}
                </div>

                <div className="mt-4 space-y-4">
                  <div className="rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1E2D2F]">
                          Deadline
                        </p>
                        <p className="mt-1 text-sm text-[#6D5C50]">
                          Track a separate deadline for the task.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const nextEnabled = !effectiveDeadlineEnabled;
                          setDeadlineEnabledOverride(nextEnabled);
                          if (nextEnabled && !effectiveDeadlineInput) {
                            setDeadlineInputOverride(
                              toInputValue(todayStartMs, true),
                            );
                            setDeadlineAllDayOverride(true);
                          }
                        }}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                          effectiveDeadlineEnabled
                            ? "bg-[#EE6A3C] text-white hover:bg-[#d75e33]"
                            : "border border-[#E1D5CA] bg-[var(--app-surface)] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                        }`}
                      >
                        {effectiveDeadlineEnabled ? "Enabled" : "Add deadline"}
                      </button>
                    </div>
                    {effectiveDeadlineEnabled ? (
                      <div className="mt-4 grid gap-3 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
                        <label className="inline-flex items-center gap-2 text-sm text-[#6D5C50]">
                          <input
                            type="checkbox"
                            checked={effectiveDeadlineAllDay}
                            onChange={(event) =>
                              setDeadlineAllDayOverride(event.target.checked)
                            }
                            className="h-4 w-4 rounded border-[#D7C5B7] text-[#EE6A3C] focus:ring-[#EE6A3C]"
                          />
                          All day
                        </label>
                        <input
                          type={
                            effectiveDeadlineAllDay ? "date" : "datetime-local"
                          }
                          value={effectiveDeadlineInput}
                          onChange={(event) =>
                            setDeadlineInputOverride(event.target.value)
                          }
                          className="w-full rounded-[16px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
                        />
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4">
                    <RecurrenceField
                      label="Repeat schedule"
                      value={effectiveRecurrenceRule}
                      onChange={setRecurrenceOverride}
                      description="Set a repeat rule without relying only on the parser."
                      onReset={
                        recurrenceOverride !== undefined
                          ? () => setRecurrenceOverride(undefined)
                          : undefined
                      }
                    />
                  </div>

                  <div className="rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface)] p-4">
                    <div>
                      <p className="text-sm font-semibold text-[#1E2D2F]">
                        Subtasks
                      </p>
                      <p className="mt-1 text-sm text-[#6D5C50]">
                        Add one subtask per line. Quick Add parsing works here
                        too.
                      </p>
                    </div>
                    <textarea
                      value={subtaskInput}
                      onChange={(event) => setSubtaskInput(event.target.value)}
                      rows={3}
                      placeholder={"Draft outline\nCollect links\nSend final version"}
                      className="mt-3 w-full rounded-[16px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm leading-6 outline-none transition focus:border-[#EE6A3C]"
                    />
                    {quickAddSubtaskLines.length > 0 ? (
                      <p className="mt-2 text-xs font-semibold text-[#8A8076]">
                        {quickAddSubtaskLines.length} subtask
                        {quickAddSubtaskLines.length === 1 ? "" : "s"} will be
                        created with this task.
                      </p>
                    ) : null}
                  </div>
                </div>
              </section>
            ) : null}

            {!isEditMode && bulkLines.length > 1 ? (
              <section className="mt-4 rounded-[20px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#1E2D2F]">
                      {bulkLines.length > 1
                        ? `Bulk add preview · ${bulkLines.length} tasks`
                        : "Parsed metadata"}
                    </p>
                    <p className="mt-1 text-sm text-[#6D5C50]">
                      {bulkLines.length > 1
                        ? "Each line will be parsed as its own task. You can also combine the pasted list into one task."
                        : "Parser output stays visible here so you can trust what will be created."}
                    </p>
                  </div>
                  {context.defaultDueToday || context.defaultProjectId ? (
                    <span className="rounded-full bg-[var(--app-surface)] px-3 py-1 text-xs font-semibold text-[#9F7B63]">
                      {describeQuickAddContext(payload, context)}
                    </span>
                  ) : null}
                </div>

                {bulkLines.length > 1 ? (
                  <div className="mt-4 rounded-[18px] border border-[#E7DDD4] bg-[var(--app-surface)] px-4 py-3 text-sm text-[#6D5C50]">
                    <p className="font-medium text-[#1E2D2F]">
                      First task preview
                    </p>
                    <p className="mt-2">{bulkLines[0]}</p>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {renderQuickAddMetadata(payload, effectiveDraft).map(
                      (item) => (
                        <span
                          key={item}
                          className="rounded-full border border-[#E7DDD4] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[#6D5C50]"
                        >
                          {item}
                        </span>
                      ),
                    )}
                  </div>
                )}
              </section>
            ) : null}
          </section>

          {showBulkChoices ? (
            <section className="rounded-[22px] border border-[#F1C7B5] bg-[#FFF1EB] px-4 py-4">
              <p className="text-sm font-semibold text-[#A24628]">
                Add {bulkLines.length} tasks?
              </p>
              <p className="mt-1 text-sm text-[#8A5A44]">
                Review the pasted list, then either combine it into one task or
                create one task per line.
              </p>
              <div className="mt-3 flex flex-wrap justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowBulkChoices(false)}
                  className="rounded-lg border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSaving || bulkLines.length === 0}
                  onClick={() => void createBulkTasks("single")}
                  className="rounded-lg border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Adding..." : "Combine into 1 task"}
                </button>
                <button
                  type="button"
                  disabled={isSaving || bulkLines.length === 0}
                  onClick={() => void createBulkTasks("many")}
                  className="rounded-lg bg-[#EE6A3C] px-3 py-2 text-xs font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Adding..." : `Add all ${bulkLines.length}`}
                </button>
              </div>
            </section>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-[#E7DDD4] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div ref={projectMenuRef} className="relative self-start">
              <button
                type="button"
                onClick={() => {
                  setShowProjectMenu((current) => !current);
                  setShowPriorityMenu(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#E1D5CA] bg-[var(--app-surface)] px-2.5 py-1.5 text-xs font-medium text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
              >
                <Folder size={14} className="text-[#6D5C50]" />
                <span>{describeQuickAddLocation(payload, effectiveDraft)}</span>
                <ChevronDown size={14} className="text-[#8A8076]" />
              </button>
              {showProjectMenu ? (
                <div className="absolute left-0 top-[calc(100%+10px)] z-20 w-[320px] rounded-[20px] border border-[#E1D5CA] bg-[var(--app-surface)] p-3 shadow-xl">
                  <input
                    ref={projectQueryRef}
                    value={projectQuery}
                    onChange={(event) => setProjectQuery(event.target.value)}
                    placeholder="Type a project name"
                    className="w-full rounded-[14px] border border-[#D7C5B7] bg-[var(--app-surface)] px-3 py-2 text-sm outline-none transition focus:border-[#EE6A3C]"
                  />
                  <div className="mt-3 max-h-64 space-y-1 overflow-y-auto">
                    <button
                      type="button"
                      onClick={() => {
                        setProjectOverrideId(null);
                        setSectionOverrideId(null);
                        setShowProjectMenu(false);
                      }}
                      className={`flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm font-medium transition ${
                        effectiveProjectId === null
                          ? "bg-[var(--app-surface-soft)] text-[#1E2D2F]"
                          : "text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                      }`}
                    >
                      <span>Inbox</span>
                      {effectiveProjectId === null ? (
                        <Check size={14} className="text-[#EE6A3C]" />
                      ) : null}
                    </button>
                    <div className="px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#9F7B63]">
                      My Projects
                    </div>
                    {filteredProjects.map((project) => (
                      <div key={project.id} className="space-y-1">
                        <button
                          type="button"
                          onClick={() => {
                            setProjectOverrideId(project.id);
                            setSectionOverrideId(null);
                            setShowProjectMenu(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm font-medium transition ${
                            effectiveProjectId === project.id &&
                            effectiveSectionId === null
                              ? "bg-[var(--app-surface-soft)] text-[#1E2D2F]"
                              : "text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                          }`}
                        >
                          <span>{project.name}</span>
                          {effectiveProjectId === project.id &&
                          effectiveSectionId === null ? (
                            <Check size={14} className="text-[#EE6A3C]" />
                          ) : null}
                        </button>
                        {effectiveProjectId === project.id
                          ? getProjectSections(payload, project.id).map(
                              (section) => (
                                <button
                                  key={section.id}
                                  type="button"
                                  onClick={() => {
                                    setProjectOverrideId(project.id);
                                    setSectionOverrideId(section.id);
                                    setShowProjectMenu(false);
                                  }}
                                  className={`ml-4 flex w-[calc(100%-1rem)] items-center justify-between rounded-[14px] px-3 py-2 text-left text-sm transition ${
                                    effectiveSectionId === section.id
                                      ? "bg-[#FFF1EB] text-[#B64B28]"
                                      : "text-[#6D5C50] hover:bg-[var(--app-surface-soft)]"
                                  }`}
                                >
                                  <span>{section.name}</span>
                                  {effectiveSectionId === section.id ? (
                                    <Check
                                      size={14}
                                      className="text-[#EE6A3C]"
                                    />
                                  ) : null}
                                </button>
                              ),
                            )
                          : null}
                      </div>
                    ))}
                    {!filteredProjects.length ? (
                      <div className="rounded-[14px] border border-dashed border-[#E1D5CA] px-3 py-4 text-sm text-[#6D5C50]">
                        No matching projects.
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-wrap justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-2 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || !hasInput}
                className="rounded-lg bg-[#EE6A3C] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isSaving
                  ? isEditMode
                    ? "Saving..."
                    : "Creating..."
                  : !isEditMode && bulkLines.length > 1
                    ? `Review ${bulkLines.length} tasks`
                    : isEditMode
                      ? "Save changes"
                      : "Create task"}
              </button>
              {!isEditMode ? (
                <button
                  type="button"
                  disabled={isSaving || !hasInput || bulkLines.length > 1}
                  onClick={() => void submitDraft("continue")}
                  className="rounded-lg border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSaving ? "Creating..." : "Create & add another"}
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </div>

      {showDueDialog ? (
        <RescheduleDialog
          title="Reschedule task"
          description={`Choose a new date for "${effectiveDraft.title || "this task"}".`}
          tasks={[quickAddPreviewTask]}
          onClose={() => setShowDueDialog(false)}
          onRescheduleTasks={(_, dueAt) =>
            applyQuickAddDueAt(
              dueAt,
              dueAt !== null ? startOfDay(dueAt).getTime() === dueAt : false,
            )
          }
          onPostponeTasks={() => applyQuickAddPostpone()}
        />
      ) : null}
    </div>
  );
}

function buildQuickAddPreviewTask(draft: TaskDraft): Task {
  const now = Date.now();
  return {
    id: "__quick-add-preview__",
    title: draft.title.trim() || "Untitled task",
    description: draft.description,
    projectId: draft.projectId,
    sectionId: draft.sectionId,
    priority: draft.priority,
    dueAt: draft.dueAt,
    allDay: draft.allDay,
    deadlineAt: draft.deadlineAt,
    deadlineAllDay: draft.deadlineAllDay,
    recurringRule: draft.recurringRule,
    deadlineRecurringRule: draft.deadlineRecurringRule,
    status: "OPEN",
    completedAt: null,
    parentTaskId: draft.parentTaskId,
    locationId: null,
    locationTriggerType: null,
    order: 0,
    createdAt: now,
    updatedAt: now,
  };
}

function RescheduleDialog({
  title,
  description,
  tasks,
  anchorRect,
  onClose,
  onRescheduleTasks,
  onPostponeTasks,
}: {
  title: string;
  description: string;
  tasks: Task[];
  anchorRect?: DOMRect | null;
  onClose: () => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
}) {
  const todayStartMs = useTodayStartMs();
  const weekStartsOn = getGlobalWebDisplayPreferences().weekStartsOn;
  const [visibleMonthStart, setVisibleMonthStart] = useState(() =>
    startOfMonth(new Date(tasks[0]?.dueAt ?? todayStartMs)),
  );
  const taskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const postponeTargets = useMemo(
    () =>
      Array.from(
        new Set(
          tasks
            .map((task) => getPostponeDate(task, todayStartMs))
            .filter((value): value is number => value !== null),
        ),
      ),
    [tasks, todayStartMs],
  );
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(visibleMonthStart);
    const gridStart = startOfWeek(monthStart, { weekStartsOn });
    const gridEnd = addDays(gridStart, 41);
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [visibleMonthStart, weekStartsOn]);
  const weekdayLabels = useMemo(() => {
    const weekStart = startOfWeek(todayStartMs, { weekStartsOn });
    return eachDayOfInterval({
      start: weekStart,
      end: addDays(weekStart, 6),
    }).map((day) => format(day, "EEEEE"));
  }, [todayStartMs, weekStartsOn]);

  function applyDate(dueAt: number | null) {
    onRescheduleTasks(taskIds, dueAt);
    onClose();
  }

  function applyPostpone() {
    onPostponeTasks(taskIds);
    onClose();
  }

  const shortcutItems = [
    {
      key: "today",
      label: "Today",
      meta: format(todayStartMs, "EEE"),
      icon: SunMedium,
      onSelect: () => applyDate(todayStartMs),
    },
    {
      key: "tomorrow",
      label: "Tomorrow",
      meta: format(addDays(todayStartMs, 1), "EEE"),
      icon: Sunrise,
      onSelect: () => applyDate(addDays(todayStartMs, 1).getTime()),
    },
    {
      key: "weekend",
      label: "This weekend",
      meta: format(getWeekendDate(todayStartMs), "EEE"),
      icon: CalendarDays,
      onSelect: () => applyDate(getWeekendDate(todayStartMs).getTime()),
    },
    {
      key: "next-week",
      label: "Next week",
      meta: format(getNextWeekDate(todayStartMs, weekStartsOn), "EEE MMM d"),
      icon: ChevronRight,
      onSelect: () =>
        applyDate(getNextWeekDate(todayStartMs, weekStartsOn).getTime()),
    },
    {
      key: "postpone",
      label: "Postpone",
      meta:
        postponeTargets.length === 1
          ? format(postponeTargets[0], "EEE MMM d")
          : "Varies",
      icon: RefreshCw,
      onSelect: applyPostpone,
    },
    {
      key: "no-date",
      label: "No Date",
      meta: null,
      icon: CircleSlash,
      onSelect: () => applyDate(null),
    },
  ] as const;

  return (
    <ChoiceDialog
      title={title}
      description={description}
      onClose={onClose}
      anchorRect={anchorRect}
      dialogClassName="max-w-[640px]"
      childrenClassName="overflow-x-hidden pr-0"
    >
      <div className="grid gap-6 md:grid-cols-[240px_auto]">
        <div className="space-y-1">
          {shortcutItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                data-dialog-autofocus={index === 0 ? "true" : undefined}
                type="button"
                onClick={item.onSelect}
                className="flex w-full items-center gap-3 rounded-[18px] px-3 py-2 text-left transition hover:bg-[var(--app-surface-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#EE6A3C]"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#FFF1EB] text-[#EE6A3C]">
                  <Icon size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-[#1E2D2F]">
                    {item.label}
                  </span>
                </span>
                {item.meta ? (
                  <span className="shrink-0 whitespace-nowrap text-right text-sm text-[#6D5C50]">
                    {item.meta}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
        <div className="border-t border-[#EDE3DA] pt-4 md:min-w-[280px] md:border-l md:border-t-0 md:pl-6 md:pt-0">
          <div className="flex items-center justify-between">
            <p className="text-base font-semibold text-[#1E2D2F]">
              {format(visibleMonthStart, "MMM yyyy")}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setVisibleMonthStart((current) => subMonths(current, 1))
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#6D5C50] transition hover:bg-[var(--app-surface-soft)]"
                aria-label="Previous month"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() =>
                  setVisibleMonthStart((current) => addMonths(current, 1))
                }
                className="flex h-8 w-8 items-center justify-center rounded-full text-[#6D5C50] transition hover:bg-[var(--app-surface-soft)]"
                aria-label="Next month"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-xs font-medium uppercase tracking-[0.16em] text-[#9B8576]">
            {weekdayLabels.map((label, index) => (
              <span key={`${label}-${index}`}>{label}</span>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-7 gap-1.5">
            {calendarDays.map((day) => {
              const dayStart = startOfDay(day).getTime();
              const inCurrentMonth =
                day.getMonth() === visibleMonthStart.getMonth();
              const isSelected = tasks.some(
                (task) =>
                  task.dueAt !== null && isSameDay(task.dueAt, dayStart),
              );
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => applyDate(dayStart)}
                  className={`flex h-9 w-9 items-center justify-center justify-self-center rounded-full border text-sm transition ${
                    isSelected
                      ? "border-[#EE6A3C] bg-[#FFF1EB] font-semibold text-[#B64B28]"
                      : inCurrentMonth
                        ? "border-[#E1D5CA] text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
                        : "border-transparent text-[#C5B5A8] hover:bg-[var(--app-surface-soft)]"
                  } ${isToday(dayStart) ? "ring-2 ring-[#F4B79F] ring-offset-2 ring-offset-white" : ""}`}
                >
                  {format(day, "d")}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </ChoiceDialog>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  onClose,
  onConfirm,
  tone = "primary",
  disabled = false,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  tone?: "primary" | "destructive";
  disabled?: boolean;
}) {
  return (
    <ChoiceDialog
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className={`rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-70 ${
              tone === "destructive"
                ? "bg-[#B64B28] hover:bg-[#9e4122]"
                : "bg-[#EE6A3C] hover:bg-[#d75e33]"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      }
    />
  );
}

function TextInputDialog({
  title,
  description,
  label,
  value,
  onChange,
  onClose,
  onSubmit,
  submitLabel,
}: {
  title: string;
  description: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (value: string) => void;
  submitLabel: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <ChoiceDialog
      title={title}
      description={description}
      onClose={onClose}
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="text-input-dialog-form"
            className="rounded-full bg-[#EE6A3C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d75e33]"
          >
            {submitLabel}
          </button>
        </div>
      }
    >
      <form
        id="text-input-dialog-form"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(value);
        }}
      >
        <Field label={label}>
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className="w-full rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
          />
        </Field>
      </form>
    </ChoiceDialog>
  );
}

function OverflowMenu({
  label,
  items,
}: {
  label: string;
  items: Array<{
    label: string;
    onSelect: () => void;
    tone?: "default" | "destructive";
  }>;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [openDirection, setOpenDirection] = useState<"down" | "up">("down");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  function updateOpenDirection() {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const estimatedMenuHeight = items.length * 42 + 18;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    setOpenDirection(
      spaceBelow < estimatedMenuHeight && spaceAbove > spaceBelow
        ? "up"
        : "down",
    );
  }

  function stopTriggerEvent(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (containerRef.current?.contains(event.target as Node | null)) return;
      setIsOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setIsOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, items.length]);

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        data-task-row-menu-trigger="true"
        onMouseDown={stopTriggerEvent}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsOpen((current) => {
            const next = !current;
            if (!current && next) {
              updateOpenDirection();
            }
            return next;
          });
        }}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] text-[#6D5C50] transition hover:bg-[var(--app-surface-soft)]"
      >
        <MoreHorizontal size={16} />
      </button>
      {isOpen ? (
        <div
          className={`absolute right-0 z-20 max-h-[min(320px,calc(100vh-32px))] min-w-[220px] overflow-y-auto rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface)] p-1.5 shadow-xl ${openDirection === "up" ? "bottom-full mb-2" : "top-full mt-2"}`}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              onMouseDown={stopTriggerEvent}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setIsOpen(false);
                item.onSelect();
              }}
              className={`flex w-full items-center rounded-[14px] px-3 py-2.5 text-left text-sm font-medium transition ${
                item.tone === "destructive"
                  ? "text-[#B64B28] hover:bg-[#FFF1EB]"
                  : "text-[#1E2D2F] hover:bg-[var(--app-surface-soft)]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function TaskRowActions({
  payload,
  task,
  actionState,
  onSetActionState,
  onSaveTask,
  onOpenQuickAdd,
  onArchiveTask,
  onRescheduleTasks,
  onPostponeTasks,
  onMoveTasksToProject,
  onMoveTasksToSection,
  onSetTasksPriority,
  onDeleteTasks,
  onDuplicateTask,
}: {
  payload: SyncPayload;
  task: Task;
  actionState: {
    mode: "reschedule" | "priority" | "deadline" | "reminders" | "move";
    taskId: string;
    anchorRect?: DOMRect | null;
  } | null;
  onSetActionState: (
    state: {
      mode: "reschedule" | "priority" | "deadline" | "reminders" | "move";
      taskId: string;
      anchorRect?: DOMRect | null;
    } | null,
  ) => void;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onOpenQuickAdd: (overrides?: Partial<QuickAddContext>) => void;
  onArchiveTask: (taskId: string) => void;
  onRescheduleTasks: (taskIds: string[], dueAt: number | null) => void;
  onPostponeTasks: (taskIds: string[]) => void;
  onMoveTasksToProject: (taskIds: string[], projectId: string | null) => void;
  onMoveTasksToSection?: (taskIds: string[], sectionId: string | null) => void;
  onSetTasksPriority: (taskIds: string[], priority: Priority) => void;
  onDeleteTasks: (taskIds: string[]) => void;
  onDuplicateTask: (taskId: string) => Promise<string | null>;
}) {
  const navigate = useNavigate();
  const isRescheduleOpen =
    actionState?.mode === "reschedule" && actionState.taskId === task.id;
  const isPriorityOpen =
    actionState?.mode === "priority" && actionState.taskId === task.id;
  const isDeadlineOpen =
    actionState?.mode === "deadline" && actionState.taskId === task.id;
  const isRemindersOpen =
    actionState?.mode === "reminders" && actionState.taskId === task.id;
  const isMoveOpen =
    actionState?.mode === "move" && actionState.taskId === task.id;
  const taskReminderDrafts = useMemo(
    () => getTaskReminderDrafts(payload, task.id),
    [payload, task.id],
  );
  const activeProjects = useMemo(() => getActiveProjects(payload), [payload]);
  const taskProject = useMemo(
    () =>
      task.projectId ? (getProjectById(payload, task.projectId) ?? null) : null,
    [payload, task.projectId],
  );
  const taskProjectSections = useMemo(
    () => (task.projectId ? getProjectSections(payload, task.projectId) : []),
    [payload, task.projectId],
  );
  function stopRowActionEvent(event: ReactMouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
  }

  function openRescheduleDialog(event: ReactMouseEvent<HTMLButtonElement>) {
    stopRowActionEvent(event);
    const row = event.currentTarget.closest<HTMLElement>(
      '[data-task-row="true"]',
    );
    onSetActionState({
      mode: "reschedule",
      taskId: task.id,
      anchorRect: row?.getBoundingClientRect() ?? null,
    });
  }

  function openPriorityDialog(event: ReactMouseEvent<HTMLButtonElement>) {
    stopRowActionEvent(event);
    const row = event.currentTarget.closest<HTMLElement>(
      '[data-task-row="true"]',
    );
    onSetActionState({
      mode: "priority",
      taskId: task.id,
      anchorRect: row?.getBoundingClientRect() ?? null,
    });
  }

  function handleCreateRelative(position: "before" | "after") {
    onOpenQuickAdd({
      defaultProjectId: task.projectId,
      defaultSectionId: task.sectionId,
      defaultDueToday: false,
      relativeAnchorTaskId: task.id,
      relativePosition: position,
    });
  }

  async function handleDuplicate() {
    await onDuplicateTask(task.id);
  }

  return (
    <>
      <button
        type="button"
        title="Reschedule task"
        aria-label={`Reschedule ${task.title}`}
        onMouseDown={stopRowActionEvent}
        onClick={openRescheduleDialog}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] text-[#6D5C50] transition hover:bg-[var(--app-surface-soft)]"
      >
        <CalendarDays size={14} />
      </button>
      <button
        type="button"
        title={`Priority ${task.priority}`}
        aria-label={`Change priority for ${task.title}`}
        onMouseDown={stopRowActionEvent}
        onClick={openPriorityDialog}
        className="flex h-8 w-8 items-center justify-center rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] text-[#6D5C50] transition hover:bg-[var(--app-surface-soft)]"
      >
        <Flag size={14} />
      </button>
      <OverflowMenu
        label={`More actions for ${task.title}`}
        items={[
          {
            label: "Add task above",
            onSelect: () => {
              void handleCreateRelative("before");
            },
          },
          {
            label: "Add task below",
            onSelect: () => {
              void handleCreateRelative("after");
            },
          },
          {
            label: "Activity",
            onSelect: () => navigate(`/task/${task.id}/activity`),
          },
          {
            label: task.deadlineAt ? "Change deadline" : "Add deadline",
            onSelect: () =>
              onSetActionState({ mode: "deadline", taskId: task.id }),
          },
          {
            label: taskReminderDrafts.length
              ? "Change reminders"
              : "Add reminders",
            onSelect: () =>
              onSetActionState({ mode: "reminders", taskId: task.id }),
          },
          {
            label: "Move task",
            onSelect: () => onSetActionState({ mode: "move", taskId: task.id }),
          },
          {
            label: "Duplicate",
            onSelect: () => {
              void handleDuplicate();
            },
          },
          {
            label: task.status === "ARCHIVED" ? "Unarchive" : "Archive",
            onSelect: () => onArchiveTask(task.id),
          },
          {
            label: "Delete",
            tone: "destructive",
            onSelect: () => {
              onDeleteTasks([task.id]);
            },
          },
        ]}
      />

      {isRescheduleOpen ? (
        <RescheduleDialog
          title="Reschedule task"
          description={`Pick a new date for "${task.title}".`}
          onClose={() => onSetActionState(null)}
          tasks={[task]}
          anchorRect={actionState?.anchorRect}
          onRescheduleTasks={onRescheduleTasks}
          onPostponeTasks={onPostponeTasks}
        />
      ) : null}

      {isPriorityOpen ? (
        <ChoiceDialog
          title="Change priority"
          description={`Update the priority for "${task.title}".`}
          onClose={() => onSetActionState(null)}
          anchorRect={actionState?.anchorRect}
        >
          <div className="flex flex-wrap gap-2 text-sm justify-center">
            {(["P1", "P2", "P3", "P4"] as Priority[]).map((priority) => (
              <button
                key={priority}
                type="button"
                onClick={() => {
                  onSetTasksPriority([task.id], priority);
                  onSetActionState(null);
                }}
                className={`rounded-lg border px-3 py-1.5 font-semibold transition ${
                  task.priority === priority
                    ? "border-[#EE6A3C] bg-[#FFF1EB] text-[#B64B28]"
                    : "border-[#E1D5CA] bg-[var(--app-surface-soft)] text-[#1E2D2F] hover:bg-[var(--app-surface)]"
                }`}
              >
                {priority}
              </button>
            ))}
          </div>
        </ChoiceDialog>
      ) : null}

      {isDeadlineOpen ? (
        <TaskDeadlineDialog
          task={task}
          payload={payload}
          onSaveTask={onSaveTask}
          onClose={() => onSetActionState(null)}
        />
      ) : null}

      {isRemindersOpen ? (
        <TaskRemindersDialog
          task={task}
          initialReminders={taskReminderDrafts}
          payload={payload}
          onSaveTask={onSaveTask}
          onClose={() => onSetActionState(null)}
        />
      ) : null}

      {isMoveOpen ? (
        <ChoiceDialog
          title="Move task"
          description={`Move "${task.title}" somewhere else.`}
          onClose={() => onSetActionState(null)}
        >
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9F7B63]">
                Quick destinations
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  data-dialog-autofocus="true"
                  type="button"
                  onClick={() => {
                    onMoveTasksToProject([task.id], null);
                    onSetActionState(null);
                  }}
                  className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
                >
                  Inbox
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onMoveTasksToSection?.([task.id], null);
                    onSetActionState(null);
                  }}
                  className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
                >
                  {taskProject?.name ?? "Project"} / Loose tasks
                </button>
              </div>
            </div>
            {taskProject &&
            taskProjectSections.length &&
            onMoveTasksToSection ? (
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9F7B63]">
                  Sections in {taskProject.name}
                </p>
                <div className="flex flex-wrap gap-2">
                  {taskProjectSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => {
                        onMoveTasksToSection([task.id], section.id);
                        onSetActionState(null);
                      }}
                      className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
                    >
                      {section.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#9F7B63]">
                Projects
              </p>
              <div className="flex flex-wrap gap-2">
                {activeProjects
                  .filter((project) => project.id !== task.projectId)
                  .map((project) => (
                    <button
                      key={project.id}
                      type="button"
                      onClick={() => {
                        onMoveTasksToProject([task.id], project.id);
                        onSetActionState(null);
                      }}
                      className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
                    >
                      {project.name}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        </ChoiceDialog>
      ) : null}
    </>
  );
}

function TaskDeadlineDialog({
  task,
  payload,
  onSaveTask,
  onClose,
}: {
  task: Task;
  payload: SyncPayload;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onClose: () => void;
}) {
  const [deadlineEnabled, setDeadlineEnabled] = useState(
    Boolean(task.deadlineAt),
  );
  const [deadlineAllDay, setDeadlineAllDay] = useState(
    task.deadlineAllDay ?? false,
  );
  const [deadlineInput, setDeadlineInput] = useState(
    toInputValue(task.deadlineAt ?? null, task.deadlineAllDay ?? false),
  );

  function submitDeadline() {
    const nextDeadlineAt = deadlineEnabled
      ? parseInputValue(deadlineInput, deadlineAllDay)
      : null;
    if (deadlineEnabled && nextDeadlineAt === null) {
      return;
    }
    const draft = buildTaskDraftFromTask(payload, task);
    onSaveTask(task.id, {
      ...draft,
      deadlineAt: nextDeadlineAt,
      deadlineAllDay: deadlineEnabled ? deadlineAllDay : false,
    });
    onClose();
  }

  return (
    <ChoiceDialog
      title={task.deadlineAt ? "Change deadline" : "Add deadline"}
      description={`Update the deadline for "${task.title}".`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitDeadline}
            disabled={
              deadlineEnabled &&
              parseInputValue(deadlineInput, deadlineAllDay) === null
            }
            className="rounded-full bg-[#EE6A3C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save deadline
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <label className="flex items-center justify-between gap-4 rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3">
          <span className="text-sm font-semibold text-[#1E2D2F]">
            Track a separate deadline
          </span>
          <input
            data-dialog-autofocus="true"
            type="checkbox"
            checked={deadlineEnabled}
            onChange={(event) => setDeadlineEnabled(event.target.checked)}
            className="h-5 w-5 accent-[#EE6A3C]"
          />
        </label>
        {deadlineEnabled ? (
          <div className="space-y-3 rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-4">
            <label className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-[#1E2D2F]">
                All day
              </span>
              <input
                type="checkbox"
                checked={deadlineAllDay}
                onChange={(event) => setDeadlineAllDay(event.target.checked)}
                className="h-5 w-5 accent-[#EE6A3C]"
              />
            </label>
            <input
              type={deadlineAllDay ? "date" : "datetime-local"}
              value={deadlineInput}
              onChange={(event) => setDeadlineInput(event.target.value)}
              className="w-full rounded-[14px] border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-2 text-sm text-[#1E2D2F] outline-none focus:border-[#EE6A3C]"
            />
          </div>
        ) : null}
      </div>
    </ChoiceDialog>
  );
}

function TaskRemindersDialog({
  task,
  initialReminders,
  payload,
  onSaveTask,
  onClose,
}: {
  task: Task;
  initialReminders: TaskReminderDraft[];
  payload: SyncPayload;
  onSaveTask: (taskId: string, draft: TaskDraft) => Promise<void> | void;
  onClose: () => void;
}) {
  const [reminderEditors, setReminderEditors] = useState<ReminderEditorDraft[]>(
    () => buildReminderEditors(initialReminders),
  );

  function submitReminders() {
    if (hasIncompleteReminderEditors(reminderEditors)) {
      return;
    }
    if (
      task.dueAt === null &&
      reminderEditors.some((reminder) => reminder.mode === "OFFSET")
    ) {
      return;
    }
    const draft = buildTaskDraftFromTask(payload, task);
    onSaveTask(task.id, {
      ...draft,
      reminders: serializeReminderEditors(reminderEditors),
    });
    onClose();
  }

  return (
    <ChoiceDialog
      title={initialReminders.length ? "Change reminders" : "Add reminders"}
      description={`Update reminders for "${task.title}".`}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submitReminders}
            disabled={
              hasIncompleteReminderEditors(reminderEditors) ||
              (task.dueAt === null &&
                reminderEditors.some((reminder) => reminder.mode === "OFFSET"))
            }
            className="rounded-full bg-[#EE6A3C] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#d75e33] disabled:cursor-not-allowed disabled:opacity-60"
          >
            Save reminders
          </button>
        </div>
      }
    >
      <ReminderListEditor
        reminders={reminderEditors}
        dueAt={task.dueAt}
        onChange={setReminderEditors}
      />
    </ChoiceDialog>
  );
}

function KeyboardShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <ChoiceDialog
      title="Keyboard shortcuts"
      description="These are the shortcuts currently supported in the web app."
      onClose={onClose}
    >
      <div className="space-y-5">
        {shortcutSections.map((section) => (
          <section key={section.title}>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9F7B63]">
              {section.title}
            </p>
            <div className="mt-3 space-y-2">
              {section.items.map((item) => (
                <div
                  key={`${section.title}-${item.keys}`}
                  className="flex items-start justify-between gap-4 rounded-[16px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-3"
                >
                  <span className="text-sm font-semibold text-[#1E2D2F]">
                    {item.keys}
                  </span>
                  <span className="text-sm text-right text-[#6D5C50]">
                    {item.description}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ChoiceDialog>
  );
}

function OnboardingSetupDialog({
  cloudConfigured,
  onSkip,
  onConnectGoogle,
  onStart,
}: {
  cloudConfigured: boolean;
  onSkip: () => void;
  onConnectGoogle: () => void;
  onStart: (presetId: OnboardingPresetId) => Promise<void>;
}) {
  const [selectedPresetId, setSelectedPresetId] =
    useState<OnboardingPresetId>("personal");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedPreset =
    ONBOARDING_PRESETS.find((preset) => preset.id === selectedPresetId) ??
    ONBOARDING_PRESETS[0];

  async function submitStart() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      await onStart(selectedPresetId);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ChoiceDialog
      title="Start with a simple workspace"
      description="Pick one area to manage first. Emberlist will create a sample project, seed a few realistic tasks, and then teach Quick Add in the live app."
      onClose={onSkip}
      dialogClassName="max-w-3xl"
    >
      <div className="space-y-5">
        <div className="grid gap-3 md:grid-cols-3">
          {ONBOARDING_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setSelectedPresetId(preset.id)}
              className={`rounded-[22px] border px-4 py-4 text-left transition ${
                selectedPresetId === preset.id
                  ? "border-[#F3B7A4] bg-[#FFF5F1] shadow-sm"
                  : "border-[#E1D5CA] bg-[var(--app-surface-soft)] hover:bg-[var(--app-surface)]"
              }`}
            >
              <p className="text-base font-semibold text-[#1E2D2F]">
                {preset.label}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#6D5C50]">
                {preset.description}
              </p>
            </button>
          ))}
        </div>

        <div className="rounded-[22px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-5 py-4">
          <p className="text-sm font-semibold text-[#1E2D2F]">
            Starter project: {selectedPreset.projectName}
          </p>
          <p className="mt-2 text-sm leading-6 text-[#6D5C50]">
            You will get four example tasks, including recurring work, and then
            Emberlist will drop you directly into Quick Add so you can try one
            natural-language task yourself.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            data-dialog-autofocus="true"
            onClick={() => void submitStart()}
            disabled={isSubmitting}
            className="rounded-full bg-[#dc4c3e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c84335] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Setting up..." : "Start with this"}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-5 py-2.5 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
          >
            Skip
          </button>
          {cloudConfigured ? (
            <button
              type="button"
              onClick={onConnectGoogle}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-5 py-2.5 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
            >
              Connect Google Drive first
            </button>
          ) : null}
        </div>
      </div>
    </ChoiceDialog>
  );
}

function OnboardingCoachmark({
  step,
  quickAddExample,
  cloudConfigured,
  cloudSession,
  onNext,
  onSkip,
}: {
  step: Exclude<FirstRunOnboardingState["step"], "setup">;
  quickAddExample: string | null;
  cloudConfigured: boolean;
  cloudSession: CloudSession | null;
  onNext: () => void;
  onSkip: () => void;
}) {
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const stepConfig = getOnboardingCoachmarkContent(
    step,
    quickAddExample,
    cloudConfigured,
    cloudSession,
  );

  useEffect(() => {
    if (typeof document === "undefined") return undefined;

    const updateRect = () => {
      const target = document.querySelector<HTMLElement>(
        stepConfig.targetSelector,
      );
      setTargetRect(target ? target.getBoundingClientRect() : null);
    };

    updateRect();
    const handleChange = () => window.requestAnimationFrame(updateRect);

    window.addEventListener("resize", handleChange);
    window.addEventListener("scroll", handleChange, true);
    return () => {
      window.removeEventListener("resize", handleChange);
      window.removeEventListener("scroll", handleChange, true);
    };
  }, [stepConfig.targetSelector]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const target = document.querySelector<HTMLElement>(stepConfig.targetSelector);
    target?.scrollIntoView({
      block: "center",
      inline: "nearest",
      behavior: "smooth",
    });
  }, [stepConfig.targetSelector]);

  const cardStyle = useMemo<CSSProperties>(() => {
    if (step === "quick_add") {
      return {
        top: 24,
        right: 24,
        width: Math.min(340, window.innerWidth - 32),
      };
    }

    if (!targetRect) {
      return {
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        width: Math.min(360, window.innerWidth - 32),
      };
    }

    const cardWidth = Math.min(360, window.innerWidth - 32);
    const canPlaceRight =
      window.innerWidth - targetRect.right >= cardWidth + 24;
    const canPlaceLeft = targetRect.left >= cardWidth + 24;

    if (canPlaceRight || canPlaceLeft) {
      return {
        top: Math.min(
          Math.max(16, targetRect.top),
          window.innerHeight - 240,
        ),
        left: canPlaceRight
          ? targetRect.right + 16
          : Math.max(16, targetRect.left - cardWidth - 16),
        width: cardWidth,
      };
    }

    const placeBelow = window.innerHeight - targetRect.bottom >= 220;
    const top = placeBelow
      ? targetRect.bottom + 16
      : Math.max(16, targetRect.top - 212);
    const left = Math.min(
      Math.max(16, targetRect.left),
      window.innerWidth - cardWidth - 16,
    );

    return {
      top,
      left,
      width: cardWidth,
    };
  }, [step, targetRect]);

  return (
    <div className="pointer-events-none fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[#241b17]/14" />
      {targetRect ? (
        <div
          className="absolute rounded-[24px] border-2 border-[#EE6A3C] bg-transparent shadow-[0_0_0_9999px_rgba(36,27,23,0.14)]"
          style={{
            top: Math.max(8, targetRect.top - 8),
            left: Math.max(8, targetRect.left - 8),
            width: Math.min(window.innerWidth - 16, targetRect.width + 16),
            height: Math.min(window.innerHeight - 16, targetRect.height + 16),
          }}
        />
      ) : null}

      <div
        className="pointer-events-auto absolute rounded-[24px] border border-[#E1D5CA] bg-[var(--app-surface)] p-5 shadow-[0_20px_60px_rgba(36,27,23,0.18)]"
        style={cardStyle}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#B1775C]">
          Step {stepConfig.stepIndex} of {stepConfig.totalSteps}
        </p>
        <h3 className="mt-2 text-lg font-semibold text-[#1E2D2F]">
          {stepConfig.title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-[#6D5C50]">
          {stepConfig.description}
        </p>
        {stepConfig.example ? (
          <code className="mt-3 block rounded-[16px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-3 py-2 text-sm text-[#1E2D2F]">
            {stepConfig.example}
          </code>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          {stepConfig.primaryLabel ? (
            <button
              type="button"
              onClick={onNext}
              className="rounded-full bg-[#dc4c3e] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#c84335]"
            >
              {stepConfig.primaryLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onSkip}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
          >
            {step === "quick_add" ? "Skip practice" : "Skip"}
          </button>
        </div>
      </div>
    </div>
  );
}

function CloudConnectDialog({
  lastSyncError,
  onClose,
  onConnect,
}: {
  lastSyncError: string | null;
  onClose: () => void;
  onConnect: () => void;
}) {
  const needsDrivePermissionRetry = Boolean(
    lastSyncError?.includes("Drive access was not granted"),
  );

  return (
    <ChoiceDialog
      title="Connect Google Drive"
      description="Emberlist will open Google sign-in in a new window and ask for access to its own app-specific Drive data."
      onClose={onClose}
      dialogClassName="max-w-2xl"
    >
      <div className="space-y-4">
        {needsDrivePermissionRetry ? (
          <div className="rounded-[22px] border border-[#F1C7B5] bg-[#FFF1EB] px-5 py-4 text-sm leading-6 text-[#A24628]">
            The last attempt finished sign-in, but Google Drive access was not
            granted. On the final Google screen, check the box for Drive
            configuration data before continuing.
          </div>
        ) : null}
        <div className="rounded-[22px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-5 py-4">
          <p className="text-sm font-semibold text-[#1E2D2F]">What to expect</p>
          <ol className="mt-3 space-y-2 text-sm leading-6 text-[#6D5C50]">
            <li>1. Google will ask you to pick an account.</li>
            <li>
              2. Google will show a permissions review before returning you to
              Emberlist.
            </li>
            <li>
              3. On the last Google screen, check the Drive permission box
              before you press Continue.
            </li>
          </ol>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={onConnect}
            data-dialog-autofocus="true"
            className="rounded-full bg-[#dc4c3e] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#c84335]"
          >
            Continue to Google
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-5 py-2.5 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
          >
            Not now
          </button>
        </div>
      </div>
    </ChoiceDialog>
  );
}

function ProjectSwitcherDialog({
  payload,
  onClose,
  onOpenProject,
  onCreateProject,
}: {
  payload: SyncPayload;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
  onCreateProject: (name: string) => Promise<string | null>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const projects = useMemo(() => getActiveProjects(payload), [payload]);
  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return projects;
    return projects.filter((project) =>
      project.name.toLowerCase().includes(normalizedQuery),
    );
  }, [projects, query]);
  const canCreate =
    query.trim().length > 0 &&
    !projects.some(
      (project) =>
        project.name.localeCompare(query.trim(), undefined, {
          sensitivity: "base",
        }) === 0,
    );
  const boundedActiveIndex = filteredProjects.length
    ? Math.min(activeIndex, filteredProjects.length - 1)
    : 0;
  const highlightedProject = filteredProjects[boundedActiveIndex] ?? null;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const lowerKey = event.key.toLowerCase();
      if (
        (event.metaKey || event.ctrlKey || event.altKey) &&
        event.key !== "Enter"
      )
        return;

      if (event.key === "ArrowDown" || lowerKey === "j") {
        if (!filteredProjects.length) return;
        event.preventDefault();
        setActiveIndex((current) =>
          Math.min(current + 1, filteredProjects.length - 1),
        );
        return;
      }

      if (event.key === "ArrowUp" || lowerKey === "k") {
        if (!filteredProjects.length) return;
        event.preventDefault();
        setActiveIndex((current) => Math.max(current - 1, 0));
        return;
      }

      if (event.key !== "Enter" || isSubmitting) return;
      event.preventDefault();

      const exactMatch = projects.find(
        (project) =>
          project.name.localeCompare(query.trim(), undefined, {
            sensitivity: "base",
          }) === 0,
      );
      if (exactMatch) {
        onOpenProject(exactMatch.id);
        onClose();
        return;
      }

      if (highlightedProject) {
        onOpenProject(highlightedProject.id);
        onClose();
        return;
      }

      if (!canCreate) return;
      setIsSubmitting(true);
      void onCreateProject(query.trim())
        .then((projectId) => {
          if (projectId) {
            onOpenProject(projectId);
          }
          onClose();
        })
        .finally(() => setIsSubmitting(false));
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    canCreate,
    filteredProjects,
    highlightedProject,
    isSubmitting,
    onClose,
    onCreateProject,
    onOpenProject,
    projects,
    query,
  ]);

  return (
    <ChoiceDialog
      title="Open project"
      description="Type to filter projects, use arrow keys or J/K to move, then press Enter to open. If nothing matches, pressing Enter creates a new project."
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Project name">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="Search or create a project"
            className="w-full rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
          />
        </Field>
        <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
          {filteredProjects.map((project, index) => (
            <button
              key={project.id}
              type="button"
              onClick={() => {
                onOpenProject(project.id);
                onClose();
              }}
              className={`flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left text-sm transition ${
                index === boundedActiveIndex
                  ? "border-[#EE6A3C] bg-[#FFF3EE] text-[#1E2D2F]"
                  : "border-[#E7DDD4] bg-[var(--app-surface-soft)] text-[#1E2D2F] hover:bg-[var(--app-surface)]"
              }`}
            >
              <span className="font-semibold">{project.name}</span>
              <span className="text-xs text-[#6D5C50]">
                {getProjectTasks(payload, project.id).length} active
              </span>
            </button>
          ))}
          {!filteredProjects.length ? (
            <div className="rounded-[18px] border border-dashed border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-5 text-sm text-[#6D5C50]">
              {canCreate
                ? `Press Enter to create "${query.trim()}".`
                : "No matching projects."}
            </div>
          ) : null}
        </div>
      </div>
    </ChoiceDialog>
  );
}

function HeroCard({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title?: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <section className="px-1 pb-2 pt-1">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#9d6b54]">
            {eyebrow}
          </p>
          {title ? (
            <h2 className="mt-2 text-[32px] font-semibold text-[#202020]">
              {title}
            </h2>
          ) : null}
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[#7a7168]">
            {description}
          </p>
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

function RecurrenceField({
  label,
  value,
  onChange,
  description,
  autoLabel,
  onReset,
}: {
  label: string;
  value: string | null;
  onChange: (rule: string | null) => void;
  description?: string;
  autoLabel?: string;
  onReset?: () => void;
}) {
  const preset = getRecurrencePreset(value);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-[#1E2D2F]">{label}</span>
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
          >
            Use parser
          </button>
        ) : null}
      </div>
      {autoLabel ? <p className="text-xs text-[#8A8076]">{autoLabel}</p> : null}
      <select
        value={preset}
        onChange={(event) => {
          const nextPreset = event.target.value as RecurrencePreset;
          if (nextPreset === "NONE") {
            onChange(null);
            return;
          }
          if (nextPreset === "CUSTOM") {
            onChange(preset === "CUSTOM" && value ? value : "FREQ=DAILY");
            return;
          }
          onChange(getRuleForRecurrencePreset(nextPreset));
        }}
        className="w-full rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
      >
        <option value="NONE">Does not repeat</option>
        <option value="DAILY">Every day</option>
        <option value="WEEKDAYS">Weekdays</option>
        <option value="WEEKLY">Every week</option>
        <option value="MONTHLY">Every month</option>
        <option value="YEARLY">Every year</option>
        <option value="CUSTOM">Custom rule</option>
      </select>
      {preset === "CUSTOM" ? (
        <input
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value.trim() || null)}
          placeholder="FREQ=WEEKLY;INTERVAL=2"
          className="w-full rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
        />
      ) : null}
      {description ? (
        <p className="text-xs text-[#8A8076]">{description}</p>
      ) : null}
    </div>
  );
}

function ReminderListEditor({
  reminders,
  dueAt,
  onChange,
  autoLabel,
  onReset,
}: {
  reminders: ReminderEditorDraft[];
  dueAt: number | null;
  onChange: (nextEditors: ReminderEditorDraft[]) => void;
  autoLabel?: string;
  onReset?: () => void;
}) {
  const hasOffsetWithoutDue =
    dueAt === null && reminders.some((reminder) => reminder.mode === "OFFSET");

  return (
    <div className="space-y-3">
      {autoLabel || onReset ? (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-[#8A8076]">
            {autoLabel ?? "Using parser reminders."}
          </p>
          {onReset ? (
            <button
              type="button"
              onClick={onReset}
              className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface)] px-3 py-1.5 text-xs font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface-soft)]"
            >
              Use parser
            </button>
          ) : null}
        </div>
      ) : null}

      {reminders.length ? (
        <div className="space-y-3">
          {reminders.map((reminder) => (
            <div
              key={reminder.id}
              className="rounded-[20px] border border-[#E1D5CA] bg-[var(--app-surface)] px-4 py-4"
            >
              <div className="grid gap-3 md:grid-cols-[minmax(0,0.55fr)_minmax(0,0.45fr)_auto] md:items-end">
                <Field label="Reminder type">
                  <div className="flex flex-wrap gap-2">
                    {[
                      {
                        mode: "ABSOLUTE" as const,
                        label: "At a specific time",
                      },
                      { mode: "OFFSET" as const, label: "Before the due date" },
                    ].map((option) => (
                      <button
                        key={option.mode}
                        type="button"
                        onClick={() => {
                          const nextMode = option.mode;
                          onChange(
                            reminders.map((item) =>
                              item.id === reminder.id
                                ? {
                                    ...item,
                                    mode: nextMode,
                                    absoluteValue:
                                      nextMode === "ABSOLUTE" &&
                                      !item.absoluteValue
                                        ? createReminderEditor(null)
                                            .absoluteValue
                                        : item.absoluteValue,
                                    offsetMinutes:
                                      nextMode === "OFFSET"
                                        ? item.offsetMinutes || 30
                                        : item.offsetMinutes,
                                  }
                                : item,
                            ),
                          );
                        }}
                        className={`rounded-full border px-3 py-2 text-sm font-medium transition ${
                          reminder.mode === option.mode
                            ? "border-[#F3B7A4] bg-[#FFF5F1] text-[#B64B28]"
                            : "border-[#E1D5CA] bg-[var(--app-surface-soft)] text-[#1E2D2F] hover:bg-[var(--app-surface)]"
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </Field>

                {reminder.mode === "ABSOLUTE" ? (
                  <Field label="When">
                    <input
                      type="datetime-local"
                      value={reminder.absoluteValue}
                      onChange={(event) => {
                        onChange(
                          reminders.map((item) =>
                            item.id === reminder.id
                              ? { ...item, absoluteValue: event.target.value }
                              : item,
                          ),
                        );
                      }}
                      className="w-full rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
                    />
                  </Field>
                ) : (
                  <Field label="Minutes before due">
                    <input
                      type="number"
                      min={1}
                      step={5}
                      value={reminder.offsetMinutes}
                      onChange={(event) => {
                        onChange(
                          reminders.map((item) =>
                            item.id === reminder.id
                              ? {
                                  ...item,
                                  offsetMinutes:
                                    Number.parseInt(
                                      event.target.value || "0",
                                      10,
                                    ) || 0,
                                }
                              : item,
                          ),
                        );
                      }}
                      className="w-full rounded-[18px] border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-3 text-sm outline-none transition focus:border-[#EE6A3C]"
                    />
                  </Field>
                )}

                <button
                  type="button"
                  onClick={() =>
                    onChange(
                      reminders.filter((item) => item.id !== reminder.id),
                    )
                  }
                  className="rounded-full border border-[#F3B7A4] bg-[#FFF5F1] px-4 py-3 text-sm font-semibold text-[#B64B28] transition hover:bg-[#FDE9E1]"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[#D9CABC] bg-[var(--app-surface-soft)] px-4 py-4 text-sm text-[#6D5C50]">
          No reminders yet.
        </div>
      )}

      {hasOffsetWithoutDue ? (
        <p className="rounded-[18px] border border-[#F1C7B5] bg-[#FFF1EB] px-4 py-3 text-sm text-[#A24628]">
          Relative reminders need a due date before they can be saved.
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => onChange([...reminders, createReminderEditor(dueAt)])}
        className="rounded-full border border-[#E1D5CA] bg-[var(--app-surface-soft)] px-4 py-2.5 text-sm font-semibold text-[#1E2D2F] transition hover:bg-[var(--app-surface)]"
      >
        Add reminder
      </button>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[28px] border border-dashed border-[#D9CABC] bg-[var(--app-surface)] px-6 py-10 text-center shadow-sm">
      <p className="text-lg font-semibold text-[#1E2D2F]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[#6D5C50]">{description}</p>
    </div>
  );
}

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--app-shell-bg)] px-6">
      <div className="rounded-[28px] border border-[#E1D5CA] bg-[var(--app-surface)] px-6 py-5 text-sm font-medium text-[#6D5C50] shadow-sm">
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
  collapsed = false,
}: {
  to: string;
  icon: ComponentType<{
    size?: number;
    className?: string;
    style?: CSSProperties;
  }>;
  label: string;
  compact?: boolean;
  count?: number;
  tint?: string;
  collapsed?: boolean;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `flex items-center rounded-[10px] px-3 py-2 text-sm transition ${
          isActive
            ? "bg-[#fff1ed] text-[#dc4c3e]"
            : "text-[#4f4a45] hover:bg-[#f7f3ef]"
        } ${compact ? "py-1.5" : ""} ${collapsed ? "justify-center" : "gap-3"}`
      }
      title={collapsed ? label : undefined}
    >
      <Icon
        size={16}
        className={tint ? "" : undefined}
        style={tint ? { color: tint } : undefined}
      />
      <span className={`truncate ${collapsed ? "hidden" : ""}`}>{label}</span>
      {typeof count === "number" && !collapsed ? (
        <span className="ml-auto text-xs text-[#9a928a]">{count}</span>
      ) : null}
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
        `flex flex-col items-center justify-center gap-1 rounded-[18px] px-2 py-2 text-[11px] font-semibold transition ${
          isActive ? "bg-[var(--app-surface)] text-[#EE6A3C]" : "text-[#7A675A]"
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
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-[#E7DDD4] bg-[var(--app-surface-soft)] px-4 py-3">
      <span className="text-sm font-medium text-[#6D5C50]">{label}</span>
      <span className="text-sm font-semibold text-[#1E2D2F]">{value}</span>
    </div>
  );
}

function StatusPill({ label, tone }: { label: string; tone: CloudStatusTone }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${statusPillClasses(tone)}`}
    >
      {label}
    </span>
  );
}

function bannerClasses(tone: Banner["tone"]): string {
  switch (tone) {
    case "success":
      return "border border-[#CDE3D4] bg-[#F1F8F3] text-[#24553A]";
    case "error":
      return "border border-[#F1C7B5] bg-[#FFF1EB] text-[#A24628]";
    case "info":
    default:
      return "border border-[#D6E4EA] bg-[#F1F7F9] text-[#315566]";
  }
}

function priorityCircleClasses(priority: Priority): string {
  switch (priority) {
    case "P1":
      return "border-[#d1453b] text-[#d1453b] hover:border-[#d1453b]";
    case "P2":
      return "border-[#d97706] text-[#d97706] hover:border-[#d97706]";
    case "P3":
      return "border-[#2563eb] text-[#2563eb] hover:border-[#2563eb]";
    case "P4":
    default:
      return "border-[#c9c3bd] text-[#c9c3bd] hover:border-[#a79f97]";
  }
}

function statusPillClasses(tone: CloudStatusTone): string {
  switch (tone) {
    case "ready":
      return "bg-[#F1F8F3] text-[#24553A]";
    case "warning":
      return "bg-[#FFF1EB] text-[#A24628]";
    case "idle":
      return "bg-[#F1F7F9] text-[#315566]";
    case "muted":
    default:
      return "bg-[#EFE6DD] text-[#6D5C50]";
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
      label: "Unavailable",
      detail:
        "This deployment is missing its Google client ID, so cloud sync is disabled until the site is redeployed with VITE_GOOGLE_CLIENT_ID.",
      tone: "warning",
    };
  }

  if (isSyncing) {
    return {
      label: "Syncing",
      detail:
        "Emberlist is merging your local workspace with the latest Google Drive appData snapshot right now.",
      tone: "idle",
    };
  }

  if (lastSyncError && hasPendingLocalChanges) {
    return {
      label: "Attention",
      detail:
        "The last cloud sync attempt failed and this browser still has local changes waiting to upload.",
      tone: "warning",
    };
  }

  if (!isOnline && hasPendingLocalChanges) {
    return {
      label: "Offline",
      detail:
        "This browser has local changes waiting to sync. Emberlist will retry when the connection comes back.",
      tone: "warning",
    };
  }

  if (hasPendingLocalChanges) {
    return {
      label: "Pending",
      detail:
        "Local changes are saved in this browser and queued for upload to Google Drive.",
      tone: "idle",
    };
  }

  if (lastSyncError) {
    return {
      label: "Attention",
      detail:
        "The last cloud sync attempt failed. Review the last error below and retry after fixing the issue.",
      tone: "warning",
    };
  }

  if (cloudSession?.email) {
    return {
      label: "Connected",
      detail: lastCloudSyncAt
        ? `Signed in as ${cloudSession.email}. Last successful sync was ${formatDateTime(lastCloudSyncAt)}.`
        : `Signed in as ${cloudSession.email}. Run Sync now whenever you want to push or pull changes.`,
      tone: "ready",
    };
  }

  if (lastCloudSyncAt) {
    return {
      label: "Ready",
      detail: `Cloud sync is configured. The last successful sync was ${formatDateTime(lastCloudSyncAt)}. Google may ask you to sign in again in this browser.`,
      tone: "idle",
    };
  }

  return {
    label: "Ready",
    detail:
      "Cloud sync is configured. The first sync in this browser session will prompt for Google sign-in if needed.",
    tone: "muted",
  };
}

function useTodayStartMs(): number {
  const [todayStartMs, setTodayStartMs] = useState(() =>
    startOfDay(Date.now()).getTime(),
  );

  useEffect(() => {
    const now = Date.now();
    const nextMidnightMs = startOfDay(addDays(now, 1)).getTime();
    const timer = window.setTimeout(
      () => {
        setTodayStartMs(startOfDay(Date.now()).getTime());
      },
      Math.max(nextMidnightMs - now + 1000, 1000),
    );
    return () => window.clearTimeout(timer);
  }, [todayStartMs]);

  return todayStartMs;
}

function getTaskLocationLabel(payload: SyncPayload, task: Task): string {
  if (!task.projectId) return "Inbox";
  const project = payload.projects.find(
    (projectItem) =>
      projectItem.id === task.projectId && !projectItem.deletedAt,
  );
  const section = task.sectionId
    ? payload.sections.find(
        (sectionItem) =>
          sectionItem.id === task.sectionId && !sectionItem.deletedAt,
      )
    : null;
  if (!project) return "Inbox";
  return section ? `${project.name} / ${section.name}` : project.name;
}

function getTaskWorkspacePath(
  task: Task,
  todayStartMs: number,
): string {
  if (task.projectId) {
    return `/project/${task.projectId}`;
  }
  if (task.dueAt === null) {
    return "/inbox";
  }
  const tomorrowStart = addDays(startOfDay(todayStartMs), 1).getTime();
  return task.dueAt < tomorrowStart ? "/today" : "/upcoming";
}

function getQuickAddContext(
  pathname: string,
  payload: SyncPayload,
): QuickAddContext {
  if (pathname.startsWith("/today")) {
    return {
      defaultProjectId: null,
      defaultSectionId: null,
      defaultDueToday: true,
      relativeAnchorTaskId: null,
      relativePosition: null,
      editTaskId: null,
    };
  }

  if (pathname.startsWith("/project/")) {
    const projectId = pathname.split("/")[2];
    const project = getProjectById(payload, projectId);
    return {
      defaultProjectId: project?.id ?? null,
      defaultSectionId: null,
      defaultDueToday: false,
      relativeAnchorTaskId: null,
      relativePosition: null,
      editTaskId: null,
    };
  }

  if (pathname.startsWith("/inbox")) {
    return {
      defaultProjectId: null,
      defaultSectionId: null,
      defaultDueToday: false,
      relativeAnchorTaskId: null,
      relativePosition: null,
      editTaskId: null,
    };
  }

  return {
    defaultProjectId: null,
    defaultSectionId: null,
    defaultDueToday: false,
    relativeAnchorTaskId: null,
    relativePosition: null,
    editTaskId: null,
  };
}

function renderQuickAddMetadata(
  payload: SyncPayload,
  draft: TaskDraft,
): string[] {
  const items: string[] = [];
  const projectLabel = draft.projectId
    ? (getProjectById(payload, draft.projectId)?.name ?? "Inbox")
    : (draft.projectName ?? "Inbox");
  if (draft.sectionId) {
    const section = payload.sections.find(
      (item) => item.id === draft.sectionId && !item.deletedAt,
    );
    items.push(`#${projectLabel}/${section?.name ?? "Section"}`);
  } else if (draft.sectionName) {
    items.push(`#${projectLabel}/${draft.sectionName}`);
  } else {
    items.push(`#${projectLabel}`);
  }
  items.push(draft.priority);
  if (draft.dueAt !== null) {
    items.push(formatTaskDate(draft.dueAt, draft.allDay));
  } else {
    items.push("No due date");
  }
  if (draft.deadlineAt !== null) {
    items.push(
      `Deadline ${formatTaskDate(draft.deadlineAt, draft.deadlineAllDay)}`,
    );
  }
  if (draft.recurringRule) {
    items.push(renderRecurrenceLabel(draft.recurringRule));
  }
  if (draft.reminders.length) {
    items.push(renderReminderLabel(draft.reminders));
  }
  return items;
}

function describeQuickAddProject(
  payload: SyncPayload,
  draft: TaskDraft,
): string {
  if (draft.projectId) {
    return getProjectById(payload, draft.projectId)?.name ?? "Current project";
  }
  if (draft.projectName) {
    return `Create "${draft.projectName}"`;
  }
  return "Inbox";
}

function describeQuickAddLocation(
  payload: SyncPayload,
  draft: TaskDraft,
): string {
  const projectLabel = describeQuickAddProject(payload, draft);
  const sectionLabel =
    draft.sectionId || draft.sectionName
      ? describeQuickAddSection(payload, draft)
      : null;
  return sectionLabel ? `${projectLabel} / ${sectionLabel}` : projectLabel;
}

function describeQuickAddSection(
  payload: SyncPayload,
  draft: TaskDraft,
): string {
  if (draft.sectionId) {
    return (
      payload.sections.find(
        (section) => section.id === draft.sectionId && !section.deletedAt,
      )?.name ?? "Current section"
    );
  }
  if (draft.sectionName) {
    return `Create "${draft.sectionName}"`;
  }
  return "No section";
}

function describeQuickAddContext(
  payload: SyncPayload,
  context: QuickAddContext,
): string {
  const labels: string[] = [];
  if (context.defaultDueToday) {
    labels.push("Defaults to Today");
  }
  if (context.defaultProjectId) {
    const projectName =
      getProjectById(payload, context.defaultProjectId)?.name ?? "current";
    const sectionName = context.defaultSectionId
      ? payload.sections.find(
          (section) =>
            section.id === context.defaultSectionId && !section.deletedAt,
        )?.name
      : null;
    labels.push(
      sectionName
        ? `Project ${projectName} / ${sectionName}`
        : `Project ${projectName}`,
    );
  }
  return labels.join(" · ");
}

function renderReminderLabel(reminders: TaskReminderDraft[]): string {
  if (reminders.length === 1) {
    const [reminder] = reminders;
    return reminder.kind === "ABSOLUTE"
      ? `Reminder ${formatDateTime(reminder.timeAt)}`
      : `Reminder ${reminder.offsetMinutes}m before`;
  }
  return `${reminders.length} reminders`;
}

function renderReminderSourceLabel(reminders: TaskReminderDraft[]): string {
  return `Parser / context: ${reminders.length ? renderReminderLabel(reminders) : "No reminders"}`;
}

function buildTaskDraftFromTask(payload: SyncPayload, task: Task): TaskDraft {
  return {
    title: task.title,
    description: task.description,
    projectId: task.projectId,
    projectName: null,
    sectionId: task.sectionId,
    sectionName: null,
    priority: task.priority,
    dueAt: task.dueAt ?? null,
    allDay: task.allDay,
    deadlineAt: task.deadlineAt ?? null,
    deadlineAllDay: task.deadlineAllDay ?? false,
    recurringRule: task.recurringRule ?? null,
    deadlineRecurringRule: task.deadlineRecurringRule ?? null,
    parentTaskId: task.parentTaskId,
    reminders: getTaskReminderDrafts(payload, task.id),
  };
}

function serializeTaskToQuickAddInput(
  payload: SyncPayload,
  task: Task,
  reminders: TaskReminderDraft[],
): string {
  const parts: string[] = [task.title];
  if (task.priority !== "P4") {
    parts.push(task.priority.toLowerCase());
  }
  if (task.dueAt != null) {
    parts.push(formatQuickAddDateToken(task.dueAt, task.allDay));
  }
  const recurrencePhrase = recurrenceRuleToQuickAddPhrase(task.recurringRule);
  if (recurrencePhrase) {
    parts.push(recurrencePhrase);
  }
  if (task.deadlineAt != null) {
    parts.push(`by ${formatQuickAddDateToken(task.deadlineAt, task.deadlineAllDay ?? false)}`);
  }
  const deadlineRecurrencePhrase = recurrenceRuleToQuickAddPhrase(
    task.deadlineRecurringRule,
  );
  if (deadlineRecurrencePhrase) {
    parts.push(`deadline ${deadlineRecurrencePhrase}`);
  }
  if (reminders.length <= 1) {
    const reminderPhrase = reminderToQuickAddPhrase(reminders[0] ?? null);
    if (reminderPhrase) {
      parts.push(reminderPhrase);
    }
  }
  const project = task.projectId ? getProjectById(payload, task.projectId) : null;
  const section =
    task.sectionId && task.projectId
      ? getProjectSections(payload, task.projectId).find(
          (candidate) => candidate.id === task.sectionId,
        ) ?? null
      : null;
  if (project) {
    parts.push(
      `#${project.name}${section ? `/${section.name}` : ""}`,
    );
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function formatQuickAddDateToken(timestamp: number, allDay: boolean): string {
  const dateLabel = format(timestamp, "MMM d");
  return allDay ? dateLabel : `${dateLabel} ${formatClock(timestamp)}`;
}

function reminderToQuickAddPhrase(
  reminder: TaskReminderDraft | null,
): string | null {
  if (!reminder) return null;
  if (reminder.kind === "ABSOLUTE") {
    return `remind me at ${format(reminder.timeAt, "M/d")} ${formatClock(reminder.timeAt)}`;
  }
  return `remind me ${reminder.offsetMinutes}m before`;
}

function recurrenceRuleToQuickAddPhrase(
  rule: string | null | undefined,
): string | null {
  if (!rule) return null;
  if (rule === "FREQ=DAILY") return "every day";
  if (rule === "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR") return "every weekday";
  if (rule === "FREQ=WEEKLY") return "every week";
  if (rule === "FREQ=MONTHLY") return "every month";
  if (rule === "FREQ=YEARLY") return "every year";
  return null;
}

function renderRecurrenceLabel(rule: string): string {
  const frequency = /FREQ=([A-Z]+)/.exec(rule)?.[1] ?? "CUSTOM";
  const interval = Number.parseInt(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? "1", 10);
  const byDay = /BYDAY=([A-Z,]+)/.exec(rule)?.[1];
  const byMonthDay = /BYMONTHDAY=(\d+)/.exec(rule)?.[1];

  if (byDay) {
    const days = byDay.split(",").map(
      (token) =>
        ({
          MO: "Mon",
          TU: "Tue",
          WE: "Wed",
          TH: "Thu",
          FR: "Fri",
          SA: "Sat",
          SU: "Sun",
        })[token] ?? token,
    );
    return interval === 2
      ? `Every other ${days.join(", ")}`
      : `Every ${days.join(", ")}`;
  }

  if (frequency === "MONTHLY" && byMonthDay) {
    return `Every month on ${byMonthDay}`;
  }

  const label =
    frequency === "DAILY"
      ? "day"
      : frequency === "WEEKLY"
        ? "week"
        : frequency === "MONTHLY"
          ? "month"
          : frequency === "YEARLY"
            ? "year"
            : "custom";
  return interval <= 1 ? `Every ${label}` : `Every ${interval} ${label}s`;
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const input = target.closest(
    'input, textarea, select, [contenteditable="true"]',
  );
  return input !== null;
}

function hasOpenOverlayDialog(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('[data-overlay-dialog="true"]') !== null;
}

function hasFocusedTaskRow(): boolean {
  if (typeof document === "undefined") return false;
  const activeElement = document.activeElement;
  return (
    activeElement instanceof HTMLElement &&
    activeElement.closest('[data-task-row="true"]') !== null
  );
}

function isTaskSelectionModeActive(): boolean {
  if (typeof document === "undefined") return false;
  return document.querySelector('[data-task-selection-mode="true"]') !== null;
}

function focusEdgeTaskRow(edge: "start" | "end") {
  if (typeof document === "undefined") return;
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('[data-task-row="true"]'),
  );
  const target = edge === "start" ? rows[0] : rows[rows.length - 1];
  target?.focus();
}

function focusTaskRow(taskId: string) {
  if (typeof document === "undefined") return;
  const row = document.querySelector<HTMLElement>(
    `[data-task-row="true"][data-task-id="${taskId}"]`,
  );
  row?.focus();
}

function getAdjacentTaskRowId(
  taskId: string,
  direction: -1 | 1,
): string | null {
  if (typeof document === "undefined") return null;
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('[data-task-row="true"]'),
  );
  const index = rows.findIndex((row) => row.dataset.taskId === taskId);
  if (index === -1) return null;
  const nextRow = rows[index + direction];
  return nextRow?.dataset.taskId ?? null;
}

function focusAdjacentTaskRow(taskId: string, direction: -1 | 1) {
  if (typeof document === "undefined") return;
  const rows = Array.from(
    document.querySelectorAll<HTMLElement>('[data-task-row="true"]'),
  );
  const index = rows.findIndex((row) => row.dataset.taskId === taskId);
  if (index === -1) return;
  const nextRow = rows[index + direction];
  nextRow?.focus();
}

function getWorkspaceIdentity(cloudSession: CloudSession | null): {
  label: string;
  initial: string;
} {
  const label =
    cloudSession?.name?.trim() || cloudSession?.email?.trim() || "Emberlist";
  const initial = label.charAt(0).toUpperCase() || "E";
  return { label, initial };
}

function getRouteTitle(pathname: string, payload: SyncPayload): string {
  if (pathname === "/") return "Emberlist";
  if (pathname === "/privacy") return "Privacy Policy";
  if (pathname === "/terms") return "Terms of Service";
  if (pathname.startsWith("/search/no-due")) return "Tasks without due dates";
  if (pathname.startsWith("/today")) return "Today";
  if (pathname.startsWith("/upcoming")) return "Upcoming";
  if (pathname.startsWith("/search")) return "Search";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/inbox")) return "Inbox";
  if (pathname.startsWith("/project/")) {
    const projectId = pathname.split("/")[2];
    return getProjectById(payload, projectId)?.name ?? "Project";
  }
  if (pathname.startsWith("/task/") && pathname.endsWith("/activity")) {
    const taskId = pathname.split("/")[2];
    const task = getTaskById(payload, taskId);
    return task ? `${task.title} activity` : "Task activity";
  }
  if (pathname.startsWith("/task/")) {
    const taskId = pathname.split("/")[2];
    return getTaskById(payload, taskId)?.title ?? "Task";
  }
  return "Workspace";
}

function formatTaskDate(timestamp: number, allDay: boolean): string {
  if (isToday(timestamp)) {
    return allDay ? "Today" : `Today · ${formatClock(timestamp)}`;
  }
  if (isTomorrow(timestamp)) {
    return allDay ? "Tomorrow" : `Tomorrow · ${formatClock(timestamp)}`;
  }
  if (isYesterday(timestamp)) {
    return allDay ? "Yesterday" : `Yesterday · ${formatClock(timestamp)}`;
  }
  return allDay
    ? format(timestamp, "MMM d")
    : `${format(timestamp, "MMM d")} · ${formatClock(timestamp)}`;
  if (isToday(timestamp)) {
    return allDay ? "Today" : `Today · ${format(timestamp, "p")}`;
  }
  if (isTomorrow(timestamp)) {
    return allDay ? "Tomorrow" : `Tomorrow · ${format(timestamp, "p")}`;
  }
  if (isYesterday(timestamp)) {
    return allDay ? "Yesterday" : `Yesterday · ${format(timestamp, "p")}`;
  }
  return allDay ? format(timestamp, "MMM d") : format(timestamp, "MMM d · p");
}

function formatDateTime(timestamp: number): string {
  return formatDateTimeValue(timestamp);
  return format(timestamp, "MMM d, h:mm a");
}

function toInputValue(timestamp: number | null, allDay: boolean): string {
  if (!timestamp) return "";
  return allDay
    ? format(timestamp, "yyyy-MM-dd")
    : format(timestamp, "yyyy-MM-dd'T'HH:mm");
}

function getWeekendDate(todayStartMs: number): Date {
  const today = startOfDay(todayStartMs);
  const dayOfWeek = today.getDay();
  if (dayOfWeek === 0 || dayOfWeek === 6) return today;
  return addDays(today, 6 - dayOfWeek);
}

function getNextWeekDate(
  todayStartMs: number,
  weekStartsOn: WeekStartsOn,
): Date {
  const currentWeekStart = startOfWeek(todayStartMs, { weekStartsOn });
  return addDays(currentWeekStart, 7);
}

function getPostponeDate(task: Task, todayStartMs: number): number | null {
  return getTaskPostponeDueAt(task, todayStartMs);
}

function parseInputValue(value: string, allDay: boolean): number | null {
  if (!value) return null;
  if (allDay) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return null;
    return startOfDay(new Date(year, month - 1, day)).getTime();
  }
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

function getOnboardingCoachmarkContent(
  step: Exclude<FirstRunOnboardingState["step"], "setup">,
  quickAddExample: string | null,
  cloudConfigured: boolean,
  cloudSession: CloudSession | null,
): {
  stepIndex: number;
  totalSteps: number;
  title: string;
  description: string;
  targetSelector: string;
  primaryLabel: string | null;
  example: string | null;
} {
  const includeSyncStep = cloudConfigured && !cloudSession;
  switch (step) {
    case "project":
      return {
        stepIndex: 1,
        totalSteps: includeSyncStep ? 4 : 3,
        title: "This is your starter project",
        description:
          "Projects hold related tasks and sections. Start here to get oriented before you begin capturing your own work.",
        targetSelector: '[data-onboarding-target="project-task-area"]',
        primaryLabel: "Next",
        example: null,
      };
    case "quick_add":
      return {
        stepIndex: 2,
        totalSteps: includeSyncStep ? 4 : 3,
        title: "Try Quick Add once",
        description:
          "Use plain language here. Dates, priorities, projects, and repeat rules are all understood directly from what you type.",
        targetSelector: '[data-onboarding-target="quick-add-parser"]',
        primaryLabel: null,
        example: quickAddExample,
      };
    case "today":
      return {
        stepIndex: 3,
        totalSteps: includeSyncStep ? 4 : 3,
        title: "This is what needs attention now",
        description:
          "Anything due now or overdue lands here. This is where you will spend most of your time once tasks start moving.",
        targetSelector: '[data-onboarding-target="today-due"]',
        primaryLabel:
          cloudConfigured && !cloudSession ? "Next" : "Finish",
        example: null,
      };
    case "sync":
      return {
        stepIndex: 4,
        totalSteps: 4,
        title: "Connect Google Drive when you want sync",
        description:
          "Emberlist works locally without an account. Connect Google Drive only when you want this workspace available across browsers and devices.",
        targetSelector: '[data-onboarding-target="sidebar-cloud-sync"]',
        primaryLabel: "Connect Google Drive",
        example: null,
      };
  }
}

function readStoredOnboardingState(): FirstRunOnboardingState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(FIRST_RUN_ONBOARDING_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FirstRunOnboardingState> | null;
    if (!parsed || typeof parsed !== "object") return null;
    const validSteps = new Set<FirstRunOnboardingState["step"]>([
      "setup",
      "project",
      "quick_add",
      "today",
      "sync",
    ]);
    const validPresets = new Set<OnboardingPresetId>([
      "personal",
      "school",
      "work",
    ]);
    if (
      !validSteps.has(parsed.step as FirstRunOnboardingState["step"]) ||
      !validPresets.has(parsed.presetId as OnboardingPresetId)
    ) {
      return null;
    }
    return {
      step: parsed.step as FirstRunOnboardingState["step"],
      presetId: parsed.presetId as OnboardingPresetId,
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
      quickAddExample:
        typeof parsed.quickAddExample === "string"
          ? parsed.quickAddExample
          : null,
    };
  } catch {
    return null;
  }
}

function writeStoredOnboardingState(
  state: FirstRunOnboardingState | null,
): void {
  if (typeof window === "undefined") return;
  if (!state) {
    window.localStorage.removeItem(FIRST_RUN_ONBOARDING_STATE_KEY);
    return;
  }
  window.localStorage.setItem(
    FIRST_RUN_ONBOARDING_STATE_KEY,
    JSON.stringify(state),
  );
}

function readStoredBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true" || raw === "1" || raw === JSON.stringify(true);
}

function readStoredWeekStartsOn(
  key: string,
  fallback: WeekStartsOn,
): WeekStartsOn {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === "1") return 1;
  if (raw === "0") return 0;
  return fallback;
}

function readStoredNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function readStoredActivityEntries(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem("emberlist.activityEntries");
    if (!raw) return [];
    const parsed = JSON.parse(raw) as ActivityEntry[];
    return Array.isArray(parsed)
      ? parsed.filter((entry) => typeof entry?.id === "string")
      : [];
  } catch {
    return [];
  }
}

function writeStoredActivityEntries(entries: ActivityEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    "emberlist.activityEntries",
    JSON.stringify(entries),
  );
}

function readStoredCloudSession(): CloudSession | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem("emberlist.cloudSession");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      email?: string | null;
      name?: string | null;
    };
    return {
      email: typeof parsed.email === "string" ? parsed.email : null,
      name: typeof parsed.name === "string" ? parsed.name : null,
    };
  } catch {
    return null;
  }
}

function writeStoredCloudSession(session: CloudSession | null) {
  if (typeof window === "undefined") return;
  if (!session) {
    window.localStorage.removeItem("emberlist.cloudSession");
    return;
  }
  window.localStorage.setItem(
    "emberlist.cloudSession",
    JSON.stringify(session),
  );
}



