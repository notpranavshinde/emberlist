import { describe, expect, it } from "vitest";
import { createEmptySyncPayload } from "./syncPayload";
import {
  createOnboardingSetup,
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
});
