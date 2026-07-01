import { useEffect, useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Download, FileSpreadsheet, LayoutDashboard, Lock, PlusCircle, Printer, RefreshCw, Trash2, UserPlus } from 'lucide-react'
import './App.css'
import { catalog, getManualItemOptions, getTopicOptions } from './data/sqmsCatalog'
import type { AdminUser, ChangeRequest, PersonnelRole, PersonnelUser, RequestStatus, Urgency } from './types'
import { buildDashboardStats, filterRequests, isOverdue, isPending } from './lib/stats'
import { createBlankRequest, getNextRequestNo, loadRequests, saveRequest, softDeleteRequest, updateRequestStatus } from './lib/storage'
import { DEFAULT_REQUEST_SOURCES, loadRequestSourceOptions, normalizeRequestSources, saveRequestSourceOptions } from './lib/requestSources'
import { exportCsv, exportExcel, getCategoryName, getItemLabel, getTopicLabel, statusLabels, urgencyLabels } from './lib/exporters'
import { fromDbAdminUser, fromDbPersonnelUser, isCloudConfigured, supabase } from './lib/supabaseClient'

type Tab = 'form' | 'dashboard' | 'all' | 'pending' | 'completed' | 'admin'

type Filters = {
  from: string
  to: string
  categoryCode: string
  topicCode: string
  status: RequestStatus | 'all'
  urgency: Urgency | 'all'
  requestSource: string
}

