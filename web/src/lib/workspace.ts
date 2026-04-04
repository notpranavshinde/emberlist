import {
    addDays,
    endOfDay,
    isWithinInterval,
    startOfDay,
    startOfTomorrow,
} from 'date-fns';
import type {
    Priority,
    Project,
    Reminder,
    Section,
    SyncPayload,
    Task,
    TaskStatus,
} from '../types/sync';
import { resolveWeekInterval } from './webPreferences';
import { nextAt } from './recurrence';

export type SearchFilter =
    | 'ALL'
    | 'OVERDUE'
    | 'TODAY'
    | 'THIS_WEEK'
    | 'HIGH_PRIORITY'
    | 'INBOX'
    | 'NO_DUE'
    | 'HAS_DEADLINE'
    | 'NO_DEADLINE'
    | 'RECURRING'
    | 'HAS_REMINDER';

export type TaskDraft = {
    title: string;
    description: string;
    projectId: string | null;
    projectName: string | null;
    sectionId: string | null;
    sectionName: string | null;
    priority: Priority;
    dueAt: number | null;
    allDay: boolean;
    deadlineAt: number | null;
    deadlineAllDay: boolean;
    recurringRule: string | null;
    deadlineRecurringRule: string | null;
    parentTaskId: string | null;
    reminders: TaskReminderDraft[];
};

export type TaskReminderDraft =
    | { kind: 'ABSOLUTE'; timeAt: number }
    | { kind: 'OFFSET'; offsetMinutes: number };

export type TodayViewData = {
    overdue: Task[];
    today: Task[];
    completedToday: Task[];
};

export type FlattenedTask = {
    task: Task;
    depth: number;
    hasVisibleSubtasks: boolean;
    visibleSubtaskCount: number;
};

const HIGH_PRIORITIES: Priority[] = ['P1', 'P2'];

export function createTaskDraft(projectId: string | null = null): TaskDraft {
    return {
        title: '',
        description: '',
        projectId,
        projectName: null,
        sectionId: null,
        sectionName: null,
        priority: 'P4',
        dueAt: null,
        allDay: true,
        deadlineAt: null,
        deadlineAllDay: false,
        recurringRule: null,
        deadlineRecurringRule: null,
        parentTaskId: null,
        reminders: [],
    };
}

