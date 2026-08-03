import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  readEditorConnection,
  removeEditorConnection,
  saveEditorConnection,
  verifyEditorTable,
} from '../editor-platform'
import type { EditorConnectionRecord } from '../editor-platform'
import {
  accessModeLabels,
  appliedSupabaseSchema,
  builtInFields,
  collectionDisplayName,
  createSupabaseMigrationSql,
  createSupabaseSetupSql,
  describeSupabaseSchemaChanges,
  fieldTypeLabels,
  isSafePublishableKey,
  importSupabaseSchemaSql,
  normalizedSupabaseConfig,
  readSupabaseAccessToken,
  safeDatabaseIdentifier,
  verifySupabaseTable,
} from './supabase-data'
import type {
  SupabaseAccessMode,
  SupabaseEditorConfig,
  SupabaseFieldType,
  SupabaseRelation,
  SupabaseTableConfig,
} from './supabase-data'
import {
  dataComponentTemplateById,
  dataComponentTemplates,
  defaultDataComponentOptions,
  suggestDataComponentMapping,
} from './data-component-templates'
import type {
  DataComponentMapping,
  DataComponentOptions,
  DataComponentTemplateId,
} from './data-component-templates'

export interface SelectedDataElement {
  bindingField?: string
  bindingScope?: 'context' | 'first'
  bindingTarget: string
  dataSourceTableId?: string
  inheritedRepeaterTableId?: string
  isRepeater: boolean
  repeaterTableId?: string
}

interface SupabaseDataPanelProps {
  config: SupabaseEditorConfig
  dataComponentRequest?: number
  editorProjectId: string
  onChange: (config: SupabaseEditorConfig) => void
  onInsertDataComponent: (templateId: DataComponentTemplateId, tableId: string, mapping: DataComponentMapping, options: DataComponentOptions) => void
  onRemoveBinding: () => void
  onSaveBinding: (tableId: string, field: string, target: string, scope: 'context' | 'first') => void
  onToggleRepeater: (tableId: string) => void
  selectedElement: SelectedDataElement | null
}

type CollectionTemplate = {
  description: string
  fields: Array<{ name: string; type: SupabaseFieldType }>
  id: string
  name: string
}

const collectionTemplates: CollectionTemplate[] = [
  { id: 'products', name: 'Productos', description: 'Nombre, descripción, imagen y precio.', fields: [
    { name: 'nombre', type: 'text' }, { name: 'descripcion', type: 'long_text' },
    { name: 'imagen_url', type: 'media' }, { name: 'precio', type: 'number' },
  ] },
  { id: 'books', name: 'Libros', description: 'Título, autor, portada y descripción.', fields: [
    { name: 'titulo', type: 'text' }, { name: 'autor', type: 'text' },
    { name: 'portada_url', type: 'media' }, { name: 'descripcion', type: 'long_text' },
  ] },
  { id: 'projects', name: 'Proyectos', description: 'Título, estudiante, imagen y resumen.', fields: [
    { name: 'titulo', type: 'text' }, { name: 'estudiante', type: 'text' },
    { name: 'imagen_url', type: 'media' }, { name: 'resumen', type: 'long_text' },
  ] },
  { id: 'events', name: 'Eventos', description: 'Nombre, fecha, lugar y descripción.', fields: [
    { name: 'nombre', type: 'text' }, { name: 'fecha', type: 'date' },
    { name: 'lugar', type: 'text' }, { name: 'descripcion', type: 'long_text' },
  ] },
  { id: 'blank', name: 'Desde cero', description: 'Comienza con un campo de título.', fields: [
    { name: 'titulo', type: 'text' },
  ] },
]

function PanelSection({ children, open, onToggle, title }: {
  children: React.ReactNode
  open: boolean
  onToggle: () => void
  title: string
}) {
  return (
    <section className={`gjs-supabase-section ${open ? 'open' : ''}`}>
      <button aria-expanded={open} className="gjs-supabase-section-toggle" onClick={onToggle} type="button">
        <span aria-hidden="true" className="gjs-supabase-chevron" />
        <span><strong>{title}</strong></span>
      </button>
      {open && <div className="gjs-supabase-section-content">{children}</div>}
    </section>
  )
}

function Modal({ children, onClose, title }: {
  children: React.ReactNode
  onClose: () => void
  title: string
}) {
  return createPortal(
    <div className="gjs-data-modal-backdrop gjs-editor-theme-scope" role="presentation">
      <section aria-label={title} aria-modal="true" className="gjs-data-modal" role="dialog">
        <header>
          <strong>{title}</strong>
          <button aria-label="Cerrar" onClick={onClose} type="button">×</button>
        </header>
        <div className="gjs-data-modal-body">{children}</div>
      </section>
    </div>,
    document.body,
  )
}

