import { randomUUID } from 'node:crypto';
import { TZDate } from '@date-fns/tz';
import { MAX_SYNC_BODY_BYTES, validateSyncPayload } from './sync-payload.js';

export function emptyWorkspace() {
  return {
    schemaVersion: 1,
    exportedAt: 0,
    deviceId: 'mcp',
    payloadId: randomUUID(),
    source: 'mcp',
    projects: [], sections: [], tasks: [], reminders: [], locations: [],
  };
}

export function finalizeWorkspace(payload, now = Date.now()) {
  return { ...payload, exportedAt: now, payloadId: randomUUID(), source: 'mcp' };
}

export function validateExactWorkspace(payload) {
  validateMergeWorkspace(payload);
  for (const name of ['projects', 'sections', 'tasks', 'reminders', 'locations']) {
    const collectionIds = payload[name].map(item => item.id);
    if (new Set(collectionIds).size !== collectionIds.length) invalid(`Workspace ${name} contains duplicate IDs.`);
  }

  const liveProjects = ids(payload.projects);
  const liveSections = new Map(payload.sections.filter(live).map(item => [item.id, item]));
  const liveTasks = ids(payload.tasks);
  const liveLocations = ids(payload.locations);
  for (const section of payload.sections.filter(live)) {
    if (!liveProjects.has(section.projectId)) invalid(`Section ${section.id} refers to a missing project.`);
  }
  for (const task of payload.tasks.filter(live)) {
    if (task.projectId && !liveProjects.has(task.projectId)) invalid(`Task ${task.id} refers to a missing project.`);
    const section = task.sectionId ? liveSections.get(task.sectionId) : null;
    if (task.sectionId && (!section || section.projectId !== task.projectId)) invalid(`Task ${task.id} refers to an invalid section.`);
    if (task.parentTaskId && (!liveTasks.has(task.parentTaskId) || hasParentCycle(task, payload.tasks))) invalid(`Task ${task.id} has an invalid parent.`);
    if (task.locationId && !liveLocations.has(task.locationId)) invalid(`Task ${task.id} refers to a missing location.`);
  }
  for (const reminder of payload.reminders.filter(live)) {
    if (!liveTasks.has(reminder.taskId)) invalid(`Reminder ${reminder.id} refers to a missing task.`);
    if (reminder.locationId && !liveLocations.has(reminder.locationId)) invalid(`Reminder ${reminder.id} refers to a missing location.`);
    checkReminder(payload, reminder);
  }
  return payload;
}

export function validateMergeWorkspace(payload) {
  const bytes = Buffer.byteLength(JSON.stringify(payload), 'utf8');
  if (bytes > MAX_SYNC_BODY_BYTES) invalid(`Workspace payload exceeds the ${MAX_SYNC_BODY_BYTES}-byte limit.`, 413);
  validateSyncPayload(payload);
  for (const task of payload.tasks) {
    validateRecurrence(task.recurringRule, `Task ${task.id} due recurrence`);
    validateRecurrence(task.deadlineRecurringRule, `Task ${task.id} deadline recurrence`);
  }
  return payload;
}

export function mergeWorkspaces(local, remote, now = Date.now(), timeZone = 'UTC') {
  const projects = mergeEntities(local.projects, remote.projects);
  const locations = mergeEntities(local.locations, remote.locations);
  const sections = repairSections(mergeEntities(local.sections, remote.sections), projects, now);
  const tasks = repairTasks(mergeEntities(local.tasks, remote.tasks), projects, sections, locations, now);
  const reminders = repairReminders(mergeEntities(local.reminders, remote.reminders), tasks, locations);
  return finalizeWorkspace(repairRecurring({
    ...local,
    schemaVersion: Math.max(local.schemaVersion, remote.schemaVersion),
    deviceId: local.deviceId || remote.deviceId || 'mcp',
    projects: sortIds(projects), sections: sortIds(sections), tasks: sortIds(tasks),
    reminders: sortIds(reminders), locations: sortIds(locations),
  }, now, timeZone), now);
}

