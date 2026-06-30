import { describe, expect, it } from 'vitest'
import { DEFAULT_REQUEST_SOURCES, normalizeRequestSources } from './requestSources'

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
})