function SettingsModal({ config, editorProjectId, onChange, onClose }: {
  config: SupabaseEditorConfig
  editorProjectId: string
  onChange: (config: SupabaseEditorConfig) => void
  onClose: () => void
}) {
  const safeKey = !config.publishableKey || isSafePublishableKey(config.publishableKey)
  const [savedConnection, setSavedConnection] = useState<EditorConnectionRecord | null>(null)
  const [secretKey, setSecretKey] = useState('')
  const [savingSecret, setSavingSecret] = useState(false)
  const [connectionNotice, setConnectionNotice] = useState('')

  useEffect(() => {
    let active = true
    void readEditorConnection(editorProjectId).then((connection) => {
      if (active) setSavedConnection(connection)
    }).catch((cause: unknown) => {
      if (active) setConnectionNotice(cause instanceof Error ? cause.message : 'No pudimos leer la conexión privada.')
    })
    return () => { active = false }
  }, [editorProjectId])

  async function savePrivateConnection() {
    setSavingSecret(true)
    setConnectionNotice('Guardando la conexión de forma cifrada…')
    try {
      const result = await saveEditorConnection({
        editorProjectId,
        projectUrl: config.projectUrl,
        publishableKey: config.publishableKey,
        secretKey,
      })
      setSavedConnection(result.connection)
      setSecretKey('')
      setConnectionNotice('✓ Conexión privada guardada. La secret key no volverá al navegador.')
    } catch (cause) {
      setConnectionNotice(cause instanceof Error ? cause.message : 'No pudimos guardar la conexión privada.')
    } finally {
      setSavingSecret(false)
    }
  }

  async function removePrivateConnection() {
    setSavingSecret(true)
    try {
      await removeEditorConnection(editorProjectId)
      setSavedConnection(null)
      setSecretKey('')
      setConnectionNotice('Conexión privada eliminada.')
    } catch (cause) {
      setConnectionNotice(cause instanceof Error ? cause.message : 'No pudimos eliminar la conexión.')
    } finally {
      setSavingSecret(false)
    }
  }

  return (
    <Modal onClose={onClose} title="Configuración de Supabase">
      <div className="gjs-data-form">
        <div className="gjs-flow-introduction">
          <span aria-hidden="true">⚙</span>
          <div>
            <strong>Conexión del proyecto</strong>
            <p>Esta conexión se usa para todas tus colecciones.</p>
          </div>
        </div>
        <label>
          URL del proyecto
          <input
            onChange={(event) => onChange({ ...config, projectUrl: event.target.value })}
            placeholder="https://xxxxx.supabase.co"
            type="url"
            value={config.projectUrl}
          />
        </label>
        <label>
          Publishable key
          <input
            onChange={(event) => onChange({ ...config, publishableKey: event.target.value })}
            placeholder="sb_publishable_..."
            type="text"
            value={config.publishableKey}
          />
        </label>
        <p className={safeKey ? 'gjs-data-safety' : 'gjs-data-key-error'}>
          {safeKey
            ? 'Nunca pegues aquí una secret key o service_role key.'
            : 'Esta clave no es publicable. No se guardará en una exportación.'}
        </p>
        <div className="gjs-flow-connected">
          <span aria-hidden="true">{config.projectUrl && safeKey && config.publishableKey ? '●' : '○'}</span>
          <p>{config.projectUrl && safeKey && config.publishableKey ? 'Conexión lista para comprobar colecciones.' : 'Completa ambos campos para conectar.'}</p>
        </div>
        <div className="gjs-data-divider" />
        <div className="gjs-flow-introduction">
          <span aria-hidden="true">🔒</span>
          <div><strong>Acceso privado del editor</strong><p>Permite comprobar tablas internas. Se cifra en el Supabase del editor y nunca se incluye al exportar.</p></div>
        </div>
        {savedConnection && <div className="gjs-flow-connected"><span aria-hidden="true">✓</span><p>Secret key guardada: <strong>{savedConnection.secret_hint}</strong></p></div>}
        <label>
          {savedConnection ? 'Reemplazar secret key' : 'Secret key'}
          <input autoComplete="off" onChange={(event) => setSecretKey(event.target.value)} placeholder="sb_secret_..." type="password" value={secretKey} />
        </label>
        <p className="gjs-data-safety">Usa una secret key dedicada para el editor. Puedes revocarla desde Supabase cuando quieras.</p>
        <div className="gjs-data-actions">
          <button className="gjs-flow-primary" disabled={savingSecret || !safeKey || !config.projectUrl || !config.publishableKey || !secretKey.startsWith('sb_secret_')} onClick={savePrivateConnection} type="button">{savingSecret ? 'Guardando…' : savedConnection ? 'Reemplazar clave' : 'Guardar acceso privado'}</button>
          {savedConnection ? <button className="gjs-flow-secondary" disabled={savingSecret} onClick={removePrivateConnection} type="button">Quitar acceso</button> : <span />}
        </div>
        {connectionNotice && <p className="gjs-data-modal-notice" role="status">{connectionNotice}</p>}
      </div>
    </Modal>
  )
}

