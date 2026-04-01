export type BannerBehavior = {
  tone: 'success' | 'error' | 'info';
  actionLabel?: string;
  persistOnNavigation?: boolean;
  autoDismissMs?: number;
};

export function resolveBannerAutoDismissMs(banner: BannerBehavior | null): number | null {
  if (!banner || banner.tone === 'error') return null;
  if (typeof banner.autoDismissMs === 'number') return banner.autoDismissMs;
  return banner.actionLabel ? 8_000 : 4_000;
}

export function shouldDismissBannerOnNavigation(banner: Pick<BannerBehavior, 'persistOnNavigation'> | null): boolean {
  return !banner?.persistOnNavigation;
}
