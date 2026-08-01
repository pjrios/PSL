import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import type { ProjectBundle } from '../../../core/project'
import { ZipProjectImporter } from '../../importer'
import { ZipProjectExporter } from './ZipProjectExporter'

const encoder = new TextEncoder()

const bundle: ProjectBundle = {
  manifest: {
    version: 1,
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
    const index = await archive.file('index.html')!.async('string')

    expect(home).toContain('data-psl-config="true"')
    expect(home).toContain('src="../psl-runtime/navigation.js"')
    expect(home).toContain('practice.html')
    expect(runtime).toContain('pslElementId')
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
})
