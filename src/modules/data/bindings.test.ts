import { describe, expect, it } from 'vitest'
import type { VisualBuilderProject } from '../../core/project'
import {
  applyStaticDataBindings,
  deleteDataBinding,
  deleteDataRepeater,
  saveDataBinding,
  saveDataRepeater,
} from './bindings'

const project: VisualBuilderProject = {
  version: 2,
  elementOverrides: [],
  name: 'Data fixture',
  startPage: 'detail',
  pages: [{ id: 'detail', name: 'Detail', file: 'detail.html' }],
  connections: [],
  dataSources: [{
    id: 'items',
    name: 'Items',
    type: 'static',
    records: [{ id: 'one', details: { title: 'Bound title' } }],
  }],
  bindings: [],
}

describe('data bindings', () => {
  it('saves, applies, and removes a safe field binding', () => {
    const connected = saveDataBinding(project, {
      pageId: 'detail',
      elementId: 'detail::main:1/h1:1',
      target: 'text',
      contextKey: 'selectedRecord',
      field: 'details.title',
    })
    const document = new DOMParser().parseFromString(
      '<main><h1 data-builder-element-id="detail::main:1/h1:1">Default</h1></main>',
      'text/html',
    )

    applyStaticDataBindings(document, connected, 'detail', {
      selectedRecord: { dataSourceId: 'items', recordId: 'one' },
    })

    expect(document.querySelector('h1')?.textContent).toBe('Bound title')
    expect(deleteDataBinding(
      connected,
      'detail',
      'detail::main:1/h1:1',
      'text',
    ).bindings).toEqual([])
  })

  it('saves and removes a repeated-record template', () => {
    const repeated = saveDataRepeater(project, {
      pageId: 'detail',
      elementId: 'detail::main:1/article:1',
      dataSourceId: 'items',
      itemContext: 'item',
    })

    expect(repeated.repeaters?.[0]).toMatchObject({ dataSourceId: 'items', itemContext: 'item' })
    expect(deleteDataRepeater(
      repeated,
      'detail',
      'detail::main:1/article:1',
    ).repeaters).toEqual([])
  })
})