export function applyWorkspaceOperation(payload, operation, args, now = Date.now()) {
  const op = operations[operation];
  if (!op) invalid(`Unsupported workspace operation: ${operation}`);
  return finalizeWorkspace(repairRecurring(op(payload, args, now), now, args.timeZone), now);
}

const operations = {
  create_task(payload, args, now) {
    requireText(args.title, 'title');
    checkTaskReferences(payload, args);
    const task = {
      id: args.id ?? randomUUID(), title: args.title.trim(), description: (args.description ?? '').trim(),
      projectId: args.projectId ?? null, sectionId: args.sectionId ?? null, priority: args.priority ?? 'P4',
      dueAt: args.dueAt ?? null, allDay: args.allDay ?? true,
      deadlineAt: args.deadlineAt ?? null, deadlineAllDay: args.deadlineAllDay ?? false,
      recurringRule: args.recurringRule ?? null, deadlineRecurringRule: args.deadlineRecurringRule ?? null,
      status: 'OPEN', completedAt: null, parentTaskId: args.parentTaskId ?? null,
      locationId: args.locationId ?? null, locationTriggerType: args.locationTriggerType ?? null,
      order: args.order ?? nextOrder(payload.tasks, item => item.projectId === (args.projectId ?? null)
        && item.sectionId === (args.sectionId ?? null) && item.parentTaskId === (args.parentTaskId ?? null)),
      createdAt: now, updatedAt: now, deletedAt: null,
    };
    validateRecurrence(task.recurringRule, 'recurringRule');
    validateRecurrence(task.deadlineRecurringRule, 'deadlineRecurringRule');
    return { ...payload, tasks: [...payload.tasks, task] };
  },
  update_task(payload, args, now) {
    const current = requireEntity(payload.tasks, args.taskId, 'Task');
    const patch = allowed(args.patch, TASK_FIELDS);
    if ('title' in patch) requireText(patch.title, 'title');
    const next = { ...current, ...patch, updatedAt: now };
    checkTaskReferences(payload, next, current.id);
    if (hasParentCycle(next, payload.tasks.map(item => item.id === next.id ? next : item))) invalid('parentTaskId would create a cycle.');
    validateRecurrence(next.recurringRule, 'recurringRule');
    validateRecurrence(next.deadlineRecurringRule, 'deadlineRecurringRule');
    return replace(payload, 'tasks', next);
  },
  set_task_status(payload, args, now) {
    const task = requireEntity(payload.tasks, args.taskId, 'Task');
    if (!['OPEN', 'COMPLETED', 'ARCHIVED'].includes(args.status)) invalid('status is invalid.');
    if (task.status === args.status) return payload;
    if (args.status === 'COMPLETED') return completeTask(payload, task, now, args.timeZone);
    const successorId = task.status === 'COMPLETED' && args.status === 'OPEN'
      ? findSuccessor(payload, task, task.completedAt ?? now, args.timeZone)?.id : null;
    return {
      ...payload,
      tasks: payload.tasks.map(item => item.id === task.id
        ? { ...item, status: args.status, completedAt: null, updatedAt: now }
        : successorId && item.id === successorId ? { ...item, deletedAt: now, updatedAt: now } : item),
      reminders: successorId ? payload.reminders.filter(item => item.taskId !== successorId) : payload.reminders,
    };
  },
  move_task(payload, args, now) {
    const patch = {};
    if ('sectionId' in args) {
      patch.sectionId = args.sectionId;
      if (!('projectId' in args) && args.sectionId) patch.projectId = requireEntity(payload.sections, args.sectionId, 'Section').projectId;
    }
    for (const key of ['projectId', 'parentTaskId', 'order']) if (key in args) patch[key] = args[key];
    if ('projectId' in patch && patch.projectId === null && !('sectionId' in patch)) patch.sectionId = null;
    return operations.update_task(payload, { taskId: args.taskId, patch }, now);
  },
  bulk_update_tasks(payload, args, now) {
    if (!Array.isArray(args.taskIds) || !args.taskIds.length || args.taskIds.length > 500) invalid('taskIds must contain 1 to 500 IDs.');
    const idSet = new Set(args.taskIds);
    args.taskIds.forEach(id => requireEntity(payload.tasks, id, 'Task'));
    const patch = allowed(args.patch, TASK_BULK_FIELDS);
    const tasks = payload.tasks.map(task => idSet.has(task.id) && live(task) ? { ...task, ...patch, updatedAt: now } : task);
    tasks.filter(task => idSet.has(task.id)).forEach(task => {
      checkTaskReferences({ ...payload, tasks }, task, task.id);
      if (hasParentCycle(task, tasks)) invalid(`Task ${task.id} would have an invalid parent cycle.`);
    });
    return { ...payload, tasks };
  },
  delete_tasks(payload, args, now) {
    const idsToDelete = new Set(args.taskIds ?? []);
    if (!idsToDelete.size) invalid('taskIds is required.');
    return {
      ...payload,
      tasks: tombstone(payload.tasks, idsToDelete, now),
      reminders: payload.reminders.filter(reminder => !idsToDelete.has(reminder.taskId)),
    };
  },
  create_project(payload, args, now) {
    requireText(args.name, 'name');
    const project = {
      id: args.id ?? randomUUID(), name: args.name.trim(), color: args.color ?? '#FE8C2F',
      favorite: args.favorite ?? false, order: args.order ?? nextOrder(payload.projects),
      archived: args.archived ?? false, viewPreference: args.viewPreference ?? 'BOARD',
      createdAt: now, updatedAt: now, deletedAt: null,
    };
    return { ...payload, projects: [...payload.projects, project] };
  },
  update_project(payload, args, now) {
    const project = requireEntity(payload.projects, args.projectId, 'Project');
    const next = { ...project, ...allowed(args.patch, PROJECT_FIELDS), updatedAt: now };
    requireText(next.name, 'name');
    return replace(payload, 'projects', next);
  },
  delete_project(payload, args, now) {
    const project = requireEntity(payload.projects, args.projectId, 'Project');
    const taskIds = new Set(payload.tasks.filter(item => item.projectId === project.id).map(item => item.id));
    return {
      ...payload,
      projects: tombstone(payload.projects, new Set([project.id]), now),
      sections: tombstone(payload.sections, new Set(payload.sections.filter(item => item.projectId === project.id).map(item => item.id)), now),
      tasks: tombstone(payload.tasks, taskIds, now),
      reminders: payload.reminders.filter(item => !taskIds.has(item.taskId)),
    };
  },
  create_section(payload, args, now) {
    requireEntity(payload.projects, args.projectId, 'Project'); requireText(args.name, 'name');
    const section = { id: args.id ?? randomUUID(), projectId: args.projectId, name: args.name.trim(),
      order: args.order ?? nextOrder(payload.sections, item => item.projectId === args.projectId),
      createdAt: now, updatedAt: now, deletedAt: null };
    return { ...payload, sections: [...payload.sections, section] };
  },
  update_section(payload, args, now) {
    const section = requireEntity(payload.sections, args.sectionId, 'Section');
    const next = { ...section, ...allowed(args.patch, SECTION_FIELDS), updatedAt: now };
    requireText(next.name, 'name');
    return replace(payload, 'sections', next);
  },
  delete_section(payload, args, now) {
    requireEntity(payload.sections, args.sectionId, 'Section');
    return { ...payload,
      sections: tombstone(payload.sections, new Set([args.sectionId]), now),
      tasks: payload.tasks.map(item => item.sectionId === args.sectionId ? { ...item, sectionId: null, updatedAt: now } : item) };
  },
  create_reminder(payload, args, now) {
    requireEntity(payload.tasks, args.taskId, 'Task');
    checkReminder(payload, args);
    const reminder = { id: args.id ?? randomUUID(), taskId: args.taskId, type: args.type,
      timeAt: args.timeAt ?? null, offsetMinutes: args.offsetMinutes ?? null,
      locationId: args.locationId ?? null, locationTriggerType: args.locationTriggerType ?? null,
      enabled: args.enabled ?? true, ephemeral: args.ephemeral ?? false,
      createdAt: now, updatedAt: now, deletedAt: null };
    return { ...payload, reminders: [...payload.reminders, reminder] };
  },
  update_reminder(payload, args, now) {
    const reminder = requireEntity(payload.reminders, args.reminderId, 'Reminder');
    const next = { ...reminder, ...allowed(args.patch, REMINDER_FIELDS), updatedAt: now };
    checkReminder(payload, next);
    return replace(payload, 'reminders', next);
  },
  delete_reminder(payload, args) {
    requireEntity(payload.reminders, args.reminderId, 'Reminder');
    return { ...payload, reminders: payload.reminders.filter(item => item.id !== args.reminderId) };
  },
  create_location(payload, args, now) {
    requireText(args.label, 'label'); requireText(args.address, 'address');
    const location = { id: args.id ?? randomUUID(), label: args.label.trim(), address: args.address.trim(),
      lat: args.lat, lng: args.lng, radiusMeters: args.radiusMeters ?? 150,
      createdAt: now, updatedAt: now, deletedAt: null };
    return { ...payload, locations: [...payload.locations, location] };
  },
  update_location(payload, args, now) {
    const location = requireEntity(payload.locations, args.locationId, 'Location');
    const next = { ...location, ...allowed(args.patch, LOCATION_FIELDS), updatedAt: now };
    requireText(next.label, 'label'); requireText(next.address, 'address');
    return replace(payload, 'locations', next);
  },
  delete_location(payload, args, now) {
    requireEntity(payload.locations, args.locationId, 'Location');
    return {
      ...payload,
      locations: payload.locations.filter(item => item.id !== args.locationId),
      tasks: payload.tasks.map(item => item.locationId === args.locationId
        ? { ...item, locationId: null, locationTriggerType: null, updatedAt: now } : item),
      reminders: payload.reminders.filter(item => item.locationId !== args.locationId),
    };
  },
};

