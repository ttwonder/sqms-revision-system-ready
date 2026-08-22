import { getTopicAbbreviation, getTopicDisplayLabel } from '../data/sqmsCatalog'

export type TopicChartDatum = {
  name: string
  fullName: string
  value: number
}

export function buildTopicChartData(byTopic: Record<string, number>): TopicChartDatum[] {
  return Object.entries(byTopic)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([topicCode, value]) => ({
      name: getTopicAbbreviation(topicCode) || topicCode,
      fullName: getTopicDisplayLabel(topicCode) || topicCode,
      value,
    }))
}

export function pieNameValueLabel({ name, value }: { name?: string | number, value?: string | number }) {
  return `${String(name ?? '')} ${String(value ?? 0)}`.trim()
}
