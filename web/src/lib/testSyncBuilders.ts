import type { Location, Project, Reminder, Section, SyncPayload, Task } from '../types/sync';
import { createEmptySyncPayload } from './syncPayload';

export const TEST_NOW = 1_710_000_000_000;

export function createTestPayload(overrides: Partial<SyncPayload> = {}): SyncPayload {
  return {
    ...createEmptySyncPayload('device-test'),
    source: 'web-test',
    ...overrides,
  };
}

export function createTestProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Project',
    color: '#ffffff',
    favorite: false,
    order: 0,
    archived: false,
    viewPreference: null,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function createTestSection(overrides: Partial<Section> = {}): Section {
  return {
    id: 'section-1',
    projectId: 'project-1',
    name: 'Section',
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function createTestTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Task',
    description: '',
    projectId: null,
    sectionId: null,
    priority: 'P4',
    dueAt: null,
    allDay: true,
    deadlineAt: null,
    deadlineAllDay: false,
    recurringRule: null,
    deadlineRecurringRule: null,
    status: 'OPEN',
    completedAt: null,
    parentTaskId: null,
    locationId: null,
    locationTriggerType: null,
    order: 0,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function createTestReminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    id: 'reminder-1',
    taskId: 'task-1',
    type: 'TIME',
    timeAt: 5,
    offsetMinutes: null,
    locationId: null,
    locationTriggerType: null,
    enabled: true,
    ephemeral: false,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}

export function createTestLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: 'location-1',
    label: 'Location',
    address: '123 Test',
    lat: 1,
    lng: 2,
    radiusMeters: 100,
    createdAt: 1,
    updatedAt: 1,
    deletedAt: null,
    ...overrides,
  };
}
