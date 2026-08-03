import { useEffect, useMemo, useState } from 'react'
import { pageTemplates } from './page-templates'
import type { PageTemplateCategory } from './page-templates'

interface TemplateGalleryDialogProps {
  onAdd: (templateId: string) => void
  onClose: () => void
}

const categories: Array<'Todas' | PageTemplateCategory> = ['Todas', 'Acceso', 'Inicio', 'Aplicación', 'Contenido', 'Formularios']

export function TemplateGalleryDialog({ onAdd, onClose }: TemplateGalleryDialogProps) {
  const [category, setCategory] = useState<(typeof categories)[number]>('Todas')
  const [selectedId, setSelectedId] = useState(pageTemplates[0].id)
  const visibleTemplates = useMemo(() => category === 'Todas'
    ? pageTemplates
    : pageTemplates.filter((template) => template.category === category), [category])

  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  return (
    <div className="gjs-page-modal-backdrop gjs-template-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section aria-labelledby="template-gallery-title" aria-modal="true" className="gjs-template-gallery" role="dialog">
        <header>
          <div>
            <strong id="template-gallery-title">Elige una plantilla</strong>
            <span>Agrega una pantalla completa y modifica cada elemento en el editor.</span>
          </div>
          <button aria-label="Cerrar" onClick={onClose} type="button">×</button>
        </header>

        <div className="gjs-template-categories" role="tablist" aria-label="Categorías de plantillas">
          {categories.map((candidate) => (
            <button
              aria-selected={candidate === category}
              className={candidate === category ? 'active' : ''}
              key={candidate}
              onClick={() => setCategory(candidate)}
              role="tab"
              type="button"
            >{candidate}</button>
          ))}
        </div>

        <div className="gjs-template-grid" role="list">
          {visibleTemplates.map((template) => (
            <button
              aria-label={`Seleccionar ${template.name}`}
              aria-pressed={selectedId === template.id}
              className={`gjs-template-card ${selectedId === template.id ? 'selected' : ''}`}
              key={template.id}
              onClick={() => setSelectedId(template.id)}
              role="listitem"
              type="button"
            >
              <span className={`gjs-template-thumb ${template.preview}`} aria-hidden="true">
                <i className="thumb-nav"></i><i className="thumb-title"></i><i className="thumb-copy"></i>
                <span><i></i><i></i><i></i></span>
              </span>
              <span className="gjs-template-card-copy">
                <strong>{template.name}</strong>
                <small>{template.description}</small>
                <em>{template.category}</em>
              </span>
              <span className="gjs-template-check" aria-hidden="true">✓</span>
            </button>
          ))}
        </div>

        <footer>
          <span>{pageTemplates.length} plantillas responsive incluidas</span>
          <div>
            <button className="gjs-page-cancel" onClick={onClose} type="button">Cancelar</button>
            <button className="gjs-page-submit" onClick={() => onAdd(selectedId)} type="button">Usar esta plantilla</button>
          </div>
        </footer>
      </section>
    </div>
  )
}
