import { useMemo, useState } from 'react'
import type { ProjectBundle } from '../core/project'
import { demoBundle } from '../demo'
import type { NavigationRuntimeMessage } from '../runtime/navigation-runtime'
import { ExportProjectButton } from '../modules/exporter'
import { ImportProjectButton } from '../modules/importer'
import {
  deleteConnection,
  findBrokenConnections,
  InteractionPanel,
  saveConnection,
} from '../modules/navigation'
import type { ConnectionDraft, SelectedElement } from '../modules/navigation'
import { PageCatalog } from '../modules/page-catalog'
import { collectPreviewElementIds, PreviewCanvas } from '../modules/preview'
import type { PreviewMode } from '../modules/preview'

interface TestStatusPanelProps {
  currentPageName: string
  historyLength: number
}

function TestStatusPanel({ currentPageName, historyLength }: TestStatusPanelProps) {
  return (
    <aside className="sidebar inspector-panel test-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Vista funcional</span>
          <h2>Modo Probar</h2>
        </div>
      </div>
      <div className="test-status-card">
        <span aria-hidden="true">▶</span>
        <strong>{currentPageName}</strong>
        <p>Los clics ejecutan las conexiones configuradas.</p>
      </div>
      <dl className="foundation-status">
        <div><dt>Historial</dt><dd>{historyLength} pantalla{historyLength === 1 ? '' : 's'}</dd></div>
        <div><dt>Modo</dt><dd>Prueba activa</dd></div>
      </dl>
    </aside>
  )
}

export function AppShell() {
  const [bundle, setBundle] = useState<ProjectBundle>(demoBundle)
  const [activePageId, setActivePageId] = useState(bundle.manifest.startPage)
  const [selection, setSelection] = useState<SelectedElement | null>(null)
  const [mode, setMode] = useState<PreviewMode>('edit')
  const [testHistory, setTestHistory] = useState<string[]>([bundle.manifest.startPage])
  const currentPage = bundle.manifest.pages.find((page) => page.id === activePageId)!
  const elementIdsByPage = useMemo(() => new Map(
    bundle.manifest.pages.map((page) => [page.id, collectPreviewElementIds(bundle, page)]),
  ), [bundle.files, bundle.manifest.pages])
  const brokenConnections = findBrokenConnections(bundle.manifest, elementIdsByPage)

  function openImportedProject(importedBundle: ProjectBundle) {
    setBundle(importedBundle)
    setActivePageId(importedBundle.manifest.startPage)
    setSelection(null)
    setMode('edit')
    setTestHistory([importedBundle.manifest.startPage])
  }

  function selectPage(pageId: string) {
    setActivePageId(pageId)
    setSelection(null)
    if (mode === 'test') setTestHistory([pageId])
  }

  function changeMode(nextMode: PreviewMode) {
    setMode(nextMode)
    setSelection(null)
    if (nextMode === 'test') setTestHistory([activePageId])
  }

  function executeRuntimeAction(message: NavigationRuntimeMessage) {
    if (message.action === 'navigate' && message.targetPage) {
      if (!bundle.manifest.pages.some((page) => page.id === message.targetPage)) return
      setActivePageId(message.targetPage)
      setTestHistory((history) => [...history, message.targetPage!])
      return
    }

    if (message.action === 'back') {
      setTestHistory((history) => {
        if (history.length <= 1) return history
        const previous = history.slice(0, -1)
        setActivePageId(previous.at(-1)!)
        return previous
      })
      return
    }

    if (message.action === 'url' && message.url) {
      try {
        const url = new URL(message.url)
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          window.open(url.href, '_blank', 'noopener,noreferrer')
        }
      } catch {
        return
      }
    }
  }

  function updateConnection(draft: ConnectionDraft) {
    setBundle((current) => ({
      ...current,
      manifest: saveConnection(current.manifest, draft),
    }))
  }

  function removeConnection(sourcePage: string, elementId: string) {
    setBundle((current) => ({
      ...current,
      manifest: deleteConnection(current.manifest, sourcePage, elementId),
    }))
  }

  return (
    <main className="builder-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">PSL</span>
          <div>
            <p>PSL Visual Builder</p>
            <span>Hito 3 · Probar y exportar</span>
          </div>
        </div>

        <div className="topbar-actions">
          <ImportProjectButton onImport={openImportedProject} />
          <ExportProjectButton bundle={bundle} disabled={brokenConnections.length > 0} />
        </div>
      </header>

      <section className="workspace" aria-label="Editor visual">
        <PageCatalog
          activePageId={activePageId}
          onPageSelect={selectPage}
          project={bundle.manifest}
        />
        <PreviewCanvas
          bundle={bundle}
          mode={mode}
          onElementSelect={setSelection}
          onModeChange={changeMode}
          onRuntimeAction={executeRuntimeAction}
          page={currentPage}
          selectedElementId={selection?.elementId}
        />
        {mode === 'edit' ? (
          <InteractionPanel
            brokenConnections={brokenConnections}
            onDelete={removeConnection}
            onSave={updateConnection}
            project={bundle.manifest}
            selection={selection}
          />
        ) : (
          <TestStatusPanel
            currentPageName={currentPage.name}
            historyLength={testHistory.length}
          />
        )}
      </section>
    </main>
  )
}