function CollectionWizard({ config, onClose, onCreate }: {
  config: SupabaseEditorConfig
  onClose: () => void
  onCreate: (tables: SupabaseTableConfig[]) => void
}) {
  const [stage, setStage] = useState<'start' | 'templates' | 'author'>('start')
  const [startChoice, setStartChoice] = useState<'template' | 'blank' | null>(null)
  const [mode, setMode] = useState<'visual' | 'sql'>('visual')
  const [templateId, setTemplateId] = useState('books')
  const selectedTemplate = collectionTemplates.find((template) => template.id === templateId) ?? collectionTemplates[0]
  const createDraft = (template: CollectionTemplate): SupabaseTableConfig => ({
    access: 'public_read',
    displayName: template.name,
    fields: template.fields.map((field) => ({ ...field, id: crypto.randomUUID() })),
    id: `draft-${crypto.randomUUID()}`,
    name: safeDatabaseIdentifier(template.name) || `collection_${Date.now()}`,
    relations: [],
    setupStatus: 'draft',
  })
  const [drafts, setDrafts] = useState<SupabaseTableConfig[]>(() => [createDraft(selectedTemplate)])
  const [selectedDraftId, setSelectedDraftId] = useState(drafts[0].id)
  const [sql, setSql] = useState('')
  const [sqlError, setSqlError] = useState('')
  const [sqlTableCount, setSqlTableCount] = useState(0)
  const [visualDirty, setVisualDirty] = useState(false)
  const [sqlWasRegenerated, setSqlWasRegenerated] = useState(false)
  const draft = drafts.find((table) => table.id === selectedDraftId) ?? drafts[0]

  function chooseTemplate(template: CollectionTemplate) {
    setTemplateId(template.id)
  }

  function beginAuthoring(template: CollectionTemplate) {
    const next = createDraft(template)
    setDrafts([next])
    setSelectedDraftId(next.id)
    setSql('')
    setSqlTableCount(0)
    setVisualDirty(false)
    setSqlWasRegenerated(false)
    setMode('visual')
    setStage('author')
  }

  function continueFromStart() {
    if (startChoice === 'template') setStage('templates')
    if (startChoice === 'blank') beginAuthoring(collectionTemplates.find((template) => template.id === 'blank')!)
  }

  function updateDraft(update: (current: SupabaseTableConfig) => SupabaseTableConfig) {
    setVisualDirty(true)
    setDrafts((current) => current.map((table) => table.id === draft.id ? update(table) : table))
  }

  function addField() {
    updateDraft((current) => ({ ...current, fields: [...current.fields, {
      id: crypto.randomUUID(), name: `campo_${current.fields.length + 1}`, type: 'text',
    }] }))
  }

  function finishVisual() {
    onCreate(drafts.map((table) => ({
      ...table,
      id: table.id.startsWith('draft-') ? crypto.randomUUID() : table.id,
      setupStatus: 'draft',
    })))
  }

  function applyParsedVisual(nextSql: string, showErrors = false) {
    try {
      const imported = importSupabaseSchemaSql(nextSql, { ...config, tables: drafts })
      setDrafts(imported.tables)
      setSelectedDraftId(imported.tables[0].id)
      setSqlTableCount(imported.tables.length)
      setSqlError('')
      setVisualDirty(false)
      setSqlWasRegenerated(false)
      return imported.tables
    } catch (cause) {
      setSqlTableCount(0)
      if (showErrors) setSqlError(cause instanceof Error ? cause.message : 'No pudimos leer este SQL.')
      return null
    }
  }

  function showSql() {
    if (!sql.trim() || visualDirty) {
      setSql(createSupabaseSetupSql({ ...config, tables: drafts }))
      setSqlWasRegenerated(Boolean(sql.trim() && visualDirty))
      setVisualDirty(false)
    }
    setSqlTableCount(drafts.length)
    setSqlError('')
    setMode('sql')
  }

  function showVisual() {
    if (sql.trim() && !applyParsedVisual(sql, true)) return
    setMode('visual')
  }

  function finishSql() {
    const imported = applyParsedVisual(sql, true)
    if (imported) onCreate(imported.map((table) => ({ ...table, setupStatus: 'draft' })))
  }

  const canCreate = drafts.length > 0 && drafts.every((table) => table.displayName?.trim()
    && table.fields.length && table.fields.every((field) => safeDatabaseIdentifier(field.name)))

  return (
    <Modal onClose={onClose} title="Crear o importar colecciones">
      {stage === 'start' && <div className="gjs-data-form">
        <div className="gjs-flow-introduction"><span aria-hidden="true">◇</span><div><strong>¿Cómo quieres comenzar?</strong><p>Primero elige un punto de partida. Después podrás trabajar visualmente o con SQL.</p></div></div>
        <div className="gjs-data-start-grid">
          <button className={startChoice === 'template' ? 'selected' : ''} onClick={() => setStartChoice('template')} type="button"><span aria-hidden="true">▦</span><strong>Usar una plantilla</strong><small>Comienza con campos de un ejemplo y personalízalos.</small></button>
          <button className={startChoice === 'blank' ? 'selected' : ''} onClick={() => setStartChoice('blank')} type="button"><span aria-hidden="true">＋</span><strong>Empezar desde cero</strong><small>Crea tu propia tabla campo por campo.</small></button>
        </div>
        <div className="gjs-data-wizard-actions"><span /><button className="gjs-flow-primary" disabled={!startChoice} onClick={continueFromStart} type="button">Continuar</button></div>
      </div>}

      {stage === 'templates' && <div className="gjs-data-form">
        <div className="gjs-flow-introduction"><span aria-hidden="true">▦</span><div><strong>Elige una plantilla</strong><p>Podrás cambiar el nombre, los campos y la visibilidad después.</p></div></div>
        <div className="gjs-data-template-grid">
          {collectionTemplates.filter((template) => template.id !== 'blank').map((template) => <button className={template.id === templateId ? 'selected' : ''} key={template.id} onClick={() => chooseTemplate(template)} type="button"><strong>{template.name}</strong><span>{template.description}</span></button>)}
        </div>
        <div className="gjs-data-wizard-actions"><button onClick={() => setStage('start')} type="button">Atrás</button><button className="gjs-flow-primary" onClick={() => beginAuthoring(selectedTemplate)} type="button">Usar esta plantilla</button></div>
      </div>}

      {stage === 'author' && <><div className="gjs-data-authoring-tabs" role="tablist" aria-label="Forma de editar las colecciones">
        <button aria-selected={mode === 'visual'} className={mode === 'visual' ? 'active' : ''} onClick={showVisual} role="tab" type="button">Visual</button>
        <button aria-selected={mode === 'sql'} className={mode === 'sql' ? 'active' : ''} onClick={showSql} role="tab" type="button">SQL</button>
      </div>
      {mode === 'visual' && <div className="gjs-data-form">
        {drafts.length > 1 && <section className="gjs-data-imported-tables" aria-label="Tablas importadas">
          <div className="gjs-data-imported-tables-heading"><strong>{drafts.length} tablas importadas</strong><span>Selecciona una para revisar o editar sus campos.</span></div>
          <div className="gjs-data-imported-table-list" role="tablist" aria-label="Tablas importadas">
            {drafts.map((table) => <button aria-selected={table.id === draft.id} className={table.id === draft.id ? 'selected' : ''} key={table.id} onClick={() => setSelectedDraftId(table.id)} role="tab" type="button"><strong>{collectionDisplayName(table)}</strong><small>{table.fields.length} campos</small></button>)}
          </div>
        </section>}
        <label>
          Nombre de la colección
          <input autoFocus onChange={(event) => updateDraft((current) => ({ ...current, displayName: event.target.value, name: safeDatabaseIdentifier(event.target.value) || current.name }))} placeholder="Por ejemplo: Prácticas" value={draft.displayName} />
        </label>
        <div className="gjs-data-section-heading">
            <div><strong>Información de cada elemento</strong><span>{draft.fields.length} campos</span></div>
            <button onClick={addField} type="button">+ Información</button>
          </div>
          <div className="gjs-data-fields">
          {draft.fields.map((field) => <div className="gjs-data-field" key={field.id}>
            <input aria-label="Nombre de la información" onChange={(event) => updateDraft((current) => ({ ...current, fields: current.fields.map((candidate) => candidate.id === field.id ? { ...candidate, name: event.target.value } : candidate) }))} value={field.name} />
            <select aria-label="Tipo de información" onChange={(event) => updateDraft((current) => ({ ...current, fields: current.fields.map((candidate) => candidate.id === field.id ? { ...candidate, type: event.target.value as SupabaseFieldType } : candidate) }))} value={field.type}>
              {(['text', 'long_text', 'number', 'boolean', 'date', 'datetime', 'media', 'url', 'json'] as const).map((type) => <option key={type} value={type}>{fieldTypeLabels[type]}</option>)}
            </select>
            <button aria-label={`Eliminar ${field.name}`} disabled={draft.fields.length === 1} onClick={() => updateDraft((current) => ({ ...current, fields: current.fields.filter((candidate) => candidate.id !== field.id) }))} type="button">×</button>
          </div>)}
        </div>
        <div className="gjs-data-divider" />
        <div className="gjs-data-section-heading"><div><strong>Visibilidad</strong><span>La protección se creará automáticamente.</span></div></div>
        <div className="gjs-data-choice-grid">
          <button className={draft.access === 'public_read' ? 'selected' : ''} onClick={() => updateDraft((current) => ({ ...current, access: 'public_read' }))} type="button">
            <strong>Todos pueden verla</strong><span>Para catálogos, libros, productos y contenido público.</span>
          </button>
          <button className={draft.access === 'user_owned' ? 'selected' : ''} onClick={() => updateDraft((current) => ({ ...current, access: 'user_owned' }))} type="button">
            <strong>Cada usuario ve la suya</strong><span>Para perfiles, progreso, favoritos e información personal.</span>
          </button>
        </div>
        <div className="gjs-data-wizard-actions"><button onClick={() => setStage(startChoice === 'template' ? 'templates' : 'start')} type="button">Atrás</button><button className="gjs-flow-primary" disabled={!canCreate} onClick={finishVisual} type="button">{drafts.length === 1 ? 'Crear colección' : `Crear ${drafts.length} colecciones`}</button></div>
      </div>}
      {mode === 'sql' && <div className="gjs-data-form gjs-data-sql-import">
        <div className="gjs-flow-introduction"><span aria-hidden="true">&lt;/&gt;</span><div><strong>Edita o pega el esquema SQL</strong><p>Los cambios válidos se traducen a la vista Visual. El código no se ejecuta en Supabase desde aquí.</p></div></div>
        <label>Código SQL<textarea aria-label="SQL para crear o importar" autoFocus onChange={(event) => { const value = event.target.value; setSql(value); applyParsedVisual(value) }} value={sql} /></label>
        {sqlTableCount > 0 && <div className="gjs-data-sql-recognized"><p className="gjs-flow-notice">✓ {sqlTableCount} {sqlTableCount === 1 ? 'tabla reconocida' : 'tablas reconocidas'}</p>{sqlTableCount > 1 && <div>{drafts.map((table) => <span key={table.id}>{collectionDisplayName(table)}</span>)}</div>}</div>}
        {sqlError && <p className="gjs-data-key-error" role="alert">{sqlError}</p>}
        <p className={sqlWasRegenerated ? 'gjs-data-key-error' : 'gjs-data-safety'}>{sqlWasRegenerated
          ? `El SQL se regeneró con tus cambios visuales y conserva las ${drafts.length} tablas. Revisa políticas, funciones y restricciones avanzadas antes de ejecutarlo.`
          : 'Al cambiar de pestaña sin editar visualmente, conservamos el SQL original completo. Las políticas y funciones no aparecen como campos visuales.'}</p>
        <div className="gjs-data-wizard-actions"><button onClick={() => setStage(startChoice === 'template' ? 'templates' : 'start')} type="button">Atrás</button><button className="gjs-flow-primary" disabled={!sql.trim()} onClick={finishSql} type="button">Crear desde SQL</button></div>
      </div>}
      </>}
    </Modal>
  )
}

