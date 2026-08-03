export const FLOW_ACTION_ATTRIBUTE = 'data-psl-flow-action'
export const FLOW_TARGET_ATTRIBUTE = 'data-psl-flow-target'
const FLOW_PREVIEW_MESSAGE_SOURCE = 'psl-screen-flow-preview'

export interface ScreenFlowConnection {
  action: 'navigate'
  targetPageId: string
}

export function readScreenFlowConnection(
  attributes: Record<string, unknown>,
): ScreenFlowConnection | null {
  const action = attributes[FLOW_ACTION_ATTRIBUTE]
  const targetPageId = attributes[FLOW_TARGET_ATTRIBUTE]

  if (action !== 'navigate' || typeof targetPageId !== 'string' || !targetPageId.trim()) {
    return null
  }

  return { action, targetPageId }
}

export function screenFlowAttributes(targetPageId: string) {
  return {
    [FLOW_ACTION_ATTRIBUTE]: 'navigate',
    [FLOW_TARGET_ATTRIBUTE]: targetPageId,
  } as const
}

interface FlowNavigationOptions {
  isEnabled: () => boolean
  navigate: (pageId: string) => void
  pageExists: (pageId: string) => boolean
}

export function installScreenFlowNavigation(
  document: Document,
  { isEnabled, navigate, pageExists }: FlowNavigationOptions,
) {
  const frameWindow = document.defaultView
  if (!frameWindow) return () => undefined

  function handleClick(event: MouseEvent) {
    if (!isEnabled()) return
    const connectedElement = event.currentTarget as HTMLElement | null
    const targetPageId = connectedElement?.getAttribute(FLOW_TARGET_ATTRIBUTE)?.trim()
    if (!targetPageId || !pageExists(targetPageId)) return

    event.preventDefault()
    event.stopImmediatePropagation()
    globalThis.setTimeout(() => navigate(targetPageId), 0)
  }

  const connectedElements = [...document.querySelectorAll<HTMLElement>(`[${FLOW_TARGET_ATTRIBUTE}]`)]
  const originalOnclickAttributes = new Map(
    connectedElements.map((element) => [element, element.getAttribute('onclick')]),
  )
  const inlinePreviewBridge = [
    'event.preventDefault()',
    'event.stopPropagation()',
    `window.parent.postMessage({source:'${FLOW_PREVIEW_MESSAGE_SOURCE}',targetPageId:this.getAttribute('${FLOW_TARGET_ATTRIBUTE}')},'*')`,
  ].join(';')

  function handleMessage(event: MessageEvent) {
    if (event.source !== frameWindow) return
    const message = event.data as { source?: unknown; targetPageId?: unknown } | null
    if (message?.source !== FLOW_PREVIEW_MESSAGE_SOURCE
      || typeof message.targetPageId !== 'string'
      || !pageExists(message.targetPageId)) return
    globalThis.setTimeout(() => navigate(message.targetPageId as string), 0)
  }

  frameWindow.parent.addEventListener('message', handleMessage)
  connectedElements.forEach((element) => {
    element.setAttribute('onclick', inlinePreviewBridge)
    if (frameWindow.parent === frameWindow) element.addEventListener('click', handleClick, true)
  })
  return () => {
    frameWindow.parent.removeEventListener('message', handleMessage)
    connectedElements.forEach((element) => {
      const originalOnclick = originalOnclickAttributes.get(element)
      if (originalOnclick === null || originalOnclick === undefined) element.removeAttribute('onclick')
      else element.setAttribute('onclick', originalOnclick)
      if (frameWindow.parent === frameWindow) element.removeEventListener('click', handleClick, true)
    })
  }
}
