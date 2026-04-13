import { addDays } from "date-fns";
import type { SyncPayload } from "../types/sync";
import { createProject, createTask, type TaskDraft } from "./workspace";

export type OnboardingPresetId = "personal" | "school" | "work";

export type OnboardingPreset = {
  id: OnboardingPresetId;
  label: string;
  description: string;
  projectName: string;
  quickAddExample: string;
  sampleTasks: Array<{
    title: string;
    dueOffsetDays: number | null;
    priority?: TaskDraft["priority"];
    recurringRule?: string | null;
  }>;
};

export type OnboardingSetupResult = {
  payload: SyncPayload;
  projectId: string;
  projectName: string;
  quickAddExample: string;
  sampleTaskTitles: string[];
};

export const ONBOARDING_PRESETS: OnboardingPreset[] = [
  {
    id: "personal",
    label: "Personal life",
    description: "Routines, errands, and life admin.",
    projectName: "Life admin",
    quickAddExample: "Pay rent every month on the 1st p1 #Life admin",
    sampleTasks: [
      { title: "Buy groceries", dueOffsetDays: 0, priority: "P2" },
      { title: "Call parents", dueOffsetDays: 1 },
      {
        title: "Plan weekly reset",
        dueOffsetDays: 3,
        recurringRule: "FREQ=WEEKLY",
      },
      {
        title: "Take vitamins",
        dueOffsetDays: 0,
        recurringRule: "FREQ=DAILY",
      },
    ],
  },
  {
    id: "school",
    label: "School",
    description: "Assignments, readings, and repeating study work.",
    projectName: "Classes",
    quickAddExample: "Review lecture notes every monday 7pm #Classes",
    sampleTasks: [
      { title: "Review lecture notes", dueOffsetDays: 0, priority: "P2" },
      { title: "Finish lab worksheet", dueOffsetDays: 1, priority: "P1" },
      { title: "Read next chapter", dueOffsetDays: 3 },
      {
        title: "Plan study block",
        dueOffsetDays: 0,
        recurringRule: "FREQ=WEEKLY",
      },
    ],
  },
  {
    id: "work",
    label: "Work",
    description: "Meetings, follow-ups, and recurring deliverables.",
    projectName: "Work",
    quickAddExample: "Send weekly update every friday 4pm p2 #Work",
    sampleTasks: [
      { title: "Draft weekly priorities", dueOffsetDays: 0, priority: "P2" },
      { title: "Reply to open follow-ups", dueOffsetDays: 1 },
      { title: "Prepare next meeting agenda", dueOffsetDays: 2 },
      {
        title: "Send weekly update",
        dueOffsetDays: 4,
        recurringRule: "FREQ=WEEKLY",
        priority: "P2",
      },
    ],
  },
];

export function getOnboardingPreset(
  presetId: OnboardingPresetId,
): OnboardingPreset {
  return (
    ONBOARDING_PRESETS.find((preset) => preset.id === presetId) ??
    ONBOARDING_PRESETS[0]
  );
}

export function createOnboardingSetup(
  payload: SyncPayload,
  presetId: OnboardingPresetId,
  todayStartMs: number,
): OnboardingSetupResult {
  const preset = getOnboardingPreset(presetId);
  const projectId = crypto.randomUUID();
  let nextPayload = createProject(payload, preset.projectName, projectId);

  for (const sampleTask of preset.sampleTasks) {
    nextPayload = createTask(nextPayload, {
      title: sampleTask.title,
      description: "",
      projectId,
      projectName: null,
      sectionId: null,
      sectionName: null,
      priority: sampleTask.priority ?? "P4",
      dueAt:
        sampleTask.dueOffsetDays === null
          ? null
          : addDays(todayStartMs, sampleTask.dueOffsetDays).getTime(),
      allDay: true,
      deadlineAt: null,
      deadlineAllDay: false,
      recurringRule: sampleTask.recurringRule ?? null,
      deadlineRecurringRule: null,
      parentTaskId: null,
      reminders: [],
    });
  }

  return {
    payload: nextPayload,
    projectId,
    projectName: preset.projectName,
    quickAddExample: preset.quickAddExample,
    sampleTaskTitles: preset.sampleTasks.map((task) => task.title),
  };
}
