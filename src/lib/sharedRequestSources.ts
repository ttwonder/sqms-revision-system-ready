import { ensureCloudSession } from './cloudSession'
import { loadRequestSourceOptions, normalizeRequestSources, saveRequestSourceOptions } from './requestSources'
import { isCloudConfigured, supabase } from './supabaseClient'

type RpcResult = {
  data: unknown
  error: { message: string } | null
}

export async function loadSharedRequestSources(): Promise<string[]> {
  if (!isCloudConfigured || !supabase) return loadRequestSourceOptions()

  const { data, error } = await supabase
    .from('request_sources')
    .select('name')
    .eq('active', true)
    .order('sort_order')
    .order('name')

  if (error) throw new Error(error.message)
  const options = normalizeRequestSources((data ?? []).map((row) => row.name))
  saveRequestSourceOptions(options)
  return options
}

export async function addSharedRequestSource(name: string): Promise<string[]> {
  const value = name.trim()
  if (!value) return loadSharedRequestSources()
  if (!isCloudConfigured || !supabase) {
    const options = normalizeRequestSources([...loadRequestSourceOptions(), value])
    saveRequestSourceOptions(options)
    return options
  }

  await ensureCloudSession(supabase)
  const { error } = await supabase.rpc('add_request_source', { p_name: value }) as RpcResult
  if (error) throw new Error(error.message)
  return loadSharedRequestSources()
}

export async function removeSharedRequestSource(name: string): Promise<string[]> {
  if (!isCloudConfigured || !supabase) {
    const options = normalizeRequestSources(loadRequestSourceOptions().filter((item) => item !== name))
    saveRequestSourceOptions(options)
    return options
  }

  await ensureCloudSession(supabase)
  const { error } = await supabase.rpc('remove_request_source', { p_name: name }) as RpcResult
  if (error) throw new Error(error.message)
  return loadSharedRequestSources()
}
