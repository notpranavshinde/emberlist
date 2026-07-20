import type {
  OnboardingCompletionMethod,
  OnboardingExampleId,
} from "./onboarding";
import { getStoredItem, removeStoredItem, setStoredItem } from "./webStorage";

export const ANALYTICS_ENABLED_KEY = "emberlist.analyticsEnabled";
const ANALYTICS_QUEUE_KEY = "emberlist.analyticsQueue.v1";
const EVENT_TTL_MS = 7 * 24 * 60 * 60 * 1_000;
const MAX_QUEUE_SIZE = 20;

export type OnboardingAnalyticsEventName =
  | "onboarding_viewed"
  | "onboarding_primary_clicked"
  | "onboarding_example_clicked"
  | "onboarding_skipped"
  | "onboarding_restore_started"
  | "onboarding_restore_result"
  | "onboarding_completed";

type OnboardingAnalyticsProperties = {
  method?: OnboardingCompletionMethod;
  result?: "success" | "empty" | "cancelled" | "offline" | "error";
  exampleKind?: OnboardingExampleId;
  elapsedBucket?: "under_30s" | "30_to_60s" | "1_to_5m" | "over_5m";
};

export type QueuedOnboardingEvent = {
  createdAt: number;
  payload: {
    schemaVersion: 1;
    eventId: string;
    event: OnboardingAnalyticsEventName;
    platform: "web";
    appVersion: string;
    onboardingVersion: 2;
    properties: OnboardingAnalyticsProperties;
  };
};

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
    removeStoredItem(ANALYTICS_QUEUE_KEY);
  } else {
    void flushOnboardingAnalytics();
  }
}

export function trackOnboardingEvent(
  event: OnboardingAnalyticsEventName,
  properties: OnboardingAnalyticsProperties = {},
  now = Date.now(),
): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  const queue = readAnalyticsQueue(now);
  queue.push({
    createdAt: now,
    payload: {
      schemaVersion: 1,
      eventId: crypto.randomUUID(),
      event,
      platform: "web",
      appVersion: import.meta.env.VITE_APP_VERSION?.trim() || "web",
      onboardingVersion: 2,
      properties,
    },
  });
  writeAnalyticsQueue(queue.slice(-MAX_QUEUE_SIZE));
  void flushOnboardingAnalytics();
}

export function startOnboardingAnalyticsDelivery(): () => void {
  if (typeof window === "undefined") return () => undefined;
  const flush = () => void flushOnboardingAnalytics();
  window.addEventListener("online", flush);
  flush();
  return () => window.removeEventListener("online", flush);
}

export async function flushOnboardingAnalytics(): Promise<void> {
  if (
    typeof window === "undefined" ||
    !isAnalyticsEnabled() ||
    !navigator.onLine
  ) {
    return;
  }
  if (flushPromise) return flushPromise;
  flushPromise = flushAnalyticsQueue().finally(() => {
    flushPromise = null;
  });
  return flushPromise;
}

async function flushAnalyticsQueue(): Promise<void> {
  const queue = readAnalyticsQueue(Date.now());
  if (!queue.length) return;
  const remaining = [...queue];
  while (remaining.length && isAnalyticsEnabled()) {
    const event = remaining[0];
    try {
      const response = await fetch("/api/analytics/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(event.payload),
        keepalive: true,
      });
      if (!response.ok) break;
      remaining.shift();
      writeAnalyticsQueue(remaining);
    } catch {
      break;
    }
  }
}

export function readAnalyticsQueue(now = Date.now()): QueuedOnboardingEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(
      getStoredItem(ANALYTICS_QUEUE_KEY) ?? "[]",
    );
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isQueuedEvent)
      .filter((event) => now - event.createdAt <= EVENT_TTL_MS)
      .slice(-MAX_QUEUE_SIZE);
  } catch {
    return [];
  }
}

function writeAnalyticsQueue(queue: QueuedOnboardingEvent[]): void {
  if (typeof window === "undefined") return;
  if (!queue.length) {
    removeStoredItem(ANALYTICS_QUEUE_KEY);
    return;
  }
  setStoredItem(ANALYTICS_QUEUE_KEY, JSON.stringify(queue));
}

function isQueuedEvent(value: unknown): value is QueuedOnboardingEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Partial<QueuedOnboardingEvent>;
  return (
    typeof event.createdAt === "number" &&
    Boolean(event.payload) &&
    typeof event.payload?.eventId === "string" &&
    event.payload.platform === "web"
  );
}
