import { useMemo, useState } from 'react'
import type { NavigationContext, ProjectBundle } from '../core/project'
import type { VisualBuilderProject } from '../core/project'
import type { StyleDeclaration } from '../core/project'
import { demoBundle } from '../demo'
import type { NavigationRuntimeMessage } from '../runtime/navigation-runtime'
import { ExportProjectButton } from '../modules/exporter'
import {
  resetElementOverride,
  saveContentOverride,
  saveStyleProperty,
} from '../modules/design'
import type {
  EditorStyleProperty,
  EditorStyleState,
  EditorViewport,
} from '../modules/design'
import { ImportProjectButton } from '../modules/importer'
import {
  deleteConnection,
  findBrokenConnections,
  InteractionPanel,
  saveConnection,
} from '../modules/navigation'
import type { ConnectionDraft, SelectedElement } from '../modules/navigation'
import { PageCatalog } from '../modules/page-catalog'
import {
  deleteDataBinding,
  deleteDataRepeater,
  saveDataBinding,
  saveDataRepeater,
} from '../modules/data'
import type { DataBindingDraft, DataRepeaterDraft } from '../modules/data'
import { collectPreviewElementIds, PreviewCanvas } from '../modules/preview'
import type { PreviewMode } from '../modules/preview'
import type { Viewport } from '../modules/preview'

interface TestStatusPanelProps {
  currentPageName: string
  historyLength: number
}

function TestStatusPanel({ currentPageName, historyLength }: TestStatusPanelProps) {
  return (
    <aside className="sidebar inspector-panel test-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Vista previa</span>
          <h2>{currentPageName}</h2>
        </div>
      </div>
      <div className="test-status-card">
        <span aria-hidden="true">▶</span>
        <strong>Interacciones activas</strong>
        <p>La página funciona como la verá quien la visite.</p>
      </div>
      <dl className="foundation-status">
        <div><dt>Historial</dt><dd>{historyLength} pantalla{historyLength === 1 ? '' : 's'}</dd></div>
        <div><dt>Modo</dt><dd>Vista previa</dd></div>
      </dl>
    </aside>
  )
}

