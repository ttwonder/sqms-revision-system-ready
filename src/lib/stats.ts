import type { ChangeRequest, DashboardFilters, DashboardStats } from '../types'

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
    const updated = toDateOnly(request.updatedAt)
    const inDateRange = [created, updated].some((date) => {
      if (!date) return false
      if (from && date < from) return false
      if (to && date > to) return false
      return true
    })
    if ((from || to) && !inDateRange) return false
    if (filters.categoryCode && request.categoryCode !== filters.categoryCode) return false
    if (filters.topicCode && request.topicCode !== filters.topicCode) return false
    if (filters.status && filters.status !== 'all' && request.status !== filters.status) return false
    if (filters.urgency && filters.urgency !== 'all' && request.urgency !== filters.urgency) return false
    if (filters.requestSource && filters.requestSource !== 'all' && request.requestSource !== filters.requestSource) return false
    return true
  })
}

export function buildDashboardStats(requests: ChangeRequest[], filters: DashboardFilters = {}): DashboardStats {
  const today = filters.today ?? new Date().toISOString().slice(0, 10)
  const scoped = filterRequests(requests, filters)
  const completed = scoped.filter((request) => request.status === 'completed').length
  const overdue = scoped.filter((request) => isOverdue(request, today)).length
  const completedRequests = scoped.filter((request) => request.status === 'completed')
  const onTimeCompleted = completedRequests.filter((request) => {
    const completionDate = toDateOnly(request.completionDate) ?? toDateOnly(request.updatedAt)
    if (!completionDate || !request.targetDueDate) return false
    return completionDate <= request.targetDueDate
  }).length
  const byCategory: Record<string, number> = {}
  const byTopic: Record<string, number> = {}
  const byStatus: Record<string, number> = {}
  const byUrgency: Record<string, number> = {}
  const byRequestSource: Record<string, number> = {}

  scoped.forEach((request) => {
    addCount(byCategory, request.categoryCode)
    addCount(byTopic, request.topicCode)
    addCount(byStatus, request.status)
    addCount(byUrgency, request.urgency)
    addCount(byRequestSource, request.requestSource || '未標記')
  })

  return {
    total: scoped.length,
    completed,
    completionRate: scoped.length === 0 ? 0 : Math.round((completed / scoped.length) * 100),
    onTimeCompletionRate: completed === 0 ? 0 : Math.round((onTimeCompleted / completed) * 100),
    overdue,
    overdueRate: scoped.length === 0 ? 0 : Math.round((overdue / scoped.length) * 100),
    pending: scoped.filter(isPending).length,
    byCategory,
    byTopic,
    byStatus,
    byUrgency,
    byRequestSource,
  }
}
