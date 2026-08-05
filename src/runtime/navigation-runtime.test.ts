import { describe, expect, it, vi } from 'vitest'
import {
  createNavigationConfigSource,
  createNavigationRuntimeSource,
  installNavigationRuntime,
  isNavigationRuntimeMessage,
} from './navigation-runtime'

describe('navigation runtime', () => {
  it('assigns stable identifiers and emits navigation messages', () => {
    document.body.innerHTML = '<main><button><span>Continue</span></button></main>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'home',
      pageUrls: {},
      transport: 'message',
      connections: [{
        action: 'navigate',
        elementId: 'home::main:1/button:1',
        event: 'click',
        sourcePage: 'home',
        targetPage: 'practice',
      }],
    }
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const dispose = installNavigationRuntime(window, document)

    document.querySelector('span')?.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    }))

    expect(document.querySelector('button')?.dataset.pslElementId)
      .toBe('home::main:1/button:1')
    expect(postMessage).toHaveBeenCalledWith({
      action: 'navigate',
      source: 'psl-navigation-runtime',
      targetPage: 'practice',
    }, '*')

    dispose()
    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('creates standalone and safely serialized script sources', () => {
    const configSource = createNavigationConfigSource({
      currentPage: 'home',
      pageUrls: {},
      transport: 'location',
      connections: [{
        action: 'url',
        elementId: 'home::button:1',
        event: 'click',
        sourcePage: 'home',
        url: 'https://example.com/?value=</script>',
      }],
    })

    expect(createNavigationRuntimeSource()).toContain('data-psl-element-id')
    expect(configSource).not.toContain('</script>')
    expect(configSource).toContain('\\u003c/script>')
  })

  it('shows the practice editor as two validated steps', () => {
    document.body.innerHTML = `
      <header class="create-editor-header"><p data-practice-step-label></p></header>
      <form data-practice-wizard>
        <section data-practice-step="details">
          <input id="practice-title" required>
          <button data-practice-next type="button">Continuar</button>
        </section>
        <section data-practice-step="reference" hidden>
          <h2 tabindex="-1">Referencia de movimiento</h2>
        </section>
      </form>`
    window.__PSL_NAVIGATION__ = {
      currentPage: 'editor-practica',
      pageUrls: {},
      transport: 'message',
      connections: [],
    }
    const dispose = installNavigationRuntime(window, document)
    const details = document.querySelector<HTMLElement>('[data-practice-step="details"]')!
    const reference = document.querySelector<HTMLElement>('[data-practice-step="reference"]')!
    const pageHeader = document.querySelector<HTMLElement>('.create-editor-header')!
    const title = document.querySelector<HTMLInputElement>('#practice-title')!

    document.querySelector<HTMLButtonElement>('[data-practice-next]')?.click()
    expect(details.hidden).toBe(false)
    expect(reference.hidden).toBe(true)

    title.value = 'Saludos básicos'
    document.querySelector<HTMLButtonElement>('[data-practice-next]')?.click()
    expect(details.hidden).toBe(true)
    expect(reference.hidden).toBe(false)
    expect(pageHeader.hidden).toBe(true)
    expect(document.querySelector('[data-practice-step-label]')?.textContent)
      .toBe('Paso 2 de 2 · Referencia')

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('executes the generated runtime without module dependencies', () => {
    document.body.innerHTML = '<button>Back</button>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'home',
      pageUrls: {},
      transport: 'message',
      connections: [{
        action: 'back',
        elementId: 'home::button:1',
        event: 'click',
        sourcePage: 'home',
      }],
    }
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)

    window.eval(createNavigationRuntimeSource())
    document.querySelector('button')?.click()

    expect(postMessage).toHaveBeenCalledWith({
      action: 'back',
      source: 'psl-navigation-runtime',
    }, '*')

    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('rejects unrelated window messages', () => {
    expect(isNavigationRuntimeMessage({ source: 'other', action: 'navigate' })).toBe(false)
    expect(isNavigationRuntimeMessage({
      source: 'psl-navigation-runtime',
      action: 'back',
    })).toBe(true)
    expect(isNavigationRuntimeMessage({
      source: 'psl-navigation-runtime',
      action: 'navigate',
    })).toBe(false)
  })

  it('carries record context and applies safe static bindings', async () => {
    document.body.innerHTML = '<main><button>Open</button><h1>Fallback</h1></main>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'detail',
      pageUrls: {},
      transport: 'message',
      currentContext: {
        selectedRecord: { dataSourceId: 'items', recordId: 'item-2' },
      },
      dataSources: [{
        id: 'items',
        name: 'Items',
        type: 'static',
        records: [{ id: 'item-2', name: 'Second item' }],
      }],
      bindings: [{
        id: 'title-binding',
        pageId: 'detail',
        elementId: 'detail::main:1/h1:1',
        target: 'text',
        contextKey: 'selectedRecord',
        field: 'name',
      }],
      connections: [{
        action: 'navigate',
        elementId: 'detail::main:1/button:1',
        event: 'click',
        sourcePage: 'detail',
        targetPage: 'detail',
        context: {
          selectedRecord: { dataSourceId: 'items', recordId: 'item-2' },
        },
      }],
    }
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const dispose = installNavigationRuntime(window, document)

    await vi.waitFor(() => expect(document.querySelector('h1')).toHaveTextContent('Second item'))
    document.querySelector('button')?.click()
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      action: 'navigate',
      context: {
        selectedRecord: { dataSourceId: 'items', recordId: 'item-2' },
      },
    }), '*')

    dispose()
    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('keeps record context across later steps in a multi-page flow', () => {
    document.body.innerHTML = '<main><button>Continue</button></main>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'detail',
      pageUrls: {},
      transport: 'message',
      currentContext: {
        record: { dataSourceId: 'practices', recordId: 'practice-1' },
      },
      connections: [{
        action: 'navigate',
        elementId: 'detail::main:1/button:1',
        event: 'click',
        sourcePage: 'detail',
        targetPage: 'camera',
      }],
    }
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const dispose = installNavigationRuntime(window, document)

    document.querySelector('button')?.click()

    expect(postMessage).toHaveBeenCalledWith({
      action: 'navigate',
      context: { record: { dataSourceId: 'practices', recordId: 'practice-1' } },
      source: 'psl-navigation-runtime',
      targetPage: 'camera',
    }, '*')

    dispose()
    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('repeats one template for each record and sends the clicked record id', async () => {
    document.body.innerHTML = '<section><article><h2>Template</h2></article></section>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'list',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'items',
        name: 'Items',
        type: 'static',
        records: [{ id: 'one', name: 'First' }, { id: 'two', name: 'Second' }],
      }],
      repeaters: [{
        id: 'item-list',
        pageId: 'list',
        elementId: 'list::section:1/article:1',
        dataSourceId: 'items',
        itemContext: 'item',
      }],
      bindings: [{
        id: 'item-title',
        pageId: 'list',
        elementId: 'list::section:1/article:1/h2:1',
        target: 'text',
        contextKey: 'item',
        field: 'name',
      }],
      connections: [{
        action: 'navigate',
        elementId: 'list::section:1/article:1',
        event: 'click',
        sourcePage: 'list',
        targetPage: 'detail',
        context: {
          selectedRecord: { dataSourceId: 'items', recordId: '$record.id' },
        },
      }],
    }
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const dispose = installNavigationRuntime(window, document)

    await vi.waitFor(() => expect(document.querySelectorAll('article')).toHaveLength(2))
    expect([...document.querySelectorAll('h2')].map((heading) => heading.textContent))
      .toEqual(['First', 'Second'])
    document.querySelectorAll('article')[1].click()
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      context: {
        selectedRecord: { dataSourceId: 'items', recordId: 'two' },
      },
    }), '*')

    dispose()
    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('loads published Supabase rows with the publishable key header', async () => {
    document.body.innerHTML = '<article><h2>Template</h2></article>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'list',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-primary',
        name: 'practice_items',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'practice_items',
        publishedOnly: true,
        orderColumn: 'sort_order',
        orderDirection: 'desc',
      }],
      repeaters: [{
        id: 'items',
        pageId: 'list',
        elementId: 'list::article:1',
        dataSourceId: 'supabase-primary',
        itemContext: 'record',
      }],
      bindings: [{
        id: 'title',
        pageId: 'list',
        elementId: 'list::article:1/h2:1',
        target: 'text',
        contextKey: 'record',
        field: 'title',
      }],
      connections: [],
    }
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([{ id: 'one', title: 'Hello' }]), { status: 200 }),
    )
    const dispose = installNavigationRuntime(window, document)

    await vi.waitFor(() => expect(document.querySelector('h2')).toHaveTextContent('Hello'))
    const [url, options] = fetchSpy.mock.calls[0]
    expect(String(url)).toContain('/rest/v1/practice_items?')
    expect(String(url)).toContain('published=eq.true')
    expect(String(url)).toContain('order=sort_order.desc')
    expect(options).toEqual({ headers: { apikey: 'sb_publishable_test_key' } })

    dispose()
    fetchSpy.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('resolves storage media bindings to signed URLs in repeated previews', async () => {
    document.body.innerHTML = '<section><article><video></video></article></section>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'list', pageUrls: {}, transport: 'message', connections: [],
      dataSources: [{
        id: 'supabase-practices', name: 'practices', type: 'supabase',
        projectUrl: 'https://school.supabase.co', publishableKey: 'sb_publishable_test_key',
        table: 'practices', publishedOnly: true,
      }],
      repeaters: [{
        id: 'items', pageId: 'list', elementId: 'list::section:1/article:1',
        dataSourceId: 'supabase-practices', itemContext: 'record',
      }],
      bindings: [{
        id: 'media', pageId: 'list', elementId: 'list::section:1/article:1/video:1',
        target: 'src', contextKey: 'record', field: 'media_url', dataSourceId: 'supabase-practices',
      }],
    }
    const fetchSpy = vi.spyOn(window, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'one', media_url: 'storage://practice-reference-videos/teacher-1/practice-1/reference',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        signedURL: '/object/sign/practice-reference-videos/teacher-1/practice-1/reference?token=signed',
      }), { status: 200 }))
    const dispose = installNavigationRuntime(window, document)

    await vi.waitFor(() => expect(document.querySelector('video')).toHaveAttribute(
      'src',
      'https://school.supabase.co/storage/v1/object/sign/practice-reference-videos/teacher-1/practice-1/reference?token=signed',
    ))

    dispose()
    fetchSpy.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('loads only the signed-in teacher practices and includes drafts when configured', async () => {
    document.body.innerHTML = '<section><article><h2>Template</h2></article></section>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'creator',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-practices',
        name: 'practices',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'practices',
        publishedOnly: true,
      }],
      repeaters: [{
        id: 'teacher-practices',
        pageId: 'creator',
        elementId: 'creator::section:1/article:1',
        dataSourceId: 'supabase-practices',
        itemContext: 'record',
        userFilterColumn: 'created_by',
        includeUnpublished: true,
      }],
      bindings: [{
        id: 'title',
        pageId: 'creator',
        elementId: 'creator::section:1/article:1/h2:1',
        target: 'text',
        contextKey: 'record',
        field: 'title',
      }],
      connections: [],
    }
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        access_token: 'teacher-access-token',
        refresh_token: 'teacher-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'teacher-1' },
      })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'one', title: 'Mi práctica' }]), { status: 200 }),
    )
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })

    const dispose = installNavigationRuntime(runtimeWindow, document)

    await vi.waitFor(() => expect(document.querySelector('h2')).toHaveTextContent('Mi práctica'))
    const [url, options] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('created_by=eq.teacher-1')
    expect(String(url)).not.toContain('published=eq.true')
    expect(options).toEqual({ headers: {
      apikey: 'sb_publishable_test_key',
      Authorization: 'Bearer teacher-access-token',
    } })

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('paginates repeated Supabase rows and requests only the current page', async () => {
    document.body.innerHTML = '<section class="psl-data-carousel"><article><h2>Template</h2></article></section>'
    const carousel = document.querySelector<HTMLElement>('.psl-data-carousel')!
    carousel.scrollLeft = 140
    window.__PSL_NAVIGATION__ = {
      currentPage: 'list',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-items',
        name: 'items',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'items',
        publishedOnly: true,
      }],
      repeaters: [{
        id: 'paged-items',
        pageId: 'list',
        elementId: 'list::section:1/article:1',
        dataSourceId: 'supabase-items',
        itemContext: 'record',
        pageSize: 12,
        pagination: true,
      }],
      bindings: [{
        id: 'item-title',
        pageId: 'list',
        elementId: 'list::section:1/article:1/h2:1',
        target: 'text',
        contextKey: 'record',
        field: 'title',
      }],
      connections: [],
    }
    const firstPage = Array.from({ length: 13 }, (_, index) => ({
      id: String(index + 1),
      title: `Item ${index + 1}`,
    }))
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation(async (input) => {
      const url = new URL(String(input))
      return new Response(JSON.stringify(url.searchParams.get('offset') === '12'
        ? [{ id: '13', title: 'Item 13' }]
        : firstPage), { status: 200 })
    })
    const dispose = installNavigationRuntime(window, document)

    await vi.waitFor(() => expect(document.querySelectorAll('article')).toHaveLength(12))
    expect(carousel.scrollLeft).toBe(0)
    expect(String(fetchSpy.mock.calls[0][0])).toContain('limit=13')
    expect(String(fetchSpy.mock.calls[0][0])).toContain('offset=0')
    const next = [...document.querySelectorAll('button')]
      .find((button) => button.textContent === 'Siguiente →') as HTMLButtonElement
    expect(next).not.toBeDisabled()
    carousel.scrollLeft = 90
    next.click()
    await vi.waitFor(() => expect(document.querySelectorAll('article')).toHaveLength(1))
    expect(document.querySelector('h2')).toHaveTextContent('Item 13')
    expect(String(fetchSpy.mock.calls[1][0])).toContain('offset=12')
    expect(document.querySelector('.psl-data-pagination span')).toHaveTextContent('Página 2')
    expect(carousel.scrollLeft).toBe(0)

    dispose()
    fetchSpy.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('shows a friendly empty state when a repeated collection has no items', async () => {
    document.body.innerHTML = '<article><h2>Template</h2></article>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'list',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'items',
        name: 'Items',
        type: 'static',
        records: [],
      }],
      repeaters: [{
        id: 'item-list',
        pageId: 'list',
        elementId: 'list::article:1',
        dataSourceId: 'items',
        itemContext: 'item',
        emptyMessage: 'Visita el catálogo para comenzar.',
      }],
      connections: [],
    }

    const dispose = installNavigationRuntime(window, document)
    await vi.waitFor(() => expect(document.querySelector('[data-psl-data-status="empty"]'))
      .toHaveTextContent('Visita el catálogo para comenzar.'))

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('shows one empty message instead of design placeholders in preview', async () => {
    document.body.innerHTML = '<section><article><h2>Title: practice title</h2></article></section>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'list',
      pageUrls: {},
      transport: 'message',
      dataSources: [{ id: 'items', name: 'Items', type: 'static', records: [] }],
      repeaters: [{
        id: 'item-grid',
        pageId: 'list',
        elementId: 'list::section:1/article:1',
        dataSourceId: 'items',
        itemContext: 'item',
        pageSize: 6,
      }],
      connections: [],
    }

    const dispose = installNavigationRuntime(window, document)
    await vi.waitFor(() => expect(document.querySelector('[data-psl-data-status="empty"]'))
      .toHaveTextContent('Todavía no hay elementos para mostrar.'))
    expect(document.querySelectorAll('article')).toHaveLength(0)

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('shows one error message without design placeholders when the data request fails', async () => {
    document.body.innerHTML = '<section><article><h2>Title placeholder</h2></article></section>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'list',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-items',
        name: 'items',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'items',
        publishedOnly: true,
      }],
      repeaters: [{
        id: 'item-grid',
        pageId: 'list',
        elementId: 'list::section:1/article:1',
        dataSourceId: 'supabase-items',
        itemContext: 'item',
        pageSize: 6,
        pagination: true,
      }],
      connections: [],
    }
    const fetchSpy = vi.spyOn(window, 'fetch').mockResolvedValue(new Response('Denied', { status: 403 }))

    const dispose = installNavigationRuntime(window, document)
    await vi.waitFor(() => expect(document.querySelector('[data-psl-data-status="error"]'))
      .toHaveTextContent('No se pudo cargar esta información.'))
    expect(document.querySelectorAll('article')).toHaveLength(0)
    expect(document.querySelector('.psl-data-pagination')).toHaveAttribute('hidden')

    dispose()
    fetchSpy.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('loads one user-owned row with the stored session and authenticated header', async () => {
    document.body.innerHTML = '<main><h1>Profile</h1></main>'
    window.__PSL_NAVIGATION__ = {
      currentPage: 'profile',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-profiles',
        name: 'profiles',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'profiles',
        publishedOnly: false,
        requiresAuth: true,
      }],
      bindings: [{
        id: 'profile-name',
        pageId: 'profile',
        elementId: 'profile::main:1/h1:1',
        target: 'text',
        contextKey: 'record',
        dataSourceId: 'supabase-profiles',
        sourceMode: 'first',
        field: 'display_name',
      }],
      connections: [],
    }
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        access_token: 'user-access-token',
        refresh_token: 'user-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'profile-1', display_name: 'Ana' }]), { status: 200 }),
    )
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })

    const dispose = installNavigationRuntime(runtimeWindow, document)

    await vi.waitFor(() => expect(document.querySelector('h1')).toHaveTextContent('Ana'))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/profiles?'),
      { headers: {
        apikey: 'sb_publishable_test_key',
        Authorization: 'Bearer user-access-token',
      } },
    )

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('shows role-specific controls only for roles returned by user_roles', async () => {
    document.body.innerHTML = `<nav>
      <button data-psl-role-visible="teacher">Docente</button>
      <button data-psl-role-visible="admin">Administración</button>
    </nav>`
    window.__PSL_NAVIGATION__ = {
      currentPage: 'home',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-user-roles',
        name: 'user_roles',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'user_roles',
        publishedOnly: false,
        requiresAuth: true,
      }],
      connections: [],
    }
    const storage = {
      getItem: vi.fn(() => JSON.stringify({
        access_token: 'teacher-access-token',
        refresh_token: 'teacher-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
      })),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 'role-1', role: 'teacher' }]), { status: 200 }),
    )
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })

    const dispose = installNavigationRuntime(runtimeWindow, document)

    await vi.waitFor(() => expect(document.querySelector('[data-psl-role-visible="teacher"]'))
      .not.toHaveAttribute('hidden'))
    expect(document.querySelector('[data-psl-role-visible="admin"]')).toHaveAttribute('hidden')
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/rest/v1/user_roles?'),
      { headers: {
        apikey: 'sb_publishable_test_key',
        Authorization: 'Bearer teacher-access-token',
      } },
    )

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('signs in with email/password, persists the session, and reloads the preview', async () => {
    document.body.innerHTML = `<form data-psl-auth-action="login">
      <input name="email" value="student@example.com">
      <input name="password" value="class-password">
      <button type="submit">Entrar</button>
      <p data-psl-auth-status></p>
    </form>`
    window.__PSL_NAVIGATION__ = {
      currentPage: 'login',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-public',
        name: 'public',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'public_content',
        publishedOnly: true,
      }],
      connections: [],
    }
    const storage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    }
    const reload = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      user: { id: 'user-1', email: 'student@example.com' },
    }), { status: 200 }))
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    Object.defineProperty(runtimeWindow, 'location', { value: { search: '', reload } })
    const dispose = installNavigationRuntime(runtimeWindow, document)

    document.querySelector('form')?.dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }))

    await vi.waitFor(() => expect(storage.setItem).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      'https://school.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        method: 'POST',
        headers: {
          apikey: 'sb_publishable_test_key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'student@example.com',
          password: 'class-password',
        }),
      }),
    )
    expect(reload).toHaveBeenCalledOnce()

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('redirects a signed-out visitor from a protected page to the access page', async () => {
    document.body.innerHTML = '<main><h1>Private home</h1></main>'
    const values = new Map<string, string>()
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    window.__PSL_NAVIGATION__ = {
      currentPage: 'home',
      pageUrls: { home: 'pages/home.html', access: 'pages/access.html' },
      pageAccess: { home: 'authenticated', access: 'guestOnly' },
      transport: 'message',
      authentication: {
        provider: 'supabase',
        projectUrl: 'https://guards.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        loginPage: 'access',
        afterLoginPage: 'home',
        afterLogoutPage: 'access',
      },
      connections: [],
    }
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    const dispose = installNavigationRuntime(runtimeWindow, document)

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({
      action: 'navigate',
      source: 'psl-navigation-runtime',
      targetPage: 'access',
    }, '*'))
    expect(values.get('psl-auth:guards.supabase.co:return-page')).toBe('home')

    dispose()
    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.documentElement.style.removeProperty('visibility')
    document.body.innerHTML = ''
  })

  it('signs in without a data table and returns to the originally requested page', async () => {
    document.body.innerHTML = `<form data-psl-auth-action="login">
      <input name="email" value="student@example.com">
      <input name="password" value="class-password">
      <button type="submit">Entrar</button>
      <p data-psl-auth-status></p>
    </form>`
    const values = new Map<string, string>([
      ['psl-auth:guards.supabase.co:return-page', 'practice'],
    ])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    window.__PSL_NAVIGATION__ = {
      currentPage: 'access',
      pageUrls: { home: 'pages/home.html', practice: 'pages/practice.html', access: 'pages/access.html' },
      pageAccess: { home: 'authenticated', practice: 'authenticated', access: 'guestOnly' },
      transport: 'message',
      authentication: {
        provider: 'supabase',
        projectUrl: 'https://guards.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        loginPage: 'access',
        afterLoginPage: 'home',
        afterLogoutPage: 'access',
      },
      connections: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
      user: { id: 'user-1', email: 'student@example.com' },
    }), { status: 200 }))
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    const dispose = installNavigationRuntime(runtimeWindow, document)

    document.querySelector('form')?.dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }))

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({
      action: 'navigate',
      source: 'psl-navigation-runtime',
      targetPage: 'practice',
    }, '*'))
    expect(values.get('psl-auth:guards.supabase.co')).toContain('new-access-token')
    expect(values.get('psl-auth:guards.supabase.co:return-page')).toBeUndefined()

    dispose()
    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('uses the destination configured on the auth component after sign in', async () => {
    document.body.innerHTML = `<form data-psl-auth-action="login" data-psl-auth-destination="dashboard">
      <input name="email" value="student@example.com">
      <input name="password" value="class-password">
      <button type="submit">Entrar</button>
      <p data-psl-auth-status></p>
    </form>`
    const values = new Map<string, string>([
      ['psl-auth:guards.supabase.co:return-page', 'practice'],
    ])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    window.__PSL_NAVIGATION__ = {
      currentPage: 'access',
      pageUrls: { access: 'access.html', dashboard: 'dashboard.html', practice: 'practice.html' },
      transport: 'message',
      authentication: {
        provider: 'supabase',
        projectUrl: 'https://guards.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        loginPage: 'access',
        afterLoginPage: 'practice',
        afterLogoutPage: 'access',
      },
      connections: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_in: 3600,
    }), { status: 200 }))
    const postMessage = vi.spyOn(window, 'postMessage').mockImplementation(() => undefined)
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    const dispose = installNavigationRuntime(runtimeWindow, document)

    document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(postMessage).toHaveBeenCalledWith({
      action: 'navigate',
      source: 'psl-navigation-runtime',
      targetPage: 'dashboard',
    }, '*'))

    dispose()
    postMessage.mockRestore()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('switches between login and signup panels without relying on element ids', () => {
    document.body.innerHTML = `<section data-psl-auth-visible="signed-out">
      <button data-psl-auth-tab="login" aria-selected="true">Login</button>
      <button data-psl-auth-tab="signup" aria-selected="false" tabindex="-1">Signup</button>
      <form data-psl-auth-action="login" data-psl-auth-panel="login"></form>
      <form data-psl-auth-action="signup" data-psl-auth-panel="signup" hidden></form>
    </section>`
    window.__PSL_NAVIGATION__ = {
      currentPage: 'access',
      pageUrls: {},
      transport: 'message',
      dataSources: [],
      connections: [],
    }
    const dispose = installNavigationRuntime(window, document)

    document.querySelector<HTMLElement>('[data-psl-auth-tab="signup"]')?.click()

    expect(document.querySelector('[data-psl-auth-tab="signup"]')).toHaveAttribute('aria-selected', 'true')
    expect(document.querySelector('[data-psl-auth-tab="login"]')).toHaveAttribute('tabindex', '-1')
    expect(document.querySelector('[data-psl-auth-panel="signup"]')).not.toHaveAttribute('hidden')
    expect(document.querySelector('[data-psl-auth-panel="login"]')).toHaveAttribute('hidden')

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('includes editable profile intent metadata during signup without granting roles', async () => {
    document.body.innerHTML = `<form data-psl-auth-action="signup">
      <input name="display_name" data-psl-auth-metadata value="Ana">
      <input name="email" value="ana@example.com">
      <input name="password" value="class-password">
      <input name="learning_goal" data-psl-auth-metadata type="radio" value="learn">
      <input name="learning_goal" data-psl-auth-metadata type="radio" value="teach" checked>
      <button type="submit">Crear cuenta</button>
      <p data-psl-auth-status></p>
    </form>`
    window.__PSL_NAVIGATION__ = {
      currentPage: 'access',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-public',
        name: 'public',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'practices',
        publishedOnly: true,
      }],
      connections: [],
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    const dispose = installNavigationRuntime(runtimeWindow, document)

    document.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      'https://school.supabase.co/auth/v1/signup',
      expect.objectContaining({
        body: JSON.stringify({
          email: 'ana@example.com',
          password: 'class-password',
          data: { display_name: 'Ana', learning_goal: 'teach' },
        }),
      }),
    )

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('updates the signed-in profile and refreshes bound profile fields', async () => {
    document.body.innerHTML = `<main>
      <h1>Estudiante</h1>
      <form data-psl-mutation-source="profiles" data-psl-mutation-filter="user_id">
        <input name="display_name" data-psl-mutation-field value="Porfirio Rios">
        <textarea name="bio" data-psl-mutation-field>Aprendiendo LSP.</textarea>
        <button type="submit">Guardar perfil</button>
        <p data-psl-mutation-status></p>
      </form>
    </main>`
    window.__PSL_NAVIGATION__ = {
      currentPage: 'profile',
      pageUrls: {},
      transport: 'message',
      dataSources: [{
        id: 'supabase-table_profiles',
        name: 'profiles',
        type: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        table: 'profiles',
        publishedOnly: false,
        requiresAuth: true,
      }],
      bindings: [{
        id: 'profile-name',
        pageId: 'profile',
        elementId: 'profile::main:1/h1:1',
        target: 'text',
        contextKey: 'record',
        dataSourceId: 'supabase-table_profiles',
        sourceMode: 'first',
        field: 'display_name',
      }],
      connections: [],
    }
    const values = new Map<string, string>([[
      'psl-auth:school.supabase.co',
      JSON.stringify({
        access_token: 'profile-access-token',
        refresh_token: 'profile-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user-1' },
      }),
    ]])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'profile-1',
        user_id: 'user-1',
        display_name: 'Nombre anterior',
        bio: 'Biografía anterior',
      }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        id: 'profile-1',
        user_id: 'user-1',
        display_name: 'Porfirio Rios',
        bio: 'Aprendiendo LSP.',
      }]), { status: 200 }))
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    const dispose = installNavigationRuntime(runtimeWindow, document)

    await vi.waitFor(() => expect(document.querySelector('h1'))
      .toHaveTextContent('Nombre anterior'))
    expect(document.querySelector<HTMLInputElement>('[name="display_name"]')?.value)
      .toBe('Nombre anterior')
    const displayName = document.querySelector<HTMLInputElement>('[name="display_name"]')
    const bio = document.querySelector<HTMLTextAreaElement>('[name="bio"]')
    if (displayName) displayName.value = 'Porfirio Rios'
    if (bio) bio.value = 'Aprendiendo LSP.'
    document.querySelector('form')?.dispatchEvent(new Event('submit', {
      bubbles: true,
      cancelable: true,
    }))

    await vi.waitFor(() => expect(document.querySelector('[data-psl-mutation-status]'))
      .toHaveTextContent('Perfil guardado correctamente.'))
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://school.supabase.co/rest/v1/profiles?user_id=eq.user-1&select=*',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer profile-access-token',
          Prefer: 'return=representation',
        }),
        body: JSON.stringify({
          display_name: 'Porfirio Rios',
          bio: 'Aprendiendo LSP.',
        }),
      }),
    )
    expect(document.querySelector('h1')).toHaveTextContent('Porfirio Rios')

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('creates a teacher practice with its captured landmark template', async () => {
    const template = {
      version: 2,
      durationMs: 2_000,
      frames: [{
        facePosture: [], handShape: [], location: [], orientation: [],
        quality: 1, t: 0, trajectory: [],
      }],
      landmarkFrames: [],
    }
    document.body.innerHTML = `<form data-psl-mutation-source="practices"
      data-psl-mutation-mode="insert" data-psl-mutation-owner-field="created_by">
      <input name="title" data-psl-mutation-field value="Saludos">
      <input name="difficulty" data-psl-mutation-field data-psl-mutation-type="number" value="1">
      <input name="source" data-psl-mutation-field value="teacher">
      <input name="mediapipe_reference" data-psl-mutation-field
        data-psl-mutation-type="json" data-motion-template-field>
      <button name="published" value="true" data-psl-mutation-type="boolean" type="submit">Publicar</button>
      <p data-psl-mutation-status></p>
    </form>`
    const templateField = document.querySelector<HTMLInputElement>('[data-motion-template-field]')
    if (templateField) templateField.value = JSON.stringify(template)
    window.__PSL_NAVIGATION__ = {
      currentPage: 'practice-editor', pageUrls: {}, transport: 'message', connections: [],
      dataSources: [{
        id: 'supabase-table_practices', name: 'practices', type: 'supabase',
        projectUrl: 'https://school.supabase.co', publishableKey: 'sb_publishable_test_key',
        table: 'practices', publishedOnly: false, requiresAuth: true,
      }],
    }
    const values = new Map<string, string>([[
      'psl-auth:school.supabase.co',
      JSON.stringify({
        access_token: 'teacher-token', refresh_token: 'teacher-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'teacher-1' },
      }),
    ]])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      id: 'practice-1', title: 'Saludos', created_by: 'teacher-1',
    }]), { status: 201 }))
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    const dispose = installNavigationRuntime(runtimeWindow, document)
    const form = document.querySelector('form')
    const publish = document.querySelector<HTMLButtonElement>('button')
    form?.dispatchEvent(new SubmitEvent('submit', {
      bubbles: true, cancelable: true, submitter: publish,
    }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith(
      'https://school.supabase.co/rest/v1/practices?select=*',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'Saludos', difficulty: 1, source: 'teacher',
          mediapipe_reference: template, published: true, created_by: 'teacher-1',
        }),
      }),
    )

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('uploads a selected reference video and associates it with the practice', async () => {
    const template = {
      version: 2, durationMs: 1_000,
      frames: [{
        facePosture: [], handShape: [], location: [], orientation: [],
        quality: 1, t: 0, trajectory: [],
      }],
      landmarkFrames: [],
    }
    document.body.innerHTML = `<form data-psl-mutation-source="practices"
      data-psl-mutation-mode="insert" data-psl-mutation-owner-field="created_by">
      <input name="title" data-psl-mutation-field value="Saludos">
      <input name="source" data-psl-mutation-field value="teacher">
      <input name="mediapipe_reference" data-psl-mutation-field
        data-psl-mutation-type="json" data-motion-template-field>
      <button name="published" value="true" data-psl-mutation-type="boolean" type="submit">Publicar</button>
      <p data-psl-mutation-status></p>
    </form><input data-motion-file type="file">`
    document.querySelector<HTMLInputElement>('[data-motion-template-field]')!.value = JSON.stringify(template)
    const file = new File(['video'], 'referencia.mp4', { type: 'video/mp4' })
    const preparedClip = new File(['clip'], 'reference-clip.webm', {
      type: 'video/webm;codecs=vp9',
    })
    const videoInput = document.querySelector<HTMLInputElement & {
      __motionReferenceClip?: File
    }>('[data-motion-file]')!
    Object.defineProperty(videoInput, 'files', {
      value: [file], configurable: true,
    })
    videoInput.__motionReferenceClip = preparedClip
    window.__PSL_NAVIGATION__ = {
      currentPage: 'practice-editor', pageUrls: {}, transport: 'message', connections: [],
      dataSources: [{
        id: 'supabase-table_practices', name: 'practices', type: 'supabase',
        projectUrl: 'https://school.supabase.co', publishableKey: 'sb_publishable_test_key',
        table: 'practices', publishedOnly: false, requiresAuth: true,
      }],
    }
    const values = new Map<string, string>([[
      'psl-auth:school.supabase.co',
      JSON.stringify({
        access_token: 'teacher-token', refresh_token: 'teacher-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'teacher-1' },
      }),
    ]])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    const practice = { id: 'practice-1', title: 'Saludos', created_by: 'teacher-1' }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([practice]), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ Key: 'reference' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        ...practice,
        media_url: 'storage://practice-reference-videos/teacher-1/practice-1/reference',
      }]), { status: 200 }))
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    const dispose = installNavigationRuntime(runtimeWindow, document)
    const publish = document.querySelector<HTMLButtonElement>('button')
    document.querySelector('form')?.dispatchEvent(new SubmitEvent('submit', {
      bubbles: true, cancelable: true, submitter: publish,
    }))

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
    expect(fetchMock).toHaveBeenNthCalledWith(2,
      'https://school.supabase.co/storage/v1/object/practice-reference-videos/teacher-1/practice-1/reference',
      expect.objectContaining({
        method: 'POST', body: preparedClip,
        headers: expect.objectContaining({
          Authorization: 'Bearer teacher-token',
          'Content-Type': 'video/webm',
          'x-upsert': 'true',
        }),
      }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(3,
      'https://school.supabase.co/rest/v1/practices?id=eq.practice-1&select=*',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          media_url: 'storage://practice-reference-videos/teacher-1/practice-1/reference',
        }),
      }),
    )
    expect(document.querySelector('[data-psl-mutation-status]'))
      .toHaveTextContent('Práctica guardada correctamente.')

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })

  it('loads and updates the selected teacher practice from Flow context', async () => {
    const template = {
      version: 2,
      durationMs: 6_000,
      frames: [{
        facePosture: [], handShape: [], location: [], orientation: [],
        quality: 1, t: 0, trajectory: [],
      }],
      landmarkFrames: [],
    }
    document.body.innerHTML = `<header>
      <p data-psl-editor-mode>Crear</p>
      <h1 data-psl-editor-title>Nueva práctica</h1>
      <p data-psl-editor-description>Completa la información.</p>
    </header><form data-psl-mutation-source="practices"
      data-psl-mutation-mode="context" data-psl-mutation-context="record"
      data-psl-mutation-filter="id" data-psl-mutation-owner-field="created_by">
      <input name="title" data-psl-mutation-field>
      <textarea name="description" data-psl-mutation-field></textarea>
      <input name="difficulty" data-psl-mutation-field data-psl-mutation-type="number">
      <input name="estimated_minutes" type="number" data-psl-mutation-field>
      <input name="source" data-psl-mutation-field>
      <input name="mediapipe_reference" data-psl-mutation-field
        data-psl-mutation-type="json" data-motion-template-field>
      <button name="published" value="true" data-psl-mutation-type="boolean" type="submit">Publicar</button>
      <p data-psl-mutation-status></p>
    </form>`
    window.__PSL_NAVIGATION__ = {
      currentPage: 'practice-editor', pageUrls: {}, transport: 'message', connections: [],
      currentContext: { record: {
        dataSourceId: 'supabase-table_practices', recordId: 'practice-1',
      } },
      bindings: [{
        id: 'practice-title', pageId: 'practice-editor',
        elementId: 'practice-editor::form:1/input:1', target: 'value',
        contextKey: 'record', dataSourceId: 'supabase-table_practices',
        sourceMode: 'context', field: 'title',
      }],
      dataSources: [{
        id: 'supabase-table_practices', name: 'practices', type: 'supabase',
        projectUrl: 'https://school.supabase.co', publishableKey: 'sb_publishable_test_key',
        table: 'practices', publishedOnly: true,
      }],
    }
    const values = new Map<string, string>([[
      'psl-auth:school.supabase.co',
      JSON.stringify({
        access_token: 'teacher-token', refresh_token: 'teacher-refresh',
        expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'teacher-1' },
      }),
    ]])
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    }
    const existing = {
      id: 'practice-1', title: 'Verbos - Buscar', description: 'IPHE - Verbos - Buscar',
      difficulty: 1, estimated_minutes: 6, source: 'teacher', published: true,
      created_by: 'teacher-1', mediapipe_reference: template,
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([existing]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        ...existing, title: 'Verbos - Buscar actualizado',
      }]), { status: 200 }))
    const runtimeWindow = Object.create(window) as Window
    Object.defineProperty(runtimeWindow, 'localStorage', { value: storage })
    Object.defineProperty(runtimeWindow, 'fetch', { value: fetchMock })
    const dispose = installNavigationRuntime(runtimeWindow, document)

    await vi.waitFor(() => expect(document.querySelector<HTMLInputElement>('[name="title"]')?.value)
      .toBe('Verbos - Buscar'))
    expect(document.querySelector<HTMLTextAreaElement>('[name="description"]')?.value)
      .toBe('IPHE - Verbos - Buscar')
    expect(document.querySelector<HTMLInputElement>('[name="estimated_minutes"]')?.value)
      .toBe('6')
    expect(document.querySelector<HTMLInputElement>('[data-motion-template-field]')?.value)
      .toBe(JSON.stringify(template))
    expect(document.querySelector('[data-psl-editor-title]')).toHaveTextContent('Editar práctica')
    expect(document.querySelector('[data-psl-mutation-status]'))
      .toHaveTextContent('Práctica y referencia existentes cargadas.')
    expect(fetchMock).toHaveBeenNthCalledWith(1,
      'https://school.supabase.co/rest/v1/practices?select=*&id=eq.practice-1',
      expect.objectContaining({ headers: expect.objectContaining({
        Authorization: 'Bearer teacher-token',
      }) }),
    )

    const title = document.querySelector<HTMLInputElement>('[name="title"]')
    if (title) title.value = 'Verbos - Buscar actualizado'
    const publish = document.querySelector<HTMLButtonElement>('button[type="submit"]')
    document.querySelector('form')?.dispatchEvent(new SubmitEvent('submit', {
      bubbles: true, cancelable: true, submitter: publish,
    }))
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://school.supabase.co/rest/v1/practices?id=eq.practice-1&select=*',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({
          title: 'Verbos - Buscar actualizado',
          description: 'IPHE - Verbos - Buscar',
          difficulty: 1,
          estimated_minutes: 6,
          source: 'teacher',
          mediapipe_reference: template,
          published: true,
        }),
      }),
    )

    dispose()
    delete window.__PSL_NAVIGATION__
    document.body.innerHTML = ''
  })
})
