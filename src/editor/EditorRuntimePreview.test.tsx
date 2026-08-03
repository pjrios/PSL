import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ProjectBundle } from '../core/project'
import { EditorRuntimePreview } from './EditorRuntimePreview'
import { createEditorPreviewSession } from './editor-preview-session'

const encoder = new TextEncoder()

const bundle: ProjectBundle = {
  manifest: {
    version: 2,
    name: 'Data preview',
    startPage: 'catalog',
    pages: [{ id: 'catalog', name: 'Catalog', file: 'pages/catalog.html' }],
    connections: [],
    elementOverrides: [],
    dataSources: [{
      id: 'supabase-practices',
      name: 'practices',
      type: 'supabase',
      projectUrl: 'https://school.supabase.co',
      publishableKey: 'sb_publishable_test_key_123456789',
      table: 'practices',
      publishedOnly: true,
    }],
    bindings: [{
      id: 'title',
      pageId: 'catalog',
      elementId: 'catalog::article:1/h2:1',
      target: 'text',
      contextKey: 'record',
      field: 'title',
    }],
    repeaters: [{
      id: 'cards',
      pageId: 'catalog',
      elementId: 'catalog::article:1',
      dataSourceId: 'supabase-practices',
      itemContext: 'record',
    }],
  },
  files: [{
    path: 'pages/catalog.html',
    mediaType: 'text/html',
    bytes: encoder.encode('<!doctype html><html><body><article><h2>Template</h2></article></body></html>'),
  }],
}

describe('EditorRuntimePreview', () => {
  it('injects the shared data runtime and shows an editable site route', () => {
    render(
      <EditorRuntimePreview
        onRuntimeAction={vi.fn()}
        session={createEditorPreviewSession(bundle)}
        viewport={{ label: 'Móvil', width: '320px' }}
      />,
    )

    const frame = screen.getByTitle('Vista previa de Catalog') as HTMLIFrameElement
    expect(frame.srcdoc).toContain('supabase-practices')
    expect(frame.srcdoc).toContain('psl-navigation-runtime')
    expect(frame.srcdoc).toContain('"repeaters"')
    expect(frame.parentElement).toHaveStyle({ width: '320px' })
    expect(screen.getByRole('application')).toHaveAccessibleName(/Móvil/)
    expect(screen.getByLabelText('Ruta de la vista previa')).toHaveValue('/catalog')
    expect(screen.getByLabelText('Abrir otra página')).toHaveValue('catalog')
    expect(screen.getByText('Pública')).toBeInTheDocument()
  })

  it('reports an unknown route without navigating', () => {
    const onRuntimeAction = vi.fn()
    render(
      <EditorRuntimePreview
        onRuntimeAction={onRuntimeAction}
        session={createEditorPreviewSession(bundle)}
        viewport={{ label: 'Escritorio', width: '100%' }}
      />,
    )

    fireEvent.change(screen.getByLabelText('Ruta de la vista previa'), {
      target: { value: '/missing' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Esta ruta no existe')
    expect(onRuntimeAction).not.toHaveBeenCalled()
  })

  it('navigates to a known path and identifies a protected page', () => {
    const onRuntimeAction = vi.fn()
    const protectedBundle: ProjectBundle = {
      ...bundle,
      manifest: {
        ...bundle.manifest,
        pages: [
          ...bundle.manifest.pages,
          { id: 'practice', name: 'Practice', file: 'pages/practice.html', access: 'authenticated' },
        ],
      },
      files: [
        ...bundle.files,
        {
          path: 'pages/practice.html',
          mediaType: 'text/html',
          bytes: encoder.encode('<!doctype html><html><body><main>Practice</main></body></html>'),
        },
      ],
    }
    const protectedSession = createEditorPreviewSession(protectedBundle, 'practice')
    const { rerender } = render(
      <EditorRuntimePreview
        onRuntimeAction={onRuntimeAction}
        session={createEditorPreviewSession(protectedBundle)}
        viewport={{ label: 'Escritorio', width: '100%' }}
      />,
    )

    fireEvent.change(screen.getByLabelText('Ruta de la vista previa'), {
      target: { value: '/practice' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Ir' }))
    expect(onRuntimeAction).toHaveBeenCalledWith({
      source: 'psl-navigation-runtime',
      action: 'navigate',
      targetPage: 'practice',
    })

    rerender(
      <EditorRuntimePreview
        onRuntimeAction={onRuntimeAction}
        session={protectedSession}
        viewport={{ label: 'Escritorio', width: '100%' }}
      />,
    )
    expect(screen.getByLabelText('Ruta de la vista previa')).toHaveValue('/practice')
    expect(screen.getByText('Protegida')).toHaveAttribute('title', 'Requiere una sesión iniciada')
  })
})
