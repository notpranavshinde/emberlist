import { describe, expect, it } from "vitest";
import { createEmptySyncPayload } from "./syncPayload";
import {
  advanceOnboardingStep,
  createOnboardingSetup,
  createInitialOnboardingState,
  createOnboardingTourState,
  getOnboardingPreset,
  type OnboardingPresetId,
} from "./onboarding";

describe("onboarding setup", () => {
  it("creates a sample project and four tasks for each preset", () => {
    const payload = createEmptySyncPayload("test-device");
    const presets: OnboardingPresetId[] = ["personal", "school", "work"];

    for (const presetId of presets) {
      const result = createOnboardingSetup(payload, presetId, Date.UTC(2026, 3, 13));
      const preset = getOnboardingPreset(presetId);

      expect(result.projectName).toBe(preset.projectName);
      expect(result.quickAddExample).toBe(preset.quickAddExample);
      expect(result.sampleTaskTitles).toEqual(
        preset.sampleTasks.map((task) => task.title),
      );
      expect(
        result.payload.projects.filter((project) => !project.deletedAt),
      ).toHaveLength(1);
      expect(
        result.payload.tasks.filter((task) => !task.deletedAt && task.projectId === result.projectId),
      ).toHaveLength(4);
    }
  });

  it("preserves recurring sample tasks", () => {
    const payload = createEmptySyncPayload("test-device");
    const result = createOnboardingSetup(payload, "personal", Date.UTC(2026, 3, 13));

    const recurringTitles = result.payload.tasks
      .filter((task) => task.recurringRule)
      .map((task) => task.title);

    expect(recurringTitles).toEqual(["Plan weekly reset", "Take vitamins"]);
  });

  it("sets due dates relative to the provided onboarding day", () => {
    const payload = createEmptySyncPayload("test-device");
    const todayStartMs = Date.UTC(2026, 3, 13);
    const result = createOnboardingSetup(payload, "work", todayStartMs);

    const prioritiesTask = result.payload.tasks.find(
      (task) => task.title === "Draft weekly priorities",
    );
    const agendaTask = result.payload.tasks.find(
      (task) => task.title === "Prepare next meeting agenda",
    );

    expect(prioritiesTask?.dueAt).toBe(todayStartMs);
    expect(agendaTask?.dueAt).toBe(Date.UTC(2026, 3, 15));
  });

  it("creates deterministic tour state from starter setup", () => {
    const payload = createEmptySyncPayload("test-device");
    const setup = createOnboardingSetup(payload, "school", Date.UTC(2026, 3, 13));
    const state = createOnboardingTourState("school", setup);

    expect(state).toEqual({
      step: "project",
      presetId: "school",
      projectId: setup.projectId,
      quickAddExample: setup.quickAddExample,
    });
  });

  it("advances onboarding steps without changing the chosen preset", () => {
    const initial = createInitialOnboardingState("work");
    const projectStep = {
      ...initial,
      step: "project" as const,
      projectId: "proj-1",
      quickAddExample: "Send weekly update every friday 4pm p2 #Work",
    };

    expect(advanceOnboardingStep(projectStep, "quick_add")).toEqual({
      ...projectStep,
      step: "quick_add",
    });
    expect(advanceOnboardingStep(projectStep, "today")).toEqual({
      ...projectStep,
      step: "today",
    });
  });
});
