import type { Session, SupabaseClient } from '@supabase/supabase-js'
import type { PersonnelUser } from '../types'
import { fromDbPersonnelUser } from './supabaseClient'

type RpcResult = {
  data: unknown
  error: { message: string } | null
}

export async function ensureCloudSession(client: SupabaseClient): Promise<Session> {
  const current = await client.auth.getSession()
  if (current.error) throw new Error(current.error.message)
  if (current.data.session) return current.data.session

  const created = await client.auth.signInAnonymously()
  if (created.error) {
    throw new Error(`無法建立多人協作工作階段：${created.error.message}`)
  }
  if (!created.data.session) throw new Error('無法建立多人協作工作階段。')
  return created.data.session
}

export async function claimPersonnelSession(
  client: SupabaseClient,
  personnelId: string,
  password: string,
): Promise<PersonnelUser> {
  await ensureCloudSession(client)
  const { data, error } = await client.rpc('claim_personnel_session', {
    p_personnel_id: personnelId,
    p_password: password || null,
  }) as RpcResult
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object') throw new Error('伺服器沒有回傳人員身份。')
  return fromDbPersonnelUser(data)
}

export async function restorePersonnelSession(client: SupabaseClient): Promise<PersonnelUser | null> {
  await ensureCloudSession(client)
  const { data, error } = await client.rpc('get_current_personnel_session') as RpcResult
  if (error) throw new Error(error.message)
  if (!data || typeof data !== 'object') return null
  return fromDbPersonnelUser(data)
}

export async function releasePersonnelSession(client: SupabaseClient): Promise<void> {
  const { error } = await client.rpc('release_personnel_session') as RpcResult
  if (error) throw new Error(error.message)
}