function DataComponentWizard({ config, initialTableId, initialTemplateId, onClose, onInsert, onRequestCreate }: {
  config: SupabaseEditorConfig
  initialTableId?: string
  initialTemplateId?: DataComponentTemplateId
  onClose: () => void
  onInsert: (templateId: DataComponentTemplateId, tableId: string, mapping: DataComponentMapping, options: DataComponentOptions) => void
  onRequestCreate: (templateId: DataComponentTemplateId) => void
}) {
  const availableTables = config.tables.filter((table) => table.access !== 'private')
  const [step, setStep] = useState(initialTableId ? 3 : 1)
  const [templateId, setTemplateId] = useState<DataComponentTemplateId>(initialTemplateId ?? 'card_grid')
  const [tableId, setTableId] = useState(initialTableId ?? availableTables[0]?.id ?? '')
  const table = availableTables.find((candidate) => candidate.id === tableId)
  const template = dataComponentTemplateById(templateId)
  const [mapping, setMapping] = useState<DataComponentMapping>(() => table
    ? suggestDataComponentMapping(templateId, table)
    : {})
  const [mediaKind, setMediaKind] = useState<DataComponentOptions['mediaKind']>('image')
  const [displayOptions, setDisplayOptions] = useState(() => defaultDataComponentOptions(initialTemplateId ?? 'card_grid'))

  function chooseDataTemplate(nextTemplateId: DataComponentTemplateId) {
    setTemplateId(nextTemplateId)
    setDisplayOptions((current) => ({
      ...defaultDataComponentOptions(nextTemplateId),
      mediaKind: current.mediaKind,
    }))
  }

  function updateDisplayNumber(
    field: 'desktopColumns' | 'tabletColumns' | 'mobileColumns' | 'pageSize',
    value: string,
  ) {
    const maximum = field === 'pageSize' ? 100 : field === 'mobileColumns' ? 3 : 6
    const parsed = Number.parseInt(value, 10)
    setDisplayOptions((current) => ({
      ...current,
      [field]: Math.min(maximum, Math.max(1, Number.isFinite(parsed) ? parsed : 1)),
    }))
  }

  useEffect(() => {
    if (table) setMapping(suggestDataComponentMapping(templateId, table))
  }, [table, templateId])

  return (
    <Modal onClose={onClose} title="Añadir componente con datos">
      <div className="gjs-data-wizard-progress" aria-label={`Paso ${step} de 3`}>
        {[1, 2, 3].map((number) => <span className={number <= step ? 'active' : ''} key={number} />)}
      </div>
      {step === 1 && <div className="gjs-data-form">
        <div className="gjs-flow-introduction"><span aria-hidden="true">▤</span><div><strong>¿Cómo quieres mostrar la información?</strong><p>Todos los componentes se adaptan a escritorio, tableta y móvil.</p></div></div>
        <div className="gjs-data-component-grid">
          {dataComponentTemplates.map((candidate) => <button className={candidate.id === templateId ? 'selected' : ''} key={candidate.id} onClick={() => chooseDataTemplate(candidate.id)} type="button">
            <span className={`gjs-data-component-preview ${candidate.id}`} aria-hidden="true"><i /><i /><i /></span>
            <strong>{candidate.name}</strong><span>{candidate.description}</span><small>{candidate.responsiveSummary}</small>
          </button>)}
        </div>
      </div>}
      {step === 2 && <div className="gjs-data-form">
        <div className="gjs-flow-introduction"><span aria-hidden="true">▦</span><div><strong>¿Qué tabla quieres mostrar?</strong><p>Usa una tabla registrada en PSL o crea una nueva.</p></div></div>
        <div className="gjs-data-source-list">
          {availableTables.map((candidate) => <button className={candidate.id === tableId ? 'selected' : ''} key={candidate.id} onClick={() => setTableId(candidate.id)} type="button">
            <span>▦</span><span><strong>{collectionDisplayName(candidate)}</strong><small>{candidate.name} · {candidate.fields.length} campos</small></span><span>{candidate.setupStatus === 'verified' ? '✓' : '○'}</span>
          </button>)}
          {!availableTables.length && <div className="gjs-data-placeholder">Todavía no hay tablas registradas en este proyecto.</div>}
        </div>
        <button className="gjs-flow-secondary" onClick={() => onRequestCreate(templateId)} type="button">+ Crear una tabla nueva</button>
      </div>}
      {step === 3 && table && <div className="gjs-data-form">
        <div className="gjs-flow-introduction"><span aria-hidden="true">↔</span><div><strong>Elige qué mostrará cada parte</strong><p>PSL sugirió campos compatibles. Puedes cambiar o dejar partes vacías.</p></div></div>
        <div className="gjs-data-mapping-summary"><strong>{template.name}</strong><span>←</span><strong>{collectionDisplayName(table)}</strong></div>
        <div className="gjs-data-mapping-list">
          {template.slots.map((slot) => <label key={slot.id}>
            <span>{slot.label}</span>
            <select aria-label={slot.label} onChange={(event) => setMapping((current) => ({ ...current, [slot.id]: event.target.value || undefined }))} value={mapping[slot.id] ?? ''}>
              <option value="">No mostrar</option>
              {table.fields.map((field) => <option key={field.id} value={field.name}>{field.name} · {fieldTypeLabels[field.type]}</option>)}
            </select>
          </label>)}
        </div>
        {mapping.media && <label>
          Mostrar el medio como
          <select aria-label="Tipo de medio" onChange={(event) => setMediaKind(event.target.value as DataComponentOptions['mediaKind'])} value={mediaKind}>
            <option value="image">Imagen</option><option value="video">Video con controles</option>
          </select>
        </label>}
        {template.repeatMode === 'collection' && <details className="gjs-data-display-options" open>
          <summary>Cantidad y páginas</summary>
          <div className="gjs-data-display-options-body">
            <label>Máximo por página<input aria-label="Máximo de elementos por página" max="100" min="1" onChange={(event) => updateDisplayNumber('pageSize', event.target.value)} type="number" value={displayOptions.pageSize} /></label>
            <div className="gjs-data-responsive-counts">
              {([
                ['desktopColumns', 'Escritorio'],
                ['tabletColumns', 'Tableta'],
                ['mobileColumns', 'Móvil'],
              ] as const).map(([field, label]) => <label key={field}>
                <span>{label}</span>
                <input aria-label={`Columnas en ${label.toLowerCase()}`} max={field === 'mobileColumns' ? 3 : 6} min="1" onChange={(event) => updateDisplayNumber(field, event.target.value)} type="number" value={displayOptions[field]} />
                <small>{displayOptions[field]} × {Math.ceil(displayOptions.pageSize / displayOptions[field])}</small>
              </label>)}
            </div>
            <label className="gjs-data-pagination-toggle"><input checked={displayOptions.pagination} onChange={(event) => setDisplayOptions((current) => ({ ...current, pagination: event.target.checked }))} type="checkbox" /><span><strong>Mostrar Anterior y Siguiente</strong><small>Solo aparecen cuando hay más información disponible.</small></span></label>
          </div>
        </details>}
        {table.setupStatus !== 'verified' && <p className="gjs-data-safety">Puedes diseñar con información de ejemplo. Conecta esta tabla antes de publicar.</p>}
      </div>}
      {step === 3 && !table && <div className="gjs-data-form"><div className="gjs-data-placeholder">Selecciona o crea una tabla para continuar.</div></div>}
      <div className="gjs-data-wizard-actions">
        {step > 1 ? <button onClick={() => setStep((current) => current - 1)} type="button">Atrás</button> : <span />}
        <button className="gjs-flow-primary" disabled={(step === 2 && !tableId) || (step === 3 && !table)} onClick={() => {
          if (step < 3) setStep((current) => current + 1)
          else if (table) onInsert(templateId, table.id, mapping, { ...displayOptions, mediaKind })
        }} type="button">{step < 3 ? 'Continuar' : 'Añadir a la página'}</button>
      </div>
    </Modal>
  )
}

