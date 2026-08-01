import type { VisualBuilderProject } from '../../core/project'

interface PageCatalogProps {
  activePageId: string
  onPageSelect: (pageId: string) => void
  project: VisualBuilderProject
}

export function PageCatalog({ activePageId, onPageSelect, project }: PageCatalogProps) {
  return (
    <aside className="sidebar pages-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{project.name}</span>
          <h1>Pantallas</h1>
        </div>
        <span className="count">{project.pages.length}</span>
      </div>

      <nav aria-label="Pantallas del proyecto" className="page-list">
        {project.pages.map((page) => (
          <button
            className={`page-item ${page.id === activePageId ? 'active' : ''}`}
            key={page.id}
            onClick={() => onPageSelect(page.id)}
            type="button"
          >
            <span className="page-icon" aria-hidden="true" />
            <span>
              <strong>{page.name}</strong>
              <small>{page.file}</small>
            </span>
            {page.id === project.startPage && <em>Inicial</em>}
          </button>
        ))}
      </nav>

      <div className="milestone-note">
        <strong>Próximo: Hito 4</strong>
        <p>Validar diseños responsive reales y su publicación estática.</p>
      </div>
    </aside>
  )
}
