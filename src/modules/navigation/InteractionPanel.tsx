import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { VisualBuilderProject } from '../../core/project'
import type { BrokenConnection, ConnectionAction, ConnectionDraft } from './connections'
import { findConnection } from './connections'

export interface SelectedElement {
  elementId: string
  label: string
  pageId: string
  tagName: string
}

interface InteractionPanelProps {
  brokenConnections: BrokenConnection[]
  onDelete: (sourcePage: string, elementId: string) => void
  onSave: (draft: ConnectionDraft) => void
  project: VisualBuilderProject
  selection: SelectedElement | null
}

const actionLabels: Record<ConnectionAction, string> = {
  navigate: 'Ir a otra pantalla',
  back: 'Regresar',
  url: 'Abrir una URL',
}

function isSafeWebUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function InteractionPanel({
  brokenConnections,
  onDelete,
  onSave,
  project,
  selection,
}: InteractionPanelProps) {
  const existing = selection
    ? findConnection(project, selection.pageId, selection.elementId)
    : undefined
  const defaultTarget = project.pages.find((page) => page.id !== selection?.pageId)?.id
    ?? project.pages[0]?.id
  const [action, setAction] = useState<ConnectionAction>('navigate')
  const [targetPage, setTargetPage] = useState(defaultTarget ?? '')
  const [url, setUrl] = useState('https://')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setAction(existing?.action ?? 'navigate')
    setTargetPage(existing?.targetPage ?? defaultTarget ?? '')
    setUrl(existing?.url ?? 'https://')
    setError(null)
  }, [defaultTarget, existing, selection?.elementId])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selection) return

    if (action === 'navigate' && !targetPage) {
      setError('Selecciona una pantalla de destino.')
      return
    }

    if (action === 'url' && !isSafeWebUrl(url)) {
      setError('Escribe una dirección completa que comience con http:// o https://.')
      return
    }

    onSave({
      action,
      elementId: selection.elementId,
      sourcePage: selection.pageId,
      ...(action === 'navigate' ? { targetPage } : {}),
      ...(action === 'url' ? { url } : {}),
    })
    setError(null)
  }

  return (
    <aside className="sidebar inspector-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Configuración</span>
          <h2>Interacción</h2>
        </div>
      </div>

      {!selection ? (
        <div className="empty-inspector">
          <span className="cursor-illustration" aria-hidden="true">↖</span>
          <h3>Ningún elemento seleccionado</h3>
          <p>Haz clic sobre un elemento de la pantalla para conectarlo.</p>
        </div>
      ) : (
        <form className="interaction-form" noValidate onSubmit={submit}>
          <div className="selected-element-card">
            <span className="element-tag">{selection.tagName}</span>
            <strong>{selection.label}</strong>
            <small>{selection.elementId}</small>
          </div>

          <label>
            Al hacer clic
            <select value={action} onChange={(event) => setAction(event.target.value as ConnectionAction)}>
              {(Object.keys(actionLabels) as ConnectionAction[]).map((value) => (
                <option key={value} value={value}>{actionLabels[value]}</option>
              ))}
            </select>
          </label>

          {action === 'navigate' && (
            <label>
              Pantalla de destino
              <select value={targetPage} onChange={(event) => setTargetPage(event.target.value)}>
                {project.pages.map((page) => (
                  <option key={page.id} value={page.id}>{page.name}</option>
                ))}
              </select>
            </label>
          )}

          {action === 'url' && (
            <label>
              Dirección web
              <input
                inputMode="url"
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://ejemplo.com"
                type="url"
                value={url}
              />
            </label>
          )}

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="interaction-actions">
            <button className="button primary" type="submit">
              {existing ? 'Actualizar conexión' : 'Guardar conexión'}
            </button>
            {existing && (
              <button
                className="button danger"
                onClick={() => onDelete(selection.pageId, selection.elementId)}
                type="button"
              >
                Eliminar
              </button>
            )}
          </div>
        </form>
      )}

      {brokenConnections.length > 0 && (
        <section className="connection-warnings" aria-labelledby="connection-warnings-title">
          <h3 id="connection-warnings-title">
            {brokenConnections.length} conexión{brokenConnections.length === 1 ? '' : 'es'} por revisar
          </h3>
          <ul>
            {brokenConnections.map(({ connection, reason }) => (
              <li key={connection.id}>
                <strong>{connection.sourcePage}</strong>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <dl className="foundation-status">
        <div><dt>Esquema</dt><dd>project.json v1</dd></div>
        <div><dt>Páginas</dt><dd>{project.pages.length} válidas</dd></div>
        <div><dt>Conexiones</dt><dd>{project.connections.length}</dd></div>
        <div><dt>Modo</dt><dd>Edición</dd></div>
      </dl>
    </aside>
  )
}
