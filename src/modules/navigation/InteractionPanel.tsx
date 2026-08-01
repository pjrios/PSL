import type { VisualBuilderProject } from '../../core/project'

interface InteractionPanelProps {
  project: VisualBuilderProject
}

export function InteractionPanel({ project }: InteractionPanelProps) {
  return (
    <aside className="sidebar inspector-panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">Configuración</span>
          <h2>Interacción</h2>
        </div>
      </div>

      <div className="empty-inspector">
        <span className="cursor-illustration" aria-hidden="true">↖</span>
        <h3>Ningún elemento seleccionado</h3>
        <p>La selección de botones y conexiones se implementará en el Hito 2.</p>
      </div>

      <dl className="foundation-status">
        <div><dt>Esquema</dt><dd>project.json v1</dd></div>
        <div><dt>Páginas</dt><dd>{project.pages.length} válidas</dd></div>
        <div><dt>Conexiones</dt><dd>{project.connections.length}</dd></div>
        <div><dt>Modo</dt><dd>Solo vista previa</dd></div>
      </dl>
    </aside>
  )
}
