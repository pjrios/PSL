import { useState } from 'react'
import type { ProjectBundle } from '../../../core/project'
import { validateStaticArchive } from '../validation/validateStaticArchive'
import { zipProjectExporter } from '../zip/ZipProjectExporter'

interface ExportProjectButtonProps {
  bundle: ProjectBundle
  disabled?: boolean
}

function safeFilename(name: string) {
  const normalized = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  return `${normalized || 'proyecto'}-psl.zip`
}

export function ExportProjectButton({ bundle, disabled }: ExportProjectButtonProps) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function exportProject() {
    setExporting(true)
    setError(null)

    try {
      const blob = await zipProjectExporter.export(bundle)
      const validation = await validateStaticArchive(blob)
      if (!validation.valid) {
        throw new Error(`La exportación no está lista para hosting: ${validation.errors[0]}`)
      }
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = safeFilename(bundle.manifest.name)
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo exportar el proyecto.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="export-control">
      <button
        className="button primary"
        disabled={disabled || exporting}
        onClick={exportProject}
        title={disabled ? 'Corrige las conexiones rotas antes de exportar.' : undefined}
        type="button"
      >
        {exporting ? 'Preparando…' : 'Exportar ZIP'}
      </button>
      {error && <p className="export-error" role="alert">{error}</p>}
    </div>
  )
}
