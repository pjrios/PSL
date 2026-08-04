import type { Component, Editor, Plugin } from 'grapesjs'
import type { MotionActivity } from '../core/project'
import type { MotionFeatureFrame } from '../core/motion'
import { createStableElementId } from '../modules/preview'
import { supabaseDataSourceId } from './supabase-data'
import type { SupabaseTableConfig } from './supabase-data'

export const MOTION_ACTIVITY_ATTRIBUTE = 'data-motion-activity'
export const MOTION_ANALYSIS_BLOCK_ID = 'motion-analysis'
export const MOTION_VIEW_REFERENCE_BLOCK_ID = 'motion-view-reference'
export const MOTION_COMPARE_BLOCK_ID = 'motion-compare'
export const MOTION_CAPTURE_REFERENCE_BLOCK_ID = 'motion-capture-reference'
export const MOTION_INPUT_BLOCK_ID = 'motion-input'
export const MOTION_CONTROLS_BLOCK_ID = 'motion-controls'
export const MOTION_RESULTS_BLOCK_ID = 'motion-results'

const motionIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="m24 13-7 10 7 6 7-6-7-10Zm0 16v13m0-7-8 7m8-7 8 7M17 23l-9-4m23 4 9-4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/></svg>'

export const motionComponentStyles = `
.motion-activity{display:grid;gap:1rem;width:100%;padding:clamp(1rem,3vw,1.5rem);color:#17211f;background:linear-gradient(145deg,#fff,#f5f8f7);border:1px solid #d8e2e0;border-radius:1rem;box-shadow:0 .8rem 2rem rgba(20,48,44,.08)}
.motion-activity__heading{display:grid;gap:.35rem}
.motion-activity__eyebrow{margin:0;color:#52706b;font-size:.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
.motion-activity__heading h2{margin:0;font:inherit;font-size:clamp(1.25rem,3vw,1.75rem);font-weight:800}
.motion-input{position:relative;display:grid;place-items:center;overflow:hidden;min-height:clamp(15rem,42vw,28rem);color:white;background:radial-gradient(circle at 50% 42%,#243a36 0,#172521 42%,#111a18 100%);border:1px solid rgba(255,255,255,.08);border-radius:.8rem}
.motion-input video,.motion-input canvas{position:absolute;inset:0;width:100%;height:100%}
.motion-input video{object-fit:cover}
.motion-input canvas{pointer-events:none}
.motion-crop-box{position:absolute;z-index:3;display:block;pointer-events:none;border:3px solid #ffd166;background:rgba(255,209,102,.12);box-shadow:0 0 0 9999px rgba(4,18,16,.48);border-radius:.35rem}
.motion-crop-box[hidden]{display:none}
.motion-input.is-cropping{cursor:crosshair}
.motion-input.is-mirrored video,.motion-input.is-mirrored canvas{transform:scaleX(-1)}
.motion-input__placeholder{position:relative;z-index:1;max-width:32rem;display:grid;justify-items:center;gap:.4rem;padding:2.5rem;text-align:center}
.motion-input__placeholder[hidden]{display:none}
.motion-input__icon{width:3.25rem;height:3.25rem;display:grid;place-items:center;margin-bottom:.45rem;color:#bce2d8;background:rgba(255,255,255,.07);border:1px solid rgba(188,226,216,.22);border-radius:1rem;box-shadow:0 .75rem 2rem rgba(0,0,0,.18)}
.motion-input__icon svg{width:1.7rem;height:1.7rem}
.motion-input__placeholder strong{display:block;margin-bottom:.45rem;font-size:1.05rem}
.motion-input__placeholder small{max-width:24rem;color:#a9bbb7;line-height:1.45}
.motion-controls{display:flex;flex-wrap:wrap;align-items:center;gap:.75rem;padding:.7rem;background:#fff;border:1px solid #dce5e3;border-radius:.7rem}
.motion-controls button{min-height:2.75rem;padding:0 1.1rem;color:white;background:#176f69;border:0;border-radius:.55rem;font:inherit;font-weight:750;cursor:pointer}
.motion-controls [data-motion-stop]{background:#a33b3b}
.motion-controls [data-motion-stop][hidden]{display:none}
.motion-controls [data-motion-replay]{color:#17324d;background:#fff;border:1px solid #d6e3df}
.motion-controls [data-motion-replay][hidden]{display:none}
.motion-video-source{flex-basis:100%;display:grid;grid-template-columns:1fr auto auto;gap:.65rem;align-items:end;padding-top:.7rem;border-top:1px solid #dce5e3}
.motion-video-source[hidden]{display:none}
.motion-video-source label{display:grid;gap:.25rem;color:#39564f;font-size:.75rem;font-weight:750}
.motion-video-source input,.motion-video-source select{min-height:2.5rem;max-width:100%;padding:.4rem .55rem;background:#fff;border:1px solid #aebfba;border-radius:.5rem}
.motion-video-source input[type="number"]{width:6.5rem}
.motion-crop-actions{grid-column:1/-1;display:flex;align-items:center;gap:.55rem;flex-wrap:wrap}
.motion-crop-actions strong{margin-right:.2rem;color:#39564f;font-size:.75rem}
.motion-crop-actions button{min-height:2.35rem;padding:0 .8rem;font-size:.78rem}
.motion-video-source small{grid-column:1/-1;color:#607080}
@media(max-width:600px){.motion-video-source{grid-template-columns:1fr 1fr}.motion-video-source label:first-child{grid-column:1/-1}.motion-video-source input[type="number"]{width:100%}}
.motion-controls button:disabled{cursor:wait;opacity:.65}
.motion-controls [role=status]{color:#49615d;font-size:.88rem}
.motion-results{display:grid;gap:.85rem}
.motion-results[hidden]{display:none}
.motion-results__overall{font-size:clamp(1.6rem,4vw,2.4rem)}
.motion-results__scores{display:grid;grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));gap:.6rem}
.motion-results__score{padding:.75rem;background:white;border:1px solid #d8e2e0;border-radius:.55rem}
.motion-results__score small,.motion-results__score strong{display:block}
.motion-results__feedback{margin:0;padding:.85rem 1rem;background:#e8f1ef;border-radius:.55rem}
.motion-results__stages{display:grid;gap:.65rem;padding-top:.25rem}
.motion-results__stages[hidden]{display:none}
.motion-results__stages h3{margin:0;font-size:1rem}
.motion-results__stage-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(10rem,1fr));gap:.6rem}
.motion-stage-result{display:grid;grid-template-columns:1fr auto;align-items:center;gap:.35rem .75rem;padding:.7rem;background:#fff;border:1px solid #d8e2e0;border-radius:.55rem}
.motion-stage-result strong{font-size:1.15rem}
.motion-stage-result button{grid-column:1/-1;min-height:2.3rem;color:#17324d;background:#fff;border:1px solid #d6e3df;border-radius:.5rem;font:inherit;font-size:.78rem;font-weight:750;cursor:pointer}
.motion-results__download{width:max-content;color:#176f69;font-weight:750}
`

