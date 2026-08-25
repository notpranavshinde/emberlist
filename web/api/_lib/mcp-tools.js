import { TZDate } from '@date-fns/tz';
import { z } from 'zod';
import { selectTasks } from './mcp-workspace.js';

const id = z.string().min(1).max(256)
  .describe('Opaque cross-client ID. Preserve it exactly; do not infer or normalize its format, including recurring successor IDs.');
const mutationId = z.string().min(8).max(200).describe('Unique ID used to safely replay this mutation.');
const timeZone = z.string().max(100).optional().describe('IANA time zone override.');
const calendarOrTimed = z.string().max(100).nullable().optional()
  .describe('YYYY-MM-DD for an all-day value, or RFC3339 with an explicit UTC offset for a timed value.');
const timedValue = z.string().max(100).refine(isTimedString,
  'Must be RFC3339 with an explicit UTC offset.').nullable().optional();
const priority = z.enum(['P1', 'P2', 'P3', 'P4']);
const taskStatus = z.enum(['OPEN', 'COMPLETED', 'ARCHIVED']);
const triggerType = z.enum(['ARRIVE', 'LEAVE']);
const writeResponse = z.object({
  entity: z.union([z.record(z.string(), z.unknown()), z.array(z.record(z.string(), z.unknown())), z.null()]),
  revision: z.string().min(1),
  replayed: z.boolean(),
});

const taskFields = {
  title: z.string().min(1).max(1024).optional(), description: z.string().max(65536).optional(),
  projectId: id.nullable().optional(), sectionId: id.nullable().optional(), priority: priority.optional(),
  dueAt: calendarOrTimed, allDay: z.boolean().optional(), deadlineAt: calendarOrTimed,
  deadlineAllDay: z.boolean().optional(), recurringRule: z.string().max(1024).nullable().optional(),
  deadlineRecurringRule: z.string().max(1024).nullable().optional(), parentTaskId: id.nullable().optional(),
  locationId: id.nullable().optional(), locationTriggerType: triggerType.nullable().optional(), order: z.number().finite().optional(),
};

