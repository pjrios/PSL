import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { ZipProjectImporter } from './ZipProjectImporter'

const importer = new ZipProjectImporter()

async function archiveBlob(files: Record<string, string>) {
  const zip = new JSZip()
  Object.entries(files).forEach(([path, content]) => zip.file(path, content))
  const bytes = await zip.generateAsync({ type: 'uint8array' })
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' })
}

describe('ZipProjectImporter', () => {
  it('imports and validates a project manifest', async () => {
    const manifest = {
      version: 2,
      elementOverrides: [],
      name: 'Imported project',
      startPage: 'home',
      pages: [{ id: 'home', name: 'Home', file: 'pages/home.html' }],
      connections: [],
    }
    const bundle = await importer.import(
      await archiveBlob({
        'project.json': JSON.stringify(manifest),
        'pages/home.html': '<!doctype html><html><head></head><body>Home</body></html>',
        'styles/app.css': 'body { color: teal; }',
      }),
    )

    expect(bundle.manifest).toEqual(manifest)
    expect(bundle.files.map((file) => file.path)).toContain('pages/home.html')
  })

  it('creates a manifest when project.json is absent', async () => {
    const bundle = await importer.import(
      await archiveBlob({
        'pages/inicio.html': '<!doctype html><html><head></head><body>Inicio</body></html>',
        'pages/practica.html': '<!doctype html><html><head></head><body>Práctica</body></html>',
      }),
    )

    expect(bundle.manifest.startPage).toBe('inicio')
    expect(bundle.manifest.pages).toHaveLength(2)
  })

  it('discovers root and nested HTML from a design export', async () => {
    const bundle = await importer.import(
      await archiveBlob({
        'index.html': '<!doctype html><html><body>Home</body></html>',
        'screens/practice.html': '<!doctype html><html><body>Practice</body></html>',
        'styles/site.css': 'body { display: flex; }',
      }),
    )

    expect(bundle.manifest.startPage).toBe('index')
    expect(bundle.manifest.pages.map((page) => page.file)).toEqual([
      'index.html',
      'screens/practice.html',
    ])
  })

  it('rejects a manifest that references a missing page', async () => {
    const source = await archiveBlob({
      'project.json': JSON.stringify({
        version: 2,
        elementOverrides: [],
        name: 'Broken project',
        startPage: 'missing',
        pages: [{ id: 'missing', name: 'Missing', file: 'pages/missing.html' }],
        connections: [],
      }),
    })

    await expect(importer.import(source)).rejects.toMatchObject({
      code: 'missing-page',
    })
  })

  it('rejects an archive without HTML pages', async () => {
    const source = await archiveBlob({ 'styles/app.css': 'body {}' })

    await expect(importer.import(source)).rejects.toMatchObject({
      code: 'no-pages',
    })
  })
})
