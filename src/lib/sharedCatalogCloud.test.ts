import { beforeEach, describe, expect, it, vi } from 'vitest'

const cloud = vi.hoisted(() => ({
  tableResults: {} as Record<string, { data: unknown[], error: null | { code?: string, message?: string } }>,
  rpc: vi.fn(),
}))

vi.mock('./supabaseClient', () => ({
  supabase: {
    from: (table: string) => {
      const builder: Record<string, unknown> = {}
      builder.select = () => builder
      builder.order = () => builder
      builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => Promise.resolve(cloud.tableResults[table]).then(resolve, reject)
      return builder
    },
    rpc: cloud.rpc,
  },
}))

import { loadSharedCatalog, saveSharedCatalogEntry } from './sharedCatalog'

beforeEach(() => {
  cloud.rpc.mockReset().mockResolvedValue({ data: {}, error: null })
  cloud.tableResults = {
    sqms_catalog_categories: { data: [{ id: 'cat-id', code: 'A', name_zh: '雲端大類', name_en: '', sort_order: 1, active: true }], error: null },
    sqms_catalog_topics: { data: [{ id: 'topic-id', category_id: 'cat-id', code: 'A-01', title_zh: '雲端主題', title_en: '', sort_order: 1, active: true }], error: null },
    sqms_catalog_items: { data: [{ id: 'item-id', topic_id: 'topic-id', code: 'ITEM-01', title_zh: '雲端項目', title_en: '', sort_order: 1, active: true }], error: null },
  }
})

describe('cloud shared catalog', () => {
  it('rebuilds the three-level tree from all cloud tables', async () => {
    const result = await loadSharedCatalog()

    expect(result).toMatchObject({ source: 'cloud', writable: true })
    expect(result.catalog[0]).toMatchObject({ id: 'cat-id', code: 'A', nameZh: '雲端大類' })
    expect(result.catalog[0].topics[0]).toMatchObject({ id: 'topic-id', code: 'A-01', titleZh: '雲端主題' })
    expect(result.catalog[0].topics[0].items[0]).toMatchObject({ id: 'item-id', code: 'ITEM-01', titleZh: '雲端項目' })
  })

  it('falls back to the complete built-in catalog read-only when the migration is missing', async () => {
    cloud.tableResults.sqms_catalog_categories = { data: [], error: { code: '42P01', message: 'relation sqms_catalog_categories does not exist' } }

    const result = await loadSharedCatalog()

    expect(result.source).toBe('builtin')
    expect(result.writable).toBe(false)
    expect(result.catalog).toHaveLength(5)
    expect(result.warning).toContain('Supabase 目錄遷移 SQL')
  })

  it('does not disguise a cloud permission failure as a missing migration', async () => {
    cloud.tableResults.sqms_catalog_categories = { data: [], error: { code: '42501', message: 'permission denied for table sqms_catalog_categories' } }

    await expect(loadSharedCatalog()).rejects.toMatchObject({ code: '42501' })
  })

  it('writes through the manager RPC and only publishes the subsequent cloud readback', async () => {
    const current = (await loadSharedCatalog()).catalog
    const result = await saveSharedCatalogEntry({ entityType: 'topic', id: 'topic-id', parentId: 'cat-id', code: 'A-01', nameZh: '改名後', nameEn: '', sortOrder: 2, active: true }, current)

    expect(cloud.rpc).toHaveBeenCalledWith('save_sqms_catalog_entry', {
      p_entity_type: 'topic', p_id: 'topic-id', p_parent_id: 'cat-id', p_code: 'A-01', p_name_zh: '改名後', p_name_en: '', p_sort_order: 2, p_active: true,
    })
    expect(result.catalog[0].topics[0].titleZh).toBe('雲端主題')
  })
})
