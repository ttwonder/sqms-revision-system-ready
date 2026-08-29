/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { ChangeRequest } from './types'

function requestFixture(overrides: Partial<ChangeRequest>): ChangeRequest {
  return {
    id: crypto.randomUUID(),
    requestNo: 'SQMS-20260821-01',
    applicantName: '申請人',
    requestSource: '外部檢查',
    categoryCode: 'SMI',
    topicCode: 'SMI-01',
    manualItemCode: '',
    scopeNote: '',
    suggestedChange: '測試建議',
    changeReason: '測試理由',
    targetDueDate: '',
    urgency: 'medium',
    needRelatedFormUpdate: false,
    referenceMaterials: '',
    remarks: '',
    status: 'new',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    revision: 1,
    isDeleted: false,
    ...overrides,
  }
}

vi.mock('./lib/supabaseClient', () => ({
  supabase: null,
  signupClient: null,
  isCloudConfigured: false,
  fromDbAdminUser: (row: unknown) => row,
  fromDbPersonnelUser: (row: unknown) => row,
}))

describe('request manual save flow', () => {
  beforeEach(() => {
    localStorage.clear()
    window.scrollTo = vi.fn()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows an explicit manual-save button and confirms an acknowledged save', async () => {
    render(<App />)

    expect(await screen.findByRole('button', { name: '手動保存新增需求' })).toBeEnabled()
    expect(screen.getByText('草稿會自動保留在此裝置；只有按下手動保存才會正式送出。')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('申請人 *'), { target: { value: '測試人員' } })
    fireEvent.change(screen.getByLabelText('需改的建議內容或方向 *'), { target: { value: '測試手動保存' } })
    fireEvent.change(screen.getByLabelText('需要修改的理由或依據 *'), { target: { value: '確認保存提示' } })
    fireEvent.click(screen.getByRole('button', { name: '手動保存新增需求' }))

    const success = await screen.findByRole('status')
    expect(success).toHaveTextContent(/^保存成功：已新增 SQMS-/)
    expect(success).toHaveTextContent('已正式保存')

    await waitFor(() => {
      const saved = JSON.parse(localStorage.getItem('sqms-change-requests-v1') || '[]')
      expect(saved).toHaveLength(1)
      expect(saved[0]).toMatchObject({ applicantName: '測試人員', suggestedChange: '測試手動保存' })
    })
  })

  it('uses the signed-in person as an editable applicant default', async () => {
    render(<App />)

    expect(await screen.findByLabelText('申請人 *')).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: '人員登入 / 切換' }))
    const loginDialog = screen.getByRole('dialog', { name: '人員登入或切換' })
    fireEvent.click(within(loginDialog).getByRole('button', { name: '確認登入' }))

    const applicant = await screen.findByLabelText('申請人 *')
    expect(applicant).toHaveValue('呂學修副總')
    fireEvent.change(applicant, { target: { value: '手動修改姓名' } })
    expect(applicant).toHaveValue('手動修改姓名')

    fireEvent.click(screen.getByRole('button', { name: '批量增加' }))
    const batchDialog = screen.getByRole('dialog', { name: '批量增加需求' })
    expect(within(batchDialog).getByLabelText('申請人 *')).toHaveValue('呂學修副總')
  })

  it('shows Owner identity in Current User and prevents layered personnel login', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    fireEvent.change(screen.getByLabelText('管理員帳號 / Email'), { target: { value: 'owner@example.com' } })
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'SQMS-ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: '登入管理' }))

    const identity = screen.getByRole('region', { name: '目前人員身份' })
    expect(within(identity).getByText('owner@example.com')).toBeInTheDocument()
    expect(within(identity).getByText('Owner')).toBeInTheDocument()
    expect(within(identity).queryByText('未登入人員')).not.toBeInTheDocument()
    expect(within(identity).queryByRole('button', { name: '人員登入 / 切換' })).not.toBeInTheDocument()
    expect(within(identity).getByRole('button', { name: '登出 Owner' })).toBeEnabled()
    expect(screen.getAllByRole('button', { name: '登出 Owner' })).toHaveLength(1)
    expect(screen.queryByText(/已登入：owner@example.com/)).not.toBeInTheDocument()
    expect(screen.queryByText(/本機展示模式管理員已登入/)).not.toBeInTheDocument()

    fireEvent.click(within(identity).getByRole('button', { name: '登出 Owner' }))
    await waitFor(() => expect(within(identity).getByText('未登入人員')).toBeInTheDocument())
    expect(within(identity).getByRole('button', { name: '人員登入 / 切換' })).toBeEnabled()
    expect(localStorage.getItem('sqms-current-personnel-v1')).toBeNull()
  })

  it('cascades category and topic changes into the first matching manual item', async () => {
    render(<App />)

    const mainCategory = await screen.findByLabelText('大類')
    const mainTopic = screen.getByLabelText('第一層主題')
    const mainItem = screen.getByLabelText('第二層手冊 / 文件項')
    expect(mainItem).toHaveValue('SHM-001')
    fireEvent.change(mainTopic, { target: { value: 'SMI-02' } })
    expect(mainItem).toHaveValue('SOI-001')
    expect(within(mainItem).getByRole('option', { name: /SOI-002｜船舶安全會議/ })).toBeInTheDocument()
    fireEvent.change(mainCategory, { target: { value: 'SMP' } })
    expect(mainTopic).toHaveValue('SMP-01')
    expect(mainItem).toHaveValue('SSOR-001')
    fireEvent.change(mainTopic, { target: { value: 'SMP-13' } })
    expect(mainItem).toHaveValue('')
    expect(within(mainItem).getAllByRole('option')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '批量增加' }))
    const batchDialog = screen.getByRole('dialog', { name: '批量增加需求' })
    const batchCategory = within(batchDialog).getByLabelText('大類')
    const batchTopic = within(batchDialog).getByLabelText('第一層主題')
    const batchItem = within(batchDialog).getByLabelText('第二層手冊 / 文件項')
    expect(batchItem).toHaveValue('SHM-001')

    fireEvent.change(batchTopic, { target: { value: 'SMI-02' } })
    expect(batchItem).toHaveValue('SOI-001')
    fireEvent.change(batchCategory, { target: { value: 'SMP' } })
    expect(batchTopic).toHaveValue('SMP-01')
    expect(batchItem).toHaveValue('SSOR-001')
  })

  it('allows an unauthenticated visitor to modify an existing request', async () => {
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify([
      requestFixture({ id: 'guest-edit', requestNo: 'SQMS-20260821-11', remarks: '' }),
    ]))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))

    const table = await screen.findByRole('table')
    fireEvent.click(within(table).getByRole('button', { name: '修改' }))
    expect(screen.queryByRole('dialog', { name: '人員登入或切換' })).not.toBeInTheDocument()
    expect(await screen.findByText('修改既有需求')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('備註'), { target: { value: '訪客直接修改' } })
    fireEvent.click(screen.getByRole('button', { name: '手動保存修改' }))
    expect(await screen.findByRole('status')).toHaveTextContent(/保存成功：已更新 SQMS-20260821-11/)
    expect(JSON.parse(localStorage.getItem('sqms-change-requests-v1') || '[]')[0].remarks).toBe('訪客直接修改')
  })

  it('shows selection and complete/delete actions only to managers and runs both bulk actions', async () => {
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify([
      requestFixture({ id: 'bulk-new', requestNo: 'SQMS-20260821-21', status: 'new' }),
      requestFixture({ id: 'bulk-processing', requestNo: 'SQMS-20260821-22', status: 'processing' }),
      requestFixture({ id: 'bulk-completed', requestNo: 'SQMS-20260821-23', status: 'completed', completionDate: '2026-08-20' }),
    ]))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))

    let table = await screen.findByRole('table')
    expect(within(table).getAllByRole('button', { name: '修改' })).toHaveLength(3)
    expect(within(table).queryByRole('button', { name: '完成' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: '刪除' })).not.toBeInTheDocument()
    expect(within(table).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /批量完成/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /批量刪除/ })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'SQMS-ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: '登入管理' }))
    expect(screen.queryByText('需求刪除管理')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /資料與空間/ }))
    expect(screen.getByText('資料與空間管理')).toBeInTheDocument()

    for (const tabName of ['總清單', '待完成', '已完成']) {
      fireEvent.click(screen.getByRole('button', { name: tabName }))
      const tabTable = screen.getByRole('table')
      expect(within(tabTable).getByRole('checkbox', { name: '全選目前清單' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /批量完成/ })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /批量刪除/ })).toBeInTheDocument()
    }
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))

    table = screen.getByRole('table')
    expect(within(table).getAllByRole('button', { name: '修改' })).toHaveLength(3)
    expect(within(table).getAllByRole('button', { name: '完成' })).toHaveLength(2)
    expect(within(table).getAllByRole('button', { name: '刪除' })).toHaveLength(3)
    const selectAll = within(table).getByRole('checkbox', { name: '全選目前清單' })
    fireEvent.click(selectAll)
    expect(screen.getByRole('button', { name: '批量完成（2）' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '批量刪除（3）' })).toBeEnabled()

    fireEvent.click(screen.getByRole('button', { name: '批量完成（2）' }))
    const completionDialog = screen.getByRole('dialog', { name: '批量完成需求' })
    fireEvent.click(within(completionDialog).getByRole('button', { name: '確認批量完成' }))
    expect(await screen.findByText(/批量完成成功：已完成 2 筆需求/)).toBeInTheDocument()

    table = screen.getByRole('table')
    fireEvent.click(within(table).getByRole('checkbox', { name: '全選目前清單' }))
    fireEvent.click(screen.getByRole('button', { name: '批量刪除（3）' }))
    expect(await screen.findByText(/批量刪除成功：已刪除 3 筆需求/)).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem('sqms-change-requests-v1') || '[]')
    expect(saved.every((request: ChangeRequest) => request.isDeleted)).toBe(true)
    expect(confirmSpy).toHaveBeenCalledTimes(1)
  })

  it('replaces the duplicate admin request table with storage stats and selective purge', async () => {
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify([
      requestFixture({ id: 'keep-active', requestNo: 'SQMS-20260821-41' }),
      requestFixture({ id: 'purge-deleted', requestNo: 'SQMS-20260821-42', isDeleted: true, deletedAt: '2026-08-21T08:00:00.000Z', deletedBy: 'owner@example.com' }),
    ]))
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))
    expect(await screen.findByText('SQMS-20260821-41')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'SQMS-ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: '登入管理' }))

    expect(screen.queryByText('需求刪除管理')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /資料與空間/ }))
    expect(screen.getByText('資料與空間管理')).toBeInTheDocument()
    expect(await screen.findByText('正常需求')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('checkbox', { name: '選擇永久刪除 SQMS-20260821-42' }))
    fireEvent.click(screen.getByRole('button', { name: '永久刪除所選（1）' }))

    expect(await screen.findByText(/永久清理完成：1 筆需求、0 筆事件/)).toBeInTheDocument()
    const saved = JSON.parse(localStorage.getItem('sqms-change-requests-v1') || '[]')
    expect(saved.map((request: ChangeRequest) => request.id)).toEqual(['keep-active'])
    expect(confirmSpy).toHaveBeenCalledTimes(1)
  })

  it('shows one management section at a time from the side navigation', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'SQMS-ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: '登入管理' }))

    const navigation = screen.getByRole('navigation', { name: '管理頁分區' })
    expect(screen.getByRole('region', { name: '目錄與分類管理' })).toBeInTheDocument()
    expect(screen.queryByText('需求來源項目管理')).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: /需求來源/ }))
    expect(screen.getByText('需求來源項目管理')).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: '目錄與分類管理' })).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: /人員與權限/ }))
    expect(screen.getByText('人員與權限管控')).toBeInTheDocument()
    expect(screen.queryByText('需求來源項目管理')).not.toBeInTheDocument()

    fireEvent.click(within(navigation).getByRole('button', { name: /資料與空間/ }))
    expect(screen.getByText('資料與空間管理')).toBeInTheDocument()
    expect(screen.queryByText('人員與權限管控')).not.toBeInTheDocument()
  })

  it('keeps old request codes visible and editable after catalog relationships move', async () => {
    localStorage.setItem('sqms-shared-catalog-v1', JSON.stringify([
      { id: 'cat-a', code: 'A', nameZh: '大類甲', sortOrder: 1, active: true, topics: [{ id: 'topic-old', code: 'OLD', titleZh: '舊主題', sortOrder: 1, active: true, items: [] }] },
      { id: 'cat-b', code: 'B', nameZh: '大類乙', sortOrder: 2, active: true, topics: [{ id: 'topic-new', code: 'T1', titleZh: '移動後主題', sortOrder: 1, active: true, items: [{ id: 'item-1', code: 'I1', titleZh: '移動後項目', sortOrder: 1, active: true }] }] },
    ]))
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify([
      requestFixture({ id: 'moved-topic', requestNo: 'SQMS-20260821-61', categoryCode: 'A', topicCode: 'T1', manualItemCode: 'I1' }),
      requestFixture({ id: 'moved-item', requestNo: 'SQMS-20260821-62', categoryCode: 'A', topicCode: 'OLD', manualItemCode: 'I1' }),
    ]))

    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))
    const table = await screen.findByRole('table')
    await waitFor(() => expect(within(table).getAllByText('I1 移動後項目')).toHaveLength(2))
    const rows = within(table).getAllByRole('row')
    const movedTopicRow = rows.find((row) => row.textContent?.includes('SQMS-20260821-61')) as HTMLElement
    const movedItemRow = rows.find((row) => row.textContent?.includes('SQMS-20260821-62')) as HTMLElement
    expect(movedTopicRow).toHaveTextContent('T1｜I｜移動後主題')
    expect(movedItemRow).toHaveTextContent('OLD｜舊主題')

    fireEvent.click(within(movedItemRow).getByRole('button', { name: '修改' }))
    expect(screen.getByLabelText('第一層主題')).toHaveValue('OLD')
    expect(screen.getByLabelText('第二層手冊 / 文件項')).toHaveValue('I1')
    expect(within(screen.getByLabelText('第二層手冊 / 文件項')).getByRole('option', { name: 'I1｜移動後項目' })).toBeInTheDocument()
  })

  it('opens batch entry and saves two independent requests', async () => {
    render(<App />)

    fireEvent.click(await screen.findByRole('button', { name: '批量增加' }))
    const dialog = screen.getByRole('dialog', { name: '批量增加需求' })
    expect(within(dialog).getByText('需求 1')).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: '添加需求' }))
    expect(within(dialog).getByText('需求 2')).toBeInTheDocument()

    const applicants = within(dialog).getAllByLabelText('申請人 *')
    const suggestions = within(dialog).getAllByLabelText('需改的建議內容或方向 *')
    const reasons = within(dialog).getAllByLabelText('需要修改的理由或依據 *')
    fireEvent.change(applicants[0], { target: { value: '批量人員一' } })
    fireEvent.change(suggestions[0], { target: { value: '批量需求一' } })
    fireEvent.change(reasons[0], { target: { value: '批量理由一' } })
    fireEvent.change(applicants[1], { target: { value: '批量人員二' } })
    fireEvent.change(suggestions[1], { target: { value: '批量需求二' } })
    fireEvent.change(reasons[1], { target: { value: '批量理由二' } })

    fireEvent.click(within(dialog).getByRole('button', { name: '批量保存 2 筆需求' }))

    await waitFor(() => expect(screen.queryByRole('dialog', { name: '批量增加需求' })).not.toBeInTheDocument())
    expect(screen.getByText(/批量新增成功：已新增 2 筆需求/)).toBeInTheDocument()

    const saved = JSON.parse(localStorage.getItem('sqms-change-requests-v1') || '[]')
    expect(saved).toHaveLength(2)
    expect(saved.map((item: { applicantName: string }) => item.applicantName)).toEqual(expect.arrayContaining(['批量人員一', '批量人員二']))
    expect(new Set(saved.map((item: { requestNo: string }) => item.requestNo)).size).toBe(2)
  })

  it('renders distinct semantic colors for every request status and urgency', async () => {
    const toneCases = [
      { id: 'tone-new', requestNo: 'SQMS-20260821-01', status: 'new', urgency: 'urgent', statusLabel: '新提出', urgencyLabel: '盡快' },
      { id: 'tone-processing', requestNo: 'SQMS-20260821-02', status: 'processing', urgency: 'high', statusLabel: '處理中', urgencyLabel: '高' },
      { id: 'tone-completed', requestNo: 'SQMS-20260821-03', status: 'completed', urgency: 'medium', statusLabel: '已完成', urgencyLabel: '中', completionDate: '2026-08-21' },
      { id: 'tone-cancelled', requestNo: 'SQMS-20260821-04', status: 'cancelled', urgency: 'low', statusLabel: '取消 / 不採納', urgencyLabel: '低' },
    ] as const
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify(toneCases.map((item) => requestFixture(item))))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))

    await waitFor(() => expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(4))
    const findRow = (requestNo: string) => within(screen.getByRole('table')).getAllByRole('row').find((row) => row.textContent?.includes(requestNo))
    for (const toneCase of toneCases) {
      const row = findRow(toneCase.requestNo)
      expect(row).toBeDefined()
      expect(row?.querySelector(`.status.${toneCase.status}`)).toHaveTextContent(toneCase.statusLabel)
      expect(row?.querySelector(`.urgency.${toneCase.urgency}`)).toHaveTextContent(toneCase.urgencyLabel)
    }

    fireEvent.click(screen.getByRole('button', { name: '管理' }))
    fireEvent.change(screen.getByLabelText('密碼'), { target: { value: 'SQMS-ADMIN' } })
    fireEvent.click(screen.getByRole('button', { name: '登入管理' }))
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))

    for (const toneCase of toneCases) {
      const row = findRow(toneCase.requestNo)
      expect(within(row as HTMLElement).getByRole('combobox', { name: `${toneCase.requestNo} 狀態` })).toHaveClass('status-select', toneCase.status)
      expect(row?.querySelector(`.urgency.${toneCase.urgency}`)).toHaveTextContent(toneCase.urgencyLabel)
    }
  })

  it('orders shared list columns as requested while keeping each field width class attached', async () => {
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify([
      requestFixture({ requestNo: 'SQMS-20260821-01' }),
    ]))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))

    const table = await screen.findByRole('table')
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent?.trim())).toEqual([
      '建議內容',
      '歸屬',
      '編號',
      '期望日',
      '來源',
      '急迫度',
      '申請人',
      '狀態',
      '操作',
    ])
    expect([...table.querySelectorAll('col')].map((column) => column.className)).toEqual([
      'col-content',
      'col-scope',
      'col-no',
      'col-due',
      'col-source',
      'col-urgency',
      'col-applicant',
      'col-status',
      'col-actions',
    ])
  })

  it('defaults all, pending, and completed lists to newest request number first', async () => {
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify([
      requestFixture({ requestNo: 'SQMS-20260820-01', createdAt: '2026-08-20T00:00:00.000Z', status: 'new' }),
      requestFixture({ requestNo: 'SQMS-20260821-02', createdAt: '2026-08-21T00:00:00.000Z', status: 'completed', completionDate: '2026-08-21' }),
      requestFixture({ requestNo: 'SQMS-20260822-03', createdAt: '2026-08-22T00:00:00.000Z', status: 'processing' }),
      requestFixture({ requestNo: 'SQMS-20260823-04', createdAt: '2026-08-23T00:00:00.000Z', status: 'completed', completionDate: '2026-08-23' }),
    ]))
    render(<App />)

    const displayedRequestNos = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.querySelector('td:nth-child(3) b')?.textContent)
    const expectations: Array<[string, string[]]> = [
      ['總清單', ['SQMS-20260823-04', 'SQMS-20260822-03', 'SQMS-20260821-02', 'SQMS-20260820-01']],
      ['待完成', ['SQMS-20260822-03', 'SQMS-20260820-01']],
      ['已完成', ['SQMS-20260823-04', 'SQMS-20260821-02']],
    ]
    for (const [tabName, expected] of expectations) {
      fireEvent.click(screen.getByRole('button', { name: tabName }))
      await waitFor(() => expect(displayedRequestNos()).toEqual(expected))
      expect(within(screen.getByRole('table')).getByRole('button', { name: '編號' }).closest('th')).toHaveAttribute('aria-sort', 'descending')
    }
  })

  it('sorts the shared request table from clickable headers in all three list tabs', async () => {
    localStorage.setItem('sqms-change-requests-v1', JSON.stringify([
      requestFixture({ requestNo: 'SQMS-20260821-03', applicantName: '王三', requestSource: '安全會議', topicCode: 'SMI-03', targetDueDate: '', urgency: 'high', status: 'processing' }),
      requestFixture({ requestNo: 'SQMS-20260821-01', applicantName: '李一', requestSource: '外部檢查', topicCode: 'SMI-01', targetDueDate: '2026-09-01', urgency: 'low', status: 'completed', completionDate: '2026-08-20' }),
      requestFixture({ requestNo: 'SQMS-20260821-02', applicantName: '陳二', requestSource: '內部檢查', topicCode: 'SMI-02', targetDueDate: '2026-08-25', urgency: 'urgent', status: 'new' }),
    ]))
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: '總清單' }))

    const displayedRequestNos = () => within(screen.getByRole('table')).getAllByRole('row').slice(1).map((row) => row.querySelector('td:nth-child(3) b')?.textContent)
    await waitFor(() => expect(displayedRequestNos()).toHaveLength(3))

    const sortableLabels = ['狀態', '急迫度', '編號', '來源', '歸屬', '期望日', '申請人']
    sortableLabels.forEach((label) => expect(within(screen.getByRole('table')).getByRole('button', { name: label })).toBeEnabled())

    const requestNoHeader = within(screen.getByRole('table')).getByRole('button', { name: '編號' })
    fireEvent.click(requestNoHeader)
    expect(requestNoHeader.closest('th')).toHaveAttribute('aria-sort', 'ascending')
    expect(displayedRequestNos()).toEqual(['SQMS-20260821-01', 'SQMS-20260821-02', 'SQMS-20260821-03'])

    fireEvent.click(requestNoHeader)
    expect(requestNoHeader.closest('th')).toHaveAttribute('aria-sort', 'descending')
    expect(displayedRequestNos()).toEqual(['SQMS-20260821-03', 'SQMS-20260821-02', 'SQMS-20260821-01'])

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: '期望日' }))
    expect(displayedRequestNos()).toEqual(['SQMS-20260821-02', 'SQMS-20260821-01', 'SQMS-20260821-03'])

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: '狀態' }))
    expect(displayedRequestNos()).toEqual(['SQMS-20260821-02', 'SQMS-20260821-03', 'SQMS-20260821-01'])
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: '急迫度' }))
    expect(displayedRequestNos()).toEqual(['SQMS-20260821-02', 'SQMS-20260821-03', 'SQMS-20260821-01'])

    for (const label of ['來源', '歸屬', '申請人']) {
      const header = within(screen.getByRole('table')).getByRole('button', { name: label })
      fireEvent.click(header)
      const ascendingOrder = displayedRequestNos()
      fireEvent.click(header)
      expect(displayedRequestNos()).toEqual([...ascendingOrder].reverse())
    }

    for (const tabName of ['待完成', '已完成']) {
      fireEvent.click(screen.getByRole('button', { name: tabName }))
      await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument())
      sortableLabels.forEach((label) => expect(within(screen.getByRole('table')).getByRole('button', { name: label })).toBeEnabled())
    }
  })
})
