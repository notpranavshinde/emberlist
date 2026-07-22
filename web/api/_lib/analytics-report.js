import { ANALYTICS_EVENTS, redisPipeline } from './product-analytics.js';

export const FEATURES = ['projects', 'sections', 'subtasks', 'recurrence', 'reminders', 'sync', 'backup', 'search', 'organization'];

export function parseDashboardFilters(searchParams, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const to = validDay(searchParams.get('to')) ? searchParams.get('to') : today;
  const fallbackFrom = shiftDay(to, -29);
  const from = validDay(searchParams.get('from')) ? searchParams.get('from') : fallbackFrom;
  if (from > to || daysBetween(from, to) > 399 || to > today) throw requestError('Invalid date range.');
  const platform = searchParams.get('platform') || 'all';
  if (!['all', 'web', 'android'].includes(platform)) throw requestError('Invalid platform.');
  const version = searchParams.get('version') || 'all';
  if (version !== 'all' && !/^[A-Za-z0-9._-]{1,32}$/.test(version)) throw requestError('Invalid version.');
  return { from, to, platform, version, compare: searchParams.get('compare') === 'true' };
}

export async function loadAnalyticsReport(filters, env = process.env) {
  const current = await loadPeriod(filters, env);
  let previous = null;
  if (filters.compare) {
    const span = daysBetween(filters.from, filters.to) + 1;
    const previousTo = shiftDay(filters.from, -1);
    previous = await loadPeriod({ ...filters, from: shiftDay(previousTo, -(span - 1)), to: previousTo, compare: false }, env);
  }
  return { ...current, previousPeriod: previous ? previous.summary : null };
}

