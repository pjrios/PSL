import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { ZipProjectExporter } from '../modules/exporter'
import { validateStaticArchive } from '../modules/exporter/validation/validateStaticArchive'
import { buildEditorProjectBundle } from './export-project'
import { defaultSupabaseConfig } from './supabase-data'

describe('new editor project export', () => {
  it('exports every page and preserves button navigation', async () => {
    const bundle = buildEditorProjectBundle([
      {
        id: 'inicio',
        name: 'Inicio',
        html: '<main><button data-psl-flow-action="navigate" data-psl-flow-target="practica">Practicar</button></main>',
        css: 'button { color: teal; }',
      },
      {
        id: 'practica',
        name: 'Práctica',
        html: '<main><h1>Práctica</h1></main>',
      },
    ], 'inicio')

    expect(bundle.manifest.pages).toHaveLength(2)
    expect(bundle.manifest.connections).toEqual([expect.objectContaining({
      sourcePage: 'inicio',
      targetPage: 'practica',
      action: 'navigate',
      elementId: 'inicio::main:1/button:1',
    })])

    const archive = await JSZip.loadAsync(
      await (await new ZipProjectExporter().export(bundle)).arrayBuffer(),
    )
    const home = await archive.file('pages/inicio.html')!.async('string')
    const practice = await archive.file('pages/practica.html')!.async('string')
    const index = await archive.file('index.html')!.async('string')

    expect(home).toContain('data-psl-flow-target="practica"')
    expect(home).toContain('"targetPage":"practica"')
    expect(home).toContain('"practica":"practica.html"')
    expect(home).toContain('src="../psl-runtime/navigation.js"')
    expect(practice).toContain('<h1>Práctica</h1>')
    expect(index).toContain('pages/inicio.html')
  })

  it('ignores connections whose destination page was deleted', () => {
    const bundle = buildEditorProjectBundle([{
      id: 'home',
      name: 'Home',
      html: '<button data-psl-flow-action="navigate" data-psl-flow-target="missing">Open</button>',
    }], 'home')

    expect(bundle.manifest.connections).toEqual([])
  })

  it('exports ordinary navigation when table definitions exist without Supabase credentials', async () => {
    const bundle = buildEditorProjectBundle([
      {
        id: 'inicio',
        name: 'Inicio',
        html: '<button data-psl-flow-action="navigate" data-psl-flow-target="practica">Practicar</button>',
      },
      {
        id: 'practica',
        name: 'Práctica',
        html: '<h1>Práctica</h1>',
      },
    ], 'inicio', 'Sitio sin datos', defaultSupabaseConfig)

    expect(bundle.manifest.dataSources).toBeUndefined()
    expect(bundle.manifest.connections[0].context).toBeUndefined()

    const archive = await new ZipProjectExporter().export(bundle)
    await expect(validateStaticArchive(archive)).resolves.toEqual({ valid: true, errors: [] })
  })

  it('turns an access page into project-wide authentication without requiring a table', () => {
    const bundle = buildEditorProjectBundle([{
      id: 'home',
      name: 'Home',
      html: '<main><h1>Home</h1></main>',
    }, {
      id: 'access',
      name: 'Access',
      html: '<form data-psl-auth-action="login"><input name="email"><input name="password"></form>',
    }], 'home', 'Protected site', {
      projectUrl: 'https://school.supabase.co',
      publishableKey: 'sb_publishable_test_key_123456789',
      tables: [],
    })

    expect(bundle.manifest.authentication).toEqual({
      provider: 'supabase',
      projectUrl: 'https://school.supabase.co',
      publishableKey: 'sb_publishable_test_key_123456789',
      loginPage: 'access',
      afterLoginPage: 'home',
      afterLogoutPage: 'access',
    })
    expect(bundle.manifest.pages).toEqual([
      expect.objectContaining({ id: 'home', access: 'authenticated' }),
      expect.objectContaining({ id: 'access', access: 'guestOnly' }),
    ])
  })

  it('requires Supabase credentials when an access page exists', () => {
    expect(() => buildEditorProjectBundle([{
      id: 'access',
      name: 'Access',
      html: '<form data-psl-auth-action="login"></form>',
    }], 'access')).toThrow(/Conecta Supabase/)
  })

  it('exports Supabase bindings, repeaters, row context, and setup SQL', async () => {
    const bundle = buildEditorProjectBundle([
      {
        id: 'catalog',
        name: 'Catalog',
        html: `<article data-psl-repeater="table-practices" data-psl-flow-action="navigate" data-psl-flow-target="detail">
          <h2 data-psl-data-source="table-practices" data-psl-bind-field="title" data-psl-bind-target="text">Title</h2>
        </article>`,
      },
      {
        id: 'detail',
        name: 'Detail',
        html: '<h1 data-psl-data-source="table-practices" data-psl-bind-field="title" data-psl-bind-target="text">Title</h1>',
      },
    ], 'catalog', 'Data site', {
      projectUrl: 'https://school.supabase.co',
      publishableKey: 'sb_publishable_test_key_123456789',
      tables: [{
        id: 'table-practices',
        name: 'practice_items',
        access: 'public_read',
        fields: [{ id: 'title', name: 'title', type: 'text' }],
        relations: [],
      }, {
        id: 'table-progress',
        name: 'progress',
        access: 'user_owned',
        fields: [{ id: 'score', name: 'score', type: 'number' }],
        relations: [],
      }],
    })

    expect(bundle.manifest.dataSources).toEqual(expect.arrayContaining([expect.objectContaining({
      type: 'supabase',
      table: 'practice_items',
      publishedOnly: true,
    }), expect.objectContaining({
      table: 'progress',
      publishedOnly: false,
      requiresAuth: true,
    })]))
    expect(bundle.manifest.bindings).toHaveLength(2)
    expect(bundle.manifest.repeaters).toHaveLength(1)
    expect(bundle.manifest.connections[0].context?.record.recordId).toBe('$record.id')
    expect(bundle.manifest.connections[0].context?.record.dataSourceId)
      .toBe('supabase-table_practices')
    expect(new TextDecoder().decode(
      bundle.files.find((file) => file.path === 'database/setup.sql')?.bytes,
    )).toContain('enable row level security')
  })

  it('exports a current-user single-row binding independently from repeat mode', () => {
    const bundle = buildEditorProjectBundle([{
      id: 'profile',
      name: 'Profile',
      html: '<h1 data-psl-data-source="profiles-table" data-psl-data-scope="first" data-psl-bind-field="display_name" data-psl-bind-target="text">Name</h1>',
    }], 'profile', 'Profile site', {
      projectUrl: 'https://school.supabase.co',
      publishableKey: 'sb_publishable_test_key_123456789',
      tables: [{
        id: 'profiles-table',
        name: 'profiles',
        access: 'user_owned',
        fields: [{ id: 'name', name: 'display_name', type: 'text' }],
        relations: [],
      }],
    })

    expect(bundle.manifest.repeaters).toBeUndefined()
    expect(bundle.manifest.bindings).toEqual([expect.objectContaining({
      dataSourceId: 'supabase-profiles_table',
      sourceMode: 'first',
      field: 'display_name',
    })])
    expect(bundle.manifest.dataSources?.[0]).toEqual(expect.objectContaining({
      requiresAuth: true,
      table: 'profiles',
    }))
  })
})
