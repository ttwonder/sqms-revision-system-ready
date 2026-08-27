import type { CatalogCategory } from '../types'
import { catalog } from '../data/sqmsCatalog'
import { getTopicAbbreviation, getTopicDisplayLabel } from '../data/sqmsCatalog'

export type TopicChartDatum = {
  name: string
  fullName: string
  value: number
}

export function buildTopicChartData(byTopic: Record<string, number>, source: CatalogCategory[] = catalog): TopicChartDatum[] {
  return Object.entries(byTopic)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([topicCode, value]) => ({
      name: getTopicAbbreviation(topicCode, source) || topicCode,
      fullName: getTopicDisplayLabel(topicCode, source) || topicCode,
      value,
    }))
}

export function pieNameValueLabel({ name, value }: { name?: string | number, value?: string | number }) {
  return `${String(name ?? '')} ${String(value ?? 0)}`.trim()
}