export function getActiveProjects(payload: SyncPayload, includeArchived: boolean = false): Project[] {
    return payload.projects
        .filter(project => !project.deletedAt && (includeArchived || !project.archived))
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export function getInboxTasks(payload: SyncPayload): Task[] {
    return getOpenTasks(payload)
        .filter(task => task.projectId === null && task.parentTaskId === null)
        .sort(compareTasks);
}

export function getCompletedInboxTasks(payload: SyncPayload): Task[] {
    return getCompletedTasks(payload)
        .filter(task => task.projectId === null)
        .sort(compareTasks);
}

export function getProjectById(payload: SyncPayload, projectId: string): Project | undefined {
    return payload.projects.find(project => project.id === projectId && !project.deletedAt);
}

export function getTaskById(payload: SyncPayload, taskId: string): Task | undefined {
    return payload.tasks.find(task => task.id === taskId && !task.deletedAt);
}

export function getProjectSections(payload: SyncPayload, projectId: string): Section[] {
    return payload.sections
        .filter(section => section.projectId === projectId && !section.deletedAt)
        .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
}

export function getProjectTasks(payload: SyncPayload, projectId: string, includeArchived: boolean = false): Task[] {
    return payload.tasks
        .filter(task => {
            if (task.projectId !== projectId || task.deletedAt) return false;
            if (includeArchived) return task.status !== 'COMPLETED';
            return task.status === 'OPEN';
        })
        .sort(compareTasks);
}

export function getCompletedProjectTasks(payload: SyncPayload, projectId: string): Task[] {
    return getCompletedTasks(payload)
        .filter(task => task.projectId === projectId)
        .sort(compareTasks);
}

export function getSubtasks(payload: SyncPayload, parentTaskId: string): Task[] {
    return payload.tasks
        .filter(task => task.parentTaskId === parentTaskId && !task.deletedAt && task.status !== 'ARCHIVED')
        .sort(compareTasks);
}

export function getTaskReminderDrafts(payload: SyncPayload, taskId: string): TaskReminderDraft[] {
    return payload.reminders
        .filter(reminder =>
            reminder.taskId === taskId &&
            !reminder.deletedAt &&
            reminder.enabled &&
            reminder.type === 'TIME'
        )
        .sort(compareReminders)
        .map(reminder =>
            reminder.timeAt !== null
                ? { kind: 'ABSOLUTE', timeAt: reminder.timeAt }
                : { kind: 'OFFSET', offsetMinutes: reminder.offsetMinutes ?? 0 }
        );
}

export function getTodayViewData(
    payload: SyncPayload,
    todayStart: number,
    todayEnd: number,
): TodayViewData {
    const openTasks = getOpenTasks(payload);
    const overdue = openTasks.filter(task => task.dueAt !== null && task.dueAt < todayStart).sort(compareTasks);
    const today = openTasks.filter(task => task.dueAt !== null && task.dueAt >= todayStart && task.dueAt <= todayEnd).sort(compareTasks);
    const completedToday = payload.tasks
        .filter(task =>
            !task.deletedAt &&
            task.status === 'COMPLETED' &&
            task.completedAt !== null &&
            task.completedAt >= todayStart &&
            task.completedAt <= todayEnd
        )
        .sort(compareTasks);

    return { overdue, today, completedToday };
}

export function getUpcomingGroups(payload: SyncPayload): Array<{ dateKey: string; tasks: Task[] }> {
    const tomorrowStart = startOfTomorrow().getTime();
    const grouped = new Map<string, Task[]>();

    getOpenTasks(payload)
        .filter(task => task.dueAt !== null && task.dueAt >= tomorrowStart)
        .sort(compareTasks)
        .forEach(task => {
            const key = startOfDay(task.dueAt!).toISOString();
            const tasks = grouped.get(key) ?? [];
            tasks.push(task);
            grouped.set(key, tasks);
        });

    return Array.from(grouped.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([dateKey, tasks]) => ({ dateKey, tasks }));
}

export function getUpcomingOpenTasks(payload: SyncPayload, todayStart: number): Task[] {
    const tomorrowStart = addDays(startOfDay(todayStart), 1).getTime();
    return getOpenTasks(payload)
        .filter(task => task.dueAt !== null && (task.dueAt < todayStart || task.dueAt >= tomorrowStart))
        .sort(compareTasks);
}

export function getUpcomingCompletedTasks(payload: SyncPayload): Task[] {
    const tomorrowStart = startOfTomorrow().getTime();
    return getCompletedTasks(payload)
        .filter(task => task.dueAt !== null && task.dueAt >= tomorrowStart)
        .sort(compareTasks);
}

export function searchTasks(payload: SyncPayload, query: string, filters: Set<SearchFilter>): Task[] {
    const normalizedQuery = query.trim().toLowerCase();
    const projects = new Map(payload.projects.map(project => [project.id, project]));
    const sections = new Map(payload.sections.map(section => [section.id, section]));
    const reminderTaskIds = new Set(payload.reminders.filter(reminder => !reminder.deletedAt).map(reminder => reminder.taskId));
    const openTasks = getOpenTasks(payload);
    const matchedTasks = openTasks.filter(task => {
        if (!normalizedQuery) return true;
        const projectName = task.projectId ? projects.get(task.projectId)?.name ?? '' : 'inbox';
        const sectionName = task.sectionId ? sections.get(task.sectionId)?.name ?? '' : '';
        return [
            task.title,
            task.description,
            projectName,
            sectionName,
        ].join(' ').toLowerCase().includes(normalizedQuery);
    }).filter(task => matchesFilters(task, filters, reminderTaskIds));

    if (!matchedTasks.length) {
        return [];
    }

    const tasksById = new Map(openTasks.map(task => [task.id, task]));
    const includedIds = new Set<string>();

    matchedTasks.forEach(task => {
        let current: Task | undefined = task;
        while (current) {
            if (includedIds.has(current.id)) break;
            includedIds.add(current.id);
            current = current.parentTaskId ? tasksById.get(current.parentTaskId) : undefined;
        }
    });

    return openTasks
        .filter(task => includedIds.has(task.id))
        .sort(compareTasks);
}

export function searchCompletedTasks(payload: SyncPayload, query: string, filters: Set<SearchFilter>): Task[] {
    const normalizedQuery = query.trim().toLowerCase();
    const projects = new Map(payload.projects.map(project => [project.id, project]));
    const sections = new Map(payload.sections.map(section => [section.id, section]));
    const reminderTaskIds = new Set(payload.reminders.filter(reminder => !reminder.deletedAt).map(reminder => reminder.taskId));

    return getCompletedTasks(payload)
        .filter(task => {
            if (!normalizedQuery) return true;
            const projectName = task.projectId ? projects.get(task.projectId)?.name ?? '' : 'inbox';
            const sectionName = task.sectionId ? sections.get(task.sectionId)?.name ?? '' : '';
            return [
                task.title,
                task.description,
                projectName,
                sectionName,
            ].join(' ').toLowerCase().includes(normalizedQuery);
        })
        .filter(task => matchesFilters(task, filters, reminderTaskIds))
        .sort(compareTasks);
}

export function flattenTasksWithSubtasks(tasks: Task[]): FlattenedTask[] {
    if (!tasks.length) return [];

    const visibleTaskIds = new Set(tasks.map(task => task.id));
    const childrenByParent = new Map<string, Task[]>();
    const roots: Task[] = [];

    tasks.forEach(task => {
        if (task.parentTaskId && visibleTaskIds.has(task.parentTaskId)) {
            const siblings = childrenByParent.get(task.parentTaskId) ?? [];
            siblings.push(task);
            childrenByParent.set(task.parentTaskId, siblings);
            return;
        }
        roots.push(task);
    });

    const flattened: FlattenedTask[] = [];
    const visited = new Set<string>();

    const appendTask = (task: Task, depth: number) => {
        if (visited.has(task.id)) return;
        visited.add(task.id);

        const children = childrenByParent.get(task.id) ?? [];
        flattened.push({
            task,
            depth,
            hasVisibleSubtasks: children.length > 0,
            visibleSubtaskCount: children.length,
        });

        children.forEach(child => appendTask(child, depth + 1));
    };

    roots.forEach(task => appendTask(task, 0));
    tasks.forEach(task => appendTask(task, 0));

    return flattened;
}

export function createTask(payload: SyncPayload, draft: TaskDraft): SyncPayload {
    const now = Date.now();
    const resolvedProject = resolveProject(payload, draft, now);
    const resolvedSection = resolveSection(payload, draft, resolvedProject?.id ?? draft.projectId, now);
    const projectId = resolvedProject?.id ?? draft.projectId;
    const sectionId = resolvedSection?.id ?? draft.sectionId;
    const task: Task = {
        id: crypto.randomUUID(),
        title: draft.title.trim(),
        description: draft.description.trim(),
        projectId,
        sectionId,
        priority: draft.priority,
        dueAt: draft.dueAt,
        allDay: draft.allDay,
        deadlineAt: draft.deadlineAt,
        deadlineAllDay: draft.deadlineAllDay,
        recurringRule: draft.recurringRule,
        deadlineRecurringRule: draft.deadlineRecurringRule,
        status: 'OPEN',
        completedAt: null,
        parentTaskId: draft.parentTaskId,
        locationId: null,
        locationTriggerType: null,
        order: nextTaskOrder(payload, projectId, sectionId, draft.parentTaskId),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };

    const reminders = desiredReminderDrafts(draft, task).map<Reminder>(reminder => ({
        id: crypto.randomUUID(),
        taskId: task.id,
        type: 'TIME',
        timeAt: reminder.kind === 'ABSOLUTE' ? reminder.timeAt : null,
        offsetMinutes: reminder.kind === 'OFFSET' ? reminder.offsetMinutes : null,
        locationId: null,
        locationTriggerType: null,
        enabled: true,
        ephemeral: false,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    }));

    return finalizePayload({
        ...payload,
        projects: resolvedProject && !payload.projects.some(project => project.id === resolvedProject.id)
            ? [...payload.projects, resolvedProject]
            : payload.projects,
        sections: resolvedSection && !payload.sections.some(section => section.id === resolvedSection.id)
            ? [...payload.sections, resolvedSection]
            : payload.sections,
        tasks: [...payload.tasks, task],
        reminders: [...payload.reminders, ...reminders],
    });
}

export function canReparentTaskAsSubtask(payload: SyncPayload, draggedTaskId: string, parentTaskId: string): boolean {
    const dragged = payload.tasks.find(task => task.id === draggedTaskId && !task.deletedAt) ?? null;
    const parent = payload.tasks.find(task => task.id === parentTaskId && !task.deletedAt) ?? null;

    if (!dragged || !parent) return false;
    if (dragged.status !== 'OPEN' || parent.status !== 'OPEN') return false;
    if (dragged.id === parent.id) return false;
    if (parent.parentTaskId !== null) return false;
    if (dragged.parentTaskId === parent.id) return false;

    return true;
}

export function reparentTaskAsSubtask(payload: SyncPayload, draggedTaskId: string, parentTaskId: string): SyncPayload {
    if (!canReparentTaskAsSubtask(payload, draggedTaskId, parentTaskId)) {
        return payload;
    }

    const now = Date.now();
    const parent = payload.tasks.find(task => task.id === parentTaskId && !task.deletedAt)!;
    const nextOrder = payload.tasks
        .filter(task => task.parentTaskId === parentTaskId && !task.deletedAt && task.id !== draggedTaskId)
        .reduce((max, task) => Math.max(max, task.order), -1) + 1;

    return finalizePayload({
        ...payload,
        tasks: payload.tasks.map(task =>
            task.id === draggedTaskId
                ? {
                    ...task,
                    parentTaskId,
                    projectId: parent.projectId,
                    sectionId: parent.sectionId,
                    order: nextOrder,
                    updatedAt: now,
                }
                : task
        ),
    });
}

export function promoteSubtask(payload: SyncPayload, taskId: string): SyncPayload {
    const task = payload.tasks.find(candidate => candidate.id === taskId && !candidate.deletedAt) ?? null;
    if (!task || task.parentTaskId === null) return payload;

    const parent = payload.tasks.find(candidate => candidate.id === task.parentTaskId && !candidate.deletedAt) ?? null;
    if (!parent) return payload;

    const now = Date.now();
    const nextParentTaskId = parent.parentTaskId ?? null;
    const nextOrder = payload.tasks
        .filter(candidate => candidate.parentTaskId === nextParentTaskId && !candidate.deletedAt && candidate.id !== taskId)
        .reduce((max, candidate) => Math.max(max, candidate.order), -1) + 1;

    return finalizePayload({
        ...payload,
        tasks: payload.tasks.map(candidate =>
            candidate.id === taskId
                ? {
                    ...candidate,
                    parentTaskId: nextParentTaskId,
                    projectId: parent.projectId,
                    sectionId: parent.sectionId,
                    order: nextOrder,
                    updatedAt: now,
                }
                : candidate
        ),
    });
}

export function updateTask(payload: SyncPayload, taskId: string, updater: (task: Task) => Task): SyncPayload {
    const nextTasks = payload.tasks.map(task => {
        if (task.id !== taskId) return task;
        const updated = updater(task);
        return {
            ...updated,
            updatedAt: Date.now(),
        };
    });

    return finalizePayload({
        ...payload,
        tasks: nextTasks,
    });
}

export function updateTaskFromDraft(payload: SyncPayload, taskId: string, draft: TaskDraft): SyncPayload {
    const currentTask = payload.tasks.find(task => task.id === taskId && !task.deletedAt);
    if (!currentTask) return payload;

    const now = Date.now();
    const resolvedProject = resolveProject(payload, draft, now);
    const resolvedProjectId = resolvedProject?.id ?? draft.projectId;
    const resolvedSection = resolveSection(payload, draft, resolvedProjectId, now);
    const resolvedSectionId = resolvedSection?.id ?? draft.sectionId;

    const nextTasks = payload.tasks.map(task =>
        task.id === taskId
            ? {
                ...task,
                title: draft.title.trim(),
                description: draft.description.trim(),
                projectId: resolvedProjectId,
                sectionId: resolvedProjectId ? resolvedSectionId : null,
                priority: draft.priority,
                dueAt: draft.dueAt,
                allDay: draft.allDay,
                deadlineAt: draft.deadlineAt,
                deadlineAllDay: draft.deadlineAllDay,
                recurringRule: draft.recurringRule,
                deadlineRecurringRule: draft.deadlineRecurringRule,
                updatedAt: now,
            }
            : task
    );

    const nextReminders = [
        ...payload.reminders.filter(reminder => reminder.taskId !== taskId),
        ...draft.reminders.map<Reminder>(reminder => ({
            id: crypto.randomUUID(),
            taskId,
            type: 'TIME',
            timeAt: reminder.kind === 'ABSOLUTE' ? reminder.timeAt : null,
            offsetMinutes: reminder.kind === 'OFFSET' ? reminder.offsetMinutes : null,
            locationId: null,
            locationTriggerType: null,
            enabled: true,
            ephemeral: false,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        })),
    ];

    return finalizePayload({
        ...payload,
        projects: resolvedProject && !payload.projects.some(project => project.id === resolvedProject.id)
            ? [...payload.projects, resolvedProject]
            : payload.projects,
        sections: resolvedSection && !payload.sections.some(section => section.id === resolvedSection.id)
            ? [...payload.sections, resolvedSection]
            : payload.sections,
        tasks: nextTasks,
        reminders: nextReminders,
    });
}

export function updateTasks(payload: SyncPayload, taskIds: string[], updater: (task: Task) => Task): SyncPayload {
    if (!taskIds.length) return payload;
    const ids = new Set(taskIds);
    const now = Date.now();
    const nextTasks = payload.tasks.map(task => {
        if (!ids.has(task.id) || task.deletedAt) return task;
        const updated = updater(task);
        return {
            ...updated,
            updatedAt: now,
        };
    });

    return finalizePayload({
        ...payload,
        tasks: nextTasks,
    });
}

export function toggleTaskCompletion(payload: SyncPayload, taskId: string): SyncPayload {
    const task = payload.tasks.find(candidate => candidate.id === taskId && !candidate.deletedAt) ?? null;
    if (!task) return payload;

    const now = Date.now();
    const isCompleted = task.status === 'COMPLETED';
    const subtaskIds = getDirectOpenSubtaskIds(payload, taskId);

    if (isCompleted) {
        const successor = findRecurringSuccessor(payload, task, task.completedAt ?? now);
        return finalizePayload({
            ...payload,
            tasks: payload.tasks.map(candidate => {
                if (candidate.id === taskId) {
                    return {
                        ...candidate,
                        status: 'OPEN' as TaskStatus,
                        completedAt: null,
                        updatedAt: now,
                    };
                }
                if (successor && candidate.id === successor.id) {
                    return {
                        ...candidate,
                        deletedAt: now,
                        updatedAt: now,
                    };
                }
                return candidate;
            }),
            reminders: payload.reminders.map(reminder =>
                successor && reminder.taskId === successor.id && !reminder.deletedAt
                    ? {
                        ...reminder,
                        deletedAt: now,
                        updatedAt: now,
                    }
                    : reminder
            ),
        });
    }

    const completedTask: Task = {
        ...task,
        status: 'COMPLETED',
        completedAt: now,
        updatedAt: now,
    };
    const successor = buildRecurringSuccessor(payload, task, now);

    return finalizePayload({
        ...payload,
        tasks: [
            ...payload.tasks.map(candidate => {
                if (candidate.id === taskId) {
                    return completedTask;
                }
                if (subtaskIds.has(candidate.id)) {
                    return {
                        ...candidate,
                        status: 'COMPLETED' as TaskStatus,
                        completedAt: now,
                        updatedAt: now,
                    };
                }
                return candidate;
            }),
            ...(successor ? [successor.task] : []),
        ],
        reminders: successor
            ? [...payload.reminders, ...successor.reminders]
            : payload.reminders,
    });
}

export function repairRecurringTasks(payload: SyncPayload): {
    payload: SyncPayload;
    repairedCount: number;
    removedDuplicateCount: number;
} {
    const now = Date.now();
    const duplicateCleanup = removeRecurringOccurrenceDuplicates(payload, now);
    const additions: Task[] = [];
    const reminderAdditions: Reminder[] = [];

    duplicateCleanup.payload.tasks.forEach(task => {
        if (task.deletedAt || task.status !== 'COMPLETED') return;
        if (!task.recurringRule && !task.deadlineRecurringRule) return;
        if (hasLaterRecurringContinuation(duplicateCleanup.payload, task, additions, true)) return;

        const successor = buildRecurringSuccessor(duplicateCleanup.payload, task, task.completedAt ?? now);
        if (!successor) return;
        additions.push(successor.task);
        reminderAdditions.push(...successor.reminders);
    });

    if (!additions.length && !reminderAdditions.length && duplicateCleanup.removedCount === 0) {
        return { payload, repairedCount: 0, removedDuplicateCount: 0 };
    }

    return {
        payload: finalizePayload({
            ...duplicateCleanup.payload,
            tasks: [...duplicateCleanup.payload.tasks, ...additions],
            reminders: [...duplicateCleanup.payload.reminders, ...reminderAdditions],
        }),
        repairedCount: additions.length,
        removedDuplicateCount: duplicateCleanup.removedCount,
    };
}

export function archiveTask(payload: SyncPayload, taskId: string): SyncPayload {
    return updateTask(payload, taskId, task => ({
        ...task,
        status: task.status === 'ARCHIVED' ? 'OPEN' : 'ARCHIVED',
    }));
}

export function deleteTask(payload: SyncPayload, taskId: string): SyncPayload {
    const now = Date.now();
    return finalizePayload({
        ...payload,
        tasks: payload.tasks.map(task =>
            task.id === taskId
                ? {
                    ...task,
                    deletedAt: now,
                    updatedAt: now,
                }
                : task
        ),
        reminders: payload.reminders.filter(reminder => reminder.taskId !== taskId),
    });
}

export function rescheduleTasksToDate(payload: SyncPayload, taskIds: string[], dueAt: number): SyncPayload {
    return updateTasks(payload, taskIds, task => ({
        ...task,
        dueAt,
        allDay: true,
    }));
}

export function moveTasksToProject(payload: SyncPayload, taskIds: string[], projectId: string | null): SyncPayload {
    return updateTasks(payload, taskIds, task => ({
        ...task,
        projectId,
        sectionId: null,
    }));
}

export function moveTasksToSection(payload: SyncPayload, taskIds: string[], sectionId: string | null): SyncPayload {
    if (!taskIds.length) return payload;
    const section = sectionId
        ? payload.sections.find(candidate => candidate.id === sectionId && !candidate.deletedAt) ?? null
        : null;

    return updateTasks(payload, taskIds, task => ({
        ...task,
        projectId: section ? section.projectId : task.projectId,
        sectionId: section?.id ?? null,
        parentTaskId: task.parentTaskId,
    }));
}

export function setPriorityForTasks(payload: SyncPayload, taskIds: string[], priority: Priority): SyncPayload {
    return updateTasks(payload, taskIds, task => ({
        ...task,
        priority,
    }));
}

export function deleteTasks(payload: SyncPayload, taskIds: string[]): SyncPayload {
    if (!taskIds.length) return payload;
    const ids = new Set(taskIds);
    const now = Date.now();
    return finalizePayload({
        ...payload,
        tasks: payload.tasks.map(task =>
            ids.has(task.id) && !task.deletedAt
                ? {
                    ...task,
                    deletedAt: now,
                    updatedAt: now,
                }
                : task
        ),
        reminders: payload.reminders.filter(reminder => !ids.has(reminder.taskId)),
    });
}

export function createProject(payload: SyncPayload, name: string, projectId: string = crypto.randomUUID()): SyncPayload {
    const now = Date.now();
    const project: Project = {
        id: projectId,
        name: name.trim(),
        color: '#EE6A3C',
        favorite: false,
        order: nextProjectOrder(payload),
        archived: false,
        viewPreference: 'LIST',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };

    return finalizePayload({
        ...payload,
        projects: [...payload.projects, project],
    });
}

export function updateProject(payload: SyncPayload, projectId: string, updater: (project: Project) => Project): SyncPayload {
    return finalizePayload({
        ...payload,
        projects: payload.projects.map(project =>
            project.id === projectId
                ? {
                    ...updater(project),
                    updatedAt: Date.now(),
                }
                : project
        ),
    });
}

export function deleteProject(payload: SyncPayload, projectId: string): SyncPayload {
    const now = Date.now();
    const taskIds = payload.tasks.filter(task => task.projectId === projectId && !task.deletedAt).map(task => task.id);

    return finalizePayload({
        ...payload,
        projects: payload.projects.map(project =>
            project.id === projectId
                ? { ...project, deletedAt: now, updatedAt: now }
                : project
        ),
        sections: payload.sections.map(section =>
            section.projectId === projectId
                ? { ...section, deletedAt: now, updatedAt: now }
                : section
        ),
        tasks: payload.tasks.map(task =>
            task.projectId === projectId
                ? { ...task, deletedAt: now, updatedAt: now }
                : task
        ),
        reminders: payload.reminders.filter(reminder => !taskIds.includes(reminder.taskId)),
    });
}

export function createSection(payload: SyncPayload, projectId: string, name: string): SyncPayload {
    const now = Date.now();
    const section: Section = {
        id: crypto.randomUUID(),
        projectId,
        name: name.trim(),
        order: nextSectionOrder(payload, projectId),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };

    return finalizePayload({
        ...payload,
        sections: [...payload.sections, section],
    });
}

export function updateSection(payload: SyncPayload, sectionId: string, updater: (section: Section) => Section): SyncPayload {
    return finalizePayload({
        ...payload,
        sections: payload.sections.map(section =>
            section.id === sectionId
                ? {
                    ...updater(section),
                    updatedAt: Date.now(),
                }
                : section
        ),
    });
}

export function deleteSection(payload: SyncPayload, sectionId: string): SyncPayload {
    const now = Date.now();
    return finalizePayload({
        ...payload,
        sections: payload.sections.map(section =>
            section.id === sectionId
                ? { ...section, deletedAt: now, updatedAt: now }
                : section
        ),
        tasks: payload.tasks.map(task =>
            task.sectionId === sectionId
                ? { ...task, sectionId: null, updatedAt: now }
                : task
        ),
    });
}

function getOpenTasks(payload: SyncPayload): Task[] {
    return payload.tasks.filter(task => !task.deletedAt && task.status === 'OPEN');
}

function getCompletedTasks(payload: SyncPayload): Task[] {
    return payload.tasks.filter(task => !task.deletedAt && task.status === 'COMPLETED');
}

function compareTasks(left: Task, right: Task): number {
    const leftDue = left.dueAt ?? Number.MAX_SAFE_INTEGER;
    const rightDue = right.dueAt ?? Number.MAX_SAFE_INTEGER;
    if (leftDue !== rightDue) return leftDue - rightDue;
    if (left.order !== right.order) return left.order - right.order;
    return left.title.localeCompare(right.title);
}

function finalizePayload(payload: SyncPayload): SyncPayload {
    return {
        ...payload,
        exportedAt: Date.now(),
        payloadId: crypto.randomUUID(),
        source: 'web',
    };
}

function buildRecurringSuccessor(
    payload: SyncPayload,
    task: Task,
    now: number,
): { task: Task; reminders: Reminder[] } | null {
    const nextDue = getNextRecurringDate({
        rule: task.recurringRule ?? null,
        currentAt: task.dueAt ?? null,
        now,
        allDay: task.allDay,
    });
    const nextDeadlineFromRule = getNextRecurringDate({
        rule: task.deadlineRecurringRule ?? null,
        currentAt: task.deadlineAt ?? null,
        now,
        allDay: task.deadlineAllDay ?? false,
    });
    const taskDeadlineAt = task.deadlineAt ?? null;
    const deadlineOffset = taskDeadlineAt !== null && task.dueAt !== null
        ? taskDeadlineAt - task.dueAt
        : null;
    const nextDeadline = nextDeadlineFromRule
        ?? (nextDue !== null && deadlineOffset !== null ? nextDue + deadlineOffset : null);

    if (nextDue === null && nextDeadline === null) {
        return null;
    }

    const nextTask: Task = {
        ...task,
        id: crypto.randomUUID(),
        dueAt: nextDue,
        allDay: nextDue !== null ? task.allDay : false,
        deadlineAt: nextDeadline,
        deadlineAllDay: nextDeadline !== null ? (task.deadlineAllDay ?? false) : false,
        status: 'OPEN',
        completedAt: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };

    return {
        task: nextTask,
        reminders: cloneRecurringReminders(payload, task, nextTask, now),
    };
}

function cloneRecurringReminders(
    payload: SyncPayload,
    sourceTask: Task,
    nextTask: Task,
    now: number,
): Reminder[] {
    return payload.reminders.flatMap(reminder => {
        if (reminder.taskId !== sourceTask.id || reminder.deletedAt || !reminder.enabled) {
            return [];
        }

        const nextReminder: Reminder = {
            ...reminder,
            id: crypto.randomUUID(),
            taskId: nextTask.id,
            createdAt: now,
            updatedAt: now,
            deletedAt: null,
        };

        if (reminder.offsetMinutes !== null) {
            nextReminder.timeAt = null;
            nextReminder.offsetMinutes = reminder.offsetMinutes;
            return [nextReminder];
        }

        const sourceBaseAt = sourceTask.dueAt ?? sourceTask.deadlineAt ?? null;
        const nextBaseAt = nextTask.dueAt ?? nextTask.deadlineAt ?? null;
        if (reminder.timeAt !== null && sourceBaseAt !== null && nextBaseAt !== null) {
            nextReminder.timeAt = nextBaseAt + (reminder.timeAt - sourceBaseAt);
            nextReminder.offsetMinutes = null;
            return [nextReminder];
        }

        return [];
    });
}

function findRecurringSuccessor(
    payload: SyncPayload,
    task: Task,
    now: number,
    additionalTasks: Task[] = [],
): Task | null {
    const match = findRecurringOccurrence(payload, task, now, additionalTasks, false);
    return match && !match.deletedAt ? match : null;
}

function findRecurringOccurrence(
    payload: SyncPayload,
    task: Task,
    now: number,
    additionalTasks: Task[] = [],
    includeDeleted: boolean = false,
): Task | null {
    const nextDue = getNextRecurringDate({
        rule: task.recurringRule ?? null,
        currentAt: task.dueAt ?? null,
        now,
        allDay: task.allDay,
    });
    const nextDeadlineFromRule = getNextRecurringDate({
        rule: task.deadlineRecurringRule ?? null,
        currentAt: task.deadlineAt ?? null,
        now,
        allDay: task.deadlineAllDay ?? false,
    });
    const taskDeadlineAt = task.deadlineAt ?? null;
    const deadlineOffset = taskDeadlineAt !== null && task.dueAt !== null
        ? taskDeadlineAt - task.dueAt
        : null;
    const nextDeadline = nextDeadlineFromRule
        ?? (nextDue !== null && deadlineOffset !== null ? nextDue + deadlineOffset : null);

    if (nextDue === null && nextDeadline === null) {
        return null;
    }

    const occurrenceCandidates = [...payload.tasks, ...additionalTasks]
        .filter(candidate =>
            (includeDeleted || !candidate.deletedAt) &&
            candidate.id !== task.id &&
            candidate.dueAt === nextDue &&
            (candidate.deadlineAt ?? null) === nextDeadline &&
            (candidate.recurringRule ?? null) === (task.recurringRule ?? null) &&
            (candidate.deadlineRecurringRule ?? null) === (task.deadlineRecurringRule ?? null)
        )
        .sort((left, right) => compareRecurringRepairCandidatesForTask(left, right, task));

    const exactTitleMatch = occurrenceCandidates.find(candidate =>
        normalizeRecurringIdentityText(candidate.title) === normalizeRecurringIdentityText(task.title) &&
        scoreRecurringRepairCandidate(candidate, task) >= 5
    );
    if (exactTitleMatch) {
        return exactTitleMatch;
    }

    const fallbackMatches = occurrenceCandidates.filter(candidate => matchesRecurringRepairFallbackContext(candidate, task));
    return fallbackMatches.length === 1 ? fallbackMatches[0] : null;
}

function hasLaterRecurringContinuation(
    payload: SyncPayload,
    task: Task,
    additionalTasks: Task[] = [],
    includeDeleted: boolean = false,
): boolean {
    const currentAt = getRecurringOccurrenceAt(task);
    if (currentAt === null) return false;

    const laterCandidates = [...payload.tasks, ...additionalTasks]
        .filter(candidate =>
            candidate.id !== task.id &&
            (includeDeleted || !candidate.deletedAt) &&
            (candidate.recurringRule ?? null) === (task.recurringRule ?? null) &&
            (candidate.deadlineRecurringRule ?? null) === (task.deadlineRecurringRule ?? null) &&
            getRecurringOccurrenceAt(candidate) !== null &&
            getRecurringOccurrenceAt(candidate)! > currentAt
        )
        .sort((left, right) => compareRecurringRepairCandidatesForTask(left, right, task));

    if (laterCandidates.some(candidate =>
        normalizeRecurringIdentityText(candidate.title) === normalizeRecurringIdentityText(task.title) &&
        scoreRecurringRepairCandidate(candidate, task) >= 8
    )) {
        return true;
    }

    const fallbackCountsByOccurrence = new Map<number, number>();
    laterCandidates
        .filter(candidate => matchesRecurringRepairFallbackContext(candidate, task))
        .forEach(candidate => {
            const occurrenceAt = getRecurringOccurrenceAt(candidate)!;
            fallbackCountsByOccurrence.set(occurrenceAt, (fallbackCountsByOccurrence.get(occurrenceAt) ?? 0) + 1);
        });

    return Array.from(fallbackCountsByOccurrence.values()).some(count => count === 1);
}

function removeRecurringOccurrenceDuplicates(
    payload: SyncPayload,
    now: number,
): { payload: SyncPayload; removedCount: number } {
    const groups = new Map<string, Task[]>();

    payload.tasks.forEach(task => {
        if (task.deletedAt) return;
        if (!task.recurringRule && !task.deadlineRecurringRule) return;
        const key = buildRecurringOccurrenceKey(task);
        const group = groups.get(key) ?? [];
        group.push(task);
        groups.set(key, group);
    });

    const removedIds = new Set<string>();

    groups.forEach(group => {
        if (group.length < 2) return;
        const canonical = group.slice().sort(compareRecurringOccurrenceCandidates)[0];
        group.forEach(task => {
            if (task.id !== canonical.id) {
                removedIds.add(task.id);
            }
        });
    });

    if (!removedIds.size) {
        return { payload, removedCount: 0 };
    }

    return {
        payload: {
            ...payload,
            tasks: payload.tasks.map(task =>
                removedIds.has(task.id)
                    ? {
                        ...task,
                        deletedAt: now,
                        updatedAt: now,
                    }
                    : task
            ),
            reminders: payload.reminders.filter(reminder => !removedIds.has(reminder.taskId)),
        },
        removedCount: removedIds.size,
    };
}

function compareRecurringOccurrenceCandidates(left: Task, right: Task): number {
    const statusRank = (task: Task) => {
        if (task.status === 'COMPLETED') return 0;
        if (task.status === 'ARCHIVED') return 1;
        return 2;
    };

    const leftRank = statusRank(left);
    const rightRank = statusRank(right);
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    if (left.createdAt !== right.createdAt) return right.createdAt - left.createdAt;
    return left.id.localeCompare(right.id);
}

function buildRecurringOccurrenceKey(task: Task): string {
    return JSON.stringify({
        ...parseRecurringRepairIdentity(task),
        dueAt: task.dueAt,
        deadlineAt: task.deadlineAt ?? null,
    });
}

function parseRecurringRepairIdentity(task: Task) {
    return {
        title: normalizeRecurringIdentityText(task.title),
        allDay: task.allDay,
        deadlineAllDay: task.deadlineAllDay ?? false,
        recurringRule: task.recurringRule ?? null,
        deadlineRecurringRule: task.deadlineRecurringRule ?? null,
    };
}

function scoreRecurringRepairCandidate(candidate: Task, task: Task): number {
    let score = 0;
    if (normalizeRecurringIdentityText(candidate.title) === normalizeRecurringIdentityText(task.title)) score += 4;
    if ((candidate.recurringRule ?? null) === (task.recurringRule ?? null)) score += 3;
    if ((candidate.deadlineRecurringRule ?? null) === (task.deadlineRecurringRule ?? null)) score += 3;
    if (candidate.projectId === task.projectId) score += 2;
    if (candidate.sectionId === task.sectionId) score += 1;
    if (candidate.parentTaskId === task.parentTaskId) score += 2;
    if (candidate.description === task.description) score += 1;
    if (candidate.priority === task.priority) score += 1;
    if (candidate.allDay === task.allDay) score += 1;
    if ((candidate.deadlineAllDay ?? false) === (task.deadlineAllDay ?? false)) score += 1;
    if (candidate.locationId === task.locationId) score += 1;
    if (candidate.locationTriggerType === task.locationTriggerType) score += 1;
    return score;
}

function matchesRecurringRepairFallbackContext(candidate: Task, task: Task): boolean {
    return candidate.projectId === task.projectId
        && candidate.sectionId === task.sectionId
        && candidate.parentTaskId === task.parentTaskId
        && candidate.allDay === task.allDay
        && (candidate.deadlineAllDay ?? false) === (task.deadlineAllDay ?? false);
}

function compareRecurringRepairCandidatesForTask(left: Task, right: Task, task: Task): number {
    const leftScore = scoreRecurringRepairCandidate(left, task);
    const rightScore = scoreRecurringRepairCandidate(right, task);
    if (leftScore !== rightScore) return rightScore - leftScore;
    if ((left.deletedAt ?? Number.MAX_SAFE_INTEGER) !== (right.deletedAt ?? Number.MAX_SAFE_INTEGER)) {
        return (left.deletedAt ?? Number.MAX_SAFE_INTEGER) - (right.deletedAt ?? Number.MAX_SAFE_INTEGER);
    }
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt;
    return left.id.localeCompare(right.id);
}

function normalizeRecurringIdentityText(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function getRecurringOccurrenceAt(task: Task): number | null {
    return task.dueAt ?? task.deadlineAt ?? null;
}

function getNextRecurringDate(params: {
    rule: string | null;
    currentAt: number | null;
    now: number;
    allDay: boolean;
}): number | null {
    const { rule, currentAt, now, allDay } = params;
    if (!rule || currentAt === null) return null;
    const baseAt = now > currentAt
        ? alignDateToNow(currentAt, now, allDay)
        : currentAt;
    return nextAt(baseAt, rule, !allDay);
}

function alignDateToNow(taskAt: number, now: number, allDay: boolean): number {
    const taskDate = new Date(taskAt);
    const nowDate = new Date(now);
    return new Date(
        nowDate.getFullYear(),
        nowDate.getMonth(),
        nowDate.getDate(),
        allDay ? 0 : taskDate.getHours(),
        allDay ? 0 : taskDate.getMinutes(),
        0,
        0,
    ).getTime();
}

function nextProjectOrder(payload: SyncPayload): number {
    return payload.projects.reduce((max, project) => Math.max(max, project.order), -1) + 1;
}

function nextSectionOrder(payload: SyncPayload, projectId: string): number {
    return payload.sections
        .filter(section => section.projectId === projectId && !section.deletedAt)
        .reduce((max, section) => Math.max(max, section.order), -1) + 1;
}

function nextTaskOrder(
    payload: SyncPayload,
    projectId: string | null,
    sectionId: string | null,
    parentTaskId: string | null,
): number {
    return payload.tasks
        .filter(task =>
            task.projectId === projectId &&
            task.sectionId === sectionId &&
            task.parentTaskId === parentTaskId &&
            !task.deletedAt
        )
        .reduce((max, task) => Math.max(max, task.order), -1) + 1;
}

function getDirectOpenSubtaskIds(payload: SyncPayload, parentTaskId: string): Set<string> {
    return new Set(
        payload.tasks
            .filter(task =>
                task.parentTaskId === parentTaskId &&
                !task.deletedAt &&
                task.status !== 'COMPLETED'
            )
            .map(task => task.id)
    );
}

function resolveProject(payload: SyncPayload, draft: TaskDraft, now: number): Project | null {
    if (draft.projectId) {
        return payload.projects.find(project => project.id === draft.projectId && !project.deletedAt && !project.archived) ?? null;
    }

    const projectName = draft.projectName?.trim();
    if (!projectName) return null;

    const existing = payload.projects.find(project =>
        !project.deletedAt &&
        !project.archived &&
        project.name.localeCompare(projectName, undefined, { sensitivity: 'base' }) === 0
    );
    if (existing) return existing;

    return {
        id: crypto.randomUUID(),
        name: projectName,
        color: '#EE6A3C',
        favorite: false,
        order: nextProjectOrder(payload),
        archived: false,
        viewPreference: 'LIST',
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

function resolveSection(payload: SyncPayload, draft: TaskDraft, projectId: string | null, now: number): Section | null {
    if (!projectId) return null;
    if (draft.sectionId) {
        return payload.sections.find(section => section.id === draft.sectionId && !section.deletedAt) ?? null;
    }

    const sectionName = draft.sectionName?.trim();
    if (!sectionName) return null;

    const existing = payload.sections.find(section =>
        section.projectId === projectId &&
        !section.deletedAt &&
        section.name.localeCompare(sectionName, undefined, { sensitivity: 'base' }) === 0
    );
    if (existing) return existing;

    return {
        id: crypto.randomUUID(),
        projectId,
        name: sectionName,
        order: nextSectionOrder(payload, projectId),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
    };
}

function desiredReminderDrafts(draft: TaskDraft, task: Task): TaskReminderDraft[] {
    if (draft.reminders.length) {
        return draft.reminders;
    }

    if (task.dueAt !== null && !task.allDay) {
        return [{ kind: 'ABSOLUTE', timeAt: task.dueAt }];
    }

    return [];
}

function compareReminders(left: Reminder, right: Reminder): number {
    const leftRank = left.timeAt !== null ? 0 : 1;
    const rightRank = right.timeAt !== null ? 0 : 1;
    if (leftRank !== rightRank) return leftRank - rightRank;
    if (left.timeAt !== right.timeAt) return (left.timeAt ?? 0) - (right.timeAt ?? 0);
    if (left.offsetMinutes !== right.offsetMinutes) return (left.offsetMinutes ?? 0) - (right.offsetMinutes ?? 0);
    return left.createdAt - right.createdAt;
}

function matchesFilters(task: Task, filters: Set<SearchFilter>, reminderTaskIds: Set<string>): boolean {
    if (!filters.size || filters.has('ALL')) {
        return true;
    }

    const now = Date.now();
    const todayStart = startOfDay(now).getTime();
    const todayEnd = endOfDay(now).getTime();
    const weekInterval = resolveWeekInterval(now);

    return Array.from(filters).every(filter => {
        switch (filter) {
            case 'OVERDUE':
                return task.dueAt !== null && task.dueAt < todayStart;
            case 'TODAY':
                return task.dueAt !== null && isWithinInterval(task.dueAt, { start: todayStart, end: todayEnd });
            case 'THIS_WEEK':
                return task.dueAt !== null && isWithinInterval(task.dueAt, weekInterval);
            case 'HIGH_PRIORITY':
                return HIGH_PRIORITIES.includes(task.priority);
            case 'INBOX':
                return task.projectId === null;
            case 'NO_DUE':
                return task.dueAt === null;
            case 'HAS_DEADLINE':
                return task.deadlineAt !== null;
            case 'NO_DEADLINE':
                return task.deadlineAt === null;
            case 'RECURRING':
                return task.recurringRule !== null || task.deadlineRecurringRule !== null;
            case 'HAS_REMINDER':
                return reminderTaskIds.has(task.id);
            case 'ALL':
            default:
                return true;
        }
    });
}