export function registerMcpTools(server, store, defaultTimeZone = 'UTC') {
  readTool(server, 'list_tasks', 'List tasks with cursor pagination. Defaults to 20 open, non-deleted tasks ordered by due date; set status or includeDeleted explicitly to access completed, archived, or deleted history. IDs are opaque and must be echoed exactly.', z.object({
    query: z.string().max(1024).optional(), status: taskStatus.optional(), projectId: id.nullable().optional(),
    sectionId: id.nullable().optional(), parentTaskId: id.nullable().optional(), includeDeleted: z.boolean().optional(),
    cursor: z.string().optional(), limit: z.number().int().min(1).max(100).default(20),
  }), async args => {
    const { payload, revision } = await store.read();
    const filters = args.status === undefined && !args.includeDeleted
      ? { ...args, status: 'OPEN' }
      : args;
    const tasks = selectTasks(payload, filters);
    return page(tasks, args, revision);
  });
  readTool(server, 'get_task', 'Get one task and its reminders and direct subtasks.', z.object({ taskId: id }), async ({ taskId }) => {
    const { payload, revision } = await store.read();
    const task = payload.tasks.find(item => item.id === taskId && !item.deletedAt);
    if (!task) notFound('Task', taskId);
    return { task, reminders: payload.reminders.filter(item => item.taskId === taskId && !item.deletedAt),
      subtasks: payload.tasks.filter(item => item.parentTaskId === taskId && !item.deletedAt), revision };
  });
  readTool(server, 'list_projects', 'List projects with their sections for name and ID resolution.', z.object({
    includeArchived: z.boolean().optional(), includeDeleted: z.boolean().optional(), cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }), async args => {
    const { payload, revision } = await store.read();
    const projects = payload.projects.filter(item => (args.includeDeleted || !item.deletedAt)
      && (args.includeArchived || !item.archived)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    const value = page(projects, args, revision);
    return { ...value, items: value.items.map(project => ({ ...project,
      sections: payload.sections.filter(section => section.projectId === project.id
        && (args.includeDeleted || !section.deletedAt)).sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)) })) };
  });
  collectionReadTool(server, store, 'list_reminders', 'reminders', 'List reminders.', z.object({
    taskId: id.optional(), includeDeleted: z.boolean().optional(), cursor: z.string().optional(),
    limit: z.number().int().min(1).max(100).default(50),
  }), (item, args) => (args.includeDeleted || !item.deletedAt) && (!args.taskId || item.taskId === args.taskId));
  collectionReadTool(server, store, 'list_locations', 'locations', 'List saved locations.', z.object({
    cursor: z.string().optional(), limit: z.number().int().min(1).max(100).default(50),
  }), () => true);
  readTool(server, 'read_workspace_payload', 'Read the complete versioned sync payload and guarded replacement revision.', z.object({}), async () => {
    const { payload, revision } = await store.read(); return { payload, revision };
  });

  writeTool(server, store, 'create_task', 'Create a structured task.', z.object({
    mutationId, timeZone, title: z.string().min(1).max(1024), description: z.string().max(65536).optional(),
    projectId: id.nullable().optional(), sectionId: id.nullable().optional(), priority: priority.optional(),
    dueAt: calendarOrTimed, allDay: z.boolean().optional(), deadlineAt: calendarOrTimed, deadlineAllDay: z.boolean().optional(),
    recurringRule: z.string().max(1024).nullable().optional(), deadlineRecurringRule: z.string().max(1024).nullable().optional(),
    parentTaskId: id.nullable().optional(), locationId: id.nullable().optional(),
    locationTriggerType: triggerType.nullable().optional(), order: z.number().finite().optional(),
  }), dateArgs(defaultTimeZone));
  writeTool(server, store, 'update_task', 'Update selected editable fields on a task.', z.object({
    mutationId, timeZone, taskId: id, patch: z.object(taskFields).strict(),
  }), datePatchArgs(defaultTimeZone));
  writeTool(server, store, 'set_task_status', 'Complete, reopen, or archive a task. Completion creates recurring successors.', z.object({
    mutationId, timeZone, taskId: id, status: taskStatus,
  }), args => ({ ...args, timeZone: resolveTimeZone(args.timeZone, defaultTimeZone) }));
  writeTool(server, store, 'move_task', 'Move or reparent a task.', z.object({
    mutationId, taskId: id, projectId: id.nullable().optional(), sectionId: id.nullable().optional(),
    parentTaskId: id.nullable().optional(), order: z.number().finite().optional(),
  }));
  writeTool(server, store, 'bulk_update_tasks', 'Apply common fields to up to 500 tasks.', z.object({
    mutationId, timeZone, taskIds: z.array(id).min(1).max(500), patch: z.object({
      projectId: id.nullable().optional(), sectionId: id.nullable().optional(), priority: priority.optional(),
      dueAt: calendarOrTimed, allDay: z.boolean().optional(), deadlineAt: calendarOrTimed,
      deadlineAllDay: z.boolean().optional(), locationId: id.nullable().optional(),
      locationTriggerType: triggerType.nullable().optional(),
    }).strict(),
  }), datePatchArgs(defaultTimeZone));
  writeTool(server, store, 'delete_tasks', 'Delete only the specified tasks using sync tombstones; normal workspace repair detaches surviving subtasks.', z.object({
    mutationId, taskIds: z.array(id).min(1).max(500),
  }), undefined, { destructiveHint: true });

  writeTool(server, store, 'create_project', 'Create a project.', z.object({ mutationId, name: z.string().min(1).max(1024),
    color: z.string().max(1024).optional(), favorite: z.boolean().optional(), order: z.number().finite().optional(),
    archived: z.boolean().optional(), viewPreference: z.enum(['LIST', 'BOARD']).nullable().optional() }));
  writeTool(server, store, 'update_project', 'Update a project.', z.object({ mutationId, projectId: id,
    patch: z.object({ name: z.string().min(1).max(1024).optional(), color: z.string().max(1024).optional(),
      favorite: z.boolean().optional(), order: z.number().finite().optional(), archived: z.boolean().optional(),
      viewPreference: z.enum(['LIST', 'BOARD']).nullable().optional() }).strict() }));
  writeTool(server, store, 'delete_project', 'Delete a project and its contained tasks and sections using tombstones.',
    z.object({ mutationId, projectId: id }), undefined, { destructiveHint: true });
  writeTool(server, store, 'create_section', 'Create a section in a project.', z.object({ mutationId, projectId: id,
    name: z.string().min(1).max(1024), order: z.number().finite().optional() }));
  writeTool(server, store, 'update_section', 'Update a section.', z.object({ mutationId, sectionId: id,
    patch: z.object({ name: z.string().min(1).max(1024).optional(), order: z.number().finite().optional() }).strict() }));
  writeTool(server, store, 'delete_section', 'Delete a section and move its tasks to the project root.',
    z.object({ mutationId, sectionId: id }), undefined, { destructiveHint: true });

  writeTool(server, store, 'create_reminder', 'Create a time or location reminder.', z.object({
    mutationId, timeZone, taskId: id, type: z.enum(['TIME', 'LOCATION']), timeAt: timedValue,
    offsetMinutes: z.number().finite().nullable().optional(), locationId: id.nullable().optional(),
    locationTriggerType: triggerType.nullable().optional(), enabled: z.boolean().optional(), ephemeral: z.boolean().optional(),
  }), dateArgs(defaultTimeZone));
  writeTool(server, store, 'update_reminder', 'Update a reminder.', z.object({ mutationId, timeZone, reminderId: id,
    patch: z.object({ type: z.enum(['TIME', 'LOCATION']).optional(), timeAt: timedValue,
      offsetMinutes: z.number().finite().nullable().optional(), locationId: id.nullable().optional(),
      locationTriggerType: triggerType.nullable().optional(), enabled: z.boolean().optional(), ephemeral: z.boolean().optional() }).strict(),
  }), datePatchArgs(defaultTimeZone));
  writeTool(server, store, 'delete_reminder', 'Delete a reminder permanently.', z.object({ mutationId, reminderId: id }),
    undefined, { destructiveHint: true });
  writeTool(server, store, 'create_location', 'Create a saved location from explicit coordinates.', z.object({ mutationId,
    label: z.string().min(1).max(1024), address: z.string().min(1).max(65536), lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180), radiusMeters: z.number().positive().max(100000).optional() }));
  writeTool(server, store, 'update_location', 'Update a saved location.', z.object({ mutationId, locationId: id,
    patch: z.object({ label: z.string().min(1).max(1024).optional(), address: z.string().min(1).max(65536).optional(),
      lat: z.number().min(-90).max(90).optional(), lng: z.number().min(-180).max(180).optional(),
      radiusMeters: z.number().positive().max(100000).optional() }).strict() }));
  writeTool(server, store, 'delete_location', 'Delete a saved location and remove dependent location reminders.',
    z.object({ mutationId, locationId: id }), undefined, { destructiveHint: true });

  server.registerTool('merge_workspace_payload', {
    description: 'Merge a validated sync payload using Emberlist conflict resolution.',
    inputSchema: z.object({ mutationId, payload: z.unknown() }),
    outputSchema: writeResponse,
    annotations: writeAnnotations(),
  }, async ({ mutationId: mid, payload }) => result(await store.merge(payload, mid)));
  server.registerTool('replace_workspace_payload', {
    description: 'Exactly replace the workspace. Use only when the user explicitly requests raw replacement.',
    inputSchema: z.object({ mutationId, revision: z.string().min(1), payload: z.unknown() }),
    outputSchema: writeResponse,
    annotations: writeAnnotations({ destructiveHint: true }),
  }, async ({ mutationId: mid, revision, payload }) => result(await store.replaceExact(payload, revision, mid)));
}

