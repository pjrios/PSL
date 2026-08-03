import DOMPurify from 'dompurify'
import JSZip from 'jszip'

export interface ImportedPageDraft {
  css: string
  html: string
  name: string
}

export interface PreparedImportedPage extends ImportedPageDraft {
  id: string
}

export interface TemplateZipImportResult {
  assetCount: number
  cssCount: number
  drafts: ImportedPageDraft[]
  externalStylesheetCount: number
  ignoredScriptCount: number
}

const MAX_TEMPLATE_ARCHIVE_BYTES = 25 * 1024 * 1024
const MAX_TEMPLATE_FILES = 400
const MAX_TEMPLATE_PAGES = 6

function isSafeTemplatePath(path: string) {
  return Boolean(path)
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.split('/').includes('..')
}

function archiveDirectory(path: string) {
  const parts = path.split('/')
  parts.pop()
  return parts
}

function resolveArchiveReference(baseFile: string, reference: string) {
  const cleanReference = reference.trim().split(/[?#]/)[0]
  if (!cleanReference || /^(?:[a-z]+:|\/\/|#)/i.test(cleanReference)) return undefined
  const parts = cleanReference.startsWith('/') ? [] : archiveDirectory(baseFile)
  for (const part of cleanReference.replace(/^\//, '').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') parts.pop()
    else parts.push(part)
  }
  return parts.join('/')
}

function archiveMediaType(path: string) {
  const extension = path.split('.').at(-1)?.toLowerCase()
  return ({
    avif: 'image/avif',
    gif: 'image/gif',
    ico: 'image/x-icon',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    mp4: 'video/mp4',
    otf: 'font/otf',
    png: 'image/png',
    svg: 'image/svg+xml',
    ttf: 'font/ttf',
    webm: 'video/webm',
    webp: 'image/webp',
    woff: 'font/woff',
    woff2: 'font/woff2',
  } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream'
}

function isIgnoredTemplatePath(path: string) {
  return path.startsWith('__MACOSX/')
    || path.split('/').some((part) => part === 'node_modules' || part === '.git')
}

export async function templateZipAsDrafts(source: Blob): Promise<TemplateZipImportResult> {
  if (source.size > MAX_TEMPLATE_ARCHIVE_BYTES) {
    throw new Error('La plantilla ZIP supera el límite de 25 MB.')
  }

  let archive: JSZip
  try {
    archive = await JSZip.loadAsync(await source.arrayBuffer())
  } catch {
    throw new Error('No se pudo abrir la plantilla ZIP.')
  }

  const entries = Object.entries(archive.files).filter(([path, entry]) =>
    !entry.dir && !isIgnoredTemplatePath(path))
  if (entries.length > MAX_TEMPLATE_FILES) {
    throw new Error(`La plantilla contiene demasiados archivos (${entries.length}). El máximo es ${MAX_TEMPLATE_FILES}.`)
  }
  for (const [path, entry] of entries) {
    if (!isSafeTemplatePath(path)
      || (entry.unsafeOriginalName && !isSafeTemplatePath(entry.unsafeOriginalName))) {
      throw new Error(`La plantilla contiene una ruta insegura: ${path}.`)
    }
  }

  const htmlEntries = entries
    .filter(([path]) => /\.html?$/i.test(path))
    .sort(([left], [right]) => {
      const leftIndex = /(^|\/)index\.html?$/i.test(left) ? 0 : 1
      const rightIndex = /(^|\/)index\.html?$/i.test(right) ? 0 : 1
      return leftIndex - rightIndex || left.localeCompare(right)
    })
  if (!htmlEntries.length) throw new Error('La plantilla ZIP no contiene ningún archivo HTML.')
  if (htmlEntries.length > MAX_TEMPLATE_PAGES) {
    throw new Error(`La plantilla contiene ${htmlEntries.length} páginas. El máximo para un proyecto es ${MAX_TEMPLATE_PAGES}.`)
  }

  const cssEntries = new Map(entries.filter(([path]) => /\.css$/i.test(path)))
  const scriptCount = entries.filter(([path]) => /\.m?js$/i.test(path)).length
  const assetEntries = entries.filter(([path]) =>
    !/\.(?:html?|css|m?js|map|md|txt|json)$/i.test(path))
  const assets: Record<string, string> = {}
  await Promise.all(assetEntries.map(async ([path, entry]) => {
    const dataUrl = `data:${archiveMediaType(path)};base64,${await entry.async('base64')}`
    assets[path] = dataUrl
    assets[path.split('/').at(-1) ?? path] = dataUrl
  }))

  let externalStylesheetCount = 0
  const drafts = await Promise.all(htmlEntries.map(async ([path, entry]) => {
    const html = await entry.async('string')
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const stylesheetLinks = Array.from(parsed.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet"][href]'))
    externalStylesheetCount += stylesheetLinks.filter((link) =>
      /^(?:[a-z]+:|\/\/)/i.test(link.getAttribute('href')?.trim() ?? '')).length
    const linkedCssPaths = stylesheetLinks
      .map((link) => resolveArchiveReference(path, link.getAttribute('href') ?? ''))
      .filter((candidate): candidate is string => Boolean(candidate && cssEntries.has(candidate)))
    const linkedCss = await Promise.all(linkedCssPaths.map((cssPath) => cssEntries.get(cssPath)!.async('string')))
    const fallbackCss = linkedCss.length ? [] : await Promise.all(
      Array.from(cssEntries.entries())
        .filter(([cssPath]) => ['styles', 'style', 'app', 'main'].includes(filenameBase(cssPath).toLowerCase()))
        .map(([, cssEntry]) => cssEntry.async('string')),
    )
    const rewritten = replaceAssetReferences(html, [...linkedCss, ...fallbackCss].join('\n'), assets)
    const title = parsed.querySelector('title')?.textContent?.trim()
    return {
      name: title || suggestedPageName(path),
      html: rewritten.html,
      css: rewritten.css,
    }
  }))

  return {
    assetCount: assetEntries.length,
    cssCount: cssEntries.size,
    drafts,
    externalStylesheetCount,
    ignoredScriptCount: scriptCount,
  }
}

function filenameBase(value: string) {
  const filename = value.split(/[\\/]/).pop() ?? value
  return filename.replace(/\.[^.]+$/, '')
}

export function suggestedPageName(filename: string) {
  const base = filenameBase(filename)
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return base ? `${base.charAt(0).toUpperCase()}${base.slice(1)}` : 'Página importada'
}

function splitSelectors(value: string) {
  const selectors: string[] = []
  let current = ''
  let quote = ''
  let depth = 0

  for (const character of value) {
    if (quote) {
      current += character
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
    } else if (character === '(' || character === '[') {
      depth += 1
      current += character
    } else if (character === ')' || character === ']') {
      depth = Math.max(0, depth - 1)
      current += character
    } else if (character === ',' && depth === 0) {
      selectors.push(current)
      current = ''
    } else {
      current += character
    }
  }
  if (current.trim()) selectors.push(current)
  return selectors
}

function scopeSelector(selector: string, scope: string) {
  let value = selector.trim()
  if (!value) return value

  value = value.replace(/:root\b/g, scope)
  value = value.replace(/^html(?=$|[\s.#:[>+~])/, scope)
  value = value.replace(/^body(?=$|[\s.#:[>+~])/, scope)
  value = value.replace(
    new RegExp(`^${scope.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(?:>\\s*)?body(?=$|[\\s.#:[>+~])`),
    scope,
  )
  return value.startsWith(scope) ? value : `${scope} ${value}`
}

function fallbackScopeCss(css: string, scope: string) {
  return css.replace(/(^|})(\s*)([^@}{][^{}]*)\{/g, (_match, close, spacing, selectors) => {
    const scoped = splitSelectors(selectors)
      .map((selector) => scopeSelector(selector, scope))
      .join(', ')
    return `${close}${spacing}${scoped}{`
  })
}

function serializeRule(rule: CSSRule, scope: string): string {
  const styleRule = rule as CSSStyleRule
  if (typeof styleRule.selectorText === 'string') {
    const selector = splitSelectors(styleRule.selectorText)
      .map((value) => scopeSelector(value, scope))
      .join(', ')
    return `${selector} { ${styleRule.style.cssText} }`
  }

  const groupingRule = rule as CSSGroupingRule
  const nestedRules = groupingRule.cssRules
  if (nestedRules && rule.type !== CSSRule.KEYFRAMES_RULE) {
    const openingBrace = rule.cssText.indexOf('{')
    const header = openingBrace >= 0 ? rule.cssText.slice(0, openingBrace).trim() : ''
    if (header) {
      return `${header} { ${Array.from(nestedRules).map((nested) => serializeRule(nested, scope)).join('\n')} }`
    }
  }

  return rule.cssText
}

export function scopePageCss(css: string, pageId: string) {
  const source = css.trim()
  if (!source) return ''
  const scope = `[data-psl-import-page="${pageId.replace(/["\\]/g, '')}"]`

  try {
    const cssDocument = document.implementation.createHTMLDocument('')
    const style = cssDocument.createElement('style')
    style.textContent = source
    cssDocument.head.append(style)
    const rules = style.sheet?.cssRules
    if (!rules?.length) return fallbackScopeCss(source, scope)
    return Array.from(rules).map((rule) => serializeRule(rule, scope)).join('\n')
  } catch {
    return fallbackScopeCss(source, scope)
  }
}

function assetLookup(value: string, assets: Record<string, string>) {
  const normalized = value.trim().replace(/^['"]|['"]$/g, '').split(/[?#]/)[0]
  const basename = normalized.split(/[\\/]/).pop() ?? normalized
  return assets[normalized] ?? assets[basename]
}

export function replaceAssetReferences(
  html: string,
  css: string,
  assets: Record<string, string>,
) {
  if (!Object.keys(assets).length) return { html, css }
  const parsed = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  parsed.body.querySelectorAll<HTMLElement>('[src], [poster]').forEach((element) => {
    for (const attribute of ['src', 'poster']) {
      const value = element.getAttribute(attribute)
      const replacement = value ? assetLookup(value, assets) : undefined
      if (replacement) element.setAttribute(attribute, replacement)
    }
  })
  parsed.body.querySelectorAll<HTMLElement>('[href]').forEach((element) => {
    const value = element.getAttribute('href')
    const replacement = value ? assetLookup(value, assets) : undefined
    if (replacement) element.setAttribute('href', replacement)
  })

  return {
    html: parsed.body.innerHTML,
    css: css.replace(/url\(([^)]+)\)/gi, (match, value) => {
      const replacement = assetLookup(value, assets)
      return replacement ? `url("${replacement}")` : match
    }),
  }
}

export function prepareImportedPage(
  draft: ImportedPageDraft,
  id: string,
): PreparedImportedPage {
  const parsed = new DOMParser().parseFromString(draft.html, 'text/html')
  const embeddedCss = Array.from(parsed.querySelectorAll('style'))
    .map((style) => style.textContent ?? '')
    .join('\n')
  parsed.querySelectorAll('style, script, link[rel~="stylesheet"]').forEach((element) => element.remove())

  const bootstrapStaticNavigationCss = parsed.body.querySelector('.navbar-collapse.collapse')
    ? `.navbar-toggler { display: none !important; }
.navbar-collapse.collapse { display: flex !important; }
@media (max-width: 991.98px) {
  .navbar-collapse.collapse { flex-basis: 100%; }
  .navbar-nav { flex-direction: row !important; flex-wrap: wrap; gap: 0.5rem; padding-top: 0.75rem; }
}`
    : ''

  const cleanHtml = DOMPurify.sanitize(parsed.body.innerHTML || draft.html, {
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed'],
    USE_PROFILES: { html: true, svg: true, svgFilters: true },
  })
  const css = scopePageCss(
    [embeddedCss, draft.css, bootstrapStaticNavigationCss].filter(Boolean).join('\n'),
    id,
  )

  return {
    id,
    name: draft.name.trim() || 'Página importada',
    html: `<div data-psl-import-page="${id}">${cleanHtml}</div>`,
    css,
  }
}

export function cssForHtmlFile(htmlFilename: string, cssFiles: Array<{ name: string; text: string }>) {
  const base = filenameBase(htmlFilename).toLowerCase()
  const specificallyMatched = cssFiles.filter((file) => filenameBase(file.name).toLowerCase() === base)
  const matchedNames = new Set(specificallyMatched.map((file) => file.name))
  const shared = cssFiles.filter((file) => {
    const cssBase = filenameBase(file.name).toLowerCase()
    return !matchedNames.has(file.name) && ['style', 'styles', 'app', 'global', 'main'].includes(cssBase)
  })
  return [...specificallyMatched, ...shared].map((file) => file.text).join('\n')
}
