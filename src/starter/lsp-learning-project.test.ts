import grapesjs from 'grapesjs'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ZipProjectExporter } from '../modules/exporter'
import { validateStaticArchive } from '../modules/exporter/validation/validateStaticArchive'
import { buildEditorProjectBundle } from '../editor/export-project'
import { applyEditorPreviewAction, createEditorPreviewSession } from '../editor/editor-preview-session'
import {
  lspStarterCss,
  lspStarterPages,
  lspStarterSupabaseConfig,
  installLspStarterProject,
} from './lsp-learning-project'

describe('native LSP learning starter', () => {
  it('loads as editable GrapesJS Pages with editor-managed responsive styles', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({
      container,
      headless: true,
      pageManager: { pages: lspStarterPages.map((page) => ({
        id: page.id,
        name: page.name,
        component: page.component,
      })) },
      style: lspStarterCss,
    })

    const savedProject = editor.getProjectData()
    editor.loadProjectData(savedProject)

    if (process.env.LSP_WRITE_ARTIFACTS === '1') {
      const output = path.join(process.cwd(), 'examples/lsp-learning-grapesjs')
      mkdirSync(output, { recursive: true })
      writeFileSync(path.join(output, 'starter-project.json'), JSON.stringify({
        grapesjs: savedProject,
        supabaseConfig: lspStarterSupabaseConfig,
      }, null, 2))
    }

    expect(editor.Pages.getAll().map((page) => page.getId())).toEqual([
      'bienvenida', 'inicio', 'catalogo', 'detalle', 'resultados', 'progreso',
      'perfil', 'gestion', 'editor-practica',
    ])
    const catalog = editor.Pages.get('catalogo')?.getMainComponent()
    const home = editor.Pages.get('inicio')?.getMainComponent()
    const progress = editor.Pages.get('progreso')?.getMainComponent()
    const practice = editor.Pages.get('detalle')?.getMainComponent()
    const profile = editor.Pages.get('perfil')?.getMainComponent()
    const creator = editor.Pages.get('gestion')?.getMainComponent()
    const practiceEditor = editor.Pages.get('editor-practica')?.getMainComponent()
    expect(editor.getHtml({ component: catalog })).toContain('data-psl-repeater="table-practices"')
    expect(editor.getHtml({ component: catalog })).toContain('data-psl-empty-message="Todavía no hay prácticas disponibles."')
    expect(editor.getHtml({ component: catalog })).not.toContain('catalog-tools')
    expect(editor.getHtml({ component: catalog })).not.toContain('Medio de referencia pendiente')
    expect(editor.getHtml({ component: catalog })).toContain('data-psl-role-visible="teacher"')
    expect(editor.getHtml({ component: home })).toContain('data-psl-page-size="1"')
    expect(editor.getHtml({ component: home })).toContain('Todavía no tienes actividad')
    expect(editor.getHtml({ component: home })).toContain('¡Bienvenido,')
    expect(editor.getHtml({ component: home })).not.toContain('Resumen semanal')
    expect(editor.getHtml({ component: progress })).toContain('Todavía no has comenzado una práctica.')
    expect(editor.getHtml({ component: progress })).not.toContain('92%')
    expect(editor.getHtml({ component: progress })).not.toContain('table-like')
    expect(editor.getHtml({ component: practice })).toContain('data-motion-activity="true"')
    expect(editor.getHtml({ component: practice })).toContain('Vista espejo')
    expect(editor.getHtml({ component: profile })).toContain('data-psl-mutation-source="profiles"')
    expect(editor.getHtml({ component: profile })).toContain('data-psl-mutation-field')
    expect(editor.getHtml({ component: profile })).toContain('data-psl-auth-action="logout"')
    expect(editor.getHtml({ component: profile })).toContain('aria-label="Cerrar sesión"')
    expect(editor.getHtml({ component: profile })).not.toContain('name="avatar_url"')
    expect(editor.getHtml({ component: profile })).not.toContain('URL de la foto')
    expect(editor.getHtml({ component: profile })).not.toContain('Preferencias')
    expect(editor.getHtml({ component: profile })).not.toContain('signout-row')
    expect(editor.getHtml({ component: profile })).not.toContain('Prototipo visual')
    expect(editor.getHtml({ component: creator })).toContain('Mis prácticas')
    expect(editor.getHtml({ component: creator })).toContain('data-psl-user-filter-column="created_by"')
    expect(editor.getHtml({ component: creator })).toContain('data-psl-include-unpublished="true"')
    expect(editor.getHtml({ component: creator })).not.toContain('catalog-tools')
    expect(editor.getHtml({ component: creator })).not.toContain('Archivar')
    expect(editor.getHtml({ component: practiceEditor })).toContain('Nueva práctica')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-psl-mutation-mode="context"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-psl-mutation-filter="id"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-psl-bind-target="value"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-practice-wizard')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-practice-step="details"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-practice-step="reference"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-practice-next')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('data-practice-back')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('← Mis prácticas')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-activity="true"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('movement-reference-required')
    expect(editor.getHtml({ component: practiceEditor })).toContain('Requerida')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-face="true"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-duration="10000"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-stop')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-replay')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-file')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-segment-start')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-crop-edit')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-crop-box')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-crop-handle="top"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-crop-handle="right"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-crop-handle="bottom"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-crop-handle="left"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-required-hand')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-stage-editor')
    expect(editor.getHtml({ component: practiceEditor })).toContain('Agregar momento')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-source-mode="existing"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-source-mode="camera"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-source-mode="video"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('desde la perspectiva de quien realiza la seña')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-motion-segment-end')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('Opcional')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('teacher-banner')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('URL del video')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('practice-topic')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('media-placeholder')
    expect(editor.getHtml({ component: practiceEditor })).toContain('data-psl-mutation-source="practices"')
    expect(editor.getHtml({ component: practiceEditor })).toContain('name="mediapipe_reference"')
    expect(editor.getHtml({ component: practiceEditor })).not.toContain('El guardado aún no está conectado.')
    expect(catalog?.components().length).toBeGreaterThan(0)
    expect(lspStarterCss).toContain('@media(max-width:900px)')
    expect(lspStarterCss).toContain('@media(max-width:767px)')
    expect(lspStarterCss).toContain('@media(prefers-reduced-motion:reduce)')
    expect(lspStarterCss).toContain('.motion-input__icon svg{width:1.7rem;height:1.7rem}')
    expect(lspStarterCss).toContain('.motion-input__placeholder[hidden]{display:none}')
    expect(lspStarterCss).toContain('[data-motion-stop][hidden]{display:none}')
    expect(lspStarterCss).toContain('[data-motion-replay][hidden]{display:none}')
    expect(lspStarterCss).toContain('.motion-input video,.motion-input canvas{position:absolute;inset:0;width:100%;height:100%}')
    expect(lspStarterCss).toContain('.motion-input.is-mirrored video,.motion-input.is-mirrored canvas{transform:scaleX(-1)}')
    expect(lspStarterCss).toContain('.reference-stage video,.reference-stage canvas{position:absolute;inset:0;width:100%;height:100%;transform:scaleX(-1)}')
    expect(lspStarterCss).not.toContain('.movement-reference-required .motion-input video,.movement-reference-required .motion-input canvas{transform:scaleX(-1)}')
    expect(lspStarterCss).toContain('aspect-ratio:16/9')

    editor.destroy()
    container.remove()
  })

  it('uses exactly the six canonical tables without invented topic, instructions, or archive fields', () => {
    expect(lspStarterSupabaseConfig.tables.map((table) => table.name)).toEqual([
      'profiles', 'user_roles', 'practices', 'practice_attempts',
      'practice_progress', 'favorite_practices',
    ])
    const practiceFields = lspStarterSupabaseConfig.tables
      .find((table) => table.name === 'practices')?.fields.map((field) => field.name)
    expect(practiceFields).toContain('description')
    expect(practiceFields).not.toContain('topic')
    expect(practiceFields).not.toContain('instructions')
    expect(practiceFields).not.toContain('archived')
  })

  it('can be opened explicitly inside an existing editor project', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({
      container,
      headless: true,
      pageManager: { pages: [{ id: 'old-page', name: 'Old page', component: '<main>Old</main>' }] },
      style: '.old-page{color:red}',
    })

    const projectData = installLspStarterProject(editor)

    expect(editor.Pages.get('old-page')).toBeUndefined()
    expect(editor.Pages.getAll()).toHaveLength(9)
    expect(editor.Pages.getSelected()?.getId()).toBe('bienvenida')
    expect(JSON.stringify(projectData)).toContain('Elige una actividad de Lengua de Señas Panameña')
    expect(editor.getCss()).not.toContain('.old-page')

    editor.destroy()
    container.remove()
  })

  it('exports auth, Flow, repeaters, bindings, and motion through the shared runtime', async () => {
    const bundle = buildEditorProjectBundle(
      lspStarterPages.map((page) => ({
        id: page.id,
        name: page.name,
        html: page.component,
        css: lspStarterCss,
      })),
      'bienvenida',
      'Aprende LSP',
      lspStarterSupabaseConfig,
    )

    expect(bundle.manifest.pages).toHaveLength(9)
    expect(bundle.manifest.authentication).toEqual(expect.objectContaining({
      loginPage: 'bienvenida',
      afterLoginPage: 'inicio',
      afterLogoutPage: 'bienvenida',
    }))
    expect(bundle.manifest.pages.find((page) => page.id === 'bienvenida')?.access).toBe('guestOnly')
    expect(bundle.manifest.pages.find((page) => page.id === 'catalogo')?.access).toBe('authenticated')
    expect(bundle.manifest.connections.some((connection) =>
      connection.sourcePage === 'catalogo' && connection.targetPage === 'detalle')).toBe(true)
    expect(bundle.manifest.connections.some((connection) => connection.context?.record)).toBe(true)
    expect(bundle.manifest.repeaters?.length).toBeGreaterThanOrEqual(5)
    expect(bundle.manifest.repeaters?.find((repeater) => repeater.pageId === 'inicio'))
      .toEqual(expect.objectContaining({
        pageSize: 1,
        emptyMessage: 'Todavía no tienes actividad. Revisa el catálogo para comenzar.',
      }))
    expect(bundle.manifest.repeaters?.find((repeater) => repeater.pageId === 'gestion'))
      .toEqual(expect.objectContaining({
        userFilterColumn: 'created_by',
        includeUnpublished: true,
        pageSize: 12,
      }))
    expect(bundle.manifest.dataSources?.find((source) => source.name === 'practice_attempts'))
      .toEqual(expect.objectContaining({ orderColumn: 'created_at', orderDirection: 'desc' }))
    expect(bundle.manifest.dataSources?.find((source) => source.name === 'user_roles'))
      .toEqual(expect.objectContaining({ requiresAuth: true }))
    expect(bundle.manifest.bindings?.length).toBeGreaterThan(20)
    expect(bundle.manifest.motionActivities).toHaveLength(2)
    expect(bundle.manifest.motionActivities?.find((activity) => activity.pageId === 'detalle'))
      .toEqual(expect.objectContaining({ mode: 'compare', persistence: expect.any(Object) }))
    expect(bundle.manifest.pages.some((page) => page.id === 'preparacion')).toBe(false)
    expect(bundle.manifest.pages.some((page) => page.id === 'practica')).toBe(false)

    const archive = await new ZipProjectExporter().export(bundle)
    await expect(validateStaticArchive(archive)).resolves.toEqual(expect.objectContaining({ valid: true }))
    if (process.env.LSP_WRITE_ARTIFACTS === '1') {
      const output = path.join(process.cwd(), 'examples/lsp-learning-grapesjs')
      mkdirSync(output, { recursive: true })
      writeFileSync(path.join(output, 'aprende-lsp-static.zip'), Buffer.from(await archive.arrayBuffer()))
    }

    let session = createEditorPreviewSession(bundle, 'catalogo')
    session = applyEditorPreviewAction(session, {
      source: 'psl-navigation-runtime',
      action: 'navigate',
      targetPage: 'detalle',
      context: { record: {
        dataSourceId: 'supabase-table_practices',
        recordId: '00000000-0000-4000-8000-000000000101',
      } },
    }).session
    for (const targetPage of ['resultados', 'progreso']) {
      session = applyEditorPreviewAction(session, {
        source: 'psl-navigation-runtime',
        action: 'navigate',
        targetPage,
      }).session
    }
    expect(session.pageId).toBe('progreso')
    expect(session.context).toEqual({ record: {
      dataSourceId: 'supabase-table_practices',
      recordId: '00000000-0000-4000-8000-000000000101',
    } })
  })
})
