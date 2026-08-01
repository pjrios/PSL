import JSZip from 'jszip'
import { ProjectSchema } from '../../../core/project'
import type {
  ProjectBundle,
  ProjectFile,
  VisualBuilderProject,
} from '../../../core/project'
import type { ProjectImporter } from '../port'
import { ProjectImportError } from './errors'
import { inferMediaType } from './media-types'
import { assertSafeProjectPath, pageIdFromPath, pageNameFromId } from './path-utils'

const textDecoder = new TextDecoder()

function createManifest(files: ProjectFile[]): VisualBuilderProject {
  const htmlPaths = files
    .map((file) => file.path)
    .filter((path) => path.toLowerCase().endsWith('.html'))
    .sort()

  if (htmlPaths.length === 0) {
    throw new ProjectImportError(
      'no-pages',
      'El proyecto debe incluir al menos un archivo HTML dentro de pages/.',
    )
  }

  const usedIds = new Set<string>()
  const pages = htmlPaths.map((path, index) => {
    const baseId = pageIdFromPath(path)
    let id = baseId
    let suffix = 2

    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`
      suffix += 1
    }

    usedIds.add(id)
    return { id, name: pageNameFromId(id), file: path, index }
  })

  const preferredStartPage = pages.find((page) =>
    ['index', 'inicio', 'home'].includes(page.id),
  )

  return {
    version: 1,
    name: 'Proyecto importado',
    startPage: preferredStartPage?.id ?? pages[0].id,
    pages: pages.map(({ index: _index, ...page }) => page),
    connections: [],
  }
}

function parseManifest(file: ProjectFile) {
  try {
    const rawManifest: unknown = JSON.parse(textDecoder.decode(file.bytes))
    return ProjectSchema.parse(rawManifest)
  } catch (error) {
    throw new ProjectImportError(
      'invalid-manifest',
      'project.json no tiene un formato válido.',
      { cause: error },
    )
  }
}

function validateReferencedPages(project: VisualBuilderProject, files: ProjectFile[]) {
  const filePaths = new Set(files.map((file) => file.path))

  for (const page of project.pages) {
    if (!filePaths.has(page.file)) {
      throw new ProjectImportError(
        'missing-page',
        `La pantalla “${page.name}” referencia un archivo inexistente: ${page.file}.`,
      )
    }
  }
}

export class ZipProjectImporter implements ProjectImporter {
  async import(source: Blob): Promise<ProjectBundle> {
    let archive: JSZip

    try {
      archive = await JSZip.loadAsync(await source.arrayBuffer())
    } catch (error) {
      throw new ProjectImportError(
        'invalid-archive',
        'No se pudo abrir el archivo ZIP.',
        { cause: error },
      )
    }

    const files: ProjectFile[] = []

    for (const [path, entry] of Object.entries(archive.files)) {
      if (entry.dir || path.startsWith('__MACOSX/')) continue

      try {
        if (entry.unsafeOriginalName) assertSafeProjectPath(entry.unsafeOriginalName)
        assertSafeProjectPath(path)
      } catch (error) {
        throw new ProjectImportError('unsafe-path', `El ZIP contiene una ruta insegura: ${path}.`, {
          cause: error,
        })
      }

      files.push({
        path,
        bytes: await entry.async('uint8array'),
        mediaType: inferMediaType(path),
      })
    }

    const manifestFile = files.find((file) => file.path === 'project.json')
    const manifest = manifestFile ? parseManifest(manifestFile) : createManifest(files)
    validateReferencedPages(manifest, files)

    return { files, manifest }
  }
}

export const zipProjectImporter = new ZipProjectImporter()
