import type { ChangeRequest } from '../types'
import { ensureCloudSession } from './cloudSession'
import { isCloudConfigured, supabase } from './supabaseClient'

const LOCAL_KEY = 'sqms-change-requests-v1'
const MAX_PURGE_COUNT = 100

type UnknownRecord = Record<string, unknown>

export interface DeletedRequestCandidate {
  id: string
  requestNo: string
  applicantName: string
  deletedAt: string
  deletedBy: string
  requestBytes: number
  eventCount: number
  eventBytes: number
  logicalBytes: number
}

export interface SqmsStorageStats {
  ok: true
  source: 'cloud' | 'local-preview'
  generatedAt: string
  databaseTotalBytes: number | null
  appDatabasePhysicalBytes: number | null
  storageObjectBytes: number | null
  storageObjectCount: number | null
  activeRequestBytes: number
  activeRequestCount: number
  deletedRequestBytes: number
  deletedRequestCount: number
  requestEventBytes: number
  requestEventCount: number
  deletedCandidates: DeletedRequestCandidate[]
  staticSiteHost: string
  staticSiteInSupabase: false
  logicalMetric: 'request_rows_and_event_history'
}

export interface PurgeDeletedRequestsInput {
  operationId: string
  expectedRequestIds: string[]
  deleteRequestIds: string[]
}

export interface PurgeDeletedRequestsResult {
  ok: true
  operationId: string
  deletedRequestCount: number
  deletedEventCount: number
  deletedBytes: number
  deletedRequestIds: string[]
  remainingDeletedRequestCount: number
  remainingRequests?: ChangeRequest[]
}

export class DataManagementError extends Error {
  readonly code: string
  readonly definitive: boolean

  constructor(code: string, message = code, definitive = true) {
    super(message)
    this.name = 'DataManagementError'
    this.code = code
    this.definitive = definitive
  }
}

const asObject = (value: unknown): UnknownRecord =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
const asArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []
const asText = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback
const asNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}
const asInteger = (value: unknown) => Math.max(0, Math.trunc(asNumber(value)))
const sortedUnique = (values: string[]) => Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).sort()
const sameStrings = (left: string[], right: string[]) => JSON.stringify(sortedUnique(left)) === JSON.stringify(sortedUnique(right))
const jsonBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength

export function formatDataBytes(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—'
  const bytes = Math.max(0, value)
  if (bytes < 1024) return `${Math.round(bytes)} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let amount = bytes / 1024
  let unitIndex = 0
  while (amount >= 1024 && unitIndex < units.length - 1) {
    amount /= 1024
    unitIndex += 1
  }
  const decimals = amount >= 100 ? 0 : amount >= 10 ? 1 : 2
  return `${amount.toFixed(decimals)} ${units[unitIndex]}`
}

export function dataManagementErrorMessage(error: unknown) {
  const code = error instanceof DataManagementError ? error.code : ''
  const messages: Record<string, string> = {
    FORBIDDEN: '目前身份無權查看或清理資料空間。',
    DATA_MANAGEMENT_SQL_NOT_DEPLOYED: 'Supabase 資料與空間管理 SQL 尚未部署。',
    DELETED_SET_CHANGED: '預覽後可清理資料集合已變更；本次未刪除，請刷新後重新選擇。',
    INVALID_PAYLOAD: '刪除選擇無效，未執行任何永久刪除。',
    IDEMPOTENCY_MISMATCH: '操作識別碼與本次選擇不一致，已停止。',
    BATCH_LIMIT_EXCEEDED: `單次最多永久刪除 ${MAX_PURGE_COUNT} 筆。`,
    CLOUD_SESSION_FAILED: '無法建立雲端工作階段，未執行任何刪除。',
  }
  if (code && messages[code]) return messages[code]
  if (error instanceof Error && error.message) return error.message
  return '資料與空間管理操作失敗。'
}

export function buildLocalSqmsStorageStats(requests: ChangeRequest[]): SqmsStorageStats {
  const active = requests.filter((request) => !request.isDeleted)
  const deleted = requests.filter((request) => request.isDeleted)
  const activeRequestBytes = active.reduce((sum, request) => sum + jsonBytes(request), 0)
  const deletedCandidates = deleted.map((request) => {
    const requestBytes = jsonBytes(request)
    return {
      id: request.id,
      requestNo: request.requestNo,
      applicantName: request.applicantName,
      deletedAt: request.deletedAt ?? '',
      deletedBy: request.deletedBy ?? '未記錄',
      requestBytes,
      eventCount: 0,
      eventBytes: 0,
      logicalBytes: requestBytes,
    }
  }).sort((left, right) => right.deletedAt.localeCompare(left.deletedAt) || left.requestNo.localeCompare(right.requestNo))
  return {
    ok: true,
    source: 'local-preview',
    generatedAt: new Date().toISOString(),
    databaseTotalBytes: null,
    appDatabasePhysicalBytes: null,
    storageObjectBytes: null,
    storageObjectCount: null,
    activeRequestBytes,
    activeRequestCount: active.length,
    deletedRequestBytes: deletedCandidates.reduce((sum, row) => sum + row.requestBytes, 0),
    deletedRequestCount: deleted.length,
    requestEventBytes: 0,
    requestEventCount: 0,
    deletedCandidates,
    staticSiteHost: 'GitHub Pages',
    staticSiteInSupabase: false,
    logicalMetric: 'request_rows_and_event_history',
  }
}

export function purgeLocalDeletedRequests(
  requests: ChangeRequest[],
  expectedRequestIds: string[],
  deleteRequestIds: string[],
): PurgeDeletedRequestsResult {
  const currentDeletedIds = requests.filter((request) => request.isDeleted).map((request) => request.id)
  const chosen = sortedUnique(deleteRequestIds)
  if (!sameStrings(currentDeletedIds, expectedRequestIds)) throw new DataManagementError('DELETED_SET_CHANGED')
  if (!chosen.length || chosen.length > MAX_PURGE_COUNT || chosen.some((id) => !currentDeletedIds.includes(id))) {
    throw new DataManagementError(chosen.length > MAX_PURGE_COUNT ? 'BATCH_LIMIT_EXCEEDED' : 'INVALID_PAYLOAD')
  }
  const chosenSet = new Set(chosen)
  const deletedBytes = requests
    .filter((request) => request.isDeleted && chosenSet.has(request.id))
    .reduce((sum, request) => sum + jsonBytes(request), 0)
  const remainingRequests = requests.filter((request) => !(request.isDeleted && chosenSet.has(request.id)))
  return {
    ok: true,
    operationId: crypto.randomUUID(),
    deletedRequestCount: chosen.length,
    deletedEventCount: 0,
    deletedBytes,
    deletedRequestIds: chosen,
    remainingDeletedRequestCount: currentDeletedIds.length - chosen.length,
    remainingRequests,
  }
}

function parseStats(value: unknown): SqmsStorageStats {
  const response = asObject(value)
  if (response.ok !== true) throw new DataManagementError(asText(response.error, 'INVALID_RESPONSE'))
  const deletedCandidates = asArray(response.deletedCandidates).map((value) => {
    const row = asObject(value)
    return {
      id: asText(row.id),
      requestNo: asText(row.requestNo),
      applicantName: asText(row.applicantName),
      deletedAt: asText(row.deletedAt),
      deletedBy: asText(row.deletedBy, '未記錄'),
      requestBytes: asNumber(row.requestBytes),
      eventCount: asInteger(row.eventCount),
      eventBytes: asNumber(row.eventBytes),
      logicalBytes: asNumber(row.logicalBytes),
    } satisfies DeletedRequestCandidate
  }).filter((row) => row.id && row.requestNo)
  return {
    ok: true,
    source: 'cloud',
    generatedAt: asText(response.generatedAt),
    databaseTotalBytes: asNumber(response.databaseTotalBytes),
    appDatabasePhysicalBytes: asNumber(response.appDatabasePhysicalBytes),
    storageObjectBytes: asNumber(response.storageObjectBytes),
    storageObjectCount: asInteger(response.storageObjectCount),
    activeRequestBytes: asNumber(response.activeRequestBytes),
    activeRequestCount: asInteger(response.activeRequestCount),
    deletedRequestBytes: asNumber(response.deletedRequestBytes),
    deletedRequestCount: asInteger(response.deletedRequestCount),
    requestEventBytes: asNumber(response.requestEventBytes),
    requestEventCount: asInteger(response.requestEventCount),
    deletedCandidates,
    staticSiteHost: asText(response.staticSiteHost, 'GitHub Pages'),
    staticSiteInSupabase: false,
    logicalMetric: 'request_rows_and_event_history',
  }
}

export async function getSqmsStorageStats(localRequests: ChangeRequest[]): Promise<SqmsStorageStats> {
  if (!isCloudConfigured || !supabase) return buildLocalSqmsStorageStats(localRequests)
  try {
    await ensureCloudSession(supabase)
  } catch (error) {
    throw new DataManagementError('CLOUD_SESSION_FAILED', error instanceof Error ? error.message : 'Cloud session failed', false)
  }
  const { data, error } = await supabase.rpc('get_sqms_storage_stats')
  if (error) {
    const code = String(error.code || '')
    if (code === 'PGRST202' || code === '42883') throw new DataManagementError('DATA_MANAGEMENT_SQL_NOT_DEPLOYED', error.message)
    throw new DataManagementError(code || 'RPC_FAILED', error.message, false)
  }
  return parseStats(data)
}

export async function purgeSqmsDeletedRequests(
  input: PurgeDeletedRequestsInput,
  localRequests: ChangeRequest[],
): Promise<PurgeDeletedRequestsResult> {
  if (!isCloudConfigured || !supabase) {
    const result = purgeLocalDeletedRequests(localRequests, input.expectedRequestIds, input.deleteRequestIds)
    const completed = { ...result, operationId: input.operationId }
    localStorage.setItem(LOCAL_KEY, JSON.stringify(completed.remainingRequests ?? localRequests))
    return completed
  }
  try {
    await ensureCloudSession(supabase)
  } catch (error) {
    throw new DataManagementError('CLOUD_SESSION_FAILED', error instanceof Error ? error.message : 'Cloud session failed', false)
  }
  const { data, error } = await supabase.rpc('purge_sqms_deleted_requests', {
    p_operation_id: input.operationId,
    p_expected_request_ids: sortedUnique(input.expectedRequestIds),
    p_delete_request_ids: sortedUnique(input.deleteRequestIds),
  })
  if (error) {
    const code = String(error.code || '')
    if (code === 'PGRST202' || code === '42883') throw new DataManagementError('DATA_MANAGEMENT_SQL_NOT_DEPLOYED', error.message)
    throw new DataManagementError(code || 'RPC_FAILED', error.message, false)
  }
  const response = asObject(data)
  if (response.ok !== true) throw new DataManagementError(asText(response.error, 'INVALID_RESPONSE'))
  return {
    ok: true,
    operationId: asText(response.operationId, input.operationId),
    deletedRequestCount: asInteger(response.deletedRequestCount),
    deletedEventCount: asInteger(response.deletedEventCount),
    deletedBytes: asNumber(response.deletedBytes),
    deletedRequestIds: sortedUnique(asArray(response.deletedRequestIds).map((value) => asText(value))),
    remainingDeletedRequestCount: asInteger(response.remainingDeletedRequestCount),
  }
}
