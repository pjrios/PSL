import { useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  cssForHtmlFile,
  replaceAssetReferences,
  suggestedPageName,
  templateZipAsDrafts,
} from './page-import'
import type { ImportedPageDraft } from './page-import'

export type PageImportMode = 'single' | 'multiple' | 'zip'

interface PageImportDialogProps {
  mode?: PageImportMode
  onClose: () => void
  onImport: (pages: ImportedPageDraft[]) => void
}

const importModeCopy: Record<PageImportMode, { title: string; description: string }> = {
  single: {
    title: 'Importar una página',
    description: 'Pega HTML de FigmaToCode o carga HTML, CSS y recursos.',
  },
  multiple: {
    title: 'Importar varias páginas',
    description: 'Cada archivo HTML se convertirá en una página independiente.',
  },
  zip: {
    title: 'Importar plantilla ZIP',
    description: 'Carga una plantilla con HTML, CSS, imágenes y fuentes organizados en carpetas.',
  },
}

function isHtml(file: File) {
  return /\.html?$/i.test(file.name)
}

function isCss(file: File) {
  return /\.css$/i.test(file.name)
}

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string'
      ? resolve(reader.result)
      : reject(new Error(`No se pudo leer ${file.name}.`))
    reader.onerror = () => reject(reader.error ?? new Error(`No se pudo leer ${file.name}.`))
    reader.readAsDataURL(file)
  })
}

async function selectedFilesAsDrafts(files: File[]) {
  const htmlFiles = files.filter(isHtml)
  const cssFiles = await Promise.all(files.filter(isCss).map(async (file) => ({
    name: file.name,
    text: await file.text(),
  })))
  const assetEntries = await Promise.all(files
    .filter((file) => !isHtml(file) && !isCss(file))
    .map(async (file) => [file.name, await fileAsDataUrl(file)] as const))
  const assets = Object.fromEntries(assetEntries)

  return Promise.all(htmlFiles.map(async (file) => {
    const html = await file.text()
    const css = cssForHtmlFile(file.name, cssFiles)
    const rewritten = replaceAssetReferences(html, css, assets)
    return {
      name: suggestedPageName(file.name),
      html: rewritten.html,
      css: rewritten.css,
    }
  }))
}

