import type {
    Location,
    LocationTriggerType,
    Priority,
    Project,
    Reminder,
    ReminderType,
    Section,
    SyncPayload,
    Task,
    TaskStatus,
} from '../types/sync';

export const CURRENT_SYNC_SCHEMA_VERSION = 1;

type PlainObject = Record<string, unknown>;
type EntityMetadata = PlainObject & {
    id: string;
    createdAt: number;
    updatedAt: number;
    deletedAt?: number | null;
};

const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const TASK_STATUSES: TaskStatus[] = ['OPEN', 'COMPLETED', 'ARCHIVED'];
const REMINDER_TYPES: ReminderType[] = ['TIME', 'LOCATION'];
const LOCATION_TRIGGER_TYPES: LocationTriggerType[] = ['ARRIVE', 'LEAVE'];
const PROJECT_VIEW_PREFERENCES = ['LIST', 'BOARD'] as const;

export function createEmptySyncPayload(deviceId: string = crypto.randomUUID()): SyncPayload {
    return {
        schemaVersion: CURRENT_SYNC_SCHEMA_VERSION,
        exportedAt: 0,
        deviceId,
        payloadId: crypto.randomUUID(),
        source: 'web',
        projects: [],
        sections: [],
        tasks: [],
        reminders: [],
        locations: [],
    };
}

export function ensureSyncPayload(input: unknown, label: string): SyncPayload {
    if (!isObject(input)) {
        throw new Error(`${label} is invalid: expected a JSON object.`);
    }

    return {
        schemaVersion: requireNumber(input.schemaVersion, `${label}.schemaVersion`),
        exportedAt: requireNumber(input.exportedAt, `${label}.exportedAt`),
        deviceId: requireString(input.deviceId, `${label}.deviceId`),
        payloadId: requireString(input.payloadId, `${label}.payloadId`),
        source: requireString(input.source, `${label}.source`),
        projects: requireArray(input.projects, `${label}.projects`).map((value, index) =>
            validateProject(value, `${label}.projects[${index}]`)
        ),
        sections: requireArray(input.sections, `${label}.sections`).map((value, index) =>
            validateSection(value, `${label}.sections[${index}]`)
        ),
        tasks: requireArray(input.tasks, `${label}.tasks`).map((value, index) =>
            validateTask(value, `${label}.tasks[${index}]`)
        ),
        reminders: requireArray(input.reminders, `${label}.reminders`).map((value, index) =>
            validateReminder(value, `${label}.reminders[${index}]`)
        ),
        locations: requireArray(input.locations, `${label}.locations`).map((value, index) =>
            validateLocation(value, `${label}.locations[${index}]`)
        ),
    };
}

export function assertSupportedSyncPayload(payload: SyncPayload, label: string): SyncPayload {
    if (payload.schemaVersion > CURRENT_SYNC_SCHEMA_VERSION) {
        throw new Error(`${label} is from a newer app version.`);
    }
    return payload;
}

export function normalizeImportedPayload(input: unknown, label: string): SyncPayload {
    if (isObject(input) && isObject(input.sync)) {
        return assertSupportedSyncPayload(
            ensureSyncPayload(input.sync, `${label}.sync`),
            `${label}.sync`
        );
    }

    if (looksLikeLegacyBackupPayload(input)) {
        const legacy = input as PlainObject;
        return assertSupportedSyncPayload(
            ensureSyncPayload({
                schemaVersion: legacy.schemaVersion ?? CURRENT_SYNC_SCHEMA_VERSION,
                exportedAt: legacy.exportedAt ?? 0,
                deviceId: legacy.deviceId ?? '',
                payloadId: legacy.payloadId ?? '',
                source: legacy.source ?? 'android-legacy-backup',
                projects: legacy.projects ?? [],
                sections: legacy.sections ?? [],
                tasks: legacy.tasks ?? [],
                reminders: legacy.reminders ?? [],
                locations: legacy.locations ?? [],
            }, label),
            label
        );
    }

    return assertSupportedSyncPayload(ensureSyncPayload(input, label), label);
}

function validateProject(input: unknown, label: string): Project {
    const value = validateSyncMetadata(input, label);
    return {
        ...value,
        name: requireString(value.name, `${label}.name`),
        color: requireString(value.color, `${label}.color`),
        favorite: requireBoolean(value.favorite, `${label}.favorite`),
        order: requireNumber(value.order, `${label}.order`),
        archived: requireBoolean(value.archived, `${label}.archived`),
        viewPreference: requireNullableEnum(
            value.viewPreference,
            `${label}.viewPreference`,
            PROJECT_VIEW_PREFERENCES
        ),
    };
}

function looksLikeLegacyBackupPayload(input: unknown): input is PlainObject {
    if (!isObject(input) || 'sync' in input) return false;
    return Array.isArray(input.projects)
        && Array.isArray(input.sections)
        && Array.isArray(input.tasks)
        && Array.isArray(input.reminders)
        && Array.isArray(input.locations);
}

function validateSection(input: unknown, label: string): Section {
    const value = validateSyncMetadata(input, label);
    return {
        ...value,
        projectId: requireString(value.projectId, `${label}.projectId`),
        name: requireString(value.name, `${label}.name`),
        order: requireNumber(value.order, `${label}.order`),
    };
}

