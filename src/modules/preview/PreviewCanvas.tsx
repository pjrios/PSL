import { useEffect, useState } from 'react'
import type { ProjectBundle, ProjectPage } from '../../core/project'
import { buildPreviewDocument } from './buildPreviewDocument'

export type Viewport = 'desktop' | 'tablet' | 'mobile'

const viewportWidths: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

interface PreviewCanvasProps {
  bundle: ProjectBundle
  page: ProjectPage
}

export function PreviewCanvas({ bundle, page }: PreviewCanvasProps) {
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    try {
      setPreview(buildPreviewDocument(bundle, page))
      setPreviewError(null)
    } catch (error) {
      setPreview('')
      setPreviewError(error instanceof Error ? error.message : 'No se pudo mostrar la pantalla.')
    }
  }, [bundle, page])

  return (
    <section className="canvas-area">
      <div className="canvas-toolbar">
        <div>
          <span className="status-dot" aria-hidden="true" />
          <strong>{page.name}</strong>
          <span className="file-label">{page.file}</span>
        </div>

        <div className="viewport-switcher" aria-label="Tamaño de vista previa">
          {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((size) => (
            <button
              aria-pressed={viewport === size}
              className={viewport === size ? 'active' : ''}
              key={size}
              onClick={() => setViewport(size)}
              type="button"
            >
              {size === 'desktop' ? 'Escritorio' : size === 'tablet' ? 'Tableta' : 'Móvil'}
            </button>
          ))}
        </div>
      </div>

      <div className="canvas-stage">
        {previewError ? (
          <div className="preview-error" role="alert">{previewError}</div>
        ) : (
          <iframe
            key={`${page.id}-${viewport}`}
            sandbox=""
            srcDoc={preview}
            style={{ width: viewportWidths[viewport] }}
            title={`Vista previa de ${page.name}`}
          />
        )}
      </div>
    </section>
  )
}