export function selectTasks(payload, filters = {}) {
  const query = filters.query?.trim().toLowerCase();
  return payload.tasks.filter(task => (filters.includeDeleted || live(task))
    && (!filters.status || task.status === filters.status)
    && (filters.projectId === undefined || task.projectId === filters.projectId)
    && (filters.sectionId === undefined || task.sectionId === filters.sectionId)
    && (filters.parentTaskId === undefined || task.parentTaskId === filters.parentTaskId)
    && (!query || `${task.title}\n${task.description}`.toLowerCase().includes(query)))
    .sort((a, b) => (a.dueAt ?? Number.MAX_SAFE_INTEGER) - (b.dueAt ?? Number.MAX_SAFE_INTEGER)
      || a.order - b.order || a.id.localeCompare(b.id));
}

function completeTask(payload, task, now, timeZone = 'UTC') {
  const directChildren = new Set(payload.tasks.filter(item => live(item) && item.parentTaskId === task.id && item.status !== 'COMPLETED').map(item => item.id));
  const successor = buildSuccessor(payload, task, now, timeZone);
  return {
    ...payload,
    tasks: [...payload.tasks.map(item => item.id === task.id || directChildren.has(item.id)
      ? { ...item, status: 'COMPLETED', completedAt: now, updatedAt: now } : item), ...(successor ? [successor.task] : [])],
    reminders: successor ? [...payload.reminders, ...successor.reminders] : payload.reminders,
  };
}

