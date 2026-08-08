import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ChangeRequest } from '../types'
import { RequestGateway } from './requestGateway'

const operationId = '11111111-1111-4111-8111-111111111111'

const draft: ChangeRequest = {
  id: 'client-draft-id',
  requestNo: 'SQMS-CLIENT-GUESSED',
  applicantName: '王大明',
  requestSource: '外部檢查',
  categoryCode: 'SMI',
  topicCode: 'SMI-01',
  manualItemCode: '',
  scopeNote: '',
  suggestedChange: '更新內容',
  changeReason: '法規更新',
  targetDueDate: '2026-08-20',
  urgency: 'medium',
  needRelatedFormUpdate: false,
  referenceMaterials: '',
  remarks: '',
  status: 'new',
  createdAt: '',
  updatedAt: '',
  revision: 0,
  isDeleted: false,
}

const savedRow = {
  id: 'server-id',
  request_no: 'SQMS-20260808-01',
  applicant_name: '王大明',
  request_source: '外部檢查',
  category_code: 'SMI',
  topic_code: 'SMI-01',
  manual_item_code: '',
  scope_note: '',
  suggested_change: '更新內容',
  change_reason: '法規更新',
  target_due_date: '2026-08-20',
  urgency: 'medium',
  need_related_form_update: false,
  reference_materials: '',
  remarks: '',
  status: 'new',
  completion_date: null,
  public_edit_note: '',
  created_at: '2026-08-08T00:00:00.000Z',
  updated_at: '2026-08-08T00:00:00.000Z',
  revision: 1,
  deleted_at: null,
  deleted_by: null,
}

describe('RequestGateway', () => {
  it('creates through one idempotent server command without sending a client request number', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: savedRow, error: null })
    const gateway = new RequestGateway({ rpc } as unknown as SupabaseClient)

    const saved = await gateway.create(draft, operationId)

    expect(rpc).toHaveBeenCalledWith('create_change_request', {
      p_operation_id: operationId,
      p_payload: expect.not.objectContaining({ request_no: expect.anything() }),
    })
    expect(rpc.mock.calls[0][1].p_payload).toMatchObject({
      applicant_name: '王大明',
      suggested_change: '更新內容',
      change_reason: '法規更新',
    })
    expect(saved.requestNo).toBe('SQMS-20260808-01')
    expect(saved.revision).toBe(1)
  })

  it('patches only the changed fields with the editor base revision', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...savedRow, remarks: '新的備註', revision: 4 },
      error: null,
    })
    const gateway = new RequestGateway({ rpc } as unknown as SupabaseClient)

    const saved = await gateway.patch('server-id', 3, { remarks: ' 新的備註 ' }, operationId)

    expect(rpc).toHaveBeenCalledWith('patch_change_request', {
      p_operation_id: operationId,
      p_request_id: 'server-id',
      p_base_revision: 3,
      p_patch: { remarks: '新的備註' },
    })
    expect(saved.remarks).toBe('新的備註')
    expect(saved.revision).toBe(4)
  })

  it('uses a dedicated idempotent command for lifecycle transitions', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...savedRow, status: 'completed', completion_date: '2026-08-08', revision: 2 },
      error: null,
    })
    const gateway = new RequestGateway({ rpc } as unknown as SupabaseClient)

    const saved = await gateway.transitionStatus(
      'server-id',
      'completed',
      '2026-08-08',
      operationId,
    )

    expect(rpc).toHaveBeenCalledWith('transition_change_request_status', {
      p_operation_id: operationId,
      p_request_id: 'server-id',
      p_status: 'completed',
      p_completion_date: '2026-08-08',
    })
    expect(saved.status).toBe('completed')
    expect(saved.completionDate).toBe('2026-08-08')
  })

  it('soft deletes without accepting a client-supplied actor identity', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        ...savedRow,
        revision: 2,
        deleted_at: '2026-08-08T02:00:00.000Z',
        deleted_by: '管理組 / 王大明',
      },
      error: null,
    })
    const gateway = new RequestGateway({ rpc } as unknown as SupabaseClient)

    const saved = await gateway.softDelete('server-id', operationId)

    expect(rpc).toHaveBeenCalledWith('soft_delete_change_request', {
      p_operation_id: operationId,
      p_request_id: 'server-id',
    })
    expect(saved.isDeleted).toBe(true)
  })
})