const emptyFilters: Filters = { from: '', to: '', categoryCode: '', topicCode: '', status: 'all', urgency: 'all', requestSource: 'all' }
const chartColors = ['#b8e0d2', '#f7c6c7', '#cdb4db', '#a2d2ff', '#ffd6a5', '#fdffb6', '#d0f4de']
const duplicateSearchHint = '提出新需求前，請搜索是否類似需求已被提出。'
const personnelDepartments = ['管理層', '管理組', '資材組', '營業處', '船工處', '安衛處', '航運處', '督導', '船員組', '航運組', '海技組']
const defaultPersonnel: Record<string, PersonnelUser[]> = {
  '管理層': [
    { department: '管理層', name: '呂學修副總', username: '呂學修副總', password: '', role: 'operator', active: true, sortOrder: 1 },
    { department: '管理層', name: '蔡宏仁協理', username: '蔡宏仁協理', password: '', role: 'operator', active: true, sortOrder: 2 },
    { department: '管理層', name: '李勻寧協理', username: '李勻寧協理', password: '', role: 'operator', active: true, sortOrder: 3 },
  ],
  '管理組': [
    { department: '管理組', name: '陳治先', username: '陳治先', password: '', role: 'operator', active: true, sortOrder: 4 },
    { department: '管理組', name: '王昱民', username: '王昱民', password: '', role: 'operator', active: true, sortOrder: 5 },
    { department: '管理組', name: '方憲鵬組長', username: '方憲鵬組長', password: '', role: 'operator', active: true, sortOrder: 6 },
    { department: '管理組', name: '陳韋自', username: '陳韋自', password: '', role: 'operator', active: true, sortOrder: 7 },
    { department: '管理組', name: '紀煒邦', username: '紀煒邦', password: '', role: 'operator', active: true, sortOrder: 8 },
    { department: '管理組', name: '李雅雯', username: '李雅雯', password: '', role: 'operator', active: true, sortOrder: 9 },
    { department: '管理組', name: '曾湘柔', username: '曾湘柔', password: '', role: 'operator', active: true, sortOrder: 10 },
    { department: '管理組', name: '周麗如', username: '周麗如', password: '', role: 'operator', active: true, sortOrder: 11 },
  ],
  '資材組': [
    { department: '資材組', name: '林建瑋', username: '林建瑋', password: '', role: 'operator', active: true, sortOrder: 12 },
    { department: '資材組', name: '鄧兆修', username: '鄧兆修', password: '', role: 'operator', active: true, sortOrder: 13 },
    { department: '資材組', name: '鄧浚宏', username: '鄧浚宏', password: '', role: 'operator', active: true, sortOrder: 14 },
    { department: '資材組', name: '徐永兆', username: '徐永兆', password: '', role: 'operator', active: true, sortOrder: 15 },
    { department: '資材組', name: '王梓名', username: '王梓名', password: '', role: 'operator', active: true, sortOrder: 16 },
    { department: '資材組', name: '林大詠', username: '林大詠', password: '', role: 'operator', active: true, sortOrder: 17 },
    { department: '資材組', name: '周瑞廉組長', username: '周瑞廉組長', password: '', role: 'operator', active: true, sortOrder: 18 },
    { department: '資材組', name: '楊延興', username: '楊延興', password: '', role: 'operator', active: true, sortOrder: 19 },
    { department: '資材組', name: '許政子', username: '許政子', password: '', role: 'operator', active: true, sortOrder: 20 },
    { department: '資材組', name: '楊絜崴', username: '楊絜崴', password: '', role: 'operator', active: true, sortOrder: 21 },
  ],
  '營業處': [
    { department: '營業處', name: '王慈芬', username: '王慈芬', password: '', role: 'operator', active: true, sortOrder: 22 },
    { department: '營業處', name: '劉小萍', username: '劉小萍', password: '', role: 'operator', active: true, sortOrder: 23 },
    { department: '營業處', name: '翁敏芳', username: '翁敏芳', password: '', role: 'operator', active: true, sortOrder: 24 },
    { department: '營業處', name: '李純瑛', username: '李純瑛', password: '', role: 'operator', active: true, sortOrder: 25 },
    { department: '營業處', name: '魏利育', username: '魏利育', password: '', role: 'operator', active: true, sortOrder: 26 },
    { department: '營業處', name: '賴思妤', username: '賴思妤', password: '', role: 'operator', active: true, sortOrder: 27 },
    { department: '營業處', name: '陳建中', username: '陳建中', password: '', role: 'operator', active: true, sortOrder: 28 },
    { department: '營業處', name: '粘家萍', username: '粘家萍', password: '', role: 'operator', active: true, sortOrder: 29 },
    { department: '營業處', name: '邱義泰', username: '邱義泰', password: '', role: 'operator', active: true, sortOrder: 30 },
    { department: '營業處', name: '倪嘉', username: '倪嘉', password: '', role: 'operator', active: true, sortOrder: 31 },
    { department: '營業處', name: '李耿志', username: '李耿志', password: '', role: 'operator', active: true, sortOrder: 32 },
  ],
  '船工處': [
    { department: '船工處', name: '廖晥妤', username: '廖晥妤', password: '', role: 'operator', active: true, sortOrder: 33 },
    { department: '船工處', name: '吳燕桂', username: '吳燕桂', password: '', role: 'operator', active: true, sortOrder: 34 },
    { department: '船工處', name: '楊弘羽', username: '楊弘羽', password: '', role: 'operator', active: true, sortOrder: 35 },
    { department: '船工處', name: '王威譯', username: '王威譯', password: '', role: 'operator', active: true, sortOrder: 36 },
    { department: '船工處', name: '李曜均', username: '李曜均', password: '', role: 'operator', active: true, sortOrder: 37 },
    { department: '船工處', name: '劉煥章處長', username: '劉煥章處長', password: '', role: 'operator', active: true, sortOrder: 38 },
    { department: '船工處', name: '林冠辰', username: '林冠辰', password: '', role: 'operator', active: true, sortOrder: 39 },
    { department: '船工處', name: '盧玉玫', username: '盧玉玫', password: '', role: 'operator', active: true, sortOrder: 40 },
    { department: '船工處', name: '林儀婷', username: '林儀婷', password: '', role: 'operator', active: true, sortOrder: 41 },
    { department: '船工處', name: '王昱斌', username: '王昱斌', password: '', role: 'operator', active: true, sortOrder: 42 },
    { department: '船工處', name: '賴朝瑜', username: '賴朝瑜', password: '', role: 'operator', active: true, sortOrder: 43 },
    { department: '船工處', name: '陳思翰', username: '陳思翰', password: '', role: 'operator', active: true, sortOrder: 44 },
    { department: '船工處', name: '顏仲楷', username: '顏仲楷', password: '', role: 'operator', active: true, sortOrder: 45 },
  ],
  '安衛處': [
    { department: '安衛處', name: '楊順婷', username: '楊順婷', password: '', role: 'operator', active: true, sortOrder: 46 },
    { department: '安衛處', name: '施品帆', username: '施品帆', password: '', role: 'operator', active: true, sortOrder: 47 },
    { department: '安衛處', name: '紀芳琪', username: '紀芳琪', password: '', role: 'operator', active: true, sortOrder: 48 },
    { department: '安衛處', name: '蘇上銘', username: '蘇上銘', password: '', role: 'operator', active: true, sortOrder: 49 },
    { department: '安衛處', name: '韓竹雅', username: '韓竹雅', password: '', role: 'operator', active: true, sortOrder: 50 },
    { department: '安衛處', name: '劉定淮', username: '劉定淮', password: '', role: 'operator', active: true, sortOrder: 51 },
    { department: '安衛處', name: '江佳勳', username: '江佳勳', password: '', role: 'operator', active: true, sortOrder: 52 },
    { department: '安衛處', name: '張鼎東', username: '張鼎東', password: '', role: 'operator', active: true, sortOrder: 53 },
  ],
  '航運處': [
    { department: '航運處', name: '吳建泰處長', username: '吳建泰處長', password: '', role: 'operator', active: true, sortOrder: 54 },
  ],
  '督導': [
    { department: '督導', name: '尹德垿', username: '尹德垿', password: '', role: 'operator', active: true, sortOrder: 55 },
    { department: '督導', name: '蔡繼來', username: '蔡繼來', password: '', role: 'operator', active: true, sortOrder: 56 },
    { department: '督導', name: '翁振傑', username: '翁振傑', password: '', role: 'operator', active: true, sortOrder: 57 },
    { department: '督導', name: '黃傑治', username: '黃傑治', password: '', role: 'operator', active: true, sortOrder: 58 },
    { department: '督導', name: '陳寰頤', username: '陳寰頤', password: '', role: 'operator', active: true, sortOrder: 59 },
    { department: '督導', name: '李幸龍', username: '李幸龍', password: '', role: 'operator', active: true, sortOrder: 60 },
    { department: '督導', name: '廖麗蓁', username: '廖麗蓁', password: '', role: 'operator', active: true, sortOrder: 61 },
    { department: '督導', name: '張議榮', username: '張議榮', password: '', role: 'operator', active: true, sortOrder: 62 },
    { department: '督導', name: '林滄龍', username: '林滄龍', password: '', role: 'operator', active: true, sortOrder: 63 },
    { department: '督導', name: '蔡明哲', username: '蔡明哲', password: '', role: 'operator', active: true, sortOrder: 64 },
    { department: '督導', name: '陳昱宏', username: '陳昱宏', password: '', role: 'operator', active: true, sortOrder: 65 },
    { department: '督導', name: '陳思慧', username: '陳思慧', password: '', role: 'operator', active: true, sortOrder: 66 },
    { department: '督導', name: '張雅琪', username: '張雅琪', password: '', role: 'operator', active: true, sortOrder: 67 },
    { department: '督導', name: '張和中', username: '張和中', password: '', role: 'operator', active: true, sortOrder: 68 },
    { department: '督導', name: '張志林', username: '張志林', password: '', role: 'operator', active: true, sortOrder: 69 },
    { department: '督導', name: '餘雙', username: '餘雙', password: '', role: 'operator', active: true, sortOrder: 70 },
    { department: '督導', name: '唐洪新', username: '唐洪新', password: '', role: 'operator', active: true, sortOrder: 71 },
    { department: '督導', name: '秦冰', username: '秦冰', password: '', role: 'operator', active: true, sortOrder: 72 },
    { department: '督導', name: '黃燕華', username: '黃燕華', password: '', role: 'operator', active: true, sortOrder: 73 },
    { department: '督導', name: '潘獻波', username: '潘獻波', password: '', role: 'operator', active: true, sortOrder: 74 },
    { department: '督導', name: '毛剛', username: '毛剛', password: '', role: 'operator', active: true, sortOrder: 75 },
  ],
  '船員組': [
    { department: '船員組', name: '徐意倫', username: '徐意倫', password: '', role: 'operator', active: true, sortOrder: 76 },
    { department: '船員組', name: '古美雪', username: '古美雪', password: '', role: 'operator', active: true, sortOrder: 77 },
    { department: '船員組', name: '薛英林', username: '薛英林', password: '', role: 'operator', active: true, sortOrder: 78 },
    { department: '船員組', name: '張育菁', username: '張育菁', password: '', role: 'operator', active: true, sortOrder: 79 },
    { department: '船員組', name: '謝嘉穎', username: '謝嘉穎', password: '', role: 'operator', active: true, sortOrder: 80 },
    { department: '船員組', name: '王鈺婷', username: '王鈺婷', password: '', role: 'operator', active: true, sortOrder: 81 },
    { department: '船員組', name: '湯雅帆', username: '湯雅帆', password: '', role: 'operator', active: true, sortOrder: 82 },
    { department: '船員組', name: '陳必恆', username: '陳必恆', password: '', role: 'operator', active: true, sortOrder: 83 },
    { department: '船員組', name: '林竺諼', username: '林竺諼', password: '', role: 'operator', active: true, sortOrder: 84 },
    { department: '船員組', name: '鄭詩璇', username: '鄭詩璇', password: '', role: 'operator', active: true, sortOrder: 85 },
    { department: '船員組', name: '陳昱勳', username: '陳昱勳', password: '', role: 'operator', active: true, sortOrder: 86 },
    { department: '船員組', name: '胡峻瑋', username: '胡峻瑋', password: '', role: 'operator', active: true, sortOrder: 87 },
    { department: '船員組', name: '吳思葦', username: '吳思葦', password: '', role: 'operator', active: true, sortOrder: 88 },
  ],
  '航運組': [
    { department: '航運組', name: '陳秀玉', username: '陳秀玉', password: '', role: 'operator', active: true, sortOrder: 89 },
    { department: '航運組', name: '黃駿達', username: '黃駿達', password: '', role: 'operator', active: true, sortOrder: 90 },
    { department: '航運組', name: '江嘉卿', username: '江嘉卿', password: '', role: 'operator', active: true, sortOrder: 91 },
    { department: '航運組', name: '陳秋縈', username: '陳秋縈', password: '', role: 'operator', active: true, sortOrder: 92 },
    { department: '航運組', name: '溫雅媛', username: '溫雅媛', password: '', role: 'operator', active: true, sortOrder: 93 },
    { department: '航運組', name: '王聖傑', username: '王聖傑', password: '', role: 'operator', active: true, sortOrder: 94 },
    { department: '航運組', name: '楊治華', username: '楊治華', password: '', role: 'operator', active: true, sortOrder: 95 },
    { department: '航運組', name: '謝侑糖', username: '謝侑糖', password: '', role: 'operator', active: true, sortOrder: 96 },
    { department: '航運組', name: '劉彥輝', username: '劉彥輝', password: '', role: 'operator', active: true, sortOrder: 97 },
    { department: '航運組', name: '陳芮蓁', username: '陳芮蓁', password: '', role: 'operator', active: true, sortOrder: 98 },
  ],
  '海技組': [
    { department: '海技組', name: '朱世毅', username: '朱世毅', password: '', role: 'operator', active: true, sortOrder: 99 },
    { department: '海技組', name: '陳宜斌', username: '陳宜斌', password: '', role: 'operator', active: true, sortOrder: 100 },
    { department: '海技組', name: '柯香吟', username: '柯香吟', password: '', role: 'operator', active: true, sortOrder: 101 },
    { department: '海技組', name: '陳思樺', username: '陳思樺', password: '', role: 'operator', active: true, sortOrder: 102 },
    { department: '海技組', name: '林建志', username: '林建志', password: '', role: 'operator', active: true, sortOrder: 103 },
    { department: '海技組', name: '張嘉珈', username: '張嘉珈', password: '', role: 'operator', active: true, sortOrder: 104 },
    { department: '海技組', name: '吳易安', username: '吳易安', password: '', role: 'operator', active: true, sortOrder: 105 },
  ],
}
const personnelStorageKey = 'sqms-personnel-roster-v2'
const personnelSessionKey = 'sqms-current-personnel-v1'