function buildSuccessor(payload, task, now, timeZone = 'UTC') {
  const nextDue = nextOccurrence(task.dueAt, task.recurringRule, now, timeZone, task.allDay);
  const explicitDeadline = nextOccurrence(task.deadlineAt, task.deadlineRecurringRule, now, timeZone, task.deadlineAllDay ?? false);
  const deadlineOffset = task.deadlineAt !== null && task.dueAt !== null ? task.deadlineAt - task.dueAt : null;
  const nextDeadline = explicitDeadline ?? (nextDue !== null && deadlineOffset !== null ? nextDue + deadlineOffset : null);
  if (nextDue === null && nextDeadline === null) return null;
  const nextTask = { ...task, id: randomUUID(), dueAt: nextDue, allDay: nextDue !== null ? task.allDay : false,
    deadlineAt: nextDeadline, deadlineAllDay: nextDeadline !== null ? (task.deadlineAllDay ?? false) : false,
    status: 'OPEN', completedAt: null, createdAt: now, updatedAt: now, deletedAt: null };
  const reminders = payload.reminders.flatMap(item => {
    if (!live(item) || !item.enabled || item.taskId !== task.id) return [];
    const next = { ...item, id: randomUUID(), taskId: nextTask.id, createdAt: now, updatedAt: now, deletedAt: null };
    if (item.offsetMinutes !== null) return [{ ...next, timeAt: null }];
    const sourceBase = task.dueAt ?? task.deadlineAt;
    const nextBase = nextTask.dueAt ?? nextTask.deadlineAt;
    return item.timeAt !== null && sourceBase !== null && nextBase !== null
      ? [{ ...next, timeAt: nextBase + item.timeAt - sourceBase, offsetMinutes: null }]
      : [];
  });
  return { task: nextTask, reminders };
}

