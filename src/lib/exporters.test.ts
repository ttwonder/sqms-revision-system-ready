import { describe, expect, it } from 'vitest'
import type { CatalogCategory, ChangeRequest } from '../types'
import { rowsForExport } from './exporters'

const renamedCatalog: CatalogCategory[] = [{
  code: 'A', nameZh: '更新後大類', sortOrder: 1, active: true, topics: [{
    code: 'A-01', titleZh: '更新後第一層', sortOrder: 1, active: true, items: [{
      code: 'ITEM-01', titleZh: '更新後第二層', sortOrder: 1, active: false,
    }],
  }],
}]

const historicalRequest: ChangeRequest = {
  id: 'history-1', requestNo: 'SQMS-20260827-01', applicantName: '測試', requestSource: '外部檢查',
  categoryCode: 'A', topicCode: 'A-01', manualItemCode: 'ITEM-01', suggestedChange: '內容', changeReason: '理由',
  targetDueDate: '', urgency: 'medium', needRelatedFormUpdate: false, status: 'completed', createdAt: '2026-08-27T00:00:00.000Z',
  updatedAt: '2026-08-27T00:00:00.000Z', revision: 1, isDeleted: false,
}

describe('dynamic catalog exports', () => {
  it('renders renamed catalog labels for historical requests without rewriting stored codes', () => {
    const [row] = rowsForExport([historicalRequest], renamedCatalog)
    expect(historicalRequest).toMatchObject({ categoryCode: 'A', topicCode: 'A-01', manualItemCode: 'ITEM-01' })
    expect(row.大類).toBe('更新後大類')
    expect(row.第一層主題).toContain('更新後第一層')
    expect(row.第二層手冊或文件項).toBe('ITEM-01 更新後第二層')
  })
})
