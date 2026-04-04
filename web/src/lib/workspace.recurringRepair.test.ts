import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { repairRecurringTasks, toggleTaskCompletion } from './workspace';
import { TEST_NOW, createTestPayload, createTestReminder, createTestTask } from './testSyncBuilders';

describe('recurring repair edge cases', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(TEST_NOW));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not recreate a recurring successor when the open successor was renamed', () => {
    const completed = createTestTask({
      id: 'task-completed',
      title: 'Daily workout',
      dueAt: new Date('2026-04-08T00:00:00Z').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      status: 'COMPLETED',
      completedAt: new Date('2026-04-08T08:00:00Z').getTime(),
      updatedAt: 10,
    });
    const renamedSuccessor = createTestTask({
      id: 'task-open',
      title: 'Morning workout',
      dueAt: new Date('2026-04-09T00:00:00Z').getTime(),
      allDay: true,
      recurringRule: 'FREQ=DAILY',
      updatedAt: 20,
    });

    const repaired = repairRecurringTasks(createTestPayload({
      tasks: [completed, renamedSuccessor],
    }));

    const liveTasks = repaired.payload.tasks.filter(task => !task.deletedAt);
    expect(repaired.repairedCount).toBe(0);
    expect(liveTasks).toHaveLength(2);
    expect(liveTasks.filter(task => task.dueAt === renamedSuccessor.dueAt)).toHaveLength(1);
  });

  it('clones recurring reminders exactly once when a timed recurring task is completed and then repaired', () => {
    const source = createTestTask({
      id: 'task-recurring',
      title: 'Take medicine',
      dueAt: new Date('2026-04-08T15:00:00Z').getTime(),
      allDay: false,
      recurringRule: 'FREQ=DAILY',
    });
    const payload = createTestPayload({
      tasks: [source],
      reminders: [
        createTestReminder({
          id: 'absolute-reminder',
          taskId: source.id,
          timeAt: new Date('2026-04-08T14:45:00Z').getTime(),
          offsetMinutes: null,
        }),
        createTestReminder({
          id: 'offset-reminder',
          taskId: source.id,
          timeAt: null,
          offsetMinutes: 10,
        }),
      ],
    });

    const completed = toggleTaskCompletion(payload, source.id);
    const repaired = repairRecurringTasks(completed);

    const liveOpenTasks = repaired.payload.tasks.filter(task => !task.deletedAt && task.status === 'OPEN');
    const openTask = liveOpenTasks[0];
    const openReminders = repaired.payload.reminders.filter(reminder => !reminder.deletedAt && reminder.taskId === openTask.id);

    expect(liveOpenTasks).toHaveLength(1);
    expect(openReminders).toHaveLength(2);
    expect(openReminders.filter(reminder => reminder.offsetMinutes === 10)).toHaveLength(1);
    expect(openReminders.filter(reminder => reminder.timeAt === new Date('2026-04-09T14:45:00Z').getTime())).toHaveLength(1);
  });
});
