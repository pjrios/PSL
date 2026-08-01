import { useState } from 'react'
import type { ProjectBundle } from '../core/project'
import { demoBundle } from '../demo'
import { ImportProjectButton } from '../modules/importer'
import { InteractionPanel } from '../modules/navigation'
import { PageCatalog } from '../modules/page-catalog'
import { PreviewCanvas } from '../modules/preview'

export function AppShell() {
  const [bundle, setBundle] = useState<ProjectBundle>(demoBundle)
  const [activePageId, setActivePageId] = useState(bundle.manifest.startPage)
  const currentPage = bundle.manifest.pages.find((page) => page.id === activePageId)!

  function openImportedProject(importedBundle: ProjectBundle) {
    setBundle(importedBundle)
    setActivePageId(importedBundle.manifest.startPage)
  }

  return (
    <main className="builder-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">PSL</span>
          <div>
            <p>PSL Visual Builder</p>
            <span>Hito 1 · Importación modular</span>
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
          onPageSelect={setActivePageId}
          project={bundle.manifest}
        />
        <PreviewCanvas
          bundle={bundle}
          page={currentPage}
        />
        <InteractionPanel project={bundle.manifest} />
      </section>
    </main>
  )
}
