import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type {
  DataBinding,
  ElementOverride,
  StyleDeclaration,
  VisualBuilderProject,
} from '../../core/project'
import { findElementOverride } from '../design'
import { findDataBinding, findDataRepeater } from '../data'
import type { DataBindingDraft, DataRepeaterDraft } from '../data'
import type {
  EditorStyleProperty,
  EditorStyleState,
  EditorViewport,
} from '../design'
import type { BrokenConnection, ConnectionAction, ConnectionDraft } from './connections'
import { findConnection } from './connections'

export interface SelectedElement {
  elementId: string
  label: string
  pageId: string
  tagName: string
  text: string
  src: string
  alt: string
  href: string
  title: string
  ariaLabel: string
  hasChildren: boolean
  isInteractive: boolean
  computedStyles: StyleDeclaration
}

type StyleCategory = 'layout' | 'alignment' | 'media' | 'appearance' | 'typography' | 'effects'
type InspectorSection = 'content' | 'interaction' | 'data' | StyleCategory
type EffectState = Extract<EditorStyleState, 'hover' | 'focus' | 'active'>

interface StyleField {
  key: EditorStyleProperty
  label: string
  placeholder: string
}

interface InteractionPanelProps {
  brokenConnections: BrokenConnection[]
  canRedo: boolean
  canUndo: boolean
  onContentSave: (content: NonNullable<ElementOverride['content']>) => void
  onBindingDelete: (target: DataBinding['target']) => void
  onBindingSave: (draft: DataBindingDraft) => void
  onRepeaterDelete: () => void
  onRepeaterSave: (draft: DataRepeaterDraft) => void
  onDelete: (sourcePage: string, elementId: string) => void
  onRedo: () => void
  onResetDesign: () => void
  onSave: (draft: ConnectionDraft) => void
  onStyleChange: (
    viewport: EditorViewport,
    state: EditorStyleState,
    property: EditorStyleProperty,
    value: string,
  ) => void
  onStylePreset: (
    viewport: EditorViewport,
    state: EditorStyleState,
    styles: StyleDeclaration,
    baseStyles?: StyleDeclaration,
  ) => void
  onUndo: () => void
  project: VisualBuilderProject
  selection: SelectedElement | null
  viewport: EditorViewport
}

const actionLabels: Record<ConnectionAction, string> = {
  navigate: 'Ir a otra pantalla',
  back: 'Regresar',
  url: 'Abrir una URL',
}

const effectStateLabels: Record<EffectState, string> = {
  hover: 'Cuando pasan el puntero',
  focus: 'Cuando usan el teclado',
  active: 'Mientras presionan',
}

const effectStateDescriptions: Record<EffectState, string> = {
  hover: 'Cuando alguien coloca el puntero encima.',
  focus: 'Cuando se selecciona usando el teclado.',
  active: 'Mientras se está presionando o tocando.',
}

const viewportLabels: Record<EditorViewport, string> = {
  desktop: 'Escritorio',
  tablet: 'Tableta',
  mobile: 'Móvil',
}

interface StylePreset {
  description: string
  label: string
  styles: StyleDeclaration
  baseStyles?: StyleDeclaration
}

const smoothTransition = { transition: 'all 180ms ease' }
const presetsByState: Record<EffectState, StylePreset[]> = {
  hover: [
    { label: 'Elevar', description: 'Sube ligeramente y añade profundidad.', styles: { transform: 'translateY(-2px)', boxShadow: '0 10px 24px rgba(18, 61, 71, 0.18)' }, baseStyles: smoothTransition },
    { label: 'Agrandar', description: 'Crece suavemente al apuntarlo.', styles: { transform: 'scale(1.03)' }, baseStyles: smoothTransition },
    { label: 'Atenuar', description: 'Reduce un poco la intensidad.', styles: { opacity: '0.82' }, baseStyles: smoothTransition },
  ],
  focus: [
    { label: 'Anillo accesible', description: 'Muestra claramente la selección por teclado.', styles: { boxShadow: '0 0 0 3px rgba(22, 143, 134, 0.38)' }, baseStyles: smoothTransition },
    { label: 'Anillo fuerte', description: 'Usa un indicador de teclado más visible.', styles: { boxShadow: '0 0 0 4px rgba(18, 61, 71, 0.48)' }, baseStyles: smoothTransition },
  ],
  active: [
    { label: 'Presionar', description: 'Se mueve y encoge como un botón físico.', styles: { transform: 'translateY(1px) scale(0.98)' }, baseStyles: smoothTransition },
    { label: 'Encoger', description: 'Da una respuesta táctil sencilla.', styles: { transform: 'scale(0.96)' }, baseStyles: smoothTransition },
  ],
}

const textTags = new Set([
  'a', 'button', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'input', 'label', 'li',
  'p', 'small', 'span', 'strong', 'textarea',
])
const mediaTags = new Set(['img', 'video', 'svg', 'canvas', 'picture'])

