import { useMemo, useState } from 'react'
import type { ProjectBundle } from '../core/project'
import { demoBundle } from '../demo'
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

export function AppShell() {
  const [bundle, setBundle] = useState<ProjectBundle>(demoBundle)
  const [activePageId, setActivePageId] = useState(bundle.manifest.startPage)
  const [selection, setSelection] = useState<SelectedElement | null>(null)
  const currentPage = bundle.manifest.pages.find((page) => page.id === activePageId)!
  const elementIdsByPage = useMemo(() => new Map(
    bundle.manifest.pages.map((page) => [page.id, collectPreviewElementIds(bundle, page)]),
  ), [bundle.files, bundle.manifest.pages])
  const brokenConnections = findBrokenConnections(bundle.manifest, elementIdsByPage)

  function openImportedProject(importedBundle: ProjectBundle) {
    setBundle(importedBundle)
    setActivePageId(importedBundle.manifest.startPage)
    setSelection(null)
  }

  function selectPage(pageId: string) {
    setActivePageId(pageId)
    setSelection(null)
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
            <span>Hito 2 · Navegación visual</span>
          </div>
        </div>

        <div className="topbar-actions">
          <ImportProjectButton onImport={openImportedProject} />
          <button className="button primary" type="button" disabled>
            Exportar ZIP
          </button>
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
          onElementSelect={setSelection}
          page={currentPage}
          selectedElementId={selection?.elementId}
        />
        <InteractionPanel
          brokenConnections={brokenConnections}
          onDelete={removeConnection}
          onSave={updateConnection}
          project={bundle.manifest}
          selection={selection}
        />
      </section>
    </main>
  )
}
