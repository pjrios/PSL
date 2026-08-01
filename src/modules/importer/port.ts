import type { ProjectBundle } from '../../core/project'

export interface ProjectImporter {
  import(source: Blob): Promise<ProjectBundle>
}
