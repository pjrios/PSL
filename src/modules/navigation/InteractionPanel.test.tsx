import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { VisualBuilderProject } from '../../core/project'
import { InteractionPanel } from './InteractionPanel'

const project: VisualBuilderProject = {
  version: 2,
  elementOverrides: [],
  name: 'Panel fixture',
  startPage: 'home',
  pages: [
    { id: 'home', name: 'Home', file: 'pages/home.html' },
    { id: 'practice', name: 'Practice', file: 'pages/practice.html' },
  ],
  connections: [],
  dataSources: [{
    id: 'items',
    name: 'Items',
    type: 'static',
    records: [{ id: 'item-1', name: 'First item' }],
  }],
  bindings: [],
}

const selection = {
  elementId: 'home::main:1/button:1',
  label: 'Start practicing',
  pageId: 'home',
  tagName: 'button',
  text: 'Start practicing',
  src: '',
  alt: '',
  href: '',
  title: '',
  ariaLabel: '',
  hasChildren: false,
  isInteractive: true,
  computedStyles: {
    width: '164px',
    height: '44px',
    margin: '0px',
    padding: '12px 16px',
    backgroundColor: 'rgb(22, 143, 134)',
    color: 'rgb(255, 255, 255)',
    textAlign: 'center',
    display: 'inline-block',
    flexDirection: 'row',
    justifyContent: 'normal',
    justifyItems: 'normal',
    alignItems: 'normal',
    flexWrap: 'nowrap',
    objectFit: 'fill',
    objectPosition: '50% 50%',
    visibility: 'visible',
    transition: 'none',
  },
}

const editorProps = {
  brokenConnections: [],
  canRedo: false,
  canUndo: false,
  onContentSave: vi.fn(),
  onBindingDelete: vi.fn(),
  onBindingSave: vi.fn(),
  onRepeaterDelete: vi.fn(),
  onRepeaterSave: vi.fn(),
  onDelete: vi.fn(),
  onRedo: vi.fn(),
  onResetDesign: vi.fn(),
  onStyleChange: vi.fn(),
  onStylePreset: vi.fn(),
  onUndo: vi.fn(),
  project,
  selection,
  viewport: 'desktop' as const,
}

