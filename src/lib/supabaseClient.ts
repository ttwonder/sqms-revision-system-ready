import { createClient } from '@supabase/supabase-js'
import type { AdminUser, ChangeRequest } from '../types'

function cleanEnvValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  // 防止 GitHub Secret 誤貼成多行，例如把 VITE_BASE_PATH=/ 也貼進 anon key。
  return trimmed.split(/\s+/)[0]
}

const supabaseUrl = cleanEnvValue(import.meta.env.VITE_SUPABASE_URL)
const supabaseAnonKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY)

export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey) : null
export const signupClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  })
  : null
export const isCloudConfigured = Boolean(supabase)

export function fromDbAdminUser(row: any): AdminUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || '',
    role: row.role,
    active: Boolean(row.active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function toDbRequest(request: ChangeRequest) {
  return {
    id: request.id,
    request_no: request.requestNo,
    applicant_name: request.applicantName,
    request_source: request.requestSource || '外部檢查',
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
    requestSource: row.request_source || '外部檢查',
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
