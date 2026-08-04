import { useEffect, useMemo, useState } from 'react'
import type { Component } from 'grapesjs'
import {
  collectionDisplayName,
  isSafePublishableKey,
  readSupabaseAccessToken,
} from './supabase-data'
import type { SupabaseEditorConfig, SupabaseFieldType, SupabaseTableConfig } from './supabase-data'
import { motionComponentTypes } from './motion-analysis'
import type { MotionComponentType } from './motion-analysis'

interface MotionPanelProps {
  component: Component | null
  config: SupabaseEditorConfig
  notice?: string
  onOpenData?: () => void
  tables: SupabaseTableConfig[]
}

interface MotionSettingsDialogProps extends MotionPanelProps {
  onClose: () => void
  onSave: () => void
}

type MotionMode = 'analyze' | 'reference' | 'compare'

const modes: Array<{ description: string; id: MotionMode; label: string }> = [
  { id: 'analyze', label: 'Analizar', description: 'Extrae movimiento sin calificarlo.' },
  { id: 'reference', label: 'Crear referencia', description: 'Genera una plantilla temporal reutilizable.' },
  { id: 'compare', label: 'Comparar', description: 'Compara la entrada con una referencia aprobada.' },
]

function compatibleFields(table: SupabaseTableConfig | undefined, types: SupabaseFieldType[]) {
  return table?.fields.filter((field) => types.includes(field.type)) ?? []
}

