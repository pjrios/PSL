import JSZip from 'jszip'
import type { ProjectBundle, ProjectPage } from '../../../core/project'
import { applyContentOverrides, createOverrideCss } from '../../design'
import {
  createNavigationConfigSource,
  createNavigationRuntimeSource,
} from '../../../runtime/navigation-runtime'
import type { ProjectExporter } from '../port'
import { relativeProjectPath } from './path-utils'
import {
  createMotionConfigSource,
  createMotionRuntimeSource,
} from '../../../runtime/motion-runtime'

const textDecoder = new TextDecoder()
const runtimePath = 'psl-runtime/navigation.js'
const overridesPath = 'psl-runtime/overrides.css'
const motionRuntimePath = 'motion-runtime/analysis.js'

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
  document.querySelectorAll('[data-psl-config], [data-psl-runtime], [data-psl-overrides], [data-motion-config], [data-motion-runtime]')
    .forEach((node) => node.remove())
  applyContentOverrides(document, bundle.manifest, page.id)

  if (createOverrideCss(bundle.manifest)) {
    const stylesheet = document.createElement('link')
    stylesheet.dataset.pslOverrides = 'true'
    stylesheet.rel = 'stylesheet'
    stylesheet.href = relativeProjectPath(page.file, overridesPath)
    document.head.append(stylesheet)
  }

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
    dataSources: bundle.manifest.dataSources,
    bindings: bundle.manifest.bindings,
    repeaters: bundle.manifest.repeaters,
    authentication: bundle.manifest.authentication,
    pageAccess: Object.fromEntries(bundle.manifest.pages.map((target) => [
      target.id,
      target.access ?? (bundle.manifest.authentication
        ? target.id === bundle.manifest.authentication.loginPage
          ? 'guestOnly'
          : 'authenticated'
        : 'public'),
    ])),
  })

  const runtimeScript = document.createElement('script')
  runtimeScript.dataset.pslRuntime = 'true'
  runtimeScript.src = relativeProjectPath(page.file, runtimePath)
  document.body.append(configScript, runtimeScript)

  if (bundle.manifest.motionActivities?.some((activity) => activity.pageId === page.id)) {
    const motionConfig = document.createElement('script')
    motionConfig.dataset.motionConfig = 'true'
    motionConfig.textContent = createMotionConfigSource({
      activities: bundle.manifest.motionActivities,
      authentication: bundle.manifest.authentication,
      currentPage: page.id,
      dataSources: bundle.manifest.dataSources,
    })
    const motionRuntime = document.createElement('script')
    motionRuntime.dataset.motionRuntime = 'true'
    motionRuntime.src = relativeProjectPath(page.file, motionRuntimePath)
    document.body.append(motionConfig, motionRuntime)
  }

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
      if (file.path === 'project.json' || file.path === runtimePath || file.path === overridesPath
        || file.path === motionRuntimePath) {
        continue
      }

      const page = pagesByFile.get(file.path)
      if (page) {
        archive.file(file.path, injectNavigationRuntime(textDecoder.decode(file.bytes), bundle, page))
      } else if (file.path === 'index.html') {
        continue
      } else {
        archive.file(file.path, bytesToBase64(file.bytes), { base64: true })
      }
    }

    archive.file('project.json', JSON.stringify(bundle.manifest, null, 2))
    archive.file(runtimePath, createNavigationRuntimeSource())
    if (bundle.manifest.motionActivities?.length) {
      archive.file(motionRuntimePath, createMotionRuntimeSource())
    }
    const overrideCss = createOverrideCss(bundle.manifest)
    if (overrideCss) archive.file(overridesPath, overrideCss)
    if (!pagesByFile.has('index.html')) {
      archive.file('index.html', startPageDocument(bundle))
    }

    const bytes = await archive.generateAsync({ type: 'uint8array' })
    return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/zip' })
  }
}

export const zipProjectExporter = new ZipProjectExporter()