function findSuccessor(payload, task, now, timeZone = 'UTC', additionalTasks = [], includeDeleted = false) {
  const expected = buildSuccessor({ ...payload, reminders: [] }, task, now, timeZone)?.task;
  if (!expected) return null;
  const candidates = [...payload.tasks, ...additionalTasks].filter(item => (includeDeleted || live(item))
    && item.id !== task.id && item.dueAt === expected.dueAt && (item.deadlineAt ?? null) === (expected.deadlineAt ?? null)
    && (item.recurringRule ?? null) === (task.recurringRule ?? null)
    && (item.deadlineRecurringRule ?? null) === (task.deadlineRecurringRule ?? null))
    .sort((a, b) => scoreRecurringCandidate(b, task) - scoreRecurringCandidate(a, task)
      || b.updatedAt - a.updatedAt || a.id.localeCompare(b.id));
  const titled = candidates.find(item => normalizeTitle(item.title) === normalizeTitle(task.title)
    && scoreRecurringCandidate(item, task) >= 5);
  if (titled) return titled;
  const fallback = candidates.filter(item => sameRecurringContext(item, task));
  return fallback.length === 1 ? fallback[0] : null;
}

function nextOccurrence(at, rule, now, timeZone, allDay) {
  if (at === null || !rule) return null;
  const parsed = parseRecurrence(rule);
  let date = new TZDate(at, timeZone);
  if (now > at) {
    const current = new TZDate(now, timeZone);
    date = new TZDate(current.getFullYear(), current.getMonth(), current.getDate(),
      allDay ? 0 : date.getHours(), allDay ? 0 : date.getMinutes(), 0, 0, timeZone);
  }
  if (parsed.freq === 'DAILY') date.setDate(date.getDate() + parsed.interval);
  else if (parsed.freq === 'WEEKLY' && parsed.byDay.length) {
    const currentDay = date.getDay() || 7;
    const laterDay = parsed.byDay.find(day => day > currentDay);
    const target = laterDay ?? parsed.byDay[0];
    date.setDate(date.getDate() + (laterDay ? target - currentDay : 7 - currentDay + target + 7 * (parsed.interval - 1)));
  } else if (parsed.freq === 'WEEKLY') date.setDate(date.getDate() + 7 * parsed.interval);
  else if (parsed.freq === 'MONTHLY') {
    const targetDay = parsed.byMonthDay ?? date.getDate();
    date.setDate(1); date.setMonth(date.getMonth() + parsed.interval);
    while (targetDay > daysInMonth(date.getFullYear(), date.getMonth())) date.setMonth(date.getMonth() + 1);
    date.setDate(targetDay);
  } else {
    const month = date.getMonth(); const day = date.getDate(); const targetYear = date.getFullYear() + parsed.interval;
    date.setDate(1); date.setFullYear(targetYear); date.setMonth(month); date.setDate(Math.min(day, daysInMonth(targetYear, month)));
  }
  return date.getTime();
}

