export const DEFAULT_REQUEST_SOURCES = [
  '外部檢查',
  '內部檢查',
  'Master Review',
  '安全會議',
  'MOC需求',
  '法規/外部信息要求',
  '事故/事件',
] as const

export type RequestSource = typeof DEFAULT_REQUEST_SOURCES[number] | string

const LOCAL_SOURCES_KEY = 'sqms-request-source-options-v1'

export function normalizeRequestSources(values: string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const clean = (values ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item) => {
      if (seen.has(item)) return false
      seen.add(item)
      return true
    })
  return clean.length ? clean : [...DEFAULT_REQUEST_SOURCES]
}

export function loadRequestSourceOptions(): string[] {
  try {
    const raw = localStorage.getItem(LOCAL_SOURCES_KEY)
    return normalizeRequestSources(raw ? JSON.parse(raw) : DEFAULT_REQUEST_SOURCES)
  } catch {
    return [...DEFAULT_REQUEST_SOURCES]
  }
}

export function saveRequestSourceOptions(options: string[]) {
  localStorage.setItem(LOCAL_SOURCES_KEY, JSON.stringify(normalizeRequestSources(options)))
}
