import { describe, expect, it } from "vitest";
import { createEmptySyncPayload } from "./syncPayload";
import { createProject, createTask } from "./workspace";
import {
  completeOnboarding,
  createActiveOnboardingState,
  dismissOnboarding,
  hasLiveTasks,
  hasLiveWorkspaceContent,
  initializeOnboardingState,
  onboardingElapsedBucket,
  parseOnboardingState,
  setOnboardingRestorePending,
} from "./onboarding";

describe("onboarding v2", () => {
  it("activates an empty workspace", () => {
    const payload = createEmptySyncPayload("test-device");
    expect(
      initializeOnboardingState({
        storedState: null,
        legacyDismissed: false,
        legacyStatePresent: false,
        payload,
        now: 100,
      }),
    ).toEqual({
      version: 2,
      status: "active",
      startedAt: 100,
      completedAt: null,
      completionMethod: null,
      restorePending: false,
    });
  });

  it("does not activate for an existing workspace", () => {
    const payload = createProject(createEmptySyncPayload("test"), "Work", "p1");
    expect(
      initializeOnboardingState({
        storedState: null,
        legacyDismissed: false,
        legacyStatePresent: false,
        payload,
        now: 200,
      }).status,
    ).toBe("completed");
  });

  it("keeps a stored completed or dismissed state after content is deleted", () => {
    const payload = createEmptySyncPayload("test");
    for (const status of ["completed", "dismissed"] as const) {
      const state = {
        version: 2 as const,
        status,
        startedAt: 1,
        completedAt: status === "completed" ? 2 : null,
        completionMethod: status === "completed" ? ("first_task" as const) : null,
        restorePending: false,
      };
      expect(
        initializeOnboardingState({
          storedState: state,
          legacyDismissed: false,
          legacyStatePresent: false,
          payload,
        }),
      ).toEqual(state);
    }
  });

  it("migrates the legacy dismissed flag and legacy active state", () => {
    const payload = createEmptySyncPayload("test");
    expect(
      initializeOnboardingState({
        storedState: null,
        legacyDismissed: true,
        legacyStatePresent: false,
        payload,
        now: 300,
      }).status,
    ).toBe("dismissed");
    expect(
      initializeOnboardingState({
        storedState: null,
        legacyDismissed: false,
        legacyStatePresent: true,
        payload,
        now: 300,
      }).status,
    ).toBe("active");
  });

  it("distinguishes live tasks from other workspace content", () => {
    let payload = createProject(createEmptySyncPayload("test"), "Work", "p1");
    expect(hasLiveWorkspaceContent(payload)).toBe(true);
    expect(hasLiveTasks(payload)).toBe(false);
    payload = createTask(payload, {
      title: "Ship",
      description: "",
      projectId: "p1",
      projectName: null,
      sectionId: null,
      sectionName: null,
      priority: "P4",
      dueAt: null,
      allDay: true,
      deadlineAt: null,
      deadlineAllDay: false,
      recurringRule: null,
      deadlineRecurringRule: null,
      parentTaskId: null,
      reminders: [],
    });
    expect(hasLiveTasks(payload)).toBe(true);
  });

  it("transitions through restore, completion, and dismissal", () => {
    const active = createActiveOnboardingState(10);
    expect(setOnboardingRestorePending(active, true).restorePending).toBe(true);
    expect(completeOnboarding(active, "drive_restore", 20)).toMatchObject({
      status: "completed",
      completedAt: 20,
      completionMethod: "drive_restore",
      restorePending: false,
    });
    expect(dismissOnboarding(active)).toMatchObject({
      status: "dismissed",
      restorePending: false,
    });
  });

  it("rejects malformed stored state and buckets elapsed time", () => {
    expect(parseOnboardingState({ version: 1, status: "active" })).toBeNull();
    expect(onboardingElapsedBucket(0, 20_000)).toBe("under_30s");
    expect(onboardingElapsedBucket(0, 45_000)).toBe("30_to_60s");
    expect(onboardingElapsedBucket(0, 120_000)).toBe("1_to_5m");
    expect(onboardingElapsedBucket(0, 500_000)).toBe("over_5m");
  });
});