export function motionInputMarkup() {
  return `<div data-motion-part="input" class="motion-input">
    <video data-motion-camera autoplay muted playsinline hidden></video>
    <canvas data-motion-overlay hidden></canvas>
    <div data-motion-crop-box class="motion-crop-box" hidden aria-hidden="true"></div>
    <div data-motion-placeholder class="motion-input__placeholder">
      <span class="motion-input__icon" aria-hidden="true"><svg viewBox="0 0 32 32"><path d="M8 6h16a3 3 0 0 1 3 3v14a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V9a3 3 0 0 1 3-3Zm8 5v10m-5-5h10" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"/></svg></span>
      <strong>Entrada de movimiento</strong>
      <small>La cámara o el video se activa únicamente cuando la persona comienza.</small>
    </div>
  </div>`
}

export function motionControlsMarkup() {
  return `<div data-motion-part="controls" class="motion-controls">
    <button data-motion-start type="button">Comenzar</button>
    <button data-motion-stop type="button" hidden>Detener y guardar</button>
    <button data-motion-replay type="button" hidden>Reproducir referencia</button>
    <span data-motion-status role="status">Configura la actividad en Movimiento.</span>
    <div data-motion-video-source class="motion-video-source" hidden>
      <label>Video de referencia<input data-motion-file type="file" accept="video/mp4,video/webm,video/quicktime"></label>
      <label>Desde (s)<input data-motion-segment-start type="number" min="0" step="0.1" value="0"></label>
      <label>Hasta (s)<input data-motion-segment-end type="number" min="0.1" step="0.1" value="10"></label>
      <div class="motion-crop-actions"><strong>Encuadre</strong><button data-motion-crop-edit type="button">Elegir área</button><button data-motion-crop-reset type="button">Video completo</button></div>
    </div>
  </div>`
}

