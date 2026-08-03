import {
  DATA_BIND_FIELD_ATTRIBUTE,
  DATA_BIND_TARGET_ATTRIBUTE,
  DATA_REPEATER_ATTRIBUTE,
  DATA_SCOPE_ATTRIBUTE,
  DATA_SOURCE_ATTRIBUTE,
} from './supabase-data'
import type { SupabaseField, SupabaseTableConfig } from './supabase-data'

export type DataComponentTemplateId = 'card_grid' | 'carousel' | 'simple_list' | 'featured_detail'
export type DataComponentSlotId = 'media' | 'title' | 'description' | 'badge'
export type DataComponentMapping = Partial<Record<DataComponentSlotId, string>>
export const DATA_PAGE_SIZE_ATTRIBUTE = 'data-psl-page-size'
export const DATA_PAGINATION_ATTRIBUTE = 'data-psl-pagination'
export const DATA_DESIGN_PLACEHOLDER_ATTRIBUTE = 'data-psl-design-placeholder'
export interface DataComponentOptions {
  mediaKind: 'image' | 'video'
  desktopColumns?: number
  tabletColumns?: number
  mobileColumns?: number
  pageSize?: number
  pagination?: boolean
}

export interface DataComponentTemplate {
  description: string
  id: DataComponentTemplateId
  name: string
  repeatMode: 'collection' | 'first'
  responsiveSummary: string
  slots: Array<{
    accepts: SupabaseField['type'][]
    id: DataComponentSlotId
    label: string
    target: 'src' | 'text'
  }>
}

export const dataComponentTemplates: DataComponentTemplate[] = [{
  id: 'card_grid',
  name: 'Cuadrícula de tarjetas',
  description: 'Tarjetas con imagen, título, descripción e indicador.',
  repeatMode: 'collection',
  responsiveSummary: '4 × 3 escritorio/tableta · 2 × 6 móvil',
  slots: [
    { id: 'media', label: 'Imagen o video', target: 'src', accepts: ['media', 'url'] },
    { id: 'title', label: 'Título', target: 'text', accepts: ['text', 'long_text'] },
    { id: 'description', label: 'Descripción', target: 'text', accepts: ['long_text', 'text'] },
    { id: 'badge', label: 'Indicador', target: 'text', accepts: ['number', 'text', 'boolean'] },
  ],
}, {
  id: 'carousel',
  name: 'Carrusel deslizable',
  description: 'Tarjetas horizontales que se deslizan con toque o trackpad.',
  repeatMode: 'collection',
  responsiveSummary: '4 visibles · 3 en tableta · 1 en móvil',
  slots: [
    { id: 'media', label: 'Imagen o video', target: 'src', accepts: ['media', 'url'] },
    { id: 'title', label: 'Título', target: 'text', accepts: ['text', 'long_text'] },
    { id: 'description', label: 'Descripción', target: 'text', accepts: ['long_text', 'text'] },
    { id: 'badge', label: 'Indicador', target: 'text', accepts: ['number', 'text', 'boolean'] },
  ],
}, {
  id: 'simple_list',
  name: 'Lista visual',
  description: 'Filas compactas con miniatura y texto.',
  repeatMode: 'collection',
  responsiveSummary: 'Horizontal · se apila en móvil',
  slots: [
    { id: 'media', label: 'Miniatura', target: 'src', accepts: ['media', 'url'] },
    { id: 'title', label: 'Título', target: 'text', accepts: ['text', 'long_text'] },
    { id: 'description', label: 'Descripción', target: 'text', accepts: ['long_text', 'text'] },
    { id: 'badge', label: 'Indicador', target: 'text', accepts: ['number', 'text', 'boolean'] },
  ],
}, {
  id: 'featured_detail',
  name: 'Detalle destacado',
  description: 'Un elemento con medios grandes y contenido descriptivo.',
  repeatMode: 'first',
  responsiveSummary: '2 columnas · vertical en móvil',
  slots: [
    { id: 'media', label: 'Imagen o video', target: 'src', accepts: ['media', 'url'] },
    { id: 'title', label: 'Título', target: 'text', accepts: ['text', 'long_text'] },
    { id: 'description', label: 'Descripción', target: 'text', accepts: ['long_text', 'text'] },
    { id: 'badge', label: 'Indicador', target: 'text', accepts: ['number', 'text', 'boolean'] },
  ],
}]

