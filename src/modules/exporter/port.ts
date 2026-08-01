import type { ProjectBundle } from '../../core/project'

export interface ProjectExporter {
  export(bundle: ProjectBundle): Promise<Blob>
}
