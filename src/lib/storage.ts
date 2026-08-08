import type { ChangeRequest } from '../types'
import { buildRequestPatch } from './collaboration'
import { ensureCloudSession } from './cloudSession'
import { executeIdempotentCommand } from './idempotency'
import { DEFAULT_REQUEST_SOURCES } from './requestSources'
import { fromDbRequestRow, RequestGateway } from './requestGateway'
import { isCloudConfigured, supabase } from './supabaseClient'

const LOCAL_KEY = 'sqms-change-requests-v1'
const cloudGateway = supabase ? new RequestGateway(supabase) : null

function nowIso() {
  return new Date().toISOString()
}

function normalizeLoadedRequest(request: ChangeRequest): ChangeRequest {
  return {
    ...request,
    requestSource: request.requestSource || DEFAULT_REQUEST_SOURCES[0],
    remarks: request.remarks || '',
    revision: Number(request.revision || 1),
  }
}

export function makeRequestNo(sequence: number, date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `SQMS-${yyyy}${mm}${dd}-${String(sequence).padStart(2, '0')}`
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
    remarks: '',
    status: 'new',
    createdAt: now,
    updatedAt: now,
    revision: 0,
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
    return (data ?? []).map((row) => fromDbRequestRow(row)).map(normalizeLoadedRequest)
  }
  const raw = localStorage.getItem(LOCAL_KEY)
  return raw ? JSON.parse(raw).map(normalizeLoadedRequest) : []
}

function requestNoPrefix(date = new Date()) {
  const yyyy = date.getFullYear()
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `SQMS-${yyyy}${mm}${dd}-`
}

export async function getNextRequestNo(date = new Date()): Promise<string> {
  const prefix = requestNoPrefix(date)
  if (isCloudConfigured && supabase) return '儲存後自動產生'
  const existing = await loadRequests()
  const maxSeq = existing.reduce((max, item) => {
    if (!item.requestNo?.startsWith(prefix)) return max
    const seq = Number(item.requestNo.slice(prefix.length))
    return Number.isFinite(seq) ? Math.max(max, seq) : max
  }, 0)
  return `${prefix}${String(maxSeq + 1).padStart(2, '0')}`
}

export async function saveRequest(
  request: ChangeRequest,
  baseRequest?: ChangeRequest | null,
  baseRevision = baseRequest?.revision,
): Promise<ChangeRequest> {
  const clean: ChangeRequest = {
    ...request,
    updatedAt: nowIso(),
    revision: baseRequest ? baseRequest.revision + 1 : Math.max(request.revision, 1),
  }
  if (isCloudConfigured && supabase && cloudGateway) {
    await ensureCloudSession(supabase)
    if (baseRequest) {
      const patch = buildRequestPatch(baseRequest, clean)
      if (!Object.keys(patch).length) return baseRequest
      return executeIdempotentCommand((operationId) => (
        cloudGateway.patch(baseRequest.id, baseRevision ?? baseRequest.revision, patch, operationId)
      ))
    }
    return executeIdempotentCommand((operationId) => cloudGateway.create(clean, operationId))
  }
  const existing = await loadRequests()
  const index = existing.findIndex((item) => item.id === clean.id)
  const next = index >= 0 ? existing.map((item) => (item.id === clean.id ? clean : item)) : [clean, ...existing]
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  return clean
}

export async function updateRequestStatus(id: string, status: ChangeRequest['status'], completionDate?: string): Promise<ChangeRequest> {
  const updatedAt = nowIso()
  if (isCloudConfigured && supabase && cloudGateway) {
    await ensureCloudSession(supabase)
    return executeIdempotentCommand((operationId) => (
      cloudGateway.transitionStatus(id, status, completionDate || null, operationId)
    ))
  }
  const existing = await loadRequests()
  const next = existing.map((item) => item.id === id ? {
    ...item,
    status,
    completionDate: completionDate || undefined,
    updatedAt,
    revision: item.revision + 1,
  } : item)
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
  const saved = next.find((item) => item.id === id)
  if (!saved) throw new Error('找不到要更新的需求')
  return saved
}

export async function softDeleteRequest(id: string, deletedBy = 'admin'): Promise<void> {
  if (isCloudConfigured && supabase && cloudGateway) {
    await ensureCloudSession(supabase)
    await executeIdempotentCommand((operationId) => cloudGateway.softDelete(id, operationId))
    return
  }
  const existing = await loadRequests()
  const next = existing.map((item) =>
    item.id === id ? { ...item, isDeleted: true, deletedAt: nowIso(), deletedBy, revision: item.revision + 1 } : item,
  )
  localStorage.setItem(LOCAL_KEY, JSON.stringify(next))
}
