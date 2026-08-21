import { useState } from 'react'
import { CheckCircle2, PlusCircle, Save, Trash2 } from 'lucide-react'
import { catalog, getManualItemOptions, getTopicDisplayLabel, getTopicOptions } from './data/sqmsCatalog'
import { urgencyLabels } from './lib/exporters'
import type { ChangeRequest, Urgency } from './types'

type RequiredField = 'requestSource' | 'applicantName' | 'suggestedChange' | 'changeReason'
type EntryState = 'pending' | 'saving' | 'saved' | 'error'

type BatchEntry = {
  key: string
  request: ChangeRequest
  missing: RequiredField[]
  state: EntryState
  error?: string
  savedRequest?: ChangeRequest
}

type BatchRequestModalProps = {
  requestSourceOptions: string[]
  createRequest: () => ChangeRequest
  onSave: (request: ChangeRequest) => Promise<ChangeRequest>
  onCancel: () => void
  onComplete: (savedRequests: ChangeRequest[]) => void
}

function createEntry(request: ChangeRequest): BatchEntry {
  return { key: crypto.randomUUID(), request, missing: [], state: 'pending' }
}

function missingRequiredFields(request: ChangeRequest): RequiredField[] {
  const missing: RequiredField[] = []
  if (!request.requestSource) missing.push('requestSource')
  if (!request.applicantName.trim()) missing.push('applicantName')
  if (!request.suggestedChange.trim()) missing.push('suggestedChange')
  if (!request.changeReason.trim()) missing.push('changeReason')
  return missing
}

