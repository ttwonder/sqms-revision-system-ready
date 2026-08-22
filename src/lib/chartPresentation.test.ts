import { describe, expect, it } from 'vitest'
import { buildTopicChartData, pieNameValueLabel } from './chartPresentation'

describe('dashboard chart presentation', () => {
  it('uses document abbreviations instead of SMI/SMP topic numbers', () => {
    expect(buildTopicChartData({
      'SMI-05': 5,
      'SMI-03': 1,
      'SMP-08': 4,
    })).toEqual([
      { name: 'SWO', fullName: 'SMI-05｜SWO｜船舶當值及操作程序須知', value: 5 },
      { name: 'SAR', fullName: 'SMP-08｜SAR｜船舶稽查和複查程序', value: 4 },
      { name: 'PTW', fullName: 'SMI-03｜PTW｜工作許可制度須知', value: 1 },
    ])
  })

  it('renders pie labels as name plus numeric count', () => {
    expect(pieNameValueLabel({ name: '外部檢查', value: 12 })).toBe('外部檢查 12')
    expect(pieNameValueLabel({ name: 'SMI', value: 8 })).toBe('SMI 8')
  })
})
