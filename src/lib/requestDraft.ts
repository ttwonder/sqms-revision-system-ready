import type { ChangeRequest } from '../types'

const REQUEST_DRAFT_KEY = 'sqms-request-draft-v2'

type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type RequestDraftState = {
  form: ChangeRequest
  editingId: string | null
  editingBaseRequest: ChangeRequest | null
  editingStartedRevision: number | null
}

function normalizeRequest(request: ChangeRequest): ChangeRequest {
  return { ...request, revision: Number(request.revision || 0) }
}

export function loadRequestDraft(storage: DraftStorage): RequestDraftState | null {
  try {
    const raw = storage.getItem(REQUEST_DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RequestDraftState>
    if (!parsed.form || typeof parsed.form !== 'object' || typeof parsed.form.id !== 'string') return null
    return {
      form: normalizeRequest(parsed.form),
      editingId: typeof parsed.editingId === 'string' ? parsed.editingId : null,
      editingBaseRequest: parsed.editingBaseRequest ? normalizeRequest(parsed.editingBaseRequest) : null,
      editingStartedRevision: typeof parsed.editingStartedRevision === 'number' ? parsed.editingStartedRevision : null,
    }
  } catch {
    return null
  }
}

export function saveRequestDraft(storage: DraftStorage, draft: RequestDraftState): void {
  storage.setItem(REQUEST_DRAFT_KEY, JSON.stringify(draft))
}

export function clearRequestDraft(storage: DraftStorage): void {
  storage.removeItem(REQUEST_DRAFT_KEY)
}