export function PageImportDialog({ mode: initialMode, onClose, onImport }: PageImportDialogProps) {
  const [mode, setMode] = useState<PageImportMode | null>(initialMode ?? null)
  const [name, setName] = useState('Página importada')
  const [html, setHtml] = useState('')
  const [css, setCss] = useState('')
  const [multipleDrafts, setMultipleDrafts] = useState<ImportedPageDraft[]>([])
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  function selectMode(nextMode: PageImportMode | null) {
    setMode(nextMode)
    setMultipleDrafts([])
    setNotice('')
  }

  async function loadSingleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setBusy(true)
    setNotice('')
    try {
      const drafts = await selectedFilesAsDrafts(files)
      if (!drafts.length) throw new Error('Selecciona un archivo HTML junto con su CSS y recursos.')
      setName(drafts[0].name)
      setHtml(drafts[0].html)
      setCss(drafts[0].css)
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No se pudieron leer los archivos.')
    } finally {
      setBusy(false)
    }
  }

  async function loadMultipleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    if (!files.length) return
    setBusy(true)
    setNotice('')
    try {
      const drafts = await selectedFilesAsDrafts(files)
      if (!drafts.length) throw new Error('Selecciona uno o más archivos HTML.')
      setMultipleDrafts(drafts)
    } catch (cause) {
      setMultipleDrafts([])
      setNotice(cause instanceof Error ? cause.message : 'No se pudieron leer los archivos.')
    } finally {
      setBusy(false)
    }
  }

  async function loadTemplateZip(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    setBusy(true)
    setNotice('')
    try {
      const result = await templateZipAsDrafts(file)
      setMultipleDrafts(result.drafts)
      const scriptNotice = result.ignoredScriptCount
        ? ` Se omitieron ${result.ignoredScriptCount} archivos JavaScript por seguridad.`
        : ''
      const externalStylesNotice = result.externalStylesheetCount
        ? ` ${result.externalStylesheetCount} hoja(s) de estilo externa(s) no se incluyeron; sustituye sus iconos o fuentes dentro del editor.`
        : ''
      setNotice(`${result.drafts.length} página(s), ${result.cssCount} CSS y ${result.assetCount} recurso(s) listos.${scriptNotice}${externalStylesNotice}`)
    } catch (cause) {
      setMultipleDrafts([])
      setNotice(cause instanceof Error ? cause.message : 'No se pudo leer la plantilla ZIP.')
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!mode) return
    const drafts = mode === 'single'
      ? [{ name: name.trim(), html: html.trim(), css }]
      : multipleDrafts
    if (!drafts.length || drafts.some((draft) => !draft.html)) {
      setNotice(mode === 'single'
        ? 'Pega el código HTML de FigmaToCode o selecciona un archivo HTML.'
        : mode === 'zip'
          ? 'Selecciona una plantilla ZIP válida antes de importarla.'
          : 'Selecciona uno o más archivos HTML.')
      return
    }
    onImport(drafts)
  }

  return (
    <div className="gjs-page-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section aria-labelledby="page-import-title" aria-modal="true" className="gjs-page-modal" role="dialog">
        <header>
          <div>
            <strong id="page-import-title">
              {mode ? importModeCopy[mode].title : 'Importar'}
            </strong>
            <span>
              {mode ? importModeCopy[mode].description : 'Elige cómo quieres añadir contenido al proyecto.'}
            </span>
          </div>
          <button aria-label="Cerrar" onClick={onClose} type="button">×</button>
        </header>

        {!mode ? (
          <div className="gjs-page-import-options">
            {(Object.entries(importModeCopy) as [PageImportMode, (typeof importModeCopy)[PageImportMode]][]).map(([value, option]) => (
              <button key={value} onClick={() => selectMode(value)} type="button">
                <span className="gjs-page-import-option-icon" aria-hidden="true">
                  {value === 'single' ? '▤' : value === 'multiple' ? '▥' : 'ZIP'}
                </span>
                <span>
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </span>
                <span className="gjs-page-import-option-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        ) : <form onSubmit={submit}>
          {mode === 'single' ? (
            <>
              <label>
                Nombre de página
                <input onChange={(event) => setName(event.target.value)} value={name} />
              </label>
              <label>
                Código HTML
                <textarea
                  onChange={(event) => setHtml(event.target.value)}
                  placeholder="Pega aquí el código HTML generado por FigmaToCode…"
                  value={html}
                />
              </label>
              <label>
                CSS adicional <span>(opcional)</span>
                <textarea
                  className="gjs-page-css-input"
                  onChange={(event) => setCss(event.target.value)}
                  placeholder="Pega CSS separado si lo tienes…"
                  value={css}
                />
              </label>
              <div className="gjs-page-file-choice">
                <span>o carga los archivos de la página</span>
                <label className="gjs-page-file-button">
                  Seleccionar HTML, CSS y recursos
                  <input
                    accept=".html,.htm,.css,image/*,.svg,.woff,.woff2,.ttf,.otf"
                    multiple
                    onChange={loadSingleFiles}
                    type="file"
                  />
                </label>
              </div>
            </>
          ) : mode === 'multiple' ? (
            <>
              <div className="gjs-page-import-guidance">
                <strong>Cómo se emparejan los archivos</strong>
                <p><code>inicio.html</code> usa <code>inicio.css</code>. Archivos como <code>styles.css</code> o <code>app.css</code> se aplican a todas las páginas importadas.</p>
              </div>
              <label className="gjs-page-file-button gjs-page-file-button-large">
                Seleccionar páginas y recursos
                <input
                  accept=".html,.htm,.css,image/*,.svg,.woff,.woff2,.ttf,.otf"
                  multiple
                  onChange={loadMultipleFiles}
                  type="file"
                />
              </label>
              {multipleDrafts.length > 0 && (
                <div className="gjs-page-import-list">
                  <strong>{multipleDrafts.length} páginas listas</strong>
                  {multipleDrafts.map((draft) => <span key={draft.name}>✓ {draft.name}</span>)}
                </div>
              )}
            </>
          ) : (
            <>
              <div className="gjs-page-import-guidance">
                <strong>Qué se importará</strong>
                <p>Hasta 6 páginas HTML con su CSS, imágenes y fuentes. El JavaScript externo se omite por seguridad y las conexiones se crean después desde Flujo.</p>
              </div>
              <label className="gjs-page-file-button gjs-page-file-button-large">
                Seleccionar plantilla ZIP
                <input accept=".zip,application/zip" onChange={loadTemplateZip} type="file" />
              </label>
              {multipleDrafts.length > 0 && (
                <div className="gjs-page-import-list">
                  <strong>{multipleDrafts.length} página(s) lista(s)</strong>
                  {multipleDrafts.map((draft) => <span key={draft.name}>✓ {draft.name}</span>)}
                </div>
              )}
            </>
          )}

          {notice && <p className="gjs-page-import-notice" role="alert">{notice}</p>}
          <footer>
            <button className="gjs-page-cancel" onClick={initialMode ? onClose : () => selectMode(null)} type="button">
              {initialMode ? 'Cancelar' : 'Atrás'}
            </button>
            <button
              className="gjs-page-submit"
              disabled={busy || (mode !== 'single' && !multipleDrafts.length)}
              type="submit"
            >
              {busy ? 'Leyendo…' : mode === 'single' ? 'Importar página' : mode === 'zip' ? 'Importar plantilla' : 'Importar páginas'}
            </button>
          </footer>
        </form>}
      </section>
    </div>
  )
}
