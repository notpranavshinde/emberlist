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
        .filter(task => task.projectId === null)
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
        .filter(task =>
            task.projectId === projectId &&
            !task.deletedAt &&
            (includeArchived || task.status !== 'ARCHIVED')
        )
        .sort(compareTasks);
}

export function getCompletedProjectTasks(payload: SyncPayload, projectId: string): Task[] {
    return getCompletedTasks(payload)
        .filter(task => task.projectId === projectId)
        .sort(compareTasks);
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

    return getOpenTasks(payload)
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
        order: nextTaskOrder(payload, projectId, sectionId),
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

export function toggleTaskCompletion(payload: SyncPayload, taskId: string): SyncPayload {
    return updateTask(payload, taskId, task => {
        const isCompleted = task.status === 'COMPLETED';
        return {
            ...task,
            status: (isCompleted ? 'OPEN' : 'COMPLETED') as TaskStatus,
            completedAt: isCompleted ? null : Date.now(),
        };
    });
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

export function createProject(payload: SyncPayload, name: string): SyncPayload {
    const now = Date.now();
    const project: Project = {
        id: crypto.randomUUID(),
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

function nextProjectOrder(payload: SyncPayload): number {
    return payload.projects.reduce((max, project) => Math.max(max, project.order), -1) + 1;
}

function nextSectionOrder(payload: SyncPayload, projectId: string): number {
    return payload.sections
        .filter(section => section.projectId === projectId && !section.deletedAt)
        .reduce((max, section) => Math.max(max, section.order), -1) + 1;
}

function nextTaskOrder(payload: SyncPayload, projectId: string | null, sectionId: string | null): number {
    return payload.tasks
        .filter(task => task.projectId === projectId && task.sectionId === sectionId && !task.deletedAt)
        .reduce((max, task) => Math.max(max, task.order), -1) + 1;
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

function matchesFilters(task: Task, filters: Set<SearchFilter>, reminderTaskIds: Set<string>): boolean {
    if (!filters.size || filters.has('ALL')) {
        return true;
    }

    const now = Date.now();
    const todayStart = startOfDay(now).getTime();
    const todayEnd = endOfDay(now).getTime();
    const weekEnd = endOfDay(addDays(now, 6)).getTime();

    return Array.from(filters).every(filter => {
        switch (filter) {
            case 'OVERDUE':
                return task.dueAt !== null && task.dueAt < todayStart;
            case 'TODAY':
                return task.dueAt !== null && isWithinInterval(task.dueAt, { start: todayStart, end: todayEnd });
            case 'THIS_WEEK':
                return task.dueAt !== null && isWithinInterval(task.dueAt, { start: todayStart, end: weekEnd });
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