const slotPatterns: Record<DataComponentSlotId, RegExp[]> = {
  media: [/media/, /image|imagen/, /photo|foto/, /video/, /cover|portada/],
  title: [/title|titulo/, /name|nombre/, /heading|encabezado/, /label|etiqueta/],
  description: [/description|descripcion/, /summary|resumen/, /instructions|instrucciones/, /details|detalles/],
  badge: [/difficulty|dificultad/, /category|categoria/, /status|estado/, /price|precio/, /level|nivel/],
}

export function dataComponentTemplateById(id: DataComponentTemplateId) {
  return dataComponentTemplates.find((template) => template.id === id) ?? dataComponentTemplates[0]
}

export function defaultDataComponentOptions(templateId: DataComponentTemplateId): Required<DataComponentOptions> {
  if (templateId === 'simple_list') {
    return { mediaKind: 'image', desktopColumns: 1, tabletColumns: 1, mobileColumns: 1, pageSize: 12, pagination: true }
  }
  if (templateId === 'featured_detail') {
    return { mediaKind: 'image', desktopColumns: 1, tabletColumns: 1, mobileColumns: 1, pageSize: 1, pagination: false }
  }
  if (templateId === 'carousel') {
    return { mediaKind: 'image', desktopColumns: 4, tabletColumns: 3, mobileColumns: 1, pageSize: 12, pagination: true }
  }
  return { mediaKind: 'image', desktopColumns: 4, tabletColumns: 4, mobileColumns: 2, pageSize: 12, pagination: true }
}

function normalizedDataComponentOptions(templateId: DataComponentTemplateId, options: DataComponentOptions) {
  const defaults = defaultDataComponentOptions(templateId)
  const numberOption = (value: number | undefined, fallback: number, maximum: number) =>
    Math.min(maximum, Math.max(1, Number.isFinite(value) ? Math.round(value!) : fallback))
  return {
    mediaKind: options.mediaKind ?? defaults.mediaKind,
    desktopColumns: numberOption(options.desktopColumns, defaults.desktopColumns, 6),
    tabletColumns: numberOption(options.tabletColumns, defaults.tabletColumns, 6),
    mobileColumns: numberOption(options.mobileColumns, defaults.mobileColumns, 3),
    pageSize: numberOption(options.pageSize, defaults.pageSize, 100),
    pagination: options.pagination ?? defaults.pagination,
  }
}

export function suggestDataComponentMapping(
  templateId: DataComponentTemplateId,
  table: SupabaseTableConfig,
): DataComponentMapping {
  const template = dataComponentTemplateById(templateId)
  const used = new Set<string>()
  const mapping: DataComponentMapping = {}
  template.slots.forEach((slot) => {
    const candidates = table.fields.filter((field) => !used.has(field.name))
    const named = candidates.find((field) => slotPatterns[slot.id].some((pattern) => pattern.test(field.name)))
    const typed = candidates.find((field) => slot.accepts.includes(field.type))
    const match = named ?? typed
    if (match) {
      mapping[slot.id] = match.name
      used.add(match.name)
    }
  })
  return mapping
}

function bindingAttributes(
  tableId: string,
  field: string | undefined,
  target: 'src' | 'text',
  sourceMode: 'context' | 'first',
) {
  if (!field) return ''
  return ` ${DATA_BIND_FIELD_ATTRIBUTE}="${field}" ${DATA_BIND_TARGET_ATTRIBUTE}="${target}" ${DATA_SOURCE_ATTRIBUTE}="${tableId}" ${DATA_SCOPE_ATTRIBUTE}="${sourceMode}"`
}

