const excludedTags = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'])

function elementPosition(element: Element) {
  let position = 1
  let sibling = element.previousElementSibling

  while (sibling) {
    if (sibling.tagName === element.tagName) position += 1
    sibling = sibling.previousElementSibling
  }

  return position
}

export function createStableElementId(element: Element, pageId: string) {
  const segments: string[] = []
  let current: Element | null = element

  while (current && current.tagName !== 'BODY') {
    segments.unshift(`${current.tagName.toLowerCase()}:${elementPosition(current)}`)
    current = current.parentElement
  }

  return `${pageId}::${segments.join('/')}`
}

export function assignStableElementIds(document: Document, pageId: string) {
  const elements = [...document.body.querySelectorAll<HTMLElement>('*')]
    .filter((element) => !excludedTags.has(element.tagName))

  for (const element of elements) {
    element.dataset.builderElementId = createStableElementId(element, pageId)
  }

  return elements.map((element) => element.dataset.builderElementId!)
}

export function describeSelectableElement(element: HTMLElement) {
  const accessibleName = element.getAttribute('aria-label')?.trim()
  const alternativeText = element.getAttribute('alt')?.trim()
  const text = element.textContent?.replace(/\s+/g, ' ').trim()

  return accessibleName || alternativeText || text?.slice(0, 80) || `<${element.tagName.toLowerCase()}>`
}

export function findSelectableTarget(target: Element) {
  const interactive = target.closest<HTMLElement>(
    'a, button, input[type="button"], input[type="submit"], [role="button"]',
  )

  return interactive ?? target.closest<HTMLElement>('[data-builder-element-id]')
}
