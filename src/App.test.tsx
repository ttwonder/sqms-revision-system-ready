/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
})
