import type { Project, Section, Task, Reminder, Location, SyncPayload } from '../types/sync';

type Syncable = Project | Section | Task | Reminder | Location;

/**
 * The Sync Engine is responsible for merging two SyncPayloads into one.
 * It matches the logic in the Android SyncManager perfectly.
 */
export class SyncEngine {
    private readonly nowProvider: () => number;
    private readonly source: string;

    constructor(nowProvider: () => number = () => Date.now(), source: string = 'web') {
        this.nowProvider = nowProvider;
        this.source = source;
    }

    mergePayloads(local: SyncPayload, remote: SyncPayload): SyncPayload {
        const mergedProjects = this.mergeEntities(local.projects, remote.projects);
        const mergedLocations = this.mergeEntities(local.locations, remote.locations);

        const mergedSections = this.repairSections(
            this.mergeEntities(local.sections, remote.sections),
            mergedProjects
        );

        const mergedTasks = this.repairTasks(
            this.mergeEntities(local.tasks, remote.tasks),
            mergedProjects,
            mergedSections,
            mergedLocations
        );

        const mergedReminders = this.repairReminders(
            this.mergeEntities(local.reminders, remote.reminders),
            mergedTasks,
            mergedLocations
        );

        return {
            schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
            exportedAt: this.nowProvider(),
            deviceId: local.deviceId || remote.deviceId,
            payloadId: crypto.randomUUID(),
            source: this.source,
            projects: mergedProjects.sort((a, b) => a.id.localeCompare(b.id)),
            sections: mergedSections.sort((a, b) => a.id.localeCompare(b.id)),
            tasks: mergedTasks.sort((a, b) => a.id.localeCompare(b.id)),
            reminders: mergedReminders.sort((a, b) => a.id.localeCompare(b.id)),
            locations: mergedLocations.sort((a, b) => a.id.localeCompare(b.id)),
        };
    }

    private repairSections(sections: Section[], projects: Project[]): Section[] {
        const liveProjectIds = new Set(projects.filter(p => !p.deletedAt).map(p => p.id));
        const now = this.nowProvider();

        return sections.map(section => {
            if (section.deletedAt || liveProjectIds.has(section.projectId)) {
                return section;
            }
            return {
                ...section,
                deletedAt: now,
                updatedAt: Math.max(section.updatedAt, now)
            };
        });
    }

    private repairTasks(tasks: Task[], projects: Project[], sections: Section[], locations: Location[]): Task[] {
        const liveProjectIds = new Set(projects.filter(p => !p.deletedAt).map(p => p.id));
        const liveSections = new Map(sections.filter(s => !s.deletedAt).map(s => [s.id, s]));
        const liveLocationIds = new Set(locations.map(l => l.id));
        const liveTaskIds = new Set(tasks.filter(t => !t.deletedAt).map(t => t.id));
        const now = this.nowProvider();

        return tasks.map(task => {
            if (task.deletedAt) return task;

            let changed = false;
            const normalized = { ...task };

            if (normalized.projectId && !liveProjectIds.has(normalized.projectId)) {
                normalized.projectId = null;
                normalized.sectionId = null;
                changed = true;
            }

            const section = normalized.sectionId ? liveSections.get(normalized.sectionId) : null;
            if (normalized.sectionId && (!section || section.projectId !== normalized.projectId)) {
                normalized.sectionId = null;
                changed = true;
            }

            if (normalized.parentTaskId && (normalized.parentTaskId === normalized.id || !liveTaskIds.has(normalized.parentTaskId))) {
                normalized.parentTaskId = null;
                changed = true;
            }

            if (normalized.locationId && !liveLocationIds.has(normalized.locationId)) {
                normalized.locationId = null;
                normalized.locationTriggerType = null;
                changed = true;
            }

            if (changed) {
                normalized.updatedAt = Math.max(normalized.updatedAt, now);
            }
            return normalized;
        });
    }

    private repairReminders(reminders: Reminder[], tasks: Task[], locations: Location[]): Reminder[] {
        const liveTasks = new Map(tasks.filter(t => !t.deletedAt).map(t => [t.id, t]));
        const liveLocationIds = new Set(locations.map(l => l.id));
        const now = this.nowProvider();

        const result: Reminder[] = [];
        for (const reminder of reminders) {
            const task = liveTasks.get(reminder.taskId);
            if (!task || task.status === 'COMPLETED' || task.status === 'ARCHIVED') {
                continue; // Drop reminders for missing/done tasks
            }

            if (reminder.locationId && !liveLocationIds.has(reminder.locationId)) {
                if (reminder.type === 'LOCATION') {
                    continue; // Drop location reminders if location is gone
                } else {
                    result.push({
                        ...reminder,
                        locationId: null,
                        locationTriggerType: null,
                        updatedAt: Math.max(reminder.updatedAt, now)
                    });
                }
            } else {
                result.push(reminder);
            }
        }
        return result;
    }

    private mergeEntities<T extends Syncable>(local: T[], remote: T[]): T[] {
        const mergedMap = new Map<string, T>();
        [...local, ...remote].forEach(item => {
            const existing = mergedMap.get(item.id);
            if (!existing) {
                mergedMap.set(item.id, item);
            } else {
                mergedMap.set(item.id, this.chooseWinner(existing, item));
            }
        });
        return Array.from(mergedMap.values());
    }

    private chooseWinner<T extends Syncable>(left: T, right: T): T {
        if (left.updatedAt !== right.updatedAt) {
            return left.updatedAt > right.updatedAt ? left : right;
        }

        const leftDeleted = !!left.deletedAt;
        const rightDeleted = !!right.deletedAt;
        if (leftDeleted !== rightDeleted) {
            return leftDeleted ? left : right;
        }

        // Stable tie-break using JSON string comparison
        return JSON.stringify(left) >= JSON.stringify(right) ? left : right;
    }
}
