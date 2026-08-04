import { useEffect, useMemo, useRef, useState } from 'react'
import { buildPreviewDocument } from '../modules/preview/buildPreviewDocument'
import {
  isNavigationRuntimeMessage,
} from '../runtime/navigation-runtime'
import type { NavigationRuntimeMessage } from '../runtime/navigation-runtime'
import { isMotionReferenceRuntimeMessage } from '../runtime/motion-runtime'
import type { MotionReferenceRuntimeMessage } from '../runtime/motion-runtime'
import type { EditorPreviewSession } from './editor-preview-session'
import {
  editorPreviewPageAccess,
  editorPreviewPath,
  resolveEditorPreviewPath,
} from './editor-preview-session'

interface EditorRuntimePreviewProps {
  onMotionReference?: (message: MotionReferenceRuntimeMessage) => void
  onRuntimeAction: (message: NavigationRuntimeMessage) => void
  session: EditorPreviewSession
  viewport: EditorPreviewViewport
}

export interface EditorPreviewViewport {
  label: string
  width: string
}

export function EditorRuntimePreview({
  onMotionReference,
  onRuntimeAction,
  session,
  viewport,
}: EditorRuntimePreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [routeInput, setRouteInput] = useState('')
  const [routeError, setRouteError] = useState('')
  const page = session.bundle.manifest.pages.find((candidate) => candidate.id === session.pageId)
  const pixelWidth = Number.parseFloat(viewport.width)
  const hasPixelWidth = Number.isFinite(pixelWidth) && viewport.width.endsWith('px')
  const preview = useMemo(() => {
    if (!page) return ''
    return buildPreviewDocument(session.bundle, page, {
      mode: 'test',
      context: session.context,
    })
  }, [page, session.bundle, session.context])

  useEffect(() => {
    if (!page) return
    setRouteInput(editorPreviewPath(page))
    setRouteError('')
  }, [page])

  useEffect(() => {
    function receiveRuntimeMessage(event: MessageEvent<unknown>) {
      if (event.source !== iframeRef.current?.contentWindow) return
      if (isNavigationRuntimeMessage(event.data)) onRuntimeAction(event.data)
      if (isMotionReferenceRuntimeMessage(event.data)) onMotionReference?.(event.data)
    }

    window.addEventListener('message', receiveRuntimeMessage)
    return () => window.removeEventListener('message', receiveRuntimeMessage)
  }, [onMotionReference, onRuntimeAction])

  useEffect(() => {
    const container = previewRef.current
    if (!container || !hasPixelWidth) {
      setScale(1)
      return
    }

    const fitViewport = () => {
      if (!container.clientWidth) return
      setScale(Math.min(1, container.clientWidth / pixelWidth))
    }
    fitViewport()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(fitViewport)
    observer.observe(container)
    return () => observer.disconnect()
  }, [hasPixelWidth, pixelWidth, viewport.width])

  function navigateToPage(pageId: string) {
    onRuntimeAction({
      source: 'psl-navigation-runtime',
      action: 'navigate',
      targetPage: pageId,
    })
  }

  function openRoute(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const destination = resolveEditorPreviewPath(session.bundle, routeInput)
    if (!destination) {
      setRouteError('Esta ruta no existe en el sitio.')
      return
    }
    setRouteError('')
    setRouteInput(editorPreviewPath(destination))
    if (destination.id !== session.pageId) navigateToPage(destination.id)
  }

  const access = page ? editorPreviewPageAccess(session.bundle, page) : 'public'
  const accessLabel = access === 'authenticated'
    ? 'Protegida'
    : access === 'guestOnly' ? 'Solo visitantes' : 'Pública'

  return (
    <div
      className="gjs-runtime-preview"
      role="application"
      aria-label={`Vista previa interactiva con datos · ${viewport.label}`}
    >
      <div className="gjs-preview-address-bar">
        <form onSubmit={openRoute}>
          <span aria-hidden="true" className="gjs-preview-site-icon">⌂</span>
          <input
            aria-label="Ruta de la vista previa"
            aria-invalid={Boolean(routeError)}
            onChange={(event) => {
              setRouteInput(event.target.value)
              setRouteError('')
            }}
            spellCheck={false}
            value={routeInput}
          />
          <button type="submit">Ir</button>
        </form>
        <select
          aria-label="Abrir otra página"
          onChange={(event) => navigateToPage(event.target.value)}
          value={session.pageId}
        >
          {session.bundle.manifest.pages.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name} · {editorPreviewPath(candidate)}
            </option>
          ))}
        </select>
        <span
          className={`gjs-preview-access gjs-preview-access-${access}`}
          title={access === 'authenticated'
            ? 'Requiere una sesión iniciada'
            : access === 'guestOnly' ? 'Solo se muestra sin una sesión iniciada' : 'No requiere iniciar sesión'}
        >
          <span aria-hidden="true">{access === 'authenticated' ? '◆' : access === 'guestOnly' ? '◇' : '●'}</span>
          {accessLabel}
        </span>
      </div>
      {routeError && <div className="gjs-preview-route-error" role="alert">{routeError}</div>}
      <div className="gjs-runtime-preview-stage" ref={previewRef}>
        <div
          className="gjs-runtime-preview-fit"
          style={{ width: hasPixelWidth ? `${pixelWidth * scale}px` : viewport.width }}
        >
          <div
            className="gjs-runtime-preview-frame"
            style={{
              height: scale < 1 ? `${100 / scale}%` : '100%',
              transform: scale < 1 ? `scale(${scale})` : undefined,
              width: viewport.width,
            }}
          >
            <iframe
              allow="camera"
              key={`${session.pageId}-${session.history.length}`}
              ref={iframeRef}
              sandbox="allow-forms allow-same-origin allow-scripts"
              srcDoc={preview}
              title={`Vista previa de ${page?.name ?? 'la pantalla'}`}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