export default function BatchRequestModal({ requestSourceOptions, createRequest, onSave, onCancel, onComplete }: BatchRequestModalProps) {
  const [entries, setEntries] = useState<BatchEntry[]>(() => [createEntry(createRequest())])
  const [saving, setSaving] = useState(false)
  const [summary, setSummary] = useState('每一筆都會獨立送至伺服器並取得正式需求編號。')

  function updateEntry<K extends keyof ChangeRequest>(key: string, field: K, value: ChangeRequest[K]) {
    setEntries((current) => current.map((entry) => {
      if (entry.key !== key || entry.state === 'saved') return entry
      const nextRequest = { ...entry.request, [field]: value }
      return {
        ...entry,
        request: nextRequest,
        missing: entry.missing.filter((missingField) => missingField !== field || !String(value ?? '').trim()),
        state: entry.state === 'error' ? 'pending' : entry.state,
        error: undefined,
      }
    }))
  }

  function changeCategory(key: string, categoryCode: string) {
    const firstTopic = getTopicOptions(categoryCode)[0]
    const firstItem = getManualItemOptions(firstTopic?.code)[0]
    setEntries((current) => current.map((entry) => entry.key === key && entry.state !== 'saved' ? {
      ...entry,
      request: { ...entry.request, categoryCode, topicCode: firstTopic?.code ?? '', manualItemCode: firstItem?.code ?? '' },
      state: entry.state === 'error' ? 'pending' : entry.state,
      error: undefined,
    } : entry))
  }

  function changeTopic(key: string, topicCode: string) {
    const firstItem = getManualItemOptions(topicCode)[0]
    setEntries((current) => current.map((entry) => entry.key === key && entry.state !== 'saved' ? {
      ...entry,
      request: { ...entry.request, topicCode, manualItemCode: firstItem?.code ?? '' },
      state: entry.state === 'error' ? 'pending' : entry.state,
      error: undefined,
    } : entry))
  }

  function addEntry() {
    setEntries((current) => [...current, createEntry(createRequest())])
  }

  function removeEntry(key: string) {
    setEntries((current) => current.length > 1 ? current.filter((entry) => entry.key !== key) : current)
  }

  async function submitBatch(event: React.FormEvent) {
    event.preventDefault()
    if (saving) return

    const validated = entries.map((entry) => entry.state === 'saved' ? entry : { ...entry, missing: missingRequiredFields(entry.request) })
    setEntries(validated)
    if (validated.some((entry) => entry.missing.length > 0)) {
      setSummary('尚未保存：請補齊各需求中標示紅色的必填欄位。')
      return
    }

    setSaving(true)
    setSummary('正在逐筆保存；每一筆都使用獨立操作識別與伺服器編號。')
    const savedRequests: ChangeRequest[] = validated.flatMap((entry) => entry.savedRequest ? [entry.savedRequest] : [])
    let failedCount = 0

    for (const entry of validated) {
      if (entry.state === 'saved') continue
      setEntries((current) => current.map((item) => item.key === entry.key ? { ...item, state: 'saving', error: undefined } : item))
      try {
        const savedRequest = await onSave({
          ...entry.request,
          createdAt: entry.request.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        savedRequests.push(savedRequest)
        setEntries((current) => current.map((item) => item.key === entry.key ? {
          ...item,
          request: savedRequest,
          savedRequest,
          state: 'saved',
          missing: [],
          error: undefined,
        } : item))
      } catch (error) {
        failedCount += 1
        const errorText = error instanceof Error ? error.message : '未知錯誤'
        setEntries((current) => current.map((item) => item.key === entry.key ? { ...item, state: 'error', error: errorText } : item))
      }
    }

    setSaving(false)
    if (failedCount === 0) {
      onComplete(savedRequests)
      return
    }
    setSummary(`部分完成：已保存 ${savedRequests.length} 筆，${failedCount} 筆未成功。未成功內容仍保留，可直接重試。`)
  }

  const remainingCount = entries.filter((entry) => entry.state !== 'saved').length

  return <div className="modal-backdrop batch-backdrop no-print" role="dialog" aria-modal="true" aria-label="批量增加需求">
    <section className="batch-modal">
      <header className="batch-modal-header">
        <div>
          <p className="eyebrow">Batch Capture</p>
          <h2>批量增加需求</h2>
          <p className="subtle">先輸入一筆；按「添加需求」即可增加到 N 筆。已成功的項目不會在重試時重複送出。</p>
        </div>
        <button className="ghost" type="button" onClick={onCancel} disabled={saving}>關閉</button>
      </header>

      <form onSubmit={submitBatch} className="batch-form">
        <div className="batch-entry-list">
          {entries.map((entry, index) => {
            const topicOptions = getTopicOptions(entry.request.categoryCode)
            const itemOptions = getManualItemOptions(entry.request.topicCode)
            const disabled = saving || entry.state === 'saved'
            const fieldError = (field: RequiredField) => entry.missing.includes(field) ? 'field-error' : undefined
            return <section className={`batch-entry ${entry.state}`} key={entry.key} aria-label={`需求 ${index + 1}`}>
              <div className="batch-entry-title">
                <div>
                  <h3>需求 {index + 1}</h3>
                  {entry.state === 'saved' && <span className="batch-item-status success"><CheckCircle2 size={15} />已保存 {entry.savedRequest?.requestNo}</span>}
                  {entry.state === 'saving' && <span className="batch-item-status saving">保存中…</span>}
                  {entry.state === 'error' && <span className="batch-item-status error">保存失敗：{entry.error}</span>}
                </div>
                {entries.length > 1 && entry.state !== 'saved' && <button className="ghost batch-remove" type="button" onClick={() => removeEntry(entry.key)} disabled={saving} aria-label={`移除需求 ${index + 1}`}><Trash2 size={15} />移除</button>}
              </div>

              <div className="batch-request-grid">
                <label>需求編號<input value={entry.state === 'saved' ? entry.request.requestNo : '儲存後自動產生'} readOnly /></label>
                <label>需求來源 *<select className={fieldError('requestSource')} value={entry.request.requestSource} onChange={(event) => updateEntry(entry.key, 'requestSource', event.target.value)} disabled={disabled}>{requestSourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}</select></label>
                <label>申請人 *<input className={fieldError('applicantName')} value={entry.request.applicantName} onChange={(event) => updateEntry(entry.key, 'applicantName', event.target.value)} placeholder="輸入姓名" disabled={disabled} /></label>
                <label>大類<select value={entry.request.categoryCode} onChange={(event) => changeCategory(entry.key, event.target.value)} disabled={disabled}>{catalog.map((category) => <option key={category.code} value={category.code}>{category.code}｜{category.nameZh}</option>)}</select></label>
                <label>第一層主題<select value={entry.request.topicCode} onChange={(event) => changeTopic(entry.key, event.target.value)} disabled={disabled}>{topicOptions.map((topic) => <option key={topic.code} value={topic.code}>{getTopicDisplayLabel(topic.code)}</option>)}</select></label>
                <label>第二層手冊 / 文件項<select value={entry.request.manualItemCode ?? ''} onChange={(event) => updateEntry(entry.key, 'manualItemCode', event.target.value)} disabled={disabled}><option value="">只具體到第一層主題</option>{itemOptions.map((item, itemIndex) => <option key={`${entry.request.topicCode}-${item.code}-${itemIndex}`} value={item.code}>{item.code}｜{item.titleZh}</option>)}</select></label>
                <label>期望完成日期<input type="date" value={entry.request.targetDueDate} onChange={(event) => updateEntry(entry.key, 'targetDueDate', event.target.value)} disabled={disabled} /></label>
                <label>急迫度<select value={entry.request.urgency} onChange={(event) => updateEntry(entry.key, 'urgency', event.target.value as Urgency)} disabled={disabled}>{Object.entries(urgencyLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label className="wide">修改內容歸屬補充<input value={entry.request.scopeNote ?? ''} onChange={(event) => updateEntry(entry.key, 'scopeNote', event.target.value)} placeholder="例如：某段落、某表格、某流程" disabled={disabled} /></label>
                <label className="wide">需改的建議內容或方向 *<textarea className={fieldError('suggestedChange')} value={entry.request.suggestedChange} onChange={(event) => updateEntry(entry.key, 'suggestedChange', event.target.value)} rows={3} disabled={disabled} /></label>
                <label className="wide">需要修改的理由或依據 *<textarea className={fieldError('changeReason')} value={entry.request.changeReason} onChange={(event) => updateEntry(entry.key, 'changeReason', event.target.value)} rows={2} disabled={disabled} /></label>
                <label className="check"><input type="checkbox" checked={entry.request.needRelatedFormUpdate} onChange={(event) => updateEntry(entry.key, 'needRelatedFormUpdate', event.target.checked)} disabled={disabled} /> 需要配套修改記錄表格</label>
                <label className="wide">推薦的修改內容或資料參考<textarea value={entry.request.referenceMaterials ?? ''} onChange={(event) => updateEntry(entry.key, 'referenceMaterials', event.target.value)} rows={2} disabled={disabled} /></label>
                <label className="wide">備註<textarea value={entry.request.remarks ?? ''} onChange={(event) => updateEntry(entry.key, 'remarks', event.target.value)} rows={2} placeholder="可填寫補充說明、處理注意事項或後續追蹤備註" disabled={disabled} /></label>
              </div>
            </section>
          })}
        </div>

        <footer className="batch-modal-footer">
          <div className={`batch-summary ${summary.startsWith('尚未') || summary.startsWith('部分') ? 'error' : ''}`} role="status" aria-live="polite">{summary}</div>
          <div className="batch-footer-actions">
            <button className="ghost" type="button" onClick={addEntry} disabled={saving}><PlusCircle size={16} />添加需求</button>
            <button className="primary" type="submit" disabled={saving || remainingCount === 0}><Save size={16} />{saving ? '批量保存中…' : `批量保存 ${remainingCount} 筆需求`}</button>
          </div>
        </footer>
      </form>
    </section>
  </div>
}
