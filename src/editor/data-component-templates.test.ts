import { describe, expect, it } from 'vitest'
import {
  createDataComponentMarkup,
  dataComponentStyles,
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
    expect(html).toContain('controls preload="metadata"')
    expect(html).toContain('data-psl-bind-target="src"')
  })

  it('creates a responsive repeated carousel with scroll snapping', () => {
    const html = createDataComponentMarkup('carousel', table.id, { title: 'practice_title' })
    expect(html).toContain('class="psl-data-carousel"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('data-psl-repeater="practices-table"')
    expect(dataComponentStyles).toContain('scroll-snap-type:inline mandatory')
    expect(html).toContain('--psl-data-width-mobile:100%')
    expect(dataComponentStyles).toContain('var(--psl-data-width-mobile,100%)')
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
  })
})
