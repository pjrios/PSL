import { ProjectV2Schema } from '../../core/project'
import type {
  ElementOverride,
  StyleDeclaration,
  StyleStates,
  VisualBuilderProject,
} from '../../core/project'

export type EditorViewport = 'desktop' | 'tablet' | 'mobile'
export type EditorStyleState = keyof StyleStates
export type EditorStyleProperty = keyof StyleDeclaration

export const editableStyleProperties: Array<{
  key: EditorStyleProperty
  label: string
  placeholder: string
}> = [
  { key: 'color', label: 'Texto', placeholder: '#16333c' },
  { key: 'backgroundColor', label: 'Fondo', placeholder: '#ffffff' },
  { key: 'fontSize', label: 'Tamaño de letra', placeholder: '16px' },
  { key: 'fontWeight', label: 'Peso', placeholder: '700' },
  { key: 'textAlign', label: 'Alineación de texto', placeholder: 'start' },
  { key: 'display', label: 'Distribución', placeholder: 'block' },
  { key: 'flexDirection', label: 'Dirección', placeholder: 'row' },
  { key: 'justifyContent', label: 'Distribución principal', placeholder: 'normal' },
  { key: 'justifyItems', label: 'Alineación horizontal de cuadrícula', placeholder: 'normal' },
  { key: 'alignItems', label: 'Alineación secundaria', placeholder: 'normal' },
  { key: 'flexWrap', label: 'Ajuste de línea', placeholder: 'nowrap' },
  { key: 'objectFit', label: 'Ajuste de imagen', placeholder: 'cover' },
  { key: 'objectPosition', label: 'Punto focal', placeholder: '50% 50%' },
  { key: 'width', label: 'Ancho', placeholder: '100%' },
  { key: 'height', label: 'Alto', placeholder: '48px' },
  { key: 'borderColor', label: 'Color de borde', placeholder: '#cbdcda' },
  { key: 'borderWidth', label: 'Grosor de borde', placeholder: '1px' },
  { key: 'borderRadius', label: 'Radio', placeholder: '12px' },
  { key: 'boxShadow', label: 'Sombra', placeholder: '0 8px 24px #0002' },
  { key: 'opacity', label: 'Opacidad', placeholder: '1' },
  { key: 'visibility', label: 'Visibilidad', placeholder: 'visible' },
  { key: 'transform', label: 'Transformación', placeholder: 'translateY(-2px)' },
  { key: 'transition', label: 'Transición', placeholder: 'all 180ms ease' },
]

export const editableSpacingGroups: Array<{
  description: string
  label: string
  properties: Array<{
    key: EditorStyleProperty
    label: string
    placeholder: string
  }>
}> = [
  {
    label: 'Espacio exterior',
    description: 'Separa este elemento de lo que está a su alrededor.',
    properties: [
      { key: 'marginTop', label: 'Arriba', placeholder: '0px' },
      { key: 'marginRight', label: 'Derecha', placeholder: '0px' },
      { key: 'marginBottom', label: 'Abajo', placeholder: '0px' },
      { key: 'marginLeft', label: 'Izquierda', placeholder: '0px' },
    ],
  },
  {
    label: 'Espacio interior',
    description: 'Separa el contenido de los bordes del elemento.',
    properties: [
      { key: 'paddingTop', label: 'Arriba', placeholder: '12px' },
      { key: 'paddingRight', label: 'Derecha', placeholder: '16px' },
      { key: 'paddingBottom', label: 'Abajo', placeholder: '12px' },
      { key: 'paddingLeft', label: 'Izquierda', placeholder: '16px' },
    ],
  },
  {
    label: 'Entre elementos',
    description: 'Controla la separación de los elementos hijos en flex o grid.',
    properties: [
      { key: 'gap', label: 'Todos', placeholder: '12px' },
      { key: 'rowGap', label: 'Filas', placeholder: '12px' },
      { key: 'columnGap', label: 'Columnas', placeholder: '12px' },
    ],
  },
]

function elementPosition(element: Element) {
  let position = 1
  let sibling = element.previousElementSibling
  while (sibling) {
    if (sibling.tagName === element.tagName) position += 1
    sibling = sibling.previousElementSibling
  }
  return position
}

function stableElementId(element: Element, pageId: string) {
  const segments: string[] = []
  let current: Element | null = element
  while (current && current.tagName !== 'BODY') {
    segments.unshift(`${current.tagName.toLowerCase()}:${elementPosition(current)}`)
    current = current.parentElement
  }
  return `${pageId}::${segments.join('/')}`
}

function hasValues(value: object | undefined): boolean {
  return Boolean(value && Object.values(value).some((item) => {
    if (typeof item === 'object' && item !== null) return hasValues(item)
    return item !== undefined && item !== ''
  }))
}

function normalizeOverride(override: ElementOverride): ElementOverride | null {
  const content = hasValues(override.content) ? override.content : undefined
  const styles = hasValues(override.styles) ? override.styles : undefined
  return content || styles ? { ...override, content, styles } : null
}

