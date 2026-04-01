import { describe, expect, it } from 'vitest';
import { resolveGoogleAuthPrompt } from './syncService';

describe('resolveGoogleAuthPrompt', () => {
  it('uses consent for the first interactive sign-in', () => {
    expect(resolveGoogleAuthPrompt(true, false)).toBe('consent');
  });

  it('uses silent auth for reload-time restoration without an in-memory token', () => {
    expect(resolveGoogleAuthPrompt(false, false)).toBe('');
  });

  it('uses silent auth when a token is already present', () => {
    expect(resolveGoogleAuthPrompt(true, true)).toBe('');
    expect(resolveGoogleAuthPrompt(false, true)).toBe('');
  });
});
