import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, FileSpreadsheet, LayoutDashboard, Lock, PlusCircle, Printer, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import './App.css'
import { catalog, getManualItemOptions, getTopicOptions } from './data/sqmsCatalog'
import type { AdminRole, AdminUser, ChangeRequest, RequestStatus, Urgency } from './types'
import { buildDashboardStats, filterRequests, isOverdue, isPending } from './lib/stats'
import { createBlankRequest, loadRequests, saveRequest, softDeleteRequest } from './lib/storage'
import { exportCsv, exportExcel, getCategoryName, getItemLabel, getTopicLabel, statusLabels, urgencyLabels } from './lib/exporters'
import { fromDbAdminUser, isCloudConfigured, signupClient, supabase } from './lib/supabaseClient'

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
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null)
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([])
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [newAdmin, setNewAdmin] = useState({ email: '', password: '', displayName: '', role: 'admin' as AdminRole })

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

  async function loadAdminProfile(email: string): Promise<AdminUser | null> {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('email', email.trim().toLowerCase())
      .eq('active', true)
      .maybeSingle()
    if (error) {
      if (error.message.includes('admin_users') || error.code === '42P01') {
        throw new Error('管理員權限表尚未建立，請先在 Supabase SQL Editor 執行最新版 supabase/schema.sql。')
      }
      throw error
    }
    return data ? fromDbAdminUser(data) : null
  }

  async function refreshAdminUsers() {
    if (!supabase || !adminProfile) return
    const { data, error } = await supabase
      .from('admin_users')
      .select('*')
      .order('role', { ascending: false })
      .order('email')
    if (error) {
      setMessage(`管理員名單讀取失敗：${error.message}`)
      return
    }
    setAdminUsers((data ?? []).map(fromDbAdminUser))
  }

  async function acceptAdminSession(email: string) {
    const profile = await loadAdminProfile(email)
    if (!profile) {
      await supabase?.auth.signOut()
      setAdminProfile(null)
      setAdminUsers([])
      throw new Error('無權限：此帳號不在管理員名單中，請聯絡系統 owner。')
    }
    setAdminProfile(profile)
    setAdminEmail(profile.email)
    const { data } = await supabase
      ?.from('admin_users')
      .select('*')
      .order('role', { ascending: false })
      .order('email') ?? { data: [] }
    setAdminUsers((data ?? []).map(fromDbAdminUser))
    return profile
  }

  useEffect(() => {
    refresh()
    if (supabase) {
      supabase.auth.getSession().then(async ({ data }) => {
        const email = data.session?.user.email
        if (!email) return
        try {
          await acceptAdminSession(email)
        } catch {
          // 非管理員歷史登入狀態直接清理，不打擾普通填寫流程。
        }
      })
    }
  }, [])

  const isAdmin = Boolean(adminProfile?.active)
  const isOwner = adminProfile?.role === 'owner'

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
    await softDeleteRequest(request.id, adminProfile?.email || 'admin')
    setRequests((current) => current.filter((item) => item.id !== request.id))
    setMessage(`已軟刪除 ${request.requestNo}`)
  }

  async function handleAdminLogout() {
    await supabase?.auth.signOut()
    setAdminProfile(null)
    setAdminUsers([])
    setAdminPassword('')
    setMessage('已登出管理員。')
  }

  async function createAdminUser(event: React.FormEvent) {
    event.preventDefault()
    if (!supabase || !signupClient || !isOwner) {
      setMessage('無權限：只有 owner 可以新增或維護管理員名單。')
      return
    }
    const email = newAdmin.email.trim().toLowerCase()
    if (!email) {
      setMessage('請填寫管理員 Email。')
      return
    }
    if (newAdmin.password && newAdmin.password.length < 6) {
      setMessage('初始密碼至少需要 6 位。')
      return
    }

    if (newAdmin.password) {
      const { error: signupError } = await signupClient.auth.signUp({
        email,
        password: newAdmin.password,
        options: { data: { display_name: newAdmin.displayName.trim() } },
      })
      if (signupError && !/already|registered|exist/i.test(signupError.message)) {
        setMessage(`建立登入帳號失敗：${signupError.message}。如已關閉公開註冊，請先到 Supabase Auth 手動 Add user，再回此處加入名單。`)
        return
      }
    }

    const { error } = await supabase.from('admin_users').upsert({
      email,
      display_name: newAdmin.displayName.trim() || null,
      role: newAdmin.role,
      active: true,
    }, { onConflict: 'email' })
    if (error) {
      setMessage(`管理員名單保存失敗：${error.message}`)
      return
    }
    setNewAdmin({ email: '', password: '', displayName: '', role: 'admin' })
    setMessage(`已加入管理員：${email}`)
    await refreshAdminUsers()
  }

  async function deactivateAdmin(user: AdminUser) {
    if (!supabase || !isOwner) return
    if (user.email === adminProfile?.email) {
      setMessage('不能停用目前登入中的 owner 帳號。')
      return
    }
    if (!confirm(`確定停用 ${user.email} 的管理權限？登入帳號仍存在，但不能進入管理界面。`)) return
    const { error } = await supabase.from('admin_users').update({ active: false }).eq('id', user.id)
    if (error) {
      setMessage(`停用失敗：${error.message}`)
      return
    }
    setMessage(`已停用管理員：${user.email}`)
    await refreshAdminUsers()
  }

  async function adminLogin(event: React.FormEvent) {
    event.preventDefault()
    if (supabase) {
      const { data, error } = await supabase.auth.signInWithPassword({ email: adminEmail.trim(), password: adminPassword })
      if (error) {
        setMessage(`登入失敗：${error.message}`)
        return
      }
      try {
        const profile = await acceptAdminSession(data.user.email ?? adminEmail)
        setMessage(`管理員已登入：${profile.email}（${profile.role}）`)
      } catch (permissionError) {
        setMessage(permissionError instanceof Error ? permissionError.message : '無權限：此帳號不是管理員。')
      }
      return
    }
    if (adminPassword === 'SQMS-ADMIN') {
      setAdminProfile({ id: 'local-owner', email: adminEmail || 'local-owner', role: 'owner', active: true, createdAt: '', updatedAt: '' })
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
          <PrintHeader title={tab === 'pending' ? '待完成清單' : '統計清單'} filters={filters} count={listForActiveTab.length} />
          <ListHeader title={tab === 'pending' ? '待完成清單' : '統計清單'} filters={filters} setFilters={setFilters} requests={listForActiveTab} onRefresh={refresh} />
          <RequestTable requests={listForActiveTab} isAdmin={isAdmin} onEdit={startEdit} onDelete={handleDelete} />
        </section>
      )}

      {tab === 'admin' && (
        <AdminPanel
          adminEmail={adminEmail}
          adminPassword={adminPassword}
          adminProfile={adminProfile}
          adminUsers={adminUsers}
          filteredRequests={filtered}
          isAdmin={isAdmin}
          isOwner={isOwner}
          newAdmin={newAdmin}
          setAdminEmail={setAdminEmail}
          setAdminPassword={setAdminPassword}
          setNewAdmin={setNewAdmin}
          onAdminLogin={adminLogin}
          onAdminLogout={handleAdminLogout}
          onCreateAdmin={createAdminUser}
          onDeactivateAdmin={deactivateAdmin}
          onEditRequest={startEdit}
          onDeleteRequest={handleDelete}
          onRefreshAdmins={refreshAdminUsers}
        />
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

type AdminPanelProps = {
  adminEmail: string
  adminPassword: string
  adminProfile: AdminUser | null
  adminUsers: AdminUser[]
  filteredRequests: ChangeRequest[]
  isAdmin: boolean
  isOwner: boolean
  newAdmin: { email: string, password: string, displayName: string, role: AdminRole }
  setAdminEmail: (value: string) => void
  setAdminPassword: (value: string) => void
  setNewAdmin: (value: { email: string, password: string, displayName: string, role: AdminRole }) => void
  onAdminLogin: (event: React.FormEvent) => void
  onAdminLogout: () => void
  onCreateAdmin: (event: React.FormEvent) => void
  onDeactivateAdmin: (user: AdminUser) => void
  onEditRequest: (request: ChangeRequest) => void
  onDeleteRequest: (request: ChangeRequest) => void
  onRefreshAdmins: () => void
}

function AdminPanel({ adminEmail, adminPassword, adminProfile, adminUsers, filteredRequests, isAdmin, isOwner, newAdmin, setAdminEmail, setAdminPassword, setNewAdmin, onAdminLogin, onAdminLogout, onCreateAdmin, onDeactivateAdmin, onEditRequest, onDeleteRequest, onRefreshAdmins }: AdminPanelProps) {
  return <section className="panel admin-panel">
    <div className="section-title"><div><p className="eyebrow">Admin</p><h2>管理員後台</h2></div>{isAdmin && <button className="ghost no-print" onClick={onAdminLogout}>登出</button>}</div>
    {!isAdmin ? (
      <div className="permission-card">
        <p className="subtle">只有管理員名單中的帳號可以進入管理界面；其他 Auth 用戶登入後會收到「無權限」提示。</p>
        <form className="admin-login" onSubmit={onAdminLogin}>
          <label>管理員帳號 / Email<input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@example.com" /></label>
          <label>密碼<input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="輸入管理員密碼" /></label>
          <button className="primary">登入管理</button>
        </form>
      </div>
    ) : (
      <div className="admin-stack">
        <div className="admin-status">
          <strong>已登入：{adminProfile?.email}</strong>
          <span className={`role-pill ${adminProfile?.role}`}>{adminProfile?.role === 'owner' ? 'Owner' : 'Admin'}</span>
          <span className="subtle">管理員可刪除需求；只有 Owner 可以新增/停用管理員。</span>
        </div>

        <section className="admin-card">
          <div className="section-title compact-title"><div><p className="eyebrow">Admins</p><h3>管理員名單</h3></div><button className="ghost" onClick={onRefreshAdmins}><RefreshCw size={14} />同步名單</button></div>
          {isOwner ? (
            <form className="admin-user-form" onSubmit={onCreateAdmin}>
              <label>Email / 用戶名<input value={newAdmin.email} onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} placeholder="new-admin@example.com" /></label>
              <label>初始密碼<input type="password" value={newAdmin.password} onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} placeholder="新帳號填寫；既有 Auth 用戶可留空" /></label>
              <label>顯示名稱<input value={newAdmin.displayName} onChange={(e) => setNewAdmin({ ...newAdmin, displayName: e.target.value })} placeholder="可選" /></label>
              <label>角色<select value={newAdmin.role} onChange={(e) => setNewAdmin({ ...newAdmin, role: e.target.value as AdminRole })}><option value="admin">Admin</option><option value="owner">Owner</option></select></label>
              <button className="primary"><UserPlus size={14} />新增/更新</button>
            </form>
          ) : <p className="subtle">你是 Admin，可查看管理員名單；新增或停用管理員需 Owner 操作。</p>}
          <div className="admin-users-list">
            {adminUsers.length === 0 ? <p className="subtle">暫無管理員資料。若這是首次部署，請先在 Supabase SQL Editor 執行新版 schema。</p> : adminUsers.map((user) => <div key={user.id} className={`admin-user-row ${user.active ? '' : 'inactive'}`}>
              <div><b>{user.email}</b><small>{user.displayName || '未填顯示名稱'}</small></div>
              <span className={`role-pill ${user.role}`}>{user.role === 'owner' ? 'Owner' : 'Admin'}</span>
              <span>{user.active ? '啟用' : '停用'}</span>
              {isOwner && user.active && user.email !== adminProfile?.email && <button className="danger" onClick={() => onDeactivateAdmin(user)}>停用</button>}
            </div>)}
          </div>
        </section>

        <section className="admin-card">
          <div className="section-title compact-title"><div><p className="eyebrow">Requests</p><h3>需求刪除管理</h3></div></div>
          <p className="subtle">刪除採軟刪除：前台不顯示，資料庫保留刪除時間與刪除人。</p>
          <RequestTable requests={filteredRequests} isAdmin={isAdmin} onEdit={onEditRequest} onDelete={onDeleteRequest} />
        </section>
      </div>
    )}
  </section>
}

