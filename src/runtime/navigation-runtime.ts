import type {
  DataBinding,
  DataRepeater,
  DataSource,
  NavigationContext,
  NavigationContextValue,
  ProjectAuthentication,
} from '../core/project'

export type { NavigationContext } from '../core/project'

export interface NavigationRuntimeConnection {
  action: 'navigate' | 'back' | 'url'
  elementId: string
  event: 'click'
  sourcePage: string
  targetPage?: string
  url?: string
  context?: NavigationContext
}

export interface NavigationRuntimeConfig {
  connections: NavigationRuntimeConnection[]
  currentPage: string
  pageUrls: Record<string, string>
  transport: 'location' | 'message'
  dataSources?: DataSource[]
  bindings?: DataBinding[]
  currentContext?: NavigationContext
  repeaters?: DataRepeater[]
  authentication?: ProjectAuthentication
  pageAccess?: Record<string, 'public' | 'authenticated' | 'guestOnly'>
}

export interface NavigationRuntimeMessage {
  action: 'navigate' | 'back' | 'url'
  source: 'psl-navigation-runtime'
  targetPage?: string
  url?: string
  context?: NavigationContext
}

declare global {
  interface Window {
    __PSL_NAVIGATION__?: NavigationRuntimeConfig
  }
}

export function installNavigationRuntime(
  runtimeWindow: Window = window,
  runtimeDocument: Document = document,
) {
  const config = runtimeWindow.__PSL_NAVIGATION__
  if (!config) return () => undefined
  const runtimeConfig = config
  const contextParameterPrefix = 'psl-context-'

  function elementPosition(element: Element) {
    let position = 1
    let sibling = element.previousElementSibling

    while (sibling) {
      if (sibling.tagName === element.tagName) position += 1
      sibling = sibling.previousElementSibling
    }

    return position
  }

  function stableElementId(element: Element) {
    const segments: string[] = []
    let current: Element | null = element

    while (current && current.tagName !== 'BODY') {
      segments.unshift(`${current.tagName.toLowerCase()}:${elementPosition(current)}`)
      current = current.parentElement
    }

    return `${runtimeConfig.currentPage}::${segments.join('/')}`
  }

  runtimeDocument.body.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (!['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'TEMPLATE'].includes(element.tagName)) {
      element.dataset.pslElementId = stableElementId(element)
    }
  })

  function contextFromLocation() {
    const result: NavigationContext = { ...runtimeConfig.currentContext }
    try {
      const parameters = new URLSearchParams(runtimeWindow.location.search)
      parameters.forEach((value, key) => {
        if (!key.startsWith(contextParameterPrefix)) return
        const parsed = JSON.parse(value) as Partial<NavigationContextValue>
        if (typeof parsed.dataSourceId === 'string' && typeof parsed.recordId === 'string') {
          result[key.slice(contextParameterPrefix.length)] = {
            dataSourceId: parsed.dataSourceId,
            recordId: parsed.recordId,
          }
        }
      })
    } catch {
      return result
    }
    return result
  }

  const activeContext = contextFromLocation()

  type AuthSession = {
    access_token: string
    refresh_token: string
    expires_at: number
    user?: Record<string, unknown>
  }

  const authSource = runtimeConfig.dataSources?.find((source) => source.type === 'supabase')
  const authProject = runtimeConfig.authentication ?? (authSource?.type === 'supabase' ? {
    provider: 'supabase' as const,
    projectUrl: authSource.projectUrl,
    publishableKey: authSource.publishableKey,
    loginPage: runtimeConfig.currentPage,
    afterLoginPage: runtimeConfig.currentPage,
    afterLogoutPage: runtimeConfig.currentPage,
  } : undefined)
  const authStorageKey = authProject
    ? `psl-auth:${new URL(authProject.projectUrl).hostname}`
    : 'psl-auth'
  const authReturnStorageKey = `${authStorageKey}:return-page`

  function storedSession() {
    try {
      const raw = runtimeWindow.localStorage.getItem(authStorageKey)
      if (!raw) return undefined
      const parsed = JSON.parse(raw) as Partial<AuthSession>
      if (typeof parsed.access_token !== 'string' || typeof parsed.refresh_token !== 'string') return undefined
      return parsed as AuthSession
    } catch {
      return undefined
    }
  }

  function saveSession(session?: AuthSession) {
    try {
      if (session) runtimeWindow.localStorage.setItem(authStorageKey, JSON.stringify(session))
      else runtimeWindow.localStorage.removeItem(authStorageKey)
    } catch {
      return
    }
  }

  function normalizedSession(value: unknown): AuthSession | undefined {
    if (!value || typeof value !== 'object') return undefined
    const object = value as Record<string, unknown>
    if (typeof object.access_token !== 'string' || typeof object.refresh_token !== 'string') return undefined
    const expiresIn = typeof object.expires_in === 'number' ? object.expires_in : 3600
    return {
      access_token: object.access_token,
      refresh_token: object.refresh_token,
      expires_at: typeof object.expires_at === 'number'
        ? object.expires_at
        : Math.floor(Date.now() / 1000) + expiresIn,
      ...(object.user && typeof object.user === 'object'
        ? { user: object.user as Record<string, unknown> }
        : {}),
    }
  }

  async function authRequest(path: string, body?: Record<string, unknown>, accessToken?: string) {
    if (!authProject) return undefined
    const response = await runtimeWindow.fetch(
      `${authProject.projectUrl.replace(/\/$/, '')}/auth/v1/${path}`,
      {
        method: 'POST',
        headers: {
          apikey: authProject.publishableKey,
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    )
    const result = response.status === 204 ? {} : await response.json().catch(() => ({}))
    if (!response.ok) {
      const detail = result && typeof result === 'object'
        ? (result as Record<string, unknown>).msg
          ?? (result as Record<string, unknown>).message
          ?? (result as Record<string, unknown>).error_description
        : undefined
      throw new Error(typeof detail === 'string' ? detail : 'Supabase no pudo completar la solicitud.')
    }
    return result
  }

  async function loadAuthSession() {
    const existing = storedSession()
    if (!existing) return undefined
    if (existing.expires_at > Math.floor(Date.now() / 1000) + 60) return existing
    try {
      const refreshed = normalizedSession(await authRequest(
        'token?grant_type=refresh_token',
        { refresh_token: existing.refresh_token },
      ))
      saveSession(refreshed)
      return refreshed
    } catch {
      saveSession()
      return undefined
    }
  }

  const authSessionPromise = authProject ? loadAuthSession() : Promise.resolve(undefined)

  function storedReturnPage() {
    try {
      const pageId = runtimeWindow.localStorage.getItem(authReturnStorageKey)
      return pageId && runtimeConfig.pageUrls[pageId] !== undefined ? pageId : undefined
    } catch {
      return undefined
    }
  }

  function saveReturnPage(pageId?: string) {
    try {
      if (pageId) runtimeWindow.localStorage.setItem(authReturnStorageKey, pageId)
      else runtimeWindow.localStorage.removeItem(authReturnStorageKey)
    } catch {
      return
    }
  }

  function navigateToPage(pageId: string, replace = false) {
    if (runtimeConfig.transport === 'message') {
      const message: NavigationRuntimeMessage = {
        source: 'psl-navigation-runtime',
        action: 'navigate',
        targetPage: pageId,
      }
      runtimeWindow.parent.postMessage(message, '*')
      return
    }
    const targetUrl = runtimeConfig.pageUrls[pageId]
    if (!targetUrl) return
    const resolvedUrl = new URL(targetUrl, runtimeWindow.location.href)
    if (replace) runtimeWindow.location.replace(resolvedUrl.href)
    else runtimeWindow.location.assign(resolvedUrl.href)
  }

  function revealDocument() {
    runtimeDocument.documentElement.style.removeProperty('visibility')
  }

  async function applyAuthPageGuard() {
    const authentication = runtimeConfig.authentication
    if (!authentication) return true
    runtimeDocument.documentElement.style.visibility = 'hidden'
    const session = await authSessionPromise
    const access = runtimeConfig.pageAccess?.[runtimeConfig.currentPage]
      ?? (runtimeConfig.currentPage === authentication.loginPage ? 'guestOnly' : 'authenticated')

    if (access === 'authenticated' && !session) {
      saveReturnPage(runtimeConfig.currentPage)
      navigateToPage(authentication.loginPage, true)
      return false
    }
    if (access === 'guestOnly' && session) {
      const destination = storedReturnPage() ?? authentication.afterLoginPage
      saveReturnPage()
      if (destination !== runtimeConfig.currentPage) {
        navigateToPage(destination, true)
        return false
      }
    }
    revealDocument()
    return true
  }

  function dataRequest(
    source: DataSource,
    recordId?: string,
    session?: AuthSession,
    range?: { limit: number; offset: number },
  ) {
    if (source.type !== 'supabase') return null
    const url = new URL(
      `${source.projectUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(source.table)}`,
    )
    url.searchParams.set('select', '*')
    if (recordId !== undefined) url.searchParams.set('id', `eq.${recordId}`)
    if (source.publishedOnly) url.searchParams.set('published', 'eq.true')
    if (source.orderColumn && recordId === undefined) {
      url.searchParams.set('order', `${source.orderColumn}.asc`)
    }
    if (range && recordId === undefined) {
      url.searchParams.set('limit', String(range.limit))
      url.searchParams.set('offset', String(range.offset))
    }
    return {
      url: url.href,
      options: { headers: {
        apikey: source.publishableKey,
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      } },
    }
  }

  function fieldValue(record: unknown, path: string) {
    let current = record
    for (const segment of path.split('.')) {
      if (!current || typeof current !== 'object') return undefined
      current = (current as Record<string, unknown>)[segment]
    }
    return current
  }

  async function resolveRecord(reference: NavigationContextValue) {
    const source = runtimeConfig.dataSources?.find((candidate) =>
      candidate.id === reference.dataSourceId)
    if (!source) return undefined
    if (source.type === 'static') {
      return source.records.find((record) => record.id === reference.recordId)
    }
    try {
      const session = source.type === 'supabase' && source.requiresAuth
        ? await authSessionPromise
        : undefined
      if (source.type === 'supabase' && source.requiresAuth && !session) return undefined
      const request = source.type === 'supabase'
        ? dataRequest(source, reference.recordId, session)
        : null
      const response = source.type === 'supabase'
        ? await runtimeWindow.fetch(request!.url, request!.options)
        : await runtimeWindow.fetch(
          source.recordUrl.replace('{id}', encodeURIComponent(reference.recordId)),
        )
      if (!response.ok) return undefined
      const result = await response.json() as unknown
      if (Array.isArray(result)) return result[0]
      if (result && typeof result === 'object') {
        const data = (result as Record<string, unknown>).data
        if (data && !Array.isArray(data) && typeof data === 'object') return data
      }
      return result
    } catch {
      return undefined
    }
  }

  const dataSourceErrors = new Set<string>()

  async function resolveRecords(dataSourceId: string, range?: { limit: number; offset: number }) {
    const source = runtimeConfig.dataSources?.find((candidate) => candidate.id === dataSourceId)
    if (!source) {
      dataSourceErrors.add(dataSourceId)
      return []
    }
    if (source.type === 'static') {
      return range ? source.records.slice(range.offset, range.offset + range.limit) : source.records
    }
    if (source.type === 'rest' && !source.listUrl) return []
    try {
      const session = source.type === 'supabase' && source.requiresAuth
        ? await authSessionPromise
        : undefined
      if (source.type === 'supabase' && source.requiresAuth && !session) {
        dataSourceErrors.add(dataSourceId)
        return []
      }
      const request = source.type === 'supabase' ? dataRequest(source, undefined, session, range) : null
      const response = source.type === 'supabase'
        ? await runtimeWindow.fetch(request!.url, request!.options)
        : await runtimeWindow.fetch(source.listUrl!)
      if (!response.ok) {
        dataSourceErrors.add(dataSourceId)
        return []
      }
      dataSourceErrors.delete(dataSourceId)
      const result = await response.json() as unknown
      if (Array.isArray(result)) return source.type === 'rest' && range
        ? result.slice(range.offset, range.offset + range.limit)
        : result
      if (result && typeof result === 'object') {
        const object = result as Record<string, unknown>
        if (Array.isArray(object.data)) return source.type === 'rest' && range
          ? object.data.slice(range.offset, range.offset + range.limit)
          : object.data
        if (Array.isArray(object.records)) return source.type === 'rest' && range
          ? object.records.slice(range.offset, range.offset + range.limit)
          : object.records
      }
      return []
    } catch {
      dataSourceErrors.add(dataSourceId)
      return []
    }
  }

  function safeUrl(value: string, target: DataBinding['target']) {
    const normalized = value.trim().toLowerCase()
    if (normalized.startsWith('javascript:')) return false
    if (normalized.startsWith('data:')) {
      return target === 'src' && normalized.startsWith('data:image/')
    }
    return true
  }

  function applyBinding(element: HTMLElement, binding: DataBinding, value: string) {
    if (binding.target === 'text') element.textContent = value
    else if (binding.target === 'value' && 'value' in element) {
      (element as HTMLInputElement).value = value
    } else if (binding.target === 'ariaLabel') element.setAttribute('aria-label', value)
    else if (binding.target === 'src' || binding.target === 'href') {
      if (safeUrl(value, binding.target)) element.setAttribute(binding.target, value)
    } else {
      element.setAttribute(binding.target, value)
    }
  }

  function applyRecordToRoot(root: HTMLElement, contextKey: string, record: unknown) {
    const candidates = [root, ...root.querySelectorAll<HTMLElement>('[data-psl-element-id]')]
    for (const binding of runtimeConfig.bindings ?? []) {
      if (binding.pageId !== runtimeConfig.currentPage || binding.contextKey !== contextKey) continue
      const element = candidates.find((candidate) =>
        candidate.dataset.pslElementId === binding.elementId)
      const rawValue = fieldValue(record, binding.field) ?? binding.fallback
      if (element && rawValue !== undefined && rawValue !== null) {
        applyBinding(element, binding, String(rawValue))
      }
    }
  }

  async function applyRepeaters() {
    for (const repeater of runtimeConfig.repeaters ?? []) {
      if (repeater.pageId !== runtimeConfig.currentPage) continue
      const template = [...runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-element-id]')]
        .find((candidate) => candidate.dataset.pslElementId === repeater.elementId)
      if (!template) continue
      const pageSize = repeater.pageSize
      const usesPagination = Boolean(repeater.pagination && pageSize)
      const repeaterHost = template.parentElement
      const anchor = runtimeDocument.createComment(`psl-repeater:${repeater.id}`)
      template.parentNode?.insertBefore(anchor, template)
      template.remove()
      Array.from(repeaterHost?.children ?? []).forEach((element) => {
        if (element.getAttribute('data-psl-design-placeholder') === 'true') element.remove()
      })
      const controls = runtimeDocument.createElement('nav')
      controls.className = 'psl-data-pagination'
      controls.setAttribute('aria-label', 'Páginas de información')
      const previous = runtimeDocument.createElement('button')
      previous.type = 'button'
      previous.textContent = '← Anterior'
      const pageLabel = runtimeDocument.createElement('span')
      const next = runtimeDocument.createElement('button')
      next.type = 'button'
      next.textContent = 'Siguiente →'
      controls.append(previous, pageLabel, next)
      let currentPage = 0

      const renderPage = async () => {
        previous.disabled = true
        next.disabled = true
        const offset = pageSize ? currentPage * pageSize : 0
        const requestedLimit = pageSize ? pageSize + (usesPagination ? 1 : 0) : undefined
        const records = await resolveRecords(repeater.dataSourceId, requestedLimit
          ? { limit: requestedLimit, offset }
          : undefined)
        runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-repeater-instance]')
          .forEach((element) => {
            if (element.dataset.pslRepeaterInstance === repeater.id) element.remove()
          })
        const visibleRecords = pageSize ? records.slice(0, pageSize) : records
        const hasNextPage = Boolean(pageSize && records.length > pageSize)
        if (!visibleRecords.length) {
          const hasError = dataSourceErrors.has(repeater.dataSourceId)
          const status = runtimeDocument.createElement('div')
          status.dataset.pslRepeaterInstance = repeater.id
          status.dataset.pslDataStatus = hasError ? 'error' : 'empty'
          status.setAttribute('role', hasError ? 'alert' : 'status')
          status.textContent = hasError
              ? 'No se pudo cargar esta información.'
            : currentPage > 0 ? 'No hay más elementos para mostrar.' : 'Todavía no hay elementos para mostrar.'
          status.style.cssText = 'grid-column:1/-1;padding:1rem;text-align:center;opacity:.8;border:1px dashed currentColor;border-radius:.5rem'
          anchor.parentNode?.insertBefore(status, anchor)
        } else {
          visibleRecords.forEach((record) => {
            if (!record || typeof record !== 'object') return
            const recordId = (record as Record<string, unknown>).id
            if (typeof recordId !== 'string' && typeof recordId !== 'number') return
            const clone = template.cloneNode(true) as HTMLElement
            clone.dataset.pslRepeaterInstance = repeater.id
            clone.dataset.pslRecordId = String(recordId)
            clone.dataset.pslDataSourceId = repeater.dataSourceId
            applyRecordToRoot(clone, repeater.itemContext, record)
            anchor.parentNode?.insertBefore(clone, anchor)
          })
        }
        if (usesPagination) {
          pageLabel.textContent = `Página ${currentPage + 1}`
          previous.disabled = currentPage === 0
          next.disabled = !hasNextPage
          controls.hidden = currentPage === 0 && !hasNextPage
          if (!controls.isConnected && repeaterHost?.parentNode) {
            repeaterHost.parentNode.insertBefore(controls, repeaterHost.nextSibling)
          }
        }
      }
      previous.addEventListener('click', () => {
        if (currentPage === 0) return
        currentPage -= 1
        void renderPage()
      })
      next.addEventListener('click', () => {
        currentPage += 1
        void renderPage()
      })
      await renderPage()
    }
  }

  async function applyDataBindings() {
    const recordCache = new Map<string, Promise<unknown>>()
    const firstRecordCache = new Map<string, Promise<unknown>>()
    for (const binding of runtimeConfig.bindings ?? []) {
      if (binding.pageId !== runtimeConfig.currentPage) continue
      const reference = activeContext[binding.contextKey]
      let recordPromise: Promise<unknown> | undefined
      if (binding.sourceMode === 'first' && binding.dataSourceId) {
        recordPromise = firstRecordCache.get(binding.dataSourceId)
          ?? resolveRecords(binding.dataSourceId).then((records) => records[0])
        firstRecordCache.set(binding.dataSourceId, recordPromise)
      } else if (reference) {
        const cacheKey = `${reference.dataSourceId}:${reference.recordId}`
        recordPromise = recordCache.get(cacheKey) ?? resolveRecord(reference)
        recordCache.set(cacheKey, Promise.resolve(recordPromise))
      }
      if (!recordPromise) continue
      const record = await recordPromise
      const rawValue = fieldValue(record, binding.field) ?? binding.fallback
      if (rawValue === undefined || rawValue === null) continue
      const element = [...runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-element-id]')]
        .find((candidate) => candidate.dataset.pslElementId === binding.elementId)
      if (element) applyBinding(element, binding, String(rawValue))
    }
  }

  function setAuthStatus(root: Element, message: string, isError = false) {
    const status = root.querySelector<HTMLElement>('[data-psl-auth-status]')
    if (!status) return
    status.textContent = message
    status.setAttribute('role', isError ? 'alert' : 'status')
  }

  const authDisposers: Array<() => void> = []

  function installAuthControls() {
    runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-auth-tab]')
      .forEach((tab) => {
        const selectTab = (event: Event) => {
          event.preventDefault()
          const selected = tab.dataset.pslAuthTab
          const root = tab.closest('[data-psl-auth-visible="signed-out"]') ?? runtimeDocument
          root.querySelectorAll<HTMLElement>('[data-psl-auth-tab]')
            .forEach((candidate) => {
              const active = candidate.dataset.pslAuthTab === selected
              candidate.setAttribute('aria-selected', String(active))
              candidate.setAttribute('tabindex', active ? '0' : '-1')
            })
          root.querySelectorAll<HTMLElement>('[data-psl-auth-panel]')
            .forEach((panel) => {
              panel.hidden = panel.dataset.pslAuthPanel !== selected
            })
        }
        tab.addEventListener('click', selectTab)
        authDisposers.push(() => tab.removeEventListener('click', selectTab))
      })

    runtimeDocument.querySelectorAll<HTMLFormElement>('form[data-psl-auth-action]')
      .forEach((form) => {
        const submit = async (event: Event) => {
          event.preventDefault()
          const action = form.dataset.pslAuthAction
          if (action !== 'login' && action !== 'signup') return
          const data = new FormData(form)
          const email = String(data.get('email') ?? '').trim()
          const password = String(data.get('password') ?? '')
          if (!email || !password) {
            setAuthStatus(form, 'Escribe tu correo y contraseña.', true)
            return
          }
          setAuthStatus(form, action === 'login' ? 'Iniciando sesión…' : 'Creando cuenta…')
          try {
            const result = await authRequest(
              action === 'login' ? 'token?grant_type=password' : 'signup',
              { email, password },
            )
            const session = normalizedSession(result)
            if (!session) {
              setAuthStatus(form, 'Revisa tu correo para confirmar la cuenta.')
              return
            }
            saveSession(session)
            const destination = storedReturnPage()
              ?? runtimeConfig.authentication?.afterLoginPage
            saveReturnPage()
            if (destination) navigateToPage(destination, true)
            else runtimeWindow.location.reload()
          } catch (error) {
            setAuthStatus(form, error instanceof Error ? error.message : 'No se pudo continuar.', true)
          }
        }
        form.addEventListener('submit', submit)
        authDisposers.push(() => form.removeEventListener('submit', submit))
      })

    runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-auth-action="logout"]')
      .forEach((button) => {
        const logout = async (event: Event) => {
          event.preventDefault()
          const session = await authSessionPromise
          try {
            if (session) await authRequest('logout', undefined, session.access_token)
          } catch {
            // Local sign-out still completes if the session already expired.
          }
          saveSession()
          saveReturnPage()
          const destination = runtimeConfig.authentication?.afterLogoutPage
          if (destination) navigateToPage(destination, true)
          else runtimeWindow.location.reload()
        }
        button.addEventListener('click', logout)
        authDisposers.push(() => button.removeEventListener('click', logout))
      })

    void authSessionPromise.then((session) => {
      runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-auth-visible]')
        .forEach((element) => {
          const expected = element.dataset.pslAuthVisible
          element.hidden = expected === 'signed-in' ? !session : Boolean(session)
        })
      runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-auth-field]')
        .forEach((element) => {
          const field = element.dataset.pslAuthField
          const value = field && session?.user ? fieldValue(session.user, field) : undefined
          if (value !== undefined && value !== null) element.textContent = String(value)
        })
    })
  }

  function resolvedConnectionContext(
    connection: NavigationRuntimeConnection,
    sourceElement?: Element | null,
  ) {
    return Object.fromEntries(Object.entries(connection.context ?? {}).flatMap(([key, value]) => {
      if (value.recordId !== '$record.id') return [[key, value]]
      const recordRoot = sourceElement?.closest<HTMLElement>('[data-psl-record-id]')
      const recordId = recordRoot?.dataset.pslRecordId
      const dataSourceId = recordRoot?.dataset.pslDataSourceId ?? value.dataSourceId
      return recordId ? [[key, { dataSourceId, recordId }]] : []
    })) as NavigationContext
  }

  function sendMessage(connection: NavigationRuntimeConnection, context: NavigationContext) {
    const message: NavigationRuntimeMessage = {
      source: 'psl-navigation-runtime',
      action: connection.action,
      ...(connection.targetPage ? { targetPage: connection.targetPage } : {}),
      ...(connection.url ? { url: connection.url } : {}),
      ...(Object.keys(context).length ? { context } : {}),
    }
    runtimeWindow.parent.postMessage(message, '*')
  }

  function execute(connection: NavigationRuntimeConnection, sourceElement?: Element | null) {
    const context = resolvedConnectionContext(connection, sourceElement)
    if (runtimeConfig.transport === 'message') {
      sendMessage(connection, context)
      return
    }

    if (connection.action === 'navigate' && connection.targetPage) {
      const targetUrl = runtimeConfig.pageUrls[connection.targetPage]
      if (targetUrl) {
        const resolvedUrl = new URL(targetUrl, runtimeWindow.location.href)
        for (const [key, value] of Object.entries(context)) {
          resolvedUrl.searchParams.set(`${contextParameterPrefix}${key}`, JSON.stringify(value))
        }
        runtimeWindow.location.assign(resolvedUrl.href)
      }
      return
    }

    if (connection.action === 'back') {
      runtimeWindow.history.back()
      return
    }

    if (connection.action === 'url' && connection.url) {
      runtimeWindow.location.assign(connection.url)
    }
  }

  function handleClick(event: Event) {
    const eventTarget = event.target
    let element = eventTarget && typeof (eventTarget as Element).getAttribute === 'function'
      ? eventTarget as Element
      : null
    let connection: NavigationRuntimeConnection | undefined

    while (element && element !== runtimeDocument.body) {
      const elementId = element.getAttribute('data-psl-element-id')
      connection = runtimeConfig.connections.find((candidate) =>
        candidate.sourcePage === runtimeConfig.currentPage
          && candidate.elementId === elementId
          && candidate.event === 'click')
      if (connection) break
      element = element.parentElement
    }

    if (!connection) return
    event.preventDefault()
    event.stopPropagation()
    execute(connection, element)
  }

  runtimeDocument.addEventListener('click', handleClick, true)
  installAuthControls()
  void applyAuthPageGuard().then((allowed) => {
    if (allowed) return applyRepeaters().then(() => applyDataBindings())
    return undefined
  })
  return () => {
    runtimeDocument.removeEventListener('click', handleClick, true)
    authDisposers.forEach((dispose) => dispose())
  }
}

export function createNavigationRuntimeSource() {
  return `(${installNavigationRuntime.toString()})();\n`
}

export function createNavigationConfigSource(config: NavigationRuntimeConfig) {
  const serialized = JSON.stringify(config).replaceAll('<', '\\u003c')
  return `window.__PSL_NAVIGATION__ = ${serialized};\n`
}

export function isNavigationRuntimeMessage(value: unknown): value is NavigationRuntimeMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  if (message.source !== 'psl-navigation-runtime') return false
  if (message.action === 'back') return true
  if (message.action === 'navigate') {
    if (typeof message.targetPage !== 'string') return false
    if (message.context === undefined) return true
    if (!message.context || typeof message.context !== 'object') return false
    return Object.values(message.context).every((reference) => {
      if (!reference || typeof reference !== 'object') return false
      const candidate = reference as Record<string, unknown>
      return typeof candidate.dataSourceId === 'string'
        && typeof candidate.recordId === 'string'
    })
  }
  if (message.action === 'url') return typeof message.url === 'string'
  return false
}
