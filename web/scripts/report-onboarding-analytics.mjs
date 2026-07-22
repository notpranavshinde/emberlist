const [from, to = from, platformArg = 'all'] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '') || !['all', 'web', 'android'].includes(platformArg)) {
  console.error('Usage: node scripts/report-onboarding-analytics.mjs YYYY-MM-DD [YYYY-MM-DD] [all|web|android]');
  process.exitCode = 1;
} else {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required.');
  const platforms = platformArg === 'all' ? ['web', 'android'] : [platformArg];
  const rows = []; const active = new Set(); const cohorts = new Set(); const features = new Map();
  for (const day of dateRange(from, to)) for (const platform of platforms) {
    const [counters, activeIds, cohortIds, legacy] = await Promise.all([
      command(url, token, ['HGETALL', `emberlist:analytics:v2:counters:${day}:${platform}`]),
      command(url, token, ['SMEMBERS', `emberlist:analytics:v2:active:${day}:${platform}`]),
      command(url, token, ['SMEMBERS', `emberlist:analytics:v2:cohort:${day}:${platform}`]),
      command(url, token, ['HGETALL', `emberlist:analytics:onboarding:${day}:${platform}:v2`]),
    ]);
    for (const id of activeIds || []) active.add(`${platform}:${id}`);
    for (const id of cohortIds || []) cohorts.add(`${platform}:${id}`);
    for (let index = 0; index < (counters?.length || 0); index += 2) rows.push(parseMetric(day, platform, counters[index], Number(counters[index + 1] || 0)));
    for (let index = 0; index < (legacy?.length || 0); index += 2) rows.push(parseLegacy(day, platform, legacy[index], Number(legacy[index + 1] || 0)));
    for (const feature of ['projects', 'sections', 'subtasks', 'recurrence', 'reminders', 'sync', 'backup', 'search', 'organization']) {
      const ids = await command(url, token, ['SMEMBERS', `emberlist:analytics:v2:feature:${day}:${platform}:all:${feature}`]);
      const set = features.get(feature) || new Set();
      for (const id of ids || []) set.add(`${platform}:${id}`);
      features.set(feature, set);
    }
  }
  const successfulCreates = sum(rows, 'task_create_result', { result: 'success' });
  const completed = sum(rows, 'task_completed'); const viewed = sum(rows, 'onboarding_viewed'); const activated = sum(rows, 'onboarding_completed');
  const syncAttempts = rows.filter(row => row.event === 'sync_action' && row.properties.action === 'sync' && ['success', 'failure'].includes(row.properties.result)).reduce((total, row) => total + row.count, 0);
  console.log(`Emberlist product analytics (UTC): ${from} through ${to}`);
  console.table([{
    activeInstalls: active.size, newInstalls: cohorts.size, sessions: sum(rows, 'app_opened'),
    tasksCreated: successfulCreates, tasksCompleted: completed,
    taskCompletionRatio: ratio(completed, successfulCreates), activation: ratio(activated, viewed),
    syncSuccess: ratio(sum(rows, 'sync_action', { action: 'sync', result: 'success' }), syncAttempts),
    errors: sum(rows, 'operation_error'),
  }]);
  console.log('Onboarding funnel (legacy + schema v2)');
  console.table(['onboarding_viewed', 'onboarding_primary_clicked', 'onboarding_example_clicked', 'onboarding_skipped', 'onboarding_restore_started', 'onboarding_completed'].map(event => ({ event, count: sum(rows, event) })));
  console.log('Feature adoption');
  console.table([...features].map(([feature, ids]) => ({ feature, activeInstalls: ids.size, adoption: ratio(ids.size, active.size) })));
  console.log('Versions');
  console.table(group(rows.filter(row => row.version !== 'legacy'), 'version'));
  console.log('Normalized errors');
  console.table(propertyBreakdown(rows, 'operation_error', 'errorCategory'));
}

function parseMetric(day, platform, metric, count) { const [version, event, ...parts] = metric.split('|'); return { day, platform, version, event, properties: Object.fromEntries(parts.map(part => part.split('='))), count }; }
function parseLegacy(day, platform, metric, count) { const [event, ...parts] = metric.split('|'); return { day, platform, version: 'legacy', event, properties: Object.fromEntries(parts.map(part => part.split('='))), count }; }
function sum(rows, event, properties = {}) { return rows.filter(row => row.event === event && Object.entries(properties).every(([key, value]) => row.properties[key] === value)).reduce((total, row) => total + row.count, 0); }
function ratio(value, total) { return total ? `${((value / total) * 100).toFixed(1)}%` : 'n/a'; }
function group(rows, key) { const totals = new Map(); rows.forEach(row => totals.set(row[key], (totals.get(row[key]) || 0) + row.count)); return [...totals].map(([value, count]) => ({ [key]: value, count })); }
function propertyBreakdown(rows, event, property) { const totals = new Map(); rows.filter(row => row.event === event && row.properties[property]).forEach(row => totals.set(row.properties[property], (totals.get(row.properties[property]) || 0) + row.count)); return [...totals].map(([value, count]) => ({ [property]: value, count })); }
async function command(url, token, body) { const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) throw new Error(`Upstash returned ${response.status}.`); return (await response.json()).result; }
function dateRange(start, end) { const values = []; for (let current = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`); current <= last; current.setUTCDate(current.getUTCDate() + 1)) values.push(current.toISOString().slice(0, 10)); return values; }
