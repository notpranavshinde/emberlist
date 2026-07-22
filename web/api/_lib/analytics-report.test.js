import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadAnalyticsReport, parseDashboardFilters } from './analytics-report.js';

describe('analytics report filters', () => {
  const now = new Date('2026-07-21T10:00:00Z');
  it('uses a 30-day UTC range by default', () => {
    expect(parseDashboardFilters(new URLSearchParams(), now)).toMatchObject({ from: '2026-06-22', to: '2026-07-21', platform: 'all', version: 'all' });
  });
  it('accepts platform/version/comparison filters', () => {
    const filters = parseDashboardFilters(new URLSearchParams('from=2026-07-15&to=2026-07-21&platform=android&version=0.1.1&compare=true'), now);
    expect(filters).toEqual({ from: '2026-07-15', to: '2026-07-21', platform: 'android', version: '0.1.1', compare: true });
  });
  it('rejects future, reversed, and over-400-day ranges', () => {
    expect(() => parseDashboardFilters(new URLSearchParams('to=2026-07-22'), now)).toThrow('Invalid date range');
    expect(() => parseDashboardFilters(new URLSearchParams('from=2026-07-21&to=2026-07-20'), now)).toThrow('Invalid date range');
    expect(() => parseDashboardFilters(new URLSearchParams('from=2025-01-01&to=2026-07-21'), now)).toThrow('Invalid date range');
  });
});

describe('analytics metric definitions', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('calculates distinct activity, funnel, completion, sync, error, adoption, and exact-day retention', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url, options) => {
      const commands = JSON.parse(options.body);
      return { ok: true, json: async () => commands.map(command => ({ result: redisResult(command) })) };
    }));
    const report = await loadAnalyticsReport(
      { from: '2026-07-21', to: '2026-07-21', platform: 'all', version: 'all', compare: false },
      { UPSTASH_REDIS_REST_URL: 'https://redis.example', UPSTASH_REDIS_REST_TOKEN: 'token', ANALYTICS_V2_ROLLOUT_DATE: '2026-07-21' },
    );
    expect(report.summary).toMatchObject({ activeInstalls: 2, dau: 2, wau: 2, mau: 2, newInstalls: 1, sessions: 3, tasksCreated: 5, tasksCompleted: 4, taskCompletionRatio: 80, activationConversion: 80, syncSuccess: 75, errorRate: 4.2 });
    expect(report.featureAdoption.find(row => row.feature === 'projects')).toMatchObject({ count: 1, percentage: 50 });
    expect(report.retention.cohorts[0]).toMatchObject({ day: '2026-07-21', size: 1, d1: 100 });
  });
});

function redisResult(command) {
  const [operation, key] = command;
  if (operation === 'HGETALL' && key === 'emberlist:analytics:v2:counters:2026-07-21:web') return [
    '1.0|app_opened', '3', '1.0|task_create_result|result=success', '5', '1.0|task_completed', '4',
    '1.0|onboarding_viewed', '4', '1.0|onboarding_completed|elapsedBucket=under_30s|method=first_task', '3',
    '1.0|sync_action|action=sync|result=success', '3', '1.0|sync_action|action=sync|result=failure', '1',
    '1.0|operation_error|action=sync|errorCategory=network', '1',
  ];
  if (operation === 'HGETALL' && key === 'emberlist:analytics:onboarding:2026-07-21:web:v2') return ['onboarding_viewed', '1', 'onboarding_completed|method=first_task', '1'];
  if (operation === 'SMEMBERS' && key === 'emberlist:analytics:v2:active:2026-07-21:web') return ['a', 'b'];
  if (operation === 'SMEMBERS' && key === 'emberlist:analytics:v2:cohort:2026-07-21:web') return ['b'];
  if (operation === 'SMEMBERS' && key === 'emberlist:analytics:v2:active:2026-07-22:web') return ['b'];
  if (operation === 'SMEMBERS' && key === 'emberlist:analytics:v2:feature:2026-07-21:web:all:projects') return ['a'];
  return [];
}
