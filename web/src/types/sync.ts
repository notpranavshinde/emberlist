export type Priority = 'P1' | 'P2' | 'P3' | 'P4';

export type TaskStatus = 'OPEN' | 'COMPLETED' | 'ARCHIVED';

export type ReminderType = 'TIME' | 'LOCATION';

export type LocationTriggerType = 'ARRIVE' | 'LEAVE';

export interface SyncMetadata {
    createdAt: number;
    updatedAt: number;
    deletedAt?: number | null; // Tombstone for deletions
}

export interface Project extends SyncMetadata {
    id: string;
    name: string;
    color: string;
    favorite: boolean;
    order: number;
    archived: boolean;
    viewPreference: 'LIST' | 'BOARD' | null;
}

export interface Section extends SyncMetadata {
    id: string;
    projectId: string;
    name: string;
    order: number;
}

export interface Task extends SyncMetadata {
    id: string;
    title: string;
    description: string;
    projectId: string | null;
    sectionId: string | null;
    priority: Priority;
    dueAt: number | null;
    allDay: boolean;
    deadlineAt?: number | null;
    deadlineAllDay?: boolean;
    recurringRule?: string | null;
    deadlineRecurringRule?: string | null;
    status: TaskStatus;
    completedAt: number | null;
    parentTaskId: string | null;
    locationId: string | null;
    locationTriggerType: LocationTriggerType | null;
    order: number;
}

export interface Location extends SyncMetadata {
    id: string;
    label: string;
    address: string;
    lat: number;
    lng: number;
    radiusMeters: number;
}

export interface Reminder extends SyncMetadata {
    id: string;
    taskId: string;
    type: ReminderType;
    timeAt: number | null;
    offsetMinutes: number | null;
    locationId: string | null;
    locationTriggerType: LocationTriggerType | null;
    enabled: boolean;
    ephemeral: boolean;
}

export interface SyncPayload {
    schemaVersion: number;
    exportedAt: number;
    deviceId: string;
    payloadId: string;
    source: string;
    projects: Project[];
    sections: Section[];
    tasks: Task[];
    reminders: Reminder[];
    locations: Location[];
}