function readTool(server, name, description, schema, callback) {
  server.registerTool(name, { description, inputSchema: schema,
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } },
  async args => result(await callback(args)));
}

function collectionReadTool(server, store, name, collection, description, schema, filter) {
  readTool(server, name, description, schema, async args => {
    const { payload, revision } = await store.read();
    return page(payload[collection].filter(item => filter(item, args)).sort((a, b) => a.id.localeCompare(b.id)), args, revision);
  });
}

function writeTool(server, store, name, description, schema, normalize = value => value, annotations = {}) {
  server.registerTool(name, { description: `${description} Returns the affected entity, committed revision, and replay status.`,
    inputSchema: schema, outputSchema: writeResponse, annotations: writeAnnotations(annotations) },
    async args => result(await store.semantic(name, (normalize ?? (value => value))(args))));
}

function writeAnnotations(overrides = {}) {
  return { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false, ...overrides };
}

function result(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value };
}

function page(items, args, revision) {
  const offset = decodeCursor(args.cursor);
  const values = items.slice(offset, offset + args.limit);
  return { items: values, nextCursor: offset + values.length < items.length ? encodeCursor(offset + values.length) : null, revision };
}

function encodeCursor(offset) { return Buffer.from(String(offset)).toString('base64url'); }
function decodeCursor(cursor) {
  if (!cursor) return 0;
  const offset = Number(Buffer.from(cursor, 'base64url').toString('utf8'));
  if (!Number.isInteger(offset) || offset < 0) { const error = new Error('cursor is invalid.'); error.statusCode = 400; throw error; }
  return offset;
}