function replaceOverride(project: VisualBuilderProject, next: ElementOverride | null) {
  const pageId = next?.pageId
  const elementId = next?.elementId
  const overrides = project.elementOverrides ?? []
  const source = next
    ? overrides.filter((item) =>
      !(item.pageId === pageId && item.elementId === elementId))
    : overrides

  return ProjectV2Schema.parse({
    ...project,
    elementOverrides: next ? [...source, next] : source,
  })
}

export function findElementOverride(
  project: VisualBuilderProject,
  pageId: string,
  elementId: string,
) {
  return (project.elementOverrides ?? []).find((override) =>
    override.pageId === pageId && override.elementId === elementId)
}

export function saveContentOverride(
  project: VisualBuilderProject,
  pageId: string,
  elementId: string,
  content: NonNullable<ElementOverride['content']>,
) {
  const existing = findElementOverride(project, pageId, elementId)
  const normalized = normalizeOverride({
    pageId,
    elementId,
    ...existing,
    content,
  })
  if (!normalized) return resetElementOverride(project, pageId, elementId)
  return replaceOverride(project, normalized)
}

export function saveStyleProperty(
  project: VisualBuilderProject,
  pageId: string,
  elementId: string,
  viewport: EditorViewport,
  state: EditorStyleState,
  property: EditorStyleProperty,
  value: string,
) {
  const existing = findElementOverride(project, pageId, elementId)
  const declaration = { ...existing?.styles?.[viewport]?.[state] }
  if (value.trim()) declaration[property] = value.trim()
  else delete declaration[property]

  const styles = {
    ...existing?.styles,
    [viewport]: {
      ...existing?.styles?.[viewport],
      [state]: declaration,
    },
  }
  const normalized = normalizeOverride({ pageId, elementId, ...existing, styles })
  if (!normalized) return resetElementOverride(project, pageId, elementId)
  return replaceOverride(project, normalized)
}

export function resetElementOverride(
  project: VisualBuilderProject,
  pageId: string,
  elementId: string,
) {
  return ProjectV2Schema.parse({
    ...project,
    elementOverrides: (project.elementOverrides ?? []).filter((override) =>
      !(override.pageId === pageId && override.elementId === elementId)),
  })
}

export function applyContentOverrides(
  document: Document,
  project: VisualBuilderProject,
  pageId: string,
) {
  const overrides = new Map((project.elementOverrides ?? [])
    .filter((override) => override.pageId === pageId)
    .map((override) => [override.elementId, override]))

  document.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName)) return
    const elementId = element.dataset.builderElementId ?? stableElementId(element, pageId)
    const override = overrides.get(elementId)
    if (!override) return

    element.dataset.pslOverrideId = elementId
    const content = override.content
    if (!content) return
    if (content.text !== undefined) element.textContent = content.text
    if (content.src !== undefined) element.setAttribute('src', content.src)
    if (content.alt !== undefined) element.setAttribute('alt', content.alt)
    if (content.href !== undefined) element.setAttribute('href', content.href)
    if (content.title !== undefined) element.setAttribute('title', content.title)
    if (content.ariaLabel !== undefined) element.setAttribute('aria-label', content.ariaLabel)
  })
}

function cssPropertyName(property: string) {
  return property.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`)
}

function declarationCss(declaration: StyleDeclaration | undefined) {
  if (!declaration) return ''
  return Object.entries(declaration)
    .filter(([, value]) => value !== undefined && value !== '')
    .map(([property, value]) => `${cssPropertyName(property)}:${value};`)
    .join('')
}

function selector(elementId: string, state: EditorStyleState) {
  const escaped = elementId.replaceAll('\\', '\\\\').replaceAll('"', '\\"')
  const base = `[data-psl-override-id="${escaped}"]`
  if (state === 'base') return base
  if (state === 'disabled') return `${base}:disabled,${base}[aria-disabled="true"]`
  return `${base}:${state}`
}

function viewportCss(project: VisualBuilderProject, viewport: EditorViewport) {
  const rules: string[] = []
  for (const override of project.elementOverrides ?? []) {
    const states = override.styles?.[viewport]
    if (!states) continue
    for (const state of ['base', 'hover', 'focus', 'active', 'disabled'] as const) {
      const declarations = declarationCss(states[state])
      if (declarations) rules.push(`${selector(override.elementId, state)}{${declarations}}`)
    }
  }
  return rules.join('\n')
}

export function createOverrideCss(project: VisualBuilderProject) {
  const desktop = viewportCss(project, 'desktop')
  const tablet = viewportCss(project, 'tablet')
  const mobile = viewportCss(project, 'mobile')
  return [
    desktop,
    tablet ? `@media (max-width: 820px){${tablet}}` : '',
    mobile ? `@media (max-width: 520px){${mobile}}` : '',
  ].filter(Boolean).join('\n')
}
