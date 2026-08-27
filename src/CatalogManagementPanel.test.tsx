/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CatalogManagementPanel from './CatalogManagementPanel'
import type { CatalogLoadResult } from './lib/sharedCatalog'

vi.mock('./lib/supabaseClient', () => ({ supabase: null }))

const initialCatalog = [
  {
    id: 'category-a', code: 'A', nameZh: '大類甲', nameEn: '', sortOrder: 1, active: true,
    topics: [{ id: 'topic-1', code: 'T1', abbreviation: '主題一', titleZh: '主題一', titleEn: '', sortOrder: 1, active: true, items: [{ id: 'item-1', code: 'I1', titleZh: '項目一', titleEn: '', sortOrder: 1, active: true }] }],
  },
  { id: 'category-b', code: 'B', nameZh: '大類乙', nameEn: '', sortOrder: 2, active: true, topics: [] },
]

function Harness({ canManage = true }: { canManage?: boolean }) {
  const [state, setState] = useState<CatalogLoadResult>({ catalog: initialCatalog, source: 'local', writable: true })
  return <CatalogManagementPanel catalogData={state.catalog} requests={[]} canManage={canManage} writable={state.writable} source={state.source} onCatalogUpdated={setState} onRefresh={vi.fn()} />
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(window, 'confirm').mockReturnValue(true)
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CatalogManagementPanel', () => {
  it('adds every level, moves a topic, keeps existing codes immutable, and disables/restores an item', async () => {
    render(<Harness />)

    fireEvent.click(screen.getByRole('button', { name: '新增大類' }))
    let dialog = screen.getByRole('dialog', { name: '新增大類' })
    fireEvent.change(within(dialog).getByLabelText('大類代碼'), { target: { value: 'C' } })
    fireEvent.change(within(dialog).getByLabelText('中文名稱'), { target: { value: '大類丙' } })
    fireEvent.change(within(dialog).getByLabelText('顯示排序'), { target: { value: '0' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存目錄項目' }))
    const createdCategory = await screen.findByRole('button', { name: /C.*大類丙/ })
    expect(createdCategory.closest('article')).toHaveClass('selected')

    fireEvent.click(screen.getByRole('button', { name: /大類乙/ }))
    fireEvent.click(screen.getByRole('button', { name: '新增第一層' }))
    dialog = screen.getByRole('dialog', { name: '新增第一層主題' })
    fireEvent.change(within(dialog).getByLabelText('第一層代碼'), { target: { value: 'T2' } })
    fireEvent.change(within(dialog).getByLabelText('中文名稱'), { target: { value: '主題二' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存目錄項目' }))
    const createdTopic = await screen.findByRole('button', { name: /T2.*主題二/ })
    expect(createdTopic.closest('article')).toHaveClass('selected')

    fireEvent.click(screen.getByRole('button', { name: /T2.*主題二/ }))
    fireEvent.click(screen.getByRole('button', { name: '新增第二層' }))
    dialog = screen.getByRole('dialog', { name: '新增第二層項目' })
    fireEvent.change(within(dialog).getByLabelText('第二層代碼'), { target: { value: 'I2' } })
    fireEvent.change(within(dialog).getByLabelText('中文名稱'), { target: { value: '項目二' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存目錄項目' }))
    expect(await screen.findByText('項目二')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /大類甲/ }))
    fireEvent.click(screen.getByRole('button', { name: '修改第一層主題 T1' }))
    dialog = screen.getByRole('dialog', { name: '修改第一層主題 T1' })
    expect(within(dialog).getByLabelText('第一層代碼')).toBeDisabled()
    fireEvent.change(within(dialog).getByLabelText('上層大類'), { target: { value: 'category-b' } })
    fireEvent.click(within(dialog).getByRole('button', { name: '保存目錄項目' }))
    await waitFor(() => expect(screen.getByRole('button', { name: /大類乙/ })).toHaveClass('catalog-entry-main'))
    expect(screen.getByRole('button', { name: /T1.*主題一/ })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /T1.*主題一/ }))
    fireEvent.click(screen.getByRole('button', { name: '刪除（停用）第二層項目 I1 項目一' }))
    expect(await screen.findByRole('button', { name: '恢復第二層項目 I1 項目一' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '恢復第二層項目 I1 項目一' }))
    expect(await screen.findByRole('button', { name: '刪除（停用）第二層項目 I1 項目一' })).toBeInTheDocument()
  })

  it('is read-only for personnel administrators', () => {
    render(<Harness canManage={false} />)
    expect(screen.getByText(/只有 Owner 或雲端管理員可以修改目錄/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '新增大類' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /修改大類/ })).not.toBeInTheDocument()
  })
})
