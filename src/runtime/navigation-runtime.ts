import type {
  DataBinding,
  DataRepeater,
  DataSource,
  NavigationContext,
  NavigationContextValue,
  ProjectAuthentication,
} from '../core/project'
import { AUTH_DESTINATION_ATTRIBUTE } from '../core/auth-components'

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
  const practiceVideoBucket = 'practice-reference-videos'

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
  const roleVisibleElements = [...runtimeDocument.querySelectorAll<HTMLElement>(
    '[data-psl-role-visible]',
  )]
  roleVisibleElements.forEach((element) => {
    element.hidden = true
  })

  async function currentUserRoles() {
    if (!roleVisibleElements.length) return new Set<string>()
    const session = await authSessionPromise
    if (!session) return new Set<string>()
    const source = runtimeConfig.dataSources?.find((candidate) =>
      candidate.name === 'user_roles'
      || (candidate.type === 'supabase' && candidate.table === 'user_roles'))
    if (!source) return new Set<string>()
    if (source.type === 'static') {
      return new Set(source.records.flatMap((record) =>
        typeof record.role === 'string' ? [record.role] : []))
    }
    if (source.type !== 'supabase') return new Set<string>()
    try {
      const request = dataRequest(source, undefined, session)
      if (!request) return new Set<string>()
      const response = await runtimeWindow.fetch(request.url, request.options)
      if (!response.ok) return new Set<string>()
      const result = await response.json() as unknown
      if (!Array.isArray(result)) return new Set<string>()
      return new Set(result.flatMap((record) => {
        if (!record || typeof record !== 'object') return []
        const role = (record as Record<string, unknown>).role
        return typeof role === 'string' ? [role] : []
      }))
    } catch {
      return new Set<string>()
    }
  }

  async function applyRoleVisibility() {
    const roles = await currentUserRoles()
    roleVisibleElements.forEach((element) => {
      const expected = element.dataset.pslRoleVisible
      element.hidden = !expected || !roles.has(expected)
    })
  }

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
    query?: { userFilterColumn?: string; includeUnpublished?: boolean },
  ) {
    if (source.type !== 'supabase') return null
    const url = new URL(
      `${source.projectUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(source.table)}`,
    )
    url.searchParams.set('select', '*')
    if (recordId !== undefined) url.searchParams.set('id', `eq.${recordId}`)
    if (source.publishedOnly && !query?.includeUnpublished) url.searchParams.set('published', 'eq.true')
    if (query?.userFilterColumn && session?.user?.id) {
      url.searchParams.set(query.userFilterColumn, `eq.${session.user.id}`)
    }
    if (source.orderColumn && recordId === undefined) {
      url.searchParams.set('order', `${source.orderColumn}.${source.orderDirection ?? 'asc'}`)
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
      const session = source.type === 'supabase'
        ? await authSessionPromise
        : undefined
      if (source.type === 'supabase' && source.requiresAuth && !session) return undefined
      const request = source.type === 'supabase'
        ? dataRequest(source, reference.recordId, session, undefined,
            session ? { includeUnpublished: true } : undefined)
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

  async function resolveRecords(
    dataSourceId: string,
    range?: { limit: number; offset: number },
    query?: { userFilterColumn?: string; includeUnpublished?: boolean },
  ) {
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
      const session = source.type === 'supabase' && (source.requiresAuth || query?.userFilterColumn)
        ? await authSessionPromise
        : undefined
      if (source.type === 'supabase' && (source.requiresAuth || query?.userFilterColumn) && !session) {
        dataSourceErrors.add(dataSourceId)
        return []
      }
      const request = source.type === 'supabase'
        ? dataRequest(source, undefined, session, range, query)
        : null
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

  async function resolvedBindingMediaUrl(binding: DataBinding, value: string) {
    if (/^https?:\/\//i.test(value)) return value
    const storageMatch = /^storage:\/\/([^/]+)\/(.+)$/i.exec(value)
    if (!storageMatch || !binding.dataSourceId) return undefined
    const source = runtimeConfig.dataSources?.find((candidate) => candidate.id === binding.dataSourceId)
    if (!source || source.type !== 'supabase') return undefined
    const session = await authSessionPromise
    const encodedPath = storageMatch[2].split('/').map((segment) => encodeURIComponent(segment)).join('/')
    const response = await runtimeWindow.fetch(
      `${source.projectUrl.replace(/\/$/, '')}/storage/v1/object/sign/${encodeURIComponent(storageMatch[1])}/${encodedPath}`,
      {
        method: 'POST',
        headers: {
          apikey: source.publishableKey,
          Authorization: `Bearer ${session?.access_token ?? source.publishableKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn: 3_600 }),
      },
    )
    if (!response.ok) return undefined
    const result = await response.json().catch(() => ({})) as Record<string, unknown>
    const signedPath = result.signedURL ?? result.signedUrl
    if (typeof signedPath !== 'string') return undefined
    return /^https?:\/\//i.test(signedPath)
      ? signedPath
      : `${source.projectUrl.replace(/\/$/, '')}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`
  }

  async function applyBinding(element: HTMLElement, binding: DataBinding, value: string) {
    if (binding.target === 'text') element.textContent = value
    else if (binding.target === 'value' && 'value' in element) {
      (element as HTMLInputElement).value = value
    } else if (binding.target === 'ariaLabel') element.setAttribute('aria-label', value)
    else if (binding.target === 'src' || binding.target === 'href') {
      const resolvedMedia = binding.target === 'src' ? await resolvedBindingMediaUrl(binding, value) : undefined
      if (binding.target === 'src' && /^storage:\/\//i.test(value) && !resolvedMedia) return
      const resolvedValue = resolvedMedia ?? value
      if (safeUrl(resolvedValue, binding.target)) element.setAttribute(binding.target, resolvedValue)
    } else {
      element.setAttribute(binding.target, value)
    }
  }

  async function applyRecordToRoot(root: HTMLElement, contextKey: string, record: unknown) {
    const candidates = [root, ...root.querySelectorAll<HTMLElement>('[data-psl-element-id]')]
    for (const binding of runtimeConfig.bindings ?? []) {
      if (binding.pageId !== runtimeConfig.currentPage || binding.contextKey !== contextKey) continue
      const element = candidates.find((candidate) =>
        candidate.dataset.pslElementId === binding.elementId)
      const rawValue = fieldValue(record, binding.field) ?? binding.fallback
      if (element && rawValue !== undefined && rawValue !== null) {
        await applyBinding(element, binding, String(rawValue))
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
        const records = await resolveRecords(
          repeater.dataSourceId,
          requestedLimit ? { limit: requestedLimit, offset } : undefined,
          {
            userFilterColumn: repeater.userFilterColumn,
            includeUnpublished: repeater.includeUnpublished,
          },
        )
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
            ? repeater.errorMessage ?? 'No se pudo cargar esta información.'
            : currentPage > 0
              ? 'No hay más elementos para mostrar.'
              : repeater.emptyMessage ?? 'Todavía no hay elementos para mostrar.'
          status.style.cssText = 'grid-column:1/-1;padding:1rem;text-align:center;opacity:.8;border:1px dashed currentColor;border-radius:.5rem'
          anchor.parentNode?.insertBefore(status, anchor)
        } else {
          for (const record of visibleRecords) {
            if (!record || typeof record !== 'object') continue
            const recordId = (record as Record<string, unknown>).id
            if (typeof recordId !== 'string' && typeof recordId !== 'number') continue
            const clone = template.cloneNode(true) as HTMLElement
            clone.dataset.pslRepeaterInstance = repeater.id
            clone.dataset.pslRecordId = String(recordId)
            clone.dataset.pslDataSourceId = repeater.dataSourceId
            await applyRecordToRoot(clone, repeater.itemContext, record)
            anchor.parentNode?.insertBefore(clone, anchor)
          }
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
        if (repeaterHost?.classList.contains('psl-data-carousel')) {
          repeaterHost.scrollLeft = 0
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
      if (binding.dataSourceId) applyMutationFormRecord(binding.dataSourceId, record)
      const rawValue = fieldValue(record, binding.field) ?? binding.fallback
      if (rawValue === undefined || rawValue === null) continue
      const element = [...runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-element-id]')]
        .find((candidate) => candidate.dataset.pslElementId === binding.elementId)
      if (element) await applyBinding(element, binding, String(rawValue))
    }
  }

  function setAuthStatus(root: Element, message: string, isError = false) {
    const status = root.querySelector<HTMLElement>('[data-psl-auth-status]')
    if (!status) return
    status.textContent = message
    status.setAttribute('role', isError ? 'alert' : 'status')
  }

  const authDisposers: Array<() => void> = []
  const mutationDisposers: Array<() => void> = []
  const wizardDisposers: Array<() => void> = []

  function setMutationStatus(root: Element, message: string, isError = false) {
    const status = root.querySelector<HTMLElement>('[data-psl-mutation-status]')
    if (!status) return
    status.textContent = message
    status.setAttribute('role', isError ? 'alert' : 'status')
  }

  function installPracticeWizards() {
    runtimeDocument.querySelectorAll<HTMLFormElement>('form[data-practice-wizard]')
      .forEach((form) => {
        const details = form.querySelector<HTMLElement>('[data-practice-step="details"]')
        const reference = form.querySelector<HTMLElement>('[data-practice-step="reference"]')
        const next = form.querySelector<HTMLButtonElement>('[data-practice-next]')
        const label = runtimeDocument.querySelector<HTMLElement>('[data-practice-step-label]')
        const pageHeader = runtimeDocument.querySelector<HTMLElement>('.create-editor-header')
        if (!details || !reference || !next) return

        const showStep = (step: 'details' | 'reference', moveFocus = true) => {
          const showingDetails = step === 'details'
          details.hidden = !showingDetails
          reference.hidden = showingDetails
          if (pageHeader) pageHeader.hidden = !showingDetails
          details.setAttribute('aria-hidden', String(!showingDetails))
          reference.setAttribute('aria-hidden', String(showingDetails))
          if (label) label.textContent = showingDetails
            ? 'Paso 1 de 2 · Información'
            : 'Paso 2 de 2 · Referencia'
          if (!moveFocus) return
          if (showingDetails) {
            form.querySelector<HTMLInputElement>('#practice-title')?.focus()
          } else {
            reference.querySelector<HTMLElement>('h2')?.focus()
          }
        }
        const continueToReference = () => {
          const fields = [...details.querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          >('input,select,textarea')]
          const invalid = fields.find((field) => !field.checkValidity())
          if (invalid) {
            invalid.reportValidity()
            invalid.focus()
            return
          }
          showStep('reference')
        }
        next.addEventListener('click', continueToReference)
        wizardDisposers.push(() => next.removeEventListener('click', continueToReference))
        showStep('details', false)
      })
  }

  function encodedStoragePath(path: string) {
    return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
  }

  async function uploadPracticeReferenceVideo(
    source: Extract<DataSource, { type: 'supabase' }>,
    session: AuthSession,
    userId: string,
    practiceId: string,
    file: File,
  ) {
    const allowedTypes = new Set(['video/mp4', 'video/webm', 'video/quicktime'])
    const mediaType = file.type.toLowerCase().split(';', 1)[0].trim()
    if (!allowedTypes.has(mediaType)) {
      throw new Error('Selecciona un video MP4, WebM o MOV.')
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new Error('El video supera el límite de 100 MB.')
    }
    const objectPath = `${userId}/${practiceId}/reference`
    const response = await runtimeWindow.fetch(
      `${source.projectUrl.replace(/\/$/, '')}/storage/v1/object/${encodeURIComponent(practiceVideoBucket)}/${encodedStoragePath(objectPath)}`,
      {
        method: 'POST',
        headers: {
          apikey: source.publishableKey,
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': mediaType,
          'x-upsert': 'true',
        },
        body: file,
      },
    )
    const result = await response.json().catch(() => ({})) as Record<string, unknown>
    if (!response.ok) {
      const detail = result.message ?? result.error
      throw new Error(typeof detail === 'string'
        ? `No se pudo subir el video: ${detail}`
        : 'No se pudo subir el video de referencia.')
    }
    return `storage://${practiceVideoBucket}/${objectPath}`
  }

  async function updatePracticeMediaUrl(
    source: Extract<DataSource, { type: 'supabase' }>,
    session: AuthSession,
    practiceId: string,
    mediaUrl: string,
  ) {
    const url = new URL(
      `${source.projectUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(source.table)}`,
    )
    url.searchParams.set('id', `eq.${practiceId}`)
    url.searchParams.set('select', '*')
    const response = await runtimeWindow.fetch(url.href, {
      method: 'PATCH',
      headers: {
        apikey: source.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ media_url: mediaUrl }),
    })
    const result = await response.json().catch(() => []) as unknown
    if (!response.ok) throw new Error('El video subió, pero no se pudo asociar con la práctica.')
    const updated = Array.isArray(result) ? result[0] : result
    if (!updated || typeof updated !== 'object') {
      throw new Error('El video subió, pero Supabase no devolvió la práctica actualizada.')
    }
    return updated
  }

  function applyMutationFormRecord(dataSourceId: string, record: unknown) {
    if (!record || typeof record !== 'object') return
    const source = runtimeConfig.dataSources?.find((candidate) => candidate.id === dataSourceId)
    if (!source) return
    runtimeDocument.querySelectorAll<HTMLFormElement>('form[data-psl-mutation-source]')
      .forEach((form) => {
        const sourceKey = form.dataset.pslMutationSource
        const matches = source.id === sourceKey
          || source.name === sourceKey
          || (source.type === 'supabase' && source.table === sourceKey)
        if (!matches) return
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          '[data-psl-mutation-field][name]',
        ).forEach((field) => {
          const value = fieldValue(record, field.name)
          if (value === undefined || value === null) return
          if (field instanceof HTMLInputElement && field.type === 'checkbox') {
            field.checked = Boolean(value)
          } else if (field.dataset.pslMutationType === 'json' && typeof value === 'object') {
            field.value = JSON.stringify(value)
          } else {
            field.value = String(value)
          }
          field.dispatchEvent(new Event('input', { bubbles: true }))
          field.dispatchEvent(new Event('change', { bubbles: true }))
        })
        const requiredTemplate = form.querySelector<HTMLInputElement>('[data-motion-template-field]')
        if (requiredTemplate?.value.trim()) {
          setMutationStatus(form, 'Práctica y referencia existentes cargadas.')
        }
      })
  }

  async function applySourceRecord(dataSourceId: string, record: unknown) {
    if (!record || typeof record !== 'object') return
    applyMutationFormRecord(dataSourceId, record)
    const elements = [...runtimeDocument.querySelectorAll<HTMLElement>('[data-psl-element-id]')]
    for (const binding of runtimeConfig.bindings ?? []) {
      if (binding.pageId !== runtimeConfig.currentPage
        || binding.dataSourceId !== dataSourceId) continue
      const rawValue = fieldValue(record, binding.field) ?? binding.fallback
      if (rawValue === undefined || rawValue === null) continue
      const element = elements.find((candidate) =>
        candidate.dataset.pslElementId === binding.elementId)
      if (element) await applyBinding(element, binding, String(rawValue))
    }
  }

  function installDataMutations() {
    runtimeDocument.querySelectorAll<HTMLFormElement>('form[data-psl-mutation-source]')
      .forEach((form) => {
        const formContextKey = form.dataset.pslMutationContext ?? 'record'
        const editingContext = form.dataset.pslMutationMode === 'context'
          ? activeContext[formContextKey]
          : undefined
        if (editingContext) {
          const mode = runtimeDocument.querySelector<HTMLElement>('[data-psl-editor-mode]')
          const title = runtimeDocument.querySelector<HTMLElement>('[data-psl-editor-title]')
          const description = runtimeDocument.querySelector<HTMLElement>('[data-psl-editor-description]')
          if (mode) mode.textContent = 'Editar'
          if (title) title.textContent = 'Editar práctica'
          if (description) description.textContent = 'Actualiza la información o la referencia de movimiento.'
        }
        const submit = async (event: Event) => {
          event.preventDefault()
          const sourceKey = form.dataset.pslMutationSource
          const source = runtimeConfig.dataSources?.find((candidate) =>
            candidate.id === sourceKey
              || candidate.name === sourceKey
              || (candidate.type === 'supabase' && candidate.table === sourceKey))
          if (!source || source.type !== 'supabase') {
            setMutationStatus(form, 'No se encontró la colección para guardar el perfil.', true)
            return
          }
          const filterField = form.dataset.pslMutationFilter
          const requestedMode = form.dataset.pslMutationMode
          const contextKey = form.dataset.pslMutationContext ?? 'record'
          const contextRecord = activeContext[contextKey]
          const mutationMode = requestedMode === 'insert'
            || (requestedMode === 'context' && !contextRecord)
            ? 'insert'
            : 'update'
          const session = await authSessionPromise
          const userId = session?.user && typeof session.user.id === 'string'
            ? session.user.id
            : undefined
          const filterValue = requestedMode === 'context'
            ? contextRecord?.recordId
            : userId
          if (!session || !userId
            || (mutationMode === 'update' && (!filterField || !filterValue))) {
            setMutationStatus(form, 'Tu sesión ya no está disponible. Vuelve a iniciar sesión.', true)
            return
          }
          const requiredTemplate = form.querySelector<HTMLInputElement>('[data-motion-template-field]')
          if (requiredTemplate && !requiredTemplate.value.trim()) {
            setMutationStatus(form, 'Graba y detén la referencia de movimiento antes de guardar.', true)
            return
          }
          const fields = [...form.querySelectorAll<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
          >('[data-psl-mutation-field][name]')]
          const parseValue = (field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement) => {
            const value = field.value.trim()
            if (!value) return null
            if (field.dataset.pslMutationType === 'json') return JSON.parse(value) as unknown
            if (field.dataset.pslMutationType === 'boolean') return value === 'true'
            if (field.dataset.pslMutationType === 'number'
              || (field instanceof HTMLInputElement && field.type === 'number')) return Number(value)
            return value
          }
          const values: Record<string, unknown> = Object.fromEntries(fields.flatMap((field) => {
            if (field instanceof HTMLInputElement
              && (field.type === 'checkbox' || field.type === 'radio')
              && !field.checked) return []
            return [[field.name, parseValue(field)]]
          }))
          const submitter = event instanceof SubmitEvent
            ? event.submitter as HTMLButtonElement | HTMLInputElement | null
            : null
          if (submitter?.name) {
            values[submitter.name] = submitter.dataset.pslMutationType === 'boolean'
              ? submitter.value === 'true'
              : submitter.value
          }
          const ownerField = form.dataset.pslMutationOwnerField
          if (mutationMode === 'insert' && ownerField) values[ownerField] = userId
          const videoInput = runtimeDocument.querySelector<HTMLInputElement & {
            __motionReferenceClip?: File
          }>('[data-motion-file]')
          const selectedVideo = videoInput?.files?.[0]
          const preparedReferenceClip = videoInput?.__motionReferenceClip
          if (selectedVideo && source.table === 'practices' && !preparedReferenceClip) {
            setMutationStatus(form, 'Analiza nuevamente el tramo del video antes de guardar.', true)
            return
          }
          if (!Object.keys(values).length) {
            setMutationStatus(form, 'No hay cambios para guardar.', true)
            return
          }
          const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]')
          if (submitButton) submitButton.disabled = true
          setMutationStatus(form, form.dataset.pslMutationPending
            ?? (mutationMode === 'insert' ? 'Guardando práctica…' : 'Guardando perfil…'))
          try {
            const url = new URL(
              `${source.projectUrl.replace(/\/$/, '')}/rest/v1/${encodeURIComponent(source.table)}`,
            )
            if (mutationMode === 'update' && filterField) {
              url.searchParams.set(filterField, `eq.${filterValue}`)
            }
            url.searchParams.set('select', '*')
            const response = await runtimeWindow.fetch(url.href, {
              method: mutationMode === 'insert' ? 'POST' : 'PATCH',
              headers: {
                apikey: source.publishableKey,
                Authorization: `Bearer ${session.access_token}`,
                'Content-Type': 'application/json',
                Prefer: 'return=representation',
              },
              body: JSON.stringify(values),
            })
            const result = await response.json().catch(() => []) as unknown
            if (!response.ok) {
              const object = result && typeof result === 'object'
                ? result as Record<string, unknown>
                : undefined
              const detail = object?.message ?? object?.details ?? object?.hint
              throw new Error(typeof detail === 'string'
                ? detail
                : 'Supabase no pudo guardar el perfil.')
            }
            let updated = Array.isArray(result) ? result[0] : result
            if (!updated || typeof updated !== 'object') {
              throw new Error('No se encontró el perfil de tu cuenta.')
            }
            if (selectedVideo && source.table === 'practices') {
              const practiceId = (updated as Record<string, unknown>).id
              if (typeof practiceId !== 'string') {
                throw new Error('Supabase no devolvió el identificador de la práctica.')
              }
              setMutationStatus(form, 'Subiendo solamente el tramo seleccionado…')
              const mediaUrl = await uploadPracticeReferenceVideo(
                source,
                session,
                userId,
                practiceId,
                preparedReferenceClip!,
              )
              updated = await updatePracticeMediaUrl(source, session, practiceId, mediaUrl)
            }
            await applySourceRecord(source.id, updated)
            setMutationStatus(form, form.dataset.pslMutationSuccess
              ?? (mutationMode === 'insert'
                ? 'Práctica guardada correctamente.'
                : 'Perfil guardado correctamente.'))
          } catch (error) {
            setMutationStatus(form,
              error instanceof Error
                ? error.message
                : mutationMode === 'insert'
                  ? 'No se pudo guardar la práctica.'
                  : 'No se pudo guardar el perfil.', true)
          } finally {
            if (submitButton) submitButton.disabled = false
          }
        }
        form.addEventListener('submit', submit)
        mutationDisposers.push(() => form.removeEventListener('submit', submit))
      })
  }

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
            const metadata = Object.fromEntries(
              [...form.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
                '[data-psl-auth-metadata][name]',
              )].flatMap((field) => {
                if (field instanceof HTMLInputElement
                  && (field.type === 'radio' || field.type === 'checkbox')
                  && !field.checked) return []
                const value = field.value.trim()
                return field.name && value ? [[field.name, value]] : []
              }),
            )
            const result = await authRequest(
              action === 'login' ? 'token?grant_type=password' : 'signup',
              {
                email,
                password,
                ...(action === 'signup' && Object.keys(metadata).length ? { data: metadata } : {}),
              },
            )
            const session = normalizedSession(result)
            if (!session) {
              setAuthStatus(form, 'Revisa tu correo para confirmar la cuenta.')
              return
            }
            saveSession(session)
            const destination = form.getAttribute(AUTH_DESTINATION_ATTRIBUTE)?.trim()
              || storedReturnPage()
              || runtimeConfig.authentication?.afterLoginPage
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
          const destination = button.getAttribute(AUTH_DESTINATION_ATTRIBUTE)?.trim()
            || runtimeConfig.authentication?.afterLogoutPage
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
    // Keep the selected record while a multi-page activity advances. A later
    // connection may add or replace context keys without losing the rest.
    const context = { ...activeContext, ...resolvedConnectionContext(connection, sourceElement) }
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
  installPracticeWizards()
  installDataMutations()
  void applyAuthPageGuard().then((allowed) => {
    if (allowed) return applyRoleVisibility()
      .then(() => applyRepeaters())
      .then(() => applyDataBindings())
    return undefined
  })
  return () => {
    runtimeDocument.removeEventListener('click', handleClick, true)
    authDisposers.forEach((dispose) => dispose())
    mutationDisposers.forEach((dispose) => dispose())
    wizardDisposers.forEach((dispose) => dispose())
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
