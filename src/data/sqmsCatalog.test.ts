import { describe, expect, it } from 'vitest'
import { catalog, getTopicOptions, getManualItemOptions } from './sqmsCatalog'

describe('SQMS 目錄層級', () => {
  it('第一層主題是 SMM/SMP/SMI 的第幾個主題，第二層是該主題下的手冊/文件項', () => {
    expect(catalog.some((category) => category.code === 'SMM')).toBe(true)
    expect(catalog.some((category) => category.code === 'SMP')).toBe(true)
    expect(catalog.some((category) => category.code === 'SMI')).toBe(true)

    const smiTopics = getTopicOptions('SMI')
    expect(smiTopics.some((topic) => topic.code === 'SMI-01')).toBe(true)
    expect(smiTopics.some((topic) => topic.code === 'SMI-05')).toBe(true)

    const smi01Items = getManualItemOptions('SMI-01')
    expect(smi01Items.length).toBeGreaterThan(5)
    expect(smi01Items.some((item) => item.code.includes('SHM-001') || item.titleZh.includes('有害物質'))).toBe(true)
  })
})