export function motionResultsMarkup() {
  return `<div data-motion-part="results" data-motion-results class="motion-results" hidden>
    <strong data-motion-overall class="motion-results__overall">0%</strong>
    <div data-motion-scores class="motion-results__scores"></div>
    <p data-motion-feedback class="motion-results__feedback"></p>
    <section data-motion-stage-results class="motion-results__stages" hidden>
      <h3>Etapas del movimiento</h3>
      <div data-motion-stage-scores class="motion-results__stage-list"></div>
    </section>
    <a data-motion-download class="motion-results__download" hidden>Descargar plantilla</a>
  </div>`
}

export type MotionComponentType = 'analyze' | 'reference-view' | 'compare' | 'reference-capture'

export const motionComponentTypes: Array<{
  description: string
  id: MotionComponentType
  label: string
  mode: 'analyze' | 'reference' | 'compare'
}> = [
  { id: 'reference-view', mode: 'analyze', label: 'Ver referencia', description: 'Reproduce una fuente de video y dibuja sus puntos de movimiento.' },
  { id: 'compare', mode: 'compare', label: 'Comparar movimientos', description: 'Compara una referencia con el video que graba la persona.' },
  { id: 'analyze', mode: 'analyze', label: 'Analizar movimiento', description: 'Extrae puntos y medidas de una cámara, video o elemento de la página.' },
  { id: 'reference-capture', mode: 'reference', label: 'Capturar referencia', description: 'Analiza, recorta y guarda una referencia reutilizable.' },
]

function componentDefinition(type: MotionComponentType) {
  return motionComponentTypes.find((item) => item.id === type) ?? motionComponentTypes[1]
}

function motionActivityContents(type: MotionComponentType = 'compare') {
  const definition = componentDefinition(type)
  const input = type === 'reference-view'
    ? `<div data-motion-part="input" class="motion-input">
      <video data-motion-camera autoplay muted playsinline hidden></video>
      <video data-motion-reference-video muted playsinline hidden></video>
      <canvas data-motion-overlay hidden></canvas>
      <canvas data-motion-reference-preview hidden></canvas>
      <div data-motion-reference-empty data-motion-placeholder class="motion-input__placeholder">
        <span class="motion-input__icon" aria-hidden="true">${motionIcon}</span>
        <strong>Referencia visual</strong><small>Selecciona la fuente de video y la plantilla de puntos.</small>
      </div>
    </div>`
    : motionInputMarkup()
  const controls = type === 'reference-view'
    ? `<div data-motion-part="controls" class="motion-controls">
      <button data-motion-start type="button" hidden>Analizar referencia</button>
      <button data-motion-reference-replay type="button" disabled>Reproducir referencia</button>
      <span data-motion-reference-status data-motion-status role="status">Configura la fuente de referencia.</span>
    </div>`
    : motionControlsMarkup()
  return `<header data-motion-part="heading" class="motion-activity__heading">
    <p class="motion-activity__eyebrow">${type === 'reference-view' ? 'Observa' : type === 'compare' ? 'Practica' : 'Análisis temporal'}</p>
    <h2>${definition.label}</h2>
  </header>
  ${input}
  ${controls}
  ${motionResultsMarkup()}`
}

