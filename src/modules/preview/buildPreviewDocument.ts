import DOMPurify from 'dompurify'
import type { ProjectBundle, ProjectFile, ProjectPage } from '../../core/project'
import { assignStableElementIds } from './element-identifiers'

const textDecoder = new TextDecoder()

function fileDirectory(path: string) {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

function resolveProjectPath(path: string, baseFile: string) {
  if (/^(?:[a-z]+:|#|\/\/)/i.test(path)) return null
  const baseDirectory = fileDirectory(baseFile)
  const resolvedUrl = new URL(path, `https://project.local/${baseDirectory}/`)
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

export function buildPreviewDocument(bundle: ProjectBundle, page: ProjectPage) {
  const filesByPath = new Map(bundle.files.map((file) => [file.path, file]))
  const pageFile = filesByPath.get(page.file)

  if (!pageFile) {
    throw new Error(`Missing page file: ${page.file}`)
  }

  const cleanMarkup = DOMPurify.sanitize(textDecoder.decode(pageFile.bytes), {
    WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['srcdoc'],
  })
  const document = new DOMParser().parseFromString(cleanMarkup, 'text/html')

  document.querySelectorAll('meta[http-equiv="refresh" i]').forEach((node) => node.remove())
  document.querySelectorAll('link[rel="stylesheet" i]').forEach((node) => node.remove())
  document.querySelectorAll('form').forEach((form) => form.removeAttribute('action'))

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

  const styles = bundle.files
    .filter((file) => file.mediaType === 'text/css' || file.path.endsWith('.css'))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => rewriteCssUrls(textDecoder.decode(file.bytes), file.path, filesByPath))
    .join('\n')

  const previewSafetyStyles = `
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
  `
  const style = document.createElement('style')
  style.dataset.builderPreview = 'true'
  style.textContent = `${styles}\n${previewSafetyStyles}`
  document.head.append(style)

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
