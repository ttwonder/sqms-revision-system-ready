import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_REQUEST_SOURCES, normalizeRequestSources } from './requestSources'
import { loadSharedRequestSources } from './sharedRequestSources'

vi.mock('./supabaseClient', () => ({ isCloudConfigured: false, supabase: null }))

describe('request source options', () => {
  it('provides the requested default source options', () => {
    expect(DEFAULT_REQUEST_SOURCES).toEqual([
      '外部檢查',
      '內部檢查',
      'Master Review',
      '安全會議',
      'MOC需求',
      '法規/外部信息要求',
      '事故/事件',
    ])
  })

  it('normalizes custom source options and keeps defaults when empty', () => {
    expect(normalizeRequestSources(['外部檢查', ' 外部檢查 ', '', '船隊要求'])).toEqual(['外部檢查', '船隊要求'])
    expect(normalizeRequestSources([])).toEqual(DEFAULT_REQUEST_SOURCES)
  })

  it('keeps locally saved custom options when Supabase is not configured', async () => {
    const values = new Map<string, string>()
    values.set('sqms-request-source-options-v1', JSON.stringify(['外部檢查', '自訂來源']))
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    })

    await expect(loadSharedRequestSources()).resolves.toEqual(['外部檢查', '自訂來源'])
  })
})