function requestMatchesSearch(request: ChangeRequest, query: string) {
  const keyword = query.trim().toLowerCase()
  if (!keyword) return true
  const text = [
    request.requestNo,
    request.requestSource,
    request.applicantName,
    request.categoryCode,
    getCategoryName(request.categoryCode),
    request.topicCode,
    getTopicLabel(request.topicCode),
    request.manualItemCode,
    getItemLabel(request.topicCode, request.manualItemCode),
    request.scopeNote,
    request.suggestedChange,
    request.changeReason,
    request.referenceMaterials,
    request.publicEditNote,
    request.targetDueDate,
    request.createdAt,
    request.updatedAt,
    statusLabels[request.status],
    urgencyLabels[request.urgency],
  ].filter(Boolean).join(' ').toLowerCase()
  return text.includes(keyword)
}

function normalizePersonnelRoster(value: unknown): Record<string, PersonnelUser[]> {
  const source = (value && typeof value === 'object' ? value : defaultPersonnel) as Record<string, Array<Partial<PersonnelUser>>>
  const normalized: Record<string, PersonnelUser[]> = {}
  personnelDepartments.forEach((department) => {
    normalized[department] = (source[department] ?? defaultPersonnel[department] ?? []).map((person, index) => ({
      id: person.id,
      department,
      name: (person.name || '').trim(),
      username: (person.username || person.name || '').trim(),
      password: person.password || '',
      hasPassword: Boolean(person.hasPassword ?? person.password),
      role: (person.role === 'admin' ? 'admin' : 'operator') as PersonnelRole,
      active: person.active !== false,
      sortOrder: Number(person.sortOrder ?? index + 1),
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    })).filter((person) => person.name && person.active)
  })
  return normalized
}