function dateArgs(defaultTimeZone) {
  return args => normalizeDates(args, resolveTimeZone(args.timeZone, defaultTimeZone));
}
function datePatchArgs(defaultTimeZone) {
  return args => {
    const zone = resolveTimeZone(args.timeZone, defaultTimeZone);
    return { ...args, timeZone: zone, patch: normalizeDates(args.patch, zone) };
  };
}
function normalizeDates(value, zone) {
  const next = { ...value };
  [['dueAt', 'allDay'], ['deadlineAt', 'deadlineAllDay']].forEach(([key, flag]) => {
    if (!(key in next) || next[key] === null || next[key] === undefined) return;
    const calendar = isCalendarDate(next[key]);
    if (flag in next && next[flag] !== calendar) {
      const error = new Error(`${flag} contradicts the ${calendar ? 'calendar-date' : 'timed'} ${key} value.`);
      error.statusCode = 400; throw error;
    }
    next[flag] = calendar;
    next[key] = parseDate(next[key], zone);
  });
  if ('timeAt' in next) next.timeAt = parseTimedDate(next.timeAt);
  return next;
}
function parseDate(value, zone) {
  if (value === null || value === undefined) return value;
  if (isCalendarDate(value)) {
    const [year, month, day] = value.split('-').map(Number);
    const date = new TZDate(year, month - 1, day, 0, 0, 0, 0, zone);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) invalidDate();
    return date.getTime();
  }
  return parseTimedDate(value);
}
function parseTimedDate(value) {
  if (value === null || value === undefined) return value;
  if (!isTimedString(value)) invalidDate();
  const parsed = Date.parse(value); if (Number.isNaN(parsed)) invalidDate(); return parsed;
}
function isCalendarDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value); }
function isTimedString(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(value) && !Number.isNaN(Date.parse(value)); }
function resolveTimeZone(override, fallback) {
  const zone = override ?? fallback ?? 'UTC';
  try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); } catch { const error = new Error('timeZone must be a valid IANA time zone.'); error.statusCode = 400; throw error; }
  return zone;
}
function invalidDate() { const error = new Error('Date values must be YYYY-MM-DD or RFC3339 with an explicit offset.'); error.statusCode = 400; throw error; }
function notFound(label, value) { const error = new Error(`${label} ${value} was not found.`); error.statusCode = 404; throw error; }
