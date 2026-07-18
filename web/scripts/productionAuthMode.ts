const LEGACY_SPA_AUTH_MODE = 'legacy_spa'

export function assertSafeProductionAuthMode(authMode: string | undefined): void {
  if (authMode?.trim().toLowerCase() === LEGACY_SPA_AUTH_MODE) {
    throw new Error(
      'Production builds cannot use VITE_GOOGLE_AUTH_MODE=legacy_spa. Use the backend OAuth flow instead.',
    )
  }
}
