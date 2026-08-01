import type { VisualBuilderProject } from './schema'

export interface ProjectFile {
  bytes: Uint8Array
  mediaType?: string
  path: string
}

export interface ProjectBundle {
  files: ProjectFile[]
  manifest: VisualBuilderProject
}
