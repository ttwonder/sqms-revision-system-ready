/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./App.css', import.meta.url), 'utf8')

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const matches = [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'gs'))]
  const match = matches.at(-1)
  if (!match) throw new Error(`Missing CSS rule: ${selector}`)
  return match[1]
}

function declaration(selector: string, property: string) {
  const body = ruleBody(selector)
  const match = body.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`))
  if (!match) throw new Error(`Missing ${property} declaration in ${selector}`)
  return match[1].trim()
}

function px(value: string) {
  const match = value.match(/^([\d.]+)px$/)
  if (!match) throw new Error(`Expected a pixel value, received: ${value}`)
  return Number(match[1])
}

describe('request table layout', () => {
  it('reserves enough status-column content width for the editable status control', () => {
    const statusColumnWidth = px(declaration('.col-status', 'width'))
    const statusControlMinWidth = px(declaration('.status-select', 'min-width'))
    const paddingParts = declaration('th, td', 'padding').split(/\s+/)
    const horizontalPadding = px(paddingParts[1] ?? paddingParts[0]) * 2

    expect(statusColumnWidth - horizontalPadding).toBeGreaterThanOrEqual(statusControlMinWidth + 4)
  })

  it('reallocates the desktop table so suggestion content is about 1.5 times wider', () => {
    const referenceTableWidth = 1311
    const previousContentWidth = 235
    const fixedColumns = [
      '.col-select',
      '.col-status',
      '.col-urgency',
      '.col-no',
      '.col-source',
      '.col-scope',
      '.col-due',
      '.col-applicant',
      '.col-actions',
    ]
    const fixedWidth = fixedColumns.reduce((total, selector) => total + px(declaration(selector, 'width')), 0)
    const contentWidth = referenceTableWidth - fixedWidth

    expect(declaration('.col-content', 'width')).toBe('auto')
    expect(contentWidth).toBeGreaterThanOrEqual(previousContentWidth * 1.5)
    expect(contentWidth).toBeLessThanOrEqual(previousContentWidth * 1.5 + 1)
    expect(px(declaration('.col-scope', 'width'))).toBeLessThan(220)
    expect(px(declaration('.col-due', 'width'))).toBeLessThan(108)
    expect(px(declaration('.col-applicant', 'width'))).toBeLessThan(100)
    expect(px(declaration('.col-actions', 'width'))).toBeLessThan(164)
    expect(px(declaration('.col-urgency', 'width'))).toBeGreaterThanOrEqual(82)
  })

  it('keeps long source chips and action-button text inside their cells', () => {
    expect(declaration('.source-chip', 'box-sizing')).toBe('border-box')
    expect(declaration('.source-chip', 'white-space')).toBe('normal')
    expect(declaration('.source-chip', 'overflow-wrap')).toBe('anywhere')
    expect(declaration('.sort-header', 'box-sizing')).toBe('border-box')
    expect(declaration('.sort-header', 'white-space')).toBe('normal')
    expect(declaration('.sort-header', 'overflow-wrap')).toBe('anywhere')
    expect(declaration('.request-table .actions button', 'box-sizing')).toBe('border-box')
    expect(declaration('.request-table .actions button', 'max-width')).toBe('100%')
    expect(declaration('.request-table .actions button', 'white-space')).toBe('normal')
    expect(declaration('.request-table .actions button', 'overflow-wrap')).toBe('anywhere')
  })

  it('keeps the top scrollbar track aligned with both table width variants', () => {
    expect(declaration('.table-scrollbar-top', 'overflow-x')).toBe('auto')
    expect(declaration('.table-scrollbar-spacer', 'min-width')).toBe('1160px')
    expect(declaration('.table-scrollbar-spacer.with-selection', 'min-width')).toBe('1204px')
    expect(declaration('.request-table tbody tr[hidden]', 'display')).toBe('table-row !important')
  })

  it('allows the two mobile filter columns to shrink inside the viewport', () => {
    expect(declaration('.filters .search-input, .filters .range-select', 'min-width')).toBe('0')
  })
})
