import type { Editor } from 'grapesjs'
import type {
  DataBinding,
  DataRepeater,
  ProjectBundle,
  ProjectConnection,
  ProjectFile,
  MotionActivity,
} from '../core/project'
import { zipProjectExporter } from '../modules/exporter'
import { createStableElementId } from '../modules/preview'
import { validateStaticArchive } from '../modules/exporter/validation/validateStaticArchive'
import { FLOW_ACTION_ATTRIBUTE, FLOW_TARGET_ATTRIBUTE } from './flow-connections'
import {
  createSupabaseSetupSql,
  DATA_BIND_FIELD_ATTRIBUTE,
  DATA_BIND_TARGET_ATTRIBUTE,
  DATA_SOURCE_ATTRIBUTE,
  DATA_REPEATER_ATTRIBUTE,
  DATA_SCOPE_ATTRIBUTE,
  isSafePublishableKey,
  normalizedSupabaseConfig,
  supabaseDataSourceId,
} from './supabase-data'
import type { SupabaseEditorConfig } from './supabase-data'
import {
  DATA_COMPONENT_ATTRIBUTE,
  DATA_PAGE_SIZE_ATTRIBUTE,
  DATA_PAGINATION_ATTRIBUTE,
  dataComponentStyles,
} from './data-component-templates'
import { readMotionActivities } from './motion-analysis'

const encoder = new TextEncoder()

export interface EditorExportPage {
  css?: string
  html: string
  id: string
  js?: string
  name: string
}

function safePageSlug(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'pagina'
}

function safeFilename(value: string) {
  return `${safePageSlug(value || 'sitio-web')}.zip`
}

function escapeStyleContent(value: string) {
  return value.replace(/<\/style/gi, '<\\/style')
}

function escapeScriptContent(value: string) {
  return value.replace(/<\/script/gi, '<\\/script')
}

function pageDocument(page: EditorExportPage) {
  const parsed = new DOMParser().parseFromString(page.html, 'text/html')
  const bodyMarkup = parsed.body.innerHTML || page.html
  const usesDataComponents = Boolean(parsed.querySelector([
    `[${DATA_COMPONENT_ATTRIBUTE}]`,
    '.psl-data-grid',
    '.psl-data-carousel',
    '.psl-data-list',
    '.psl-data-featured',
  ].join(',')))
  const pageStyles = [page.css ?? '', usesDataComponents ? dataComponentStyles : '']
    .filter(Boolean)
    .join('\n')
  const title = document.createElement('div')
  title.textContent = page.name

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title.innerHTML}</title>
    <style>${escapeStyleContent(pageStyles)}</style>
  </head>
  <body>
    ${bodyMarkup}
    ${page.js ? `<script>${escapeScriptContent(page.js)}</script>` : ''}
  </body>
