import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { ProjectBundle } from '../../../core/project'
import { ZipProjectImporter } from '../../importer'
import { ZipProjectExporter } from './ZipProjectExporter'

const encoder = new TextEncoder()

const bundle: ProjectBundle = {
  manifest: {
    version: 2,
    elementOverrides: [{
      pageId: 'home',
      elementId: 'home::main:1/button:1',
      content: { text: 'Start practice' },
      styles: {
        desktop: {
          base: { backgroundColor: '#176f70' },
          hover: { transform: 'translateY(-2px)' },
        },
      },
    }],
    name: 'Export fixture',
    startPage: 'home',
    pages: [
      { id: 'home', name: 'Home', file: 'pages/home.html' },
      { id: 'practice', name: 'Practice', file: 'pages/practice.html' },
    ],
    connections: [{
      id: 'connection-1',
      sourcePage: 'home',
      elementId: 'home::main:1/button:1',
      event: 'click',
      action: 'navigate',
      targetPage: 'practice',
    }],
  },
  files: [
    {
      path: 'pages/home.html',
      mediaType: 'text/html',
      bytes: encoder.encode('<html><body><main><button>Practice</button></main></body></html>'),
    },
    {
      path: 'pages/practice.html',
      mediaType: 'text/html',
      bytes: encoder.encode('<html><body><button>Back</button></body></html>'),
    },
    {
      path: 'styles/app.css',
      mediaType: 'text/css',
      bytes: encoder.encode('button { color: teal; }'),
    },
  ],
}

describe('ZipProjectExporter', () => {
  it('creates a deployable ZIP with the manifest and standalone runtime', async () => {
    const originalHome = bundle.files[0].bytes
    const exported = await new ZipProjectExporter().export(bundle)
    const archive = await JSZip.loadAsync(await exported.arrayBuffer())
    const home = await archive.file('pages/home.html')!.async('string')
    const runtime = await archive.file('psl-runtime/navigation.js')!.async('string')
    const overrides = await archive.file('psl-runtime/overrides.css')!.async('string')
    const index = await archive.file('index.html')!.async('string')

    expect(home).toContain('data-psl-config="true"')
    expect(home).toContain('src="../psl-runtime/navigation.js"')
    expect(home).toContain('practice.html')
    expect(runtime).toContain('pslElementId')
    expect(home).toContain('Start practice')
    expect(home).toContain('data-psl-overrides="true"')
    expect(overrides).toContain('background-color:#176f70')
    expect(overrides).toContain(':hover')
    expect(index).toContain('pages/home.html')
    expect(bundle.files[0].bytes).toBe(originalHome)
  })

  it('can be reimported without losing connections or duplicating runtime tags', async () => {
    const exporter = new ZipProjectExporter()
    const importer = new ZipProjectImporter()
    const firstImport = await importer.import(await exporter.export(bundle))
    const secondArchive = await JSZip.loadAsync(
      await (await exporter.export(firstImport)).arrayBuffer(),
    )
    const home = await secondArchive.file('pages/home.html')!.async('string')

    expect(firstImport.manifest).toEqual(bundle.manifest)
    expect(home.match(/data-psl-config=/g)).toHaveLength(1)
    expect(home.match(/data-psl-runtime=/g)).toHaveLength(1)
  })

  it('uses an imported root index page instead of overwriting it with a redirect', async () => {
    const rootBundle: ProjectBundle = {
      manifest: {
        version: 2,
        elementOverrides: [],
        name: 'Root page fixture',
        startPage: 'index',
        pages: [{ id: 'index', name: 'Home', file: 'index.html' }],
        connections: [],
      },
      files: [{
        path: 'index.html',
        mediaType: 'text/html',
        bytes: encoder.encode('<html><body><main>Figma home</main></body></html>'),
      }],
    }
    const archive = await JSZip.loadAsync(
      await (await new ZipProjectExporter().export(rootBundle)).arrayBuffer(),
    )
    const index = await archive.file('index.html')!.async('string')

    expect(index).toContain('Figma home')
    expect(index).toContain('src="psl-runtime/navigation.js"')
    expect(index).not.toContain('window.location.replace')
  })
})
