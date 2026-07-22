import crypto from 'node:crypto';
import {
  assertSameOrigin, clearCookie, fetchGoogleProfile, getOrigin, readEncryptedCookie,
  setEncryptedCookie,
} from './auth.js';

export const ADMIN_SESSION_COOKIE = '__Host-emberlist_admin';
export const ADMIN_STATE_COOKIE = '__Host-emberlist_admin_state';
export const ADMIN_SESSION_SECONDS = 12 * 60 * 60;
const ADMIN_STATE_SECONDS = 10 * 60;

export function getAdminConfig() {
  const clientId = process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
  const secret = process.env.EMBERLIST_ADMIN_AUTH_SECRET || '';
  const emails = new Set((process.env.EMBERLIST_ANALYTICS_ADMIN_EMAILS || '').split(',').map(value => value.trim().toLowerCase()).filter(Boolean));
  if (!clientId || !clientSecret || secret.length < 32 || !emails.size) {
    const error = new Error('Admin authentication is not configured.'); error.statusCode = 503; throw error;
  }
  return { clientId, clientSecret, secret, emails };
}

export function buildAdminGoogleAuthUrl(req, nonce) {
  const { clientId } = getAdminConfig();
  return `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId, redirect_uri: `${getOrigin(req)}/api/admin/auth/google/callback`,
    response_type: 'code', scope: 'openid email', state: nonce, prompt: 'select_account',
  })}`;
}

export function setAdminState(res, nonce) {
  const { secret } = getAdminConfig();
  setEncryptedCookie(res, ADMIN_STATE_COOKIE, { nonce, createdAt: Date.now() }, secret, ADMIN_STATE_SECONDS);
}

export function readAdminState(req, now = Date.now()) {
  const { secret } = getAdminConfig();
  const state = readEncryptedCookie(req, ADMIN_STATE_COOKIE, secret);
  if (!state || typeof state.nonce !== 'string' || !validAge(state.createdAt, ADMIN_STATE_SECONDS, now)) return null;
  return state;
}

export function clearAdminState(res) { clearCookie(res, ADMIN_STATE_COOKIE); }

export function setAdminSession(res, email) {
  const { secret } = getAdminConfig();
  setEncryptedCookie(res, ADMIN_SESSION_COOKIE, { email: email.toLowerCase(), createdAt: Date.now() }, secret, ADMIN_SESSION_SECONDS);
}

export function readAdminSession(req, now = Date.now()) {
  const { secret, emails } = getAdminConfig();
  const session = readEncryptedCookie(req, ADMIN_SESSION_COOKIE, secret);
  if (!session || typeof session.email !== 'string' || !validAge(session.createdAt, ADMIN_SESSION_SECONDS, now)) return null;
  const email = session.email.trim().toLowerCase();
  return emails.has(email) ? { email, createdAt: session.createdAt } : null;
}

export function requireAdmin(req) {
  const session = readAdminSession(req);
  if (!session) { const error = new Error('Authentication required.'); error.statusCode = 401; throw error; }
  return session;
}

export function clearAdminSession(res) { clearCookie(res, ADMIN_SESSION_COOKIE); }
export function assertAdminSameOrigin(req) { assertSameOrigin(req); }

export async function exchangeAdminCode(req, code) {
  const { clientId, clientSecret } = getAdminConfig();
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code,
      grant_type: 'authorization_code', redirect_uri: `${getOrigin(req)}/api/admin/auth/google/callback` }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || typeof body.access_token !== 'string') { const error = new Error('Google authentication failed.'); error.statusCode = 401; throw error; }
  return fetchGoogleProfile(body.access_token);
}

export function newAdminNonce() { return crypto.randomUUID(); }

function validAge(createdAt, seconds, now) {
  return Number.isFinite(createdAt) && createdAt <= now && now - createdAt <= seconds * 1_000;
}
