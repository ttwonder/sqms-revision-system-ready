import type { ChangeRequest, DashboardFilters, DashboardStats } from '../types'

const DAY_MS = 24 * 60 * 60 * 1000

function toDateOnly(value?: string): string | undefined {
  if (!value) return undefined
  return value.slice(0, 10)
}

function addCount(map: Record<string, number>, key?: string) {
  if (!key) return
  map[key] = (map[key] ?? 0) + 1
}

export function isOverdue(request: ChangeRequest, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!request.targetDueDate) return false
  if (request.status === 'completed' || request.status === 'cancelled') return false
  return request.targetDueDate < today
}

export function isPending(request: ChangeRequest): boolean {
  return request.status !== 'completed' && request.status !== 'cancelled'
}

export function filterRequests(requests: ChangeRequest[], filters: DashboardFilters = {}): ChangeRequest[] {
  const from = toDateOnly(filters.from)
  const to = toDateOnly(filters.to)
  return requests.filter((request) => {
    if (request.isDeleted) return false
    const created = toDateOnly(request.createdAt)
    if (from && created && created < from) return false
    if (to && created && created > to) return false
    if (filters.categoryCode && request.categoryCode !== filters.categoryCode) return false
    if (filters.topicCode && request.topicCode !== filters.topicCode) return false
    if (filters.status && filters.status !== 'all' && request.status !== filters.status) return false
    if (filters.urgency && filters.urgency !== 'all' && request.urgency !== filters.urgency) return false
    return true
  })
}

export function buildDashboardStats(requests: ChangeRequest[], filters: DashboardFilters = {}): DashboardStats {
  const today = filters.today ?? new Date().toISOString().slice(0, 10)
  const scoped = filterRequests(requests, filters)
  const completed = scoped.filter((request) => request.status === 'completed').length
  const byCategory: Record<string, number> = {}
  const byTopic: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  const byUrgency: Record<string, number> = {}

  scoped.forEach((request) => {
    addCount(byCategory, request.categoryCode)
    addCount(byTopic, request.topicCode)
    addCount(byStatus, request.status)
    addCount(byUrgency, request.urgency)
  })

  const recent = [...scoped]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8)

  const dueSoon = scoped
    .filter(isPending)
    .sort((a, b) => a.targetDueDate.localeCompare(b.targetDueDate))
    .filter((request) => {
      if (!request.targetDueDate) return false
      const diff = (new Date(request.targetDueDate).getTime() - new Date(today).getTime()) / DAY_MS
      return diff <= 14
    })
    .slice(0, 8)

  return {
    total: scoped.length,
    completed,
    completionRate: scoped.length === 0 ? 0 : Math.round((completed / scoped.length) * 100),
    overdue: scoped.filter((request) => isOverdue(request, today)).length,
    pending: scoped.filter(isPending).length,
    byCategory,
    byTopic,
    byStatus,
    byUrgency,
    recent,
    dueSoon,
  }
}
