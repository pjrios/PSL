import { describe, expect, it } from 'vitest'
import { installEditorCanvasLayoutGuards } from './OpenSourceEditor'

describe('editor canvas layout guards', () => {
  it('caps runaway viewport-height sections only inside the editor document', () => {
    const editorDocument = document
    editorDocument.body.innerHTML = `
      <main class="runaway" style="min-height: 16777213px"></main>
      <section class="normal" style="min-height: 600px"></section>
    `
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 16_777_213 })

    expect(installEditorCanvasLayoutGuards(editorDocument)).toBe(1)
    expect(editorDocument.querySelector('.runaway')).toHaveAttribute('data-psl-editor-viewport-guard', 'true')
    expect(editorDocument.querySelector('.normal')).not.toHaveAttribute('data-psl-editor-viewport-guard')
    expect(editorDocument.head.querySelector('style[data-psl-editor-layout-guards]')?.textContent)
      .toContain('--psl-editor-viewport-height: 720px')
    expect(editorDocument.head.querySelector('style[data-psl-editor-layout-guards]')?.textContent)
      .toContain('--psl-editor-data-card-height: 320px')
    expect(editorDocument.head.querySelector('style[data-psl-editor-layout-guards]')?.textContent)
      .toContain('.psl-data-grid')
    expect(editorDocument.head.querySelector('style[data-psl-editor-layout-guards]')?.textContent)
      .toContain('.lsp-page')
    expect(editorDocument.head.querySelector('style[data-psl-editor-layout-guards]')?.textContent)
      .toContain('grid-template-columns: repeat(var(--psl-data-cols-desktop, 4)')
  })

  it('detects a runaway minimum height even when the iframe viewport itself is normal', () => {
    document.body.innerHTML = '<div class="runaway" style="min-height: 16777213px"></div>'
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 720 })

    expect(installEditorCanvasLayoutGuards(document, 720)).toBe(1)
    expect(document.querySelector('.runaway')).toHaveAttribute('data-psl-editor-viewport-guard', 'true')
  })
})
