import JSZip from 'jszip'
import { ProjectSchema } from '../../../core/project'

export interface StaticArchiveValidation {
  errors: string[]
  valid: boolean
}

function archiveDirectory(path: string) {
  const parts = path.split('/')
  parts.pop()
  return parts.join('/')
}

function resolveArchivePath(value: string, baseFile: string) {
  const candidate = value.trim()
  if (!candidate || /^(?:[a-z]+:|\/\/|#)/i.test(candidate)) return null

  const baseDirectory = archiveDirectory(baseFile)
  const baseUrl = `https://archive.local/${baseDirectory ? `${baseDirectory}/` : ''}`
  const resolved = new URL(candidate, baseUrl)
  const path = resolved.pathname.replace(/^\//, '')
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

function cssReferences(css: string) {
  return [...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)]
    .map((match) => match[2])
}

function htmlReferences(markup: string) {
  const document = new DOMParser().parseFromString(markup, 'text/html')
  const references: string[] = []

  document.querySelectorAll<HTMLElement>('[src], [poster]').forEach((element) => {
    for (const attribute of ['src', 'poster']) {
      const value = element.getAttribute(attribute)
      if (value) references.push(value)
    }
  })

  document.querySelectorAll<HTMLLinkElement>('link[href]').forEach((link) => {
    const value = link.getAttribute('href')
    if (value) references.push(value)
  })

  document.querySelectorAll<HTMLElement>('[srcset]').forEach((element) => {
    const value = element.getAttribute('srcset')
    if (!value || /^\s*data:/i.test(value)) return
    value.split(',').forEach((candidate) => references.push(candidate.trim().split(/\s+/)[0]))
  })

  document.querySelectorAll<HTMLStyleElement>('style').forEach((style) => {
    references.push(...cssReferences(style.textContent ?? ''))
  })
  document.querySelectorAll<HTMLElement>('[style]').forEach((element) => {
    references.push(...cssReferences(element.getAttribute('style') ?? ''))
  })

  return { document, references }
}

export async function validateStaticArchive(source: Blob): Promise<StaticArchiveValidation> {
  const errors: string[] = []
  let archive: JSZip

  try {
    archive = await JSZip.loadAsync(await source.arrayBuffer())
  } catch {
    return { valid: false, errors: ['El archivo exportado no es un ZIP válido.'] }
  }

  const filePaths = new Set(
    Object.entries(archive.files)
      .filter(([, entry]) => !entry.dir)
      .map(([path]) => path),
  )
  const manifestEntry = archive.file('project.json')

  if (!filePaths.has('index.html')) errors.push('Falta index.html en la raíz del sitio.')
  if (!filePaths.has('psl-runtime/navigation.js')) {
    errors.push('Falta el runtime de navegación.')
  }
  if (!manifestEntry) {
    errors.push('Falta project.json.')
    return { valid: false, errors }
  }

  let manifest
  try {
    const parsedJson = JSON.parse(await manifestEntry.async('string'))
    const result = ProjectSchema.safeParse(parsedJson)
    if (!result.success) {
      const issue = result.error.issues[0]
      const location = issue.path.length ? `${issue.path.join('.')}: ` : ''
      errors.push(`project.json no es válido: ${location}${issue.message}`)
      return { valid: false, errors }
    }
    manifest = result.data
  } catch {
    errors.push('project.json no es JSON válido.')
    return { valid: false, errors }
  }

  for (const page of manifest.pages) {
    const entry = archive.file(page.file)
    if (!entry) {
      errors.push(`Falta la pantalla ${page.file}.`)
      continue
    }

    const markup = await entry.async('string')
    const { document, references } = htmlReferences(markup)
    if (!document.querySelector('[data-psl-config]')) {
      errors.push(`${page.file} no contiene la configuración de navegación.`)
    }
    if (!document.querySelector('[data-psl-runtime]')) {
      errors.push(`${page.file} no carga el runtime de navegación.`)
    }

    for (const reference of references) {
      const path = resolveArchivePath(reference, page.file)
      if (path && !filePaths.has(path)) {
        errors.push(`${page.file} referencia un archivo inexistente: ${path}.`)
      }
    }
  }

  for (const path of filePaths) {
    if (!path.toLowerCase().endsWith('.css')) continue
    const css = await archive.file(path)!.async('string')
    for (const reference of cssReferences(css)) {
      const resolved = resolveArchivePath(reference, path)
      if (resolved && !filePaths.has(resolved)) {
        errors.push(`${path} referencia un archivo inexistente: ${resolved}.`)
      }
    }
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] }
}
