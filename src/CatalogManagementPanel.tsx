import { useEffect, useMemo, useState } from 'react'
import { Pencil, PlusCircle, RefreshCw, Save, Trash2, Undo2 } from 'lucide-react'
import type { CatalogCategory, ChangeRequest, ManualItem, Topic } from './types'
import type { CatalogEntryDraft, CatalogLoadResult, CatalogSource } from './lib/sharedCatalog'
import { saveSharedCatalogEntry } from './lib/sharedCatalog'

type Props = {
  catalogData: CatalogCategory[]
  requests: ChangeRequest[]
  canManage: boolean
  writable: boolean
  source: CatalogSource
  warning?: string
  onCatalogUpdated: (result: CatalogLoadResult) => void
  onRefresh: () => Promise<void> | void
}

type EditorState = {
  title: string
  draft: CatalogEntryDraft
}

function includesQuery(values: Array<string | undefined>, query: string) {
  const keyword = query.trim().toLowerCase()
  return !keyword || values.some((value) => value?.toLowerCase().includes(keyword))
}

function sourceLabel(source: CatalogSource) {
  if (source === 'cloud') return 'Supabase 雲端目錄'
  if (source === 'local') return '本機展示目錄'
  return '內建目錄（唯讀）'
}

function entryStatus(active?: boolean) {
  return active === false ? '已停用' : '使用中'
}

