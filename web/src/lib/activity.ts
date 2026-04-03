import type { Reminder, Task } from '../types/sync';

export type ActivityEntry = {
  id: string;
  createdAt: number;
  taskIds: string[];
  title: string;
  detail?: string | null;
};

export type TaskTimelineEntry = {
  id: string;
  at: number;
  title: string;
  detail?: string | null;
  activityId?: string;
  kind: 'activity' | 'system';
};

const MAX_ACTIVITY_ENTRIES = 250;

export function appendActivityEntry(entries: ActivityEntry[], entry: ActivityEntry): ActivityEntry[] {
  return [entry, ...entries]
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, MAX_ACTIVITY_ENTRIES);
}

export function getTaskActivityEntries(entries: ActivityEntry[], taskId: string): ActivityEntry[] {
  return entries
    .filter(entry => entry.taskIds.includes(taskId))
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function buildTaskTimeline(task: Task, reminders: Reminder[], activityEntries: ActivityEntry[]): TaskTimelineEntry[] {
  const timeline: TaskTimelineEntry[] = [
    {
      id: `created:${task.id}`,
      at: task.createdAt,
      title: 'Created task',
      detail: task.projectId ? 'Created inside a project.' : 'Created in Inbox.',
      kind: 'system',
    },
  ];

  if (task.updatedAt > task.createdAt) {
    timeline.push({
      id: `updated:${task.id}`,
      at: task.updatedAt,
      title: 'Last edited',
      detail: 'Task fields were updated.',
      kind: 'system',
    });
  }

  if (task.dueAt !== null) {
    timeline.push({
      id: `due:${task.id}`,
      at: task.dueAt,
      title: 'Scheduled',
      detail: task.allDay ? 'Due all day.' : 'Due at a specific time.',
      kind: 'system',
    });
  }

  if (task.deadlineAt) {
    timeline.push({
      id: `deadline:${task.id}`,
      at: task.deadlineAt,
      title: 'Deadline set',
      detail: task.deadlineAllDay ? 'Deadline tracks the whole day.' : 'Deadline tracks a specific time.',
      kind: 'system',
    });
  }

  if (task.completedAt) {
    timeline.push({
      id: `completed:${task.id}`,
      at: task.completedAt,
      title: 'Completed',
      detail: 'Marked finished.',
      kind: 'system',
    });
  }

  reminders
    .filter(reminder => !reminder.deletedAt && reminder.enabled)
    .forEach(reminder => {
      timeline.push({
        id: `reminder:${reminder.id}`,
        at: reminder.updatedAt,
        title: 'Reminder updated',
        detail: reminder.timeAt !== null
          ? 'Fixed-time reminder attached.'
          : `Relative reminder ${reminder.offsetMinutes ?? 0} minutes before due time.`,
        kind: 'system',
      });
    });

  getTaskActivityEntries(activityEntries, task.id).forEach(entry => {
    timeline.push({
      id: `activity:${entry.id}`,
      at: entry.createdAt,
      title: entry.title,
      detail: entry.detail ?? null,
      activityId: entry.id,
      kind: 'activity',
    });
  });

  return timeline.sort((left, right) => right.at - left.at);
}
