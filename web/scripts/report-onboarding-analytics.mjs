const [from, to = from] = process.argv.slice(2);
if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
  console.error('Usage: node scripts/report-onboarding-analytics.mjs YYYY-MM-DD [YYYY-MM-DD]');
  process.exitCode = 1;
} else {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) throw new Error('UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required.');
  const rows = [];
  for (const day of dateRange(from, to)) {
    for (const platform of ['web', 'android']) {
      const result = await command(url, token, ['HGETALL', `emberlist:analytics:onboarding:${day}:${platform}:v2`]);
      for (let index = 0; index < (result?.length || 0); index += 2) {
        rows.push(parseMetric(platform, result[index], Number(result[index + 1] || 0)));
      }
    }
  }

  const funnel = ['web', 'android'].map(platform => {
    const viewed = sum(rows, platform, 'onboarding_viewed');
    const completed = sum(rows, platform, 'onboarding_completed');
    return {
      platform,
      viewed,
      primaryClicks: sum(rows, platform, 'onboarding_primary_clicked'),
      exampleClicks: sum(rows, platform, 'onboarding_example_clicked'),
      skipped: sum(rows, platform, 'onboarding_skipped'),
      completed,
      conversion: viewed ? `${((completed / viewed) * 100).toFixed(1)}%` : 'n/a',
    };
  });
  console.log(`Onboarding v2: ${from} through ${to}`);
  console.table(funnel);
  console.log('Restore results');
  console.table(propertyBreakdown(rows, 'onboarding_restore_result', 'result'));
  console.log('Completion methods');
  console.table(propertyBreakdown(rows, 'onboarding_completed', 'method'));
  console.log('Activation elapsed buckets');
  console.table(propertyBreakdown(rows, 'onboarding_completed', 'elapsedBucket'));
}

function parseMetric(platform, metric, count) {
  const [event, ...parts] = metric.split('|');
  const properties = Object.fromEntries(parts.map(part => part.split('=')));
  return { platform, event, properties, count };
}

function sum(rows, platform, event) {
  return rows.filter(row => row.platform === platform && row.event === event)
    .reduce((total, row) => total + row.count, 0);
}

function propertyBreakdown(rows, event, property) {
  const totals = new Map();
  for (const row of rows.filter(value => value.event === event && value.properties[property])) {
    const key = `${row.platform}:${row.properties[property]}`;
    totals.set(key, (totals.get(key) || 0) + row.count);
  }
  return [...totals].map(([key, count]) => {
    const [platform, value] = key.split(':');
    return { platform, [property]: value, count };
  });
}

async function command(url, token, body) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`Upstash returned ${response.status}.`);
  return (await response.json()).result;
}

function dateRange(from, to) {
  const values = [];
  for (
    let current = new Date(`${from}T00:00:00Z`), end = new Date(`${to}T00:00:00Z`);
    current <= end;
    current.setUTCDate(current.getUTCDate() + 1)
  ) values.push(current.toISOString().slice(0, 10));
  return values;
}