function TableModal({ config, editorProjectId, onChange, onClose, tableId }: {
  config: SupabaseEditorConfig
  editorProjectId: string
  onChange: (config: SupabaseEditorConfig) => void
  onClose: () => void
  tableId: string
}) {
  const foundTable = config.tables.find((candidate) => candidate.id === tableId)
  const [section, setSection] = useState<'details' | 'access' | 'setup' | 'advanced'>(
    foundTable?.setupStatus === 'verified' ? 'details' : 'setup',
  )
  const [notice, setNotice] = useState('')
  const [verifying, setVerifying] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sqlView, setSqlView] = useState<'migration' | 'full'>('migration')
  if (!foundTable) return null
  const table = foundTable
  const hasVerifiedSchema = Boolean(table.verifiedSchema)

  function updateTable(update: (current: SupabaseTableConfig) => SupabaseTableConfig, affectsSchema = true) {
    let nextConfig: SupabaseEditorConfig = {
      ...config,
      tables: config.tables.map((candidate) => candidate.id === table.id
        ? {
          ...update(candidate),
          ...(affectsSchema ? {
            setupStatus: candidate.verifiedSchema ? 'needs_installation' as const : 'draft' as const,
          } : {}),
        }
        : candidate),
    }
    if (affectsSchema && table.verifiedSchema) {
      const hasChanges = describeSupabaseSchemaChanges(nextConfig, table.id).length > 0
      nextConfig = {
        ...nextConfig,
        tables: nextConfig.tables.map((candidate) => candidate.id === table.id
          ? { ...candidate, setupStatus: hasChanges ? 'needs_installation' : 'verified' }
          : candidate),
      }
    }
    onChange(nextConfig)
  }

  function addField() {
    updateTable((current) => ({
      ...current,
      fields: [...current.fields, {
        id: crypto.randomUUID(),
        name: `field_${current.fields.length + 1}`,
        type: 'text',
      }],
    }))
  }

  function addRelation() {
    const relationColumns = [
      ...table.fields.filter((field) => field.type === 'uuid').map((field) => field.name),
      ...builtInFields(table.access).filter((field) => field === 'id' || field === 'user_id'),
    ]
    const column = relationColumns[0]
    const target = config.tables.find((candidate) => candidate.id !== table.id)
    if (!column || !target) {
      setNotice('Añade otra colección y un identificador antes de crear una relación.')
      return
    }
    const relation: SupabaseRelation = {
      id: crypto.randomUUID(),
      column,
      targetTableId: target.id,
      targetColumn: 'id',
      onDelete: 'restrict',
    }
    updateTable((current) => ({ ...current, relations: [...current.relations, relation] }))
  }

  async function copySql() {
    const sql = sqlView === 'migration'
      ? createSupabaseMigrationSql(config, table.id)
      : createSupabaseSetupSql(config, table.id)
    try {
      await navigator.clipboard.writeText(sql)
      setNotice(sqlView === 'migration'
        ? 'Migración copiada. Revísala, ejecútala una sola vez y luego comprueba la colección.'
        : 'Esquema completo copiado. Úsalo solamente para crear la tabla desde cero.')
    } catch {
      setNotice('Selecciona el SQL y cópialo manualmente.')
    }
  }

  async function verify() {
    setVerifying(true)
    setNotice('Comprobando la colección y su información…')
    try {
      const accessToken = readSupabaseAccessToken(config.projectUrl)
      const result = (table.access === 'authenticated_read' || table.access === 'user_owned') && !accessToken
        ? await verifyEditorTable({
          columns: [...builtInFields(table.access), ...table.fields.map((field) => field.name)],
          editorProjectId,
          tableName: table.name,
        })
        : await verifySupabaseTable(config, table.id, fetch, accessToken)
      onChange({
        ...config,
        tables: config.tables.map((candidate) => candidate.id === table.id ? {
          ...candidate,
          setupStatus: 'verified',
          verifiedSchema: appliedSupabaseSchema(candidate),
        } : candidate),
      })
      setNotice(result.hasRows
        ? '✓ La colección está conectada y lista para mostrar información.'
        : table.access === 'public_read'
          ? '✓ Colección conectada. Añade un elemento en Supabase Table Editor y marca published para verlo.'
          : '✓ Colección conectada. Todavía no contiene información para este usuario.')
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No se pudo comprobar la colección.')
    } finally {
      setVerifying(false)
    }
  }

  function confirmPrivateInstallation() {
    onChange({
      ...config,
      tables: config.tables.map((candidate) => candidate.id === table.id ? {
        ...candidate,
        setupStatus: 'verified',
        verifiedSchema: appliedSupabaseSchema(candidate),
      } : candidate),
    })
    setNotice('✓ Colección interna registrada. Permanecerá protegida y fuera del sitio público.')
  }

  function removeTable() {
    onChange({ ...config, tables: config.tables.filter((candidate) => candidate.id !== table.id) })
    onClose()
  }

  const schemaChanges = describeSupabaseSchemaChanges(config, table.id)
  const migrationSql = createSupabaseMigrationSql(config, table.id)
  const fullSql = createSupabaseSetupSql(config, table.id)
  const hasDestructiveChanges = schemaChanges.some((change) => change.destructive)

  return (
    <Modal onClose={onClose} title={collectionDisplayName(table) || 'Nueva colección'}>
      <div className="gjs-data-modal-tabs" role="tablist" aria-label="Detalles de la colección">
        {([
          ['details', 'Información'],
          ['access', 'Visibilidad'],
          ['setup', 'Conectar'],
          ['advanced', 'Avanzado'],
        ] as const).map(([id, label]) => (
          <button aria-selected={section === id} className={section === id ? 'active' : ''} key={id} onClick={() => setSection(id)} role="tab" type="button">{label}</button>
        ))}
      </div>

      {section === 'details' && (
        <div className="gjs-data-form">
          <label>
            Nombre de la colección
            <input onChange={(event) => updateTable((current) => ({ ...current, displayName: event.target.value }), false)} value={collectionDisplayName(table)} />
          </label>
          <div className="gjs-data-section-heading">
            <div><strong>Información de cada elemento</strong><span>{table.fields.length} campos</span></div>
            <button onClick={addField} type="button">+ Información</button>
          </div>
          <div className="gjs-data-fields">
            {table.fields.map((field) => (
              <div className="gjs-data-field" key={field.id}>
                <input aria-label="Nombre de la información" onChange={(event) => updateTable((current) => ({
                  ...current,
                  fields: current.fields.map((candidate) => candidate.id === field.id ? { ...candidate, name: event.target.value } : candidate),
                }))} value={field.name} />
                <select aria-label="Tipo de información" onChange={(event) => updateTable((current) => ({
                  ...current,
                  fields: current.fields.map((candidate) => candidate.id === field.id ? { ...candidate, type: event.target.value as SupabaseFieldType } : candidate),
                }))} value={field.type}>
                  {(['text', 'long_text', 'number', 'boolean', 'date', 'datetime', 'media', 'url', 'json'] as const).map((type) => <option key={type} value={type}>{fieldTypeLabels[type]}</option>)}
                </select>
                <button aria-label={`Eliminar ${field.name}`} onClick={() => updateTable((current) => ({
                  ...current,
                  fields: current.fields.filter((candidate) => candidate.id !== field.id),
                }))} type="button">×</button>
              </div>
            ))}
          </div>
          {hasVerifiedSchema && <p className="gjs-data-safety">Los cambios se convertirán automáticamente en una migración. El editor avisará antes de eliminar datos o cambiar tipos.</p>}
        </div>
      )}

      {section === 'advanced' && (
        <div className="gjs-data-form">
          <label>
            Nombre técnico en Supabase
            <input onChange={(event) => updateTable((current) => ({ ...current, name: event.target.value }))} value={table.name} />
          </label>
          <div className="gjs-data-section-heading">
            <div><strong>Información automática</strong><span>El editor administra estos campos.</span></div>
          </div>
          <div className="gjs-data-builtins">{builtInFields(table.access).map((field) => <span key={field}>{field}</span>)}</div>
          <div className="gjs-data-section-heading">
            <div><strong>Relaciones</strong><span>Conecta información con otras colecciones.</span></div>
            <button onClick={addRelation} type="button">+ Relación</button>
          </div>
          {!table.relations.length && <div className="gjs-data-placeholder">Esta colección todavía no tiene relaciones.</div>}
          {table.relations.map((relation) => (
            <div className="gjs-data-relation" key={relation.id}>
              <select aria-label="Campo de origen" onChange={(event) => updateTable((current) => ({
                ...current,
                relations: current.relations.map((candidate) => candidate.id === relation.id ? { ...candidate, column: event.target.value } : candidate),
              }))} value={relation.column}>
                {[...table.fields.filter((field) => field.type === 'uuid').map((field) => field.name), ...builtInFields(table.access).filter((field) => field === 'id' || field === 'user_id')].map((field) => <option key={field} value={field}>{field}</option>)}
              </select>
              <span>→</span>
              <select aria-label="Tabla relacionada" onChange={(event) => updateTable((current) => ({
                ...current,
                relations: current.relations.map((candidate) => candidate.id === relation.id ? { ...candidate, targetTableId: event.target.value, targetColumn: 'id' } : candidate),
              }))} value={relation.targetTableId}>
                <option value="auth.users">Usuarios de Supabase Auth</option>
                {config.tables.filter((candidate) => candidate.id !== table.id).map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.name}</option>)}
              </select>
              <select aria-label="Al eliminar" onChange={(event) => updateTable((current) => ({
                ...current,
                relations: current.relations.map((candidate) => candidate.id === relation.id ? { ...candidate, onDelete: event.target.value as SupabaseRelation['onDelete'] } : candidate),
              }))} value={relation.onDelete}>
                <option value="restrict">Impedir borrado</option><option value="cascade">Borrar relacionados</option><option value="set null">Vaciar relación</option>
              </select>
              <button className="gjs-flow-danger" onClick={() => updateTable((current) => ({ ...current, relations: current.relations.filter((candidate) => candidate.id !== relation.id) }))} type="button">Eliminar</button>
            </div>
          ))}
        </div>
      )}

      {section === 'access' && (
        <div className="gjs-data-form">
          <label>
            Quién puede ver esta colección
            <select onChange={(event) => updateTable((current) => ({ ...current, access: event.target.value as SupabaseAccessMode }))} value={table.access}>
              {Object.entries(accessModeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className={`gjs-data-access-card ${table.access}`}>
            <strong>{accessModeLabels[table.access]}</strong>
            <p>{table.access === 'public_read' && 'El sitio exportado puede leer únicamente filas publicadas.'}</p>
            <p>{table.access === 'authenticated_read' && 'Necesita el módulo de inicio de sesión antes de usarse en el sitio.'}</p>
            <p>{table.access === 'user_owned' && 'Cada usuario podrá acceder solamente a filas cuyo user_id sea suyo.'}</p>
            <p>{table.access === 'private' && 'No estará disponible desde el navegador ni el sitio exportado.'}</p>
          </div>
          <p className="gjs-data-safety">La protección de datos se configura automáticamente en Supabase.</p>
          {hasVerifiedSchema && <p className="gjs-data-safety">Al cambiarla, el editor generará las columnas y políticas de seguridad necesarias.</p>}
        </div>
      )}

      {section === 'setup' && (
        <div className="gjs-data-form gjs-data-sql">
          <div className={`gjs-data-setup-status ${table.setupStatus ?? 'draft'}`}>
            <strong>{table.access === 'private'
              ? table.setupStatus === 'verified' ? '✓ Colección interna registrada' : '🔒 Colección interna pendiente'
              : table.setupStatus === 'verified' ? '✓ Colección conectada' : table.setupStatus === 'needs_installation' ? 'Cambios pendientes' : 'Lista para conectar'}</strong>
            <span>{table.access === 'private'
              ? table.setupStatus === 'verified'
                ? 'El editor guardó su estructura, pero nunca la expondrá al navegador.'
                : 'No puede comprobarse con una publishable key. Confirma después de verla en Supabase.'
              : table.setupStatus === 'verified' ? 'Supabase respondió con la estructura esperada.' : 'Completa estos tres pasos una sola vez.'}</span>
          </div>
          <div className="gjs-data-sql-switch" role="tablist" aria-label="Tipo de código SQL">
            <button aria-selected={sqlView === 'migration'} className={sqlView === 'migration' ? 'active' : ''} onClick={() => setSqlView('migration')} role="tab" type="button">Solo cambios</button>
            <button aria-selected={sqlView === 'full'} className={sqlView === 'full' ? 'active' : ''} onClick={() => setSqlView('full')} role="tab" type="button">Esquema completo</button>
          </div>
          {sqlView === 'migration' && <div className="gjs-data-change-list">
            <strong>{schemaChanges.length ? `${schemaChanges.length} cambio${schemaChanges.length === 1 ? '' : 's'} por aplicar` : 'Sin cambios pendientes'}</strong>
            {schemaChanges.map((change) => <div className={change.destructive ? 'danger' : ''} key={change.id}>
              <span aria-hidden="true">{change.destructive ? '!' : change.id.startsWith('create:') || change.id.startsWith('add-') ? '+' : '↻'}</span>
              <span>{change.label}</span>
            </div>)}
            {hasDestructiveChanges && <p>Revisa los cambios marcados con !: pueden eliminar datos o fallar si los valores existentes no se pueden convertir.</p>}
          </div>}
          {sqlView === 'full' && <p className="gjs-data-safety">Este código representa el resultado completo y sirve para una instalación nueva. Para actualizar una tabla existente, usa “Solo cambios”.</p>}
          <ol><li>Copia la configuración.</li><li>Ábrela en Supabase → SQL Editor y presiona Run.</li><li>{table.access === 'private' ? 'Regresa y confirma que el SQL fue ejecutado.' : 'Regresa y comprueba la colección.'}</li></ol>
          <div className="gjs-data-actions">
            <button className="gjs-flow-primary" disabled={sqlView === 'migration' && !schemaChanges.length} onClick={copySql} type="button">{sqlView === 'migration' ? 'Copiar migración' : 'Copiar esquema'}</button>
            <a href="https://supabase.com/dashboard" rel="noreferrer" target="_blank">Abrir Supabase ↗</a>
          </div>
          {table.access === 'private'
            ? <button className="gjs-flow-secondary" disabled={table.setupStatus === 'verified'} onClick={confirmPrivateInstallation} type="button">{table.setupStatus === 'verified' ? 'Colección interna registrada' : 'Confirmar que ejecuté el SQL'}</button>
            : <button className="gjs-flow-secondary" disabled={verifying} onClick={verify} type="button">{verifying ? 'Comprobando…' : 'Comprobar colección'}</button>}
          <details className="gjs-data-code-details">
            <summary>Ver configuración avanzada</summary>
            <textarea aria-label="Código SQL generado" readOnly value={sqlView === 'migration' ? migrationSql : fullSql} />
          </details>
        </div>
      )}

      {notice && <p className="gjs-data-modal-notice" role="status">{notice}</p>}
      <div className="gjs-data-delete-zone">
        {confirmDelete ? (
          <><span>Esto no borra Supabase; elimina la colección del proyecto visual.</span><button onClick={removeTable} type="button">Confirmar eliminación</button></>
        ) : <button onClick={() => setConfirmDelete(true)} type="button">Eliminar colección del proyecto</button>}
      </div>
    </Modal>
  )
}