function parseRecurrence(rule) {
  const allowedKeys = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY']);
  const values = {};
  for (const part of rule.split(';')) {
    const pieces = part.split('=');
    if (pieces.length !== 2 || !pieces[0] || !allowedKeys.has(pieces[0].toUpperCase())) invalid('Recurrence rule contains an unsupported key.');
    const key = pieces[0].toUpperCase();
    if (key in values) invalid(`Recurrence rule repeats ${key}.`);
    values[key] = pieces[1].toUpperCase();
  }
  const freq = values.FREQ;
  if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) invalid('Recurrence rule must specify DAILY, WEEKLY, MONTHLY, or YEARLY FREQ.');
  const interval = values.INTERVAL === undefined ? 1 : Number(values.INTERVAL);
  if (!Number.isInteger(interval) || interval < 0 || interval > 2_147_483_647) invalid('Recurrence INTERVAL is invalid.');
  const days = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };
  const byDay = (values.BYDAY ?? '').split(',').filter(Boolean).map(token => days[token]);
  if (byDay.some(day => !day)) invalid('Recurrence BYDAY is invalid.');
  const byMonthDay = values.BYMONTHDAY === undefined ? null : Number(values.BYMONTHDAY);
  if (byMonthDay !== null && (!Number.isInteger(byMonthDay) || byMonthDay < 1 || byMonthDay > 31)) invalid('Recurrence BYMONTHDAY is invalid.');
  return { freq, interval, byDay: [...new Set(byDay)].sort((a, b) => a - b), byMonthDay };
}

function daysInMonth(year, month) { return new Date(Date.UTC(year, month + 1, 0)).getUTCDate(); }

function validateRecurrence(rule, label) {
  if (rule === null || rule === undefined || rule === '') return;
  if (typeof rule !== 'string' || rule.length > 1024) invalid(`${label} is invalid.`);
  parseRecurrence(rule);
}

function checkTaskReferences(payload, value, selfId) {
  if (value.projectId) requireEntity(payload.projects, value.projectId, 'Project');
  if (value.sectionId) {
    const section = requireEntity(payload.sections, value.sectionId, 'Section');
    if (section.projectId !== value.projectId) invalid('sectionId must belong to projectId.');
  }
  if (value.parentTaskId) {
    if (value.parentTaskId === selfId) invalid('A task cannot be its own parent.');
    requireEntity(payload.tasks, value.parentTaskId, 'Parent task');
  }
  if (value.locationId) requireEntity(payload.locations, value.locationId, 'Location');
}

function checkReminder(payload, reminder) {
  if (!['TIME', 'LOCATION'].includes(reminder.type)) invalid('Reminder type is invalid.');
  if (reminder.type === 'TIME') {
    if ((reminder.timeAt == null) === (reminder.offsetMinutes == null)) invalid('A time reminder needs exactly one of timeAt or offsetMinutes.');
    if (reminder.locationId != null || reminder.locationTriggerType != null) invalid('A time reminder cannot contain location fields.');
  }
  if (reminder.type === 'LOCATION') {
    if (!reminder.locationId || !reminder.locationTriggerType) invalid('A location reminder needs locationId and locationTriggerType.');
    if (reminder.timeAt != null || reminder.offsetMinutes != null) invalid('A location reminder cannot contain time fields.');
  }
  if (reminder.locationId) requireEntity(payload.locations, reminder.locationId, 'Location');
}