</html>`
}

function uniquePageFiles(pages: EditorExportPage[]) {
  const used = new Set<string>()
  return new Map(pages.map((page) => {
    const base = safePageSlug(page.id || page.name)
    let candidate = base
    let suffix = 2
    while (used.has(candidate)) candidate = `${base}-${suffix++}`
    used.add(candidate)
    return [page.id, `pages/${candidate}.html`]
  }))
}

export function buildEditorProjectBundle(
  pages: EditorExportPage[],
  startPage: string,
  name = 'Sitio web',
  supabaseConfig?: SupabaseEditorConfig,
): ProjectBundle {
  if (!pages.length) throw new Error('Añade al menos una página antes de exportar.')
  if (!pages.some((page) => page.id === startPage)) {
    throw new Error('La página inicial ya no existe.')
  }

  const filesByPage = uniquePageFiles(pages)
  const pageIds = new Set(pages.map((page) => page.id))
  const files: ProjectFile[] = []
  const connections: ProjectConnection[] = []
  const bindings: DataBinding[] = []
  const repeaters: DataRepeater[] = []
  const motionActivities: MotionActivity[] = []
  const normalizedData = supabaseConfig ? normalizedSupabaseConfig(supabaseConfig) : undefined
  const fallbackTableId = normalizedData?.tables[0]?.id
  const authPage = pages.find((page) => {
    const parsed = new DOMParser().parseFromString(page.html, 'text/html')
    return Boolean(parsed.querySelector('form[data-psl-auth-action="login"]'))
  })
  const hasSupabaseCredentials = Boolean(
    normalizedData?.projectUrl
    && normalizedData.publishableKey
    && isSafePublishableKey(normalizedData.publishableKey),
  )

  if (authPage && !hasSupabaseCredentials) {
    throw new Error('Conecta Supabase con una URL y publishable key antes de probar la página de acceso.')
  }

  pages.forEach((page) => {
    const markup = pageDocument(page)
    const parsed = new DOMParser().parseFromString(markup, 'text/html')
    motionActivities.push(...readMotionActivities(parsed, page.id, normalizedData?.tables ?? []))
    parsed.querySelectorAll<HTMLElement>(
      `[${FLOW_ACTION_ATTRIBUTE}="navigate"][${FLOW_TARGET_ATTRIBUTE}]`,
    ).forEach((element, index) => {
      const targetPage = element.getAttribute(FLOW_TARGET_ATTRIBUTE)?.trim()
      if (!targetPage || !pageIds.has(targetPage)) return
      connections.push({
        id: `${page.id}-flow-${index + 1}`,
        sourcePage: page.id,
        elementId: createStableElementId(element, page.id),
        event: 'click',
        action: 'navigate',
        targetPage,
        ...(() => {
          const repeater = element.closest<HTMLElement>(`[${DATA_REPEATER_ATTRIBUTE}]`)
          if (!repeater) return {}
          const tableId = repeater?.getAttribute(DATA_REPEATER_ATTRIBUTE)
          const resolvedTableId = tableId && tableId !== 'true' ? tableId : fallbackTableId
          return resolvedTableId ? {
          context: {
              record: { dataSourceId: supabaseDataSourceId(resolvedTableId), recordId: '$record.id' },
          },
          } : {}
        })(),
      })
    })
    parsed.querySelectorAll<HTMLElement>(`[${DATA_BIND_FIELD_ATTRIBUTE}]`)
      .forEach((element, index) => {
        const field = element.getAttribute(DATA_BIND_FIELD_ATTRIBUTE)?.trim()
        const requestedTarget = element.getAttribute(DATA_BIND_TARGET_ATTRIBUTE)?.trim()
        const tableId = element.getAttribute(DATA_SOURCE_ATTRIBUTE)?.trim() || fallbackTableId
        const insideRepeater = element.closest<HTMLElement>(`[${DATA_REPEATER_ATTRIBUTE}]`)
        const requestedScope = element.getAttribute(DATA_SCOPE_ATTRIBUTE)?.trim()
        const sourceMode = insideRepeater || requestedScope !== 'first' ? 'context' : 'first'
        const allowedTargets = ['text', 'src', 'alt', 'href', 'title', 'ariaLabel', 'value'] as const
        const target = allowedTargets.find((candidate) => candidate === requestedTarget) ?? 'text'
        if (!field || !tableId) return
        bindings.push({
          id: `${page.id}-binding-${index + 1}`,
          pageId: page.id,
          elementId: createStableElementId(element, page.id),
          target,
          contextKey: 'record',
          dataSourceId: supabaseDataSourceId(tableId),
          sourceMode,
          field,
        })
      })
    parsed.querySelectorAll<HTMLElement>(`[${DATA_REPEATER_ATTRIBUTE}]`)
      .forEach((element, index) => {
        const requestedTableId = element.getAttribute(DATA_REPEATER_ATTRIBUTE)?.trim()
        const tableId = requestedTableId && requestedTableId !== 'true'
          ? requestedTableId
          : fallbackTableId
        if (!tableId) return
        const requestedPageSize = Number.parseInt(element.getAttribute(DATA_PAGE_SIZE_ATTRIBUTE) ?? '', 10)
        const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 && requestedPageSize <= 100
          ? requestedPageSize
          : undefined
        repeaters.push({
          id: `${page.id}-repeater-${index + 1}`,
          pageId: page.id,
          elementId: createStableElementId(element, page.id),
          dataSourceId: supabaseDataSourceId(tableId),
          itemContext: 'record',
          ...(pageSize ? { pageSize } : {}),
          ...(element.getAttribute(DATA_PAGINATION_ATTRIBUTE) === 'true' ? { pagination: true } : {}),
          ...(element.getAttribute('data-psl-empty-message')?.trim()
            ? { emptyMessage: element.getAttribute('data-psl-empty-message')!.trim().slice(0, 300) }
            : {}),
          ...(element.getAttribute('data-psl-error-message')?.trim()
            ? { errorMessage: element.getAttribute('data-psl-error-message')!.trim().slice(0, 300) }
            : {}),
          ...(element.getAttribute('data-psl-user-filter-column')?.trim()
            ? { userFilterColumn: element.getAttribute('data-psl-user-filter-column')!.trim() }
            : {}),
          ...(element.getAttribute('data-psl-include-unpublished') === 'true'
            ? { includeUnpublished: true }
            : {}),
        })
      })
    files.push({
      path: filesByPage.get(page.id)!,
      mediaType: 'text/html',
      bytes: encoder.encode(markup),
    })
  })

  if (normalizedData?.publishableKey && !isSafePublishableKey(normalizedData.publishableKey)) {
    throw new Error('La clave de Supabase no es publicable. Nunca exportes una secret key.')
  }

  if ((bindings.length || repeaters.length) && (!normalizedData
    || !normalizedData.projectUrl
    || !isSafePublishableKey(normalizedData.publishableKey))) {
    throw new Error('Conecta y verifica Supabase antes de exportar elementos con datos.')
  }

  if (motionActivities.some((activity) => activity.reference.type === 'data' || activity.persistence)
    && (!normalizedData || !normalizedData.projectUrl || !isSafePublishableKey(normalizedData.publishableKey))) {
    throw new Error('Conecta y verifica Supabase antes de usar referencias o resultados de movimiento con datos.')
  }

  if (normalizedData?.projectUrl && normalizedData.publishableKey) {
    files.push({
      path: 'database/setup.sql',
      mediaType: 'application/sql',
      bytes: encoder.encode(createSupabaseSetupSql(normalizedData)),
    })
  }

  return {
    manifest: {
      version: 2,
      name,
      startPage,
      pages: pages.map((page) => ({
        id: page.id,
        name: page.name,
        ...(authPage ? { access: page.id === authPage.id
          ? 'guestOnly' as const
          : 'authenticated' as const } : {}),
        file: filesByPage.get(page.id)!,
      })),
      connections,
      elementOverrides: [],
      ...(authPage && normalizedData?.projectUrl && normalizedData.publishableKey ? {
        authentication: {
          provider: 'supabase' as const,
          projectUrl: normalizedData.projectUrl,
          publishableKey: normalizedData.publishableKey,
          loginPage: authPage.id,
          afterLoginPage: startPage === authPage.id
            ? pages.find((page) => page.id !== authPage.id)?.id ?? authPage.id
            : startPage,
          afterLogoutPage: authPage.id,
        },
      } : {}),
      ...(normalizedData?.projectUrl && normalizedData.publishableKey ? {
        dataSources: normalizedData.tables.map((table) => {
          const recentColumn = table.name === 'practice_attempts'
            ? 'created_at'
            : table.name === 'practice_progress'
              ? 'last_practiced_at'
              : table.name === 'favorite_practices' ? 'created_at' : undefined
          return {
            id: supabaseDataSourceId(table.id),
            name: table.name,
            type: 'supabase' as const,
            projectUrl: normalizedData.projectUrl,
            publishableKey: normalizedData.publishableKey,
            table: table.name,
            publishedOnly: table.access === 'public_read',
            requiresAuth: table.access !== 'public_read',
            ...(table.access === 'public_read' ? { orderColumn: 'sort_order', orderDirection: 'asc' as const } : {}),
            ...(recentColumn ? { orderColumn: recentColumn, orderDirection: 'desc' as const } : {}),
          }
        }),
      } : {}),
      ...(bindings.length ? { bindings } : {}),
      ...(repeaters.length ? { repeaters } : {}),
      ...(motionActivities.length ? { motionActivities } : {}),
    },
    files,
  }
}

export function editorProjectBundle(editor: Editor, supabaseConfig?: SupabaseEditorConfig) {
  const pages = editor.Pages.getAll().map((page) => {
    const component = page.getMainComponent()
    return {
      id: page.getId(),
      name: page.getName() || 'Sin título',
      html: editor.getHtml({ component }),
      css: editor.getCss({ component, keepUnusedStyles: true }),
      js: editor.getJs({ component }),
    }
  })

  return buildEditorProjectBundle(
    pages,
    pages[0]?.id ?? '',
    'Sitio creado con PSL',
    supabaseConfig,
  )
}

export async function exportEditorProject(editor: Editor, supabaseConfig?: SupabaseEditorConfig) {
  await editor.store()
  const bundle = editorProjectBundle(editor, supabaseConfig)
  const blob = await zipProjectExporter.export(bundle)
  const validation = await validateStaticArchive(blob)
  if (!validation.valid) {
    throw new Error(`La exportación no está lista: ${validation.errors[0]}`)
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeFilename(bundle.manifest.name)
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
