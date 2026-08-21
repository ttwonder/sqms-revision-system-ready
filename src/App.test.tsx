/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

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
  })

  afterEach(() => {
    cleanup()
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
})
