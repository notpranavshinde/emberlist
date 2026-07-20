import type { SyncPayload } from "../types/sync";

export const ONBOARDING_VERSION = 2 as const;
export const ONBOARDING_STORAGE_KEY = "emberlist.onboarding.v2";
export const LEGACY_ONBOARDING_DISMISSED_KEY =
  "emberlist.firstRunWelcomeDismissed";
export const LEGACY_ONBOARDING_STATE_KEY =
  "emberlist.firstRunOnboardingState";

export const ONBOARDING_EXAMPLES = [
  { id: "simple", label: "Buy groceries" },
  { id: "scheduled", label: "Call the dentist tomorrow 9am" },
  { id: "recurring", label: "Take vitamins every day 8am" },
] as const;

export type OnboardingExampleId = (typeof ONBOARDING_EXAMPLES)[number]["id"];
export type OnboardingStatus = "active" | "completed" | "dismissed";
export type OnboardingCompletionMethod = "first_task" | "drive_restore";

export type OnboardingState = {
  version: typeof ONBOARDING_VERSION;
  status: OnboardingStatus;
  startedAt: number | null;
  completedAt: number | null;
  completionMethod: OnboardingCompletionMethod | null;
  restorePending: boolean;
};

export function hasLiveTasks(payload: SyncPayload | null): boolean {
  return Boolean(payload?.tasks.some((task) => !task.deletedAt));
}

export function hasLiveWorkspaceContent(payload: SyncPayload | null): boolean {
  if (!payload) return false;
  return (
    payload.tasks.some((task) => !task.deletedAt) ||
    payload.projects.some((project) => !project.deletedAt) ||
    payload.sections.some((section) => !section.deletedAt)
  );
}

export function createActiveOnboardingState(now = Date.now()): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    status: "active",
    startedAt: now,
    completedAt: null,
    completionMethod: null,
    restorePending: false,
  };
}

export function createCompletedOnboardingState(
  method: OnboardingCompletionMethod | null,
  now = Date.now(),
): OnboardingState {
  return {
    version: ONBOARDING_VERSION,
    status: "completed",
    startedAt: null,
    completedAt: now,
    completionMethod: method,
    restorePending: false,
  };
}

export function dismissOnboarding(
  state: OnboardingState,
): OnboardingState {
  return { ...state, status: "dismissed", restorePending: false };
}

export function completeOnboarding(
  state: OnboardingState,
  method: OnboardingCompletionMethod,
  now = Date.now(),
): OnboardingState {
  return {
    ...state,
    status: "completed",
    completedAt: now,
    completionMethod: method,
    restorePending: false,
  };
}

export function setOnboardingRestorePending(
  state: OnboardingState,
  restorePending: boolean,
): OnboardingState {
  return { ...state, restorePending };
}

export function initializeOnboardingState({
  storedState,
  legacyDismissed,
  legacyStatePresent,
  payload,
  now = Date.now(),
}: {
  storedState: unknown;
  legacyDismissed: boolean;
  legacyStatePresent: boolean;
  payload: SyncPayload;
  now?: number;
}): OnboardingState {
  const parsed = parseOnboardingState(storedState);
  if (parsed) return parsed;
  if (legacyDismissed) {
    return {
      ...createCompletedOnboardingState(null, now),
      status: "dismissed",
    };
  }
  if (hasLiveWorkspaceContent(payload)) {
    return createCompletedOnboardingState(null, now);
  }
  if (legacyStatePresent || !hasLiveWorkspaceContent(payload)) {
    return createActiveOnboardingState(now);
  }
  return createCompletedOnboardingState(null, now);
}

export function parseOnboardingState(value: unknown): OnboardingState | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<OnboardingState>;
  if (
    candidate.version !== ONBOARDING_VERSION ||
    !["active", "completed", "dismissed"].includes(candidate.status ?? "") ||
    !isNullableNumber(candidate.startedAt) ||
    !isNullableNumber(candidate.completedAt) ||
    ![null, "first_task", "drive_restore"].includes(
      candidate.completionMethod ?? null,
    ) ||
    typeof candidate.restorePending !== "boolean"
  ) {
    return null;
  }
  return candidate as OnboardingState;
}

export function onboardingElapsedBucket(
  startedAt: number | null,
  now = Date.now(),
): "under_30s" | "30_to_60s" | "1_to_5m" | "over_5m" {
  if (startedAt === null) return "over_5m";
  const elapsed = Math.max(0, now - startedAt);
  if (elapsed < 30_000) return "under_30s";
  if (elapsed < 60_000) return "30_to_60s";
  if (elapsed < 300_000) return "1_to_5m";
  return "over_5m";
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
