import type { NavigationContext, ProjectBundle, ProjectPage } from '../core/project'
import type { NavigationRuntimeMessage } from '../runtime/navigation-runtime'

export interface EditorPreviewDestination {
  context: NavigationContext
  pageId: string
}

export interface EditorPreviewSession extends EditorPreviewDestination {
  bundle: ProjectBundle
  history: EditorPreviewDestination[]
}

export interface EditorPreviewTransition {
  externalUrl?: string
  session: EditorPreviewSession
}

export type EditorPreviewPageAccess = 'public' | 'authenticated' | 'guestOnly'

export function editorPreviewPath(page: ProjectPage) {
  const withoutExtension = page.file.replace(/\.html?$/i, '')
  const route = withoutExtension.replace(/^pages\//i, '').replace(/^\/+|\/+$/g, '')
  return route.toLowerCase() === 'index' ? '/' : `/${route}`
}

export function resolveEditorPreviewPath(bundle: ProjectBundle, requestedPath: string) {
  try {
    const pathname = new URL(requestedPath.trim(), 'https://preview.local').pathname
    const normalized = pathname.length > 1 ? pathname.replace(/\/+$/g, '') : pathname
    return bundle.manifest.pages.find((page) => editorPreviewPath(page) === normalized)
  } catch {
    return undefined
  }
}

export function editorPreviewPageAccess(
  bundle: ProjectBundle,
  page: ProjectPage,
): EditorPreviewPageAccess {
  if (page.access) return page.access
  const authentication = bundle.manifest.authentication
  if (!authentication) return 'public'
  return page.id === authentication.loginPage ? 'guestOnly' : 'authenticated'
}

export function createEditorPreviewSession(bundle: ProjectBundle, requestedPageId?: string) {
  const pageId = bundle.manifest.pages.some((page) => page.id === requestedPageId)
    ? requestedPageId!
    : bundle.manifest.startPage
  const destination = { pageId, context: {} }

  return {
    bundle,
    ...destination,
    history: [destination],
  } satisfies EditorPreviewSession
}

export function applyEditorPreviewAction(
  current: EditorPreviewSession,
  message: NavigationRuntimeMessage,
): EditorPreviewTransition {
  if (message.action === 'navigate' && message.targetPage) {
    if (!current.bundle.manifest.pages.some((page) => page.id === message.targetPage)) {
      return { session: current }
    }

    const destination = {
      pageId: message.targetPage,
      context: message.context ?? {},
    }
    return {
      session: {
        ...current,
        ...destination,
        history: [...current.history, destination],
      },
    }
  }

  if (message.action === 'back') {
    if (current.history.length <= 1) return { session: current }
    const history = current.history.slice(0, -1)
    const destination = history.at(-1)!
    return { session: { ...current, ...destination, history } }
  }

  if (message.action === 'url' && message.url) {
    try {
      const url = new URL(message.url)
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return { session: current, externalUrl: url.href }
      }
    } catch {
      return { session: current }
    }
  }

  return { session: current }
}
