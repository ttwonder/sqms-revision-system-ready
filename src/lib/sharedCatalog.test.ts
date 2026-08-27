import { describe, expect, it, vi } from 'vitest'
import type { CatalogCategory } from '../types'
import { getCategoryOptions, getManualItem, getManualItemOptions, getTopicDisplayLabel, getTopicOptions } from '../data/sqmsCatalog'

vi.mock('./supabaseClient', () => ({ supabase: null }))

import { createBuiltInCatalog, normalizeCatalog, saveSharedCatalogEntry } from './sharedCatalog'

function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
  }
}

const fixture: CatalogCategory[] = normalizeCatalog([
  {
    code: 'A', nameZh: '原大類', sortOrder: 1, active: true, topics: [
      {
        code: 'A-01', titleZh: '原主題', sortOrder: 1, active: true, items: [
          { code: 'ITEM-01', titleZh: '原項目', sortOrder: 1, active: false },
        ],
      },
    ],
  },
  { code: 'B', nameZh: '另一大類', sortOrder: 2, active: false, topics: [] },
])

describe('shared catalog', () => {
  it('hides inactive entries from new-request options but resolves them for history', () => {
    expect(getCategoryOptions(fixture).map((item) => item.code)).toEqual(['A'])
    expect(getCategoryOptions(fixture, true).map((item) => item.code)).toEqual(['A', 'B'])
    expect(getTopicOptions('A', fixture).map((item) => item.code)).toEqual(['A-01'])
    expect(getManualItemOptions('A-01', fixture)).toEqual([])
    expect(getManualItemOptions('A-01', fixture, true)).toHaveLength(1)
    expect(getManualItem('A-01', 'ITEM-01', fixture)?.titleZh).toBe('原項目')
  })

  it('renames entries without changing their codes and moves relationships by stable id', async () => {
    const storage = memoryStorage()
    const categoryA = fixture[0]
    const categoryB = fixture[1]
    const topic = categoryA.topics[0]

    const renamed = await saveSharedCatalogEntry({
      entityType: 'topic', id: topic.id, parentId: categoryB.id, code: topic.code,
      nameZh: '新主題名稱', nameEn: '', sortOrder: 3, active: true,
    }, fixture, storage)

    expect(getTopicDisplayLabel('A-01', renamed.catalog)).toContain('新主題名稱')
    expect(getTopicOptions('A', renamed.catalog, true)).toHaveLength(0)
    expect(getTopicOptions('B', renamed.catalog, true).map((item) => item.code)).toEqual(['A-01'])
    await expect(saveSharedCatalogEntry({
      entityType: 'topic', id: topic.id, parentId: categoryA.id, code: 'A-99',
      nameZh: '錯誤改碼', sortOrder: 1, active: true,
    }, fixture, storage)).rejects.toThrow('已建立的代碼不可修改')
  })

  it('blocks moving a second-level item into a parent that already has the same code', async () => {
    const catalog = normalizeCatalog([{
      code: 'A', nameZh: '大類', sortOrder: 1, topics: [
        { code: 'T1', titleZh: '主題一', sortOrder: 1, items: [{ code: 'DUP', titleZh: '項目一', sortOrder: 1 }] },
        { code: 'T2', titleZh: '主題二', sortOrder: 2, items: [{ code: 'DUP', titleZh: '項目二', sortOrder: 1 }] },
      ],
    }])
    const moving = catalog[0].topics[0].items[0]
    const target = catalog[0].topics[1]

    await expect(saveSharedCatalogEntry({ entityType: 'item', id: moving.id, parentId: target.id, code: moving.code, nameZh: moving.titleZh, sortOrder: 2, active: true }, catalog, memoryStorage()))
      .rejects.toThrow('此第一層主題下已存在相同的第二層代碼')
    await expect(saveSharedCatalogEntry({ entityType: 'item', parentId: target.id, code: 'DUP', nameZh: '第三個重複項目', sortOrder: 3, active: true }, catalog, memoryStorage()))
      .rejects.toThrow('新建代碼必須在全目錄唯一')
  })

  it('assigns unique internal ids while preserving every built-in legacy row', () => {
    const catalog = createBuiltInCatalog()
    const allItems = catalog.flatMap((category) => category.topics).flatMap((topic) => topic.items)
    expect(catalog).toHaveLength(5)
    expect(catalog.flatMap((category) => category.topics)).toHaveLength(46)
    expect(allItems).toHaveLength(559)
    expect(new Set(allItems.map((item) => item.id)).size).toBe(559)
  })
})
