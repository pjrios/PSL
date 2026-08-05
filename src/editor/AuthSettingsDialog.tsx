import { useState } from 'react'
import type { AuthAction } from '../core/auth-components'

interface AuthSettingsDialogProps {
  action: AuthAction
  destinationPageId: string
  onClose: () => void
  onSave: (destinationPageId: string) => void
  pages: Array<{ id: string; name: string }>
}

const actionLabels: Record<AuthAction, string> = {
  login: 'Inicio de sesión',
  signup: 'Creación de cuenta',
  logout: 'Cierre de sesión',
}

export function AuthSettingsDialog({
  action,
  destinationPageId,
  onClose,
  onSave,
  pages,
}: AuthSettingsDialogProps) {
  const [destination, setDestination] = useState(destinationPageId)

  return (
    <div className="gjs-auth-settings-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <section aria-label={`Configurar ${actionLabels[action]}`} aria-modal="true" className="gjs-auth-settings-dialog" role="dialog">
        <header>
          <div>
            <span>Supabase Auth</span>
            <strong>{actionLabels[action]}</strong>
          </div>
          <button aria-label="Cerrar configuración" onClick={onClose} type="button">×</button>
        </header>
        <div className="gjs-auth-settings-body">
          <p>Elige qué página se abre cuando esta acción termina correctamente.</p>
          <label>
            Destino después de {action === 'logout' ? 'cerrar sesión' : action === 'signup' ? 'crear la cuenta' : 'iniciar sesión'}
            <select
              aria-label="Destino después de autenticar"
              onChange={(event) => setDestination(event.target.value)}
              value={destination}
            >
              <option value="">Automático (configuración del sitio)</option>
              {pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
            </select>
          </label>
          {action === 'signup' && (
            <small>Si Supabase requiere confirmar el correo, el destino se abrirá después del primer inicio de sesión confirmado.</small>
          )}
        </div>
        <footer>
          <button className="secondary" onClick={onClose} type="button">Cancelar</button>
          <button className="primary" onClick={() => onSave(destination)} type="button">Guardar</button>
        </footer>
      </section>
    </div>
  )
}
