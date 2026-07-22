import { loadAnalyticsReport, parseDashboardFilters } from '../_lib/analytics-report.js';
import { requireAdmin } from '../_lib/admin-auth.js';
import { json, setNoStore } from '../_lib/auth.js';
import { enforceRateLimit } from '../_lib/rate-limit.js';

export default async function handler(req, res) {
  setNoStore(res);
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return json(res, 405, { error: 'method_not_allowed' }); }
  try {
    requireAdmin(req);
    await enforceRateLimit(req, res, { name: 'admin-analytics', limit: 60, windowSeconds: 600 });
    const filters = parseDashboardFilters(new URL(req.url, 'https://emberlist.dev').searchParams);
    return json(res, 200, await loadAnalyticsReport(filters));
  } catch (error) { return json(res, error.statusCode || 500, { error: error.statusCode === 401 ? 'unauthorized' : 'analytics_unavailable', message: error.message }); }
}
