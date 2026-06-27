import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, FileSpreadsheet, LayoutDashboard, Lock, PlusCircle, Printer, RefreshCw, Trash2 } from 'lucide-react'
import './App.css'
import { catalog, getManualItemOptions, getTopicOptions } from './data/sqmsCatalog'
import type { ChangeRequest, RequestStatus, Urgency } from './types'
import { buildDashboardStats, filterRequests, isOverdue, isPending } from './lib/stats'
import { createBlankRequest, loadRequests, saveRequest, softDeleteRequest } from './lib/storage'
import { exportCsv, exportExcel, getCategoryName, getItemLabel, getTopicLabel, statusLabels, urgencyLabels } from './lib/exporters'
import { isCloudConfigured, supabase } from './lib/supabaseClient'

type Tab = 'form' | 'dashboard' | 'all' | 'pending' | 'admin'

type Filters = {
  from: string
  to: string
  categoryCode: string
  topicCode: string
  status: RequestStatus | 'all'
  urgency: Urgency | 'all'
}

const emptyFilters: Filters = { from: '', to: '', categoryCode: '', topicCode: '', status: 'all', urgency: 'all' }
const chartColors = ['#b8e0d2', '#f7c6c7', '#cdb4db', '#a2d2ff', '#ffd6a5', '#fdffb6', '#d0f4de']

