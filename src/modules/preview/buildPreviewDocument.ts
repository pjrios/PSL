import DOMPurify from 'dompurify'
import type {
  NavigationContext,
  ProjectBundle,
  ProjectFile,
  ProjectPage,
} from '../../core/project'
import { applyStaticDataBindings } from '../data'
import { applyContentOverrides, createOverrideCss } from '../design'
import {
  createNavigationConfigSource,
  createNavigationRuntimeSource,
} from '../../runtime/navigation-runtime'
import { assignStableElementIds } from './element-identifiers'
import {
  createMotionConfigSource,
  createMotionRuntimeSource,
} from '../../runtime/motion-runtime'

const textDecoder = new TextDecoder()

function fileDirectory(path: string) {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

function resolveProjectPath(path: string, baseFile: string) {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(path)) return null
  const baseDirectory = fileDirectory(baseFile)
  const baseUrl = `https://project.local/${baseDirectory ? `${baseDirectory}/` : ''}`
  const resolvedUrl = new URL(path, baseUrl)
  return resolvedUrl.pathname.replace(/^\//, '')
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }

  return btoa(binary)
}

function asDataUrl(file: ProjectFile) {
  const mediaType = file.mediaType ?? 'application/octet-stream'
  return `data:${mediaType};base64,${bytesToBase64(file.bytes)}`
}

function replaceLocalAssetUrl(
  value: string,
  baseFile: string,
  filesByPath: Map<string, ProjectFile>,
) {
  const resolvedPath = resolveProjectPath(value, baseFile)
  if (!resolvedPath) return value
  const file = filesByPath.get(resolvedPath)
  return file ? asDataUrl(file) : value
}

function rewriteCssUrls(
  css: string,
  cssPath: string,
  filesByPath: Map<string, ProjectFile>,
) {
  return css.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (_match, _quote, value: string) => {
    const rewritten = replaceLocalAssetUrl(value, cssPath, filesByPath)
    return `url("${rewritten.replaceAll('"', '\\"')}")`
  })
}