function repairRecurring(payload, now, timeZone = 'UTC') {
  const groups = new Map();
  payload.tasks.forEach(task => {
    if (!live(task) || (!task.recurringRule && !task.deadlineRecurringRule)) return;
    const key = JSON.stringify({ title: normalizeTitle(task.title), allDay: task.allDay,
      deadlineAllDay: task.deadlineAllDay ?? false, recurringRule: task.recurringRule ?? null,
      deadlineRecurringRule: task.deadlineRecurringRule ?? null, dueAt: task.dueAt,
      deadlineAt: task.deadlineAt ?? null });
    groups.set(key, [...(groups.get(key) ?? []), task]);
  });
  const duplicateIds = new Set();
  groups.forEach(group => {
    if (group.length < 2) return;
    const canonical = [...group].sort(compareOccurrenceCandidates)[0];
    group.forEach(task => { if (task.id !== canonical.id) duplicateIds.add(task.id); });
  });
  const cleaned = duplicateIds.size ? {
    ...payload,
    tasks: payload.tasks.map(task => duplicateIds.has(task.id) ? { ...task, deletedAt: now, updatedAt: now } : task),
    reminders: payload.reminders.filter(reminder => !duplicateIds.has(reminder.taskId)),
  } : payload;

  const additions = [];
  const reminderAdditions = [];
  cleaned.tasks.forEach(task => {
    if (!live(task) || task.status !== 'COMPLETED' || (!task.recurringRule && !task.deadlineRecurringRule)) return;
    if (hasLaterContinuation(cleaned, task, additions, true)) return;
    const successor = buildSuccessor(cleaned, task, task.completedAt ?? now, timeZone);
    if (successor) { additions.push(successor.task); reminderAdditions.push(...successor.reminders); }
  });
  return additions.length ? { ...cleaned, tasks: [...cleaned.tasks, ...additions],
    reminders: [...cleaned.reminders, ...reminderAdditions] } : cleaned;
}

function hasLaterContinuation(payload, task, additions, includeDeleted = false) {
  const currentAt = occurrenceAt(task);
  if (currentAt === null) return false;
  const later = [...payload.tasks, ...additions].filter(candidate => candidate.id !== task.id
    && (includeDeleted || live(candidate))
    && (candidate.recurringRule ?? null) === (task.recurringRule ?? null)
    && (candidate.deadlineRecurringRule ?? null) === (task.deadlineRecurringRule ?? null)
    && occurrenceAt(candidate) !== null && occurrenceAt(candidate) > currentAt)
    .sort((a, b) => scoreRecurringCandidate(b, task) - scoreRecurringCandidate(a, task));
  if (later.some(candidate => normalizeTitle(candidate.title) === normalizeTitle(task.title)
    && scoreRecurringCandidate(candidate, task) >= 8)) return true;
  const counts = new Map();
  later.filter(candidate => sameRecurringContext(candidate, task)).forEach(candidate => {
    counts.set(occurrenceAt(candidate), (counts.get(occurrenceAt(candidate)) ?? 0) + 1);
  });
  return [...counts.values()].some(count => count === 1);
}

function compareOccurrenceCandidates(left, right) {
  const rank = task => task.status === 'COMPLETED' ? 0 : task.status === 'ARCHIVED' ? 1 : 2;
  return rank(left) - rank(right) || right.updatedAt - left.updatedAt || right.createdAt - left.createdAt
    || left.id.localeCompare(right.id);
}

