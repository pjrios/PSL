import { describe, expect, it, vi } from 'vitest'
import {
  applyComponentLineHeight,
  applyInlineTextStyle,
  cssColorToHex,
  directResizeOptions,
  installEditorCanvasLayoutGuards,
} from './OpenSourceEditor'

describe('inline typography controls', () => {
  it('wraps only the highlighted text with the selected font size', () => {
    document.body.innerHTML = '<p id="text">Edit this phrase</p>'
    const text = document.querySelector('#text')!
    const textNode = text.firstChild!
    const selection = window.getSelection()!
    const range = document.createRange()
    range.setStart(textNode, 5)
    range.setEnd(textNode, 9)
    selection.removeAllRanges()
    selection.addRange(range)

    expect(applyInlineTextStyle({ doc: document, el: text as HTMLElement, selection: () => selection }, 'font-size', '24px')).toBe(true)
    expect(text.innerHTML).toBe('Edit <span style="font-size: 24px;">this</span> phrase')
  })

  it('does not insert formatting without highlighted text', () => {
    document.body.innerHTML = '<p id="text">Nothing selected</p>'
    const text = document.querySelector('#text')!
    const selection = window.getSelection()!
    selection.removeAllRanges()

    expect(applyInlineTextStyle({ doc: document, el: text as HTMLElement, selection: () => selection }, 'font-family', 'Georgia, serif')).toBe(false)
    expect(text.innerHTML).toBe('Nothing selected')
  })

  it('replaces an existing inline value instead of nesting conflicting styles', () => {
    document.body.innerHTML = '<p id="text"><span style="line-height: 2">Two lines</span></p>'
    const text = document.querySelector('#text')!
    const styledText = text.querySelector('span')!
    const selection = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(styledText)
    selection.removeAllRanges()
    selection.addRange(range)

    expect(applyInlineTextStyle({ doc: document, el: text as HTMLElement, selection: () => selection }, 'line-height', 'normal')).toBe(true)
    expect(text.querySelectorAll('[style*="line-height"]').length).toBe(1)
    expect((text.querySelector('[style*="line-height"]') as HTMLElement).style.lineHeight).toBe('normal')
  })

  it('stores line spacing on the component and clears stale nested line heights', () => {
    document.body.innerHTML = '<h1 id="text"><span style="line-height: 2">Saved heading</span></h1>'
    const text = document.querySelector('#text') as HTMLElement
    const descendant = { removeStyle: vi.fn() }
    const component = { addStyle: vi.fn(), find: vi.fn(() => [descendant]) }

    expect(applyComponentLineHeight(
      component as never,
      { doc: document, el: text, selection: () => null },
      '1.15',
    )).toBe(true)
    expect(component.addStyle).toHaveBeenCalledWith({ 'line-height': '1.15' })
    expect(descendant.removeStyle).toHaveBeenCalledWith('line-height')
    expect(text.querySelector('span')).not.toHaveAttribute('style')
  })

  it('normalizes computed RGB colors for the toolbar color input', () => {
    expect(cssColorToHex('rgb(22, 127, 120)')).toBe('#167f78')
    expect(cssColorToHex('#AABBCC')).toBe('#aabbcc')
  })
})

describe('direct canvas resizing', () => {
  it('keeps text height automatic and exposes horizontal handles only', () => {
    expect(directResizeOptions('p', 'text')).toMatchObject({
      bc: false,
      bl: false,
      br: false,
      keepAutoHeight: true,
      tc: false,
      tl: false,
      tr: false,
    })
  })

  it('allows full resizing for containers and media while Shift controls aspect ratio', () => {
    expect(directResizeOptions('div')).toMatchObject({
      minDim: 10,
      ratioDefault: false,
      updateOnMove: true,
    })
    expect(directResizeOptions('img', 'image')).toMatchObject({ ratioDefault: false })
  })

  it('does not resize the document wrapper', () => {
    expect(directResizeOptions('body', 'wrapper')).toBe(false)
  })
})

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
      .toContain('min-height: var(--psl-editor-viewport-height) !important')
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
