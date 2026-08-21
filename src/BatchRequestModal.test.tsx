/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import BatchRequestModal from './BatchRequestModal'
import { createBlankRequest } from './lib/storage'

afterEach(cleanup)

function fillRequiredFields(container: HTMLElement, suffix: string) {
  fireEvent.change(within(container).getByLabelText('申請人 *'), { target: { value: `申請人${suffix}` } })
  fireEvent.change(within(container).getByLabelText('需改的建議內容或方向 *'), { target: { value: `建議${suffix}` } })
  fireEvent.change(within(container).getByLabelText('需要修改的理由或依據 *'), { target: { value: `理由${suffix}` } })
}

describe('BatchRequestModal', () => {
  it('keeps a failed item and retries it without resubmitting an acknowledged item', async () => {
    let sequence = 0
    const createRequest = () => createBlankRequest(++sequence)
    const onSave = vi.fn()
      .mockImplementationOnce(async (request) => ({ ...request, requestNo: 'SQMS-20260821-01', revision: 1 }))
      .mockRejectedValueOnce(new Error('暫時無法連線'))
      .mockImplementationOnce(async (request) => ({ ...request, requestNo: 'SQMS-20260821-02', revision: 1 }))
    const onComplete = vi.fn()

    render(<BatchRequestModal
      requestSourceOptions={['外部檢查']}
      createRequest={createRequest}
      onSave={onSave}
      onCancel={vi.fn()}
      onComplete={onComplete}
    />)

    const dialog = screen.getByRole('dialog', { name: '批量增加需求' })
    fireEvent.click(within(dialog).getByRole('button', { name: '添加需求' }))
    const requestOne = within(dialog).getByRole('region', { name: '需求 1' })
    const requestTwo = within(dialog).getByRole('region', { name: '需求 2' })
    fillRequiredFields(requestOne, '一')
    fillRequiredFields(requestTwo, '二')

    fireEvent.click(within(dialog).getByRole('button', { name: '批量保存 2 筆需求' }))

    expect(await within(dialog).findByText(/部分完成：已保存 1 筆，1 筆未成功/)).toBeInTheDocument()
    expect(within(requestOne).getByText(/已保存 SQMS-20260821-01/)).toBeInTheDocument()
    expect(onSave).toHaveBeenCalledTimes(2)
    expect(onComplete).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: '批量保存 1 筆需求' }))

    await waitFor(() => expect(onComplete).toHaveBeenCalledTimes(1))
    expect(onSave).toHaveBeenCalledTimes(3)
    expect(onComplete.mock.calls[0][0]).toHaveLength(2)
  })
})
