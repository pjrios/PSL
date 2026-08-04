import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupabaseDataPanel } from './SupabaseDataPanel'
import type { SupabaseEditorConfig } from './supabase-data'

const config: SupabaseEditorConfig = {
  projectUrl: 'https://school.supabase.co',
  publishableKey: 'sb_publishable_test_key_123456789',
  tables: [{
    id: 'profiles-table',
    name: 'profiles',
    access: 'user_owned',
    fields: [{ id: 'name', name: 'display_name', type: 'text' }],
    relations: [],
  }],
}

const baseProps = {
  config,
  editorProjectId: 'editor-project-test',
  onChange: vi.fn(),
  onInsertDataComponent: vi.fn(),
  onRemoveBinding: vi.fn(),
  onSaveBinding: vi.fn(),
  onToggleRepeater: vi.fn(),
  onUpdateDataComponent: vi.fn(),
}

describe('SupabaseDataPanel user data controls', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('organizes Supabase into collapsible inspector sections', () => {
    render(<SupabaseDataPanel {...baseProps} selectedElement={null} />)

    expect(screen.getByRole('button', { name: /Conexión/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('button', { name: /Mis datos/ })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('button', { name: /Autenticación/ })).not.toBeInTheDocument()
  })

  it('separates current-user scope from repeating rows', () => {
    render(<SupabaseDataPanel {...baseProps} selectedElement={{
      bindingTarget: 'text',
      isRepeater: false,
    }} />)

    expect(screen.getByRole('option', { name: 'Información del usuario actual' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mostrar uno por cada elemento' })).toBeInTheDocument()
  })

  it('makes descendants inherit the repeated row and locks its table', () => {
    render(<SupabaseDataPanel {...baseProps} selectedElement={{
      bindingTarget: 'text',
      inheritedRepeaterTableId: 'profiles-table',
      isRepeater: false,
    }} />)

    expect(screen.getByText(/Este elemento usa la tarjeta actual/)).toBeInTheDocument()
    expect(screen.getByLabelText('Colección')).toBeDisabled()
    expect(screen.queryByLabelText('Qué elemento mostrar')).not.toBeInTheDocument()
  })

  it('creates a collection through the student-friendly wizard', () => {
    const onChange = vi.fn()
    render(<SupabaseDataPanel {...baseProps} onChange={onChange} selectedElement={null} />)

    fireEvent.click(screen.getByRole('button', { name: '+ Crear' }))
    expect(screen.getByRole('dialog', { name: 'Crear o importar colecciones' })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: 'Visual' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Usar una plantilla/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: /Libros/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Usar esta plantilla' }))
    expect(screen.getByRole('tab', { name: 'Visual' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Nombre de la colección'), { target: { value: 'Mis lecturas' } })
    fireEvent.click(screen.getByRole('button', { name: /Todos pueden verla/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Crear colección' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      tables: expect.arrayContaining([expect.objectContaining({
        displayName: 'Mis lecturas',
        name: 'mis_lecturas',
        setupStatus: 'draft',
      })]),
    }))
  })

  it('opens the responsive data-component wizard from the Add library request', () => {
    const onInsertDataComponent = vi.fn()
    const { rerender } = render(<SupabaseDataPanel {...baseProps} dataComponentRequest={0} onInsertDataComponent={onInsertDataComponent} selectedElement={null} />)

    expect(screen.queryByRole('button', { name: '+ Componente con datos' })).not.toBeInTheDocument()
    rerender(<SupabaseDataPanel {...baseProps} dataComponentRequest={1} onInsertDataComponent={onInsertDataComponent} selectedElement={null} />)
    const dialog = screen.getByRole('dialog', { name: 'Añadir componente con datos' })
    expect(dialog).toBeInTheDocument()
    expect(dialog.parentElement).toHaveClass('gjs-editor-theme-scope')
    fireEvent.click(screen.getByRole('button', { name: /Lista visual/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))

    expect(screen.getByLabelText('Título')).toHaveValue('display_name')
    expect(screen.getByLabelText('Máximo de elementos por página')).toHaveValue(12)
    expect(screen.getByLabelText('Columnas en escritorio')).toHaveValue(1)
    fireEvent.change(screen.getByLabelText('Columnas en escritorio'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'Añadir a la página' }))
    expect(onInsertDataComponent).toHaveBeenCalledWith('simple_list', 'profiles-table', expect.objectContaining({
      title: 'display_name',
    }), expect.objectContaining({ mediaKind: 'image', pageSize: 12, desktopColumns: 3, pagination: true }))
  })

  it('opens existing dynamic options in edit mode and saves them without inserting a duplicate', () => {
    const onInsertDataComponent = vi.fn()
    const onUpdateDataComponent = vi.fn()
    render(<SupabaseDataPanel
      {...baseProps}
      dataComponentEditRequest={{
        mapping: { title: 'display_name' },
        options: {
          mediaKind: 'image',
          desktopColumns: 2,
          tabletColumns: 1,
          mobileColumns: 1,
          pageSize: 6,
          pagination: false,
        },
        requestId: 1,
        tableId: 'profiles-table',
        templateId: 'simple_list',
      }}
      onInsertDataComponent={onInsertDataComponent}
      onUpdateDataComponent={onUpdateDataComponent}
      selectedElement={null}
    />)

    expect(screen.getByRole('dialog', { name: 'Editar componente con datos' })).toBeInTheDocument()
    expect(screen.getByLabelText('Título')).toHaveValue('display_name')
    expect(screen.getByLabelText('Máximo de elementos por página')).toHaveValue(6)
    expect(screen.getByLabelText('Columnas en escritorio')).toHaveValue(2)
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    fireEvent.change(screen.getByLabelText('Máximo de elementos por página'), { target: { value: '9' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(onUpdateDataComponent).toHaveBeenCalledWith('simple_list', 'profiles-table', {
      title: 'display_name',
    }, expect.objectContaining({ pageSize: 9, desktopColumns: 2, pagination: false }))
    expect(onInsertDataComponent).not.toHaveBeenCalled()
  })

  it('previews the first accessible media URL in the data-component wizard', async () => {
    const mediaConfig: SupabaseEditorConfig = {
      ...config,
      tables: [{
        id: 'practices-table',
        name: 'practices',
        displayName: 'Practices',
        access: 'public_read',
        fields: [
          { id: 'title', name: 'title', type: 'text' },
          { id: 'media', name: 'media_url', type: 'media' },
        ],
        relations: [],
        setupStatus: 'verified',
      }],
    }
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response(JSON.stringify([
      { media_url: 'https://cdn.example.com/practice.jpg' },
    ]), { status: 200 }))

    render(<SupabaseDataPanel
      {...baseProps}
      config={mediaConfig}
      dataComponentEditRequest={{
        mapping: { media: 'media_url', title: 'title' },
        options: { mediaKind: 'image' },
        requestId: 1,
        tableId: 'practices-table',
        templateId: 'carousel',
      }}
      selectedElement={null}
    />)

    expect(await screen.findByRole('img', { name: 'Vista previa de media_url' }))
      .toHaveAttribute('src', 'https://cdn.example.com/practice.jpg')
    expect(fetchSpy).toHaveBeenCalledWith(expect.stringContaining('/rest/v1/practices?'), expect.objectContaining({
      headers: expect.objectContaining({ apikey: mediaConfig.publishableKey }),
    }))
    expect(String(fetchSpy.mock.calls[0][0])).toContain('media_url=not.is.null')
    expect(screen.getByRole('link', { name: /Abrir URL original/ })).toHaveAttribute(
      'href',
      'https://cdn.example.com/practice.jpg',
    )
  })

  it('resolves a storage reference to a signed media preview URL', async () => {
    const storageConfig: SupabaseEditorConfig = {
      ...config,
      tables: [{
        id: 'practices-table', name: 'practices', displayName: 'Practices', access: 'public_read',
        fields: [{ id: 'media', name: 'media_url', type: 'media' }], relations: [], setupStatus: 'verified',
      }],
    }
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => key === 'psl-auth:school.supabase.co'
        ? JSON.stringify({ access_token: 'teacher-token' })
        : null),
    })
    const fetchSpy = vi.spyOn(window, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        media_url: 'storage://practice-reference-videos/teacher-1/practice-1/reference',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        signedURL: '/object/sign/practice-reference-videos/teacher-1/practice-1/reference?token=signed',
      }), { status: 200 }))

    render(<SupabaseDataPanel
      {...baseProps}
      config={storageConfig}
      dataComponentEditRequest={{
        mapping: { media: 'media_url' }, options: { mediaKind: 'video' }, requestId: 1,
        tableId: 'practices-table', templateId: 'carousel',
      }}
      selectedElement={null}
    />)

    expect(await screen.findByLabelText('Vista previa de media_url')).toHaveAttribute(
      'src',
      'https://school.supabase.co/storage/v1/object/sign/practice-reference-videos/teacher-1/practice-1/reference?token=signed',
    )
    expect(fetchSpy).toHaveBeenNthCalledWith(2,
      'https://school.supabase.co/storage/v1/object/sign/practice-reference-videos/teacher-1/practice-1/reference',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer teacher-token' }),
        body: JSON.stringify({ expiresIn: 3_600 }),
      }),
    )
  })

  it('allows visual edits to installed fields and previews an ALTER migration', () => {
    const installedConfig: SupabaseEditorConfig = {
      ...config,
      tables: [{
        ...config.tables[0],
        setupStatus: 'needs_installation',
        fields: [
          { id: 'name', name: 'full_name', type: 'text' },
          { id: 'avatar', name: 'avatar_url', type: 'media' },
        ],
        verifiedSchema: {
          access: 'user_owned',
          name: 'profiles',
          fields: [{ id: 'name', name: 'display_name', type: 'text' }],
          relations: [],
          verifiedAt: '2026-08-03T12:00:00.000Z',
        },
      }],
    }
    render(<SupabaseDataPanel {...baseProps} config={installedConfig} selectedElement={null} />)

    fireEvent.click(screen.getByRole('button', { name: /profiles/i }))
    fireEvent.click(screen.getByRole('tab', { name: 'Información' }))
    expect(screen.getByDisplayValue('full_name')).toBeEnabled()
    fireEvent.click(screen.getByRole('tab', { name: 'Conectar' }))

    expect(screen.getByText('2 cambios por aplicar')).toBeInTheDocument()
    expect(screen.getByText('Renombrar display_name a full_name')).toBeInTheDocument()
    expect(screen.getByText('Añadir el campo avatar_url')).toBeInTheDocument()
    expect((screen.getByLabelText('Código SQL generado') as HTMLTextAreaElement).value)
      .toContain('rename column "display_name" to "full_name"')
  })

  it('confirms private tables without pretending they are browser-connected', () => {
    const onChange = vi.fn()
    const privateConfig: SupabaseEditorConfig = {
      ...config,
      tables: [{
        id: 'roles-table',
        name: 'user_roles',
        displayName: 'User Roles',
        access: 'private',
        fields: [{ id: 'role', name: 'role', type: 'text' }],
        relations: [],
        setupStatus: 'draft',
      }],
    }
    render(<SupabaseDataPanel {...baseProps} config={privateConfig} onChange={onChange} selectedElement={null} />)

    expect(screen.getByText('🔒 Interna · confirma el SQL')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /User Roles/ }))
    expect(screen.getByText('🔒 Colección interna pendiente')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Comprobar colección' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar que ejecuté el SQL' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      tables: [expect.objectContaining({
        name: 'user_roles',
        setupStatus: 'verified',
        verifiedSchema: expect.objectContaining({ name: 'user_roles' }),
      })],
    }))
  })

  it('imports pasted SQL into visual collections without executing it', () => {
    const onChange = vi.fn()
    render(<SupabaseDataPanel {...baseProps} onChange={onChange} selectedElement={null} />)

    fireEvent.click(screen.getByRole('button', { name: '+ Crear' }))
    fireEvent.click(screen.getByRole('button', { name: /Empezar desde cero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }))
    expect(screen.getByRole('dialog', { name: 'Crear o importar colecciones' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('SQL para crear o importar'), { target: { value: `
      -- @psl-access public_read
      create table public.practices (
        id uuid primary key,
        published boolean not null default false,
        sort_order integer not null default 0,
        created_at timestamptz not null default now(),
        title text,
        mediapipe_reference jsonb
      );
    ` } })
    expect(screen.getByText('✓ 1 tabla reconocida')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Visual' }))
    expect(screen.getByDisplayValue('mediapipe_reference')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }))
    expect((screen.getByLabelText('SQL para crear o importar') as HTMLTextAreaElement).value)
      .toContain('mediapipe_reference jsonb')
    fireEvent.click(screen.getByRole('button', { name: 'Crear desde SQL' }))

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      tables: expect.arrayContaining([expect.objectContaining({
        name: 'practices',
        access: 'public_read',
        fields: expect.arrayContaining([expect.objectContaining({ name: 'mediapipe_reference', type: 'json' })]),
      })]),
    }))
    expect(screen.queryByRole('dialog', { name: 'Crear o importar colecciones' })).not.toBeInTheDocument()
  })

  it('keeps every imported table visible and preserves unchanged multi-table SQL', () => {
    render(<SupabaseDataPanel {...baseProps} selectedElement={null} />)
    const sourceSql = `
      -- @psl-access user_owned
      create table public.profiles (
        id uuid primary key,
        user_id uuid references auth.users(id),
        created_at timestamptz default now(),
        display_name text
      );

      -- @psl-access user_owned
      create table public.practice_attempts (
        id uuid primary key,
        user_id uuid references auth.users(id),
        created_at timestamptz default now(),
        practice_id uuid,
        score numeric
      );

      create or replace function private.keep_me() returns void language sql as $$ select $$;
    `

    fireEvent.click(screen.getByRole('button', { name: '+ Crear' }))
    fireEvent.click(screen.getByRole('button', { name: /Empezar desde cero/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }))
    fireEvent.change(screen.getByLabelText('SQL para crear o importar'), { target: { value: sourceSql } })

    expect(screen.getByText('✓ 2 tablas reconocidas')).toBeInTheDocument()
    expect(screen.getByText('Practice Attempts')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: 'Visual' }))
    expect(screen.getByRole('region', { name: 'Tablas importadas' })).toBeInTheDocument()
    expect(screen.getByText('2 tablas importadas')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('tab', { name: /Practice Attempts/ }))
    expect(screen.getByDisplayValue('score')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Crear 2 colecciones' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }))
    expect(screen.getByText('✓ 2 tablas reconocidas')).toBeInTheDocument()
    expect((screen.getByLabelText('SQL para crear o importar') as HTMLTextAreaElement).value).toBe(sourceSql)
    expect(screen.getByText(/conservamos el SQL original completo/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('tab', { name: 'Visual' }))
    fireEvent.click(screen.getByRole('tab', { name: /Practice Attempts/ }))
    fireEvent.change(screen.getByDisplayValue('score'), { target: { value: 'best_score' } })
    fireEvent.click(screen.getByRole('tab', { name: 'SQL' }))
    const regeneratedSql = (screen.getByLabelText('SQL para crear o importar') as HTMLTextAreaElement).value
    expect(screen.getByText('✓ 2 tablas reconocidas')).toBeInTheDocument()
    expect(regeneratedSql).toContain('-- Table: profiles')
    expect(regeneratedSql).toContain('-- Table: practice_attempts')
    expect(regeneratedSql).toContain('"best_score" numeric')
    expect(screen.getByText(/se regeneró con tus cambios visuales y conserva las 2 tablas/i)).toBeInTheDocument()
  })
})
