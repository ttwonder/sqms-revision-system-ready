import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureCloudSession } from './cloudSession'

describe('cloud collaboration session', () => {
  it('creates one anonymous auth session when the browser has no persisted session', async () => {
    const getSession = vi.fn().mockResolvedValue({ data: { session: null }, error: null })
    const signInAnonymously = vi.fn().mockResolvedValue({
      data: { session: { access_token: 'test-token' } },
      error: null,
    })
    const client = { auth: { getSession, signInAnonymously } } as unknown as SupabaseClient

    const session = await ensureCloudSession(client)

    expect(signInAnonymously).toHaveBeenCalledTimes(1)
    expect(session).toMatchObject({ access_token: 'test-token' })
  })

  it('reuses a persisted session without creating another anonymous user', async () => {
    const persisted = { access_token: 'persisted-token' }
    const getSession = vi.fn().mockResolvedValue({ data: { session: persisted }, error: null })
    const signInAnonymously = vi.fn()
    const client = { auth: { getSession, signInAnonymously } } as unknown as SupabaseClient

    const session = await ensureCloudSession(client)

    expect(signInAnonymously).not.toHaveBeenCalled()
    expect(session).toBe(persisted)
  })
})
