import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChangeRequest } from '../types'
import type { RequestPatch } from './collaboration'

export type DbRequestRow = {
  id: string
  request_no: string
  applicant_name: string
  request_source: string
  category_code: string
  topic_code: string
  manual_item_code: string | null
  scope_note: string | null
  suggested_change: string
  change_reason: string
  target_due_date: string | null
  urgency: ChangeRequest['urgency']
  need_related_form_update: boolean
  reference_materials: string | null
  remarks: string | null
  status: ChangeRequest['status']
  completion_date: string | null
  public_edit_note: string | null
  created_at: string
  updated_at: string
  revision: number
  deleted_at: string | null
  deleted_by: string | null
}

type RpcError = { message: string }

type RpcResult = {
  data: unknown
  error: RpcError | null
}

const toNullableText = (value: string | undefined) => value?.trim() || null

function requestPayload(request: ChangeRequest) {
  return {
    applicant_name: request.applicantName.trim(),
    request_source: request.requestSource,
    category_code: request.categoryCode,
    topic_code: request.topicCode,
    manual_item_code: toNullableText(request.manualItemCode),
    scope_note: toNullableText(request.scopeNote),
    suggested_change: request.suggestedChange.trim(),
    change_reason: request.changeReason.trim(),
    target_due_date: request.targetDueDate || null,
    urgency: request.urgency,
    need_related_form_update: request.needRelatedFormUpdate,
    reference_materials: toNullableText(request.referenceMaterials),
    remarks: toNullableText(request.remarks),
    public_edit_note: toNullableText(request.publicEditNote),
  }
}

const requestPatchFieldMap: Record<keyof RequestPatch, string> = {
  applicantName: 'applicant_name',
  requestSource: 'request_source',
  categoryCode: 'category_code',
  topicCode: 'topic_code',
  manualItemCode: 'manual_item_code',
  scopeNote: 'scope_note',
  suggestedChange: 'suggested_change',
  changeReason: 'change_reason',
  targetDueDate: 'target_due_date',
  urgency: 'urgency',
  needRelatedFormUpdate: 'need_related_form_update',
  referenceMaterials: 'reference_materials',
  remarks: 'remarks',
  publicEditNote: 'public_edit_note',
}

export function toDbRequestPatch(patch: RequestPatch): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).map(([field, value]) => [
      requestPatchFieldMap[field as keyof RequestPatch],
      typeof value === 'string' ? value.trim() || null : value,
    ]),
  )
}

export function fromDbRequestRow(row: DbRequestRow): ChangeRequest {
  return {
    id: row.id,
    requestNo: row.request_no,
    applicantName: row.applicant_name,
    requestSource: row.request_source,
    categoryCode: row.category_code,
    topicCode: row.topic_code,
    manualItemCode: row.manual_item_code ?? '',
    scopeNote: row.scope_note ?? '',
    suggestedChange: row.suggested_change,
    changeReason: row.change_reason,
    targetDueDate: row.target_due_date ?? '',
    urgency: row.urgency,
    needRelatedFormUpdate: row.need_related_form_update,
    referenceMaterials: row.reference_materials ?? '',
    remarks: row.remarks ?? '',
    status: row.status,
    completionDate: row.completion_date ?? undefined,
    publicEditNote: row.public_edit_note ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    revision: Number(row.revision || 1),
    isDeleted: Boolean(row.deleted_at),
    deletedAt: row.deleted_at ?? undefined,
    deletedBy: row.deleted_by ?? undefined,
  }
}

function requireRow(data: unknown): DbRequestRow {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object') throw new Error('伺服器沒有回傳需求資料。')
  return row as DbRequestRow
}

export class RequestGateway {
  private readonly client: SupabaseClient

  constructor(client: SupabaseClient) {
    this.client = client
  }

  private async rpc(functionName: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await this.client.rpc(functionName, args) as RpcResult
    if (error) throw new Error(error.message)
    return data
  }

  async create(request: ChangeRequest, operationId: string): Promise<ChangeRequest> {
    const data = await this.rpc('create_change_request', {
      p_operation_id: operationId,
      p_payload: requestPayload(request),
    })
    return fromDbRequestRow(requireRow(data))
  }

  async patch(
    requestId: string,
    baseRevision: number,
    patch: RequestPatch,
    operationId: string,
  ): Promise<ChangeRequest> {
    const data = await this.rpc('patch_change_request', {
      p_operation_id: operationId,
      p_request_id: requestId,
      p_base_revision: baseRevision,
      p_patch: toDbRequestPatch(patch),
    })
    return fromDbRequestRow(requireRow(data))
  }

  async transitionStatus(
    requestId: string,
    status: ChangeRequest['status'],
    completionDate: string | null,
    operationId: string,
  ): Promise<ChangeRequest> {
    const data = await this.rpc('transition_change_request_status', {
      p_operation_id: operationId,
      p_request_id: requestId,
      p_status: status,
      p_completion_date: completionDate,
    })
    return fromDbRequestRow(requireRow(data))
  }

  async softDelete(requestId: string, operationId: string): Promise<ChangeRequest> {
    const { data, error } = await this.client.rpc('soft_delete_change_request', {
      p_operation_id: operationId,
      p_request_id: requestId,
    }) as RpcResult
    if (error) throw new Error(error.message)
    return fromDbRequestRow(requireRow(data))
  }
}
