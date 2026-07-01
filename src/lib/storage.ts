import type { ChangeRequest, PersonnelUser } from '../types'
import { fromDbRequest, isCloudConfigured, supabase, toDbRequest } from './supabaseClient'
import { DEFAULT_REQUEST_SOURCES } from './requestSources'

const LOCAL_KEY = 'sqms-change-requests-v1'

function nowIso() {
  return new Date().toISOString()
}

function normalizeLoadedRequest(request: ChangeRequest): ChangeRequest {
  return { ...request, requestSource: request.requestSource || DEFAULT_REQUEST_SOURCES[0] }
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
    requestSource: '外部檢查',
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
    return (data ?? []).map(fromDbRequest).map(normalizeLoadedRequest)
  }
  const raw = localStorage.getItem(LOCAL_KEY)
  return raw ? JSON.parse(raw).map(normalizeLoadedRequest) : []
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

export async function updateRequestStatus(id: string, status: ChangeRequest['status'], completionDate?: string): Promise<ChangeRequest> {
  const updatedAt = nowIso()
  if (isCloudConfigured && supabase) {
    const { data, error } = await supabase
      .from('change_requests')
      .update({ status, completion_date: completionDate || null, updated_at: updatedAt })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return fromDbRequest(data)
  }
  const existing = await loadRequests()
  const next = existing.map((item) => item.id === id ? { ...item, status, completionDate: completionDate || undefined, updatedAt } : item)
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  const saved = next.find((item) => item.id === id)
  if (!saved) throw new Error('找不到要更新的需求')
  return saved
}

export async function softDeleteRequest(id: string, deletedBy = 'admin', personnel?: PersonnelUser | null): Promise<void> {
  if (isCloudConfigured && supabase) {
    if (personnel?.role === 'admin') {
      if (!personnel.id) throw new Error('人員管理員身份缺少雲端 ID，請重新進行人員登入 / 切換後再刪除。')
      const { data, error } = await supabase.rpc('soft_delete_request_by_personnel', {
        p_request_id: id,
        p_personnel_id: personnel.id,
        p_deleted_by: deletedBy,
      })
      if (error) throw error
      if (data !== true) throw new Error('刪除未成功：此人員不是有效管理員，或該需求已不存在。')
      return
    }
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
