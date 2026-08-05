import { describe, expect, it } from 'vitest'
import grapesjs from 'grapesjs'
import blocksBasic from 'grapesjs-blocks-basic'
import pluginForms from 'grapesjs-plugin-forms'
import { configureStarterBlocks, starterLayoutBlocks } from './starter-blocks'

describe('starter component blocks', () => {
  it('replaces empty column shells with visible, editable examples', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({ container, headless: true, plugins: [blocksBasic, pluginForms] })
    configureStarterBlocks(editor)

    expect(String(editor.BlockManager.get('column1')?.getContent())).toContain('Un título claro')
    expect(String(editor.BlockManager.get('column2')?.getContent())).toContain('Tu imagen aquí')
    expect(String(editor.BlockManager.get('column3')?.getContent())).toContain('Tercer beneficio')
    expect(String(editor.BlockManager.get('column3-7')?.getContent())).toContain('Contenido principal')
    expect(Object.values(starterLayoutBlocks).every((content) => content.includes('@media(max-width:767px)'))).toBe(true)

    editor.destroy()
    container.remove()
  })

  it('gives common media, text, and form blocks meaningful defaults', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({ container, headless: true, plugins: [blocksBasic, pluginForms] })
    configureStarterBlocks(editor)

    expect(editor.BlockManager.get('text')?.get('label')).toBe('Texto')
    expect(JSON.stringify(editor.BlockManager.get('image')?.getContent())).toContain('Imagen de ejemplo')
    expect(String(editor.BlockManager.get('form')?.getContent())).toContain('Contáctanos')
    expect(editor.BlockManager.get('form')?.get('category')).toBe('Formularios')

    editor.destroy()
    container.remove()
  })
})