const layoutFields: StyleField[] = [
  { key: 'width', label: 'Ancho', placeholder: 'auto' },
  { key: 'height', label: 'Alto', placeholder: 'auto' },
  { key: 'margin', label: 'Espacio exterior', placeholder: '0px' },
  { key: 'padding', label: 'Espacio interior', placeholder: '12px 16px' },
]
const gapFields: StyleField[] = [
  { key: 'gap', label: 'Separación entre elementos', placeholder: '12px' },
]
const appearanceFields: StyleField[] = [
  { key: 'backgroundColor', label: 'Fondo', placeholder: '#ffffff' },
  { key: 'borderColor', label: 'Color de borde', placeholder: '#cbdcda' },
  { key: 'borderWidth', label: 'Grosor de borde', placeholder: '1px' },
  { key: 'borderRadius', label: 'Esquinas redondeadas', placeholder: '12px' },
  { key: 'boxShadow', label: 'Sombra', placeholder: '0 8px 24px #0002' },
  { key: 'opacity', label: 'Opacidad', placeholder: '1' },
]
const typographyFields: StyleField[] = [
  { key: 'color', label: 'Color del texto', placeholder: '#16333c' },
  { key: 'fontSize', label: 'Tamaño del texto', placeholder: '16px' },
  { key: 'fontWeight', label: 'Peso del texto', placeholder: '700' },
]

function isSafeWebUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function InteractionPanel({
  brokenConnections,
  canRedo,
  canUndo,
  onContentSave,
  onBindingDelete,
  onBindingSave,
  onRepeaterDelete,
  onRepeaterSave,
  onDelete,
  onRedo,
  onResetDesign,
  onSave,
  onStyleChange,
  onStylePreset,
  onUndo,
  project,
  selection,
  viewport,
}: InteractionPanelProps) {
  const [inspectorSection, setInspectorSection] = useState<InspectorSection>('content')
  const [effectState, setEffectState] = useState<EffectState>('hover')
  const [selectedPreset, setSelectedPreset] = useState('')
  const existingConnection = selection
    ? findConnection(project, selection.pageId, selection.elementId)
    : undefined
  const existingOverride = selection
    ? findElementOverride(project, selection.pageId, selection.elementId)
    : undefined
  const elementKind = !selection
    ? 'element'
    : mediaTags.has(selection.tagName)
      ? 'media'
      : selection.isInteractive
        ? 'interactive'
        : textTags.has(selection.tagName)
          ? 'text'
          : 'container'
  const supportsTypography = elementKind === 'text' || elementKind === 'interactive'
  const supportsAlignment = elementKind === 'container' || supportsTypography
  const supportsImageEditing = selection?.tagName === 'img'
  const supportsEffects = Boolean(selection?.isInteractive || existingConnection)
  const availableCategories: StyleCategory[] = [
    'layout',
    ...(supportsAlignment ? ['alignment' as const] : []),
    ...(supportsImageEditing ? ['media' as const] : []),
    'appearance',
    ...(supportsTypography ? ['typography' as const] : []),
    ...(supportsEffects ? ['effects' as const] : []),
  ]
  const defaultTarget = project.pages.find((page) => page.id !== selection?.pageId)?.id
    ?? project.pages[0]?.id
  const [action, setAction] = useState<ConnectionAction>('navigate')
  const [targetPage, setTargetPage] = useState(defaultTarget ?? '')
  const [url, setUrl] = useState('https://')
  const existingContextEntry = Object.entries(existingConnection?.context ?? {})[0]
  const [sendRecord, setSendRecord] = useState(Boolean(existingContextEntry))
  const [contextKey, setContextKey] = useState(existingContextEntry?.[0] ?? 'selectedRecord')
  const [dataSourceId, setDataSourceId] = useState(
    existingContextEntry?.[1].dataSourceId ?? project.dataSources?.[0]?.id ?? '',
  )
  const selectedDataSource = project.dataSources?.find((source) => source.id === dataSourceId)
  const [recordId, setRecordId] = useState(existingContextEntry?.[1].recordId ?? '')
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [src, setSrc] = useState('')
  const [alt, setAlt] = useState('')
  const [href, setHref] = useState('')
  const [title, setTitle] = useState('')
  const [ariaLabel, setAriaLabel] = useState('')
  const [imageError, setImageError] = useState<string | null>(null)
  const bindingTargets: Array<{ value: DataBinding['target']; label: string }> = [
    ...(!selection?.hasChildren && selection?.tagName !== 'img'
      ? [{ value: 'text' as const, label: 'Texto' }]
      : []),
    ...(selection?.tagName === 'img'
      ? [{ value: 'src' as const, label: 'Imagen' }, { value: 'alt' as const, label: 'Texto alternativo' }]
      : []),
    ...(selection?.tagName === 'a' ? [{ value: 'href' as const, label: 'Enlace' }] : []),
    ...(['input', 'select', 'textarea'].includes(selection?.tagName ?? '')
      ? [{ value: 'value' as const, label: 'Valor del campo' }]
      : []),
    { value: 'title', label: 'Título' },
    { value: 'ariaLabel', label: 'Etiqueta accesible' },
  ]
  const [bindingTarget, setBindingTarget] = useState<DataBinding['target']>('text')
  const existingBinding = selection
    ? findDataBinding(project, selection.pageId, selection.elementId, bindingTarget)
    : undefined
  const inboundContexts = Object.entries(Object.assign(
    {},
    ...project.connections
      .filter((connection) => connection.action === 'navigate'
        && connection.targetPage === selection?.pageId)
      .map((connection) => connection.context ?? {}),
  ))
  const containingRepeater = selection
    ? project.repeaters?.find((repeater) => repeater.pageId === selection.pageId
      && (selection.elementId === repeater.elementId
        || selection.elementId.startsWith(`${repeater.elementId}/`)))
    : undefined
  const availableContextKeys = [...new Set([
    ...inboundContexts.map(([key]) => key),
    ...(containingRepeater ? [containingRepeater.itemContext] : []),
  ])]
  const [bindingContextKey, setBindingContextKey] = useState('selectedRecord')
  const [bindingField, setBindingField] = useState('name')
  const [bindingFallback, setBindingFallback] = useState('')
  const existingRepeater = selection
    ? findDataRepeater(project, selection.pageId, selection.elementId)
    : undefined
  const [configureRepeater, setConfigureRepeater] = useState(Boolean(existingRepeater))
  const [repeaterSourceId, setRepeaterSourceId] = useState(
    existingRepeater?.dataSourceId ?? project.dataSources?.[0]?.id ?? '',
  )
  const [itemContext, setItemContext] = useState(existingRepeater?.itemContext ?? 'item')

  useEffect(() => {
    setAction(existingConnection?.action ?? 'navigate')
    setTargetPage(existingConnection?.targetPage ?? defaultTarget ?? '')
    setUrl(existingConnection?.url ?? 'https://')
    const contextEntry = Object.entries(existingConnection?.context ?? {})[0]
    setSendRecord(Boolean(contextEntry))
    setContextKey(contextEntry?.[0] ?? 'selectedRecord')
    setDataSourceId(contextEntry?.[1].dataSourceId ?? project.dataSources?.[0]?.id ?? '')
    setRecordId(contextEntry?.[1].recordId ?? '')
    setError(null)
  }, [defaultTarget, existingConnection, selection?.elementId])

  useEffect(() => {
    setText(existingOverride?.content?.text ?? selection?.text ?? '')
    setSrc(existingOverride?.content?.src ?? selection?.src ?? '')
    setAlt(existingOverride?.content?.alt ?? selection?.alt ?? '')
    setHref(existingOverride?.content?.href ?? selection?.href ?? '')
    setTitle(existingOverride?.content?.title ?? selection?.title ?? '')
    setAriaLabel(existingOverride?.content?.ariaLabel ?? selection?.ariaLabel ?? '')
    setImageError(null)
  }, [existingOverride, selection])

  useEffect(() => {
    const firstTarget = bindingTargets[0]?.value ?? 'title'
    if (!bindingTargets.some((target) => target.value === bindingTarget)) {
      setBindingTarget(firstTarget)
    }
  }, [bindingTarget, bindingTargets])

  useEffect(() => {
    setBindingContextKey(existingBinding?.contextKey ?? availableContextKeys[0] ?? 'selectedRecord')
    setBindingField(existingBinding?.field ?? 'name')
    setBindingFallback(existingBinding?.fallback ?? '')
  }, [existingBinding, selection?.elementId])

  useEffect(() => {
    setConfigureRepeater(Boolean(existingRepeater))
    setRepeaterSourceId(existingRepeater?.dataSourceId ?? project.dataSources?.[0]?.id ?? '')
    setItemContext(existingRepeater?.itemContext ?? 'item')
  }, [existingRepeater, project.dataSources, selection?.elementId])

  useEffect(() => {
    setSelectedPreset('')
  }, [selection?.elementId, effectState, viewport])

  useEffect(() => {
    const isStyleSection = inspectorSection === 'layout'
      || inspectorSection === 'alignment'
      || inspectorSection === 'media'
      || inspectorSection === 'appearance'
      || inspectorSection === 'typography'
      || inspectorSection === 'effects'
    if (isStyleSection && !availableCategories.includes(inspectorSection)) {
      setInspectorSection('layout')
    }
  }, [availableCategories, inspectorSection])

  function submitConnection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selection) return
    if (action === 'navigate' && !targetPage) {
      setError('Selecciona una pantalla de destino.')
      return
    }
    if (action === 'navigate' && sendRecord && (!contextKey.trim() || !dataSourceId || !recordId)) {
      setError('Completa el nombre, la fuente y el registro que deseas enviar.')
      return
    }
    if (action === 'url' && !isSafeWebUrl(url)) {
      setError('Escribe una dirección completa que comience con http:// o https://.')
      return
    }
    onSave({
      action,
      elementId: selection.elementId,
      sourcePage: selection.pageId,
      ...(action === 'navigate' ? { targetPage } : {}),
      ...(action === 'navigate' && sendRecord && dataSourceId && recordId
        ? {
            context: {
              [contextKey || 'selectedRecord']: { dataSourceId, recordId },
            },
          }
        : {}),
      ...(action === 'url' ? { url } : {}),
    })
    setError(null)
  }

  function submitContent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selection) return
    onContentSave({
      text,
      ...(selection.tagName === 'img' ? { src, alt } : {}),
      ...(selection.tagName === 'a' ? { href } : {}),
      title,
      ariaLabel,
    })
  }

  function loadImageFile(file: File) {
    setImageError(null)
    if (!file.type.startsWith('image/')) {
      setImageError('Selecciona un archivo de imagen.')
      return
    }
    if (file.size > 3 * 1024 * 1024) {
      setImageError('La imagen debe pesar 3 MB o menos.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result !== 'string') return
      setSrc(reader.result)
      onContentSave({
        text,
        src: reader.result,
        alt,
        title,
        ariaLabel,
      })
    }
    reader.onerror = () => setImageError('No se pudo leer la imagen.')
    reader.readAsDataURL(file)
  }

  const baseDeclaration = existingOverride?.styles?.[viewport]?.base
  const resolvedEffectState: EffectState = effectState === 'focus' || effectState === 'active'
    ? effectState
    : 'hover'
  const availablePresets = presetsByState[resolvedEffectState]
  const activePreset = availablePresets.find((preset) => preset.label === selectedPreset)
  const kindLabels = {
    container: 'Contenedor',
    text: 'Texto',
    interactive: 'Elemento interactivo',
    media: 'Imagen o medio',
    element: 'Elemento',
  }

  function currentStyleValue(property: EditorStyleProperty) {
    return baseDeclaration?.[property] ?? selection?.computedStyles[property] ?? ''
  }

  const currentDisplay = currentStyleValue('display')
  const isGridLayout = currentDisplay === 'grid' || currentDisplay === 'inline-grid'
  const isFlexLayout = currentDisplay === 'flex' || currentDisplay === 'inline-flex'
  const computedDirection = !isFlexLayout
    || currentStyleValue('flexDirection') === 'column'
    || currentStyleValue('flexDirection') === 'column-reverse'
    ? 'column'
    : 'row'
  const horizontalAlignmentProperty: EditorStyleProperty = isGridLayout
    ? 'justifyItems'
    : computedDirection === 'column' ? 'alignItems' : 'justifyContent'
  const verticalAlignmentProperty: EditorStyleProperty = isGridLayout
    ? 'alignItems'
    : computedDirection === 'column' ? 'justifyContent' : 'alignItems'

  function normalizedAlignmentValue(property: EditorStyleProperty) {
    const value = currentStyleValue(property)
    if (value === 'start' || value === 'self-start') return 'flex-start'
    if (value === 'end' || value === 'self-end') return 'flex-end'
    const supported = property === 'justifyContent'
      ? ['normal', 'flex-start', 'center', 'flex-end', 'space-between', 'space-around', 'space-evenly']
      : ['normal', 'flex-start', 'center', 'flex-end', 'stretch']
    return supported.includes(value) ? value : 'normal'
  }

  function renderAlignmentOptions(property: EditorStyleProperty, axis: 'horizontal' | 'vertical') {
    return (
      <>
        <option value="normal">Original</option>
        <option value="flex-start">{axis === 'horizontal' ? 'Izquierda' : 'Arriba'}</option>
        <option value="center">Centro</option>
        <option value="flex-end">{axis === 'horizontal' ? 'Derecha' : 'Abajo'}</option>
        {property === 'justifyContent' ? (
          <>
            <option value="space-between">Separar al máximo</option>
            <option value="space-around">Espacio alrededor</option>
            <option value="space-evenly">Espacio uniforme</option>
          </>
        ) : (
          <option value="stretch">Estirar</option>
        )}
      </>
    )
  }

  function alignContainer(property: EditorStyleProperty, value: string) {
    if (!isFlexLayout && !isGridLayout) {
      onStyleChange(viewport, 'base', 'display', 'flex')
      onStyleChange(viewport, 'base', 'flexDirection', computedDirection)
    }
    onStyleChange(viewport, 'base', property, value)
  }

  function renderBaseFields(fields: StyleField[]) {
    return (
      <div className="filtered-style-fields">
        {fields.map(({ key, label, placeholder }) => {
          const displayedValue = baseDeclaration?.[key] ?? selection?.computedStyles[key] ?? ''
          return (
          <label key={`${selection?.elementId}-${viewport}-${key}-${displayedValue}`}>
            {label}
            <input
              defaultValue={displayedValue}
              onBlur={(event) => onStyleChange(viewport, 'base', key, event.target.value)}
              placeholder={placeholder}
            />
          </label>
          )
        })}
      </div>
    )
  }

  return (
    <aside className="sidebar inspector-panel">
      <div className="panel-heading inspector-heading">
        <div className="inspector-title">
          <span className="eyebrow">{selection ? `<${selection.tagName}>` : 'Inspector'}</span>
          {selection && (
            <p>{kindLabels[elementKind]} · {viewportLabels[viewport]}</p>
          )}
        </div>
        <div className="history-actions" aria-label="Historial de edición">
          <button disabled={!canUndo} onClick={onUndo} title="Deshacer" type="button">↶</button>
          <button disabled={!canRedo} onClick={onRedo} title="Rehacer" type="button">↷</button>
        </div>
      </div>

      <label className="inspector-section-select" title="Elige qué quieres editar">
        <span className="sr-only">Sección del inspector</span>
        <select
          aria-label="Sección del inspector"
          onChange={(event) => setInspectorSection(event.target.value as InspectorSection)}
          value={inspectorSection}
        >
          <option value="content">Contenido</option>
          <option value="interaction">Enlace</option>
          <option hidden value="data">Datos</option>
          <optgroup label="Estilo">
            <option value="layout">Distribución y espacio</option>
            {supportsAlignment && <option value="alignment">Alineación</option>}
            {supportsImageEditing && <option value="media">Imagen</option>}
            <option value="appearance">Apariencia</option>
            {supportsTypography && <option value="typography">Texto</option>}
            {supportsEffects && <option value="effects">Efectos de interacción</option>}
          </optgroup>
        </select>
      </label>

      {!selection ? (
        <div className="empty-inspector">
          <span className="cursor-illustration" aria-hidden="true">↖</span>
          <h3>Ningún elemento seleccionado</h3>
          <p>Selecciona algo en el lienzo.</p>
        </div>
      ) : inspectorSection === 'content' ? (
        <form className="interaction-form" onSubmit={submitContent}>
          {!selection.hasChildren && selection.tagName !== 'img' && (
            <label>
              Texto
              <textarea onChange={(event) => setText(event.target.value)} rows={4} value={text} />
            </label>
          )}
          {selection.hasChildren && (
            <div className="inspector-guidance">
              <strong>Este elemento contiene otros elementos.</strong>
              <p>Selecciona directamente un título, párrafo, botón o imagen para editar su contenido sin borrar la estructura.</p>
            </div>
          )}
          {selection.tagName === 'img' && (
            <>
              <label>
                Reemplazar imagen
                <input
                  accept="image/*"
                  aria-label="Reemplazar imagen"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) loadImageFile(file)
                  }}
                  type="file"
                />
              </label>
              <label>Ruta o URL de la imagen<input onChange={(event) => setSrc(event.target.value)} value={src} /></label>
              <label>Texto alternativo<input onChange={(event) => setAlt(event.target.value)} value={alt} /></label>
              {imageError && <p className="form-error" role="alert">{imageError}</p>}
            </>
          )}
          {selection.tagName === 'a' && (
            <label>Enlace<input onChange={(event) => setHref(event.target.value)} value={href} /></label>
          )}
          <label>Título<input onChange={(event) => setTitle(event.target.value)} value={title} /></label>
          <label>Etiqueta accesible<input onChange={(event) => setAriaLabel(event.target.value)} value={ariaLabel} /></label>
          <button className="button primary" type="submit">
            {selection.tagName === 'img' ? 'Aplicar imagen' : 'Aplicar contenido'}
          </button>
          {existingOverride && (
            <button className="button danger" onClick={onResetDesign} type="button">Restablecer elemento</button>
          )}
        </form>
      ) : inspectorSection === 'data' ? (
        <form
          className="interaction-form"
          onSubmit={(event) => {
            event.preventDefault()
            if (!selection) return
            if (configureRepeater) {
              onRepeaterSave({
                pageId: selection.pageId,
                elementId: selection.elementId,
                dataSourceId: repeaterSourceId,
                itemContext,
              })
              return
            }
            onBindingSave({
              pageId: selection.pageId,
              elementId: selection.elementId,
              target: bindingTarget,
              contextKey: bindingContextKey,
              field: bindingField,
              ...(bindingFallback ? { fallback: bindingFallback } : {}),
            })
          }}
        >
          <p className="form-introduction">Conecta una propiedad de este elemento con un campo del registro recibido.</p>
          {selection.hasChildren && (
            <label className="checkbox-label">
              <input
                checked={configureRepeater}
                onChange={(event) => setConfigureRepeater(event.target.checked)}
                type="checkbox"
              />
              Repetir este elemento por cada registro
            </label>
          )}
          {configureRepeater ? (
            <>
              <label>
                Fuente de la lista
                <select
                  aria-label="Fuente de la lista"
                  onChange={(event) => setRepeaterSourceId(event.target.value)}
                  value={repeaterSourceId}
                >
                  {project.dataSources?.map((source) => (
                    <option key={source.id} value={source.id}>{source.name}</option>
                  ))}
                </select>
              </label>
              <label>
                Nombre de cada registro
                <input
                  aria-label="Nombre de cada registro"
                  onChange={(event) => setItemContext(event.target.value)}
                  value={itemContext}
                />
              </label>
              <button className="button primary" type="submit">
                {existingRepeater ? 'Actualizar lista' : 'Crear lista repetida'}
              </button>
              {existingRepeater && (
                <button className="button danger" onClick={onRepeaterDelete} type="button">
                  Eliminar lista repetida
                </button>
              )}
            </>
          ) : (
            <>
          <label>
            Propiedad del elemento
            <select
              aria-label="Propiedad vinculada"
              onChange={(event) => setBindingTarget(event.target.value as DataBinding['target'])}
              value={bindingTarget}
            >
              {bindingTargets.map((target) => (
                <option key={target.value} value={target.value}>{target.label}</option>
              ))}
            </select>
          </label>
          <label>
            Dato recibido
            <input
              aria-label="Dato recibido"
              list="psl-context-keys"
              onChange={(event) => setBindingContextKey(event.target.value)}
              value={bindingContextKey}
            />
            <datalist id="psl-context-keys">
              {availableContextKeys.map((key) => <option key={key} value={key} />)}
            </datalist>
          </label>
          <label>
            Campo del registro
            <input
              aria-label="Campo del registro"
              onChange={(event) => setBindingField(event.target.value)}
              placeholder="name o details.title"
              value={bindingField}
            />
          </label>
          <label>
            Valor si no existe
            <input
              aria-label="Valor predeterminado"
              onChange={(event) => setBindingFallback(event.target.value)}
              value={bindingFallback}
            />
          </label>
          <button className="button primary" type="submit">
            {existingBinding ? 'Actualizar vínculo' : 'Vincular dato'}
          </button>
          {existingBinding && (
            <button
              className="button danger"
              onClick={() => onBindingDelete(bindingTarget)}
              type="button"
            >Eliminar vínculo</button>
          )}
            </>
          )}
        </form>
      ) : inspectorSection !== 'interaction' ? (
        <div className="style-editor">
          {inspectorSection === 'layout' && (
            <section className="filtered-style-panel" aria-labelledby="layout-panel-title">
              <h3 id="layout-panel-title">Distribución y espacio</h3>
              <p>Controla el tamaño y el espacio alrededor o dentro del elemento.</p>
              {renderBaseFields([
                ...layoutFields,
                ...(selection.hasChildren ? gapFields : []),
              ])}
            </section>
          )}

          {inspectorSection === 'appearance' && (
            <section className="filtered-style-panel" aria-labelledby="appearance-panel-title">
              <h3 id="appearance-panel-title">Apariencia</h3>
              <p>Cambia la superficie, los bordes y la profundidad.</p>
              {renderBaseFields(appearanceFields)}
              <label>
                Visibilidad
                <select
                  aria-label="Visibilidad"
                  onChange={(event) => onStyleChange(viewport, 'base', 'visibility', event.target.value)}
                  value={currentStyleValue('visibility')}
                >
                  <option value="visible">Visible</option>
                  <option value="hidden">Oculto, conservando su espacio</option>
                </select>
              </label>
            </section>
          )}

          {inspectorSection === 'media' && supportsImageEditing && (
            <section className="filtered-style-panel" aria-labelledby="media-panel-title">
              <h3 id="media-panel-title">Imagen</h3>
              <p>Controla cómo se recorta y qué parte permanece visible dentro de su tamaño.</p>
              <div className="filtered-style-fields">
                <label>
                  Ajuste dentro del espacio
                  <select
                    aria-label="Ajuste dentro del espacio"
                    onChange={(event) => onStyleChange(viewport, 'base', 'objectFit', event.target.value)}
                    value={currentStyleValue('objectFit')}
                  >
                    <option value="cover">Llenar recortando</option>
                    <option value="contain">Mostrar completa</option>
                    <option value="fill">Estirar para llenar</option>
                    <option value="none">Tamaño original</option>
                  </select>
                </label>
                <label>
                  Parte visible
                  <select
                    aria-label="Parte visible de la imagen"
                    onChange={(event) => onStyleChange(viewport, 'base', 'objectPosition', event.target.value)}
                    value={currentStyleValue('objectPosition')}
                  >
                    <option value="50% 50%">Centro</option>
                    <option value="50% 0%">Arriba</option>
                    <option value="50% 100%">Abajo</option>
                    <option value="0% 50%">Izquierda</option>
                    <option value="100% 50%">Derecha</option>
                    <option value="0% 0%">Arriba a la izquierda</option>
                    <option value="100% 0%">Arriba a la derecha</option>
                    <option value="0% 100%">Abajo a la izquierda</option>
                    <option value="100% 100%">Abajo a la derecha</option>
                  </select>
                </label>
              </div>
            </section>
          )}

          {inspectorSection === 'alignment' && supportsAlignment && (
            <section className="filtered-style-panel" aria-labelledby="alignment-panel-title">
              <h3 id="alignment-panel-title">Alineación</h3>
              {elementKind === 'container' ? (
                <>
                  <p>Organiza y alinea los elementos que están dentro del contenedor.</p>
                  <div className="filtered-style-fields">
                    <label>
                      Organización
                      <select
                        aria-label="Organización de elementos"
                        onChange={(event) => {
                          const direction = event.target.value
                          onStyleChange(viewport, 'base', 'display', direction === 'grid' ? 'grid' : 'flex')
                          if (direction !== 'grid') {
                            onStyleChange(viewport, 'base', 'flexDirection', direction)
                          }
                        }}
                        value={isGridLayout ? 'grid' : computedDirection}
                      >
                        <option value="column">Vertical</option>
                        <option value="row">Horizontal</option>
                        <option value="grid">Cuadrícula</option>
                      </select>
                    </label>
                    <label>
                      Alineación horizontal
                      <select
                        aria-label="Alineación horizontal"
                        onChange={(event) => alignContainer(horizontalAlignmentProperty, event.target.value)}
                        value={normalizedAlignmentValue(horizontalAlignmentProperty)}
                      >
                        {renderAlignmentOptions(horizontalAlignmentProperty, 'horizontal')}
                      </select>
                    </label>
                    <label>
                      Alineación vertical
                      <select
                        aria-label="Alineación vertical"
                        onChange={(event) => alignContainer(verticalAlignmentProperty, event.target.value)}
                        value={normalizedAlignmentValue(verticalAlignmentProperty)}
                      >
                        {renderAlignmentOptions(verticalAlignmentProperty, 'vertical')}
                      </select>
                    </label>
                    {!isGridLayout && (
                      <label>
                        Ajuste de línea
                        <select
                          aria-label="Ajuste de línea"
                          onChange={(event) => onStyleChange(viewport, 'base', 'flexWrap', event.target.value)}
                          value={currentStyleValue('flexWrap')}
                        >
                          <option value="nowrap">Una línea</option>
                          <option value="wrap">Varias líneas</option>
                        </select>
                      </label>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <p>Elige cómo se alinea el texto dentro del elemento.</p>
                  <label>
                    Alineación del texto
                    <select
                      aria-label="Alineación del texto"
                      onChange={(event) => onStyleChange(viewport, 'base', 'textAlign', event.target.value)}
                      value={currentStyleValue('textAlign')}
                    >
                      <option value="start">Inicio</option>
                      <option value="left">Izquierda</option>
                      <option value="center">Centro</option>
                      <option value="right">Derecha</option>
                      <option value="justify">Justificado</option>
                    </select>
                  </label>
                </>
              )}
            </section>
          )}

          {inspectorSection === 'typography' && supportsTypography && (
            <section className="filtered-style-panel" aria-labelledby="typography-panel-title">
              <h3 id="typography-panel-title">Texto</h3>
              <p>Ajusta solamente la lectura y presentación del texto.</p>
              {renderBaseFields(typographyFields)}
            </section>
          )}

          {inspectorSection === 'effects' && supportsEffects && (
            <section className="filtered-style-panel effects-panel" aria-labelledby="effects-panel-title">
              <h3 id="effects-panel-title">Efectos de interacción</h3>
              <p>Elige cuándo debe aparecer el efecto y luego aplica un resultado preparado.</p>
              <label className="preset-select">
                Velocidad de transición
                <select
                  aria-label="Velocidad de transición"
                  onChange={(event) => onStyleChange(viewport, 'base', 'transition', event.target.value)}
                  value={currentStyleValue('transition') || 'none'}
                >
                  {!['none', 'all 120ms ease', 'all 180ms ease', 'all 300ms ease']
                    .includes(currentStyleValue('transition')) && (
                    <option value={currentStyleValue('transition')}>Configuración actual</option>
                  )}
                  <option value="none">Sin transición</option>
                  <option value="all 120ms ease">Rápida</option>
                  <option value="all 180ms ease">Suave</option>
                  <option value="all 300ms ease">Lenta</option>
                </select>
              </label>
              <label className="preset-select">
                ¿Cuándo sucede?
                <select
                  aria-label="Cuándo sucede el efecto"
                  onChange={(event) => setEffectState(event.target.value as EffectState)}
                  value={resolvedEffectState}
                >
                  {(Object.keys(effectStateLabels) as EffectState[]).map((value) => (
                    <option key={value} value={value}>{effectStateLabels[value]}</option>
                  ))}
                </select>
              </label>
              <p className="state-description">{effectStateDescriptions[resolvedEffectState]}</p>
              <section className="preset-section" aria-label="Efectos preparados">
                <label className="preset-select">
                  Efecto preparado
                  <select
                    aria-label="Efecto preparado"
                    onChange={(event) => setSelectedPreset(event.target.value)}
                    value={selectedPreset}
                  >
                    <option value="">Elige un efecto…</option>
                    {availablePresets.map((preset) => (
                      <option key={preset.label} value={preset.label}>{preset.label}</option>
                    ))}
                  </select>
                </label>
                {activePreset && <p className="preset-description">{activePreset.description}</p>}
                <button
                  className="button primary"
                  disabled={!activePreset}
                  onClick={() => {
                    if (!activePreset) return
                    onStylePreset(
                      viewport,
                      resolvedEffectState,
                      activePreset.styles,
                      activePreset.baseStyles,
                    )
                  }}
                  type="button"
                >Aplicar efecto</button>
              </section>
            </section>
          )}
          {existingOverride && (
            <button className="button danger" onClick={onResetDesign} type="button">Restablecer elemento</button>
          )}
        </div>
      ) : (
        <form className="interaction-form" noValidate onSubmit={submitConnection}>
          <label>
            Al hacer clic
            <select value={action} onChange={(event) => setAction(event.target.value as ConnectionAction)}>
              {(Object.keys(actionLabels) as ConnectionAction[]).map((value) => (
                <option key={value} value={value}>{actionLabels[value]}</option>
              ))}
            </select>
          </label>
          {action === 'navigate' && (
            <>
              <label>
                Pantalla de destino
                <select value={targetPage} onChange={(event) => setTargetPage(event.target.value)}>
                  {project.pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
                </select>
              </label>
              {(project.dataSources?.length ?? 0) > 0 && (
                <section className="data-context-section" aria-label="Datos enviados">
                  <label className="checkbox-label">
                    <input
                      checked={sendRecord}
                      onChange={(event) => setSendRecord(event.target.checked)}
                      type="checkbox"
                    />
                    Enviar un registro a la siguiente pantalla
                  </label>
                  {sendRecord && (
                    <>
                      <label>
                        Nombre del dato
                        <input
                          aria-label="Nombre del dato enviado"
                          onChange={(event) => setContextKey(event.target.value)}
                          value={contextKey}
                        />
                      </label>
                      <label>
                        Fuente de datos
                        <select
                          aria-label="Fuente de datos"
                          onChange={(event) => {
                            setDataSourceId(event.target.value)
                            setRecordId('')
                          }}
                          value={dataSourceId}
                        >
                          {project.dataSources?.map((source) => (
                            <option key={source.id} value={source.id}>{source.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Registro
                        {selectedDataSource?.type === 'static' ? (
                          <select
                            aria-label="Registro enviado"
                            onChange={(event) => setRecordId(event.target.value)}
                            value={recordId}
                          >
                            <option value="">Selecciona un registro…</option>
                            {containingRepeater?.dataSourceId === dataSourceId && (
                              <option value="$record.id">Registro de la fila (dinámico)</option>
                            )}
                            {selectedDataSource.records.map((record) => (
                              <option key={record.id} value={record.id}>
                                {String(record.name ?? record.title ?? record.id)}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <input
                            aria-label="Registro enviado"
                            onChange={(event) => setRecordId(event.target.value)}
                            placeholder="ID del registro"
                            value={recordId}
                          />
                        )}
                      </label>
                    </>
                  )}
                </section>
              )}
            </>
          )}
          {action === 'url' && (
            <label>Dirección web<input onChange={(event) => setUrl(event.target.value)} type="url" value={url} /></label>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button primary" type="submit">
            {existingConnection ? 'Actualizar conexión' : 'Guardar conexión'}
          </button>
          {existingConnection && (
            <button className="button danger" onClick={() => onDelete(selection.pageId, selection.elementId)} type="button">Eliminar conexión</button>
          )}
        </form>
      )}

      {brokenConnections.length > 0 && (
        <section className="connection-warnings">
          <h3>{brokenConnections.length} conexión(es) por revisar</h3>
        </section>
      )}

      <dl className="foundation-status inspector-status">
        <div><dt>Esquema</dt><dd>project.json v2</dd></div>
        <div><dt>Conexiones</dt><dd>{project.connections.length}</dd></div>
        <div><dt>Fuentes de datos</dt><dd>{project.dataSources?.length ?? 0}</dd></div>
        <div><dt>Vínculos de datos</dt><dd>{project.bindings?.length ?? 0}</dd></div>
        <div><dt>Listas repetidas</dt><dd>{project.repeaters?.length ?? 0}</dd></div>
        <div><dt>Editados</dt><dd>{project.elementOverrides?.length ?? 0}</dd></div>
      </dl>
    </aside>
  )
}