async function loadPeriod(filters, env) {
  const platforms = filters.platform === 'all' ? ['web', 'android'] : [filters.platform];
  const periodDays = dateRange(filters.from, filters.to);
  const metricStart = [filters.from, shiftDay(filters.to, -29)].sort()[0];
  const metricDays = dateRange(metricStart, filters.to);
  const commands = [];
  const descriptors = [];
  for (const day of metricDays) for (const platform of platforms) {
    add('counter', day, platform, ['HGETALL', `emberlist:analytics:v2:counters:${day}:${platform}`]);
    add('active', day, platform, ['SMEMBERS', activeKey(day, platform, filters.version)]);
    if (periodDays.includes(day)) {
      add('cohort', day, platform, ['SMEMBERS', cohortKey(day, platform, filters.version)]);
      add('legacy', day, platform, ['HGETALL', `emberlist:analytics:onboarding:${day}:${platform}:v2`]);
      for (const feature of FEATURES) add(`feature:${feature}`, day, platform, ['SMEMBERS', `emberlist:analytics:v2:feature:${day}:${platform}:${filters.version}:${feature}`]);
    }
  }
  function add(type, day, platform, command) { descriptors.push({ type, day, platform }); commands.push(command); }
  const raw = await redisPipeline(commands, env);
  const buckets = new Map();
  descriptors.forEach((descriptor, index) => buckets.set(`${descriptor.type}:${descriptor.day}:${descriptor.platform}`, raw[index] ?? []));
  const rows = [];
  const legacyRows = [];
  for (const day of periodDays) for (const platform of platforms) {
    rows.push(...parseCounter(buckets.get(`counter:${day}:${platform}`), day, platform, filters.version));
    if (filters.version === 'all') legacyRows.push(...parseLegacy(buckets.get(`legacy:${day}:${platform}`), day, platform));
  }
  const active = unionFor(periodDays, platforms, buckets, 'active');
  const cohorts = unionFor(periodDays, platforms, buckets, 'cohort');
  const activeByDay = Object.fromEntries(metricDays.map(day => [day, unionFor([day], platforms, buckets, 'active').size]));
  const featureAdoption = FEATURES.map(feature => {
    const count = unionFor(periodDays, platforms, buckets, `feature:${feature}`).size;
    return { feature, count, percentage: percent(count, active.size) };
  });
  const series = periodDays.map(day => ({
    day, activeInstalls: activeByDay[day] || 0,
    sessions: sum(rows, 'app_opened', {}, day), tasksCreated: sum(rows, 'task_create_result', { result: 'success' }, day),
    tasksCompleted: sum(rows, 'task_completed', {}, day), errors: sum(rows, 'operation_error', {}, day),
  }));
  const successfulCreates = sum(rows, 'task_create_result', { result: 'success' });
  const completedTasks = sum(rows, 'task_completed');
  const onboardingViewed = sum(rows, 'onboarding_viewed') + sum(legacyRows, 'onboarding_viewed');
  const onboardingCompleted = sum(rows, 'onboarding_completed') + sum(legacyRows, 'onboarding_completed');
  const syncAttempts = rows.filter(row => row.event === 'sync_action' && row.properties.action === 'sync' && ['success', 'failure'].includes(row.properties.result)).reduce((n, row) => n + row.count, 0);
  const syncSuccesses = sum(rows, 'sync_action', { action: 'sync', result: 'success' });
  const totalOperations = rows.reduce((total, row) => total + row.count, 0);
  const errorCount = sum(rows, 'operation_error');
  const summary = {
    activeInstalls: active.size, dau: activeByDay[filters.to] || 0,
    wau: unionFor(dateRange(shiftDay(filters.to, -6), filters.to), platforms, buckets, 'active').size,
    mau: unionFor(dateRange(shiftDay(filters.to, -29), filters.to), platforms, buckets, 'active').size,
    newInstalls: cohorts.size, sessions: sum(rows, 'app_opened'), tasksCreated: successfulCreates,
    tasksCompleted: completedTasks, taskCompletionRatio: percent(completedTasks, successfulCreates),
    activationConversion: percent(onboardingCompleted, onboardingViewed), syncSuccess: percent(syncSuccesses, syncAttempts),
    errorRate: percent(errorCount, totalOperations),
  };
  const versions = [...new Set(rows.map(row => row.version).filter(Boolean))].sort();
  return {
    generatedAt: new Date().toISOString(), timezone: 'UTC', filters, summary, series, versions,
    coverage: { installMetricsBegin: env.ANALYTICS_V2_ROLLOUT_DATE || 'July 21, 2026', legacyOnboardingIncluded: true },
    activation: {
      funnel: funnel(rows, legacyRows),
      examples: breakdown(rows, legacyRows, 'onboarding_example_clicked', 'exampleKind'),
      methods: breakdown(rows, legacyRows, 'onboarding_completed', 'method'),
      elapsed: breakdown(rows, legacyRows, 'onboarding_completed', 'elapsedBucket'),
      restoreResults: breakdown(rows, legacyRows, 'onboarding_restore_result', 'result'),
    },
    engagement: eventTotals(rows, ['quick_add_opened', 'task_create_result', 'task_completed', 'search_used', 'project_created', 'section_created', 'subtask_created', 'subtask_promoted', 'organize_changed', 'undo_used']),
    featureAdoption,
    reliability: {
      events: eventTotals(rows, ['sync_action', 'backup_action', 'reminder_action', 'operation_error']),
      errors: breakdown(rows, [], 'operation_error', 'errorCategory'),
      platforms: groupTotal(rows, 'platform'), versions: groupTotal(rows, 'version'),
    },
    retention: await loadRetention(periodDays, platforms, filters.version, env),
  };
}

