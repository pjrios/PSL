import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { signInWithPassword, signUp, unsubscribe } = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  unsubscribe: vi.fn(),
}))

vi.mock('./client', () => ({
  editorPlatformConfigured: true,
  editorSupabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe } } }),
      signInWithPassword,
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signUp,
    },
  },
  ensureEditorProject: vi.fn(),
}))

import { EditorAccountGate } from './EditorAccountGate'

describe('EditorAccountGate', () => {
  beforeEach(() => {
    signInWithPassword.mockReset().mockResolvedValue({ error: null })
    signUp.mockReset().mockResolvedValue({ data: { session: null }, error: null })
  })

  it('creates an editor account with the student-facing form', async () => {
    render(<EditorAccountGate>{() => <div>Editor</div>}</EditorAccountGate>)

    expect(await screen.findByRole('tab', { name: 'Crear cuenta' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Crear cuenta' }))
    fireEvent.change(screen.getByLabelText('Tu nombre'), { target: { value: 'Ana Pérez' } })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'ana@example.com' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'segura123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Crear mi cuenta' }))

    await waitFor(() => expect(signUp).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'segura123',
      options: { data: { display_name: 'Ana Pérez' } },
    }))
    expect(screen.getByText(/Revisa tu correo/)).toBeInTheDocument()
  })

  it('signs an existing user in', async () => {
    render(<EditorAccountGate>{() => <div>Editor</div>}</EditorAccountGate>)

    await screen.findByRole('button', { name: 'Entrar al editor' })
    fireEvent.change(screen.getByLabelText('Correo electrónico'), { target: { value: 'student@example.com' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'password123' } })
    fireEvent.click(screen.getByRole('button', { name: 'Entrar al editor' }))

    await waitFor(() => expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'student@example.com',
      password: 'password123',
    }))
  })
})