function ElementDataControls({ config, element, onRemoveBinding, onSaveBinding, onToggleRepeater }: {
  config: SupabaseEditorConfig
  element: SelectedDataElement
  onRemoveBinding: () => void
  onSaveBinding: (tableId: string, field: string, target: string, scope: 'context' | 'first') => void
  onToggleRepeater: (tableId: string) => void
}) {
  const availableTables = config.tables.filter((table) => table.access !== 'private')
  const inheritedTableId = element.inheritedRepeaterTableId
  const initialTableId = inheritedTableId ?? element.dataSourceTableId ?? element.repeaterTableId ?? availableTables[0]?.id ?? ''
  const [tableId, setTableId] = useState(initialTableId)
  const table = availableTables.find((candidate) => candidate.id === tableId) ?? availableTables[0]
  const availableFields = useMemo(() => {
    if (!table) return []
    const fields = table.fields.map((field) => field.name)
    return element.bindingField && !fields.includes(element.bindingField)
      ? [element.bindingField, ...fields]
      : fields
  }, [element.bindingField, table])
  const [field, setField] = useState(element.bindingField ?? availableFields[0] ?? '')
  const [target, setTarget] = useState(element.bindingTarget)
  const [scope, setScope] = useState<'context' | 'first'>(
    inheritedTableId ? 'context' : element.bindingScope ?? 'context',
  )

  useEffect(() => {
    setTableId(initialTableId)
    setTarget(element.bindingTarget)
    setScope(inheritedTableId ? 'context' : element.bindingScope ?? 'context')
  }, [element.bindingScope, element.bindingTarget, inheritedTableId, initialTableId])
  useEffect(() => {
    setField(element.bindingField && availableFields.includes(element.bindingField)
      ? element.bindingField
      : availableFields[0] ?? '')
  }, [availableFields, element.bindingField])

  if (!availableTables.length) return <div className="gjs-data-placeholder">Crea una colección para conectarla con tu diseño.</div>
  return (
    <div className="gjs-data-element-controls">
      {inheritedTableId && <div className="gjs-flow-connected"><span>↳</span><p>Este elemento usa la tarjeta actual de <strong>{table && collectionDisplayName(table)}</strong>.</p></div>}
      <label>Colección<select aria-label="Colección" disabled={Boolean(inheritedTableId)} onChange={(event) => setTableId(event.target.value)} value={table?.id ?? ''}>{availableTables.map((candidate) => <option key={candidate.id} value={candidate.id}>{collectionDisplayName(candidate)}</option>)}</select></label>
      {!inheritedTableId && <label>Qué elemento mostrar<select onChange={(event) => setScope(event.target.value as 'context' | 'first')} value={scope}>
        <option value="context">El elemento elegido en otra pantalla</option>
        <option value="first">{table?.access === 'user_owned' ? 'Información del usuario actual' : 'El primer elemento disponible'}</option>
      </select></label>}
      <label>Información<select aria-label="Información" onChange={(event) => setField(event.target.value)} value={field}>{availableFields.map((candidate) => <option key={candidate} value={candidate}>{candidate}</option>)}</select></label>
      <button className="gjs-flow-primary" disabled={!field || !table} onClick={() => table && onSaveBinding(table.id, field, target, inheritedTableId ? 'context' : scope)} type="button">{element.bindingField ? 'Actualizar información' : 'Mostrar esta información'}</button>
      {element.bindingField && <button className="gjs-flow-danger" onClick={onRemoveBinding} type="button">Dejar de mostrar esta información</button>}
      {!inheritedTableId && <button className={element.isRepeater ? 'gjs-flow-danger' : 'gjs-flow-secondary'} onClick={() => table && onToggleRepeater(table.id)} type="button">{element.isRepeater ? 'Mostrar solo un elemento' : 'Mostrar uno por cada elemento'}</button>}
      {element.isRepeater && <div className="gjs-flow-connected"><span>✓</span><p>Muestra una copia por cada elemento de <strong>{collectionDisplayName(config.tables.find((candidate) => candidate.id === element.repeaterTableId) ?? table!)}</strong>.</p></div>}
      <details className="gjs-data-code-details gjs-data-binding-advanced">
        <summary>Opciones avanzadas</summary>
        <label>Dónde colocarlo<select onChange={(event) => setTarget(event.target.value)} value={target}>
          <option value="text">Texto</option><option value="src">Imagen o video</option><option value="href">Enlace</option><option value="alt">Texto alternativo</option><option value="value">Valor del formulario</option><option value="title">Título accesible</option>
        </select></label>
      </details>
      {table?.setupStatus !== 'verified' && <p className="gjs-data-safety">Conecta y comprueba esta colección antes de publicar.</p>}
    </div>
  )
}

