import { describe, expect, it } from 'vitest';
import { resolveBannerAutoDismissMs, shouldDismissBannerOnNavigation } from './banner';

describe('banner behavior helpers', () => {
  it('keeps error banners open until dismissed', () => {
    expect(resolveBannerAutoDismissMs({ tone: 'error' })).toBeNull();
  });

  it('gives undo banners a longer default lifetime', () => {
    expect(resolveBannerAutoDismissMs({ tone: 'success', actionLabel: 'Undo' })).toBe(8000);
  });

  it('uses the short default lifetime for normal success banners', () => {
    expect(resolveBannerAutoDismissMs({ tone: 'success' })).toBe(4000);
  });

  it('honors explicit auto-dismiss overrides', () => {
    expect(resolveBannerAutoDismissMs({ tone: 'info', actionLabel: 'Undo', autoDismissMs: 1200 })).toBe(1200);
  });

  it('keeps persistent undo banners across route changes', () => {
    expect(shouldDismissBannerOnNavigation({ persistOnNavigation: true })).toBe(false);
    expect(shouldDismissBannerOnNavigation({ persistOnNavigation: false })).toBe(true);
    expect(shouldDismissBannerOnNavigation(null)).toBe(true);
  });
});
