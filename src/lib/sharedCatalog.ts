import { catalog as builtInCatalog } from '../data/sqmsCatalog'
import type { CatalogCategory, ManualItem, Topic } from '../types'
import { supabase } from './supabaseClient'

export type CatalogEntityType = 'category' | 'topic' | 'item'
export type CatalogSource = 'cloud' | 'local' | 'builtin'

export type CatalogLoadResult = {
  catalog: CatalogCategory[]
  source: CatalogSource
  writable: boolean
  warning?: string
}

export type CatalogEntryDraft = {
  entityType: CatalogEntityType
  id?: string
  parentId?: string
  code: string
  nameZh: string
  nameEn?: string
  sortOrder: number
  active: boolean
}

const localCatalogKey = 'sqms-shared-catalog-v1'

function sortEntries<T extends { sortOrder: number, code: string }>(entries: T[]) {
  return entries.toSorted((left, right) => left.sortOrder - right.sortOrder || left.code.localeCompare(right.code, 'zh-Hant', { numeric: true }))
}

export function normalizeCatalog(source: CatalogCategory[]): CatalogCategory[] {
  return sortEntries(source.map((category, categoryIndex) => ({
    ...category,
    id: category.id || `builtin:category:${category.code}`,
    active: category.active !== false,
    sortOrder: Number(category.sortOrder ?? categoryIndex + 1),
    topics: sortEntries((category.topics ?? []).map((topic, topicIndex) => ({
      ...topic,
      id: topic.id || `builtin:topic:${topic.code}`,
      active: topic.active !== false,
      sortOrder: Number(topic.sortOrder ?? topicIndex + 1),
      items: sortEntries((topic.items ?? []).map((item, itemIndex) => ({
        ...item,
        id: item.id || `builtin:item:${topic.code}:${item.sortOrder ?? itemIndex + 1}:${itemIndex}`,
        active: item.active !== false,
        sortOrder: Number(item.sortOrder ?? itemIndex + 1),
      }))),
    }))),
  })))
}

export function createBuiltInCatalog() {
  return normalizeCatalog(structuredClone(builtInCatalog))
}

function browserStorage(storage?: Pick<Storage, 'getItem' | 'setItem'>) {
  if (storage) return storage
  return typeof window === 'undefined' ? undefined : window.localStorage
}

function isMissingCatalogCapability(error: { code?: string, message?: string } | null | undefined) {
  if (!error) return false
  if (['42P01', '42883', 'PGRST202', 'PGRST205'].includes(error.code || '')) return true
  const message = error.message || ''
  return /(?:sqms_catalog_|save_sqms_catalog_entry)/i.test(message)
    && /(?:does not exist|could not find|schema cache)/i.test(message)
}

export async function loadSharedCatalog(storage?: Pick<Storage, 'getItem' | 'setItem'>): Promise<CatalogLoadResult> {
  if (!supabase) {
    const target = browserStorage(storage)
    if (target) {
      try {
        const saved = target.getItem(localCatalogKey)
        if (saved) return { catalog: normalizeCatalog(JSON.parse(saved)), source: 'local', writable: true }
      } catch {
        // Corrupt local demo data must not replace the built-in catalog.
      }
    }
    return { catalog: createBuiltInCatalog(), source: 'local', writable: true }
  }

  const [categoryResult, topicResult, itemResult] = await Promise.all([
    supabase.from('sqms_catalog_categories').select('*').order('sort_order').order('code'),
    supabase.from('sqms_catalog_topics').select('*').order('sort_order').order('code'),
    supabase.from('sqms_catalog_items').select('*').order('sort_order').order('code'),
  ])
  const error = categoryResult.error || topicResult.error || itemResult.error
  if (error) {
    if (isMissingCatalogCapability(error)) {
      return {
        catalog: createBuiltInCatalog(),
        source: 'builtin',
        writable: false,
        warning: '雲端目錄尚未建立；目前使用內建目錄唯讀顯示。請先執行本版本提供的 Supabase 目錄遷移 SQL。',
      }
    }
    throw error
  }

  const categoryRows = categoryResult.data ?? []
  if (categoryRows.length === 0) {
    return {
      catalog: createBuiltInCatalog(),
      source: 'builtin',
      writable: false,
      warning: '雲端目錄資料表目前是空的；為避免新增需求失去分類，暫時使用內建目錄唯讀顯示。',
    }
  }

  const itemsByTopic = new Map<string, ManualItem[]>()
  for (const row of itemResult.data ?? []) {
    const item: ManualItem = {
      id: row.id,
      code: row.code,
      titleZh: row.title_zh,
      titleEn: row.title_en || '',
      sortOrder: Number(row.sort_order ?? 0),
      active: row.active !== false,
    }
    itemsByTopic.set(row.topic_id, [...(itemsByTopic.get(row.topic_id) ?? []), item])
  }

  const topicsByCategory = new Map<string, Topic[]>()
  for (const row of topicResult.data ?? []) {
    const topic: Topic = {
      id: row.id,
      code: row.code,
      titleZh: row.title_zh,
      titleEn: row.title_en || '',
      sortOrder: Number(row.sort_order ?? 0),
      active: row.active !== false,
      items: itemsByTopic.get(row.id) ?? [],
    }
    topicsByCategory.set(row.category_id, [...(topicsByCategory.get(row.category_id) ?? []), topic])
  }

  return {
    catalog: normalizeCatalog(categoryRows.map((row) => ({
      id: row.id,
      code: row.code,
      nameZh: row.name_zh,
      nameEn: row.name_en || '',
      sortOrder: Number(row.sort_order ?? 0),
      active: row.active !== false,
      topics: topicsByCategory.get(row.id) ?? [],
    }))),
    source: 'cloud',
    writable: true,
  }
}