export default function CatalogManagementPanel({ catalogData, requests, canManage, writable, source, warning, onCatalogUpdated, onRefresh }: Props) {
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [selectedTopicId, setSelectedTopicId] = useState('')
  const [categoryQuery, setCategoryQuery] = useState('')
  const [topicQuery, setTopicQuery] = useState('')
  const [itemQuery, setItemQuery] = useState('')
  const [editor, setEditor] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')

  const allTopics = useMemo(() => catalogData.flatMap((category) => category.topics.map((topic) => ({ category, topic }))), [catalogData])
  const selectedCategory = catalogData.find((category) => category.id === selectedCategoryId) ?? catalogData[0]
  const selectedTopic = selectedCategory?.topics.find((topic) => topic.id === selectedTopicId) ?? selectedCategory?.topics[0]

  useEffect(() => {
    if (!selectedCategory) return
    if (selectedCategory.id !== selectedCategoryId) setSelectedCategoryId(selectedCategory.id || '')
    if (selectedTopic?.id !== selectedTopicId) setSelectedTopicId(selectedTopic?.id || '')
  }, [selectedCategory, selectedCategoryId, selectedTopic, selectedTopicId])

  const categoryReferences = (code: string) => requests.filter((request) => request.categoryCode === code).length
  const topicReferences = (code: string) => requests.filter((request) => request.topicCode === code).length
  const duplicateItemCodes = useMemo(() => {
    const duplicates = new Set<string>()
    const counts = new Map<string, number>()
    allTopics.forEach(({ topic }) => topic.items.forEach((item) => counts.set(item.code, (counts.get(item.code) ?? 0) + 1)))
    counts.forEach((count, code) => { if (count > 1) duplicates.add(code) })
    return duplicates
  }, [allTopics])
  const itemReferences = (topicCode: string, code: string) => requests.filter((request) => request.manualItemCode === code && (!duplicateItemCodes.has(code) || request.topicCode === topicCode)).length

  const filteredCategories = catalogData.filter((category) => includesQuery([category.code, category.nameZh, category.nameEn], categoryQuery))
  const filteredTopics = (selectedCategory?.topics ?? []).filter((topic) => includesQuery([topic.code, topic.titleZh, topic.titleEn], topicQuery))
  const filteredItems = (selectedTopic?.items ?? []).filter((item) => includesQuery([item.code, item.titleZh, item.titleEn], itemQuery))
  const editingEnabled = canManage && writable

  function openNewCategory() {
    setEditor({ title: '新增大類', draft: { entityType: 'category', code: '', nameZh: '', nameEn: '', sortOrder: Math.max(0, ...catalogData.map((item) => item.sortOrder)) + 1, active: true } })
  }

  function openNewTopic() {
    if (!selectedCategory?.id) return
    setEditor({ title: '新增第一層主題', draft: { entityType: 'topic', parentId: selectedCategory.id, code: '', nameZh: '', nameEn: '', sortOrder: Math.max(0, ...selectedCategory.topics.map((item) => item.sortOrder)) + 1, active: true } })
  }

  function openNewItem() {
    if (!selectedTopic?.id) return
    setEditor({ title: '新增第二層項目', draft: { entityType: 'item', parentId: selectedTopic.id, code: '', nameZh: '', nameEn: '', sortOrder: Math.max(0, ...selectedTopic.items.map((item) => item.sortOrder)) + 1, active: true } })
  }

  function editCategory(category: CatalogCategory) {
    setEditor({ title: `修改大類 ${category.code}`, draft: { entityType: 'category', id: category.id, code: category.code, nameZh: category.nameZh, nameEn: category.nameEn || '', sortOrder: category.sortOrder, active: category.active !== false } })
  }

  function editTopic(category: CatalogCategory, topic: Topic) {
    setEditor({ title: `修改第一層主題 ${topic.code}`, draft: { entityType: 'topic', id: topic.id, parentId: category.id, code: topic.code, nameZh: topic.titleZh, nameEn: topic.titleEn || '', sortOrder: topic.sortOrder, active: topic.active !== false } })
  }

  function editItem(topic: Topic, item: ManualItem) {
    setEditor({ title: `修改第二層項目 ${item.code}`, draft: { entityType: 'item', id: item.id, parentId: topic.id, code: item.code, nameZh: item.titleZh, nameEn: item.titleEn || '', sortOrder: item.sortOrder, active: item.active !== false } })
  }

  async function persist(draft: CatalogEntryDraft) {
    setSaving(true)
    setNotice('')
    try {
      const result = await saveSharedCatalogEntry(draft, catalogData)
      onCatalogUpdated(result)
      if (draft.entityType === 'category') {
        const savedCategory = result.catalog.find((category) => category.id === draft.id || category.code === draft.code.trim())
        if (savedCategory?.id) {
          setSelectedCategoryId(savedCategory.id)
          setSelectedTopicId(savedCategory.topics[0]?.id ?? '')
        }
      }
      if (draft.entityType === 'topic' && draft.parentId) {
        setSelectedCategoryId(draft.parentId)
        const parent = result.catalog.find((category) => category.id === draft.parentId)
        const savedTopic = parent?.topics.find((topic) => topic.id === draft.id || topic.code === draft.code.trim())
        if (savedTopic?.id) setSelectedTopicId(savedTopic.id)
      }
      if (draft.entityType === 'item' && draft.parentId) {
        setSelectedTopicId(draft.parentId)
        const parent = result.catalog.find((category) => category.topics.some((topic) => topic.id === draft.parentId))
        if (parent?.id) setSelectedCategoryId(parent.id)
      }
      setEditor(null)
      setNotice(`${draft.code} 已保存；既有需求代碼未被改寫。`)
    } catch (error) {
      setNotice(`保存失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
      throw error
    } finally {
      setSaving(false)
    }
  }

  async function toggleEntry(draft: CatalogEntryDraft) {
    const nextActive = !draft.active
    if (!nextActive && !confirm(`確定刪除（停用）「${draft.code}」？既有需求仍保留此代碼與名稱，新需求不再提供此選項。`)) return
    try {
      await persist({ ...draft, active: nextActive })
    } catch {
      // persist already exposes the concrete error in this panel.
    }
  }

  function editButton(label: string, onClick: () => void) {
    return editingEnabled ? <button type="button" className="ghost catalog-mini-action" aria-label={label} onClick={(event) => { event.stopPropagation(); onClick() }}><Pencil size={13} />修改</button> : null
  }

  function toggleButton(label: string, draft: CatalogEntryDraft) {
    if (!editingEnabled) return null
    return <button type="button" className={draft.active ? 'danger catalog-mini-action' : 'ghost catalog-mini-action'} aria-label={`${draft.active ? '刪除（停用）' : '恢復'}${label}`} onClick={(event) => { event.stopPropagation(); void toggleEntry(draft) }}>{draft.active ? <Trash2 size={13} /> : <Undo2 size={13} />}{draft.active ? '停用' : '恢復'}</button>
  }

  return <section className="admin-card catalog-management-panel" aria-label="目錄與分類管理">
    <div className="section-title compact-title">
      <div><p className="eyebrow">Catalog</p><h3>大類／第一層主題／第二層項目管理</h3></div>
      <button className="ghost" type="button" onClick={() => void onRefresh()}><RefreshCw size={14} />重新讀取目錄</button>
    </div>
    <div className="catalog-status-row"><span className={`catalog-source ${source}`}>{sourceLabel(source)}</span><span>共 {catalogData.length} 個大類、{allTopics.length} 個第一層、{allTopics.reduce((sum, row) => sum + row.topic.items.length, 0)} 個第二層項目</span></div>
    <p className="catalog-safety-note">代碼建立後鎖定；修改名稱會同步反映在舊需求的畫面、搜尋與匯出。停用不刪除歷史資料；調整上下層關係只影響往後新增的選擇。</p>
    {warning && <p className="catalog-warning" role="status">{warning}</p>}
    {!canManage && <p className="catalog-warning">只有 Owner 或雲端管理員可以修改目錄；目前為人員管理員身份，只能查看。</p>}
    {duplicateItemCodes.size > 0 && <p className="catalog-duplicate-warning">現有目錄有 {duplicateItemCodes.size} 組舊有重複第二層代碼，已保留並在下方標示；為避免保存後無法辨識名稱，新需求選項會排除這些項目。請新增唯一代碼的替代項後停用舊項目。</p>}
    {notice && <p className={notice.startsWith('保存失敗') ? 'catalog-notice error' : 'catalog-notice'} role="status">{notice}</p>}

    <div className="catalog-level-grid">
      <section className="catalog-level-column" aria-label="大類列表">
        <header><div><b>大類</b><span>{catalogData.length}</span></div>{editingEnabled && <button type="button" className="primary mini" aria-label="新增大類" onClick={openNewCategory}><PlusCircle size={14} />新增</button>}</header>
        <input type="search" value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} placeholder="搜尋大類" aria-label="搜尋大類" />
        <div className="catalog-entry-list">{filteredCategories.map((category) => {
          const draft: CatalogEntryDraft = { entityType: 'category', id: category.id, code: category.code, nameZh: category.nameZh, nameEn: category.nameEn || '', sortOrder: category.sortOrder, active: category.active !== false }
          return <article key={category.id || category.code} className={`catalog-entry ${selectedCategory?.id === category.id ? 'selected' : ''} ${category.active === false ? 'inactive' : ''}`} onClick={() => { setSelectedCategoryId(category.id || ''); setSelectedTopicId(category.topics[0]?.id || '') }}>
            <button type="button" className="catalog-entry-main"><b>{category.code}</b><span>{category.nameZh}</span><small>{entryStatus(category.active)} · {categoryReferences(category.code)} 筆需求</small></button>
            <div>{editButton(`修改大類 ${category.code}`, () => editCategory(category))}{toggleButton(`大類 ${category.code}`, draft)}</div>
          </article>
        })}{filteredCategories.length === 0 && <p className="catalog-empty">沒有符合的大類</p>}</div>
      </section>

      <section className="catalog-level-column" aria-label="第一層主題列表">
        <header><div><b>第一層主題</b><span>{selectedCategory?.topics.length ?? 0}</span></div>{editingEnabled && selectedCategory && <button type="button" className="primary mini" aria-label="新增第一層" onClick={openNewTopic}><PlusCircle size={14} />新增</button>}</header>
        <input type="search" value={topicQuery} onChange={(event) => setTopicQuery(event.target.value)} placeholder="搜尋第一層主題" aria-label="搜尋第一層主題" />
        <div className="catalog-entry-list">{filteredTopics.map((topic) => {
          const draft: CatalogEntryDraft = { entityType: 'topic', id: topic.id, parentId: selectedCategory?.id, code: topic.code, nameZh: topic.titleZh, nameEn: topic.titleEn || '', sortOrder: topic.sortOrder, active: topic.active !== false }
          return <article key={topic.id || topic.code} className={`catalog-entry ${selectedTopic?.id === topic.id ? 'selected' : ''} ${topic.active === false ? 'inactive' : ''}`} onClick={() => setSelectedTopicId(topic.id || '')}>
            <button type="button" className="catalog-entry-main"><b>{topic.code}</b><span>{topic.titleZh}</span><small>{entryStatus(topic.active)} · {topicReferences(topic.code)} 筆需求</small></button>
            <div>{selectedCategory && editButton(`修改第一層主題 ${topic.code}`, () => editTopic(selectedCategory, topic))}{toggleButton(`第一層主題 ${topic.code}`, draft)}</div>
          </article>
        })}{filteredTopics.length === 0 && <p className="catalog-empty">此大類沒有符合的第一層主題</p>}</div>
      </section>

      <section className="catalog-level-column" aria-label="第二層項目列表">
        <header><div><b>第二層項目</b><span>{selectedTopic?.items.length ?? 0}</span></div>{editingEnabled && selectedTopic && <button type="button" className="primary mini" aria-label="新增第二層" onClick={openNewItem}><PlusCircle size={14} />新增</button>}</header>
        <input type="search" value={itemQuery} onChange={(event) => setItemQuery(event.target.value)} placeholder="搜尋第二層項目" aria-label="搜尋第二層項目" />
        <div className="catalog-entry-list">{filteredItems.map((item) => {
          const duplicate = duplicateItemCodes.has(item.code)
          const draft: CatalogEntryDraft = { entityType: 'item', id: item.id, parentId: selectedTopic?.id, code: item.code, nameZh: item.titleZh, nameEn: item.titleEn || '', sortOrder: item.sortOrder, active: item.active !== false }
          return <article key={item.id || `${item.code}-${item.sortOrder}`} className={`catalog-entry ${item.active === false ? 'inactive' : ''} ${duplicate ? 'duplicate' : ''}`}>
            <div className="catalog-entry-main"><b>{item.code}{duplicate ? ' · 重複代碼' : ''}</b><span>{item.titleZh}</span><small>{entryStatus(item.active)} · {selectedTopic ? itemReferences(selectedTopic.code, item.code) : 0} 筆需求</small></div>
            <div>{selectedTopic && editButton(`修改第二層項目 ${item.code} ${item.titleZh}`, () => editItem(selectedTopic, item))}{toggleButton(`第二層項目 ${item.code} ${item.titleZh}`, draft)}</div>
          </article>
        })}{filteredItems.length === 0 && <p className="catalog-empty">此主題沒有符合的第二層項目</p>}</div>
      </section>
    </div>

    {editor && <div className="modal-backdrop no-print" role="dialog" aria-modal="true" aria-label={editor.title}>
      <form className="catalog-editor-modal" onSubmit={(event) => { event.preventDefault(); void persist(editor.draft).catch(() => undefined) }}>
        <div><p className="eyebrow">Catalog Editor</p><h3>{editor.title}</h3></div>
        <label>{editor.draft.entityType === 'category' ? '大類代碼' : editor.draft.entityType === 'topic' ? '第一層代碼' : '第二層代碼'}<input value={editor.draft.code} disabled={Boolean(editor.draft.id)} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, code: event.target.value } })} placeholder="建立後不可修改" /></label>
        <label>中文名稱<input value={editor.draft.nameZh} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, nameZh: event.target.value } })} /></label>
        <label>英文名稱（可留空）<input value={editor.draft.nameEn || ''} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, nameEn: event.target.value } })} /></label>
        <label>顯示排序<input type="number" min="0" step="1" value={editor.draft.sortOrder} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, sortOrder: Number(event.target.value) } })} /></label>
        {editor.draft.entityType === 'topic' && <label>上層大類<select value={editor.draft.parentId} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, parentId: event.target.value } })}>{catalogData.map((category) => <option key={category.id} value={category.id}>{category.code}｜{category.nameZh}{category.active === false ? '（已停用）' : ''}</option>)}</select></label>}
        {editor.draft.entityType === 'item' && <label>上層第一層主題<select value={editor.draft.parentId} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, parentId: event.target.value } })}>{allTopics.map(({ category, topic }) => <option key={topic.id} value={topic.id}>{category.code} → {topic.code}｜{topic.titleZh}{topic.active === false || category.active === false ? '（上層已停用）' : ''}</option>)}</select></label>}
        <p className="catalog-editor-help">名稱修改會更新所有歷史需求的顯示；上下層調整不會改寫歷史需求保存的代碼。</p>
        <div className="modal-actions"><button type="button" className="ghost" onClick={() => setEditor(null)} disabled={saving}>取消</button><button type="submit" className="primary" disabled={saving}><Save size={15} />{saving ? '保存中…' : '保存目錄項目'}</button></div>
      </form>
    </div>}
  </section>
}
