/// <reference types="node" />

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync(new URL('./App.css', import.meta.url), 'utf8')

function ruleBody(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 's'))
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
})
