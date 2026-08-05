import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AuthSettingsDialog } from './AuthSettingsDialog'

describe('AuthSettingsDialog', () => {
  it('saves the selected destination page', () => {
    const onSave = vi.fn()
    render(<AuthSettingsDialog
      action="login"
      destinationPageId=""
      onClose={vi.fn()}
      onSave={onSave}
      pages={[{ id: 'dashboard', name: 'Panel' }]}
    />)

    fireEvent.change(screen.getByLabelText('Destino después de autenticar'), {
      target: { value: 'dashboard' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(onSave).toHaveBeenCalledWith('dashboard')
  })
})
