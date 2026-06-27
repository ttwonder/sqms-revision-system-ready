import { createClient } from '@supabase/supabase-js'
import type { ChangeRequest } from '../types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
export const isCloudConfigured = Boolean(supabase)

export function toDbRequest(request: ChangeRequest) {
  return {
    id: request.id,
    request_no: request.requestNo,
    applicant_name: request.applicantName,
    category_code: request.categoryCode,
    topic_code: request.topicCode,
    manual_item_code: request.manualItemCode || null,
    scope_note: request.scopeNote || null,
    suggested_change: request.suggestedChange,
    change_reason: request.changeReason,
    target_due_date: request.targetDueDate,
    urgency: request.urgency,
    need_related_form_update: request.needRelatedFormUpdate,
    reference_materials: request.referenceMaterials || null,
    status: request.status,
    completion_date: request.completionDate || null,
    public_edit_note: request.publicEditNote || null,
    created_at: request.createdAt,
    updated_at: request.updatedAt,
    is_deleted: request.isDeleted,
    deleted_at: request.deletedAt || null,
    deleted_by: request.deletedBy || null,
  }
}

export function fromDbRequest(row: any): ChangeRequest {
  return {
    id: row.id,
    requestNo: row.request_no,
    applicantName: row.applicant_name,
    categoryCode: row.category_code,
    topicCode: row.topic_code,
    manualItemCode: row.manual_item_code || undefined,
    scopeNote: row.scope_note || '',
    suggestedChange: row.suggested_change,
    changeReason: row.change_reason,
    targetDueDate: row.target_due_date,
    urgency: row.urgency,
    needRelatedFormUpdate: Boolean(row.need_related_form_update),
    referenceMaterials: row.reference_materials || '',
    status: row.status,
    completionDate: row.completion_date || undefined,
    publicEditNote: row.public_edit_note || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: Boolean(row.is_deleted),
    deletedAt: row.deleted_at || undefined,
    deletedBy: row.deleted_by || undefined,
  }
}
