import { describe, expect, it, vi } from 'vitest'
import { executeIdempotentCommand } from './idempotency'

describe('executeIdempotentCommand', () => {
  it('reuses the same operation id when a transient request is retried', async () => {
    const command = vi.fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce('saved')

    const result = await executeIdempotentCommand(command, () => 'operation-1')

    expect(result).toBe('saved')
    expect(command).toHaveBeenNthCalledWith(1, 'operation-1')
    expect(command).toHaveBeenNthCalledWith(2, 'operation-1')
  })

  it('does not retry validation or permission errors', async () => {
    const command = vi.fn().mockRejectedValue(new Error('只有管理員可以刪除需求'))

    await expect(executeIdempotentCommand(command, () => 'operation-2')).rejects.toThrow('只有管理員')
    expect(command).toHaveBeenCalledTimes(1)
  })
})