describe('InteractionPanel', () => {
  it('builds a navigation draft using visual controls', () => {
    const onSave = vi.fn()

    render(
      <InteractionPanel
        {...editorProps}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'interaction' },
    })

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
        {...editorProps}
        onSave={onSave}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'interaction' },
    })

    fireEvent.change(screen.getByLabelText('Al hacer clic'), { target: { value: 'url' } })
    fireEvent.change(screen.getByLabelText('Dirección web'), { target: { value: 'not-a-url' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar conexión' }))

    expect(screen.getByRole('alert')).toHaveTextContent('http:// o https://')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('explains visual states and applies a friendly preset', () => {
    const onStylePreset = vi.fn()
    render(
      <InteractionPanel
        {...editorProps}
        onSave={vi.fn()}
        onStylePreset={onStylePreset}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'effects' },
    })

    expect(screen.getByText('Cuando alguien coloca el puntero encima.')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Efecto preparado'), {
      target: { value: 'Elevar' },
    })
    expect(screen.getByText('Sube ligeramente y añade profundidad.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar efecto' }))
    expect(onStylePreset).toHaveBeenCalledWith(
      'desktop',
      'hover',
      expect.objectContaining({ transform: 'translateY(-2px)' }),
      { transition: 'all 180ms ease' },
    )
  })

  it('edits compact spacing in the current responsive viewport', () => {
    const onStyleChange = vi.fn()
    render(
      <InteractionPanel
        {...editorProps}
        onSave={vi.fn()}
        onStyleChange={onStyleChange}
        viewport="mobile"
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'layout' },
    })
    const padding = screen.getByLabelText('Espacio interior')
    expect(padding).toHaveValue('12px 16px')
    fireEvent.change(padding, { target: { value: '16px' } })
    fireEvent.blur(padding)

    expect(onStyleChange).toHaveBeenCalledWith(
      'mobile',
      'base',
      'padding',
      '16px',
    )
  })

  it('filters style categories for a non-interactive container', () => {
    render(
      <InteractionPanel
        {...editorProps}
        onSave={vi.fn()}
        selection={{
          ...selection,
          elementId: 'home::main:1/section:1',
          label: 'Hero section',
          tagName: 'section',
          hasChildren: true,
          isInteractive: false,
        }}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'layout' },
    })

    expect(screen.getByText('Contenedor · Escritorio')).toBeVisible()
    expect(screen.queryByRole('option', { name: 'Texto' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Efectos de interacción' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Separación entre elementos')).toBeVisible()
  })

  it('offers contextual alignment controls', () => {
    const onStyleChange = vi.fn()
    render(
      <InteractionPanel
        {...editorProps}
        onSave={vi.fn()}
        onStyleChange={onStyleChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'alignment' },
    })
    fireEvent.change(screen.getByLabelText('Alineación del texto'), {
      target: { value: 'right' },
    })

    expect(onStyleChange).toHaveBeenCalledWith('desktop', 'base', 'textAlign', 'right')
  })

  it('uses grid item alignment instead of moving the grid tracks', () => {
    const onStyleChange = vi.fn()
    render(
      <InteractionPanel
        {...editorProps}
        onSave={vi.fn()}
        onStyleChange={onStyleChange}
        selection={{
          ...selection,
          elementId: 'home::main:1',
          tagName: 'main',
          hasChildren: true,
          isInteractive: false,
          computedStyles: {
            ...selection.computedStyles,
            display: 'grid',
            justifyItems: 'normal',
          },
        }}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'alignment' },
    })
    fireEvent.change(screen.getByLabelText('Alineación horizontal'), {
      target: { value: 'center' },
    })

    expect(onStyleChange).toHaveBeenCalledWith('desktop', 'base', 'justifyItems', 'center')
    expect(onStyleChange).not.toHaveBeenCalledWith('desktop', 'base', 'display', 'flex')
  })

  it('offers image-specific fit and focal-position controls', () => {
    const onStyleChange = vi.fn()
    render(
      <InteractionPanel
        {...editorProps}
        onSave={vi.fn()}
        onStyleChange={onStyleChange}
        selection={{
          ...selection,
          elementId: 'home::main:1/img:1',
          label: 'Product image',
          tagName: 'img',
          src: 'assets/product.png',
          alt: 'Product',
          isInteractive: false,
        }}
      />,
    )

    expect(screen.getByLabelText('Reemplazar imagen')).toBeVisible()
    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'media' },
    })
    fireEvent.change(screen.getByLabelText('Ajuste dentro del espacio'), {
      target: { value: 'cover' },
    })

    expect(screen.getByLabelText('Parte visible de la imagen')).toHaveValue('50% 50%')
    expect(onStyleChange).toHaveBeenCalledWith('desktop', 'base', 'objectFit', 'cover')
  })

  it('edits visibility and transition speed directly', () => {
    const onStyleChange = vi.fn()
    render(
      <InteractionPanel
        {...editorProps}
        onSave={vi.fn()}
        onStyleChange={onStyleChange}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'appearance' },
    })
    fireEvent.change(screen.getByLabelText('Visibilidad'), {
      target: { value: 'hidden' },
    })
    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'effects' },
    })
    fireEvent.change(screen.getByLabelText('Velocidad de transición'), {
      target: { value: 'all 300ms ease' },
    })

    expect(onStyleChange).toHaveBeenCalledWith('desktop', 'base', 'visibility', 'hidden')
    expect(onStyleChange).toHaveBeenCalledWith(
      'desktop',
      'base',
      'transition',
      'all 300ms ease',
    )
  })

  it('sends a selected record with navigation', () => {
    const onSave = vi.fn()
    render(<InteractionPanel {...editorProps} onSave={onSave} />)

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'interaction' },
    })
    fireEvent.click(screen.getByLabelText('Enviar un registro a la siguiente pantalla'))
    fireEvent.change(screen.getByLabelText('Registro enviado'), {
      target: { value: 'item-1' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar conexión' }))

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      action: 'navigate',
      context: {
        selectedRecord: { dataSourceId: 'items', recordId: 'item-1' },
      },
    }))
  })

  it('binds an element property to a received record field', () => {
    const onBindingSave = vi.fn()
    render(
      <InteractionPanel
        {...editorProps}
        onBindingSave={onBindingSave}
        onSave={vi.fn()}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'data' },
    })
    fireEvent.change(screen.getByLabelText('Campo del registro'), {
      target: { value: 'details.title' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vincular dato' }))

    expect(onBindingSave).toHaveBeenCalledWith({
      pageId: 'home',
      elementId: selection.elementId,
      target: 'text',
      contextKey: 'selectedRecord',
      field: 'details.title',
    })
  })

  it('configures a generic repeated-record template', () => {
    const onRepeaterSave = vi.fn()
    const containerSelection = {
      ...selection,
      elementId: 'home::main:1/article:1',
      tagName: 'article',
      hasChildren: true,
      isInteractive: false,
    }
    render(
      <InteractionPanel
        {...editorProps}
        onRepeaterSave={onRepeaterSave}
        onSave={vi.fn()}
        selection={containerSelection}
      />,
    )

    fireEvent.change(screen.getByLabelText('Sección del inspector'), {
      target: { value: 'data' },
    })
    fireEvent.click(screen.getByLabelText('Repetir este elemento por cada registro'))
    fireEvent.change(screen.getByLabelText('Nombre de cada registro'), {
      target: { value: 'row' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Crear lista repetida' }))

    expect(onRepeaterSave).toHaveBeenCalledWith({
      pageId: 'home',
      elementId: containerSelection.elementId,
      dataSourceId: 'items',
      itemContext: 'row',
    })
  })
})
