import { describe, expect, it } from 'vitest'
import {
  createDataComponentMarkup,
  dataComponentDesignPreviewCount,
  dataComponentStyles,
  findDataComponentRoot,
  readDataComponentSettings,
  suggestDataComponentMapping,
} from './data-component-templates'
import { buildEditorProjectBundle } from './export-project'
import type { SupabaseTableConfig } from './supabase-data'

const table: SupabaseTableConfig = {
  id: 'practices-table',
  displayName: 'Prácticas',
  name: 'practices',
  access: 'public_read',
  fields: [
    { id: 'title', name: 'practice_title', type: 'text' },
    { id: 'description', name: 'description', type: 'long_text' },
    { id: 'media', name: 'media_url', type: 'media' },
    { id: 'difficulty', name: 'difficulty', type: 'number' },
  ],
  relations: [],
}

describe('responsive data component templates', () => {
  it('suggests semantic fields without reusing a column', () => {
    expect(suggestDataComponentMapping('card_grid', table)).toEqual({
      media: 'media_url',
      title: 'practice_title',
      description: 'description',
      badge: 'difficulty',
    })
  })

  it('creates a repeated card with safe data bindings', () => {
    const html = createDataComponentMarkup('card_grid', table.id, {
      media: 'media_url',
      title: 'practice_title',
      description: 'description',
    })

    expect(html).toContain('data-psl-repeater="practices-table"')
    expect(html).toContain('data-psl-page-size="12"')
    expect(html).toContain('data-psl-pagination="true"')
    expect(html).toContain('data-psl-design-preview-count="8"')
    expect(html).toContain('--psl-data-cols-desktop:4')
    expect(html).toContain('--psl-data-cols-tablet:4')
    expect(html).toContain('--psl-data-cols-mobile:2')
    expect(html).toContain('data-psl-bind-field="media_url"')
    expect(html).toContain('data-psl-bind-target="src"')
    expect(html).toContain('data-psl-bind-field="practice_title"')
    expect(html).toContain('data-psl-data-scope="context"')
  })

  it('fills the configured design grid with unbound placeholder cards', () => {
    const html = createDataComponentMarkup('card_grid', table.id, {
      media: 'media_url',
      title: 'practice_title',
      description: 'description',
    }, { mediaKind: 'image', desktopColumns: 3, tabletColumns: 2, mobileColumns: 1, pageSize: 6 })
    const document = new DOMParser().parseFromString(html, 'text/html')

    expect(document.querySelectorAll('.psl-data-card')).toHaveLength(6)
    expect(document.querySelectorAll('[data-psl-design-placeholder="true"]')).toHaveLength(5)
    expect(document.querySelectorAll('[data-psl-design-placeholder][aria-hidden]')).toHaveLength(0)
    expect(document.querySelectorAll('[data-psl-repeater]')).toHaveLength(1)
    expect(document.querySelectorAll('[data-psl-bind-field="practice_title"]')).toHaveLength(1)
    expect(document.body.textContent).toContain('Título del elemento: practice title')
  })

  it('limits editor samples to two rows without changing the runtime page size', () => {
    const html = createDataComponentMarkup('card_grid', table.id, {
      title: 'practice_title',
    }, { mediaKind: 'image', desktopColumns: 3, tabletColumns: 2, mobileColumns: 1, pageSize: 100 })
    const document = new DOMParser().parseFromString(html, 'text/html')

    expect(dataComponentDesignPreviewCount('card_grid', {
      mediaKind: 'image', desktopColumns: 3, tabletColumns: 2, mobileColumns: 1, pageSize: 100,
    })).toBe(6)
    expect(document.querySelectorAll('.psl-data-card')).toHaveLength(6)
    expect(document.querySelector('[data-psl-repeater]')?.getAttribute('data-psl-page-size')).toBe('100')
    expect(document.querySelector('[data-psl-repeater]')?.getAttribute('data-psl-design-preview-count')).toBe('6')
  })

  it('recovers dynamic options from generated and legacy component markup', () => {
    const html = createDataComponentMarkup('simple_list', table.id, {
      media: 'media_url',
      title: 'practice_title',
      description: 'description',
      badge: 'difficulty',
    }, { mediaKind: 'video', desktopColumns: 2, tabletColumns: 1, mobileColumns: 1, pageSize: 7, pagination: false })
    const document = new DOMParser().parseFromString(html, 'text/html')
    const nestedTitle = document.querySelector('h3')!
    const root = findDataComponentRoot(nestedTitle)!

    expect(root.getAttribute('data-psl-data-component')).toBe('simple_list')
    expect(readDataComponentSettings(root)).toEqual({
      mapping: {
        badge: 'difficulty',
        description: 'description',
        media: 'media_url',
        title: 'practice_title',
      },
      options: {
        desktopColumns: 2,
        mediaKind: 'video',
        mobileColumns: 1,
        pageSize: 7,
        pagination: false,
        tabletColumns: 1,
      },
      tableId: table.id,
      templateId: 'simple_list',
    })

    root.removeAttribute('data-psl-data-component')
    const legacyRoot = findDataComponentRoot(nestedTitle)!
    expect(legacyRoot).toBe(document.querySelector('.psl-data-list'))
    expect(readDataComponentSettings(legacyRoot)?.templateId).toBe('simple_list')
  })

  it('creates a single-record detail component and responsive breakpoints', () => {
    const html = createDataComponentMarkup('featured_detail', table.id, { title: 'practice_title' })
    expect(html).not.toContain('data-psl-repeater')
    expect(html).toContain('data-psl-data-scope="first"')
    expect(dataComponentStyles).toContain('@media(max-width:900px)')
    expect(dataComponentStyles).toContain('@media(max-width:600px)')
  })

  it('renders mapped media as an accessible video when requested', () => {
    const html = createDataComponentMarkup('card_grid', table.id, { media: 'media_url' }, { mediaKind: 'video' })
    expect(html).toContain('<video class="psl-data-card__media"')
    expect(html).toContain('aria-hidden="true" muted playsinline preload="metadata" tabindex="-1"')
    expect(html).not.toContain(' controls')
    expect(html).toContain('data-psl-bind-target="src"')
    expect(dataComponentStyles).toContain('video.psl-data-card__media')
    expect(dataComponentStyles).toContain('pointer-events:none')
  })

  it('omits every visual slot configured as No mostrar', () => {
    const templateIds = ['card_grid', 'carousel', 'simple_list', 'featured_detail'] as const

    templateIds.forEach((templateId) => {
      const html = createDataComponentMarkup(templateId, table.id, {
        title: 'practice_title',
        description: 'description',
      })
      const document = new DOMParser().parseFromString(html, 'text/html')

      expect(document.querySelector('.psl-data-card__media,.psl-data-list__media,.psl-data-featured__media')).toBeNull()
      expect(document.querySelector('.psl-data-badge')).toBeNull()
      expect(document.body.textContent).not.toContain('Imagen o video')
      expect(document.body.textContent).not.toContain('Indicador')
      expect(document.querySelector('.psl-data-item--without-media')).not.toBeNull()
      expect(document.body.textContent).toContain('Título del elemento: practice title')
      expect(document.body.textContent).toContain('Descripción del elemento: description')
    })
  })

  it('omits unmapped title and description without removing mapped slots', () => {
    const html = createDataComponentMarkup('card_grid', table.id, {
      media: 'media_url',
      badge: 'difficulty',
    })
    const document = new DOMParser().parseFromString(html, 'text/html')

    expect(document.querySelector('.psl-data-card__media')).not.toBeNull()
    expect(document.querySelector('.psl-data-badge')).not.toBeNull()
    expect(document.querySelector('.psl-data-card__content h3')).toBeNull()
    expect(document.querySelector('.psl-data-card__content p')).toBeNull()
    expect(document.body.textContent).not.toContain('Título del elemento')
    expect(document.body.textContent).not.toContain('Descripción del elemento')
  })

  it('creates a responsive repeated carousel with scroll snapping', () => {
    const html = createDataComponentMarkup('carousel', table.id, { title: 'practice_title' })
    const document = new DOMParser().parseFromString(html, 'text/html')
    expect(html).toContain('class="psl-data-carousel"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('data-psl-repeater="practices-table"')
    expect(dataComponentStyles).toContain('scroll-snap-type:inline mandatory')
    expect(html).toContain('--psl-data-width-mobile:100%')
    expect(dataComponentStyles).toContain('var(--psl-data-width-mobile,100%)')
    expect(dataComponentStyles).toContain('container-name:psl-data-component')
    expect(dataComponentStyles).toContain(':has(> .psl-data-grid')
    expect(dataComponentStyles).toContain('@container psl-data-component (max-width:600px)')
    expect(document.querySelectorAll('.psl-data-carousel__item')).toHaveLength(4)
    expect(document.querySelector('[data-psl-data-component="carousel"] > .psl-data-carousel')).not.toBeNull()
  })

  it('exports generated components as ordinary Supabase repeaters and bindings', () => {
    const html = createDataComponentMarkup('card_grid', table.id, {
      media: 'media_url',
      title: 'practice_title',
      description: 'description',
    })
    const bundle = buildEditorProjectBundle([{ id: 'catalog', name: 'Catálogo', html }], 'catalog', 'Sitio', {
      projectUrl: 'https://school.supabase.co',
      publishableKey: 'sb_publishable_test_key_123456789',
      tables: [table],
    })

    expect(bundle.manifest.repeaters).toHaveLength(1)
    expect(bundle.manifest.repeaters?.[0]).toEqual(expect.objectContaining({
      dataSourceId: 'supabase-practices_table',
      pageSize: 12,
      pagination: true,
    }))
    expect(bundle.manifest.bindings?.map((binding) => binding.field))
      .toEqual(expect.arrayContaining(['media_url', 'practice_title', 'description']))
    const exportedPage = new TextDecoder().decode(
      bundle.files.find((file) => file.path === 'pages/catalog.html')?.bytes,
    )
    expect(exportedPage).toContain('@container psl-data-component (max-width:600px)')
    expect(exportedPage).toContain('container-type:inline-size')
  })
})
