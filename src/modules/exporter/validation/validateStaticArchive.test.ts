import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { validateStaticArchive } from './validateStaticArchive'

async function archiveBlob(files: Record<string, string>) {
  const archive = new JSZip()
  Object.entries(files).forEach(([path, content]) => archive.file(path, content))
  const bytes = await archive.generateAsync({ type: 'uint8array' })
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' })
}

describe('validateStaticArchive', () => {
  it('reports missing case-sensitive assets before static hosting', async () => {
    const manifest = {
      version: 2,
      elementOverrides: [],
      name: 'Broken static fixture',
      startPage: 'index',
      pages: [{ id: 'index', name: 'Home', file: 'index.html' }],
      connections: [],
    }
    const result = await validateStaticArchive(await archiveBlob({
      'index.html': '<html><body><img src="assets/Hero.svg"><script data-psl-config></script><script data-psl-runtime src="psl-runtime/navigation.js"></script></body></html>',
      'project.json': JSON.stringify(manifest),
      'psl-runtime/navigation.js': '/* runtime */',
      'assets/hero.svg': '<svg/>',
    }))

    expect(result.valid).toBe(false)
    expect(result.errors).toContain(
      'index.html referencia un archivo inexistente: assets/Hero.svg.',
    )
  })
})
