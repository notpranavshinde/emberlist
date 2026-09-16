import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_SESSION_COOKIE, buildAdminGoogleAuthUrl, getAdminConfig, readAdminSession, setAdminSession } from './admin-auth.js';

const env = { GOOGLE_CLIENT_ID: 'client', GOOGLE_CLIENT_SECRET: 'secret', EMBERLIST_ADMIN_AUTH_SECRET: 'x'.repeat(32), EMBERLIST_ANALYTICS_ADMIN_EMAILS: 'admin@example.com' };

afterEach(() => { vi.unstubAllEnvs(); });
function setEnv() { Object.entries(env).forEach(([key, value]) => vi.stubEnv(key, value)); }

describe('private analytics admin auth', () => {
  it('requests profile-only scopes with the dedicated callback', () => {
    setEnv();
    const url = new URL(buildAdminGoogleAuthUrl({ headers: { host: 'emberlist.dev', 'x-forwarded-proto': 'https' } }, 'nonce'));
    expect(url.searchParams.get('scope')).toBe('openid email');
    expect(url.searchParams.get('redirect_uri')).toBe('https://emberlist.dev/api/admin/auth/google/callback');
    expect(url.searchParams.get('scope')).not.toContain('drive');
  });

  it('normalizes the exact email allowlist', () => {
    setEnv(); vi.stubEnv('EMBERLIST_ANALYTICS_ADMIN_EMAILS', ' ADMIN@EXAMPLE.COM,second@example.com ');
    expect(getAdminConfig().emails.has('admin@example.com')).toBe(true);
    expect(getAdminConfig().emails.has('admin+other@example.com')).toBe(false);
  });

  it('uses an isolated secure 12-hour cookie and rejects expired sessions', () => {
    setEnv();
    const headers = new Map();
    const res = { getHeader: key => headers.get(key), setHeader: (key, value) => headers.set(key, value) };
    vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    setAdminSession(res, 'Admin@Example.com');
    const cookie = String(headers.get('Set-Cookie'));
    expect(cookie).toContain(`${ADMIN_SESSION_COOKIE}=`); expect(cookie).toContain('HttpOnly'); expect(cookie).toContain('Secure'); expect(cookie).toContain('SameSite=Lax'); expect(cookie).toContain('Max-Age=43200');
    const request = { headers: { cookie: cookie.split(';')[0] } };
    expect(readAdminSession(request, 1_000_001)?.email).toBe('admin@example.com');
    expect(readAdminSession(request, 1_000_000 + 12 * 60 * 60 * 1_000 + 1)).toBeNull();
    vi.restoreAllMocks();
  });
});