export function motionAnalysisMarkup(type: MotionComponentType = 'compare') {
  const definition = componentDefinition(type)
  return `<section ${MOTION_ACTIVITY_ATTRIBUTE}="true"${type === 'reference-view' ? ' data-motion-workspace="true"' : ''}
    data-motion-component-type="${type}"
    data-motion-mode="${definition.mode}"
    data-motion-layout-version="3"
    data-motion-input-source="camera"
    data-motion-input-selector=""
    data-motion-input-url=""
    data-motion-facing-mode="user"
    data-motion-reference-source="data"
    data-motion-reference-table=""
    data-motion-reference-context="record"
    data-motion-reference-record-mode="context"
    data-motion-reference-record-id=""
    data-motion-reference-video-field="media_url"
    data-motion-reference-template-field="mediapipe_reference"
    data-motion-reference-url=""
    data-motion-reference-template=""
    data-motion-duration="3000"
    data-motion-hands="true"
    data-motion-pose="true"
    data-motion-face="false"
    data-motion-confidence="0.5"
    data-motion-smoothing="3"
    data-motion-checkpoints="true"
    data-motion-passing-score="75"
    data-motion-save="false"
    data-motion-result-table=""
    data-motion-result-context="record"
    data-motion-result-relation-field="practice_id"
    data-motion-result-score-field="score"
    data-motion-result-feedback-field="feedback"
    data-motion-result-details-field="mediapipe_result"
    data-motion-result-duration-field="duration_seconds"
    class="motion-activity">${motionActivityContents(type)}</section>`
}

function namedPart(type: string, name: string) {
  return {
    isComponent: (element: HTMLElement) => element.getAttribute?.('data-motion-part') === type,
    model: { defaults: { name } },
  }
}

function hasValidMotionComposition(component: Component) {
  const directParts = component.components().models
    .map((child) => child.getAttributes()['data-motion-part'])
    .filter(Boolean)
  const allParts: string[] = []
  const collect = (parent: Component) => parent.components().models.forEach((child) => {
    const part = child.getAttributes()['data-motion-part']
    if (part) allParts.push(String(part))
    collect(child)
  })
  collect(component)
  return allParts.length === 4
    && directParts.length === 4
    && directParts[0] === 'heading'
    && directParts[1] === 'input'
    && directParts[2] === 'controls'
    && directParts[3] === 'results'
}

export function upgradeMotionActivity(component: Component) {
  if (!component.getAttributes()[MOTION_ACTIVITY_ATTRIBUTE]) return false
  const layoutVersion = component.getAttributes()['data-motion-layout-version']
  const rawType = component.getAttributes()['data-motion-component-type']
  const componentType = motionComponentTypes.some((item) => item.id === rawType)
    ? rawType as MotionComponentType
    : ({ analyze: 'analyze', reference: 'reference-capture', compare: 'compare' } as const)[component.getAttributes()['data-motion-mode'] as 'analyze' | 'reference' | 'compare'] ?? 'compare'
  component.addAttributes({
    'data-motion-component-type': componentType,
    'data-motion-mode': component.getAttributes()['data-motion-mode'] || 'compare',
    'data-motion-input-source': component.getAttributes()['data-motion-input-source'] || 'camera',
    'data-motion-confidence': component.getAttributes()['data-motion-confidence'] || '0.5',
    'data-motion-smoothing': component.getAttributes()['data-motion-smoothing'] || '3',
    'data-motion-checkpoints': component.getAttributes()['data-motion-checkpoints'] || 'true',
    'data-motion-layout-version': '3',
    class: [...new Set(`${component.getAttributes().class ?? ''} motion-activity`.split(/\s+/).filter(Boolean))].join(' '),
  })
  component.set('name', componentDefinition(componentType).label)
  if (hasValidMotionComposition(component) && (
    layoutVersion === '3' || (layoutVersion === '2' && componentType !== 'reference-view')
  )) return false
  component.components(motionActivityContents(componentType))
  component.setStyle({})
  return true
}

