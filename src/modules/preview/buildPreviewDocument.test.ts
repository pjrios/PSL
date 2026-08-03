import { describe, expect, it } from 'vitest'
import type { ProjectBundle } from '../../core/project'
import { buildPreviewDocument, collectPreviewElementIds } from './buildPreviewDocument'

const encoder = new TextEncoder()

describe('buildPreviewDocument', () => {
  it('removes executable content while keeping responsive CSS', () => {
    const bundle: ProjectBundle = {
      manifest: {
        version: 2,
        elementOverrides: [],
        name: 'Preview fixture',
        startPage: 'home',
        pages: [{ id: 'home', name: 'Home', file: 'pages/home.html' }],
        connections: [],
      },
      files: [
        {
          path: 'pages/home.html',
          mediaType: 'text/html',
          bytes: encoder.encode(
            '<!doctype html><html><head></head><body><script>alert(1)</script><a href="next.html">Next</a></body></html>',
          ),
        },
        {
          path: 'styles/app.css',
          mediaType: 'text/css',
          bytes: encoder.encode('@media (max-width: 600px) { body { color: teal; } }'),
        },
      ],
    }

    const preview = buildPreviewDocument(bundle, bundle.manifest.pages[0])

    expect(preview).not.toContain('<script')
    expect(preview).toContain('@media (max-width: 600px)')
    expect(preview).toContain('data-builder-original-href="next.html"')
  })

  it('embeds local assets without mutating the project bundle', () => {
    const originalImage = new Uint8Array([1, 2, 3])
    const bundle: ProjectBundle = {
      manifest: {
        version: 2,
        elementOverrides: [],
        name: 'Asset fixture',
        startPage: 'home',
        pages: [{ id: 'home', name: 'Home', file: 'pages/home.html' }],
        connections: [],
      },
      files: [
        {
          path: 'pages/home.html',
          mediaType: 'text/html',
          bytes: encoder.encode('<!doctype html><html><head></head><body><img src="../assets/test.png"></body></html>'),
        },
        {
          path: 'assets/test.png',
          mediaType: 'image/png',
          bytes: originalImage,
        },
      ],
    }

    const preview = buildPreviewDocument(bundle, bundle.manifest.pages[0])

    expect(preview).toContain('data:image/png;base64,AQID')
    expect(bundle.files[1].bytes).toBe(originalImage)
  })

  it('preserves linked stylesheet order, media queries, fonts, and inline assets', () => {
    const bundle: ProjectBundle = {
      manifest: {
        version: 2,
        elementOverrides: [],
        name: 'Responsive design export',
        startPage: 'home',
        pages: [{ id: 'home', name: 'Home', file: 'index.html' }],
        connections: [],
      },
      files: [
        {
          path: 'index.html',
          mediaType: 'text/html',
          bytes: encoder.encode('<html><head><link rel="stylesheet" href="styles/app.css" media="screen"><style>.logo { background: url("assets/logo.svg") }</style></head><body><main>Home</main></body></html>'),
        },
        {
          path: 'styles/app.css',
          mediaType: 'text/css',
          bytes: encoder.encode('@font-face { font-family: Figma; src: url("../assets/figma.woff2") } @media (max-width: 640px) { main { display: block } }'),
        },
        { path: 'assets/logo.svg', mediaType: 'image/svg+xml', bytes: encoder.encode('<svg/>') },
        { path: 'assets/figma.woff2', mediaType: 'font/woff2', bytes: new Uint8Array([1, 2, 3]) },
        { path: 'styles/unrelated.css', mediaType: 'text/css', bytes: encoder.encode('.should-not-load {}') },
      ],
    }

    const preview = buildPreviewDocument(bundle, bundle.manifest.pages[0])

    expect(preview).toContain('data-builder-stylesheet="styles/app.css"')
    expect(preview).toContain('media="screen"')
    expect(preview).toContain('@media (max-width: 640px)')
    expect(preview).toContain('data:font/woff2;base64,AQID')
    expect(preview).toContain('data:image/svg+xml;base64,PHN2Zy8+')
    expect(preview).not.toContain('.should-not-load')
  })

  it('exposes the same stable identifiers used by the visual selector', () => {
    const bundle: ProjectBundle = {
      manifest: {
        version: 2,
        elementOverrides: [],
        name: 'Selection fixture',
        startPage: 'home',
        pages: [{ id: 'home', name: 'Home', file: 'pages/home.html' }],
        connections: [],
      },
      files: [{
        path: 'pages/home.html',
        mediaType: 'text/html',
        bytes: encoder.encode('<html><body><main><button>Continue</button></main></body></html>'),
      }],
    }

    expect(collectPreviewElementIds(bundle, bundle.manifest.pages[0])).toEqual(new Set([
      'home::main:1',
      'home::main:1/button:1',
    ]))
  })

  it('injects the standalone runtime only in test mode', () => {
    const bundle: ProjectBundle = {
      manifest: {
        version: 2,
        elementOverrides: [],
        name: 'Runtime fixture',
        startPage: 'home',
        pages: [{ id: 'home', name: 'Home', file: 'pages/home.html' }],
        connections: [],
      },
      files: [{
        path: 'pages/home.html',
        mediaType: 'text/html',
        bytes: encoder.encode('<html><body><button>Continue</button></body></html>'),
      }],
    }

    const editPreview = buildPreviewDocument(bundle, bundle.manifest.pages[0])
    const testPreview = buildPreviewDocument(bundle, bundle.manifest.pages[0], { mode: 'test' })

    expect(editPreview).not.toContain('data-psl-runtime')
    expect(testPreview).toContain('data-psl-config="true"')
    expect(testPreview).toContain('data-psl-runtime="true"')
    expect(testPreview).toContain('psl-navigation-runtime')
  })

  it('applies static record bindings for the active navigation context', () => {
    const bundle: ProjectBundle = {
      manifest: {
        version: 2,
        elementOverrides: [],
        name: 'Bound preview',
        startPage: 'detail',
        pages: [{ id: 'detail', name: 'Detail', file: 'detail.html' }],
        connections: [],
        dataSources: [{
          id: 'items',
          name: 'Items',
          type: 'static',
          records: [{ id: 'two', name: 'Second record' }],
        }],
        bindings: [{
          id: 'detail-title',
          pageId: 'detail',
          elementId: 'detail::main:1/h1:1',
          target: 'text',
          contextKey: 'selectedRecord',
          field: 'name',
        }],
      },
      files: [{
        path: 'detail.html',
        mediaType: 'text/html',
        bytes: encoder.encode('<html><body><main><h1>Default</h1></main></body></html>'),
      }],
    }

    const preview = buildPreviewDocument(bundle, bundle.manifest.pages[0], {
      context: { selectedRecord: { dataSourceId: 'items', recordId: 'two' } },
    })

    expect(preview).toContain('Second record')
    expect(preview).not.toContain('>Default<')
  })
})