export function createDataComponentMarkup(
  templateId: DataComponentTemplateId,
  tableId: string,
  mapping: DataComponentMapping,
  options: DataComponentOptions = { mediaKind: 'image' },
) {
  const resolvedOptions = normalizedDataComponentOptions(templateId, options)
  const sourceMode = dataComponentTemplateById(templateId).repeatMode === 'collection' ? 'context' : 'first'
  const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const fieldLabel = (field: string | undefined, fallback: string) => field
    ? `${fallback}: ${field.replace(/_/g, ' ')}`
    : fallback
  const binding = (field: string | undefined, target: 'src' | 'text', includeBindings: boolean) =>
    includeBindings ? bindingAttributes(tableId, field, target, sourceMode) : ''
  const mediaLabel = fieldLabel(mapping.media, 'Imagen o video')
  const titleLabel = fieldLabel(mapping.title, 'Título del elemento')
  const descriptionLabel = fieldLabel(mapping.description, 'Descripción del elemento')
  const badgeLabel = fieldLabel(mapping.badge, 'Indicador')
  const mediaElement = (className: string, placeholder: string, includeBindings = true) => resolvedOptions.mediaKind === 'video'
    ? `<video class="${className}" src="" controls preload="metadata"${binding(mapping.media, 'src', includeBindings)}>${placeholder}</video>`
    : `<img class="${className}" src="https://placehold.co/640x420?text=${encodeURIComponent(mediaLabel)}" alt="${escapeText(mediaLabel)}"${binding(mapping.media, 'src', includeBindings)}>`
  const cardContent = (heading: 'h2' | 'h3', includeBindings = true) =>
    `<div class="psl-data-card__content"><span class="psl-data-badge"${binding(mapping.badge, 'text', includeBindings)}>${escapeText(badgeLabel)}</span><${heading}${binding(mapping.title, 'text', includeBindings)}>${escapeText(titleLabel)}</${heading}><p${binding(mapping.description, 'text', includeBindings)}>${escapeText(descriptionLabel)}</p></div>`
  const layoutStyle = `--psl-data-cols-desktop:${resolvedOptions.desktopColumns};--psl-data-cols-tablet:${resolvedOptions.tabletColumns};--psl-data-cols-mobile:${resolvedOptions.mobileColumns};--psl-data-width-desktop:${100 / resolvedOptions.desktopColumns}%;--psl-data-width-tablet:${100 / resolvedOptions.tabletColumns}%;--psl-data-width-mobile:${100 / resolvedOptions.mobileColumns}%`
  const repeaterAttributes = `${DATA_REPEATER_ATTRIBUTE}="${tableId}" ${DATA_PAGE_SIZE_ATTRIBUTE}="${resolvedOptions.pageSize}" ${DATA_PAGINATION_ATTRIBUTE}="${resolvedOptions.pagination}"`
  const repeatDesignItems = (render: (attributes: string, includeBindings: boolean) => string) =>
    Array.from({ length: resolvedOptions.pageSize }, (_, index) => render(
      index === 0 ? repeaterAttributes : `${DATA_DESIGN_PLACEHOLDER_ATTRIBUTE}="true"`,
      index === 0,
    )).join('\n')
  if (templateId === 'carousel') {
    return `<section class="psl-data-carousel" aria-label="Carrusel de información" tabindex="0" style="${layoutStyle}">
      ${repeatDesignItems((attributes, includeBindings) => `<article class="psl-data-carousel__item" ${attributes}>
        ${mediaElement('psl-data-card__media', 'Tu navegador no puede reproducir este video.', includeBindings)}
        ${cardContent('h3', includeBindings)}
      </article>`)}
    </section>`
  }
  if (templateId === 'simple_list') {
    return `<section class="psl-data-list" aria-label="Lista de información" style="${layoutStyle}">
      ${repeatDesignItems((attributes, includeBindings) => `<article class="psl-data-list__item" ${attributes}>
        ${mediaElement('psl-data-list__media', 'Tu navegador no puede reproducir este video.', includeBindings)}
        <div class="psl-data-list__content"><span class="psl-data-badge"${binding(mapping.badge, 'text', includeBindings)}>${escapeText(badgeLabel)}</span><h3${binding(mapping.title, 'text', includeBindings)}>${escapeText(titleLabel)}</h3><p${binding(mapping.description, 'text', includeBindings)}>${escapeText(descriptionLabel)}</p></div>
      </article>`)}
    </section>`
  }
  if (templateId === 'featured_detail') {
    return `<section class="psl-data-featured">
      ${mediaElement('psl-data-featured__media', 'Tu navegador no puede reproducir este video.')}
      <div class="psl-data-featured__content"><span class="psl-data-badge"${binding(mapping.badge, 'text', true)}>${escapeText(badgeLabel)}</span><h2${binding(mapping.title, 'text', true)}>${escapeText(titleLabel)}</h2><p${binding(mapping.description, 'text', true)}>${escapeText(descriptionLabel)}</p></div>
    </section>`
  }
  return `<section class="psl-data-grid" aria-label="Cuadrícula de información" style="${layoutStyle}">
    ${repeatDesignItems((attributes, includeBindings) => `<article class="psl-data-card" ${attributes}>
      ${mediaElement('psl-data-card__media', 'Tu navegador no puede reproducir este video.', includeBindings)}
      ${cardContent('h3', includeBindings)}
    </article>`)}
  </section>`
}

