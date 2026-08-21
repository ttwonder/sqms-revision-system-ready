import { useCallback, useEffect, useMemo, useState } from 'react'
import { Database, HardDrive, RefreshCw, Trash2 } from 'lucide-react'
import type { ChangeRequest } from './types'
import {
  buildLocalSqmsStorageStats,
  dataManagementErrorMessage,
  DataManagementError,
  formatDataBytes,
  getSqmsStorageStats,
  purgeSqmsDeletedRequests,
  type SqmsStorageStats,
} from './lib/dataManagement'

type Props = {
  requests: ChangeRequest[]
  onPurged: () => Promise<void> | void
}

export default function DataManagementPanel({ requests, onPurged }: Props) {
  const [stats, setStats] = useState<SqmsStorageStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [acting, setActing] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [errorText, setErrorText] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setErrorText('')
    try {
      const next = await getSqmsStorageStats(requests)
      setStats(next)
      const available = new Set(next.deletedCandidates.map((row) => row.id))
      setSelectedIds((current) => current.filter((id) => available.has(id)))
    } catch (error) {
      setErrorText(dataManagementErrorMessage(error))
    } finally {
      setLoading(false)
    }
  }, [requests])

  useEffect(() => { void refresh() }, [refresh])

  const allSelected = Boolean(stats?.deletedCandidates.length)
    && stats!.deletedCandidates.every((row) => selectedIds.includes(row.id))
  const someSelected = Boolean(stats?.deletedCandidates.some((row) => selectedIds.includes(row.id)))
  const selectedBytes = useMemo(() => stats?.deletedCandidates
    .filter((row) => selectedIds.includes(row.id))
    .reduce((sum, row) => sum + row.logicalBytes, 0) ?? 0, [stats, selectedIds])

  function toggleCandidate(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  function toggleAllCandidates() {
    if (!stats?.deletedCandidates.length) return
    setSelectedIds(allSelected ? [] : stats.deletedCandidates.map((row) => row.id))
  }

  async function purgeSelected() {
    if (!stats || !selectedIds.length || acting) return
    const selectedRows = stats.deletedCandidates.filter((row) => selectedIds.includes(row.id))
    const confirmed = window.confirm([
      `確定永久刪除 ${selectedRows.length} 筆已軟刪除需求？`,
      `需求：${selectedRows.map((row) => row.requestNo).join('、')}`,
      `預估邏輯量：${formatDataBytes(selectedBytes)}`,
      '',
      '將一併永久刪除這些需求自己的事件歷史；正常需求、人員、管理員、來源與每日編號不會刪除。',
      '此操作無法復原；PostgreSQL 物理總量不一定立即縮小。',
    ].join('\n'))
    if (!confirmed) return

    setActing(true)
    setErrorText('')
    setNotice('')
    try {
      const result = await purgeSqmsDeletedRequests({
        operationId: crypto.randomUUID(),
        expectedRequestIds: stats.deletedCandidates.map((row) => row.id),
        deleteRequestIds: selectedIds,
      }, requests)
      setSelectedIds([])
      setNotice(`永久清理完成：${result.deletedRequestCount} 筆需求、${result.deletedEventCount} 筆事件，邏輯量 ${formatDataBytes(result.deletedBytes)}。`)
      if (result.remainingRequests) setStats(buildLocalSqmsStorageStats(result.remainingRequests))
      await onPurged()
      if (!result.remainingRequests) await refresh()
    } catch (error) {
      if (error instanceof DataManagementError && error.code === 'DELETED_SET_CHANGED') await refresh()
      setErrorText(dataManagementErrorMessage(error))
    } finally {
      setActing(false)
    }
  }

  return <section className="admin-card data-management-panel">
    <div className="section-title compact-title">
      <div><p className="eyebrow">Data & Storage</p><h3>資料與空間管理</h3></div>
      <button className="ghost" type="button" onClick={() => void refresh()} disabled={loading || acting}><RefreshCw size={14} />{loading ? '讀取中…' : '刷新空間'}</button>
    </div>
    <p className="subtle">比照月報與 Ship Dynamics：物理空間和逐項邏輯量分開顯示；選擇性清理只處理已軟刪除需求。</p>

    {errorText && <div className="data-management-message error" role="alert">{errorText}</div>}
    {notice && <div className="data-management-message success" role="status">{notice}</div>}
    {!stats && loading && <div className="data-management-empty">正在讀取空間資料…</div>}

    {stats && <>
      <div className="storage-metric-grid">
        <article><small>Supabase 資料庫總用量</small><b>{formatDataBytes(stats.databaseTotalBytes)}</b><span>{stats.source === 'cloud' ? '整個 Project database，含系統與其他資料表' : '本機展示模式不提供物理資料庫量'}</span></article>
        <article><small>SQMS 資料表用量</small><b>{formatDataBytes(stats.appDatabasePhysicalBytes)}</b><span>資料、索引與 TOAST；已包含在資料庫總量內</span></article>
        <article><small>Supabase Storage</small><b>{formatDataBytes(stats.storageObjectBytes)}</b><span>{stats.storageObjectCount === null ? '本機展示模式不提供' : `${stats.storageObjectCount} 個物件；整個 Project bucket 合計`}</span></article>
        <article><small>網站程式檔</small><b>{stats.staticSiteHost}</b><span>HTML／JS／CSS 不佔 Supabase Storage</span></article>
      </div>

      <div className="storage-secondary-grid">
        <span><small>正常需求</small><b>{stats.activeRequestCount} 筆｜{formatDataBytes(stats.activeRequestBytes)}</b></span>
        <span><small>已軟刪除需求</small><b>{stats.deletedRequestCount} 筆｜{formatDataBytes(stats.deletedRequestBytes)}</b></span>
        <span><small>需求事件歷史</small><b>{stats.requestEventCount} 筆｜{formatDataBytes(stats.requestEventBytes)}</b></span>
      </div>

      <div className="data-management-purge-head">
        <div><b>已軟刪除資料選擇性清理</b><span>已選 {selectedIds.length} 筆｜預估 {formatDataBytes(selectedBytes)}</span></div>
        <div>
          <button className="ghost" type="button" onClick={toggleAllCandidates} disabled={!stats.deletedCandidates.length || acting}>{allSelected ? '取消全選' : '全選可清理項目'}</button>
          <button className="ghost" type="button" onClick={() => setSelectedIds([])} disabled={!selectedIds.length || acting}>清除選擇</button>
          <button className="ghost danger" type="button" onClick={() => void purgeSelected()} disabled={!selectedIds.length || acting}><Trash2 size={14} />{acting ? '永久刪除中…' : `永久刪除所選（${selectedIds.length}）`}</button>
        </div>
      </div>

      <div className="data-management-table-wrap">
        <table className="data-management-table">
          <thead><tr><th className="select-cell"><input className="table-select" type="checkbox" aria-label="全選可永久清理需求" checked={allSelected} ref={(node) => { if (node) node.indeterminate = someSelected && !allSelected }} onChange={toggleAllCandidates} /></th><th>需求編號</th><th>申請人</th><th>軟刪除時間</th><th>刪除人</th><th>事件歷史</th><th>預估邏輯量</th></tr></thead>
          <tbody>{stats.deletedCandidates.map((row) => <tr key={row.id} className={selectedIds.includes(row.id) ? 'selected' : ''}><td className="select-cell"><input className="table-select" type="checkbox" aria-label={`選擇永久刪除 ${row.requestNo}`} checked={selectedIds.includes(row.id)} onChange={() => toggleCandidate(row.id)} /></td><td><b>{row.requestNo}</b></td><td>{row.applicantName || '未記錄'}</td><td>{row.deletedAt ? new Date(row.deletedAt).toLocaleString('zh-TW') : '未記錄'}</td><td>{row.deletedBy}</td><td>{row.eventCount} 筆｜{formatDataBytes(row.eventBytes)}</td><td>{formatDataBytes(row.logicalBytes)}</td></tr>)}{!stats.deletedCandidates.length && <tr><td colSpan={7} className="empty">目前沒有已軟刪除、可永久清理的需求。</td></tr>}</tbody>
        </table>
      </div>

      <div className="data-management-warning"><Database size={16} /><p><b>安全範圍：</b>永久清理只刪除所選軟刪除需求及其事件歷史。正常需求、人員、管理員、需求來源、每日編號與其他資料不會刪除。邏輯量會下降，但 PostgreSQL 物理頁面可能保留並重用，因此物理總量不一定立即縮小。</p></div>
      <div className="data-management-updated"><HardDrive size={14} />{stats.source === 'cloud' ? 'Supabase 雲端統計' : '本機展示預覽'}｜更新：{new Date(stats.generatedAt).toLocaleString('zh-TW')}</div>
    </>}
  </section>
}
