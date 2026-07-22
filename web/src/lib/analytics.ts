import type { OnboardingCompletionMethod, OnboardingExampleId } from "./onboarding";
import { getStoredItem, removeStoredItem, setStoredItem } from "./webStorage";

export const ANALYTICS_ENABLED_KEY = "emberlist.analyticsEnabled";
export const ANALYTICS_INSTALL_ID_KEY = "emberlist.analyticsInstallId.v2";
const ANALYTICS_QUEUE_KEY = "emberlist.analyticsQueue.v2";
const LEGACY_QUEUE_KEY = "emberlist.analyticsQueue.v1";
const SESSION_KEY = "emberlist.analyticsSession.v2";
const EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const SESSION_TTL_MS = 30 * 60 * 1_000;
const MAX_QUEUE_SIZE = 20;

export type OnboardingAnalyticsEventName =
  | "onboarding_viewed" | "onboarding_primary_clicked" | "onboarding_example_clicked"
  | "onboarding_skipped" | "onboarding_restore_started" | "onboarding_restore_result" | "onboarding_completed";
export type ProductAnalyticsEventName = OnboardingAnalyticsEventName
  | "app_opened" | "screen_viewed" | "quick_add_opened" | "task_create_result"
  | "task_completed" | "task_reopened" | "task_deleted" | "undo_used"
  | "project_created" | "section_created" | "subtask_created" | "subtask_promoted"
  | "task_moved" | "organize_changed" | "search_used" | "sync_action"
  | "backup_action" | "reminder_action" | "operation_error";

export type AnalyticsProperties = {
  method?: OnboardingCompletionMethod; result?: "success" | "failure" | "error" | "empty" | "cancelled" | "offline" | "denied" | "permanently_denied" | "unavailable";
  exampleKind?: OnboardingExampleId; elapsedBucket?: "under_30s" | "30_to_60s" | "1_to_5m" | "over_5m";
  countBucket?: "1" | "2_to_5" | "6_plus"; resultCountBucket?: "0" | "1" | "2_to_5" | "6_plus";
  origin?: "fab" | "keyboard" | "today" | "onboarding" | "settings" | "task" | "project" | "system" | "unknown";
  action?: "open" | "create" | "complete" | "reopen" | "delete" | "move" | "change" | "sync" | "restore" | "connect" | "disconnect" | "export" | "import" | "schedule" | "request_permission" | "save" | "undo";
  route?: "today" | "upcoming" | "inbox" | "project" | "search" | "calendar" | "settings" | "completed" | "archived" | "unknown";
  errorCategory?: "validation" | "network" | "offline" | "auth" | "permission" | "storage" | "conflict" | "schema" | "configuration" | "unknown";
  permission?: "not_required" | "granted" | "denied" | "permanently_denied";
  scheduled?: boolean; recurring?: boolean; reminder?: boolean; priority?: boolean; subtask?: boolean; bulk?: boolean;
};

export type QueuedOnboardingEvent = QueuedAnalyticsEvent;
export type QueuedAnalyticsEvent = { createdAt: number; payload: {
  schemaVersion: 2; eventId: string; installId: string; occurredAt: string;
  event: ProductAnalyticsEventName; platform: "web"; appVersion: string; properties: AnalyticsProperties;
} };

let flushPromise: Promise<void> | null = null;

export function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return true;
  const raw = getStoredItem(ANALYTICS_ENABLED_KEY);
  return raw === null ? true : raw === "true";
}

export function setAnalyticsEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  setStoredItem(ANALYTICS_ENABLED_KEY, JSON.stringify(enabled));
  if (!enabled) {
    removeStoredItem(ANALYTICS_QUEUE_KEY); removeStoredItem(LEGACY_QUEUE_KEY); removeStoredItem(ANALYTICS_INSTALL_ID_KEY);
    try { window.sessionStorage?.removeItem(SESSION_KEY); } catch { /* unavailable storage */ }
  } else void flushOnboardingAnalytics();
}