export function SupabaseDataPanel(props: SupabaseDataPanelProps) {
  const { config, onChange, selectedElement } = props
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wizardOpen, setWizardOpen] = useState(false)
  const [dataComponentOpen, setDataComponentOpen] = useState(false)
  const [dataComponentDefaults, setDataComponentDefaults] = useState<{
    tableId?: string
    templateId?: DataComponentTemplateId
  }>({})
  const [pendingDataTemplate, setPendingDataTemplate] = useState<DataComponentTemplateId | undefined>()
  const [openTableId, setOpenTableId] = useState<string | null>(null)
  const connected = Boolean(config.projectUrl && config.publishableKey && isSafePublishableKey(config.publishableKey))
  const [openSections, setOpenSections] = useState({
    connection: !connected,
    tables: true,
    element: true,
  })

  useEffect(() => {
    if (!props.dataComponentRequest) return
    setDataComponentDefaults({})
    setDataComponentOpen(true)
  }, [props.dataComponentRequest])

  function toggleSection(section: keyof typeof openSections) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }))
  }

  function addCollections(tables: SupabaseTableConfig[]) {
    const importedIds = new Set(tables.map((table) => table.id))
    const importedNames = new Set(tables.map((table) => table.name))
    onChange({
      ...config,
      tables: [
        ...config.tables.filter((table) => !importedIds.has(table.id) && !importedNames.has(table.name)),
        ...tables,
      ],
    })
    setWizardOpen(false)
    const firstTable = tables[0]
    if (!firstTable) return
    if (pendingDataTemplate) {
      setDataComponentDefaults({ tableId: firstTable.id, templateId: pendingDataTemplate })
      setPendingDataTemplate(undefined)
      setDataComponentOpen(true)
    } else {
      setOpenTableId(tables.length === 1 ? firstTable.id : null)
    }
  }

  function requestCollectionForComponent(templateId: DataComponentTemplateId) {
    setPendingDataTemplate(templateId)
    setDataComponentOpen(false)
    setWizardOpen(true)
  }

  return (
    <>
      <div className="gjs-supabase-panel">
        <PanelSection
          onToggle={() => toggleSection('connection')}
          open={openSections.connection}
          title="Conexión con Supabase"
        >
          <div className="gjs-data-panel-heading">
            <div><strong>Proyecto de Supabase</strong><span className={connected ? 'connected' : ''}>{connected ? '● URL y clave configuradas' : '○ Falta configurar'}</span></div>
            <button aria-label="Configuración de Supabase" onClick={() => setSettingsOpen(true)} title="Configuración de Supabase" type="button">⚙</button>
          </div>
          <p className="gjs-supabase-help">Conecta una vez este proyecto. Usa solamente la publishable key; nunca una secret key.</p>
          {!connected && <button className="gjs-flow-primary" onClick={() => setSettingsOpen(true)} type="button">Conectar Supabase</button>}
        </PanelSection>

        <PanelSection
          onToggle={() => toggleSection('tables')}
          open={openSections.tables}
          title="Mis datos"
        >
          <div className="gjs-data-section-heading">
            <div><strong>Colecciones</strong><span>Organiza la información que mostrará tu sitio.</span></div>
            <button onClick={() => {
              setPendingDataTemplate(undefined)
              setWizardOpen(true)
            }} type="button">+ Crear</button>
          </div>
          <div className="gjs-data-table-list">
            {config.tables.map((table) => (
              <button className="gjs-data-table-card" key={table.id} onClick={() => setOpenTableId(table.id)} type="button">
                <span className="gjs-data-table-icon">▦</span>
                <span><strong>{collectionDisplayName(table)}</strong><small>{table.fields.length} campos · {accessModeLabels[table.access]}</small><small className={table.setupStatus === 'verified' ? 'connected' : 'pending'}>{table.access === 'private'
                  ? table.setupStatus === 'verified' ? '✓ Interna registrada' : '🔒 Interna · confirma el SQL'
                  : table.setupStatus === 'verified' ? '✓ Conectada' : table.setupStatus === 'needs_installation' ? '● Cambios pendientes' : '○ Falta conectar'}</small></span>
                <span>›</span>
              </button>
            ))}
            {!config.tables.length && <div className="gjs-data-placeholder">Crea tu primera colección para comenzar.</div>}
          </div>
        </PanelSection>

        <PanelSection
          onToggle={() => toggleSection('element')}
          open={openSections.element}
          title="Elemento seleccionado"
        >
          {!selectedElement ? <div className="gjs-flow-empty gjs-data-empty"><strong>Selecciona un elemento</strong><p>Después elige qué información debe mostrar.</p></div> : <ElementDataControls {...props} element={selectedElement} />}
        </PanelSection>
      </div>
      {settingsOpen && <SettingsModal config={config} editorProjectId={props.editorProjectId} onChange={onChange} onClose={() => setSettingsOpen(false)} />}
      {wizardOpen && <CollectionWizard config={config} onClose={() => {
        setWizardOpen(false)
        setPendingDataTemplate(undefined)
      }} onCreate={addCollections} />}
      {dataComponentOpen && <DataComponentWizard
        config={config}
        initialTableId={dataComponentDefaults.tableId}
        initialTemplateId={dataComponentDefaults.templateId}
        onClose={() => setDataComponentOpen(false)}
        onInsert={(templateId, tableId, mapping, options) => {
          props.onInsertDataComponent(templateId, tableId, mapping, options)
          setDataComponentOpen(false)
          setDataComponentDefaults({})
        }}
        onRequestCreate={requestCollectionForComponent}
      />}
      {openTableId && <TableModal config={config} editorProjectId={props.editorProjectId} onChange={(next) => onChange(normalizedSupabaseConfig(next))} onClose={() => setOpenTableId(null)} tableId={openTableId} />}
    </>
  )
}
