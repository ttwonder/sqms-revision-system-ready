import type { ChangeRequest } from '../types'
import { catalog, getManualItem, getTopic } from '../data/sqmsCatalog'

export const statusLabels = {
  new: '新提出',
  processing: '處理中',
  completed: '已完成',
  cancelled: '取消 / 不採納',
} as const

export const urgencyLabels = {
  urgent: '盡快',
  high: '高',
  medium: '中',
  low: '低',
} as const

export function getCategoryName(code: string) {
  return catalog.find((item) => item.code === code)?.nameZh ?? code
}

export function getTopicLabel(code?: string) {
  const topic = getTopic(code)
  return topic ? `${topic.code} ${topic.titleZh}` : code || ''
}

export function getItemLabel(topicCode?: string, itemCode?: string) {
  const item = getManualItem(topicCode, itemCode)
  return item ? `${item.code} ${item.titleZh}` : itemCode || ''
}

export function rowsForExport(requests: ChangeRequest[]) {
  return requests.map((request) => ({
    需求編號: request.requestNo,
    申請人: request.applicantName,
    大類: getCategoryName(request.categoryCode),
    第一層主題: getTopicLabel(request.topicCode),
    第二層手冊或文件項: getItemLabel(request.topicCode, request.manualItemCode),
    修改內容歸屬補充: request.scopeNote ?? '',
    建議內容或方向: request.suggestedChange,
    修改理由或依據: request.changeReason,
    期望完成日期: request.targetDueDate,
    急迫度: urgencyLabels[request.urgency],
    需配套表格: request.needRelatedFormUpdate ? '是' : '否',
    狀態: statusLabels[request.status],
    完成日期: request.completionDate ?? '',
    參考資料: request.referenceMaterials ?? '',
    建立時間: request.createdAt.slice(0, 10),
    更新時間: request.updatedAt.slice(0, 10),
  }))
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export function exportCsv(requests: ChangeRequest[], filename: string) {
  const rows = rowsForExport(requests)
  const headers = Object.keys(rows[0] ?? { 需求編號: '' })
  const csv = [headers.join(','), ...rows.map((row) => headers.map((header) => csvEscape(row[header as keyof typeof row])).join(','))].join('\n')
  downloadText(`\ufeff${csv}`, filename, 'text/csv;charset=utf-8;')
}

export function exportExcel(requests: ChangeRequest[], filename: string) {
  const rows = rowsForExport(requests)
  const headers = Object.keys(rows[0] ?? { 需求編號: '' })
  const htmlRows = [
    `<tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr>`,
    ...rows.map((row) => `<tr>${headers.map((header) => `<td>${String(row[header as keyof typeof row] ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</td>`).join('')}</tr>`),
  ].join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table>${htmlRows}</table></body></html>`
  downloadText(html, filename.replace(/\.xlsx$/i, '.xls'), 'application/vnd.ms-excel;charset=utf-8;')
}