function scoreRecurringCandidate(candidate, task) {
  let score = 0;
  if (normalizeTitle(candidate.title) === normalizeTitle(task.title)) score += 4;
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

function sameRecurringContext(candidate, task) {
  return candidate.projectId === task.projectId && candidate.sectionId === task.sectionId
    && candidate.parentTaskId === task.parentTaskId && candidate.allDay === task.allDay
    && (candidate.deadlineAllDay ?? false) === (task.deadlineAllDay ?? false);
}

function normalizeTitle(value) { return value.trim().replace(/\s+/g, ' ').toLowerCase(); }
function occurrenceAt(task) { return task.dueAt ?? task.deadlineAt ?? null; }

function repairSections(sections, projects, now) {
  const projectIds = ids(projects);
  return sections.map(item => live(item) && !projectIds.has(item.projectId) ? { ...item, deletedAt: now, updatedAt: now } : item);
}

function repairTasks(tasks, projects, sections, locations, now) {
  const projectIds = ids(projects); const sectionMap = new Map(sections.filter(live).map(item => [item.id, item]));
  const taskIds = ids(tasks); const locationIds = ids(locations);
  return tasks.map(item => {
    if (!live(item)) return item;
    const next = { ...item }; let changed = false;
    if (next.projectId && !projectIds.has(next.projectId)) { next.projectId = null; next.sectionId = null; changed = true; }
    const section = next.sectionId ? sectionMap.get(next.sectionId) : null;
    if (next.sectionId && (!section || section.projectId !== next.projectId)) { next.sectionId = null; changed = true; }
    if (next.parentTaskId && (!taskIds.has(next.parentTaskId) || next.parentTaskId === next.id)) { next.parentTaskId = null; changed = true; }
    if (next.locationId && !locationIds.has(next.locationId)) { next.locationId = null; next.locationTriggerType = null; changed = true; }
    return changed ? { ...next, updatedAt: Math.max(next.updatedAt, now) } : item;
  });
}

function repairReminders(reminders, tasks, locations) {
  const taskMap = new Map(tasks.filter(live).map(item => [item.id, item])); const locationIds = ids(locations);
  return reminders.filter(item => {
    const task = taskMap.get(item.taskId);
    return task && task.status === 'OPEN' && (!item.locationId || locationIds.has(item.locationId));
  });
}

function mergeEntities(left, right) {
  const result = new Map();
  [...left, ...right].forEach(item => {
    const current = result.get(item.id);
    if (!current || winner(item, current)) result.set(item.id, item);
  });
  return [...result.values()];
}

function winner(candidate, current) {
  if (candidate.updatedAt !== current.updatedAt) return candidate.updatedAt > current.updatedAt;
  if (Boolean(candidate.deletedAt) !== Boolean(current.deletedAt)) return Boolean(candidate.deletedAt);
  return JSON.stringify(candidate) > JSON.stringify(current);
}

function hasParentCycle(task, tasks) {
  const parents = new Map(tasks.filter(live).map(item => [item.id, item.parentTaskId]));
  const seen = new Set([task.id]); let parent = task.parentTaskId;
  while (parent) { if (seen.has(parent)) return true; seen.add(parent); parent = parents.get(parent); }
  return false;
}

const TASK_FIELDS = new Set(['title', 'description', 'projectId', 'sectionId', 'priority', 'dueAt', 'allDay',
  'deadlineAt', 'deadlineAllDay', 'recurringRule', 'deadlineRecurringRule', 'parentTaskId', 'locationId',
  'locationTriggerType', 'order']);
const TASK_BULK_FIELDS = new Set(['projectId', 'sectionId', 'priority', 'dueAt', 'allDay', 'deadlineAt',
  'deadlineAllDay', 'locationId', 'locationTriggerType']);
const PROJECT_FIELDS = new Set(['name', 'color', 'favorite', 'order', 'archived', 'viewPreference']);
const SECTION_FIELDS = new Set(['name', 'order']);
const REMINDER_FIELDS = new Set(['type', 'timeAt', 'offsetMinutes', 'locationId', 'locationTriggerType', 'enabled', 'ephemeral']);
const LOCATION_FIELDS = new Set(['label', 'address', 'lat', 'lng', 'radiusMeters']);

function allowed(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('patch must be an object.');
  const result = {};
  Object.entries(input).forEach(([key, value]) => { if (fields.has(key)) result[key] = value; else invalid(`Field ${key} cannot be changed.`); });
  return result;
}
function replace(payload, collection, entity) { return { ...payload, [collection]: payload[collection].map(item => item.id === entity.id ? entity : item) }; }
function tombstone(items, itemIds, now) { return items.map(item => itemIds.has(item.id) && live(item) ? { ...item, deletedAt: now, updatedAt: now } : item); }
function requireEntity(items, id, label) { const item = items.find(candidate => candidate.id === id && live(candidate)); if (!item) invalid(`${label} ${id ?? ''} was not found.`, 404); return item; }
function requireText(value, label) { if (typeof value !== 'string' || !value.trim()) invalid(`${label} is required.`); }
function nextOrder(items, predicate = () => true) { return items.filter(item => live(item) && predicate(item)).reduce((max, item) => Math.max(max, item.order), -1) + 1; }
function sortIds(items) { return items.sort((a, b) => a.id.localeCompare(b.id)); }
function ids(items) { return new Set(items.filter(live).map(item => item.id)); }
function live(item) { return !item.deletedAt; }
function invalid(message, statusCode = 400) { const error = new Error(message); error.statusCode = statusCode; throw error; }
