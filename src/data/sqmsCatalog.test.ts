import { describe, expect, it } from 'vitest'
import { catalog, getTopicOptions, getManualItemOptions, getTopicAbbreviation, getTopicDisplayLabel } from './sqmsCatalog'

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

  it('adds a stable document abbreviation to every first-level topic label', () => {
    expect(getTopicAbbreviation('SMI-03')).toBe('PTW')
    expect(getTopicDisplayLabel('SMI-03')).toBe('SMI-03｜PTW｜工作許可制度須知')
    expect(getTopicAbbreviation('SMP-07')).toBe('HSER')
    expect(getTopicDisplayLabel('SMP-07')).toBe('SMP-07｜HSER｜人員職業健康安全、環境安全、風險管控程序')
    expect(getTopicAbbreviation('SMI-09')).toBe('SMI')

    for (const category of catalog) {
      for (const topic of category.topics) {
        const abbreviation = getTopicAbbreviation(topic.code)
        expect(abbreviation).toMatch(/^[A-Z]+$/)
        expect(getTopicDisplayLabel(topic.code)).toBe(`${topic.code}｜${abbreviation}｜${topic.titleZh}`)
      }
    }
  })
})
