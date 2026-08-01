import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VisualBuilderProject } from '../../core/project'
import { InteractionPanel } from './InteractionPanel'

const project: VisualBuilderProject = {
  version: 1,
  name: 'Panel fixture',
  startPage: 'home',
  pages: [
    { id: 'home', name: 'Home', file: 'pages/home.html' },
    { id: 'practice', name: 'Practice', file: 'pages/practice.html' },
  ],
  connections: [],
}

const selection = {
  elementId: 'home::main:1/button:1',
  label: 'Start practicing',
  pageId: 'home',
  tagName: 'button',
}

describe('InteractionPanel', () => {
  it('builds a navigation draft using visual controls', () => {
    const onSave = vi.fn()

    render(
      <InteractionPanel
        brokenConnections={[]}
        onDelete={vi.fn()}
        onSave={onSave}
        project={project}
        selection={selection}
      />,
    )

    fireEvent.change(screen.getByLabelText('Pantalla de destino'), {
      target: { value: 'practice' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar conexión' }))

    expect(onSave).toHaveBeenCalledWith({
      action: 'navigate',
      elementId: selection.elementId,
      sourcePage: 'home',
      targetPage: 'practice',
    })
  })

  it('requires a complete web URL', () => {
    const onSave = vi.fn()

    render(
      <InteractionPanel
        brokenConnections={[]}
        onDelete={vi.fn()}
        onSave={onSave}
        project={project}
        selection={selection}
      />,
    )

    fireEvent.change(screen.getByLabelText('Al hacer clic'), { target: { value: 'url' } })
    fireEvent.change(screen.getByLabelText('Dirección web'), { target: { value: 'not-a-url' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar conexión' }))

    expect(screen.getByRole('alert')).toHaveTextContent('http:// o https://')
    expect(onSave).not.toHaveBeenCalled()
  })
})
