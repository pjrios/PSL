import { describe, expect, it } from 'vitest'
import type { ProjectBundle } from '../core/project'
import {
  applyEditorPreviewAction,
  createEditorPreviewSession,
  editorPreviewPageAccess,
  editorPreviewPath,
  resolveEditorPreviewPath,
} from './editor-preview-session'

const bundle: ProjectBundle = {
  manifest: {
    version: 2,
    name: 'Preview',
    startPage: 'catalog',
    pages: [
      { id: 'catalog', name: 'Catalog', file: 'pages/catalog.html' },
      { id: 'detail', name: 'Detail', file: 'pages/detail.html' },
    ],
    connections: [],
    elementOverrides: [],
  },
  files: [],
}

describe('editor preview session', () => {
  it('starts on the selected editor page when it exists', () => {
    const session = createEditorPreviewSession(bundle, 'detail')

    expect(session.pageId).toBe('detail')
    expect(session.context).toEqual({})
    expect(session.history).toEqual([{ pageId: 'detail', context: {} }])
  })

  it('carries the clicked record context to the destination and restores it on back', () => {
    const started = createEditorPreviewSession(bundle, 'catalog')
    const navigated = applyEditorPreviewAction(started, {
      source: 'psl-navigation-runtime',
      action: 'navigate',
      targetPage: 'detail',
      context: {
        record: { dataSourceId: 'supabase-practices', recordId: 'practice-2' },
      },
    }).session

    expect(navigated.pageId).toBe('detail')
    expect(navigated.context.record?.recordId).toBe('practice-2')

    const returned = applyEditorPreviewAction(navigated, {
      source: 'psl-navigation-runtime',
      action: 'back',
    }).session
    expect(returned.pageId).toBe('catalog')
    expect(returned.context).toEqual({})
  })

  it('ignores deleted destinations and permits only http(s) external URLs', () => {
    const session = createEditorPreviewSession(bundle)
    const missing = applyEditorPreviewAction(session, {
      source: 'psl-navigation-runtime',
      action: 'navigate',
      targetPage: 'missing',
    })
    const unsafe = applyEditorPreviewAction(session, {
      source: 'psl-navigation-runtime',
      action: 'url',
      url: 'javascript:alert(1)',
    })
    const safe = applyEditorPreviewAction(session, {
      source: 'psl-navigation-runtime',
      action: 'url',
      url: 'https://example.com/path',
    })

    expect(missing.session).toBe(session)
    expect(unsafe.externalUrl).toBeUndefined()
    expect(safe.externalUrl).toBe('https://example.com/path')
  })

  it('maps exported page files to editable site paths', () => {
    expect(editorPreviewPath(bundle.manifest.pages[0])).toBe('/catalog')
    expect(resolveEditorPreviewPath(bundle, '/detail?from=test')?.id).toBe('detail')
    expect(resolveEditorPreviewPath(bundle, '/missing')).toBeUndefined()
  })

  it('reports the effective page access used by the runtime guard', () => {
    const authenticatedBundle: ProjectBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        authentication: {
          provider: 'supabase',
          projectUrl: 'https://school.supabase.co',
          publishableKey: 'sb_publishable_test_key_123456789',
          loginPage: 'catalog',
          afterLoginPage: 'detail',
          afterLogoutPage: 'catalog',
        },
      },
    }

    expect(editorPreviewPageAccess(authenticatedBundle, authenticatedBundle.manifest.pages[0]))
      .toBe('guestOnly')
    expect(editorPreviewPageAccess(authenticatedBundle, authenticatedBundle.manifest.pages[1]))
      .toBe('authenticated')
  })
})
