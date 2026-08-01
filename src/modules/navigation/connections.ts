import { ProjectSchema } from '../../core/project'
import type { ProjectConnection, VisualBuilderProject } from '../../core/project'

export type ConnectionAction = ProjectConnection['action']

export interface ConnectionDraft {
  action: ConnectionAction
  elementId: string
  sourcePage: string
  targetPage?: string
  url?: string
}

export interface BrokenConnection {
  connection: ProjectConnection
  reason: string
}

function hash(value: string) {
  let result = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index)
    result = Math.imul(result, 16777619)
  }

  return (result >>> 0).toString(36)
}

function connectionId(sourcePage: string, elementId: string) {
  return `connection-${hash(`${sourcePage}:${elementId}:click`)}`
}

export function findConnection(
  project: VisualBuilderProject,
  sourcePage: string,
  elementId: string,
) {
  return project.connections.find(
    (connection) => connection.sourcePage === sourcePage
      && connection.elementId === elementId
      && connection.event === 'click',
  )
}

export function saveConnection(
  project: VisualBuilderProject,
  draft: ConnectionDraft,
) {
  const existing = findConnection(project, draft.sourcePage, draft.elementId)
  const connection: ProjectConnection = {
    id: existing?.id ?? connectionId(draft.sourcePage, draft.elementId),
    sourcePage: draft.sourcePage,
    elementId: draft.elementId,
    event: 'click',
    action: draft.action,
    ...(draft.action === 'navigate' ? { targetPage: draft.targetPage } : {}),
    ...(draft.action === 'url' ? { url: draft.url } : {}),
  }

  return ProjectSchema.parse({
    ...project,
    connections: [
      ...project.connections.filter((item) => !(item.sourcePage === draft.sourcePage
        && item.elementId === draft.elementId
        && item.event === 'click')),
      connection,
    ],
  })
}

export function deleteConnection(
  project: VisualBuilderProject,
  sourcePage: string,
  elementId: string,
) {
  return {
    ...project,
    connections: project.connections.filter(
      (connection) => !(connection.sourcePage === sourcePage
        && connection.elementId === elementId
        && connection.event === 'click'),
    ),
  }
}

export function findBrokenConnections(
  project: VisualBuilderProject,
  elementIdsByPage: ReadonlyMap<string, ReadonlySet<string>>,
): BrokenConnection[] {
  return project.connections.flatMap((connection) => {
    const sourceElements = elementIdsByPage.get(connection.sourcePage)

    if (!sourceElements) {
      return [{ connection, reason: 'La pantalla de origen ya no existe.' }]
    }

    if (!sourceElements.has(connection.elementId)) {
      return [{ connection, reason: 'El elemento conectado ya no existe.' }]
    }

    if (connection.action === 'navigate'
      && !project.pages.some((page) => page.id === connection.targetPage)) {
      return [{ connection, reason: 'La pantalla de destino ya no existe.' }]
    }

    return []
  })
}
