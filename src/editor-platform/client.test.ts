import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { saveEditorConnection, verifyEditorTable } from './client'

describe('editor platform function errors', () => {
  it('shows the error returned by an Edge Function response', async () => {
    const context = {
      clone: () => context,
      json: vi.fn().mockResolvedValue({ error: 'La secret key pertenece a otro proyecto.' }),
    }
    const client = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: Object.assign(new Error('Edge Function returned a non-2xx status code'), { context }),
        }),
      },
    } as unknown as SupabaseClient

    await expect(saveEditorConnection({
      editorProjectId: 'project-id',
      projectUrl: 'https://example.supabase.co',
      publishableKey: 'sb_publishable_example',
      secretKey: 'sb_secret_example',
    }, client)).rejects.toThrow('La secret key pertenece a otro proyecto.')
  })

  it('checks a table through the saved private editor connection', async () => {
    const invoke = vi.fn().mockResolvedValue({ data: { hasRows: true }, error: null })
    const client = { functions: { invoke } } as unknown as SupabaseClient

    await expect(verifyEditorTable({
      columns: ['id', 'user_id', 'display_name'],
      editorProjectId: 'project-id',
      tableName: 'profiles',
    }, client)).resolves.toEqual({ hasRows: true })
    expect(invoke).toHaveBeenCalledWith('manage-editor-connection', {
      body: {
        action: 'verify-table',
        columns: ['id', 'user_id', 'display_name'],
        editorProjectId: 'project-id',
        tableName: 'profiles',
      },
    })
  })
})