export function createMotionAnalysisPlugin(): Plugin {
  return (editor: Editor) => {
    editor.DomComponents.addType(MOTION_ANALYSIS_BLOCK_ID, {
      isComponent: (element) => element.hasAttribute?.(MOTION_ACTIVITY_ATTRIBUTE),
      model: { defaults: { name: 'Actividad de movimiento', droppable: true, traits: [] } },
    })
    editor.DomComponents.addType(MOTION_INPUT_BLOCK_ID, namedPart('input', 'Entrada de movimiento'))
    editor.DomComponents.addType(MOTION_CONTROLS_BLOCK_ID, namedPart('controls', 'Controles de movimiento'))
    editor.DomComponents.addType(MOTION_RESULTS_BLOCK_ID, namedPart('results', 'Resultados de movimiento'))
    ;[
      { blockId: MOTION_VIEW_REFERENCE_BLOCK_ID, type: 'reference-view' as const },
      { blockId: MOTION_COMPARE_BLOCK_ID, type: 'compare' as const },
      { blockId: MOTION_ANALYSIS_BLOCK_ID, type: 'analyze' as const },
      { blockId: MOTION_CAPTURE_REFERENCE_BLOCK_ID, type: 'reference-capture' as const },
    ].forEach(({ blockId, type }) => {
      const definition = componentDefinition(type)
      editor.BlockManager.add(blockId, {
        label: definition.label,
        category: 'Movimiento',
        attributes: { title: definition.description },
        content: motionAnalysisMarkup(type),
        media: motionIcon,
      })
    })
    const upgradeAll = () => editor.Pages.getAll().forEach((page) => {
      const visit = (component: Component, insideActivity = false) => {
        const attributes = component.getAttributes()
        const isActivity = Boolean(attributes[MOTION_ACTIVITY_ATTRIBUTE])
        const isOrphanPart = Boolean(attributes['data-motion-part']) && !insideActivity
        if (isOrphanPart) {
          component.remove()
          return
        }
        if (isActivity) upgradeMotionActivity(component)
        component.components().models.slice().forEach((child) => visit(child, insideActivity || isActivity))
      }
      visit(page.getMainComponent())
    })
    const repairLoadedProject = () => {
      // Storage autoload replaces both components and CSS. Repair the fully
      // loaded project, not the temporary canvas created during editor setup.
      editor.Css.addRules(motionComponentStyles)
      upgradeAll()
    }
    editor.on('load', () => requestAnimationFrame(repairLoadedProject))
    editor.on('project:loaded', repairLoadedProject)
    editor.on('storage:end:load', () => requestAnimationFrame(repairLoadedProject))
  }
}

export function findMotionActivityComponent(component?: Component | null) {
  let current = component ?? null
  while (current) {
    if (current.getAttributes()[MOTION_ACTIVITY_ATTRIBUTE]) return current
    current = current.parent() ?? null
  }
  return null
}

function enabled(value: string | null | undefined, fallback = false) {
  if (value == null) return fallback
  return value !== 'false' && value !== '0'
}

function trimmed(element: Element, attribute: string, fallback = '') {
  return element.getAttribute(attribute)?.trim() || fallback
}

function inlineTemplate(value: string): MotionActivity['reference'] | undefined {
  if (!value) return undefined
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as { frames?: MotionFeatureFrame[]; durationMs?: number; version?: number }
    if (!Array.isArray(parsed.frames) || !parsed.frames.length || parsed.version !== 2) return undefined
    return { type: 'template', template: {
      version: 2,
      durationMs: Number.isFinite(parsed.durationMs) ? Number(parsed.durationMs) : parsed.frames.at(-1)?.t ?? 0,
      frames: parsed.frames,
    } }
  } catch {
    return undefined
  }
}

