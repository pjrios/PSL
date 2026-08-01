import JSZip from 'jszip'
import type { ProjectBundle, ProjectPage } from '../../../core/project'
import {
  createNavigationConfigSource,
  createNavigationRuntimeSource,
} from '../../../runtime/navigation-runtime'
import type { ProjectExporter } from '../port'
import { relativeProjectPath } from './path-utils'

const textDecoder = new TextDecoder()
const runtimePath = 'psl-runtime/navigation.js'

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

function injectNavigationRuntime(
  markup: string,
  bundle: ProjectBundle,
  page: ProjectPage,
) {
  const document = new DOMParser().parseFromString(markup, 'text/html')
  document.querySelectorAll('[data-psl-config], [data-psl-runtime]').forEach((node) => node.remove())

  const configScript = document.createElement('script')
  configScript.dataset.pslConfig = 'true'
  configScript.textContent = createNavigationConfigSource({
    connections: bundle.manifest.connections,
    currentPage: page.id,
    pageUrls: Object.fromEntries(bundle.manifest.pages.map((target) => [
      target.id,
      relativeProjectPath(page.file, target.file),
    ])),
    transport: 'location',
  })

  const runtimeScript = document.createElement('script')
  runtimeScript.dataset.pslRuntime = 'true'
  runtimeScript.src = relativeProjectPath(page.file, runtimePath)
  document.body.append(configScript, runtimeScript)

  return `<!doctype html>\n${document.documentElement.outerHTML}`
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function startPageDocument(bundle: ProjectBundle) {
  const startPage = bundle.manifest.pages.find((page) => page.id === bundle.manifest.startPage)!
  const href = escapeHtml(startPage.file)
  const serializedHref = JSON.stringify(startPage.file).replaceAll('<', '\\u003c')

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="0;url=${href}">
    <title>${escapeHtml(bundle.manifest.name)}</title>
  </head>
  <body>
    <p>Abriendo <a href="${href}">${escapeHtml(startPage.name)}</a>…</p>
    <script>window.location.replace(${serializedHref});</script>
  </body>
</html>`
}

export class ZipProjectExporter implements ProjectExporter {
  async export(bundle: ProjectBundle) {
    const archive = new JSZip()
    const pagesByFile = new Map(bundle.manifest.pages.map((page) => [page.file, page]))

    for (const file of bundle.files) {
      if (file.path === 'project.json' || file.path === runtimePath || file.path === 'index.html') {
        continue
      }

      const page = pagesByFile.get(file.path)
      if (page) {
        archive.file(file.path, injectNavigationRuntime(textDecoder.decode(file.bytes), bundle, page))
      } else {
        archive.file(file.path, bytesToBase64(file.bytes), { base64: true })
      }
    }

    archive.file('project.json', JSON.stringify(bundle.manifest, null, 2))
    archive.file(runtimePath, createNavigationRuntimeSource())
    archive.file('index.html', startPageDocument(bundle))

    const bytes = await archive.generateAsync({ type: 'uint8array' })
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' })
  }
}

export const zipProjectExporter = new ZipProjectExporter()
