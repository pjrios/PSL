import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TemplateGalleryDialog } from './TemplateGalleryDialog'

describe('TemplateGalleryDialog', () => {
  it('filters templates and adds the selected screen', () => {
    const onAdd = vi.fn()
    render(<TemplateGalleryDialog onAdd={onAdd} onClose={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Elige una plantilla' })).toBeInTheDocument()
    expect(screen.getByText('Landing creativa')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Contenido' }))
    expect(screen.queryByText('Landing creativa')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('listitem', { name: 'Seleccionar Perfil y portafolio' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta plantilla' }))

    expect(onAdd).toHaveBeenCalledWith('profile')
  })

  it('closes with Escape', () => {
    const onClose = vi.fn()
    render(<TemplateGalleryDialog onAdd={vi.fn()} onClose={onClose} />)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })
})
