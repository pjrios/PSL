import { useEffect, useMemo, useRef } from 'react'
import type { ReactNode } from 'react'
import type {
  NavigationContext,
  ProjectBundle,
  ProjectPage,
  StyleDeclaration,
} from '../../core/project'
import { isNavigationRuntimeMessage } from '../../runtime/navigation-runtime'
import type { NavigationRuntimeMessage } from '../../runtime/navigation-runtime'
import { buildPreviewDocument } from './buildPreviewDocument'
import { describeSelectableElement, findSelectableTarget } from './element-identifiers'

export type Viewport = 'desktop' | 'tablet' | 'mobile'
export type PreviewMode = 'edit' | 'test'

const viewportWidths: Record<Viewport, string> = {
  desktop: '100%',
  tablet: '768px',
  mobile: '390px',
}

interface PreviewCanvasProps {
  bundle: ProjectBundle
  mode: PreviewMode
  onElementSelect: (selection: PreviewElementSelection | null) => void
  onModeChange: (mode: PreviewMode) => void
  onRuntimeAction: (message: NavigationRuntimeMessage) => void
  page: ProjectPage
  selectedElementId?: string
  viewport: Viewport
  onViewportChange: (viewport: Viewport) => void
  projectActions?: ReactNode
  context?: NavigationContext
}

export interface PreviewElementSelection {
  elementId: string
  label: string
  pageId: string
  tagName: string
  text: string
  src: string
  alt: string
  href: string
  title: string
  ariaLabel: string
  hasChildren: boolean
  isInteractive: boolean
  computedStyles: StyleDeclaration
}

export function PreviewCanvas({
  bundle,
  mode,
  onElementSelect,
  onModeChange,
  onRuntimeAction,
  page,
  selectedElementId,
  viewport,
  onViewportChange,
  projectActions,
  context,
}: PreviewCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  const { preview, previewError } = useMemo(() => {
    try {
      return {
        preview: buildPreviewDocument(bundle, page, { mode, context }),
        previewError: null,
      }
    } catch (error) {
      return {
        preview: '',
        previewError: error instanceof Error
          ? error.message
          : 'No se pudo mostrar la pantalla.',
      }
    }
  }, [bundle, context, mode, page])

  useEffect(() => {
    function receiveRuntimeMessage(event: MessageEvent<unknown>) {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (isNavigationRuntimeMessage(event.data)) onRuntimeAction(event.data)
    }

    window.addEventListener('message', receiveRuntimeMessage)
    return () => window.removeEventListener('message', receiveRuntimeMessage)
  }, [onRuntimeAction])

  function updateSelectionHighlight(document: Document) {
    document.querySelectorAll<HTMLElement>('[data-builder-selected]')
      .forEach((element) => element.removeAttribute('data-builder-selected'))

    if (!selectedElementId) return
    const selected = [...document.querySelectorAll<HTMLElement>('[data-builder-element-id]')]
      .find((element) => element.dataset.builderElementId === selectedElementId)
    selected?.setAttribute('data-builder-selected', 'true')
  }

  function connectSelectionEvents() {
    if (mode !== 'edit') return
    const document = iframeRef.current?.contentDocument
    if (!document) return

    const describeSelection = (target: HTMLElement) => {
      const computed = document.defaultView!.getComputedStyle(target)
      onElementSelect({
        elementId: target.dataset.builderElementId!,
        label: describeSelectableElement(target),
        pageId: page.id,
        tagName: target.tagName.toLowerCase(),
        text: target.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        src: target.getAttribute('src') ?? '',
        alt: target.getAttribute('alt') ?? '',
        href: target.dataset.builderOriginalHref ?? target.getAttribute('href') ?? '',
        title: target.getAttribute('title') ?? '',
        ariaLabel: target.getAttribute('aria-label') ?? '',
        hasChildren: target.children.length > 0,
        isInteractive: target.matches(
          'a, button, input, select, textarea, summary, [role="button"], [tabindex]',
        ),
        computedStyles: {
          width: computed.width,
          height: computed.height,
          margin: computed.margin,
          padding: computed.padding,
          gap: computed.gap,
          backgroundColor: computed.backgroundColor,
          borderColor: computed.borderColor,
          borderWidth: computed.borderWidth,
          borderRadius: computed.borderRadius,
          boxShadow: computed.boxShadow,
          opacity: computed.opacity,
          visibility: computed.visibility,
          color: computed.color,
          fontSize: computed.fontSize,
          fontWeight: computed.fontWeight,
          textAlign: computed.textAlign,
          display: computed.display,
          flexDirection: computed.flexDirection,
          justifyContent: computed.justifyContent,
          justifyItems: computed.justifyItems,
          alignItems: computed.alignItems,
          flexWrap: computed.flexWrap,
          objectFit: computed.objectFit,
          objectPosition: computed.objectPosition,
        },
      })
    }

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

      describeSelection(target as HTMLElement)
    }

    document.addEventListener('click', selectElement, true)
    updateSelectionHighlight(document)
    const selected = selectedElementId
      ? [...document.querySelectorAll<HTMLElement>('[data-builder-element-id]')]
        .find((element) => element.dataset.builderElementId === selectedElementId)
      : undefined
    if (selected) describeSelection(selected)
  }

  useEffect(() => {
    if (mode !== 'edit') return
    const document = iframeRef.current?.contentDocument
    if (document) updateSelectionHighlight(document)
  }, [mode, selectedElementId])

  return (
    <section className="canvas-area">
      <div className="canvas-toolbar">
        <div>
          <strong>{page.name}</strong>
          <span className="file-label">{page.file}</span>
        </div>

        <div className="canvas-controls">
          <div className="mode-switcher" aria-label="Modo de vista previa">
            {(['edit', 'test'] as PreviewMode[]).map((value) => (
              <button
                aria-pressed={mode === value}
                className={mode === value ? 'active' : ''}
                data-tooltip={value === 'edit' ? 'Editar' : 'Vista previa'}
                key={value}
                onClick={() => onModeChange(value)}
                type="button"
              >
                {value === 'edit' ? 'Editar' : 'Vista previa'}
              </button>
            ))}
          </div>

          <div className="viewport-switcher" aria-label="Tamaño de vista previa">
            {(['desktop', 'tablet', 'mobile'] as Viewport[]).map((size) => (
              <button
                aria-label={size === 'desktop' ? 'Escritorio' : size === 'tablet' ? 'Tableta' : 'Móvil'}
                aria-pressed={viewport === size}
                className={`${viewport === size ? 'active' : ''} viewport-button ${size}`}
                data-tooltip={size === 'desktop' ? 'Escritorio' : size === 'tablet' ? 'Tableta' : 'Móvil'}
                key={size}
                onClick={() => onViewportChange(size)}
                type="button"
              >
                <span aria-hidden="true" />
              </button>
            ))}
          </div>

          {projectActions && (
            <div className="canvas-project-actions" aria-label="Acciones del proyecto">
              {projectActions}
            </div>
          )}
        </div>
      </div>

      <div className="canvas-stage">
        {previewError ? (
          <div className="preview-error" role="alert">{previewError}</div>
        ) : (
          <iframe
            ref={iframeRef}
            key={`${page.id}-${viewport}-${mode}`}
            onLoad={connectSelectionEvents}
            sandbox={mode === 'edit' ? 'allow-same-origin' : 'allow-scripts'}
            srcDoc={preview}
            style={{ width: viewportWidths[viewport] }}
            title={`Vista previa de ${page.name}`}
          />
        )}
      </div>
    </section>
  )
}