function assertDraft(draft: CatalogEntryDraft) {
  if (!draft.code.trim()) throw new Error('代碼不可為空。')
  if (!draft.nameZh.trim()) throw new Error('中文名稱不可為空。')
  if (!Number.isInteger(draft.sortOrder) || draft.sortOrder < 0) throw new Error('排序必須是 0 或更大的整數。')
  if (draft.entityType !== 'category' && !draft.parentId) throw new Error('請選擇上層歸屬。')
}

function newLocalId(entityType: CatalogEntityType) {
  return `local:${entityType}:${crypto.randomUUID()}`
}

function saveLocalEntry(current: CatalogCategory[], draft: CatalogEntryDraft): CatalogCategory[] {
  assertDraft(draft)
  const next = structuredClone(current)
  const existingCategory = next.find((category) => category.id === draft.id)
  const existingTopic = next.flatMap((category) => category.topics).find((topic) => topic.id === draft.id)
  const existingItemParent = next.flatMap((category) => category.topics).find((topic) => topic.items.some((item) => item.id === draft.id))
  const existingItem = existingItemParent?.items.find((item) => item.id === draft.id)
  const existing = existingCategory || existingTopic || existingItem
  if (existing && existing.code !== draft.code.trim()) throw new Error('已建立的代碼不可修改；請新增正確代碼並停用舊項目。')

  if (draft.entityType === 'category') {
    if (!existingCategory && next.some((category) => category.code === draft.code.trim())) throw new Error('大類代碼已存在。')
    if (existingCategory) Object.assign(existingCategory, { nameZh: draft.nameZh.trim(), nameEn: draft.nameEn?.trim() || '', sortOrder: draft.sortOrder, active: draft.active })
    else next.push({ id: newLocalId('category'), code: draft.code.trim(), nameZh: draft.nameZh.trim(), nameEn: draft.nameEn?.trim() || '', sortOrder: draft.sortOrder, active: draft.active, topics: [] })
    return normalizeCatalog(next)
  }

  if (draft.entityType === 'topic') {
    const parent = next.find((category) => category.id === draft.parentId)
    if (!parent) throw new Error('找不到指定的大類。')
    if (!existingTopic && next.some((category) => category.topics.some((topic) => topic.code === draft.code.trim()))) throw new Error('第一層主題代碼已存在。')
    if (existingTopic) {
      next.forEach((category) => { category.topics = category.topics.filter((topic) => topic.id !== existingTopic.id) })
      Object.assign(existingTopic, { titleZh: draft.nameZh.trim(), titleEn: draft.nameEn?.trim() || '', sortOrder: draft.sortOrder, active: draft.active })
      parent.topics.push(existingTopic)
    } else {
      parent.topics.push({ id: newLocalId('topic'), code: draft.code.trim(), titleZh: draft.nameZh.trim(), titleEn: draft.nameEn?.trim() || '', sortOrder: draft.sortOrder, active: draft.active, items: [] })
    }
    return normalizeCatalog(next)
  }

  const parentTopic = next.flatMap((category) => category.topics).find((topic) => topic.id === draft.parentId)
  if (!parentTopic) throw new Error('找不到指定的第一層主題。')
  if (!existingItem && next.some((category) => category.topics.some((topic) => topic.items.some((item) => item.code === draft.code.trim())))) throw new Error('第二層項目代碼已存在；新建代碼必須在全目錄唯一。')
  if (existingItem && existingItemParent?.id !== parentTopic.id && parentTopic.items.some((item) => item.code === draft.code.trim() && item.id !== existingItem.id)) throw new Error('此第一層主題下已存在相同的第二層代碼。')
  if (existingItem) {
    next.forEach((category) => category.topics.forEach((topic) => { topic.items = topic.items.filter((item) => item.id !== existingItem.id) }))
    Object.assign(existingItem, { titleZh: draft.nameZh.trim(), titleEn: draft.nameEn?.trim() || '', sortOrder: draft.sortOrder, active: draft.active })
    parentTopic.items.push(existingItem)
  } else {
    parentTopic.items.push({ id: newLocalId('item'), code: draft.code.trim(), titleZh: draft.nameZh.trim(), titleEn: draft.nameEn?.trim() || '', sortOrder: draft.sortOrder, active: draft.active })
  }
  return normalizeCatalog(next)
}

export async function saveSharedCatalogEntry(draft: CatalogEntryDraft, current: CatalogCategory[], storage?: Pick<Storage, 'getItem' | 'setItem'>): Promise<CatalogLoadResult> {
  assertDraft(draft)
  if (supabase) {
    const { error } = await supabase.rpc('save_sqms_catalog_entry', {
      p_entity_type: draft.entityType,
      p_id: draft.id && !draft.id.startsWith('builtin:') ? draft.id : null,
      p_parent_id: draft.parentId && !draft.parentId.startsWith('builtin:') ? draft.parentId : null,
      p_code: draft.code.trim(),
      p_name_zh: draft.nameZh.trim(),
      p_name_en: draft.nameEn?.trim() || '',
      p_sort_order: draft.sortOrder,
      p_active: draft.active,
    })
    if (error) {
      if (isMissingCatalogCapability(error)) throw new Error('雲端目錄管理功能尚未建立，請先執行本版本提供的 Supabase 目錄遷移 SQL。')
      throw error
    }
    return loadSharedCatalog(storage)
  }

  const catalog = saveLocalEntry(current, draft)
  browserStorage(storage)?.setItem(localCatalogKey, JSON.stringify(catalog))
  return { catalog, source: 'local', writable: true }
}
