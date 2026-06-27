import type { ChangeRequest } from '../types'
import { fromDbRequest, isCloudConfigured, supabase, toDbRequest } from './supabaseClient'

const LOCAL_KEY = 'sqms-change-requests-v1'

function nowIso() {
  return new Date().toISOString()
}

export function makeRequestNo(sequence: number, date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  return `SQMS-${yyyy}${mm}-${String(sequence).padStart(3, '0')}`
}

export function createBlankRequest(sequence: number): ChangeRequest {
  const now = nowIso()
  return {
    id: crypto.randomUUID(),
    requestNo: makeRequestNo(sequence),
    applicantName: '',
    categoryCode: 'SMI',
    topicCode: 'SMI-01',
    manualItemCode: '',
    scopeNote: '',
    suggestedChange: '',
    changeReason: '',
    targetDueDate: '',
    urgency: 'medium',
    needRelatedFormUpdate: false,
    referenceMaterials: '',
    status: 'new',
    createdAt: now,
    updatedAt: now,
    isDeleted: false,
  }
}

export async function loadRequests(): Promise<ChangeRequest[]> {
  if (isCloudConfigured && supabase) {
    const { data, error } = await supabase
      .from('change_requests')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []).map(fromDbRequest)
  }
  const raw = localStorage.getItem(LOCAL_KEY)
  return raw ? JSON.parse(raw) : []
}

export async function saveRequest(request: ChangeRequest): Promise<ChangeRequest> {
  const clean: ChangeRequest = { ...request, updatedAt: nowIso() }
  if (isCloudConfigured && supabase) {
    const { data, error } = await supabase
      .from('change_requests')
      .upsert(toDbRequest(clean), { onConflict: 'id' })
      .select('*')
      .single()
    if (error) throw error
    return fromDbRequest(data)
  }
  const existing = await loadRequests()
  const index = existing.findIndex((item) => item.id === clean.id)
  const next = index >= 0 ? existing.map((item) => (item.id === clean.id ? clean : item)) : [clean, ...existing]
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  return clean
}

export async function softDeleteRequest(id: string, deletedBy = 'admin'): Promise<void> {
  if (isCloudConfigured && supabase) {
    const { error } = await supabase
      .from('change_requests')
      .update({ is_deleted: true, deleted_at: nowIso(), deleted_by: deletedBy })
      .eq('id', id)
    if (error) throw error
    return
  }
  const existing = await loadRequests()
  const next = existing.map((item) =>
    item.id === id ? { ...item, isDeleted: true, deletedAt: nowIso(), deletedBy } : item,
  )
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
}
