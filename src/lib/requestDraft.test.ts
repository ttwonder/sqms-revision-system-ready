import { describe, expect, it } from 'vitest'
import type { ChangeRequest } from '../types'
import { loadRequestDraft, saveRequestDraft } from './requestDraft'

const request: ChangeRequest = {
  id: 'draft-id',
  requestNo: '儲存後自動產生',
  applicantName: '王大明',
  requestSource: '外部檢查',
  categoryCode: 'SMI',
  topicCode: 'SMI-01',
  suggestedChange: '草稿內容',
  changeReason: '測試',
  targetDueDate: '',
  urgency: 'medium',
  needRelatedFormUpdate: false,
  referenceMaterials: '',
  remarks: '',
  status: 'new',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  revision: 0,
  isDeleted: false,
}

function memoryStorage() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
    removeItem: (key: string) => { values.delete(key) },
  }
}

describe('request drafts', () => {
  it('restores the form and edit base without treating them as formal data', () => {
    const storage = memoryStorage()
    saveRequestDraft(storage, {
      form: request,
      editingId: 'draft-id',
      editingBaseRequest: { ...request, revision: 3 },
      editingStartedRevision: 2,
    })

    expect(loadRequestDraft(storage)).toMatchObject({
      form: { suggestedChange: '草稿內容' },
      editingId: 'draft-id',
      editingBaseRequest: { revision: 3 },
      editingStartedRevision: 2,
    })
  })

  it('ignores a corrupt draft instead of breaking app startup', () => {
    const storage = memoryStorage()
    storage.setItem('sqms-request-draft-v2', '{broken')

    expect(loadRequestDraft(storage)).toBeNull()
  })
})
