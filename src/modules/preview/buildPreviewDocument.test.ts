import { describe, expect, it } from 'vitest'
import type { ProjectBundle } from '../../core/project'
import { buildPreviewDocument } from './buildPreviewDocument'

const encoder = new TextEncoder()

describe('buildPreviewDocument', () => {
  it('removes executable content while keeping responsive CSS', () => {
    const bundle: ProjectBundle = {
      manifest: {
        version: 1,
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
        version: 1,
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
})