function isExternalResource(path: string) {
  return /^(?:[a-z]+:|\/\/|#)/i.test(path)
}

function rewriteSrcSet(
  value: string,
  pagePath: string,
  filesByPath: Map<string, ProjectFile>,
) {
  if (/^\s*data:/i.test(value)) return value

  return value
    .split(',')
    .map((candidate) => {
      const [url, ...descriptor] = candidate.trim().split(/\s+/)
      const rewritten = replaceLocalAssetUrl(url, pagePath, filesByPath)
      return [rewritten, ...descriptor].join(' ')
    })
    .join(', ')
}

export interface PreviewDocumentOptions {
  mode?: 'edit' | 'test'
  context?: NavigationContext
}

export function buildPreviewDocument(
  bundle: ProjectBundle,
  page: ProjectPage,
  options: PreviewDocumentOptions = {},
) {
  const mode = options.mode ?? 'edit'
  const filesByPath = new Map(bundle.files.map((file) => [file.path, file]))
  const pageFile = filesByPath.get(page.file)

  if (!pageFile) {
    throw new Error(`Missing page file: ${page.file}`)
  }

  const cleanMarkup = DOMPurify.sanitize(textDecoder.decode(pageFile.bytes), {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['srcdoc'],
    ADD_TAGS: ['link'],
    ADD_ATTR: ['href', 'media', 'rel'],
  })
  const document = new DOMParser().parseFromString(cleanMarkup, 'text/html')

  document.querySelectorAll('meta[http-equiv="refresh" i]').forEach((node) => node.remove())
  document.querySelectorAll('form').forEach((form) => form.removeAttribute('action'))

  const linkedStyles = new Set<string>()
  document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet" i]').forEach((link) => {
    const href = link.getAttribute('href')?.trim()
    if (!href || isExternalResource(href)) return

    const cssPath = resolveProjectPath(href, page.file)
    const cssFile = cssPath ? filesByPath.get(cssPath) : undefined
    if (!cssPath || !cssFile) {
      link.remove()
      return
    }

    linkedStyles.add(cssPath)
    const style = document.createElement('style')
    style.dataset.builderStylesheet = cssPath
    const media = link.getAttribute('media')
    if (media) style.setAttribute('media', media)
    style.textContent = rewriteCssUrls(textDecoder.decode(cssFile.bytes), cssPath, filesByPath)
    link.replaceWith(style)
  })

  document.querySelectorAll<HTMLStyleElement>('style:not([data-builder-stylesheet])')
    .forEach((style) => {
      style.textContent = rewriteCssUrls(style.textContent ?? '', page.file, filesByPath)
    })

  for (const element of document.querySelectorAll<HTMLElement>('[src], [poster]')) {
    for (const attribute of ['src', 'poster']) {
      const value = element.getAttribute(attribute)
      if (value) {
        element.setAttribute(attribute, replaceLocalAssetUrl(value, page.file, filesByPath))
      }
    }
  }

  for (const element of document.querySelectorAll<HTMLElement>('[srcset]')) {
    const value = element.getAttribute('srcset')
    if (value) element.setAttribute('srcset', rewriteSrcSet(value, page.file, filesByPath))
  }

  for (const element of document.querySelectorAll<HTMLElement>('[style]')) {
    const value = element.getAttribute('style')
    if (value) element.setAttribute('style', rewriteCssUrls(value, page.file, filesByPath))
  }

  document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach((anchor) => {
    anchor.dataset.builderOriginalHref = anchor.getAttribute('href') ?? ''
    anchor.setAttribute('href', '#')
  })

  assignStableElementIds(document, page.id)
  applyContentOverrides(document, bundle.manifest, page.id)
  applyStaticDataBindings(document, bundle.manifest, page.id, options.context ?? {})

  const fallbackStyles = linkedStyles.size === 0
    ? bundle.files
      .filter((file) => file.mediaType === 'text/css' || file.path.endsWith('.css'))
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((file) => rewriteCssUrls(textDecoder.decode(file.bytes), file.path, filesByPath))
      .join('\n')
    : ''

  const previewSafetyStyles = mode === 'edit' ? `
    html { min-height: 100%; }
    [data-builder-element-id] { cursor: crosshair !important; }
    [data-builder-element-id]:hover {
      outline: 2px dashed #168f86 !important;
      outline-offset: 2px !important;
    }
    [data-builder-selected="true"] {
      outline: 3px solid #168f86 !important;
      outline-offset: 2px !important;
    }
  ` : 'html { min-height: 100%; }'
  const style = document.createElement('style')
  style.dataset.builderPreview = 'true'
  style.textContent = `${fallbackStyles}\n${createOverrideCss(bundle.manifest)}\n${previewSafetyStyles}`
  document.head.append(style)

  if (mode === 'test') {
    const configScript = document.createElement('script')
    configScript.dataset.pslConfig = 'true'
    configScript.textContent = createNavigationConfigSource({
      connections: bundle.manifest.connections,
      currentPage: page.id,
      pageUrls: Object.fromEntries(bundle.manifest.pages.map((candidate) => [
        candidate.id,
        candidate.file,
      ])),
      transport: 'message',
      dataSources: bundle.manifest.dataSources,
      bindings: bundle.manifest.bindings,
      currentContext: options.context,
      repeaters: bundle.manifest.repeaters,
      authentication: bundle.manifest.authentication,
      pageAccess: Object.fromEntries(bundle.manifest.pages.map((candidate) => [
        candidate.id,
        candidate.access ?? (bundle.manifest.authentication
          ? candidate.id === bundle.manifest.authentication.loginPage
            ? 'guestOnly'
            : 'authenticated'
          : 'public'),
      ])),
    })
    const runtimeScript = document.createElement('script')
    runtimeScript.dataset.pslRuntime = 'true'
    runtimeScript.textContent = createNavigationRuntimeSource()
    document.body.append(configScript, runtimeScript)

    if (bundle.manifest.motionActivities?.some((activity) => activity.pageId === page.id)) {
      const motionConfig = document.createElement('script')
      motionConfig.dataset.motionConfig = 'true'
      motionConfig.textContent = createMotionConfigSource({
        activities: bundle.manifest.motionActivities,
        authentication: bundle.manifest.authentication,
        currentContext: options.context,
        currentPage: page.id,
        dataSources: bundle.manifest.dataSources,
      })
      const motionRuntime = document.createElement('script')
      motionRuntime.dataset.motionRuntime = 'true'
      motionRuntime.textContent = createMotionRuntimeSource()
      document.body.append(motionConfig, motionRuntime)
    }
  }

  return `<!doctype html>\n${document.documentElement.outerHTML}`
}

export function collectPreviewElementIds(bundle: ProjectBundle, page: ProjectPage) {
  const preview = buildPreviewDocument(bundle, page)
  const document = new DOMParser().parseFromString(preview, 'text/html')

  return new Set(
    [...document.querySelectorAll<HTMLElement>('[data-builder-element-id]')]
      .flatMap((element) => element.dataset.builderElementId ?? []),
  )
}
