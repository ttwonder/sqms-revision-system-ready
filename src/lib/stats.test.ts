import { describe, expect, it } from 'vitest'
import { buildDashboardStats, isOverdue } from './stats'
import type { ChangeRequest } from '../types'

const base: ChangeRequest = {
  id: '1',
  requestNo: 'REQ-001',
  applicantName: '王大明',
  categoryCode: 'SMI',
  topicCode: 'SMI-01',
  manualItemCode: 'SSOR-001',
  scopeNote: '',
  suggestedChange: '更新須知',
  changeReason: '法規更新',
  targetDueDate: '2026-06-01',
  urgency: 'high',
  needRelatedFormUpdate: false,
  referenceMaterials: '',
  status: 'new',
  createdAt: '2026-06-01T08:00:00.000Z',
  updatedAt: '2026-06-01T08:00:00.000Z',
  isDeleted: false,
}

describe('Dashboard 統計', () => {
  it('只統計未軟刪除且在日期區間內的需求', () => {
    const requests: ChangeRequest[] = [
      base,
      { ...base, id: '2', status: 'completed', categoryCode: 'SMP', topicCode: 'SMP-03', createdAt: '2026-06-10T00:00:00.000Z' },
      { ...base, id: '3', isDeleted: true, createdAt: '2026-06-11T00:00:00.000Z' },
      { ...base, id: '4', createdAt: '2026-05-20T00:00:00.000Z' },
    ]

    const stats = buildDashboardStats(requests, { from: '2026-06-01', to: '2026-06-30', today: '2026-06-20' })

    expect(stats.total).toBe(2)
    expect(stats.completed).toBe(1)
    expect(stats.completionRate).toBe(50)
    expect(stats.byCategory).toEqual({ SMI: 1, SMP: 1 })
  })

  it('滯期定義為期望完成日早於今天且未完成/未取消', () => {
    expect(isOverdue({ ...base, targetDueDate: '2026-06-01', status: 'processing' }, '2026-06-20')).toBe(true)
    expect(isOverdue({ ...base, targetDueDate: '2026-06-01', status: 'completed' }, '2026-06-20')).toBe(false)
    expect(isOverdue({ ...base, targetDueDate: '2026-06-30', status: 'new' }, '2026-06-20')).toBe(false)
  })
})