export const dataComponentStyles = `
.psl-data-grid{width:100%;display:grid;grid-template-columns:repeat(var(--psl-data-cols-desktop,4),minmax(0,1fr));gap:1.25rem;padding:1rem 0}
.psl-data-card{min-width:0;overflow:hidden;background:#fff;border:1px solid #dce4e2;border-radius:1rem;box-shadow:0 8px 24px rgba(22,54,58,.08)}
.psl-data-card__media{display:block;width:100%;aspect-ratio:16/10;object-fit:cover;background:#e8efed}
.psl-data-card__content{display:grid;gap:.65rem;padding:1.1rem}
.psl-data-card h3,.psl-data-list h3,.psl-data-featured h2{margin:0;color:#173f45;line-height:1.2}
.psl-data-card p,.psl-data-list p,.psl-data-featured p{margin:0;color:#5a7378;line-height:1.55}
.psl-data-badge{width:max-content;max-width:100%;padding:.3rem .55rem;color:#176d65;background:#dff3ef;border-radius:999px;font-size:.75rem;font-weight:800}
.psl-data-carousel{width:100%;display:flex;gap:1rem;overflow-x:auto;overscroll-behavior-inline:contain;scroll-snap-type:inline mandatory;padding:1rem 0;scrollbar-width:thin}
.psl-data-carousel__item{flex:0 0 calc(var(--psl-data-width-desktop,25%) - .75rem);min-width:0;overflow:hidden;scroll-snap-align:start;background:#fff;border:1px solid #dce4e2;border-radius:1rem;box-shadow:0 8px 24px rgba(22,54,58,.08)}
.psl-data-carousel__item h3,.psl-data-carousel__item p{margin:0;color:#173f45;line-height:1.45}.psl-data-carousel__item p{color:#5a7378}
.psl-data-list{width:100%;display:grid;grid-template-columns:repeat(var(--psl-data-cols-desktop,1),minmax(0,1fr));gap:1rem;padding:1rem 0}
.psl-data-list__item{min-width:0;display:grid;grid-template-columns:minmax(140px,220px) minmax(0,1fr);gap:1rem;align-items:center;padding:1rem;background:#fff;border:1px solid #dce4e2;border-radius:1rem}
.psl-data-list__media{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:.75rem;background:#e8efed}
.psl-data-list__content{min-width:0;display:grid;gap:.55rem}
.psl-data-featured{width:100%;display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:2rem;align-items:center;padding:1.5rem;background:#f7faf9;border-radius:1.25rem}
.psl-data-featured__media{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:1rem;background:#e8efed}
.psl-data-featured__content{min-width:0;display:grid;gap:.85rem}
[data-psl-design-placeholder="true"]{opacity:.72}[data-psl-design-placeholder="true"] img{filter:saturate(.55)}
.psl-data-pagination{grid-column:1/-1;width:100%;display:flex;align-items:center;justify-content:center;gap:.75rem;padding:1rem 0}.psl-data-pagination button{min-height:40px;padding:0 1rem;color:#fff;background:#176d65;border:0;border-radius:.55rem;cursor:pointer;font-weight:750}.psl-data-pagination button:disabled{cursor:not-allowed;opacity:.45}.psl-data-pagination span{color:#4f696d;font-size:.9rem;font-weight:700}
.psl-data-pagination[hidden]{display:none}
@media(max-width:900px){.psl-data-grid,.psl-data-list{grid-template-columns:repeat(var(--psl-data-cols-tablet,4),minmax(0,1fr))}.psl-data-carousel__item{flex-basis:calc(var(--psl-data-width-tablet,33.333%) - .67rem)}.psl-data-featured{gap:1.25rem}}
@media(max-width:600px){.psl-data-grid,.psl-data-list{grid-template-columns:repeat(var(--psl-data-cols-mobile,2),minmax(0,1fr))}.psl-data-carousel__item{flex-basis:calc(var(--psl-data-width-mobile,100%) - .25rem)}.psl-data-list__item,.psl-data-featured{grid-template-columns:1fr}.psl-data-list__media{aspect-ratio:16/10}.psl-data-featured{padding:1rem}}
`
