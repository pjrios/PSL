import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  appliedSupabaseSchema,
  createSupabaseMigrationSql,
  createSupabaseSetupSql,
  describeSupabaseSchemaChanges,
  isSafePublishableKey,
  importSupabaseSchemaSql,
  loadSupabaseConfig,
  normalizedSupabaseConfig,
  SUPABASE_STORAGE_KEY,
  verifySupabaseTable,
} from './supabase-data'
import type { SupabaseEditorConfig } from './supabase-data'

const config: SupabaseEditorConfig = {
  projectUrl: 'https://school.supabase.co/',
  publishableKey: 'sb_publishable_test_key_123456789',
  tables: [{
    id: 'practices',
    name: 'Practice Items',
    access: 'public_read',
    fields: [
      { id: 'one', name: 'Title', type: 'text' },
      { id: 'two', name: 'Media URL', type: 'media' },
    ],
    relations: [],
  }, {
    id: 'progress',
    name: 'progress',
    access: 'user_owned',
    fields: [
      { id: 'practice-id', name: 'practice_id', type: 'uuid' },
      { id: 'score', name: 'score', type: 'number' },
    ],
    relations: [{
      id: 'progress-practice',
      column: 'practice_id',
      targetTableId: 'practices',
      targetColumn: 'id',
      onDelete: 'cascade',
    }],
  }],
}

