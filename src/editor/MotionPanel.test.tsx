import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import grapesjs from 'grapesjs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MotionPanel } from './MotionPanel'
import { motionAnalysisMarkup } from './motion-analysis'
import type { SupabaseEditorConfig } from './supabase-data'

const config: SupabaseEditorConfig = {
  projectUrl: 'https://school.supabase.co',
  publishableKey: 'sb_publishable_test_key_123456789',
  tables: [{
    id: 'table-practices',
    name: 'practices',
    displayName: 'Practices',
    access: 'public_read',
    setupStatus: 'verified',
    fields: [
      { id: 'title', name: 'title', type: 'text' },
      { id: 'media', name: 'media_url', type: 'media' },
      { id: 'template', name: 'mediapipe_reference', type: 'json' },
    ],
    relations: [],
  }],
}

afterEach(() => vi.unstubAllGlobals())

describe('MotionPanel reference records', () => {
  it('makes selected, first, last, and searchable specific records explicit', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const editor = grapesjs.init({ container, headless: true })
    editor.setComponents(motionAnalysisMarkup('reference-view'))
    const component = editor.getWrapper()!.components().at(0)!
    component.addAttributes({
      'data-motion-reference-table': 'table-practices',
      'data-motion-reference-record-mode': 'context',
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { id: 'practice-1', title: 'Saludos básicos' },
      { id: 'practice-2', title: 'Alfabeto manual' },
    ]), { status: 200 })))

    render(<MotionPanel component={component} config={config} tables={config.tables} />)
    const recordMode = screen.getByLabelText('Qué registro usar')
    expect(recordMode).toHaveTextContent('El seleccionado en otra página')
    expect(recordMode).toHaveTextContent('El primero de la colección')
    expect(recordMode).toHaveTextContent('El último de la colección')
    expect(recordMode).toHaveTextContent('Un registro específico')

    fireEvent.change(recordMode, { target: { value: 'specific' } })
    await waitFor(() => expect(screen.getByLabelText('Registro')).toHaveTextContent('Saludos básicos · practice-1'))
    fireEvent.change(screen.getByLabelText('Buscar registro'), { target: { value: 'alfabeto' } })
    expect(screen.getByLabelText('Registro')).not.toHaveTextContent('Saludos básicos')
    expect(screen.getByLabelText('Registro')).toHaveTextContent('Alfabeto manual · practice-2')

    editor.destroy()
    container.remove()
  })
})
