import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANALYTICS_ENABLED_KEY,
  flushOnboardingAnalytics,
  isAnalyticsEnabled,
  readAnalyticsQueue,
  setAnalyticsEnabled,
  trackOnboardingEvent,
} from "./analytics";
import { getStoredItem } from "./webStorage";

describe("onboarding analytics", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    };
    vi.stubGlobal("window", {
      localStorage: storage,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("navigator", { onLine: true });
    vi.restoreAllMocks();
  });

  it("defaults on and clears queued events when disabled", () => {
    expect(isAnalyticsEnabled()).toBe(true);
    trackOnboardingEvent("onboarding_viewed", {}, 100);
    expect(readAnalyticsQueue(100)).toHaveLength(1);
    setAnalyticsEnabled(false);
    expect(getStoredItem(ANALYTICS_ENABLED_KEY)).toBe("false");
    expect(readAnalyticsQueue(100)).toEqual([]);
  });

  it("does not queue content or events while disabled", () => {
    setAnalyticsEnabled(false);
    trackOnboardingEvent("onboarding_completed", {
      method: "first_task",
      elapsedBucket: "under_30s",
    });
    expect(readAnalyticsQueue()).toEqual([]);
  });

  it("caps and expires the queue", () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    for (let index = 0; index < 25; index += 1) {
      trackOnboardingEvent("onboarding_viewed", {}, index);
    }
    expect(readAnalyticsQueue(25)).toHaveLength(20);
    expect(readAnalyticsQueue(8 * 24 * 60 * 60 * 1_000)).toEqual([]);
  });

  it("delivers queued events and removes them after success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    const now = Date.now();
    trackOnboardingEvent("onboarding_restore_result", { result: "empty" }, now);
    await flushOnboardingAnalytics();
    expect(fetchMock).toHaveBeenCalled();
    expect(readAnalyticsQueue(now)).toEqual([]);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(sent.properties).toEqual({ result: "empty" });
    expect(JSON.stringify(sent)).not.toContain("task");
  });
});