function validateTask(input: unknown, label: string): Task {
    const value = validateSyncMetadata(input, label);
    return {
        ...value,
        title: requireString(value.title, `${label}.title`),
        description: requireString(value.description, `${label}.description`),
        projectId: requireNullableString(value.projectId, `${label}.projectId`),
        sectionId: requireNullableString(value.sectionId, `${label}.sectionId`),
        priority: requireEnum(value.priority, `${label}.priority`, PRIORITIES),
        dueAt: requireNullableNumber(value.dueAt, `${label}.dueAt`),
        allDay: requireBoolean(value.allDay, `${label}.allDay`),
        deadlineAt: requireNullableNumber(value.deadlineAt ?? null, `${label}.deadlineAt`),
        deadlineAllDay: requireOptionalBoolean(value.deadlineAllDay, `${label}.deadlineAllDay`),
        recurringRule: requireNullableString(value.recurringRule ?? null, `${label}.recurringRule`),
        deadlineRecurringRule: requireNullableString(
            value.deadlineRecurringRule ?? null,
            `${label}.deadlineRecurringRule`
        ),
        status: requireEnum(value.status, `${label}.status`, TASK_STATUSES),
        completedAt: requireNullableNumber(value.completedAt, `${label}.completedAt`),
        parentTaskId: requireNullableString(value.parentTaskId, `${label}.parentTaskId`),
        locationId: requireNullableString(value.locationId, `${label}.locationId`),
        locationTriggerType: requireNullableEnum(
            value.locationTriggerType,
            `${label}.locationTriggerType`,
            LOCATION_TRIGGER_TYPES
        ),
        order: requireNumber(value.order, `${label}.order`),
    };
}

function validateReminder(input: unknown, label: string): Reminder {
    const value = validateSyncMetadata(input, label);
    return {
        ...value,
        taskId: requireString(value.taskId, `${label}.taskId`),
        type: requireEnum(value.type, `${label}.type`, REMINDER_TYPES),
        timeAt: requireNullableNumber(value.timeAt, `${label}.timeAt`),
        offsetMinutes: requireNullableNumber(value.offsetMinutes, `${label}.offsetMinutes`),
        locationId: requireNullableString(value.locationId, `${label}.locationId`),
        locationTriggerType: requireNullableEnum(
            value.locationTriggerType,
            `${label}.locationTriggerType`,
            LOCATION_TRIGGER_TYPES
        ),
        enabled: requireBoolean(value.enabled, `${label}.enabled`),
        ephemeral: requireBoolean(value.ephemeral, `${label}.ephemeral`),
    };
}

function validateLocation(input: unknown, label: string): Location {
    const value = validateSyncMetadata(input, label);
    return {
        ...value,
        label: requireString(value.label, `${label}.label`),
        address: requireString(value.address, `${label}.address`),
        lat: requireNumber(value.lat, `${label}.lat`),
        lng: requireNumber(value.lng, `${label}.lng`),
        radiusMeters: requireNumber(value.radiusMeters, `${label}.radiusMeters`),
    };
}

function validateSyncMetadata(input: unknown, label: string): EntityMetadata {
    if (!isObject(input)) {
        throw new Error(`${label} is invalid: expected an object.`);
    }

    return {
        ...input,
        id: requireString(input.id, `${label}.id`),
        createdAt: requireNumber(input.createdAt, `${label}.createdAt`),
        updatedAt: requireNumber(input.updatedAt, `${label}.updatedAt`),
        deletedAt: requireNullableNumber(input.deletedAt ?? null, `${label}.deletedAt`),
    };
}

function requireArray(value: unknown, label: string): unknown[] {
    if (!Array.isArray(value)) {
        throw new Error(`${label} is invalid: expected an array.`);
    }
    return value;
}

function requireString(value: unknown, label: string): string {
    if (typeof value !== 'string') {
        throw new Error(`${label} is invalid: expected a string.`);
    }
    return value;
}

function requireNullableString(value: unknown, label: string): string | null {
    if (value === null) return null;
    return requireString(value, label);
}

function requireNumber(value: unknown, label: string): number {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new Error(`${label} is invalid: expected a number.`);
    }
    return value;
}

function requireNullableNumber(value: unknown, label: string): number | null {
    if (value === null) return null;
    return requireNumber(value, label);
}

function requireBoolean(value: unknown, label: string): boolean {
    if (typeof value !== 'boolean') {
        throw new Error(`${label} is invalid: expected a boolean.`);
    }
    return value;
}

function requireOptionalBoolean(value: unknown, label: string): boolean | undefined {
    if (typeof value === 'undefined' || value === null) return undefined;
    return requireBoolean(value, label);
}

function requireEnum<T extends string>(value: unknown, label: string, allowed: readonly T[]): T {
    if (typeof value !== 'string' || !allowed.includes(value as T)) {
        throw new Error(`${label} is invalid: expected one of ${allowed.join(', ')}.`);
    }
    return value as T;
}

function requireNullableEnum<T extends string>(value: unknown, label: string, allowed: readonly T[]): T | null {
    if (value === null) return null;
    return requireEnum(value, label, allowed);
}

function isObject(value: unknown): value is PlainObject {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
}