function groupPersonnelUsers(users: PersonnelUser[]): Record<string, PersonnelUser[]> {
  const grouped = normalizePersonnelRoster({})
  personnelDepartments.forEach((department) => { grouped[department] = [] })
  users.forEach((user) => {
    const department = user.department || personnelDepartments[0]
    if (!grouped[department]) grouped[department] = []
    grouped[department].push({ ...user, username: user.username || user.name, password: user.password || '' })
  })
  Object.keys(grouped).forEach((department) => grouped[department].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-Hant')))
  return grouped
}

function flattenPersonnelRoster(roster: Record<string, PersonnelUser[]>): PersonnelUser[] {
  return Object.values(roster).flat()
}

function personKey(person: PersonnelUser) {
  return person.id || `${person.department}::${person.username || person.name}`
}

function publicPersonSession(person: PersonnelUser): PersonnelUser {
  return { ...person, password: '' }
}

type RequiredField = 'requestSource' | 'applicantName' | 'categoryCode' | 'topicCode' | 'targetDueDate' | 'suggestedChange' | 'changeReason'

function App() {
  const [tab, setTab] = useState<Tab>('form')
  const [requests, setRequests] = useState<ChangeRequest[]>([])
  const [form, setForm] = useState<ChangeRequest>(() => createBlankRequest(1))
  const [missingFields, setMissingFields] = useState<RequiredField[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [filters, setFilters] = useState<Filters>(emptyFilters)
  const [searchQuery, setSearchQuery] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [adminProfile, setAdminProfile] = useState<AdminUser | null>(null)
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [requestSourceOptions, setRequestSourceOptions] = useState<string[]>(() => loadRequestSourceOptions())
  const [newRequestSource, setNewRequestSource] = useState('')
  const [personnelRoster, setPersonnelRoster] = useState<Record<string, PersonnelUser[]>>(() => {
    try { return normalizePersonnelRoster(JSON.parse(localStorage.getItem(personnelStorageKey) || 'null')) } catch { return normalizePersonnelRoster(defaultPersonnel) }
  })
  const [newPerson, setNewPerson] = useState({ department: personnelDepartments[0], name: '', username: '', password: '', role: 'operator' as PersonnelRole })
  const [currentPerson, setCurrentPerson] = useState<PersonnelUser | null>(() => {
    try { return JSON.parse(localStorage.getItem(personnelSessionKey) || 'null') } catch { return null }
  })
  const [personnelLoginOpen, setPersonnelLoginOpen] = useState(false)
  const [personnelLogin, setPersonnelLogin] = useState({ department: personnelDepartments[0], personKey: '', password: '' })
  const [personnelDirty, setPersonnelDirty] = useState(false)
  const [completingRequest, setCompletingRequest] = useState<ChangeRequest | null>(null)

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

  async function refreshPersonnelUsers() {
    if (!supabase || !adminProfile) return
    const { data, error } = await supabase
      .from('personnel_users')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('department')
      .order('name')
    if (error) {
      if (error.message.includes('personnel_users') || error.code === '42P01') {
        setMessage('人員權限表尚未建立，請先在 Supabase SQL Editor 執行最新版 supabase/schema.sql；目前先顯示內建人員名單。')
        setPersonnelRoster(normalizePersonnelRoster(defaultPersonnel))
        return
      }
      setMessage(`人員名單讀取失敗：${error.message}`)
      return
    }
    const cloudRoster = (data ?? []).map(fromDbPersonnelUser)
    setPersonnelRoster(cloudRoster.length ? groupPersonnelUsers(cloudRoster) : normalizePersonnelRoster(defaultPersonnel))
    setPersonnelDirty(false)
  }

  async function refreshPublicPersonnelUsers() {
    if (!supabase) return
    const { data, error } = await supabase
      .from('public_personnel_users')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('department')
      .order('name')
    if (error) return
    const cloudRoster = (data ?? []).map(fromDbPersonnelUser)
    if (cloudRoster.length) setPersonnelRoster(groupPersonnelUsers(cloudRoster))
  }

  async function acceptAdminSession(email: string) {
    const profile = await loadAdminProfile(email)
    if (!profile) {
      await supabase?.auth.signOut()
      setAdminProfile(null)
      throw new Error('無權限：此帳號不在管理員名單中，請聯絡系統 owner。')
    }
    setAdminProfile(profile)
    setAdminEmail(profile.email)
    const { data: personnelRows, error: personnelError } = await supabase
      ?.from('personnel_users')
      .select('*')
      .eq('active', true)
      .order('sort_order')
      .order('department')
      .order('name') ?? { data: [], error: null }
    if (!personnelError) {
      const cloudRoster = (personnelRows ?? []).map(fromDbPersonnelUser)
      setPersonnelRoster(cloudRoster.length ? groupPersonnelUsers(cloudRoster) : normalizePersonnelRoster(defaultPersonnel))
    }
    return profile
  }

  useEffect(() => {
    refresh()
    refreshPublicPersonnelUsers()
    getNextRequestNo().then((requestNo) => {
      setForm((current) => ({ ...current, requestNo }))
    }).catch(() => undefined)
    let autoSyncTimer: number | undefined
    let channel: ReturnType<NonNullable<typeof supabase>['channel']> | undefined
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
      channel = supabase
        .channel('sqms-change-requests-auto-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'change_requests' }, () => refresh())
        .subscribe()
      autoSyncTimer = window.setInterval(() => refresh(), 30000)
    }
    return () => {
      if (autoSyncTimer) window.clearInterval(autoSyncTimer)
      if (channel && supabase) supabase.removeChannel(channel)
    }
  }, [])

  const isAdmin = Boolean(adminProfile?.active)
  const isOwner = adminProfile?.role === 'owner'
  const canManagePage = isAdmin || currentPerson?.role === 'admin'
  const personnelForLogin = personnelRoster[personnelLogin.department] ?? []
  const selectedLoginPerson = personnelForLogin.find((person) => personKey(person) === personnelLogin.personKey) ?? personnelForLogin[0]
  const selectedLoginNeedsPassword = Boolean(selectedLoginPerson?.hasPassword || selectedLoginPerson?.password)
  const canEditRequests = Boolean(currentPerson || isAdmin)

  const filtered = useMemo(() => filterRequests(requests, filters), [requests, filters])
  const searched = useMemo(() => filtered.filter((request) => requestMatchesSearch(request, searchQuery)), [filtered, searchQuery])
  const pending = useMemo(() => searched.filter(isPending), [searched])
  const completed = useMemo(() => searched.filter((request) => request.status === 'completed'), [searched])
  const stats = useMemo(() => buildDashboardStats(requests, filters), [requests, filters])
  const topicOptions = getTopicOptions(form.categoryCode)
  const itemOptions = getManualItemOptions(form.topicCode)
  const nextSequence = requests.length + 1

  function fieldError(field: RequiredField) {
    return missingFields.includes(field) ? 'field-error' : undefined
  }

  async function blankRequestWithCloudNo() {
    const blank = createBlankRequest(nextSequence + 1)
    try {
      return { ...blank, requestNo: await getNextRequestNo() }
    } catch {
      return blank
    }
  }

  function updateForm<K extends keyof ChangeRequest>(key: K, value: ChangeRequest[K]) {
    setForm((current) => ({ ...current, [key]: value }))
    if (missingFields.includes(key as RequiredField) && String(value ?? '').trim()) {
      setMissingFields((current) => current.filter((field) => field !== key))
    }
  }

  async function resetForm() {
    setEditingId(null)
    setMissingFields([])
    setForm(await blankRequestWithCloudNo())
    setMessage('已切換到新增模式。')
    setTab('form')
  }

  async function handlePersonnelLogin(event?: React.FormEvent) {
    event?.preventDefault()
    const person = selectedLoginPerson
    if (!person) {
      setMessage('請先選擇人員。')
      return
    }
    if (selectedLoginNeedsPassword) {
      let passed = false
      if (supabase && person.id) {
        const { data, error } = await supabase.rpc('verify_personnel_password', { p_personnel_id: person.id, p_password: personnelLogin.password })
        if (error) {
          setMessage(`人員登入驗證失敗：${error.message}。請確認 Supabase 已執行最新版 schema.sql。`)
          return
        }
        passed = Boolean(data)
      } else {
        passed = personnelLogin.password === person.password
      }
      if (!passed) {
        setMessage('人員密碼錯誤，請重新輸入。')
        return
      }
    }
    const sessionPerson = publicPersonSession(person)
    setCurrentPerson(sessionPerson)
    localStorage.setItem(personnelSessionKey, JSON.stringify(sessionPerson))
    setPersonnelLoginOpen(false)
    setPersonnelLogin((current) => ({ ...current, personKey: personKey(person), password: '' }))
    setMessage(`目前人員：${person.department} / ${person.name}`)
  }

  function logoutPersonnel() {
    setCurrentPerson(null)
    localStorage.removeItem(personnelSessionKey)
    setMessage('已退出目前人員身份。')
  }

  function openPersonnelLogin() {
    refreshPublicPersonnelUsers()
    setPersonnelLogin((current) => {
      const department = currentPerson?.department || current.department || personnelDepartments[0]
      const people = personnelRoster[department] ?? []
      const target = currentPerson ? people.find((person) => person.name === currentPerson.name || person.username === currentPerson.username) : people[0]
      return { department, personKey: target ? personKey(target) : '', password: '' }
    })
    setPersonnelLoginOpen(true)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (editingId && !canEditRequests) {
      setMessage('請先進行人員登入，未登入不能修改已立案內容。')
      openPersonnelLogin()
      return
    }
    const requiredMissing: RequiredField[] = []
    if (!form.requestSource) requiredMissing.push('requestSource')
    if (!form.applicantName.trim()) requiredMissing.push('applicantName')
    if (!form.categoryCode) requiredMissing.push('categoryCode')
    if (!form.topicCode) requiredMissing.push('topicCode')
    if (!form.targetDueDate) requiredMissing.push('targetDueDate')
    if (!form.suggestedChange.trim()) requiredMissing.push('suggestedChange')
    if (!form.changeReason.trim()) requiredMissing.push('changeReason')
    if (requiredMissing.length) {
      setMissingFields(requiredMissing)
      setMessage('請補齊紅色必填欄位後再提交。')
      return
    }
    setMissingFields([])
    try {
      const nextRequestNo = editingId ? form.requestNo : await getNextRequestNo()
      const saved = await saveRequest({
        ...form,
        requestNo: nextRequestNo || form.requestNo || `SQMS-TEMP-${Date.now()}`,
        createdAt: form.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })
      setRequests((current) => {
        const exists = current.some((item) => item.id === saved.id)
        return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [saved, ...current]
      })
      setMessage(editingId ? `已更新 ${saved.requestNo}` : `已新增 ${saved.requestNo}`)
      setEditingId(null)
      setForm(await blankRequestWithCloudNo())
    } catch (error) {
      setMessage(`新增/保存失敗：${error instanceof Error ? error.message : '未知錯誤'}。如剛刪除過資料，請先執行最新版 Supabase schema.sql 後再試。`)
    }
  }

  function startEdit(request: ChangeRequest) {
    if (!canEditRequests) {
      setMessage('請先進行人員登入，未登入不能修改已立案內容。')
      openPersonnelLogin()
      return
    }
    setEditingId(request.id)
    setMissingFields([])
    setForm({ ...request })
    setTab('form')
    setMessage(`正在修改 ${request.requestNo}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleDelete(request: ChangeRequest) {
    if (!canManagePage) return
    if (!confirm(`確定要刪除 ${request.requestNo}？此操作採軟刪除，雲端保留紀錄，但前台不再顯示。`)) return
    const deletedBy = adminProfile?.email || (currentPerson ? `${currentPerson.department}/${currentPerson.name}` : 'admin')
    try {
      await softDeleteRequest(request.id, deletedBy, currentPerson)
      await refresh()
      setMessage(`已軟刪除 ${request.requestNo}，並已同步雲端。`)
    } catch (error) {
      setMessage(`刪除失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  async function completeRequest(request: ChangeRequest, completionDate: string) {
    if (!canEditRequests) {
      setMessage('請先進行人員登入，未登入不能修改已立案內容。')
      setCompletingRequest(null)
      openPersonnelLogin()
      return
    }
    try {
      const saved = await updateRequestStatus(request.id, 'completed', completionDate)
      setRequests((current) => current.map((item) => item.id === saved.id ? saved : item))
      setCompletingRequest(null)
      setMessage(`已結案 ${saved.requestNo}，完成日期：${completionDate}`)
    } catch (error) {
      setMessage(`結案失敗：${error instanceof Error ? error.message : '未知錯誤'}。請確認 Supabase 已執行最新版 schema.sql。`)
    }
  }

  async function reopenRequest(request: ChangeRequest) {
    if (!canEditRequests) {
      setMessage('請先進行人員登入，未登入不能修改已立案內容。')
      openPersonnelLogin()
      return
    }
    try {
      const saved = await updateRequestStatus(request.id, 'processing')
      setRequests((current) => current.map((item) => item.id === saved.id ? saved : item))
      setMessage(`已將 ${saved.requestNo} 轉回待完成。`)
    } catch (error) {
      setMessage(`轉回待完成失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
    }
  }

  function persistRequestSourceOptions(nextOptions: string[]) {
    const normalized = normalizeRequestSources(nextOptions)
    setRequestSourceOptions(normalized)
    saveRequestSourceOptions(normalized)
    if (!normalized.includes(form.requestSource)) setForm((current) => ({ ...current, requestSource: normalized[0] ?? DEFAULT_REQUEST_SOURCES[0] }))
  }

  function addRequestSourceOption() {
    const value = newRequestSource.trim()
    if (!value) return
    persistRequestSourceOptions([...requestSourceOptions, value])
    setNewRequestSource('')
    setMessage(`已新增需求來源：${value}`)
  }

  function removeRequestSourceOption(value: string) {
    if (!confirm(`確定移除來源項目「${value}」？既有需求資料仍保留原文字，但新建單不再提供此選項。`)) return
    persistRequestSourceOptions(requestSourceOptions.filter((item) => item !== value))
    setMessage(`已移除需求來源選項：${value}`)
  }

  function persistPersonnelRoster(nextRoster: Record<string, PersonnelUser[]>) {
    const normalized = normalizePersonnelRoster(nextRoster)
    setPersonnelRoster(normalized)
    localStorage.setItem(personnelStorageKey, JSON.stringify(normalized))
  }

  function updatePersonnelDraft(person: PersonnelUser, patch: Partial<PersonnelUser>) {
    const key = person.id || `${person.department}-${person.name}`
    persistPersonnelRoster({
      ...personnelRoster,
      [person.department]: (personnelRoster[person.department] ?? []).map((item) => (item.id || `${item.department}-${item.name}`) === key ? { ...item, ...patch } : item),
    })
    setPersonnelDirty(true)
  }

  function cleanPersonnelForSave(person: PersonnelUser, index: number): PersonnelUser {
    return {
      ...person,
      department: person.department || personnelDepartments[0],
      name: person.name.trim(),
      username: (person.username || person.name).trim(),
      password: person.password || '',
      active: person.active === undefined ? true : person.active,
      sortOrder: person.sortOrder || index + 1,
    }
  }

  async function savePersonnelToCloud(person: PersonnelUser): Promise<PersonnelUser> {
    if (!supabase || !adminProfile) throw new Error('尚未連接雲端或 Owner 未登入。')
    const { data, error } = await supabase.rpc('save_personnel_user_by_owner', {
      p_id: person.id || null,
      p_department: person.department,
      p_name: person.name,
      p_username: person.username || person.name,
      p_password: person.password || '',
      p_role: person.role,
      p_active: person.active === undefined ? true : person.active,
      p_sort_order: person.sortOrder || 0,
    })
    if (error) throw error
    return fromDbPersonnelUser(data)
  }

  async function saveAllPersonnel() {
    if (!isOwner) {
      setMessage('無權限：只有 owner 可以保存全部人員修改。')
      return
    }
    const people = flattenPersonnelRoster(personnelRoster).map(cleanPersonnelForSave)
    if (people.some((person) => !person.name)) {
      setMessage('保存失敗：人員姓名不可為空。')
      return
    }
    try {
      if (supabase && adminProfile) {
        for (const person of people) {
          await savePersonnelToCloud(person)
        }
        await refreshPersonnelUsers()
        setMessage(`已保存全部人員修改到雲端，共 ${people.length} 人。`)
      } else {
        persistPersonnelRoster(groupPersonnelUsers(people))
        setPersonnelDirty(false)
        setMessage(`已保存全部人員修改，共 ${people.length} 人。`)
      }
    } catch (error) {
      setMessage(`人員修改保存失敗：${error instanceof Error ? error.message : '未知錯誤'}。請確認已使用 Owner 登入，且 Supabase 已執行最新版 schema.sql。`)
    }
  }

  async function savePersonnel(person: PersonnelUser) {
    if (!isOwner) {
      setMessage('無權限：只有 owner 可以修改人員用戶名、密碼與權限。')
      return
    }
    const clean: PersonnelUser = {
      ...person,
      department: person.department || personnelDepartments[0],
      name: person.name.trim(),
      username: (person.username || person.name).trim(),
      password: person.password || '',
      active: true,
      sortOrder: person.sortOrder || flattenPersonnelRoster(personnelRoster).length + 1,
    }
    if (!clean.name) {
      setMessage('姓名不可為空。')
      return
    }
    if (supabase && adminProfile) {
      try {
        const saved = await savePersonnelToCloud(clean)
        persistPersonnelRoster({ ...personnelRoster, [saved.department]: (personnelRoster[saved.department] ?? []).map((item) => item.id === saved.id || (!item.id && item.name === person.name) ? saved : item) })
        setPersonnelDirty(false)
        setMessage(`已保存人員到雲端：${saved.name}`)
        await refreshPersonnelUsers()
      } catch (error) {
        setMessage(`人員保存失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
      }
      return
    }
    persistPersonnelRoster({ ...personnelRoster, [clean.department]: (personnelRoster[clean.department] ?? []).map((item) => item === person ? clean : item) })
    setMessage(`已保存人員：${clean.name}`)
  }

  async function addPersonnel() {
    if (!isOwner) {
      setMessage('無權限：只有 owner 可以新增人員。')
      return
    }
    const name = newPerson.name.trim()
    if (!name) return
    const newUser: PersonnelUser = {
      department: newPerson.department,
      name,
      username: newPerson.username.trim() || name,
      password: newPerson.password,
      role: newPerson.role,
      active: true,
      sortOrder: flattenPersonnelRoster(personnelRoster).length + 1,
    }
    if (supabase && adminProfile) {
      try {
        const saved = await savePersonnelToCloud(newUser)
        persistPersonnelRoster({ ...personnelRoster, [saved.department]: [...(personnelRoster[saved.department] ?? []), saved] })
        await refreshPersonnelUsers()
      } catch (error) {
        setMessage(`新增人員失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
        return
      }
    } else {
      persistPersonnelRoster({ ...personnelRoster, [newUser.department]: [...(personnelRoster[newUser.department] ?? []), newUser] })
    }
    setNewPerson({ ...newPerson, name: '', username: '', password: '' })
    setMessage(`已新增人員：${name}`)
  }

  async function removePersonnel(person: PersonnelUser) {
    if (!isOwner) {
      setMessage('無權限：只有 owner 可以停用人員。')
      return
    }
    if (!confirm(`確定停用人員「${person.name}」？`)) return
    if (supabase && adminProfile && person.id) {
      try {
        await savePersonnelToCloud({ ...person, active: false })
        await refreshPersonnelUsers()
      } catch (error) {
        setMessage(`停用人員失敗：${error instanceof Error ? error.message : '未知錯誤'}`)
        return
      }
    }
    persistPersonnelRoster({ ...personnelRoster, [person.department]: (personnelRoster[person.department] ?? []).filter((item) => item !== person) })
    setMessage(`已停用人員：${person.name}`)
  }

  async function handleAdminLogout() {
    await supabase?.auth.signOut()
    setAdminProfile(null)
    setAdminPassword('')
    setMessage('已登出 owner。')
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

  function openAdminTab() {
    if (currentPerson?.role === 'operator' && !isAdmin) {
      setMessage('您無權訪問：操作員不能進入管理頁面。')
      return
    }
    setTab('admin')
  }

  const activeListTitle = tab === 'pending' ? '待完成清單' : tab === 'completed' ? '已完成清單' : '統計清單'
  const listForActiveTab = tab === 'pending' ? pending : tab === 'completed' ? completed : searched

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

      <section className="identity-strip no-print" aria-label="目前人員身份">
        <div>
          <p className="eyebrow">Current User</p>
          {currentPerson ? <strong>{currentPerson.department} / {currentPerson.name}</strong> : <strong>未登入人員</strong>}
          <span className="subtle">未登入仍可新增提交；修改、結案或再次修改已立案內容需先登入人員。</span>
        </div>
        <div className="identity-actions">
          <button className="primary" type="button" onClick={openPersonnelLogin}>人員登入 / 切換</button>
          {currentPerson && <button className="ghost" type="button" onClick={logoutPersonnel}>退出身份</button>}
        </div>
      </section>

      <nav className="nav-tabs no-print" aria-label="主功能">
        <button className={tab === 'form' ? 'active' : ''} onClick={() => setTab('form')}><PlusCircle size={16} /> 新增/修改</button>
        <button className={tab === 'dashboard' ? 'active' : ''} onClick={() => setTab('dashboard')}><LayoutDashboard size={16} /> Dashboard</button>
        <button className={tab === 'all' ? 'active' : ''} onClick={() => setTab('all')}>統計清單</button>
        <button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待完成</button>
        <button className={tab === 'completed' ? 'active' : ''} onClick={() => setTab('completed')}>已完成</button>
        <button className={tab === 'admin' ? 'active' : ''} onClick={openAdminTab}><Lock size={16} /> 管理</button>
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
          <p className="duplicate-search-hint no-print">{duplicateSearchHint}</p>
          <form onSubmit={handleSubmit} className="request-form">
            <label>需求編號<input value={form.requestNo} onChange={(e) => updateForm('requestNo', e.target.value)} /></label>
            <label>需求來源 *<select className={fieldError('requestSource')} value={form.requestSource} onChange={(e) => updateForm('requestSource', e.target.value)}>{requestSourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
            <label>申請人 *<input className={fieldError('applicantName')} value={form.applicantName} onChange={(e) => updateForm('applicantName', e.target.value)} placeholder="輸入姓名" /></label>
            <label>大類 *<select className={fieldError('categoryCode')} value={form.categoryCode} onChange={(e) => {
              const categoryCode = e.target.value
              const firstTopic = getTopicOptions(categoryCode)[0]
              setForm((current) => ({ ...current, categoryCode, topicCode: firstTopic?.code ?? '', manualItemCode: '' }))
              setMissingFields((current) => current.filter((field) => field !== 'categoryCode' && field !== 'topicCode'))
            }}>{catalog.map((category) => <option key={category.code} value={category.code}>{category.code}｜{category.nameZh}</option>)}</select></label>
            <label>第一層主題 *<select className={fieldError('topicCode')} value={form.topicCode} onChange={(e) => { setForm((current) => ({ ...current, topicCode: e.target.value, manualItemCode: '' })); setMissingFields((current) => current.filter((field) => field !== 'topicCode')) }}>{topicOptions.map((topic) => <option key={topic.code} value={topic.code}>{topic.code}｜{topic.titleZh}</option>)}</select></label>
            <label>第二層手冊 / 文件項<select value={form.manualItemCode ?? ''} onChange={(e) => updateForm('manualItemCode', e.target.value)}><option value="">只具體到第一層主題</option>{itemOptions.map((item) => <option key={item.code} value={item.code}>{item.code}｜{item.titleZh}</option>)}</select></label>
            <label>期望完成日期 *<input className={fieldError('targetDueDate')} type="date" value={form.targetDueDate} onChange={(e) => updateForm('targetDueDate', e.target.value)} /></label>
            <label>急迫度<select value={form.urgency} onChange={(e) => updateForm('urgency', e.target.value as Urgency)}>{Object.entries(urgencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>狀態<select value={form.status} onChange={(e) => updateForm('status', e.target.value as RequestStatus)}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="wide">修改內容歸屬補充<input value={form.scopeNote ?? ''} onChange={(e) => updateForm('scopeNote', e.target.value)} placeholder="例如：某段落、某表格、某流程" /></label>
            <label className="wide">需改的建議內容或方向 *<textarea className={fieldError('suggestedChange')} value={form.suggestedChange} onChange={(e) => updateForm('suggestedChange', e.target.value)} rows={4} /></label>
            <label className="wide">需要修改的理由或依據 *<textarea className={fieldError('changeReason')} value={form.changeReason} onChange={(e) => updateForm('changeReason', e.target.value)} rows={3} /></label>
            <label className="check"><input type="checkbox" checked={form.needRelatedFormUpdate} onChange={(e) => updateForm('needRelatedFormUpdate', e.target.checked)} /> 需要配套修改記錄表格</label>
            <label className="wide">推薦的修改內容或資料參考<textarea value={form.referenceMaterials ?? ''} onChange={(e) => updateForm('referenceMaterials', e.target.value)} rows={3} /></label>
            <div className="form-actions wide no-print"><button className="primary" type="submit">{editingId ? '保存修改' : '新增需求'}</button><button type="button" className="ghost" onClick={() => setTab('all')}>查看清單</button></div>
          </form>
        </section>
      )}

      {tab === 'dashboard' && <Dashboard stats={stats} filters={filters} setFilters={setFilters} loading={loading} onRefresh={refresh} requestSourceOptions={requestSourceOptions} />}

      {(tab === 'all' || tab === 'pending' || tab === 'completed') && (
        <section className="panel">
          <PrintHeader title={activeListTitle} filters={filters} count={listForActiveTab.length} searchQuery={searchQuery} />
          <ListHeader title={activeListTitle} filters={filters} setFilters={setFilters} requests={listForActiveTab} onRefresh={refresh} searchQuery={searchQuery} setSearchQuery={setSearchQuery} requestSourceOptions={requestSourceOptions} />
          <RequestTable requests={listForActiveTab} isAdmin={canManagePage} canEditRequests={canEditRequests} onEdit={startEdit} onDelete={handleDelete} onComplete={setCompletingRequest} onReopen={reopenRequest} />
        </section>
      )}

      {tab === 'admin' && (
        <AdminPanel
          adminEmail={adminEmail}
          adminPassword={adminPassword}
          adminProfile={adminProfile}
          currentPerson={currentPerson}
          filteredRequests={filtered}
          canAccessAdminPage={canManagePage}
          canEditRequests={canEditRequests}
          isAdmin={canManagePage}
          isOwner={isOwner}
          requestSourceOptions={requestSourceOptions}
          newRequestSource={newRequestSource}
          personnelRoster={personnelRoster}
          personnelDirty={personnelDirty}
          newPerson={newPerson}
          setAdminEmail={setAdminEmail}
          setAdminPassword={setAdminPassword}
          setNewRequestSource={setNewRequestSource}
          setNewPerson={setNewPerson}
          onAdminLogin={adminLogin}
          onAdminLogout={handleAdminLogout}
          onEditRequest={startEdit}
          onDeleteRequest={handleDelete}
          onCompleteRequest={setCompletingRequest}
          onReopenRequest={reopenRequest}
          onAddRequestSource={addRequestSourceOption}
          onRemoveRequestSource={removeRequestSourceOption}
          onAddPersonnel={addPersonnel}
          onUpdatePersonnelDraft={updatePersonnelDraft}
          onSaveAllPersonnel={saveAllPersonnel}
          onSavePersonnel={savePersonnel}
          onRemovePersonnel={removePersonnel}
        />
      )}
      {personnelLoginOpen && <PersonnelLoginModal
        roster={personnelRoster}
        login={personnelLogin}
        selectedPerson={selectedLoginPerson}
        needsPassword={selectedLoginNeedsPassword}
        setLogin={setPersonnelLogin}
        onCancel={() => setPersonnelLoginOpen(false)}
        onConfirm={handlePersonnelLogin}
      />}
      {completingRequest && <CompletionDateModal request={completingRequest} onCancel={() => setCompletingRequest(null)} onConfirm={(date) => completeRequest(completingRequest, date)} />}
    </div>
  )
}

function Dashboard({ stats, filters, setFilters, loading, onRefresh, requestSourceOptions }: { stats: ReturnType<typeof buildDashboardStats>, filters: Filters, setFilters: (f: Filters) => void, loading: boolean, onRefresh: () => void, requestSourceOptions: string[] }) {
  const categoryData = Object.entries(stats.byCategory).map(([name, value]) => ({ name, value }))
  const topicData = Object.entries(stats.byTopic).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, value]) => ({ name, value }))
  const sourceData = Object.entries(stats.byRequestSource).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
  return <section className="panel dashboard-panel">
    <ListHeader title="狀態 Dashboard" filters={filters} setFilters={setFilters} requests={[]} onRefresh={onRefresh} hideExports requestSourceOptions={requestSourceOptions} />
    <div className="kpi-grid">
      <Kpi label="提出件數" value={stats.total} tone="mint" />
      <Kpi label="完成件數" value={stats.completed} tone="blue" />
      <Kpi label="完成率" value={`${stats.completionRate}%`} tone="purple" />
      <Kpi label="按時完成率" value={`${stats.onTimeCompletionRate}%`} tone="green" />
      <Kpi label="滯期數量" value={stats.overdue} tone="pink" />
      <Kpi label="逾期率" value={`${stats.overdueRate}%`} tone="orange" />
      <Kpi label="待完成" value={stats.pending} tone="yellow" />
    </div>
    {loading ? <p>讀取中...</p> : <div className="chart-grid three">
      <div className="chart-card"><h3>需求來源分佈</h3><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={sourceData} dataKey="value" nameKey="name" outerRadius={82} label>{sourceData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
      <div className="chart-card"><h3>需求來源柱狀圖</h3><ResponsiveContainer width="100%" height={230}><BarChart data={sourceData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#cdb4db" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
      <div className="chart-card"><h3>第一層主題 Top 8</h3><ResponsiveContainer width="100%" height={230}><BarChart data={topicData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value" fill="#a2d2ff" radius={[8, 8, 0, 0]} /></BarChart></ResponsiveContainer></div>
      <div className="chart-card"><h3>各大類分佈</h3><ResponsiveContainer width="100%" height={230}><PieChart><Pie data={categoryData} dataKey="value" nameKey="name" outerRadius={82} label>{categoryData.map((_, index) => <Cell key={index} fill={chartColors[(index + 2) % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
    </div>}
  </section>
}

function Kpi({ label, value, tone }: { label: string, value: string | number, tone: string }) { return <div className={`kpi ${tone}`}><span>{label}</span><strong>{value}</strong></div> }

type AdminPanelProps = {
  adminEmail: string
  adminPassword: string
  adminProfile: AdminUser | null
  currentPerson: PersonnelUser | null
  filteredRequests: ChangeRequest[]
  canAccessAdminPage: boolean
  canEditRequests: boolean
  isAdmin: boolean
  isOwner: boolean
  requestSourceOptions: string[]
  newRequestSource: string
  personnelRoster: Record<string, PersonnelUser[]>
  personnelDirty: boolean
  newPerson: { department: string, name: string, username: string, password: string, role: PersonnelRole }
  setAdminEmail: (value: string) => void
  setAdminPassword: (value: string) => void
  setNewRequestSource: (value: string) => void
  setNewPerson: (value: { department: string, name: string, username: string, password: string, role: PersonnelRole }) => void
  onAdminLogin: (event: React.FormEvent) => void
  onAdminLogout: () => void
  onEditRequest: (request: ChangeRequest) => void
  onDeleteRequest: (request: ChangeRequest) => void
  onCompleteRequest: (request: ChangeRequest) => void
  onReopenRequest: (request: ChangeRequest) => void
  onAddRequestSource: () => void
  onRemoveRequestSource: (value: string) => void
  onAddPersonnel: () => void
  onUpdatePersonnelDraft: (person: PersonnelUser, patch: Partial<PersonnelUser>) => void
  onSaveAllPersonnel: () => void
  onSavePersonnel: (person: PersonnelUser) => void
  onRemovePersonnel: (person: PersonnelUser) => void
}

function AdminPanel({ adminEmail, adminPassword, adminProfile, currentPerson, filteredRequests, canAccessAdminPage, canEditRequests, isAdmin, isOwner, requestSourceOptions, newRequestSource, personnelRoster, personnelDirty, newPerson, setAdminEmail, setAdminPassword, setNewRequestSource, setNewPerson, onAdminLogin, onAdminLogout, onEditRequest, onDeleteRequest, onCompleteRequest, onReopenRequest, onAddRequestSource, onRemoveRequestSource, onAddPersonnel, onUpdatePersonnelDraft, onSaveAllPersonnel, onSavePersonnel, onRemovePersonnel }: AdminPanelProps) {
  const managerLabel = adminProfile ? `${adminProfile.email}（${adminProfile.role === 'owner' ? 'Owner' : 'Admin'}）` : currentPerson ? `${currentPerson.department} / ${currentPerson.name}（管理員）` : ''
  return <section className="panel admin-panel">
    <div className="section-title"><div><p className="eyebrow">Admin</p><h2>管理員後台</h2></div>{adminProfile && <button className="ghost no-print" onClick={onAdminLogout}>登出 Owner</button>}</div>
    {!canAccessAdminPage ? (
      <div className="permission-card">
        <p className="subtle">操作員不能進入管理頁面。請使用角色為「管理員」的人員身份，或由 Owner 在此登入。</p>
        <form className="admin-login" onSubmit={onAdminLogin}>
          <label>管理員帳號 / Email<input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="admin@example.com" /></label>
          <label>密碼<input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} placeholder="輸入管理員密碼" /></label>
          <button className="primary">登入管理</button>
        </form>
      </div>
    ) : (
      <div className="admin-stack">
        <div className="admin-status">
          <strong>已登入：{managerLabel}</strong>
          <span className={`role-pill ${isOwner ? 'owner' : 'admin'}`}>{isOwner ? 'Owner' : 'Admin'}</span>
          <span className="subtle">管理員可維護需求來源、人員名單與需求資料；只有 Owner 可修改人員用戶名、密碼、角色或停用人員。</span>
        </div>

        <section className="admin-card">
          <div className="section-title compact-title"><div><p className="eyebrow">Request Sources</p><h3>需求來源項目管理</h3></div></div>
          <div className="source-option-form">
            <input value={newRequestSource} onChange={(e) => setNewRequestSource(e.target.value)} placeholder="新增來源項目，例如：船隊要求" />
            <button className="primary" type="button" onClick={onAddRequestSource}>新增來源</button>
          </div>
          <div className="source-option-list">{requestSourceOptions.map((source) => <span key={source} className="source-option-chip">{source}<button type="button" onClick={() => onRemoveRequestSource(source)}>×</button></span>)}</div>
        </section>

        <section className="admin-card">
          <div className="section-title compact-title"><div><p className="eyebrow">Personnel</p><h3>人員與權限管控</h3></div></div>
          <p className="subtle">已按你上傳的人員清單替換預設名單。Owner 資訊不在此處變更；只有 Owner 可以修改人員用戶名、密碼、角色或停用人員。修改後請點「保存全部人員修改到雲端」。</p>
          {isOwner && <div className="personnel-save-bar"><button className="primary" type="button" onClick={onSaveAllPersonnel}>{personnelDirty ? '保存全部人員修改到雲端（有未保存變更）' : '保存全部人員修改到雲端'}</button><span className={personnelDirty ? 'save-warning' : 'subtle'}>{personnelDirty ? '有未保存修改，刷新前請先保存。' : '目前沒有未保存的人員修改。'}</span></div>}
          {isOwner ? <div className="personnel-add-row">
            <select value={newPerson.department} onChange={(e) => setNewPerson({ ...newPerson, department: e.target.value })}>{personnelDepartments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select>
            <input value={newPerson.name} onChange={(e) => setNewPerson({ ...newPerson, name: e.target.value, username: newPerson.username || e.target.value })} placeholder="姓名" />
            <input value={newPerson.username} onChange={(e) => setNewPerson({ ...newPerson, username: e.target.value })} placeholder="用戶名" />
            <input type="password" value={newPerson.password} onChange={(e) => setNewPerson({ ...newPerson, password: e.target.value })} placeholder="密碼" />
            <select value={newPerson.role} onChange={(e) => setNewPerson({ ...newPerson, role: e.target.value as PersonnelRole })}><option value="operator">操作員</option><option value="admin">管理員</option></select>
            <button className="primary" type="button" onClick={onAddPersonnel}><UserPlus size={14} />新增人員</button>
          </div> : <p className="subtle">你是 Admin，可查看人員名單；用戶名與密碼僅 Owner 可修改。</p>}
          <div className="personnel-roster-grid">{personnelDepartments.map((dept) => <div key={dept} className="personnel-dept-row"><div className="dept-name"><b>{dept}</b><span>{personnelRoster[dept]?.length ?? 0} 人</span></div><div className="personnel-row-wrap">{(personnelRoster[dept] ?? []).map((person) => <div key={person.id || `${dept}-${person.name}`} className="personnel-user-row"><input value={person.name} disabled={!isOwner} onChange={(e) => onUpdatePersonnelDraft(person, { name: e.target.value })} aria-label={`${person.name} 姓名`} /><input value={person.username} disabled={!isOwner} onChange={(e) => onUpdatePersonnelDraft(person, { username: e.target.value })} aria-label={`${person.name} 用戶名`} />{isOwner ? <input type="password" value={person.password || ''} onChange={(e) => onUpdatePersonnelDraft(person, { password: e.target.value })} placeholder="密碼" aria-label={`${person.name} 密碼`} /> : <span className="password-hidden">密碼僅 Owner 可見</span>}<select value={person.role} disabled={!isOwner} onChange={(e) => onUpdatePersonnelDraft(person, { role: e.target.value as PersonnelRole })}><option value="operator">操作員</option><option value="admin">管理員</option></select>{isOwner && <><button className="ghost" type="button" onClick={() => onSavePersonnel(person)}>保存</button><button className="danger" type="button" onClick={() => onRemovePersonnel(person)}>停用</button></>}</div>)}</div></div>)}</div>
        </section>

        <section className="admin-card">
          <div className="section-title compact-title"><div><p className="eyebrow">Requests</p><h3>需求刪除管理</h3></div></div>
          <p className="subtle">刪除採軟刪除：前台不顯示，資料庫保留刪除時間與刪除人。</p>
          <RequestTable requests={filteredRequests} isAdmin={isAdmin} canEditRequests={canEditRequests} onEdit={onEditRequest} onDelete={onDeleteRequest} onComplete={onCompleteRequest} onReopen={onReopenRequest} />
        </section>
      </div>
    )}
  </section>
}


function PersonnelLoginModal({ roster, login, selectedPerson, needsPassword, setLogin, onCancel, onConfirm }: { roster: Record<string, PersonnelUser[]>, login: { department: string, personKey: string, password: string }, selectedPerson?: PersonnelUser, needsPassword: boolean, setLogin: (value: { department: string, personKey: string, password: string }) => void, onCancel: () => void, onConfirm: (event?: React.FormEvent) => void }) {
  const people = roster[login.department] ?? []
  const changeDepartment = (department: string) => {
    const first = roster[department]?.[0]
    setLogin({ department, personKey: first ? personKey(first) : '', password: '' })
  }
  return <div className="modal-backdrop no-print" role="dialog" aria-modal="true" aria-label="人員登入或切換">
    <section className="identity-modal">
      <p className="eyebrow">Personnel Login</p>
      <h3>人員登入 / 更換人員</h3>
      <form onSubmit={onConfirm} className="identity-login-form">
        <label>部門<select value={login.department} onChange={(e) => changeDepartment(e.target.value)}>{personnelDepartments.map((dept) => <option key={dept} value={dept}>{dept}</option>)}</select></label>
        <label>人員<select value={selectedPerson ? personKey(selectedPerson) : login.personKey} onChange={(e) => setLogin({ ...login, personKey: e.target.value, password: '' })}>{people.map((person) => <option key={personKey(person)} value={personKey(person)}>{person.name}（{person.username || person.name}）</option>)}</select></label>
        {needsPassword ? <label>密碼<input type="password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} placeholder="此人員已設定密碼，請輸入密碼" autoFocus /></label> : <p className="login-help">此人員尚未設定密碼，可直接登入。</p>}
        <div className="modal-actions"><button className="ghost" type="button" onClick={onCancel}>取消</button><button className="primary" type="submit">確認登入</button></div>
      </form>
    </section>
  </div>
}

function CompletionDateModal({ request, onCancel, onConfirm }: { request: ChangeRequest, onCancel: () => void, onConfirm: (date: string) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  return <div className="modal-backdrop no-print" role="dialog" aria-modal="true" aria-label="選擇完成日期">
    <section className="completion-modal">
      <p className="eyebrow">Close Request</p>
      <h3>完成需求：{request.requestNo}</h3>
      <label>實際完成日期<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <div className="modal-actions"><button className="ghost" type="button" onClick={onCancel}>取消</button><button className="primary" type="button" onClick={() => date && onConfirm(date)}>確認結案</button></div>
    </section>
  </div>
}

function PrintHeader({ title, filters, count, searchQuery = '' }: { title: string, filters: Filters, count: number, searchQuery?: string }) {
  const printDate = new Date().toLocaleString('zh-Hant', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  const filterSummary = [
    filters.from || filters.to ? `日期：${filters.from || '不限'} 至 ${filters.to || '不限'}` : '日期：全部',
    filters.categoryCode ? `大類：${filters.categoryCode}` : '大類：全部',
    filters.topicCode ? `第一層主題：${filters.topicCode}` : '第一層主題：全部',
    filters.requestSource !== 'all' ? `來源：${filters.requestSource}` : '來源：全部',
    filters.status !== 'all' ? `狀態：${statusLabels[filters.status]}` : '狀態：全部',
    filters.urgency !== 'all' ? `急迫度：${urgencyLabels[filters.urgency]}` : '急迫度：全部',
    searchQuery.trim() ? `關鍵詞：${searchQuery.trim()}` : '關鍵詞：全部',
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

function ListHeader({ title, filters, setFilters, requests, onRefresh, hideExports = false, searchQuery, setSearchQuery, requestSourceOptions = DEFAULT_REQUEST_SOURCES as unknown as string[] }: { title: string, filters: Filters, setFilters: (f: Filters) => void, requests: ChangeRequest[], onRefresh: () => void, hideExports?: boolean, searchQuery?: string, setSearchQuery?: (value: string) => void, requestSourceOptions?: string[] }) {
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
  const clearFilters = () => {
    setRangePreset('')
    setFilters(emptyFilters)
    setSearchQuery?.('')
  }
  return <div className="list-header no-print">
    <div className="section-title list-title-row">
      <div><p className="eyebrow">List</p><h2>{title}</h2></div>
      <div className="header-actions">
        <button className="ghost" onClick={onRefresh}><RefreshCw size={14} />同步最新</button>
        {!hideExports && <><button className="ghost" onClick={() => window.print()}><Printer size={14} />列印/PDF</button><button className="ghost" onClick={() => exportCsv(requests, 'sqms修訂需求.csv')}><Download size={14} />CSV</button><button className="ghost" onClick={() => exportExcel(requests, 'sqms修訂需求.xlsx')}><FileSpreadsheet size={14} />Excel</button></>}
      </div>
    </div>
    {setSearchQuery && <p className="duplicate-search-hint">{duplicateSearchHint}</p>}
    <div className="filters">
      {setSearchQuery && <input className="search-input" type="search" value={searchQuery ?? ''} onChange={(e) => setSearchQuery(e.target.value)} placeholder="搜索已提出需求關鍵詞" aria-label="搜索已提出需求關鍵詞" />}
      <select className="range-select" aria-label="新增或修改時間範圍" value={rangePreset} onChange={(e) => handleRangeChange(e.target.value)}>
        <option value="">新增/修改時間</option>
        <option value="30">近30天新增、修改</option>
        <option value="60">近60天新增、修改</option>
        <option value="90">近90天新增、修改</option>
      </select>
      <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
      <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      <select value={filters.requestSource} onChange={(e) => setFilters({ ...filters, requestSource: e.target.value })}><option value="all">全部來源</option>{requestSourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select>
      <select value={filters.categoryCode} onChange={(e) => setFilters({ ...filters, categoryCode: e.target.value, topicCode: '' })}><option value="">全部大類</option>{catalog.map((c) => <option key={c.code} value={c.code}>{c.code}｜{c.nameZh}</option>)}</select>
      <select value={filters.topicCode} onChange={(e) => setFilters({ ...filters, topicCode: e.target.value })}><option value="">全部第一層主題</option>{topics.map((t) => <option key={t.code} value={t.code}>{t.code}｜{t.titleZh}</option>)}</select>
      <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value as RequestStatus | 'all' })}><option value="all">全部狀態</option>{Object.entries(statusLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <select value={filters.urgency} onChange={(e) => setFilters({ ...filters, urgency: e.target.value as Urgency | 'all' })}><option value="all">全部急迫度</option>{Object.entries(urgencyLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
      <button className="ghost" onClick={clearFilters}>清除</button>
    </div>
  </div>
}

function RequestTable({ requests, isAdmin, canEditRequests, onEdit, onDelete, onComplete, onReopen }: { requests: ChangeRequest[], isAdmin: boolean, canEditRequests: boolean, onEdit: (r: ChangeRequest) => void, onDelete: (r: ChangeRequest) => void, onComplete: (r: ChangeRequest) => void, onReopen: (r: ChangeRequest) => void }) {
  const sorted = [...requests].sort((a, b) => {
    const overdueDiff = Number(isOverdue(b)) - Number(isOverdue(a))
    if (overdueDiff) return overdueDiff
    return a.targetDueDate.localeCompare(b.targetDueDate)
  })
  return <div className="table-wrap"><table className="request-table"><colgroup><col className="col-status" /><col className="col-urgency" /><col className="col-no" /><col className="col-source" /><col className="col-scope" /><col className="col-content" /><col className="col-due" /><col className="col-applicant" /><col className="col-actions" /></colgroup><thead><tr><th>狀態</th><th>急迫度</th><th>編號</th><th>來源</th><th>歸屬</th><th>建議內容</th><th>期望日</th><th>申請人</th><th className="no-print">操作</th></tr></thead><tbody>{sorted.length === 0 ? <tr><td colSpan={9} className="empty">暫無資料</td></tr> : sorted.map((request) => {
    const completed = request.status === 'completed'
    return <tr key={request.id} className={isOverdue(request) ? 'overdue' : ''}><td><span className={`status ${request.status}`}>{statusLabels[request.status]}</span>{request.completionDate ? <small>完成：{request.completionDate}</small> : null}</td><td>{urgencyLabels[request.urgency]}</td><td><b>{request.requestNo}</b><small>{request.createdAt.slice(0, 10)}</small></td><td><span className="source-chip">{request.requestSource || '外部檢查'}</span></td><td><span className="tag">{getCategoryName(request.categoryCode)}</span><b>{getTopicLabel(request.topicCode)}</b><small>{getItemLabel(request.topicCode, request.manualItemCode) || '未選第二層'}</small></td><td><b>{request.suggestedChange}</b><small>{request.changeReason}</small></td><td>{request.targetDueDate}</td><td>{request.applicantName}</td><td className="actions no-print">{canEditRequests ? <><button onClick={() => onEdit(request)}>修改</button>{completed ? <button onClick={() => onReopen(request)}>再次修改</button> : request.status !== 'cancelled' ? <button className="primary mini" onClick={() => onComplete(request)}>完成</button> : null}</> : <span className="action-hint">登入後可修改</span>}{isAdmin && <button className="danger" onClick={() => onDelete(request)}><Trash2 size={14} />刪除</button>}</td></tr>
  })}</tbody></table></div>
}
export default App
