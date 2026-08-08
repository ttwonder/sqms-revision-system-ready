import { describe, expect, it } from 'vitest'
import type { ChangeRequest } from '../types'
import { buildRequestPatch, reconcileRequestWithPendingPatch } from './collaboration'

const baseRequest: ChangeRequest = {
  id: 'request-1',
  requestNo: 'SQMS-20260808-01',
  applicantName: '王大明',
  requestSource: '外部檢查',
  categoryCode: 'SMI',
  topicCode: 'SMI-01',
  manualItemCode: '',
  scopeNote: '',
  suggestedChange: '原建議',
  changeReason: '原理由',
  targetDueDate: '2026-08-20',
  urgency: 'medium',
  needRelatedFormUpdate: false,
  referenceMaterials: '',
  remarks: '',
  status: 'new',
  createdAt: '2026-08-08T00:00:00.000Z',
  updatedAt: '2026-08-08T00:00:00.000Z',
  revision: 3,
  isDeleted: false,
}

describe('collaborative request patches', () => {
  it('sends only changed editable fields and never includes lifecycle fields', () => {
    const next: ChangeRequest = {
      ...baseRequest,
      urgency: 'high',
      remarks: '新增備註',
      status: 'completed',
      completionDate: '2026-08-08',
      requestNo: 'tampered-number',
      revision: 99,
      updatedAt: '2026-08-09T00:00:00.000Z',
    }

    expect(buildRequestPatch(baseRequest, next)).toEqual({
      urgency: 'high',
      remarks: '新增備註',
    })
  })

  it('keeps pending local fields while accepting unrelated realtime changes', () => {
    const remote: ChangeRequest = {
      ...baseRequest,
      applicantName: '李小華',
      status: 'processing',
      revision: 4,
      updatedAt: '2026-08-08T01:00:00.000Z',
    }

    const reconciled = reconcileRequestWithPendingPatch(remote, {
      suggestedChange: '本機尚未送出的建議',
    })

    expect(reconciled.applicantName).toBe('李小華')
    expect(reconciled.status).toBe('processing')
    expect(reconciled.suggestedChange).toBe('本機尚未送出的建議')
    expect(reconciled.revision).toBe(4)
  })
})
