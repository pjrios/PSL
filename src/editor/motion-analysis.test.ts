import { describe, expect, it } from 'vitest'
import grapesjs from 'grapesjs'
import {
  createMotionAnalysisPlugin,
  motionAnalysisMarkup,
  MOTION_ANALYSIS_BLOCK_ID,
  MOTION_CAPTURE_REFERENCE_BLOCK_ID,
  MOTION_COMPARE_BLOCK_ID,
  MOTION_VIEW_REFERENCE_BLOCK_ID,
  motionComponentStyles,
  readMotionActivities,
  upgradeMotionActivity,
} from './motion-analysis'

function documentWith(markup: string) {
  return new DOMParser().parseFromString(markup, 'text/html')
}

describe('motion editor contract', () => {
  it('builds an editable composition instead of a fixed monolith', () => {
    const document = documentWith(motionAnalysisMarkup())
    const root = document.querySelector('[data-motion-activity]')

    expect(root?.querySelector('[data-motion-part="input"]')).not.toBeNull()
    expect(root?.querySelector('[data-motion-part="controls"]')).not.toBeNull()
    expect(root?.querySelector('[data-motion-part="results"]')).not.toBeNull()
    expect(root?.getAttribute('style')).toBeNull()
  })

  it('offers purpose-specific MediaPipe blocks with matching editor metadata', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({ container, headless: true, plugins: [createMotionAnalysisPlugin()] })

    expect([
      MOTION_VIEW_REFERENCE_BLOCK_ID,
      MOTION_COMPARE_BLOCK_ID,
      MOTION_ANALYSIS_BLOCK_ID,
      MOTION_CAPTURE_REFERENCE_BLOCK_ID,
    ].map((id) => editor.BlockManager.get(id)?.get('label'))).toEqual([
      'Ver referencia',
      'Comparar movimientos',
      'Analizar movimiento',
      'Capturar referencia',
    ])
    expect(documentWith(motionAnalysisMarkup('reference-view')).querySelector('[data-motion-activity]')
      ?.getAttribute('data-motion-component-type')).toBe('reference-view')
    expect(documentWith(motionAnalysisMarkup('reference-view')).querySelector('[data-motion-reference-replay]'))
      .not.toBeNull()
    expect(documentWith(motionAnalysisMarkup('reference-capture')).querySelector('[data-motion-activity]')
      ?.getAttribute('data-motion-mode')).toBe('reference')
    expect(motionComponentStyles).toContain('[data-motion-component-type="reference-view"] .motion-input')
    expect(motionComponentStyles).toContain('object-fit:contain')
    expect(motionComponentStyles).toContain('aspect-ratio:4/3')
    expect(motionComponentStyles).toContain('.motion-input video{object-fit:cover')
    expect(motionComponentStyles).not.toContain('min-height:clamp(15rem,42vw,28rem)')

    editor.destroy()
    container.remove()
  })

  it('supports analyze and reference-authoring operations without requiring a comparison reference', () => {
    const activities = readMotionActivities(documentWith(`
      <section data-motion-activity="true" data-motion-mode="analyze" data-motion-input-source="url" data-motion-input-url="https://media.example/input.mp4"></section>
      <section data-motion-activity="true" data-motion-mode="reference" data-motion-input-source="element" data-motion-input-selector="#source-video" data-motion-duration="4000"></section>
    `), 'motion', [])

    expect(activities[0]).toEqual(expect.objectContaining({
      mode: 'analyze', input: { type: 'url', url: 'https://media.example/input.mp4' }, reference: { type: 'none' },
    }))
    expect(activities[1]).toEqual(expect.objectContaining({
      mode: 'reference', input: { type: 'element', selector: '#source-video', durationMs: 4000 }, reference: { type: 'none' },
    }))
  })

  it('exports the chosen reference-record strategy', () => {
    const activities = readMotionActivities(documentWith(`
      <section data-motion-activity="true" data-motion-mode="compare"
        data-motion-component-type="compare" data-motion-reference-source="data"
        data-motion-reference-table="practices" data-motion-reference-context="record"
        data-motion-reference-record-mode="specific" data-motion-reference-record-id="practice-42"
        data-motion-reference-video-field="media_url"
        data-motion-reference-template-field="mediapipe_reference"></section>
    `), 'motion', [{ id: 'practices', name: 'practices', displayName: 'Practices', access: 'public_read', fields: [], relations: [] }])

    expect(activities[0]?.reference).toEqual({
      type: 'data',
      dataSourceId: 'supabase-practices',
      contextKey: 'record',
      recordMode: 'specific',
      recordId: 'practice-42',
      videoField: 'media_url',
      templateField: 'mediapipe_reference',
    })
  })

  it('repairs malformed legacy compositions without leaving duplicate parts', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({ container, headless: true })
    editor.setComponents(`<section data-motion-activity="true" data-motion-layout-version="2">
      <header data-motion-part="heading"></header>
      <div data-motion-part="input"><video></video><div data-motion-part="input"></div><div data-motion-part="results"></div></div>
      <div data-motion-part="controls"></div>
      <div data-motion-part="results"></div>
    </section>`)
    const component = editor.getWrapper()!.components().at(0)!

    expect(upgradeMotionActivity(component)).toBe(true)
    expect(component.components().models.map((child) => child.getAttributes()['data-motion-part']))
      .toEqual(['heading', 'input', 'controls', 'results'])
    const allParts: unknown[] = []
    const collect = (parent: typeof component) => parent.components().models.forEach((child) => {
      allParts.push(child.getAttributes()['data-motion-part'])
      collect(child)
    })
    collect(component)
    expect(allParts.filter((part) => part === 'input')).toHaveLength(1)
    expect(allParts.filter((part) => part === 'controls')).toHaveLength(1)
    expect(allParts.filter((part) => part === 'results')).toHaveLength(1)

    editor.destroy()
    container.remove()
  })

  it('migrates version 2 reference viewers away from the generic analyze controls', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({ container, headless: true })
    editor.setComponents(`<section data-motion-activity="true" data-motion-component-type="reference-view" data-motion-mode="analyze" data-motion-layout-version="2">
      <header data-motion-part="heading"></header>
      <div data-motion-part="input"></div>
      <div data-motion-part="controls"><button data-motion-start>Analizar movimiento</button></div>
      <div data-motion-part="results"></div>
    </section>`)
    const component = editor.getWrapper()!.components().at(0)!

    expect(upgradeMotionActivity(component)).toBe(true)
    expect(component.getAttributes()['data-motion-layout-version']).toBe('3')
    expect(component.toHTML()).toContain('data-motion-reference-replay')
    expect(component.toHTML()).toContain('data-motion-start')
    expect(component.toHTML()).toContain('hidden')

    editor.destroy()
    container.remove()
  })

  it('removes a fixed height from existing reference viewers while retaining other styles', () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({ container, headless: true })
    editor.setComponents(motionAnalysisMarkup('reference-view'))
    const component = editor.getWrapper()!.components().at(0)!
    component.setStyle({ height: '1100px', width: '90%', 'margin-left': '5vw' })

    expect(upgradeMotionActivity(component)).toBe(true)
    expect(component.getStyle()).toMatchObject({ height: 'auto', width: '90%', 'margin-left': '5vw' })

    editor.destroy()
    container.remove()
  })
})
