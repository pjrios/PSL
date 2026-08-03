import { useState } from 'react'
import type { FormEvent } from 'react'

interface PageRenameDialogProps {
  initialName: string
  onClose: () => void
  onRename: (name: string) => void
}

export function PageRenameDialog({ initialName, onClose, onRename }: PageRenameDialogProps) {
  const [name, setName] = useState(initialName)

  function submit(event: FormEvent) {
    event.preventDefault()
    const nextName = name.trim()
    if (nextName) onRename(nextName)
  }

  return (
    <div className="gjs-page-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section aria-labelledby="page-rename-title" aria-modal="true" className="gjs-page-modal gjs-page-rename-modal" role="dialog">
        <header>
          <strong id="page-rename-title">Renombrar página</strong>
          <button aria-label="Cerrar" onClick={onClose} type="button">×</button>
        </header>
        <form onSubmit={submit}>
          <label>
            Nombre de página
            <input autoFocus onChange={(event) => setName(event.target.value)} value={name} />
          </label>
          <footer>
            <button className="gjs-page-cancel" onClick={onClose} type="button">Cancelar</button>
            <button className="gjs-page-submit" disabled={!name.trim()} type="submit">Guardar nombre</button>
          </footer>
        </form>
      </section>
    </div>
  )
}
