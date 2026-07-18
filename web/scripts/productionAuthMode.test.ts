import { describe, expect, it } from 'vitest'
import { assertSafeProductionAuthMode } from './productionAuthMode.ts'

describe('assertSafeProductionAuthMode', () => {
  it('rejects legacy SPA auth for production builds', () => {
    expect(() => assertSafeProductionAuthMode('legacy_spa')).toThrow(
      'Production builds cannot use VITE_GOOGLE_AUTH_MODE=legacy_spa',
    )
    expect(() => assertSafeProductionAuthMode(' LEGACY_SPA ')).toThrow()
  })

  it('allows the backend flow and an unset mode', () => {
    expect(() => assertSafeProductionAuthMode('backend')).not.toThrow()
    expect(() => assertSafeProductionAuthMode(undefined)).not.toThrow()
  })
})
