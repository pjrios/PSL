import { useEffect, useRef, useState } from 'react'
import type { ProjectBundle, ProjectPage } from '../../core/project'
import { buildPreviewDocument } from './buildPreviewDocument'
import { describeSelectableElement, findSelectableTarget } from './element-identifiers'

export type Viewport = 'desktop' | 'tablet' | 'mobile'

const viewportWidths: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

interface PreviewCanvasProps {
  bundle: ProjectBundle
  onElementSelect: (selection: PreviewElementSelection | null) => void
  page: ProjectPage
  selectedElementId?: string
}

export interface PreviewElementSelection {
  elementId: string
  label: string
  pageId: string
  tagName: string
}

export function PreviewCanvas({
  bundle,
  onElementSelect,
  page,
  selectedElementId,
}: PreviewCanvasProps) {
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [preview, setPreview] = useState('')
  const [previewError, setPreviewError] = useState<string | null>(null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    try {
      setPreview(buildPreviewDocument(bundle, page))
      setPreviewError(null)
    } catch (error) {
      setPreview('')
      setPreviewError(error instanceof Error ? error.message : 'No se pudo mostrar la pantalla.')
    }
  }, [bundle.files, page.file, page.id])

  function updateSelectionHighlight(document: Document) {
    document.querySelectorAll<HTMLElement>('[data-builder-selected]')
      .forEach((element) => element.removeAttribute('data-builder-selected'))

    if (!selectedElementId) return
    const selected = [...document.querySelectorAll<HTMLElement>('[data-builder-element-id]')]
      .find((element) => element.dataset.builderElementId === selectedElementId)
    selected?.setAttribute('data-builder-selected', 'true')
  }

  function connectSelectionEvents() {
    const document = iframeRef.current?.contentDocument
    if (!document) return undefined

    const selectElement = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()

      const eventTarget = event.target
      const target = document.defaultView && eventTarget instanceof document.defaultView.Element
        ? findSelectableTarget(eventTarget)
        : null

      if (!target?.dataset.builderElementId) {
        onElementSelect(null)
        return
      }

      onElementSelect({
        elementId: target.dataset.builderElementId,
        label: describeSelectableElement(target),
        pageId: page.id,
        tagName: target.tagName.toLowerCase(),
      })
    }

    document.addEventListener('click', selectElement, true)
    updateSelectionHighlight(document)
    return () => document.removeEventListener('click', selectElement, true)
  }

  useEffect(() => {
    const document = iframeRef.current?.contentDocument
    if (document) updateSelectionHighlight(document)
  }, [selectedElementId])

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
            ref={iframeRef}
            key={`${page.id}-${viewport}`}
            onLoad={connectSelectionEvents}
            sandbox="allow-same-origin"
            srcDoc={preview}
            style={{ width: viewportWidths[viewport] }}
            title={`Vista previa de ${page.name}`}
          />
        )}
      </div>
    </section>
  )
}