function PrintHeader({ title, filters, count }: { title: string, filters: Filters, count: number }) {
  const printDate = new Date().toLocaleString('zh-Hant', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const filterSummary = [
    filters.from || filters.to ? `日期：${filters.from || '不限'} 至 ${filters.to || '不限'}` : '日期：全部',
    filters.categoryCode ? `大類：${filters.categoryCode}` : '大類：全部',
    filters.topicCode ? `第一層主題：${filters.topicCode}` : '第一層主題：全部',
    filters.status !== 'all' ? `狀態：${statusLabels[filters.status]}` : '狀態：全部',
    filters.urgency !== 'all' ? `急迫度：${urgencyLabels[filters.urgency]}` : '急迫度：全部',
  ].join('　｜　')

  return <div className="print-header">
    <h1>SQMS 程序書修訂需求管理和統計系統</h1>
    <h2>{title}</h2>
    <div className="print-meta">
      <span>打印內容：{title}</span>
      <span>打印日期：{printDate}</span>
      <span>打印件數：{count}</span>
    </div>
    <p>{filterSummary}</p>
  </div>
}

function ListHeader({ title, filters, setFilters, requests, onRefresh, hideExports = false }: { title: string, filters: Filters, setFilters: (f: Filters) => void, requests: ChangeRequest[], onRefresh: () => void, hideExports?: boolean }) {
  const topics = filters.categoryCode ? getTopicOptions(filters.categoryCode) : []
  const [rangePreset, setRangePreset] = useState('')
  const applyRecentDays = (days: number) => {
    const today = new Date()
    const from = new Date(today)
    from.setDate(today.getDate() - days + 1)
    const formatDate = (date: Date) => date.toISOString().slice(0, 10)
    setFilters({ ...filters, from: formatDate(from), to: formatDate(today) })
  }
  const handleRangeChange = (value: string) => {
    setRangePreset(value)
    if (value) applyRecentDays(Number(value))
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
      <select className="range-select" aria-label="新增或修改時間範圍" value={rangePreset} onChange={(e) => handleRangeChange(e.target.value)}>
        <option value="">新增/修改時間</option>
        <option value="30">近30天新增、修改</option>
        <option value="60">近60天新增、修改</option>
        <option value="90">近90天新增、修改</option>
      </select>
      <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
      <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      <select value={filters.categoryCode} onChange={(e) => setFilters({ ...filters, categoryCode: e.target.value, topicCode: '' })}><option value="">全部大類</option>{catalog.map((c) => <option key={c.code} value={c.code}>{c.code}｜{c.nameZh}</option>)}</select>
      <select value={filters.topicCode} onChange={(e) => setFilters({ ...filters, topicCode: e.target.value })}><option value="">全部第一層主題</option>{topics.map((t) => <option key={t.code} value={t.code}>{t.code}｜{t.titleZh}</option>)}</select>
      <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as RequestStatus | 'all' })}><option value="all">全部狀態</option>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value as Urgency | 'all' })}><option value="all">全部急迫度</option>{Object.entries(urgencyLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <button className="ghost" onClick={() => { setRangePreset(''); setFilters(emptyFilters) }}>清除</button>
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
