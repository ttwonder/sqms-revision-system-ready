import { describe, expect, it } from 'vitest'
import type { ChangeRequest } from '../types'
import {
  buildLocalSqmsStorageStats,
  DataManagementError,
  formatDataBytes,
  purgeLocalDeletedRequests,
} from './dataManagement'

const request = (overrides: Partial<ChangeRequest>): ChangeRequest => ({
  id: crypto.randomUUID(),
  requestNo: 'SQMS-20260821-01',
  applicantName: '測試人員',
  requestSource: '外部檢查',
  categoryCode: 'SMI',
  topicCode: 'SMI-01',
  manualItemCode: 'SHM-001',
  scopeNote: '',
  suggestedChange: '測試需求',
  changeReason: '測試理由',
  targetDueDate: '',
  urgency: 'medium',
  needRelatedFormUpdate: false,
  referenceMaterials: '',
  remarks: '',
  status: 'new',
  createdAt: '2026-08-21T00:00:00.000Z',
  updatedAt: '2026-08-21T00:00:00.000Z',
  revision: 1,
  isDeleted: false,
  ...overrides,
})

describe('SQMS data management', () => {
  it('separates active and soft-deleted logical bytes in local preview mode', () => {
    const active = request({ id: 'active-id', requestNo: 'SQMS-20260821-01' })
    const deleted = request({
      id: 'deleted-id',
      requestNo: 'SQMS-20260821-02',
      isDeleted: true,
      deletedAt: '2026-08-21T02:00:00.000Z',
      deletedBy: 'owner@example.com',
      remarks: '較長的已刪除資料'.repeat(10),
    })

    const stats = buildLocalSqmsStorageStats([active, deleted])

    expect(stats.source).toBe('local-preview')
    expect(stats.activeRequestCount).toBe(1)
    expect(stats.deletedRequestCount).toBe(1)
    expect(stats.activeRequestBytes).toBeGreaterThan(0)
    expect(stats.deletedRequestBytes).toBeGreaterThan(0)
    expect(stats.deletedCandidates).toEqual([
      expect.objectContaining({ id: 'deleted-id', requestNo: 'SQMS-20260821-02', eventCount: 0 }),
    ])
    expect(stats.databaseTotalBytes).toBeNull()
    expect(stats.appDatabasePhysicalBytes).toBeNull()
  })

  it('purges only selected soft-deleted rows against the exact preview set', () => {
    const active = request({ id: 'active-id', requestNo: 'SQMS-20260821-01' })
    const firstDeleted = request({ id: 'deleted-1', requestNo: 'SQMS-20260821-02', isDeleted: true })
    const secondDeleted = request({ id: 'deleted-2', requestNo: 'SQMS-20260821-03', isDeleted: true })

    const result = purgeLocalDeletedRequests(
      [active, firstDeleted, secondDeleted],
      ['deleted-1', 'deleted-2'],
      ['deleted-1'],
    )

    expect(result.deletedRequestCount).toBe(1)
    expect(result.remainingRequests?.map((item) => item.id)).toEqual(['active-id', 'deleted-2'])
    expect(() => purgeLocalDeletedRequests(
      [active, firstDeleted, secondDeleted],
      ['deleted-1'],
      ['deleted-1'],
    )).toThrowError(expect.objectContaining({ code: 'DELETED_SET_CHANGED' }))
    expect(() => purgeLocalDeletedRequests(
      [active, firstDeleted],
      ['deleted-1'],
      ['active-id'],
    )).toThrowError(expect.objectContaining({ code: 'INVALID_PAYLOAD' }))
  })

  it('formats logical and physical bytes as binary units', () => {
    expect(formatDataBytes(0)).toBe('0 B')
    expect(formatDataBytes(1024)).toBe('1.00 KiB')
    expect(formatDataBytes(1024 * 1024)).toBe('1.00 MiB')
    expect(new DataManagementError('FORBIDDEN')).toMatchObject({ code: 'FORBIDDEN' })
  })
})
