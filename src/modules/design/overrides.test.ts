import { describe, expect, it } from 'vitest'
import type { VisualBuilderProject } from '../../core/project'
import {
  applyContentOverrides,
  createOverrideCss,
  resetElementOverride,
  saveContentOverride,
  saveStyleProperty,
} from './overrides'

const project: VisualBuilderProject = {
  version: 2,
  name: 'Design fixture',
  startPage: 'home',
  pages: [{ id: 'home', name: 'Home', file: 'index.html' }],
  connections: [],
  elementOverrides: [],
}

describe('design overrides', () => {
  it('applies content without changing the source markup', () => {
    const connected = saveContentOverride(
      project,
      'home',
      'home::main:1/button:1',
      { text: 'Start now', ariaLabel: 'Start practice' },
    )
    const document = new DOMParser().parseFromString(
      '<html><body><main><button>Original</button></main></body></html>',
      'text/html',
    )

    applyContentOverrides(document, connected, 'home')

    expect(document.querySelector('button')?.textContent).toBe('Start now')
    expect(document.querySelector('button')?.getAttribute('aria-label')).toBe('Start practice')
    expect(document.querySelector('button')?.dataset.pslOverrideId)
      .toBe('home::main:1/button:1')
  })

  it('generates state and responsive CSS', () => {
    const base = saveStyleProperty(
      project,
      'home',
      'home::main:1/button:1',
      'desktop',
      'base',
      'backgroundColor',
      '#176f70',
    )
    const hover = saveStyleProperty(
      base,
      'home',
      'home::main:1/button:1',
      'desktop',
      'hover',
      'transform',
      'translateY(-2px)',
    )
    const mobile = saveStyleProperty(
      hover,
      'home',
      'home::main:1/button:1',
      'mobile',
      'base',
      'width',
      '100%',
    )
    const spacing = saveStyleProperty(
      mobile,
      'home',
      'home::main:1/button:1',
      'mobile',
      'base',
      'paddingTop',
      '16px',
    )
    const css = createOverrideCss(spacing)

    expect(css).toContain('background-color:#176f70')
    expect(css).toContain(':hover{transform:translateY(-2px);}')
    expect(css).toContain('@media (max-width: 520px)')
    expect(css).toContain('width:100%')
    expect(css).toContain('padding-top:16px')
    expect(resetElementOverride(spacing, 'home', 'home::main:1/button:1').elementOverrides)
      .toEqual([])
  })
})
