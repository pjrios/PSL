export interface NavigationRuntimeConnection {
  action: 'navigate' | 'back' | 'url'
  elementId: string
  event: 'click'
  sourcePage: string
  targetPage?: string
  url?: string
}

export interface NavigationRuntimeConfig {
  connections: NavigationRuntimeConnection[]
  currentPage: string
  pageUrls: Record<string, string>
  transport: 'location' | 'message'
}

export interface NavigationRuntimeMessage {
  action: 'navigate' | 'back' | 'url'
  source: 'psl-navigation-runtime'
  targetPage?: string
  url?: string
}

declare global {
  interface Window {
    __PSL_NAVIGATION__?: NavigationRuntimeConfig
  }
}

export function installNavigationRuntime(
  runtimeWindow: Window = window,
  runtimeDocument: Document = document,
) {
  const config = runtimeWindow.__PSL_NAVIGATION__
  if (!config) return () => undefined
  const runtimeConfig = config

  function elementPosition(element: Element) {
    let position = 1
    let sibling = element.previousElementSibling

    while (sibling) {
      if (sibling.tagName === element.tagName) position += 1
      sibling = sibling.previousElementSibling
    }

    return position
  }

  function stableElementId(element: Element) {
    const segments: string[] = []
    let current: Element | null = element

    while (current && current.tagName !== 'BODY') {
      segments.unshift(`${current.tagName.toLowerCase()}:${elementPosition(current)}`)
      current = current.parentElement
    }

    return `${runtimeConfig.currentPage}::${segments.join('/')}`
  }

  runtimeDocument.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (!['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName)) {
      element.dataset.pslElementId = stableElementId(element)
    }
  })

  function sendMessage(connection: NavigationRuntimeConnection) {
    const message: NavigationRuntimeMessage = {
      source: 'psl-navigation-runtime',
      action: connection.action,
      ...(connection.targetPage ? { targetPage: connection.targetPage } : {}),
      ...(connection.url ? { url: connection.url } : {}),
    }
    runtimeWindow.parent.postMessage(message, '*')
  }

  function execute(connection: NavigationRuntimeConnection) {
    if (runtimeConfig.transport === 'message') {
      sendMessage(connection)
      return
    }

    if (connection.action === 'navigate' && connection.targetPage) {
      const targetUrl = runtimeConfig.pageUrls[connection.targetPage]
      if (targetUrl) runtimeWindow.location.assign(targetUrl)
      return
    }

    if (connection.action === 'back') {
      runtimeWindow.history.back()
      return
    }

    if (connection.action === 'url' && connection.url) {
      runtimeWindow.location.assign(connection.url)
    }
  }

  function handleClick(event: Event) {
    const eventTarget = event.target
    let element = eventTarget && typeof (eventTarget as Element).getAttribute === 'function'
      ? eventTarget as Element
      : null
    let connection: NavigationRuntimeConnection | undefined

    while (element && element !== runtimeDocument.body) {
      const elementId = element.getAttribute('data-psl-element-id')
      connection = runtimeConfig.connections.find((candidate) =>
        candidate.sourcePage === runtimeConfig.currentPage
          && candidate.elementId === elementId
          && candidate.event === 'click')
      if (connection) break
      element = element.parentElement
    }

    if (!connection) return
    event.preventDefault()
    event.stopPropagation()
    execute(connection)
  }

  runtimeDocument.addEventListener('click', handleClick, true)
  return () => runtimeDocument.removeEventListener('click', handleClick, true)
}

export function createNavigationRuntimeSource() {
  return `(${installNavigationRuntime.toString()})();\n`
}

export function createNavigationConfigSource(config: NavigationRuntimeConfig) {
  const serialized = JSON.stringify(config).replaceAll('<', '\\u003c')
  return `window.__PSL_NAVIGATION__ = ${serialized};\n`
}

export function isNavigationRuntimeMessage(value: unknown): value is NavigationRuntimeMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (message.source !== 'psl-navigation-runtime') return false
  if (message.action === 'back') return true
  if (message.action === 'navigate') return typeof message.targetPage === 'string'
  if (message.action === 'url') return typeof message.url === 'string'
  return false
}