async function loadRetention(cohortDays, platforms, version, env) {
  if (version !== 'all') return { note: 'Retention is installation-cohort based and is shown when all versions are selected.', cohorts: [] };
  const commands = []; const descriptors = [];
  for (const day of cohortDays) for (const platform of platforms) {
    for (const offset of [0, 1, 7, 30]) {
      const target = shiftDay(day, offset);
      commands.push(['SMEMBERS', offset === 0 ? `emberlist:analytics:v2:cohort:${day}:${platform}` : `emberlist:analytics:v2:active:${target}:${platform}`]);
      descriptors.push({ day, platform, offset });
    }
  }
  const raw = await redisPipeline(commands, env); const grouped = new Map();
  descriptors.forEach((item, index) => grouped.set(`${item.day}:${item.platform}:${item.offset}`, new Set(raw[index] || [])));
  return { cohorts: cohortDays.map(day => {
    const cohort = unionSets(platforms.map(platform => grouped.get(`${day}:${platform}:0`) || new Set()));
    const value = { day, size: cohort.size };
    for (const offset of [1, 7, 30]) {
      let retained = 0;
      for (const platform of platforms) {
        const source = grouped.get(`${day}:${platform}:0`) || new Set(); const target = grouped.get(`${day}:${platform}:${offset}`) || new Set();
        retained += [...source].filter(id => target.has(id)).length;
      }
      value[`d${offset}`] = percent(retained, cohort.size);
    }
    return value;
  }) };
}

function parseCounter(value, day, platform, versionFilter) {
  return pairs(value).flatMap(([field, count]) => {
    const [version, event, ...parts] = field.split('|');
    if (!ANALYTICS_EVENTS.has(event) || (versionFilter !== 'all' && version !== versionFilter)) return [];
    return [{ day, platform, version, event, properties: Object.fromEntries(parts.map(part => part.split('='))), count: Number(count) || 0 }];
  });
}
function parseLegacy(value, day, platform) { return pairs(value).map(([field, count]) => { const [event, ...parts] = field.split('|'); return { day, platform, version: 'legacy', event, properties: Object.fromEntries(parts.map(part => part.split('='))), count: Number(count) || 0 }; }); }
function pairs(value) { if (Array.isArray(value)) { const out = []; for (let i = 0; i < value.length; i += 2) out.push([value[i], value[i + 1]]); return out; } return Object.entries(value || {}); }
function sum(rows, event, properties = {}, day) { return rows.filter(row => row.event === event && (!day || row.day === day) && Object.entries(properties).every(([key, value]) => row.properties[key] === value)).reduce((n, row) => n + row.count, 0); }
function funnel(rows, legacy) { const all = [...rows, ...legacy]; return ['onboarding_viewed', 'onboarding_primary_clicked', 'onboarding_example_clicked', 'onboarding_skipped', 'onboarding_restore_started', 'onboarding_completed'].map(event => ({ event, count: sum(all, event) })); }
function breakdown(rows, legacy, event, property) { const values = new Map(); for (const row of [...rows, ...legacy].filter(row => row.event === event && row.properties[property])) values.set(row.properties[property], (values.get(row.properties[property]) || 0) + row.count); return [...values].map(([value, count]) => ({ value, count })); }
function eventTotals(rows, events) { return events.map(event => ({ event, count: sum(rows, event) })); }
function groupTotal(rows, key) { const values = new Map(); for (const row of rows) values.set(row[key], (values.get(row[key]) || 0) + row.count); return [...values].map(([value, count]) => ({ value, count })); }
function unionFor(days, platforms, buckets, type) { return unionSets(days.flatMap(day => platforms.map(platform => new Set(buckets.get(`${type}:${day}:${platform}`) || [])))); }
function unionSets(sets) { const result = new Set(); sets.forEach(set => set.forEach(value => result.add(value))); return result; }
function activeKey(day, platform, version) { return version === 'all' ? `emberlist:analytics:v2:active:${day}:${platform}` : `emberlist:analytics:v2:active:${day}:${platform}:${version}`; }
function cohortKey(day, platform, version) { return version === 'all' ? `emberlist:analytics:v2:cohort:${day}:${platform}` : `emberlist:analytics:v2:cohort:${day}:${platform}:${version}`; }
function percent(numerator, denominator) { return denominator ? Number(((numerator / denominator) * 100).toFixed(1)) : 0; }
function validDay(value) { return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)); }
function shiftDay(day, amount) { const date = new Date(`${day}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); }
function daysBetween(from, to) { return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000); }
function dateRange(from, to) { const days = []; for (let day = from; day <= to; day = shiftDay(day, 1)) days.push(day); return days; }
function requestError(message) { const error = new Error(message); error.statusCode = 400; return error; }
