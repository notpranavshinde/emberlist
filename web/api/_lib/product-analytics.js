import crypto from 'node:crypto';

export const ANALYTICS_EVENTS = new Set([
  'onboarding_viewed', 'onboarding_primary_clicked', 'onboarding_example_clicked',
  'onboarding_skipped', 'onboarding_restore_started', 'onboarding_restore_result',
  'onboarding_completed', 'app_opened', 'screen_viewed', 'quick_add_opened',
  'task_create_result', 'task_completed', 'task_reopened', 'task_deleted', 'undo_used',
  'project_created', 'section_created', 'subtask_created', 'subtask_promoted',
  'task_moved', 'organize_changed', 'search_used', 'sync_action', 'backup_action',
  'reminder_action', 'operation_error',
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const APP_VERSION = /^[A-Za-z0-9._-]{1,32}$/;
const ENUMS = {
  method: ['first_task', 'drive_restore'],
  result: ['success', 'failure', 'error', 'empty', 'cancelled', 'offline', 'denied', 'permanently_denied', 'unavailable'],
  exampleKind: ['simple', 'scheduled', 'recurring'],
  elapsedBucket: ['under_30s', '30_to_60s', '1_to_5m', 'over_5m'],
  countBucket: ['1', '2_to_5', '6_plus'],
  resultCountBucket: ['0', '1', '2_to_5', '6_plus'],
  origin: ['fab', 'keyboard', 'today', 'onboarding', 'settings', 'task', 'project', 'system', 'unknown'],
  action: ['open', 'create', 'complete', 'reopen', 'delete', 'move', 'change', 'sync', 'restore', 'connect', 'disconnect', 'export', 'import', 'schedule', 'request_permission', 'save', 'undo'],
  route: ['today', 'upcoming', 'inbox', 'project', 'search', 'calendar', 'settings', 'completed', 'archived', 'unknown'],
  errorCategory: ['validation', 'network', 'offline', 'auth', 'permission', 'storage', 'conflict', 'schema', 'configuration', 'unknown'],
  permission: ['not_required', 'granted', 'denied', 'permanently_denied'],
};
const BOOLEAN_KEYS = new Set(['scheduled', 'recurring', 'reminder', 'priority', 'subtask', 'bulk']);
const COMMON = ['origin'];
const EVENT_PROPERTIES = {
  onboarding_viewed: [], onboarding_primary_clicked: [], onboarding_example_clicked: ['exampleKind'],
  onboarding_skipped: [], onboarding_restore_started: [], onboarding_restore_result: ['result', 'errorCategory'],
  onboarding_completed: ['method', 'elapsedBucket'], app_opened: [], screen_viewed: ['route'],
  quick_add_opened: ['origin'], task_create_result: ['result', 'countBucket', 'scheduled', 'recurring', 'reminder', 'priority', 'subtask', 'bulk', 'errorCategory'],
  task_completed: ['subtask'], task_reopened: ['subtask'], task_deleted: ['countBucket', 'subtask'], undo_used: ['action'],
  project_created: [], section_created: [], subtask_created: [], subtask_promoted: [],
  task_moved: ['origin'], organize_changed: ['action', 'countBucket'], search_used: ['resultCountBucket'],
  sync_action: ['action', 'result', 'origin', 'errorCategory'], backup_action: ['action', 'result', 'origin', 'errorCategory'],
  reminder_action: ['action', 'result', 'permission', 'errorCategory'], operation_error: ['action', 'errorCategory'],
};

const STORE_SCRIPT = `
local inserted = redis.call('SET', KEYS[1], '1', 'EX', ARGV[1], 'NX')
if not inserted then return 0 end
redis.call('HINCRBY', KEYS[2], ARGV[3], 1)
redis.call('SADD', KEYS[3], ARGV[4])
local is_new = redis.call('SET', KEYS[4], ARGV[2], 'EX', ARGV[2], 'NX')
if is_new then redis.call('SADD', KEYS[5], ARGV[4]); redis.call('SADD', KEYS[10], ARGV[4]) end
redis.call('SADD', KEYS[6], ARGV[4])
redis.call('SADD', KEYS[7], ARGV[5])
redis.call('SADD', KEYS[8], ARGV[4])
redis.call('SADD', KEYS[9], ARGV[4])
for i=11,#KEYS do redis.call('SADD', KEYS[i], ARGV[4]) end
for i=2,#KEYS do redis.call('EXPIRE', KEYS[i], ARGV[2]) end
return 1
`;

export function validateV2Event(body, now = Date.now()) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw badRequest('Invalid JSON body.');
  const keys = ['schemaVersion', 'eventId', 'installId', 'occurredAt', 'event', 'platform', 'appVersion', 'properties'];
  if (Object.keys(body).some(key => !keys.includes(key)) || keys.some(key => !(key in body))) throw badRequest('Invalid event fields.');
  if (body.schemaVersion !== 2) throw badRequest('Unsupported analytics schema.');
  if (!UUID.test(body.eventId) || !UUID.test(body.installId)) throw badRequest('Invalid identifier.');
  if (!ANALYTICS_EVENTS.has(body.event)) throw badRequest('Unknown event.');
  if (!['web', 'android'].includes(body.platform)) throw badRequest('Invalid platform.');
  if (typeof body.appVersion !== 'string' || !APP_VERSION.test(body.appVersion)) throw badRequest('Invalid app version.');
  const occurredAt = Date.parse(body.occurredAt);
  if (!Number.isFinite(occurredAt) || occurredAt > now + 60_000 || occurredAt < now - 7 * 86_400_000) throw badRequest('Invalid event timestamp.');
  const properties = body.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw badRequest('Invalid properties.');
  const allowed = new Set(EVENT_PROPERTIES[body.event] ?? COMMON);
  for (const [key, value] of Object.entries(properties)) {
    if (!allowed.has(key)) throw badRequest('Unknown property.');
    if (BOOLEAN_KEYS.has(key)) {
      if (typeof value !== 'boolean') throw badRequest(`Invalid ${key}.`);
    } else if (!ENUMS[key]?.includes(value)) {
      throw badRequest(`Invalid ${key}.`);
    }
  }
  validateRequiredCombination(body.event, properties);
  return { ...body, occurredAt: new Date(occurredAt).toISOString(), properties };
}

function validateRequiredCombination(event, properties) {
  const required = {
    onboarding_example_clicked: ['exampleKind'], onboarding_restore_result: ['result'], onboarding_completed: ['method', 'elapsedBucket'],
    screen_viewed: ['route'], task_create_result: ['result'], search_used: ['resultCountBucket'],
    sync_action: ['action', 'result'], backup_action: ['action', 'result'], reminder_action: ['action', 'result'],
    operation_error: ['action', 'errorCategory'],
  }[event] ?? [];
  if (required.some(key => !(key in properties))) throw badRequest('Missing required property.');
  if (properties.result !== 'failure' && properties.errorCategory) throw badRequest('Error category requires a failure result.');
}

export function hashInstallId(installId, secret = process.env.ANALYTICS_ID_SECRET) {
  if (!secret || secret.length < 32) throw unavailable('Analytics ID secret is not configured.');
  return crypto.createHmac('sha256', secret).update(installId).digest('hex');
}

export function aggregateField(event) {
  const suffix = Object.entries(event.properties).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}=${value}`).join('|');
  return `${event.appVersion}|${event.event}${suffix ? `|${suffix}` : ''}`;
}

export function analyticsKeys({ day, platform, appVersion, event, installHash, eventId }) {
  const prefix = 'emberlist:analytics:v2';
  return {
    dedupe: `${prefix}:dedupe:${eventId}`,
    counters: `${prefix}:counters:${day}:${platform}`,
    active: `${prefix}:active:${day}:${platform}`,
    install: `${prefix}:install:${platform}:${installHash}`,
    cohort: `${prefix}:cohort:${day}:${platform}`,
    unique: `${prefix}:unique:${day}:${platform}:${event}`,
    versions: `${prefix}:versions:${day}:${platform}`,
    activeVersion: `${prefix}:active:${day}:${platform}:${appVersion}`,
    uniqueVersion: `${prefix}:unique:${day}:${platform}:${appVersion}:${event}`,
    cohortVersion: `${prefix}:cohort:${day}:${platform}:${appVersion}`,
  };
}

export async function storeV2Event(event, env = process.env) {
  const installHash = hashInstallId(event.installId, env.ANALYTICS_ID_SECRET);
  const day = event.occurredAt.slice(0, 10);
  const keys = analyticsKeys({ ...event, day, installHash });
  const featureKeys = featuresForEvent(event).flatMap(feature => [
    `emberlist:analytics:v2:feature:${day}:${event.platform}:all:${feature}`,
    `emberlist:analytics:v2:feature:${day}:${event.platform}:${event.appVersion}:${feature}`,
  ]);
  const redisKeys = [keys.dedupe, keys.counters, keys.active, keys.install, keys.cohort, keys.unique, keys.versions, keys.activeVersion, keys.uniqueVersion, keys.cohortVersion, ...featureKeys];
  const response = await redisCommand([
    'EVAL', STORE_SCRIPT, String(redisKeys.length), ...redisKeys,
    String(30 * 86_400), String(400 * 86_400), aggregateField(event), installHash,
    event.appVersion, event.event,
  ], env);
  return { inserted: response === 1, installHash };
}

export function featuresForEvent(event) {
  const features = [];
  if (event.event === 'project_created') features.push('projects');
  if (event.event === 'section_created') features.push('sections');
  if (event.event === 'subtask_created') features.push('subtasks');
  if (event.event === 'search_used') features.push('search');
  if (event.event === 'organize_changed') features.push('organization');
  if (event.event === 'sync_action' && event.properties.result === 'success') features.push('sync');
  if (event.event === 'backup_action' && event.properties.result === 'success') features.push('backup');
  if (event.event === 'task_create_result' && event.properties.result === 'success') {
    if (event.properties.recurring) features.push('recurrence');
    if (event.properties.reminder) features.push('reminders');
  }
  return features;
}

export async function redisCommand(command, env = process.env) {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw unavailable('Analytics storage is unavailable.');
  const response = await fetch(url, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command), signal: AbortSignal.timeout(3_000),
  });
  if (!response.ok) throw unavailable('Analytics storage is unavailable.');
  const payload = await response.json();
  if (payload.error) throw unavailable('Analytics storage is unavailable.');
  return payload.result;
}

export async function redisPipeline(commands, env = process.env) {
  if (!commands.length) return [];
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw unavailable('Analytics storage is unavailable.');
  const results = [];
  for (let index = 0; index < commands.length; index += 100) {
    const response = await fetch(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(commands.slice(index, index + 100)), signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) throw unavailable('Analytics storage is unavailable.');
    const payload = await response.json();
    if (!Array.isArray(payload) || payload.some(item => item.error)) throw unavailable('Analytics storage is unavailable.');
    results.push(...payload.map(item => item.result));
  }
  return results;
}

export function badRequest(message) {
  const error = new Error(message); error.statusCode = 400; return error;
}

export function unavailable(message) {
  const error = new Error(message); error.statusCode = 503; return error;
}
