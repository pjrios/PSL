import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PageImportDialog } from './PageImportDialog'

describe('PageImportDialog', () => {
  it('submits pasted FigmaToCode HTML as one page', () => {
    const onImport = vi.fn()
    render(<PageImportDialog mode="single" onClose={vi.fn()} onImport={onImport} />)

    fireEvent.change(screen.getByLabelText('Nombre de página'), { target: { value: 'Inicio móvil' } })
    fireEvent.change(screen.getByLabelText('Código HTML'), {
      target: { value: '<main style="display:flex">Hola</main>' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Importar página' }))

    expect(onImport).toHaveBeenCalledWith([{
      name: 'Inicio móvil',
      html: '<main style="display:flex">Hola</main>',
      css: '',
    }])
  })

  it('requires HTML before importing', () => {
    const onImport = vi.fn()
    render(<PageImportDialog mode="single" onClose={vi.fn()} onImport={onImport} />)

    fireEvent.click(screen.getByRole('button', { name: 'Importar página' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Pega el código HTML')
    expect(onImport).not.toHaveBeenCalled()
  })

  it('offers a dedicated ZIP template workflow', () => {
    render(<PageImportDialog mode="zip" onClose={vi.fn()} onImport={vi.fn()} />)

    expect(screen.getByRole('dialog', { name: 'Importar plantilla ZIP' })).toBeInTheDocument()
    expect(screen.getByLabelText('Seleccionar plantilla ZIP')).toHaveAttribute('accept', '.zip,application/zip')
    expect(screen.getByText(/Hasta 6 páginas HTML/)).toBeInTheDocument()
  })
})
