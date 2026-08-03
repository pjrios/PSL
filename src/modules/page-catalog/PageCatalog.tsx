import type { VisualBuilderProject } from '../../core/project'

interface PageCatalogProps {
  activePageId: string
  onPageSelect: (pageId: string) => void
  project: VisualBuilderProject
}

export function PageCatalog({ activePageId, onPageSelect, project }: PageCatalogProps) {
  return (
    <aside className="sidebar pages-panel">
      <div className="brand sidebar-brand">
        <span className="brand-mark" aria-hidden="true">V</span>
        <div>
          <p>Editor visual</p>
          <span title={project.name}>{project.name}</span>
        </div>
      </div>

      <div className="panel-heading">
        <h1>Páginas</h1>
        <button
          aria-label="Añadir página"
          className="icon-button"
          data-tooltip="Añadir página"
          disabled
          type="button"
        >+</button>
      </div>

      <nav aria-label="Páginas del proyecto" className="page-list">
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
              <small title={page.file}>{page.file}</small>
            </span>
            {page.id === project.startPage && <em title="Página inicial">●</em>}
          </button>
        ))}
      </nav>
    </aside>
  )
}
