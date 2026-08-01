/// <reference types="node" />

import { readFile } from 'node:fs/promises'
import JSZip from 'jszip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { validateStaticArchive, ZipProjectExporter } from '../modules/exporter'
import { ZipProjectImporter } from '../modules/importer'
import { saveConnection } from '../modules/navigation'
import { buildPreviewDocument } from '../modules/preview'
import { createNavigationRuntimeSource } from '../runtime/navigation-runtime'

const fixtureRoot = 'examples/figma-responsive-export'
const fixturePaths = [
  'index.html',
  'practice.html',
  'styles/figma.css',
  'assets/hand.svg',
  'assets/psl-fixture.woff2',
]

async function fixtureArchive() {
  const archive = new JSZip()
  for (const path of fixturePaths) {
    archive.file(path, await readFile(`${fixtureRoot}/${path}`))
  }
  const bytes = await archive.generateAsync({ type: 'uint8array' })
  return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' })
}

afterEach(() => {
  vi.restoreAllMocks()
  delete window.__PSL_NAVIGATION__
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('Figma-compatible static flow', () => {
  it('imports, connects, exports, reimports, and executes navigation', async () => {
    const importer = new ZipProjectImporter()
    const imported = await importer.import(await fixtureArchive())
    const connected = {
      ...imported,
      manifest: saveConnection(imported.manifest, {
        action: 'navigate',
        elementId: 'index::main:1/section:1/button:1',
        sourcePage: 'index',
        targetPage: 'practice',
      }),
    }

    expect(connected.manifest.pages.map((page) => page.file)).toEqual([
      'index.html',
      'practice.html',
    ])

    const exported = await new ZipProjectExporter().export(connected)
    const validation = await validateStaticArchive(exported)
    expect(validation).toEqual({ valid: true, errors: [] })

    const archive = await JSZip.loadAsync(await exported.arrayBuffer())
    expect(await archive.file('styles/figma.css')!.async('string'))
      .toContain('@media (max-width: 760px)')
    expect(archive.file('assets/hand.svg')).not.toBeNull()
    expect(archive.file('assets/psl-fixture.woff2')).not.toBeNull()

    const reimported = await importer.import(exported)
    const indexPage = reimported.manifest.pages.find((page) => page.id === 'index')!
    const preview = buildPreviewDocument(reimported, indexPage, { mode: 'test' })
    const previewDocument = new DOMParser().parseFromString(preview, 'text/html')
    const config = previewDocument.querySelector<HTMLScriptElement>('[data-psl-config]')!.textContent

    document.head.innerHTML = previewDocument.head.innerHTML
    document.body.innerHTML = previewDocument.body.innerHTML
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    window.eval(config)
    window.eval(createNavigationRuntimeSource())
    document.querySelector<HTMLButtonElement>('.primary-action')!.click()

    expect(postMessage).toHaveBeenCalledWith({
      action: 'navigate',
      source: 'psl-navigation-runtime',
      targetPage: 'practice',
    }, '*')
  })
})
