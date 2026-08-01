import { describe, expect, it } from 'vitest'
import {
  assignStableElementIds,
  createStableElementId,
  describeSelectableElement,
  findSelectableTarget,
} from './element-identifiers'

describe('preview element identifiers', () => {
  it('creates deterministic identifiers from the DOM hierarchy', () => {
    const document = new DOMParser().parseFromString(
      '<body><main><button>First</button><button>Second</button></main></body>',
      'text/html',
    )
    const buttons = document.querySelectorAll('button')

    expect(createStableElementId(buttons[0], 'home')).toBe('home::main:1/button:1')
    expect(createStableElementId(buttons[1], 'home')).toBe('home::main:1/button:2')
  })

  it('assigns identifiers without changing classes or inline styles', () => {
    const document = new DOMParser().parseFromString(
      '<body><section class="card" style="color: teal"><span>Hello</span></section></body>',
      'text/html',
    )

    expect(assignStableElementIds(document, 'home')).toEqual([
      'home::section:1',
      'home::section:1/span:1',
    ])
    expect(document.querySelector('section')?.getAttribute('class')).toBe('card')
    expect(document.querySelector('section')?.getAttribute('style')).toBe('color: teal')
  })

  it('describes an element using its accessible name before its text', () => {
    const document = new DOMParser().parseFromString(
      '<body><button aria-label="Open practice">Ignored text</button></body>',
      'text/html',
    )

    expect(describeSelectableElement(document.querySelector('button')!)).toBe('Open practice')
  })

  it('prefers the actionable parent when clicking its child', () => {
    const document = new DOMParser().parseFromString(
      '<body><button data-builder-element-id="button"><span data-builder-element-id="label">Continue</span></button></body>',
      'text/html',
    )

    expect(findSelectableTarget(document.querySelector('span')!)?.dataset.builderElementId).toBe('button')
  })
})
