export const MAX_SYNC_BODY_BYTES = 2 * 1024 * 1024;

const MAX_ENTITY_COUNT = 20_000;
const MAX_COLLECTION_COUNT = 10_000;
const MAX_ID_LENGTH = 256;
const MAX_SHORT_TEXT_LENGTH = 1_024;
const MAX_LONG_TEXT_LENGTH = 64 * 1024;

const priorities = ['P1', 'P2', 'P3', 'P4'];
const taskStatuses = ['OPEN', 'COMPLETED', 'ARCHIVED'];
const reminderTypes = ['TIME', 'LOCATION'];
const triggerTypes = ['ARRIVE', 'LEAVE'];
const viewPreferences = ['LIST', 'BOARD'];

export function validateSyncPayload(input) {
  const payload = object(input, 'Sync payload');
  integer(payload.schemaVersion, 'Sync payload.schemaVersion', { min: 1, max: 1 });
  number(payload.exportedAt, 'Sync payload.exportedAt');
  string(payload.deviceId, 'Sync payload.deviceId', MAX_ID_LENGTH);
  string(payload.payloadId, 'Sync payload.payloadId', MAX_ID_LENGTH);
  string(payload.source, 'Sync payload.source', MAX_SHORT_TEXT_LENGTH);

  const projects = collection(payload.projects, 'projects');
  const sections = collection(payload.sections, 'sections');
  const tasks = collection(payload.tasks, 'tasks');
  const reminders = collection(payload.reminders, 'reminders');
  const locations = collection(payload.locations, 'locations');
  const entityCount = projects.length + sections.length + tasks.length + reminders.length + locations.length;
  if (entityCount > MAX_ENTITY_COUNT) invalid(`Sync payload contains more than ${MAX_ENTITY_COUNT} entities.`);

  projects.forEach((entry, index) => validateProject(entry, `projects[${index}]`));
  sections.forEach((entry, index) => validateSection(entry, `sections[${index}]`));
  tasks.forEach((entry, index) => validateTask(entry, `tasks[${index}]`));
  reminders.forEach((entry, index) => validateReminder(entry, `reminders[${index}]`));
  locations.forEach((entry, index) => validateLocation(entry, `locations[${index}]`));
  return input;
}

function validateProject(input, label) {
  const value = metadata(input, label);
  string(value.name, `${label}.name`, MAX_SHORT_TEXT_LENGTH);
  string(value.color, `${label}.color`, MAX_SHORT_TEXT_LENGTH);
  boolean(value.favorite, `${label}.favorite`);
  number(value.order, `${label}.order`);
  boolean(value.archived, `${label}.archived`);
  nullableEnum(value.viewPreference, `${label}.viewPreference`, viewPreferences);
}

function validateSection(input, label) {
  const value = metadata(input, label);
  string(value.projectId, `${label}.projectId`, MAX_ID_LENGTH);
  string(value.name, `${label}.name`, MAX_SHORT_TEXT_LENGTH);
  number(value.order, `${label}.order`);
}

function validateTask(input, label) {
  const value = metadata(input, label);
  string(value.title, `${label}.title`, MAX_SHORT_TEXT_LENGTH);
  string(value.description, `${label}.description`, MAX_LONG_TEXT_LENGTH);
  nullableString(value.projectId, `${label}.projectId`, MAX_ID_LENGTH);
  nullableString(value.sectionId, `${label}.sectionId`, MAX_ID_LENGTH);
  enumeration(value.priority, `${label}.priority`, priorities);
  nullableNumber(value.dueAt, `${label}.dueAt`);
  boolean(value.allDay, `${label}.allDay`);
  nullableNumber(value.deadlineAt ?? null, `${label}.deadlineAt`);
  optionalBoolean(value.deadlineAllDay, `${label}.deadlineAllDay`);
  nullableString(value.recurringRule ?? null, `${label}.recurringRule`, MAX_SHORT_TEXT_LENGTH);
  nullableString(value.deadlineRecurringRule ?? null, `${label}.deadlineRecurringRule`, MAX_SHORT_TEXT_LENGTH);
  enumeration(value.status, `${label}.status`, taskStatuses);
  nullableNumber(value.completedAt, `${label}.completedAt`);
  nullableString(value.parentTaskId, `${label}.parentTaskId`, MAX_ID_LENGTH);
  nullableString(value.locationId, `${label}.locationId`, MAX_ID_LENGTH);
  nullableEnum(value.locationTriggerType, `${label}.locationTriggerType`, triggerTypes);
  number(value.order, `${label}.order`);
}

function validateReminder(input, label) {
  const value = metadata(input, label);
  string(value.taskId, `${label}.taskId`, MAX_ID_LENGTH);
  enumeration(value.type, `${label}.type`, reminderTypes);
  nullableNumber(value.timeAt, `${label}.timeAt`);
  nullableNumber(value.offsetMinutes, `${label}.offsetMinutes`);
  nullableString(value.locationId, `${label}.locationId`, MAX_ID_LENGTH);
  nullableEnum(value.locationTriggerType, `${label}.locationTriggerType`, triggerTypes);
  boolean(value.enabled, `${label}.enabled`);
  boolean(value.ephemeral, `${label}.ephemeral`);
}

function validateLocation(input, label) {
  const value = metadata(input, label);
  string(value.label, `${label}.label`, MAX_SHORT_TEXT_LENGTH);
  string(value.address, `${label}.address`, MAX_LONG_TEXT_LENGTH);
  number(value.lat, `${label}.lat`);
  number(value.lng, `${label}.lng`);
  number(value.radiusMeters, `${label}.radiusMeters`);
}

function metadata(input, label) {
  const value = object(input, label);
  string(value.id, `${label}.id`, MAX_ID_LENGTH);
  number(value.createdAt, `${label}.createdAt`);
  number(value.updatedAt, `${label}.updatedAt`);
  nullableNumber(value.deletedAt ?? null, `${label}.deletedAt`);
  return value;
}

function collection(value, label) {
  if (!Array.isArray(value)) invalid(`Sync payload.${label} must be an array.`);
  if (value.length > MAX_COLLECTION_COUNT) {
    invalid(`Sync payload.${label} contains more than ${MAX_COLLECTION_COUNT} entries.`);
  }
  return value;
}

function object(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid(`${label} must be an object.`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) invalid(`${label} must be a plain object.`);
  return value;
}

function string(value, label, maxLength) {
  if (typeof value !== 'string') invalid(`${label} must be a string.`);
  if (value.length > maxLength) invalid(`${label} exceeds ${maxLength} characters.`);
}

function nullableString(value, label, maxLength) {
  if (value !== null) string(value, label, maxLength);
}

function number(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(`${label} must be a finite number.`);
}

function nullableNumber(value, label) {
  if (value !== null) number(value, label);
}

function integer(value, label, { min, max }) {
  if (!Number.isInteger(value) || value < min || value > max) invalid(`${label} must be ${min}.`);
}

function boolean(value, label) {
  if (typeof value !== 'boolean') invalid(`${label} must be a boolean.`);
}

function optionalBoolean(value, label) {
  if (value !== undefined && value !== null) boolean(value, label);
}

function enumeration(value, label, allowed) {
  if (typeof value !== 'string' || !allowed.includes(value)) invalid(`${label} is invalid.`);
}

function nullableEnum(value, label, allowed) {
  if (value !== null) enumeration(value, label, allowed);
}

function invalid(message) {
  const error = new Error(message);
  error.statusCode = 400;
  throw error;
}