function App() {
  const [tab, setTab] = useState<Tab>('form')
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [form, setForm] = useState<ChangeRequest>(() => createBlankRequest(1))
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')

  async function refresh() {
    setLoading(true)
    try {
      const data = await loadRequests()
      setRequests(data)
    } catch (error) {
      setMessage(`讀取失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
    if (supabase) {
      supabase.auth.getSession().then(({ data }) => setIsAdmin(Boolean(data.session)))
    }
  }, [])

  const filtered = useMemo(() => filterRequests(requests, filters), [requests, filters])
  const pending = useMemo(() => filtered.filter(isPending), [filtered])
  const stats = useMemo(() => buildDashboardStats(requests, filters), [requests, filters])
  const topicOptions = getTopicOptions(form.categoryCode)
  const itemOptions = getManualItemOptions(form.topicCode)
  const nextSequence = requests.length + 1

  function updateForm<K extends keyof ChangeRequest>(key: K, value: ChangeRequest[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  function resetForm() {
    setEditingId(null)
    setForm(createBlankRequest(nextSequence + 1))
    setMessage('已切換到新增模式。')
    setTab('form')
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!form.applicantName.trim() || !form.topicCode || !form.suggestedChange.trim() || !form.changeReason.trim() || !form.targetDueDate) {
      setMessage('請填寫申請人、第一層主題、建議內容、修改理由與期望完成日期。')
      return
    }
    const saved = await saveRequest({
      ...form,
      requestNo: form.requestNo || `SQMS-TEMP-${Date.now()}`,
      createdAt: form.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    setRequests((current) => {
      const exists = current.some((item) => item.id === saved.id)
      return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current]
    })
    setMessage(editingId ? `已更新 ${saved.requestNo}` : `已新增 ${saved.requestNo}`)
    setEditingId(null)
    setForm(createBlankRequest(nextSequence + 1))
  }

  function startEdit(request: ChangeRequest) {
    setEditingId(request.id)
    setForm({ ...request })
    setTab('form')
    setMessage(`正在修改 ${request.requestNo}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(request: ChangeRequest) {
    if (!isAdmin) return
    if (!confirm(`確定要刪除 ${request.requestNo}？此操作採軟刪除，前台不再顯示。`)) return
    await softDeleteRequest(request.id, adminEmail || 'admin')
    setRequests((current) => current.filter((item) => item.id !== request.id))
    setMessage(`已軟刪除 ${request.requestNo}`)
  }

  async function adminLogin(event: React.FormEvent) {
    event.preventDefault()
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({ email: adminEmail, password: adminPassword })
      if (error) {
        setMessage(`登入失敗：${error.message}`)
        return
      }
      setIsAdmin(true)
      setMessage('管理員已登入。')
      return
    }
    if (adminPassword === 'SQMS-ADMIN') {
      setIsAdmin(true)
      setMessage('本機展示模式管理員已登入。正式上線請使用 Supabase Auth。')
    } else {
      setMessage('本機展示密碼錯誤。正式上線後使用 Supabase 管理員帳號。')
    }
  }

  const listForActiveTab = tab === 'pending' ? pending : filtered

  return (
    <div className="app-shell">
      <header className="topbar no-print">
        <div>
          <p className="eyebrow">SQMS Revision Control</p>
          <h1>SQMS 程序書修訂需求管理和統計系統</h1>
          <p className="subtle">手機端優先快速新增 / 修改；電腦端完成統計、篩選、匯出與管理。</p>
        </div>
        <div className="cloud-pill">{isCloudConfigured ? 'Supabase 雲端已配置' : '本機展示模式：待配置 Supabase'}</div>
      </header>

      <nav className="nav-tabs no-print" aria-label="主功能">
        <button className={tab === 'form' ? 'active' : ''} onClick={() => setTab('form')}><PlusCircle size={16} /> 新增/修改</button>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}><LayoutDashboard size={16} /> Dashboard</button>
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>統計清單</button>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待完成</button>
        <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}><Lock size={16} /> 管理</button>
      </nav>

      {message && <div className="message no-print">{message}</div>}

      {tab === 'form' && (
        <section className="panel form-panel">
          <div className="section-title">
            <div>
              <p className="eyebrow">Quick Capture</p>
              <h2>{editingId ? '修改既有需求' : '快速新增修改需求'}</h2>
            </div>
            <button className="ghost no-print" onClick={resetForm}>新增一筆</button>
          </div>
          <form onSubmit={handleSubmit} className="request-form">
            <label>需求編號<input value={form.requestNo} onChange={(e) => updateForm('requestNo', e.target.value)} /></label>
            <label>申請人 *<input value={form.applicantName} onChange={(e) => updateForm('applicantName', e.target.value)} placeholder="輸入姓名" /></label>
            <label>大類 *<select value={form.categoryCode} onChange={(e) => {
              const categoryCode = e.target.value
              const firstTopic = getTopicOptions(categoryCode)[0]
              setForm((current) => ({ ...current, categoryCode, topicCode: firstTopic?.code ?? '', manualItemCode: '' }))
            }}>{catalog.map((category) => <option key={category.code} value={category.code}>{category.code}｜{category.nameZh}</option>)}</select></label>
            <label>第一層主題 *<select value={form.topicCode} onChange={(e) => setForm((current) => ({ ...current, topicCode: e.target.value, manualItemCode: '' }))}>{topicOptions.map((topic) => <option key={topic.code} value={topic.code}>{topic.code}｜{topic.titleZh}</option>)}</select></label>
            <label>第二層手冊 / 文件項<select value={form.manualItemCode ?? ''} onChange={(e) => updateForm('manualItemCode', e.target.value)}><option value="">只具體到第一層主題</option>{itemOptions.map((item) => <option key={item.code} value={item.code}>{item.code}｜{item.titleZh}</option>)}</select></label>
            <label>期望完成日期 *<input type="date" value={form.targetDueDate} onChange={(e) => updateForm('targetDueDate', e.target.value)} /></label>
            <label>急迫度<select value={form.urgency} onChange={(e) => updateForm('urgency', e.target.value as Urgency)}>{Object.entries(urgencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>狀態<select value={form.status} onChange={(e) => updateForm('status', e.target.value as RequestStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="wide">修改內容歸屬補充<input value={form.scopeNote ?? ''} onChange={(e) => updateForm('scopeNote', e.target.value)} placeholder="例如：某段落、某表格、某流程" /></label>
            <label className="wide">需改的建議內容或方向 *<textarea value={form.suggestedChange} onChange={(e) => updateForm('suggestedChange', e.target.value)} rows={4} /></label>
            <label className="wide">需要修改的理由或依據 *<textarea value={form.changeReason} onChange={(e) => updateForm('changeReason', e.target.value)} rows={3} /></label>
            <label className="check"><input type="checkbox" checked={form.needRelatedFormUpdate} onChange={(e) => updateForm('needRelatedFormUpdate', e.target.checked)} /> 需要配套修改記錄表格</label>
            <label className="wide">推薦的修改內容或資料參考<textarea value={form.referenceMaterials ?? ''} onChange={(e) => updateForm('referenceMaterials', e.target.value)} rows={3} /></label>
            <div className="form-actions wide no-print"><button className="primary" type="submit">{editingId ? '保存修改' : '新增需求'}</button><button type="button" className="ghost" onClick={() => setTab('all')}>查看清單</button></div>
          </form>
        </section>
      )}

      {tab === 'dashboard' && <Dashboard stats={stats} filters={filters} setFilters={setFilters} loading={loading} onRefresh={refresh} />}

      {(tab === 'all' || tab === 'pending') && (
        <section className="panel">
          <ListHeader title={tab === 'pending' ? '待完成清單' : '統計清單'} filters={filters} setFilters={setFilters} requests={listForActiveTab} onRefresh={refresh} />
          <RequestTable requests={listForActiveTab} isAdmin={isAdmin} onEdit={startEdit} onDelete={handleDelete} />
        </section>
      )}

      {tab === 'admin' && (
        <section className="panel admin-panel">
          <div className="section-title"><div><p className="eyebrow">Admin</p><h2>管理員後台</h2></div></div>
          {!isAdmin ? (
            <form className="admin-login" onSubmit={adminLogin}>
              <label>管理員帳號 / Email<input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@example.com" /></label>
              <label>密碼<input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="本機展示密碼：SQMS-ADMIN" /></label>
              <button className="primary">登入管理</button>
              <p className="subtle">正式上線後使用 Supabase Auth 建立約 5 位管理員；本機未配置雲端時可用展示密碼測試刪除 UI。</p>
            </form>
          ) : (
            <><p className="subtle">已登入。刪除採軟刪除：前台不顯示，資料庫保留刪除時間與刪除人。</p><RequestTable requests={filtered} isAdmin={isAdmin} onEdit={startEdit} onDelete={handleDelete} /></>
          )}
        </section>
      )}
    </div>
  )
}

function Dashboard({ stats, filters, setFilters, loading, onRefresh }: { stats: ReturnType<typeof buildDashboardStats>, filters: Filters, setFilters: (f: Filters) => void, loading: boolean, onRefresh: () => void }) {
  const categoryData = Object.entries(stats.byCategory).map(([name, value]) => ({ name, value }))
  const topicData = Object.entries(stats.byTopic).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))
  return <section className="panel dashboard-panel">
    <ListHeader title="狀態 Dashboard" filters={filters} setFilters={setFilters} requests={[]} onRefresh={onRefresh} hideExports />
    <div className="kpi-grid">
      <Kpi label="提出件數" value={stats.total} tone="mint" />
      <Kpi label="完成件數" value={stats.completed} tone="blue" />
      <Kpi label="完成率" value={`${stats.completionRate}%`} tone="purple" />
      <Kpi label="按時完成率" value={`${stats.onTimeCompletionRate}%`} tone="green" />
      <Kpi label="滯期數量" value={stats.overdue} tone="pink" />
      <Kpi label="逾期率" value={`${stats.overdueRate}%`} tone="orange" />
      <Kpi label="待完成" value={stats.pending} tone="yellow" />
    </div>
    {loading ? <p>讀取中...</p> : <div className="chart-grid">
      <div className="chart-card"><h3>各大類分佈</h3><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" outerRadius={82} label>{categoryData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
      <div className="chart-card"><h3>第一層主題 Top 8</h3><ResponsiveContainer width="100%" height={230}><BarChart data={topicData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#a2d2ff" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
    </div>}
  </section>
}

function Kpi({ label, value, tone }: { label: string, value: string | number, tone: string }) { return <div className={`kpi ${tone}`}><span>{label}</span><strong>{value}</strong></div> }

function ListHeader({ title, filters, setFilters, requests, onRefresh, hideExports = false }: { title: string, filters: Filters, setFilters: (f: Filters) => void, requests: ChangeRequest[], onRefresh: () => void, hideExports?: boolean }) {
  const topics = filters.categoryCode ? getTopicOptions(filters.categoryCode) : []
  const applyRecentDays = (days: number) => {
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - days + 1)
    const formatDate = (date: Date) => date.toISOString().slice(0, 10)
    setFilters({ ...filters, from: formatDate(from), to: formatDate(today) })
  }
  return <div className="list-header no-print">
    <div className="section-title list-title-row">
      <div><p className="eyebrow">List</p><h2>{title}</h2></div>
      <div className="header-actions">
        <button className="ghost" onClick={onRefresh}><RefreshCw size={14} />同步最新</button>
        {!hideExports && <><button className="ghost" onClick={() => window.print()}><Printer size={14} />列印/PDF</button><button className="ghost" onClick={() => exportCsv(requests, 'sqms修訂需求.csv')}><Download size={14} />CSV</button><button className="ghost" onClick={() => exportExcel(requests, 'sqms修訂需求.xlsx')}><FileSpreadsheet size={14} />Excel</button></>}
      </div>
    </div>
    <div className="filters">
      <button className="ghost quick-range" onClick={() => applyRecentDays(30)}>近30天新增、修改</button>
      <button className="ghost quick-range" onClick={() => applyRecentDays(60)}>近60天新增、修改</button>
      <button className="ghost quick-range" onClick={() => applyRecentDays(90)}>近90天新增、修改</button>
      <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
      <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      <select value={filters.categoryCode} onChange={(e) => setFilters({ ...filters, categoryCode: e.target.value, topicCode: '' })}><option value="">全部大類</option>{catalog.map((c) => <option key={c.code} value={c.code}>{c.code}｜{c.nameZh}</option>)}</select>
      <select value={filters.topicCode} onChange={(e) => setFilters({ ...filters, topicCode: e.target.value })}><option value="">全部第一層主題</option>{topics.map((t) => <option key={t.code} value={t.code}>{t.code}｜{t.titleZh}</option>)}</select>
      <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as RequestStatus | 'all' })}><option value="all">全部狀態</option>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value as Urgency | 'all' })}><option value="all">全部急迫度</option>{Object.entries(urgencyLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <button className="ghost" onClick={() => setFilters(emptyFilters)}>清除</button>
    </div>
  </div>
}

function RequestTable({ requests, isAdmin, onEdit, onDelete }: { requests: ChangeRequest[], isAdmin: boolean, onEdit: (r: ChangeRequest) => void, onDelete: (r: ChangeRequest) => void }) {
  const sorted = [...requests].sort((a, b) => {
    const overdueDiff = Number(isOverdue(b)) - Number(isOverdue(a))
    if (overdueDiff) return overdueDiff
    return a.targetDueDate.localeCompare(b.targetDueDate)
  })
  return <div className="table-wrap"><table className="request-table"><colgroup><col className="col-status" /><col className="col-urgency" /><col className="col-no" /><col className="col-scope" /><col className="col-content" /><col className="col-due" /><col className="col-applicant" /><col className="col-actions" /></colgroup><thead><tr><th>狀態</th><th>急迫度</th><th>編號</th><th>歸屬</th><th>建議內容</th><th>期望日</th><th>申請人</th><th className="no-print">操作</th></tr></thead><tbody>{sorted.length === 0 ? <tr><td colSpan={8} className="empty">暫無資料</td></tr> : sorted.map((request) => <tr key={request.id} className={isOverdue(request) ? 'overdue' : ''}><td><span className={`status ${request.status}`}>{statusLabels[request.status]}</span></td><td>{urgencyLabels[request.urgency]}</td><td><b>{request.requestNo}</b><small>{request.createdAt.slice(0, 10)}</small></td><td><span className="tag">{getCategoryName(request.categoryCode)}</span><b>{getTopicLabel(request.topicCode)}</b><small>{getItemLabel(request.topicCode, request.manualItemCode) || '未選第二層'}</small></td><td><b>{request.suggestedChange}</b><small>{request.changeReason}</small></td><td>{request.targetDueDate}</td><td>{request.applicantName}</td><td className="actions no-print"><button onClick={() => onEdit(request)}>修改</button>{isAdmin && <button className="danger" onClick={() => onDelete(request)}><Trash2 size={14} />刪除</button>}</td></tr>)}</tbody></table></div>
}

export default App
