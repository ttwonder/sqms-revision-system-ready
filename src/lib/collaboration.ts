import type { ChangeRequest } from '../types'

export const editableRequestFields = [
  'applicantName',
  'requestSource',
  'categoryCode',
  'topicCode',
  'manualItemCode',
  'scopeNote',
  'suggestedChange',
  'changeReason',
  'targetDueDate',
  'urgency',
  'needRelatedFormUpdate',
  'referenceMaterials',
  'remarks',
  'publicEditNote',
] as const

export type EditableRequestField = (typeof editableRequestFields)[number]
export type RequestPatch = Partial<Pick<ChangeRequest, EditableRequestField>>

export function buildRequestPatch(base: ChangeRequest, next: ChangeRequest): RequestPatch {
  const patch: RequestPatch = {}

  for (const field of editableRequestFields) {
    if (base[field] !== next[field]) {
      Object.assign(patch, { [field]: next[field] })
    }
  }

  return patch
}

export function reconcileRequestWithPendingPatch(
  authoritative: ChangeRequest,
  pendingPatch: RequestPatch,
): ChangeRequest {
  return { ...authoritative, ...pendingPatch }
}
