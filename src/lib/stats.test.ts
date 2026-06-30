import { describe, expect, it } from 'vitest'
import { buildDashboardStats, filterRequests, isOverdue } from './stats'
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
  requestSource: '外部檢查',
}

describe('Dashboard 統計', () => {
  it('只統計未軟刪除且在日期區間內新增或修改的需求', () => {
    const requests: ChangeRequest[] = [
      base,
      { ...base, id: '2', status: 'completed', categoryCode: 'SMP', topicCode: 'SMP-03', createdAt: '2026-06-10T00:00:00.000Z' },
      { ...base, id: '3', isDeleted: true, createdAt: '2026-06-11T00:00:00.000Z' },
      { ...base, id: '4', createdAt: '2026-05-20T00:00:00.000Z', updatedAt: '2026-05-20T00:00:00.000Z' },
      { ...base, id: '5', createdAt: '2026-05-01T00:00:00.000Z', updatedAt: '2026-06-12T00:00:00.000Z' },
    ]

    const stats = buildDashboardStats(requests, { from: '2026-06-01', to: '2026-06-30', today: '2026-06-20' })

    expect(stats.total).toBe(3)
    expect(stats.completed).toBe(1)
    expect(stats.completionRate).toBe(33)
    expect(stats.byCategory).toEqual({ SMI: 2, SMP: 1 })
  })

  it('滯期定義為期望完成日早於今天且未完成/未取消', () => {
    expect(isOverdue({ ...base, targetDueDate: '2026-06-01', status: 'processing' }, '2026-06-20')).toBe(true)
    expect(isOverdue({ ...base, targetDueDate: '2026-06-01', status: 'completed' }, '2026-06-20')).toBe(false)
    expect(isOverdue({ ...base, targetDueDate: '2026-06-30', status: 'new' }, '2026-06-20')).toBe(false)
  })

  it('計算按時完成率與逾期率', () => {
    const requests: ChangeRequest[] = [
      { ...base, id: '1', status: 'completed', targetDueDate: '2026-06-10', completionDate: '2026-06-09' },
      { ...base, id: '2', status: 'completed', targetDueDate: '2026-06-10', completionDate: '2026-06-11' },
      { ...base, id: '3', status: 'processing', targetDueDate: '2026-06-01' },
      { ...base, id: '4', status: 'new', targetDueDate: '2026-06-30' },
    ]

    const stats = buildDashboardStats(requests, { from: '2026-06-01', to: '2026-06-30', today: '2026-06-20' })

    expect(stats.onTimeCompletionRate).toBe(50)
    expect(stats.overdueRate).toBe(25)
  })

  it('近 N 天快捷篩選同時包含新增與修改', () => {
    const requests: ChangeRequest[] = [
      { ...base, id: 'old-created-new-updated', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-06-10T00:00:00.000Z' },
      { ...base, id: 'too-old', createdAt: '2026-04-01T00:00:00.000Z', updatedAt: '2026-04-15T00:00:00.000Z' },
    ]

    const scoped = filterRequests(requests, { from: '2026-05-28', to: '2026-06-27' })

    expect(scoped.map((request) => request.id)).toEqual(['old-created-new-updated'])
  })

  it('按需求來源篩選並統計來源分佈', () => {
    const requests: ChangeRequest[] = [
      { ...base, id: 'external', requestSource: '外部檢查' },
      { ...base, id: 'meeting', requestSource: '安全會議' },
      { ...base, id: 'meeting-2', requestSource: '安全會議', status: 'completed' },
    ]

    const scoped = filterRequests(requests, { requestSource: '安全會議' })
    const stats = buildDashboardStats(requests, { requestSource: '安全會議' })

    expect(scoped.map((request) => request.id)).toEqual(['meeting', 'meeting-2'])
    expect(stats.total).toBe(2)
    expect(stats.byRequestSource).toEqual({ '安全會議': 2 })
  })

})
