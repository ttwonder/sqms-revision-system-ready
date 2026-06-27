export type CategoryCode = 'SMM' | 'SMP' | 'SMI' | 'SQMS' | 'ISO'

export interface ManualItem {
  code: string
  titleZh: string
  titleEn?: string
  sortOrder: number
}

export interface Topic {
  code: string
  titleZh: string
  titleEn?: string
  items: ManualItem[]
  sortOrder: number
}

export interface CatalogCategory {
  code: CategoryCode
  nameZh: string
  nameEn?: string
  topics: Topic[]
  sortOrder: number
}

export type Urgency = 'urgent' | 'high' | 'medium' | 'low'
export type RequestStatus = 'new' | 'processing' | 'completed' | 'cancelled'

export interface ChangeRequest {
  id: string
  requestNo: string
  applicantName: string
  categoryCode: CategoryCode | string
  topicCode: string
  manualItemCode?: string
  scopeNote?: string
  suggestedChange: string
  changeReason: string
  targetDueDate: string
  urgency: Urgency
  needRelatedFormUpdate: boolean
  referenceMaterials?: string
  status: RequestStatus
  completionDate?: string
  publicEditNote?: string
  createdAt: string
  updatedAt: string
  isDeleted: boolean
  deletedAt?: string
  deletedBy?: string
}

export interface DashboardFilters {
  from?: string
  to?: string
  today?: string
  categoryCode?: string
  topicCode?: string
  status?: RequestStatus | 'all'
  urgency?: Urgency | 'all'
}

export interface DashboardStats {
  total: number
  completed: number
  completionRate: number
  overdue: number
  pending: number
  byCategory: Record<string, number>
  byTopic: Record<string, number>
  byStatus: Record<string, number>
  byUrgency: Record<string, number>
  recent: ChangeRequest[]
  dueSoon: ChangeRequest[]
}