export function readMotionActivities(
  document: Document,
  pageId: string,
  tables: SupabaseTableConfig[],
): MotionActivity[] {
  const tableIds = new Set(tables.map((table) => table.id))
  return [...document.querySelectorAll<HTMLElement>(`[${MOTION_ACTIVITY_ATTRIBUTE}]`)]
    .map((element, index): MotionActivity => {
      const modeValue = trimmed(element, 'data-motion-mode', 'compare')
      const mode: MotionActivity['mode'] = ['analyze', 'reference', 'compare'].includes(modeValue)
        ? modeValue as MotionActivity['mode'] : 'compare'
      const inputSource = trimmed(element, 'data-motion-input-source', 'camera')
      const duration = Number.parseInt(trimmed(element, 'data-motion-duration', '3000'), 10)
      const durationMs = Number.isFinite(duration) ? Math.min(10_000, Math.max(1_000, duration)) : 3_000
      const input: MotionActivity['input'] = inputSource === 'element' && trimmed(element, 'data-motion-input-selector')
        ? { type: 'element', selector: trimmed(element, 'data-motion-input-selector'), durationMs }
        : inputSource === 'url' && /^https?:\/\//i.test(trimmed(element, 'data-motion-input-url'))
          ? { type: 'url', url: trimmed(element, 'data-motion-input-url') }
          : { type: 'camera', durationMs, facingMode: trimmed(element, 'data-motion-facing-mode') === 'environment' ? 'environment' : 'user' }
      const referenceSource = trimmed(element, 'data-motion-reference-source', 'data')
      const referenceTableId = trimmed(element, 'data-motion-reference-table')
      const referenceUrl = trimmed(element, 'data-motion-reference-url')
      const embedded = inlineTemplate(trimmed(element, 'data-motion-reference-template'))
      const reference: MotionActivity['reference'] = referenceSource === 'template' && embedded
        ? embedded
        : referenceSource === 'url' && /^https?:\/\//i.test(referenceUrl)
          ? { type: 'url', url: referenceUrl }
          : referenceSource === 'data' && tableIds.has(referenceTableId)
            ? {
                type: 'data',
                dataSourceId: supabaseDataSourceId(referenceTableId),
                contextKey: trimmed(element, 'data-motion-reference-context', 'record'),
                recordMode: ['context', 'first', 'last', 'specific'].includes(trimmed(element, 'data-motion-reference-record-mode', 'context'))
                  ? trimmed(element, 'data-motion-reference-record-mode', 'context') as 'context' | 'first' | 'last' | 'specific'
                  : 'context',
                ...(trimmed(element, 'data-motion-reference-record-id')
                  ? { recordId: trimmed(element, 'data-motion-reference-record-id') }
                  : {}),
                videoField: trimmed(element, 'data-motion-reference-video-field', 'media_url'),
                templateField: trimmed(element, 'data-motion-reference-template-field', 'mediapipe_reference'),
              }
            : { type: 'none' }
      const resultTableId = trimmed(element, 'data-motion-result-table')
      const persistence = enabled(element.getAttribute('data-motion-save')) && tableIds.has(resultTableId)
        ? {
            dataSourceId: supabaseDataSourceId(resultTableId),
            contextKey: trimmed(element, 'data-motion-result-context', 'record'),
            ...(trimmed(element, 'data-motion-result-relation-field') ? { relationField: trimmed(element, 'data-motion-result-relation-field') } : {}),
            scoreField: trimmed(element, 'data-motion-result-score-field', 'score'),
            feedbackField: trimmed(element, 'data-motion-result-feedback-field', 'feedback'),
            resultField: trimmed(element, 'data-motion-result-details-field', 'mediapipe_result'),
            durationField: trimmed(element, 'data-motion-result-duration-field', 'duration_seconds'),
          }
        : undefined
      const passingScore = Number.parseFloat(trimmed(element, 'data-motion-passing-score', '75'))
      const minConfidence = Number.parseFloat(trimmed(element, 'data-motion-confidence', '0.5'))
      const smoothing = Number.parseInt(trimmed(element, 'data-motion-smoothing', '3'), 10)

      return {
        id: `${pageId}-motion-${index + 1}`,
        pageId,
        elementId: createStableElementId(element, pageId),
        mode,
        componentType: motionComponentTypes.some((item) => item.id === trimmed(element, 'data-motion-component-type'))
          ? trimmed(element, 'data-motion-component-type') as MotionComponentType
          : undefined,
        input,
        reference: mode === 'compare' || trimmed(element, 'data-motion-component-type') === 'reference-view'
          ? reference : { type: 'none' },
        features: {
          hands: enabled(element.getAttribute('data-motion-hands'), true),
          pose: enabled(element.getAttribute('data-motion-pose'), true),
          face: enabled(element.getAttribute('data-motion-face')),
        },
        processing: {
          checkpointReduction: enabled(element.getAttribute('data-motion-checkpoints'), true),
          minConfidence: Number.isFinite(minConfidence) ? Math.min(1, Math.max(0, minConfidence)) : 0.5,
          smoothing: Number.isFinite(smoothing) ? Math.min(9, Math.max(1, smoothing)) : 3,
        },
        passingScore: Number.isFinite(passingScore) ? Math.min(100, Math.max(0, passingScore)) : 75,
        ...(persistence ? { persistence } : {}),
      }
    })
}