function SelectField({ label, onChange, options, value }: {
  label: string
  onChange: (value: string) => void
  options: Array<{ label: string; value: string }>
  value: string
}) {
  return <label className="gjs-motion-field"><span>{label}</span><select onChange={(event) => onChange(event.target.value)} value={value}>
    <option value="">Seleccionar…</option>
    {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
  </select></label>
}

function Section({ children, description, open = false, title }: {
  children: React.ReactNode
  description: string
  open?: boolean
  title: string
}) {
  return <details className="gjs-motion-section" open={open}>
    <summary><span><strong>{title}</strong><small>{description}</small></span></summary>
    <div className="gjs-motion-section__body">{children}</div>
  </details>
}

export function MotionPanel({ component, config, notice, onOpenData, tables }: MotionPanelProps) {
  const [, setRevision] = useState(0)
  const [recordOptions, setRecordOptions] = useState<Array<{ id: string; label: string }>>([])
  const [recordSearch, setRecordSearch] = useState('')
  const [recordStatus, setRecordStatus] = useState('')
  const attributes = component?.getAttributes() ?? {}
  const mode = (attributes['data-motion-mode'] || 'compare') as MotionMode
  const rawComponentType = attributes['data-motion-component-type']
  const componentType = motionComponentTypes.some((item) => item.id === rawComponentType)
    ? rawComponentType as MotionComponentType
    : null
  const definition = motionComponentTypes.find((item) => item.id === componentType)
  const isReferenceView = componentType === 'reference-view'
  const inputSource = attributes['data-motion-input-source'] || 'camera'
  const referenceSource = attributes['data-motion-reference-source'] || 'data'
  const referenceRecordMode = attributes['data-motion-reference-record-mode'] || 'context'
  const referenceTable = tables.find((table) => table.id === attributes['data-motion-reference-table'])
  const resultTable = tables.find((table) => table.id === attributes['data-motion-result-table'])
  const tableOptions = useMemo(() => tables.map((table) => ({
    label: collectionDisplayName(table), value: table.id,
  })), [tables])

  useEffect(() => {
    if (referenceSource !== 'data' || referenceRecordMode !== 'specific' || !referenceTable) {
      setRecordOptions([])
      setRecordStatus('')
      return
    }
    const controller = new AbortController()
    const titleField = ['title', 'name', 'display_name', 'email']
      .find((name) => referenceTable.fields.some((field) => field.name === name))
    const load = async () => {
      if (!config.projectUrl || !isSafePublishableKey(config.publishableKey)) {
        setRecordStatus('Conecta Supabase para buscar registros.')
        return
      }
      const accessToken = readSupabaseAccessToken(config.projectUrl)
      if ((referenceTable.access === 'authenticated_read' || referenceTable.access === 'user_owned') && !accessToken) {
        setRecordStatus('Inicia sesión en la vista previa para buscar esta colección.')
        return
      }
      setRecordStatus('Buscando registros…')
      const url = new URL(`${config.projectUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(referenceTable.name)}`)
      url.searchParams.set('select', ['id', titleField].filter(Boolean).join(','))
      url.searchParams.set('limit', '50')
      if (titleField) url.searchParams.set('order', `${titleField}.asc`)
      try {
        const response = await fetch(url.href, { signal: controller.signal, headers: {
          apikey: config.publishableKey,
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        } })
        if (!response.ok) throw new Error('No se pudieron consultar los registros.')
        const rows = await response.json() as Array<Record<string, unknown>>
        setRecordOptions(rows.flatMap((row) => {
          if (row.id == null) return []
          const id = String(row.id)
          const title = titleField && row[titleField] != null ? String(row[titleField]) : id
          return [{ id, label: title === id ? id : `${title} · ${id}` }]
        }))
        setRecordStatus(rows.length ? '' : 'Esta colección todavía no tiene registros visibles.')
      } catch (error) {
        if (!controller.signal.aborted) setRecordStatus(error instanceof Error ? error.message : 'No se pudieron consultar los registros.')
      }
    }
    void load()
    return () => controller.abort()
  }, [config.projectUrl, config.publishableKey, referenceRecordMode, referenceSource, referenceTable])

  if (!component) return <div className="gjs-motion-empty">
    <span aria-hidden="true">◎</span>
    <strong>Selecciona una actividad</strong>
    <p>Elige una actividad de movimiento o cualquiera de sus partes en el lienzo.</p>
  </div>

  function write(name: string, value: string) {
    component?.addAttributes({ [name]: value })
    setRevision((revision) => revision + 1)
  }

  function toggle(name: string, checked: boolean) {
    write(name, checked ? 'true' : 'false')
  }

  function tableFields(table: SupabaseTableConfig | undefined, types: SupabaseFieldType[]) {
    return compatibleFields(table, types).map((field) => ({ label: field.name, value: field.name }))
  }

  let decodedTemplate = ''
  try { decodedTemplate = decodeURIComponent(attributes['data-motion-reference-template'] || '') } catch { decodedTemplate = '' }

  return <div className="gjs-motion-panel">
    <header className="gjs-motion-panel__header">
      <span className="gjs-motion-panel__icon" aria-hidden="true">◎</span>
      <div><strong>{definition?.label ?? 'Movimiento'}</strong><p>{definition?.description ?? 'Entrada → procesamiento → resultado'}</p></div>
    </header>

    {!componentType && <><div className="gjs-motion-mode" role="group" aria-label="Operación de movimiento">
      {modes.map((item) => <button
        aria-pressed={mode === item.id}
        className={mode === item.id ? 'active' : ''}
        key={item.id}
        onClick={() => write('data-motion-mode', item.id)}
        title={item.description}
        type="button"
      >{item.label}</button>)}
    </div>
    <p className="gjs-motion-mode__help">{modes.find((item) => item.id === mode)?.description}</p></>}
    {notice && <p className="gjs-motion-notice" role="status">{notice}</p>}

    {!isReferenceView && <Section description="Elige de dónde llega el movimiento." open title="1. Entrada">
      <SelectField label="Fuente" onChange={(value) => write('data-motion-input-source', value)} value={inputSource} options={[
        { value: 'camera', label: 'Cámara en vivo' },
        { value: 'element', label: 'Video de esta página' },
        { value: 'url', label: 'Video mediante URL' },
      ]} />
      {inputSource === 'camera' && <SelectField label="Cámara" onChange={(value) => write('data-motion-facing-mode', value)} value={attributes['data-motion-facing-mode'] || 'user'} options={[
        { value: 'user', label: 'Frontal' }, { value: 'environment', label: 'Trasera' },
      ]} />}
      {inputSource === 'element' && <label className="gjs-motion-field"><span>Selector del video</span><input placeholder="#video-practica" value={attributes['data-motion-input-selector'] || ''} onChange={(event) => write('data-motion-input-selector', event.target.value)} /><small>Usa el ID o selector CSS de un video en esta página.</small></label>}
      {inputSource === 'url' && <label className="gjs-motion-field"><span>URL del video</span><input type="url" placeholder="https://…/movimiento.mp4" value={attributes['data-motion-input-url'] || ''} onChange={(event) => write('data-motion-input-url', event.target.value)} /></label>}
      {inputSource !== 'url' && <label className="gjs-motion-field"><span>Duración de captura</span><div className="gjs-motion-number"><input min="1000" max="10000" step="250" type="number" value={attributes['data-motion-duration'] || '3000'} onChange={(event) => write('data-motion-duration', event.target.value)} /><em>ms</em></div></label>}
    </Section>}

    {(mode === 'compare' || isReferenceView) && <Section description={isReferenceView ? 'Elige el video y la plantilla de puntos que se reproducirán.' : 'Selecciona la secuencia aprobada que servirá de modelo.'} open title={isReferenceView ? '1. Fuente de referencia' : '2. Referencia'}>
      <SelectField label="Origen" onChange={(value) => write('data-motion-reference-source', value)} value={referenceSource} options={[
        { value: 'data', label: 'Registro de una colección' },
        { value: 'url', label: 'Video o plantilla mediante URL' },
        { value: 'template', label: 'Plantilla JSON incrustada' },
      ]} />
      {referenceSource === 'url' && <label className="gjs-motion-field"><span>URL de referencia</span><input type="url" placeholder="https://…/referencia.json" value={attributes['data-motion-reference-url'] || ''} onChange={(event) => write('data-motion-reference-url', event.target.value)} /><small>Una plantilla JSON evita reprocesar el video en cada intento.</small></label>}
      {referenceSource === 'template' && <label className="gjs-motion-field"><span>Plantilla compilada</span><textarea rows={5} placeholder="Pega aquí la plantilla JSON" value={decodedTemplate} onChange={(event) => write('data-motion-reference-template', encodeURIComponent(event.target.value))} /></label>}
      {referenceSource === 'data' && <>
        <SelectField label="Colección" onChange={(value) => {
          write('data-motion-reference-table', value)
          write('data-motion-reference-record-id', '')
        }} value={attributes['data-motion-reference-table'] || ''} options={tableOptions} />
        {referenceTable ? <>
          <SelectField label="Qué registro usar" onChange={(value) => {
            write('data-motion-reference-record-mode', value)
            if (value !== 'specific') write('data-motion-reference-record-id', '')
          }} value={referenceRecordMode} options={[
            { value: 'context', label: 'El seleccionado en otra página' },
            { value: 'first', label: 'El primero de la colección' },
            { value: 'last', label: 'El último de la colección' },
            { value: 'specific', label: 'Un registro específico' },
          ]} />
          {referenceRecordMode === 'context' && <p className="gjs-motion-callout">La tarjeta pulsada pasa su ID mediante la navegación. Esta página mostrará exactamente ese registro.</p>}
          {(referenceRecordMode === 'first' || referenceRecordMode === 'last') && <p className="gjs-motion-callout">Se usará {referenceRecordMode === 'first' ? 'el primer' : 'el último'} registro según el orden configurado para la colección.</p>}
          {referenceRecordMode === 'specific' && <div className="gjs-motion-record-picker">
            <label className="gjs-motion-field"><span>Buscar registro</span><input onChange={(event) => setRecordSearch(event.target.value)} placeholder="Título o identificador" type="search" value={recordSearch} /></label>
            <SelectField label="Registro" onChange={(value) => write('data-motion-reference-record-id', value)} value={attributes['data-motion-reference-record-id'] || ''} options={recordOptions
              .filter((record) => record.label.toLocaleLowerCase().includes(recordSearch.trim().toLocaleLowerCase()))
              .map((record) => ({ label: record.label, value: record.id }))} />
            {recordStatus && <small className="gjs-motion-record-status" role="status">{recordStatus}</small>}
          </div>}
          <SelectField label="Campo de plantilla" onChange={(value) => write('data-motion-reference-template-field', value)} value={attributes['data-motion-reference-template-field'] || ''} options={tableFields(referenceTable, ['json'])} />
          <SelectField label="Video de respaldo" onChange={(value) => write('data-motion-reference-video-field', value)} value={attributes['data-motion-reference-video-field'] || ''} options={tableFields(referenceTable, ['media', 'url'])} />
        </> : <div className="gjs-motion-callout">Crea o selecciona una colección para guardar referencias.<button onClick={onOpenData} type="button">Abrir Datos</button></div>}
      </>}
    </Section>}

    <Section description="Controla qué señales se extraen y cómo se limpia la secuencia." title={mode === 'compare' ? '3. Procesamiento' : '2. Procesamiento'}>
      <div className="gjs-motion-check-grid">
        <label><input checked={attributes['data-motion-hands'] !== 'false'} onChange={(event) => toggle('data-motion-hands', event.target.checked)} type="checkbox" />Manos</label>
        <label><input checked={attributes['data-motion-pose'] !== 'false'} onChange={(event) => toggle('data-motion-pose', event.target.checked)} type="checkbox" />Postura</label>
        <label><input checked={attributes['data-motion-face'] === 'true'} onChange={(event) => toggle('data-motion-face', event.target.checked)} type="checkbox" />Rostro</label>
      </div>
      <label className="gjs-motion-field"><span>Confianza mínima</span><input min="0" max="1" step="0.05" type="range" value={attributes['data-motion-confidence'] || '0.5'} onChange={(event) => write('data-motion-confidence', event.target.value)} /><output>{Math.round(Number(attributes['data-motion-confidence'] || .5) * 100)}%</output></label>
      <SelectField label="Suavizado temporal" onChange={(value) => write('data-motion-smoothing', value)} value={attributes['data-motion-smoothing'] || '3'} options={[
        { value: '1', label: 'Ninguno' }, { value: '3', label: 'Ligero' }, { value: '5', label: 'Medio' }, { value: '7', label: 'Fuerte' },
      ]} />
      <label className="gjs-motion-switch"><input checked={attributes['data-motion-checkpoints'] !== 'false'} onChange={(event) => toggle('data-motion-checkpoints', event.target.checked)} type="checkbox" /><span><strong>Reducir a puntos clave</strong><small>Conserva cambios significativos de forma, orientación y trayectoria.</small></span></label>
    </Section>

    {!isReferenceView && <Section description="Define la evaluación y lo que verá la persona." title={mode === 'compare' ? '4. Resultado' : '3. Resultado'}>
      {mode === 'compare' && <label className="gjs-motion-field"><span>Puntaje para aprobar</span><div className="gjs-motion-number"><input min="0" max="100" type="number" value={attributes['data-motion-passing-score'] || '75'} onChange={(event) => write('data-motion-passing-score', event.target.value)} /><em>%</em></div></label>}
      <p className="gjs-motion-callout">{mode === 'reference' ? 'La captura genera una plantilla MediaPipe reutilizable que puede descargarse o conectarse al formulario de una práctica.' : 'El diseño de la cámara, controles y resultados se edita directamente en el lienzo.'}</p>
    </Section>}

    {mode === 'compare' && <Section description="Guarda los resultados solamente cuando el proyecto lo necesite." title="5. Guardado">
      <label className="gjs-motion-switch"><input checked={attributes['data-motion-save'] === 'true'} onChange={(event) => toggle('data-motion-save', event.target.checked)} type="checkbox" /><span><strong>Guardar resultados</strong><small>Usa la conexión de Datos; el procesamiento continúa siendo local.</small></span></label>
      {attributes['data-motion-save'] === 'true' && <>
        <SelectField label="Colección de resultados" onChange={(value) => write('data-motion-result-table', value)} value={attributes['data-motion-result-table'] || ''} options={tableOptions} />
        {resultTable ? <div className="gjs-motion-field-grid">
          <SelectField label="Puntaje" onChange={(value) => write('data-motion-result-score-field', value)} value={attributes['data-motion-result-score-field'] || ''} options={tableFields(resultTable, ['number'])} />
          <SelectField label="Retroalimentación" onChange={(value) => write('data-motion-result-feedback-field', value)} value={attributes['data-motion-result-feedback-field'] || ''} options={tableFields(resultTable, ['text', 'long_text'])} />
          <SelectField label="Detalles" onChange={(value) => write('data-motion-result-details-field', value)} value={attributes['data-motion-result-details-field'] || ''} options={tableFields(resultTable, ['json'])} />
          <SelectField label="Duración" onChange={(value) => write('data-motion-result-duration-field', value)} value={attributes['data-motion-result-duration-field'] || ''} options={tableFields(resultTable, ['number'])} />
          <SelectField label="Relación con el registro" onChange={(value) => write('data-motion-result-relation-field', value)} value={attributes['data-motion-result-relation-field'] || ''} options={tableFields(resultTable, ['uuid'])} />
        </div> : <div className="gjs-motion-callout">Selecciona o crea una colección para mapear solamente campos compatibles.<button onClick={onOpenData} type="button">Abrir Datos</button></div>}
      </>}
    </Section>}
  </div>
}

export function MotionSettingsDialog(props: MotionSettingsDialogProps) {
  return <div className="gjs-motion-dialog-backdrop" onMouseDown={(event) => {
    if (event.target === event.currentTarget) props.onClose()
  }}>
    <section aria-label="Editar componente de MediaPipe" aria-modal="true" className="gjs-motion-dialog" role="dialog">
      <header className="gjs-motion-dialog__header">
        <div><strong>Editar componente de MediaPipe</strong><small>Las opciones cambian según el tipo de actividad.</small></div>
        <button aria-label="Cerrar" onClick={props.onClose} type="button">×</button>
      </header>
      <div className="gjs-motion-dialog__content">
        <MotionPanel component={props.component} config={props.config} notice={props.notice} onOpenData={props.onOpenData} tables={props.tables} />
      </div>
      <footer className="gjs-motion-dialog__footer">
        <button onClick={props.onClose} type="button">Cerrar</button>
        <button className="primary" onClick={props.onSave} type="button">Guardar cambios</button>
      </footer>
    </section>
  </div>
}