export function resetAnalyticsId(): void {
  if (typeof window === "undefined") return;
  removeStoredItem(ANALYTICS_QUEUE_KEY); removeStoredItem(ANALYTICS_INSTALL_ID_KEY);
  try { window.sessionStorage?.removeItem(SESSION_KEY); } catch { /* unavailable storage */ }
}

export function getOrCreateAnalyticsInstallId(): string | null {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return null;
  const existing = getStoredItem(ANALYTICS_INSTALL_ID_KEY);
  if (existing && isUuid(existing)) return existing;
  const next = crypto.randomUUID(); setStoredItem(ANALYTICS_INSTALL_ID_KEY, next); return next;
}

export function trackOnboardingEvent(event: OnboardingAnalyticsEventName, properties: AnalyticsProperties = {}, now = Date.now()): void {
  trackProductEvent(event, properties, now);
}

export function trackProductEvent(event: ProductAnalyticsEventName, properties: AnalyticsProperties = {}, now = Date.now()): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  const installId = getOrCreateAnalyticsInstallId(); if (!installId) return;
  const queue = readAnalyticsQueue(now);
  queue.push({ createdAt: now, payload: {
    schemaVersion: 2, eventId: crypto.randomUUID(), installId, occurredAt: new Date(now).toISOString(),
    event, platform: "web", appVersion: import.meta.env.VITE_APP_VERSION?.trim() || "web", properties,
  } });
  writeAnalyticsQueue(queue.slice(-MAX_QUEUE_SIZE)); void flushOnboardingAnalytics();
}

export function trackAppOpened(now = Date.now()): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  let last = 0;
  try { last = Number(window.sessionStorage?.getItem(SESSION_KEY) || 0); } catch { /* unavailable storage */ }
  if (last > 0 && now - last < SESSION_TTL_MS) return;
  try { window.sessionStorage?.setItem(SESSION_KEY, String(now)); } catch { /* unavailable storage */ }
  trackProductEvent("app_opened", {}, now);
}

export function startOnboardingAnalyticsDelivery(): () => void {
  if (typeof window === "undefined") return () => undefined;
  removeStoredItem(LEGACY_QUEUE_KEY);
  const flush = () => void flushOnboardingAnalytics(); window.addEventListener("online", flush);
  trackAppOpened(); flush();
  return () => window.removeEventListener("online", flush);
}

export async function flushOnboardingAnalytics(): Promise<void> {
  if (typeof window === "undefined" || !isAnalyticsEnabled() || !navigator.onLine) return;
  if (flushPromise) return flushPromise;
  flushPromise = flushAnalyticsQueue().finally(() => { flushPromise = null; }); return flushPromise;
}

async function flushAnalyticsQueue(): Promise<void> {
  const remaining = [...readAnalyticsQueue(Date.now())];
  while (remaining.length && isAnalyticsEnabled()) {
    try {
      const response = await fetch("/api/analytics/events", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(remaining[0].payload), keepalive: true });
      if (!response.ok) break;
      remaining.shift(); writeAnalyticsQueue(remaining);
    } catch { break; }
  }
}

export function readAnalyticsQueue(now = Date.now()): QueuedAnalyticsEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(getStoredItem(ANALYTICS_QUEUE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isQueuedEvent).filter(event => now >= event.createdAt && now - event.createdAt <= EVENT_TTL_MS).slice(-MAX_QUEUE_SIZE);
  } catch { return []; }
}

function writeAnalyticsQueue(queue: QueuedAnalyticsEvent[]): void {
  if (!queue.length) removeStoredItem(ANALYTICS_QUEUE_KEY);
  else setStoredItem(ANALYTICS_QUEUE_KEY, JSON.stringify(queue));
}
function isQueuedEvent(value: unknown): value is QueuedAnalyticsEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<QueuedAnalyticsEvent>;
  return typeof event.createdAt === "number" && event.payload?.schemaVersion === 2 && event.payload.platform === "web" && isUuid(event.payload.eventId) && isUuid(event.payload.installId);
}
function isUuid(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