describe('Supabase editor data helpers', () => {
  it('generates multiple tables, relationships, indexes, and access-specific RLS', () => {
    const sql = createSupabaseSetupSql(config)

    expect(sql).toContain('create table if not exists public."practice_items"')
    expect(sql).toContain('create table if not exists public."progress"')
    expect(sql).toContain('add column if not exists "title" text')
    expect(sql).toContain('using (published = true)')
    expect(sql).toContain('user_id uuid not null references auth.users(id)')
    expect(sql).toContain('auth.uid()) = user_id')
    expect(sql).toContain('foreign key ("practice_id")')
    expect(sql).toContain('references public."practice_items" ("id")')
  })

  it('normalizes duplicate table and field identifiers', () => {
    const normalized = normalizedSupabaseConfig({
      ...config,
      tables: [config.tables[0], { ...config.tables[0], id: 'duplicate' }],
    })
    expect(normalized.tables).toHaveLength(1)
    expect(normalized.tables[0].name).toBe('practice_items')
  })

  it('repairs incomplete saved collection data instead of crashing the editor', () => {
    const normalized = normalizedSupabaseConfig({
      projectUrl: undefined,
      publishableKey: undefined,
      tables: [{ id: 'legacy', name: 'Legacy Items', access: 'public_read' }],
    } as unknown as SupabaseEditorConfig)

    expect(normalized).toEqual(expect.objectContaining({
      projectUrl: '',
      publishableKey: '',
      tables: [expect.objectContaining({
        id: 'legacy',
        name: 'legacy_items',
        fields: [],
        relations: [],
      })],
    }))
  })

  it('rejects secret keys and accepts current publishable keys', () => {
    expect(isSafePublishableKey('sb_publishable_1234567890')).toBe(true)
    expect(isSafePublishableKey('sb_secret_1234567890')).toBe(false)
    const legacyKey = (role: string) => `header.${btoa(JSON.stringify({ role }))}.signature-padding-1234567890`
    expect(isSafePublishableKey(legacyKey('anon'))).toBe(true)
    expect(isSafePublishableKey(legacyKey('service_role'))).toBe(false)
  })

  it('verifies one public table and all declared columns through the Data API', async () => {
    const request = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    await expect(verifySupabaseTable(config, 'practices', request)).resolves.toEqual({ hasRows: false })

    expect(request).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/practice_items?'),
      { headers: { apikey: config.publishableKey } },
    )
    expect(request.mock.calls[0][0]).toContain('select=id%2Cpublished%2Csort_order%2Ccreated_at%2Ctitle%2Cmedia_url')
  })

  it('does not pretend user-owned tables can be verified without authentication', async () => {
    await expect(verifySupabaseTable(config, 'progress', vi.fn()))
      .rejects.toThrow('Inicia sesión')
  })

  it('verifies user-owned collections with the signed-in access token', async () => {
    const request = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
    await expect(verifySupabaseTable(config, 'progress', request, 'student-token')).resolves.toEqual({ hasRows: false })

    expect(request).toHaveBeenCalledWith(expect.stringContaining('/rest/v1/progress?'), {
      headers: { apikey: config.publishableKey, Authorization: 'Bearer student-token' },
    })
  })

  it('migrates the previous single-table editor configuration', () => {
    const storage = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      removeItem: (key: string) => storage.delete(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    })
    localStorage.setItem(SUPABASE_STORAGE_KEY, JSON.stringify({
      projectUrl: 'https://legacy.supabase.co',
      publishableKey: 'sb_publishable_legacy_key',
      table: 'old_practices',
      fields: [{ id: 'name', name: 'name', type: 'text' }],
    }))

    const migrated = loadSupabaseConfig()
    expect(migrated.tables).toEqual([expect.objectContaining({
      name: 'old_practices',
      fields: [{ id: 'name', name: 'name', type: 'text' }],
    })])
    localStorage.removeItem(SUPABASE_STORAGE_KEY)
    vi.unstubAllGlobals()
  })

  it('generates ALTER TABLE changes from the last verified schema', () => {
    const original = normalizedSupabaseConfig(config).tables[0]
    const verified = appliedSupabaseSchema(original)
    const changed: SupabaseEditorConfig = {
      ...config,
      tables: [{
        ...original,
        name: 'practice_library',
        setupStatus: 'needs_installation',
        verifiedSchema: verified,
        fields: [
          { ...original.fields[0], name: 'practice_title' },
          original.fields[1],
          { id: 'difficulty', name: 'difficulty', type: 'number' },
        ],
      }],
    }

    const sql = createSupabaseMigrationSql(changed, original.id)

    expect(sql).toContain('rename to "practice_library"')
    expect(sql).toContain('rename column "title" to "practice_title"')
    expect(sql).toContain('add column "difficulty" numeric')
    expect(sql).not.toContain('create table if not exists')
  })

  it('labels drops and type conversions as destructive changes', () => {
    const original = normalizedSupabaseConfig(config).tables[0]
    const changed: SupabaseEditorConfig = {
      ...config,
      tables: [{
        ...original,
        verifiedSchema: appliedSupabaseSchema(original),
        fields: [{ ...original.fields[0], type: 'date' }],
      }],
    }

    const changes = describeSupabaseSchemaChanges(changed, original.id)

    expect(changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'type-field:one', destructive: true }),
      expect.objectContaining({ id: 'drop-field:two', destructive: true }),
    ]))
    expect(createSupabaseMigrationSql(changed, original.id)).toContain('-- WARNING:')
  })

  it('uses the full table creation for a table without an applied baseline', () => {
    const changes = describeSupabaseSchemaChanges(config, 'practices')
    expect(changes).toHaveLength(1)
    expect(changes[0]).toEqual(expect.objectContaining({ id: 'create:practices', destructive: false }))
    expect(createSupabaseMigrationSql(config, 'practices')).toContain('create table if not exists public."practice_items"')
  })

  it('imports the real PSL SQL schema into visual collections', () => {
    const sql = readFileSync('examples/supabase/psl-schema.sql', 'utf8')
    const imported = importSupabaseSchemaSql(sql, { ...config, tables: [] })

    expect(imported.tables.map((table) => table.name)).toEqual([
      'profiles',
      'user_roles',
      'practices',
      'practice_attempts',
      'practice_progress',
      'favorite_practices',
    ])
    expect(imported.tables.find((table) => table.name === 'user_roles')?.access).toBe('private')
    expect(imported.tables.find((table) => table.name === 'practices')).toEqual(expect.objectContaining({
      access: 'public_read',
      fields: expect.arrayContaining([
        expect.objectContaining({ name: 'mediapipe_reference', type: 'json' }),
        expect.objectContaining({ name: 'updated_at', type: 'datetime' }),
      ]),
    }))
    expect(imported.tables.find((table) => table.name === 'practice_attempts')?.relations)
      .toEqual(expect.arrayContaining([expect.objectContaining({
        column: 'practice_id',
        targetTableId: 'sql-table-practices',
      })]))
  })
})
