import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

const editorSupabaseUrl = import.meta.env.VITE_EDITOR_SUPABASE_URL?.trim() ?? ''
const editorSupabasePublishableKey = import.meta.env.VITE_EDITOR_SUPABASE_PUBLISHABLE_KEY?.trim() ?? ''

export const editorPlatformConfigured = /^https:\/\//.test(editorSupabaseUrl)
  && editorSupabasePublishableKey.startsWith('sb_publishable_')

export const editorSupabase = editorPlatformConfigured
  ? createClient(editorSupabaseUrl, editorSupabasePublishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
    })
  : null

export interface EditorProjectRecord {
  id: string
  name: string
  owner_id: string
  project_data: Record<string, unknown>
}

export interface EditorConnectionRecord {
  editor_project_id: string
  project_ref: string
  project_url: string
  publishable_key: string
  secret_hint: string
  verified_at: string | null
}

export interface EditorProjectData {
  grapesjs?: Record<string, unknown>
  supabaseConfig?: Record<string, unknown>
}

function requiredClient(client: SupabaseClient | null = editorSupabase) {
  if (!client) throw new Error('Configura las variables VITE_EDITOR_SUPABASE_URL y VITE_EDITOR_SUPABASE_PUBLISHABLE_KEY.')
  return client
}

async function functionError(error: unknown) {
  const context = (error as { context?: { clone?: () => unknown; json?: () => Promise<unknown> } } | null)?.context
  if (context) {
    try {
      const readable = typeof context.clone === 'function' ? context.clone() : context
      const detail = typeof (readable as { json?: unknown }).json === 'function'
        ? await (readable as { json: () => Promise<unknown> }).json()
        : readable
      if (detail && typeof detail === 'object') {
        const message = (detail as { error?: unknown; message?: unknown }).error
          ?? (detail as { message?: unknown }).message
        if (typeof message === 'string' && message.trim()) return new Error(message)
      }
    } catch {
      // Fall back to the SDK message when the response is not JSON.
    }
  }
  return error instanceof Error ? error : new Error('La función segura no pudo completar la solicitud.')
}

export async function ensureEditorProject(userId: string, client: SupabaseClient | null = editorSupabase) {
  const supabase = requiredClient(client)
  const { data: existing, error: readError } = await supabase
    .from('editor_projects')
    .select('id,name,owner_id,project_data')
    .eq('owner_id', userId)
    .order('last_opened_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (readError) throw readError
  if (existing) return existing as EditorProjectRecord

  const { data: created, error: createError } = await supabase
    .from('editor_projects')
    .insert({ owner_id: userId, name: 'Mi primer sitio' })
    .select('id,name,owner_id,project_data')
    .single()
  if (createError) throw createError
  return created as EditorProjectRecord
}

export async function readEditorConnection(editorProjectId: string, client: SupabaseClient | null = editorSupabase) {
  const supabase = requiredClient(client)
  const { data, error } = await supabase
    .from('editor_supabase_connections')
    .select('editor_project_id,project_ref,project_url,publishable_key,secret_hint,verified_at')
    .eq('editor_project_id', editorProjectId)
    .maybeSingle()
  if (error) throw error
  return data as EditorConnectionRecord | null
}

export async function loadEditorProjectData(editorProjectId: string, client: SupabaseClient | null = editorSupabase) {
  const supabase = requiredClient(client)
  const { data, error } = await supabase
    .from('editor_projects')
    .select('project_data')
    .eq('id', editorProjectId)
    .single()
  if (error) throw error
  return (data.project_data ?? {}) as EditorProjectData
}

export async function saveEditorProjectData(editorProjectId: string, projectData: EditorProjectData, client: SupabaseClient | null = editorSupabase) {
  const supabase = requiredClient(client)
  const { error } = await supabase
    .from('editor_projects')
    .update({ project_data: projectData, last_opened_at: new Date().toISOString() })
    .eq('id', editorProjectId)
  if (error) throw error
}

export async function saveEditorConnection(input: {
  editorProjectId: string
  projectUrl: string
  publishableKey: string
  secretKey: string
}, client: SupabaseClient | null = editorSupabase) {
  const supabase = requiredClient(client)
  const { data, error } = await supabase.functions.invoke('manage-editor-connection', {
    body: { action: 'save', ...input },
  })
  if (error) throw await functionError(error)
  return data as { connection: EditorConnectionRecord }
}

export async function verifyEditorTable(input: {
  columns: string[]
  editorProjectId: string
  tableName: string
}, client: SupabaseClient | null = editorSupabase) {
  const supabase = requiredClient(client)
  const { data, error } = await supabase.functions.invoke('manage-editor-connection', {
    body: { action: 'verify-table', ...input },
  })
  if (error) throw await functionError(error)
  return data as { hasRows: boolean }
}

export async function removeEditorConnection(editorProjectId: string, client: SupabaseClient | null = editorSupabase) {
  const supabase = requiredClient(client)
  const { error } = await supabase.functions.invoke('manage-editor-connection', {
    body: { action: 'delete', editorProjectId },
  })
  if (error) throw await functionError(error)
}