export function AppShell() {
  const [bundle, setBundle] = useState<ProjectBundle>(demoBundle)
  const [activePageId, setActivePageId] = useState(bundle.manifest.startPage)
  const [navigationContext, setNavigationContext] = useState<NavigationContext>({})
  const [selection, setSelection] = useState<SelectedElement | null>(null)
  const [mode, setMode] = useState<PreviewMode>('edit')
  const [viewport, setViewport] = useState<Viewport>('desktop')
  const [testHistory, setTestHistory] = useState<Array<{
    pageId: string
    context: NavigationContext
  }>>([{ pageId: bundle.manifest.startPage, context: {} }])
  const [undoStack, setUndoStack] = useState<VisualBuilderProject[]>([])
  const [redoStack, setRedoStack] = useState<VisualBuilderProject[]>([])
  const currentPage = bundle.manifest.pages.find((page) => page.id === activePageId)!
  const elementIdsByPage = useMemo(() => new Map(
    bundle.manifest.pages.map((page) => [page.id, collectPreviewElementIds(bundle, page)]),
  ), [bundle.files, bundle.manifest.pages])
  const brokenConnections = findBrokenConnections(bundle.manifest, elementIdsByPage)

  function openImportedProject(importedBundle: ProjectBundle) {
    setBundle(importedBundle)
    setActivePageId(importedBundle.manifest.startPage)
    setNavigationContext({})
    setSelection(null)
    setMode('edit')
    setTestHistory([{ pageId: importedBundle.manifest.startPage, context: {} }])
    setUndoStack([])
    setRedoStack([])
  }

  function commitManifest(update: (project: VisualBuilderProject) => VisualBuilderProject) {
    setBundle((current) => {
      const nextManifest = update(current.manifest)
      if (nextManifest === current.manifest) return current
      setUndoStack((history) => [...history, current.manifest])
      setRedoStack([])
      return { ...current, manifest: nextManifest }
    })
  }

  function undo() {
    setUndoStack((history) => {
      const previous = history.at(-1)
      if (!previous) return history
      setBundle((current) => {
        setRedoStack((future) => [current.manifest, ...future])
        return { ...current, manifest: previous }
      })
      return history.slice(0, -1)
    })
  }

  function redo() {
    setRedoStack((future) => {
      const next = future[0]
      if (!next) return future
      setBundle((current) => {
        setUndoStack((history) => [...history, current.manifest])
        return { ...current, manifest: next }
      })
      return future.slice(1)
    })
  }

  function selectPage(pageId: string) {
    setActivePageId(pageId)
    setNavigationContext({})
    setSelection(null)
    if (mode === 'test') setTestHistory([{ pageId, context: {} }])
  }

  function changeMode(nextMode: PreviewMode) {
    setMode(nextMode)
    setSelection(null)
    if (nextMode === 'test') {
      setTestHistory([{ pageId: activePageId, context: navigationContext }])
    }
  }

  function executeRuntimeAction(message: NavigationRuntimeMessage) {
    if (message.action === 'navigate' && message.targetPage) {
      if (!bundle.manifest.pages.some((page) => page.id === message.targetPage)) return
      setActivePageId(message.targetPage)
      const context = message.context ?? {}
      setNavigationContext(context)
      setTestHistory((history) => [...history, { pageId: message.targetPage!, context }])
      return
    }

    if (message.action === 'back') {
      setTestHistory((history) => {
        if (history.length <= 1) return history
        const previous = history.slice(0, -1)
        const destination = previous.at(-1)!
        setActivePageId(destination.pageId)
        setNavigationContext(destination.context)
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
    commitManifest((project) => saveConnection(project, draft))
  }

  function removeConnection(sourcePage: string, elementId: string) {
    commitManifest((project) => deleteConnection(project, sourcePage, elementId))
  }

  function updateContent(content: Parameters<typeof saveContentOverride>[3]) {
    if (!selection) return
    commitManifest((project) => saveContentOverride(
      project,
      selection.pageId,
      selection.elementId,
      content,
    ))
  }

  function updateStyle(
    targetViewport: EditorViewport,
    state: EditorStyleState,
    property: EditorStyleProperty,
    value: string,
  ) {
    if (!selection) return
    commitManifest((project) => saveStyleProperty(
      project,
      selection.pageId,
      selection.elementId,
      targetViewport,
      state,
      property,
      value,
    ))
  }

  function applyStylePreset(
    targetViewport: EditorViewport,
    state: EditorStyleState,
    styles: StyleDeclaration,
    baseStyles: StyleDeclaration = {},
  ) {
    if (!selection) return
    commitManifest((project) => {
      let next = project
      for (const [property, value] of Object.entries(baseStyles)) {
        if (value !== undefined) {
          next = saveStyleProperty(
            next,
            selection.pageId,
            selection.elementId,
            targetViewport,
            'base',
            property as EditorStyleProperty,
            value,
          )
        }
      }
      for (const [property, value] of Object.entries(styles)) {
        if (value !== undefined) {
          next = saveStyleProperty(
            next,
            selection.pageId,
            selection.elementId,
            targetViewport,
            state,
            property as EditorStyleProperty,
            value,
          )
        }
      }
      return next
    })
  }

  function resetDesign() {
    if (!selection) return
    commitManifest((project) => resetElementOverride(
      project,
      selection.pageId,
      selection.elementId,
    ))
  }

  function updateDataBinding(draft: DataBindingDraft) {
    commitManifest((project) => saveDataBinding(project, draft))
  }

  function removeDataBinding(target: DataBindingDraft['target']) {
    if (!selection) return
    commitManifest((project) => deleteDataBinding(
      project,
      selection.pageId,
      selection.elementId,
      target,
    ))
  }

  function updateDataRepeater(draft: DataRepeaterDraft) {
    commitManifest((project) => saveDataRepeater(project, draft))
  }

  function removeDataRepeater() {
    if (!selection) return
    commitManifest((project) => deleteDataRepeater(
      project,
      selection.pageId,
      selection.elementId,
    ))
  }

  return (
    <main className="builder-shell">
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
          viewport={viewport}
          onViewportChange={setViewport}
          context={navigationContext}
          projectActions={(
            <>
              <ImportProjectButton onImport={openImportedProject} />
              <ExportProjectButton bundle={bundle} disabled={brokenConnections.length > 0} />
            </>
          )}
        />
        {mode === 'edit' ? (
          <InteractionPanel
            brokenConnections={brokenConnections}
            canRedo={redoStack.length > 0}
            canUndo={undoStack.length > 0}
            onContentSave={updateContent}
            onBindingDelete={removeDataBinding}
            onBindingSave={updateDataBinding}
            onRepeaterDelete={removeDataRepeater}
            onRepeaterSave={updateDataRepeater}
            onDelete={removeConnection}
            onRedo={redo}
            onResetDesign={resetDesign}
            onSave={updateConnection}
            onStyleChange={updateStyle}
            onStylePreset={applyStylePreset}
            onUndo={undo}
            project={bundle.manifest}
            selection={selection}
            viewport={viewport}
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
