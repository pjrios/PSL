import { useEffect, useRef, useState } from 'react'
import grapesjs from 'grapesjs'
import type { Block, Button, Component, Device, Editor, ProjectData } from 'grapesjs'
import blocksBasic from 'grapesjs-blocks-basic'
import pluginForms from 'grapesjs-plugin-forms'
import navbar from 'grapesjs-navbar'
import presetWebpage from 'grapesjs-preset-webpage'
import tabs from 'grapesjs-tabs'
import touch from 'grapesjs-touch'
import imageEditor from 'grapesjs-tui-image-editor'
import 'grapesjs/dist/css/grapes.min.css'
import { loadEditorProjectData, saveEditorProjectData } from '../editor-platform'
import type { EditorProjectData } from '../editor-platform'
import {
  FLOW_ACTION_ATTRIBUTE,
  FLOW_TARGET_ATTRIBUTE,
  readScreenFlowConnection,
  screenFlowAttributes,
} from './flow-connections'
import { createPreviewController } from './preview-controller'
import { editorProjectBundle, exportEditorProject } from './export-project'
import { EditorRuntimePreview } from './EditorRuntimePreview'
import type { EditorPreviewViewport } from './EditorRuntimePreview'
import {
  applyEditorPreviewAction,
  createEditorPreviewSession,
} from './editor-preview-session'
import type { EditorPreviewSession } from './editor-preview-session'
import type { MotionReferenceRuntimeMessage } from '../runtime/motion-runtime'
import {
  DATA_BIND_FIELD_ATTRIBUTE,
  DATA_BIND_TARGET_ATTRIBUTE,
  DATA_SOURCE_ATTRIBUTE,
  DATA_REPEATER_ATTRIBUTE,
  DATA_SCOPE_ATTRIBUTE,
  normalizedSupabaseConfig,
  storeSupabaseConfig,
} from './supabase-data'
import type { SupabaseEditorConfig } from './supabase-data'
import { SupabaseDataPanel } from './SupabaseDataPanel'
import type { DataComponentEditRequest } from './SupabaseDataPanel'
import {
  createDataComponentMarkup,
  DATA_COMPONENT_ATTRIBUTE,
  DATA_DESIGN_PLACEHOLDER_ATTRIBUTE,
  DATA_DESIGN_PREVIEW_COUNT_ATTRIBUTE,
  DATA_PAGE_SIZE_ATTRIBUTE,
  DATA_PAGINATION_ATTRIBUTE,
  dataComponentStyles,
  findDataComponentRoot,
  readDataComponentSettings,
} from './data-component-templates'
import type {
  DataComponentMapping,
  DataComponentOptions,
  DataComponentTemplateId,
} from './data-component-templates'
import { PageImportDialog } from './PageImportDialog'
import { PageRenameDialog } from './PageRenameDialog'
import { prepareImportedPage } from './page-import'
import type { ImportedPageDraft } from './page-import'
import { TemplateGalleryDialog } from './TemplateGalleryDialog'
import { pageTemplateById } from './page-templates'
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  clampCanvasZoom,
  stepCanvasZoom,
} from './canvas-viewport'
import type { CanvasZoomMode } from './canvas-viewport'
import { attachCanvasGestures } from './canvas-gestures'
import {
  createMotionAnalysisPlugin,
  findMotionActivityComponent,
  MOTION_CAPTURE_REFERENCE_BLOCK_ID,
  MOTION_COMPARE_BLOCK_ID,
  MOTION_ANALYSIS_BLOCK_ID,
  MOTION_VIEW_REFERENCE_BLOCK_ID,
} from './motion-analysis'
import { MotionPanel, MotionSettingsDialog } from './MotionPanel'

function normalizedGrapesProjectData(value: Record<string, unknown>): ProjectData {
  return {
    ...value,
    assets: Array.isArray(value.assets) ? value.assets : [],
    dataSources: Array.isArray(value.dataSources) ? value.dataSources : [],
    pages: Array.isArray(value.pages) ? value.pages : [],
    styles: Array.isArray(value.styles) ? value.styles : [],
    symbols: Array.isArray(value.symbols) ? value.symbols : [],
  }
}

type ElementSummary = {
  bindingField?: string
  bindingTarget?: string
  bindingScope?: 'context' | 'first'
  dataSourceTableId?: string
  inheritedRepeaterTableId?: string
  isRepeater: boolean
  label: string
  tag: string
  targetPageId?: string
  repeaterTableId?: string
}

type CanvasViewState = {
  coords: { x: number; y: number }
  mode: CanvasZoomMode
  zoom: number
}

const DATA_COMPONENT_BLOCK_ID = 'psl-data-component'
const GUEST_PROJECT_STORAGE_KEY = 'psl-editor-guest-project-v1'
const BLANK_PAGE = { id: 'page-1', name: 'Página 1', component: '' } as const
const EMPTY_SUPABASE_CONFIG: SupabaseEditorConfig = {
  projectUrl: '',
  publishableKey: '',
  tables: [],
}
const SUPABASE_BLOCK_ICONS = {
  login: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="19" cy="15" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M7 39c1-8 5-12 12-12 4 0 7 1 9 4M31 17h12m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/></svg>',
  signup: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="18" cy="15" r="7" fill="none" stroke="currentColor" stroke-width="3"/><path d="M6 39c1-8 5-12 12-12 6 0 10 3 12 9M37 16v12m-6-6h12" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="3"/></svg>',
  logout: '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M25 8H10v32h15M20 24h23m-7-7 7 7-7 7" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/></svg>',
  email: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="10" width="38" height="28" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="m7 14 17 13 17-13" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="3"/></svg>',
  data: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="8" width="38" height="32" rx="4" fill="none" stroke="currentColor" stroke-width="3"/><path d="M5 18h38M16 18v22M29 18v22" fill="none" stroke="currentColor" stroke-width="3"/></svg>',
} as const

function loadGuestProjectData(): EditorProjectData {
  const saved = JSON.parse(localStorage.getItem(GUEST_PROJECT_STORAGE_KEY) ?? 'null') as EditorProjectData | null
  return saved && typeof saved === 'object' ? saved : {}
}

function saveGuestProjectData(projectData: EditorProjectData) {
  localStorage.setItem(GUEST_PROJECT_STORAGE_KEY, JSON.stringify(projectData))
}

function summarizeComponent(component?: Component | null): ElementSummary | null {
  if (!component) return null

  const tag = String(component.get('tagName') || component.get('type') || 'element').toUpperCase()
  const attributes = component.getAttributes()
  const content = component.get('content')
  const element = component.getEl()
  const directText = element
    ? Array.from(element.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim())
      .filter(Boolean)
      .join(' ')
    : ''
  const rawLabel = attributes['aria-label']
    || attributes.alt
    || attributes.title
    || (typeof content === 'string' ? content.replace(/<[^>]+>/g, ' ') : '')
    || directText
    || component.getName()
    || tag
  const label = String(rawLabel).replace(/\s+/g, ' ').trim()
  const flowConnection = readScreenFlowConnection(attributes)
  let ancestor = component.parent()
  let inheritedRepeaterTableId: string | undefined
  while (ancestor && !inheritedRepeaterTableId) {
    const value = ancestor.getAttributes()[DATA_REPEATER_ATTRIBUTE]
    if (typeof value === 'string' && value !== 'true') inheritedRepeaterTableId = value
    ancestor = ancestor.parent()
  }

  return {
    tag,
    label: label.length > 48 ? `${label.slice(0, 47)}…` : label,
    bindingField: typeof attributes[DATA_BIND_FIELD_ATTRIBUTE] === 'string'
      ? attributes[DATA_BIND_FIELD_ATTRIBUTE] as string
      : undefined,
    bindingTarget: typeof attributes[DATA_BIND_TARGET_ATTRIBUTE] === 'string'
      ? attributes[DATA_BIND_TARGET_ATTRIBUTE] as string
      : undefined,
    bindingScope: attributes[DATA_SCOPE_ATTRIBUTE] === 'first' ? 'first' : 'context',
    dataSourceTableId: typeof attributes[DATA_SOURCE_ATTRIBUTE] === 'string'
      ? attributes[DATA_SOURCE_ATTRIBUTE] as string
      : undefined,
    isRepeater: typeof attributes[DATA_REPEATER_ATTRIBUTE] === 'string',
    inheritedRepeaterTableId,
    repeaterTableId: typeof attributes[DATA_REPEATER_ATTRIBUTE] === 'string'
      && attributes[DATA_REPEATER_ATTRIBUTE] !== 'true'
      ? attributes[DATA_REPEATER_ATTRIBUTE] as string
      : undefined,
    ...(flowConnection ? { targetPageId: flowConnection.targetPageId } : {}),
  }
}

function positionColorPicker() {
  requestAnimationFrame(() => {
    const picker = document.querySelector<HTMLElement>('.visual-editor-color-picker:not(.sp-hidden)')
    const trigger = document.querySelector<HTMLElement>('.sp-replacer.sp-active')
    if (!picker) return

    const triggerRect = trigger?.getBoundingClientRect()
    const pickerHeight = picker.getBoundingClientRect().height
    const idealTop = triggerRect ? triggerRect.bottom - pickerHeight : 96
    const top = Math.min(Math.max(56, idealTop), window.innerHeight - pickerHeight - 12)
    picker.style.setProperty('--picker-top', `${top}px`)
  })
}

function ensureDataDesignPlaceholders(editor: Editor) {
  let changedCount = 0
  editor.Pages.getAll().forEach((page) => {
    page.getMainComponent().find([
      `[${DATA_COMPONENT_ATTRIBUTE}] video.psl-data-card__media`,
      `[${DATA_COMPONENT_ATTRIBUTE}] video.psl-data-list__media`,
      `[${DATA_COMPONENT_ATTRIBUTE}] video.psl-data-featured__media`,
    ].join(',')).forEach((video) => {
      const attributes = video.getAttributes()
      if (attributes.controls !== undefined) {
        video.removeAttributes('controls')
        changedCount += 1
      }
      const thumbnailAttributes = {
        'aria-hidden': 'true',
        muted: '',
        playsinline: '',
        preload: 'metadata',
        tabindex: '-1',
      }
      if (Object.entries(thumbnailAttributes).some(([name, value]) => attributes[name] !== value)) {
        video.addAttributes(thumbnailAttributes)
        changedCount += 1
      }
    })
    page.getMainComponent().find(`[${DATA_REPEATER_ATTRIBUTE}]`).forEach((template) => {
      const parent = template.parent()
      if (!parent) return
      const requestedPageSize = Number.parseInt(String(template.getAttributes()[DATA_PAGE_SIZE_ATTRIBUTE] ?? ''), 10)
      if (!Number.isInteger(requestedPageSize) || requestedPageSize < 2 || requestedPageSize > 100) return
      const requestedPreviewCount = Number.parseInt(String(
        template.getAttributes()[DATA_DESIGN_PREVIEW_COUNT_ATTRIBUTE] ?? '',
      ), 10)
      const fallbackPreviewCount = parent.getClasses().includes('psl-data-carousel')
        ? 4
        : parent.getClasses().includes('psl-data-list') ? 2 : 8
      const previewCount = Number.isInteger(requestedPreviewCount)
        && requestedPreviewCount > 0
        && requestedPreviewCount <= 12
        ? Math.min(requestedPageSize, requestedPreviewCount)
        : Math.min(requestedPageSize, fallbackPreviewCount)
      if (String(template.getAttributes()[DATA_DESIGN_PREVIEW_COUNT_ATTRIBUTE] ?? '') !== String(previewCount)) {
        template.addAttributes({ [DATA_DESIGN_PREVIEW_COUNT_ATTRIBUTE]: String(previewCount) })
        changedCount += 1
      }
      const existingPlaceholders = parent.components().models.filter((component) =>
        component.getAttributes()[DATA_DESIGN_PLACEHOLDER_ATTRIBUTE] === 'true')
      existingPlaceholders.slice(Math.max(0, previewCount - 1)).forEach((placeholder) => {
        placeholder.remove()
        changedCount += 1
      })
      const retainedPlaceholders = existingPlaceholders.slice(0, Math.max(0, previewCount - 1))
      retainedPlaceholders.forEach((placeholder) => {
        if (placeholder.getAttributes()['aria-hidden'] !== undefined) {
          placeholder.removeAttributes('aria-hidden')
          changedCount += 1
        }
      })
      const missingCount = Math.max(0, previewCount - 1 - retainedPlaceholders.length)
      Array.from({ length: missingCount }).forEach(() => {
        const placeholder = template.clone()
        const boundElements = [placeholder, ...placeholder.find(`[${DATA_BIND_FIELD_ATTRIBUTE}]`)]
        boundElements.forEach((component) => component.removeAttributes([
          DATA_BIND_FIELD_ATTRIBUTE,
          DATA_BIND_TARGET_ATTRIBUTE,
          DATA_SOURCE_ATTRIBUTE,
          DATA_SCOPE_ATTRIBUTE,
        ]))
        const interactiveElements = [placeholder, ...placeholder.find(`[${FLOW_ACTION_ATTRIBUTE}]`)]
        interactiveElements.forEach((component) => component.removeAttributes([
          FLOW_ACTION_ATTRIBUTE,
          FLOW_TARGET_ATTRIBUTE,
        ]))
        placeholder.removeAttributes([
          DATA_REPEATER_ATTRIBUTE,
          DATA_PAGE_SIZE_ATTRIBUTE,
          DATA_PAGINATION_ATTRIBUTE,
          DATA_DESIGN_PREVIEW_COUNT_ATTRIBUTE,
        ])
        placeholder.addAttributes({
          [DATA_DESIGN_PLACEHOLDER_ATTRIBUTE]: 'true',
        })
        parent.append(placeholder)
        changedCount += 1
      })
    })
  })
  return changedCount
}

const EDITOR_VIEWPORT_GUARD_ATTRIBUTE = 'data-psl-editor-viewport-guard'
const DEFAULT_EDITOR_VIEWPORT_HEIGHT_CAP = 720

export function installEditorCanvasLayoutGuards(
  document: Document,
  heightCap = DEFAULT_EDITOR_VIEWPORT_HEIGHT_CAP,
) {
  const window = document.defaultView
  const body = document.body
  if (!window || !body) return 0

  let style = document.head.querySelector<HTMLStyleElement>('style[data-psl-editor-layout-guards]')
  if (!style) {
    style = document.createElement('style')
    style.dataset.pslEditorLayoutGuards = 'true'
    document.head.append(style)
  }
  style.textContent = `
    ${dataComponentStyles}
    :root {
      --psl-editor-viewport-height: ${heightCap}px !important;
      --psl-editor-data-card-height: 320px;
      --psl-editor-data-list-height: 180px;
    }
    html,
    body {
      min-height: var(--psl-editor-viewport-height) !important;
    }
    :where(.demo-page, .screen, .tpl-wrap, .tpl-dash-side, .psl-auth-page, .psl-auth-brand, .psl-auth-content, .lsp-page) {
      min-height: var(--psl-editor-viewport-height) !important;
    }
    [${EDITOR_VIEWPORT_GUARD_ATTRIBUTE}] {
      min-height: var(--psl-editor-viewport-height) !important;
    }
    .psl-data-grid {
      max-height: calc(var(--psl-editor-data-card-height) + var(--psl-editor-data-card-height) + 3.25rem) !important;
      overflow: hidden !important;
    }
    .psl-data-grid > .psl-data-card,
    .psl-data-carousel > .psl-data-carousel__item {
      height: var(--psl-editor-data-card-height) !important;
    }
    .psl-data-card__media {
      height: 170px !important;
      aspect-ratio: auto !important;
    }
    .psl-data-card__content {
      max-height: 150px !important;
      overflow: hidden !important;
    }
    .psl-data-item--without-media > .psl-data-card__content {
      max-height: var(--psl-editor-data-card-height) !important;
    }
    .psl-data-card__content h2,
    .psl-data-card__content h3,
    .psl-data-card__content p {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
    }
    .psl-data-card__content h2,
    .psl-data-card__content h3 { -webkit-line-clamp: 2; }
    .psl-data-card__content p { -webkit-line-clamp: 3; }
    .psl-data-list {
      max-height: calc(var(--psl-editor-data-list-height) + var(--psl-editor-data-list-height) + 3rem) !important;
      overflow: hidden !important;
    }
    .psl-data-list > .psl-data-list__item {
      height: var(--psl-editor-data-list-height) !important;
      overflow: hidden !important;
    }
    .psl-data-list__media {
      height: 146px !important;
      aspect-ratio: auto !important;
    }
    .psl-data-list__content p {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 3;
    }
    .psl-data-carousel {
      display: grid !important;
      grid-template-columns: repeat(var(--psl-data-cols-desktop, 4), minmax(0, 1fr)) !important;
      max-height: calc(var(--psl-editor-data-card-height) + 2rem) !important;
      overflow: hidden !important;
    }
    .psl-data-carousel > .psl-data-carousel__item {
      width: auto !important;
      min-width: 0 !important;
    }
    @media (max-width: 900px) {
      .psl-data-carousel {
        grid-template-columns: repeat(var(--psl-data-cols-tablet, 3), minmax(0, 1fr)) !important;
      }
    }
    @media (max-width: 600px) {
      .psl-data-carousel {
        grid-template-columns: repeat(var(--psl-data-cols-mobile, 1), minmax(0, 1fr)) !important;
      }
    }
    @supports (container-type: inline-size) {
      @container psl-data-component (max-width: 900px) {
        .psl-data-carousel {
          grid-template-columns: repeat(var(--psl-data-cols-tablet, 3), minmax(0, 1fr)) !important;
        }
      }
      @container psl-data-component (max-width: 600px) {
        .psl-data-carousel {
          grid-template-columns: repeat(var(--psl-data-cols-mobile, 1), minmax(0, 1fr)) !important;
        }
      }
    }
    .psl-data-featured {
      height: 420px !important;
      overflow: hidden !important;
    }
  `

  const viewportHeight = window.innerHeight
  const runawayMinimum = Math.max(heightCap * 2, viewportHeight * 0.9)
  const normalizedPageShells = body.querySelectorAll('.lsp-page').length

  let guardedCount = 0
  ;[body, ...Array.from(body.querySelectorAll<HTMLElement>('*'))].forEach((element) => {
    const minHeight = Number.parseFloat(window.getComputedStyle(element).minHeight)
    if (!Number.isFinite(minHeight) || minHeight < runawayMinimum) return
    element.setAttribute(EDITOR_VIEWPORT_GUARD_ATTRIBUTE, 'true')
    guardedCount += 1
  })
  return guardedCount + normalizedPageShells
}

function findPreviewButton(editor: Editor): Button | null {
  const directButton = editor.Panels.getButton('options', 'preview')
    ?? editor.Panels.getButton('options', 'core:preview')
  if (directButton) return directButton

  const buttons = editor.Panels.getPanel('options')?.get('buttons') as {
    find: (predicate: (button: Button) => boolean) => Button | undefined
  } | undefined
  return buttons?.find((button) => {
    const command = button.get('command')
    return command === 'preview' || command === 'core:preview' || command === 'psl-preview'
  }) ?? null
}

function floatingMenuPosition(buttonRect: DOMRect, menuWidth: number, menuHeight: number) {
  const viewportMargin = 8
  const left = Math.min(
    window.innerWidth - menuWidth - viewportMargin,
    Math.max(viewportMargin, buttonRect.right - menuWidth),
  )
  const preferredTop = buttonRect.bottom + 3
  const top = preferredTop + menuHeight <= window.innerHeight - viewportMargin
    ? preferredTop
    : Math.max(viewportMargin, buttonRect.top - menuHeight - 3)
  return { left, top }
}

export function OpenSourceEditor({ accountEmail, editorProjectId, isGuest = false, onSignOut }: {
  accountEmail: string
  editorProjectId: string
  isGuest?: boolean
  onSignOut: () => Promise<void>
}) {
  const canvasRef = useRef<HTMLDivElement>(null)
  const canvasColumnRef = useRef<HTMLElement>(null)
  const blocksRef = useRef<HTMLDivElement>(null)
  const layersRef = useRef<HTMLDivElement>(null)
  const nativeDevicesRef = useRef<HTMLDivElement>(null)
  const nativeOptionsRef = useRef<HTMLDivElement>(null)
  const stylesRef = useRef<HTMLDivElement>(null)
  const traitsRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<Editor | null>(null)
  const previewControllerRef = useRef<ReturnType<typeof createPreviewController> | null>(null)
  const canvasZoomModeRef = useRef<CanvasZoomMode>('fit')
  const canvasViewsRef = useRef(new Map<string, CanvasViewState>())
  const currentCanvasDeviceRef = useRef('desktop')
  const editingDataComponentRef = useRef<Component | null>(null)
  const panToolLockedRef = useRef(false)
  const initialSupabaseConfigRef = useRef(EMPTY_SUPABASE_CONFIG)
  const supabaseConfigRef = useRef(initialSupabaseConfigRef.current)
  const [error, setError] = useState<string | null>(null)
  const [pages, setPages] = useState<Array<{ id: string; name: string }>>([
    { id: BLANK_PAGE.id, name: BLANK_PAGE.name },
  ])
  const [activePageId, setActivePageId] = useState<string>(BLANK_PAGE.id)
  const [rightPanel, setRightPanel] = useState<'styles' | 'properties' | 'motion' | 'flow' | 'data'>('styles')
  const [blocksOpen, setBlocksOpen] = useState(false)
  const [dataComponentEditRequest, setDataComponentEditRequest] = useState<DataComponentEditRequest | null>(null)
  const [dataComponentRequest, setDataComponentRequest] = useState(0)
  const [createMenuOpen, setCreateMenuOpen] = useState(false)
  const [createMenuPosition, setCreateMenuPosition] = useState({ left: 0, top: 0 })
  const [pageMenuId, setPageMenuId] = useState<string | null>(null)
  const [pageMenuPosition, setPageMenuPosition] = useState({ left: 0, top: 0 })
  const [pageImportOpen, setPageImportOpen] = useState(false)
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false)
  const [renamingPage, setRenamingPage] = useState<{ id: string; name: string } | null>(null)
  const [selectedElement, setSelectedElement] = useState<ElementSummary | null>(null)
  const [selectedMotionComponent, setSelectedMotionComponent] = useState<Component | null>(null)
  const [motionNotice, setMotionNotice] = useState('')
  const [motionDialogOpen, setMotionDialogOpen] = useState(false)
  const [flowTargetPageId, setFlowTargetPageId] = useState('')
  const [flowNotice, setFlowNotice] = useState('')
  const [previewActive, setPreviewActive] = useState(false)
  const [canvasZoom, setCanvasZoom] = useState(100)
  const [canvasZoomMode, setCanvasZoomMode] = useState<CanvasZoomMode>('fit')
  const [panToolActive, setPanToolActive] = useState(false)
  const [previewSession, setPreviewSession] = useState<EditorPreviewSession | null>(null)
  const [previewViewport, setPreviewViewport] = useState<EditorPreviewViewport>({
    label: 'Escritorio',
    width: '100%',
  })
  const [supabaseConfig, setSupabaseConfig] = useState(initialSupabaseConfigRef.current)

  useEffect(() => {
    if (
      !canvasRef.current
      || !blocksRef.current
      || !layersRef.current
      || !nativeDevicesRef.current
      || !nativeOptionsRef.current
      || !stylesRef.current
      || !traitsRef.current
      || editorRef.current
    ) return

    let canvasResizeObserver: ResizeObserver | undefined
    const canvasDoubleClickCleanups: Array<() => void> = []
    const canvasDoubleClickDocuments = new WeakSet<Document>()
    try {
      const editorAccountStoragePlugin = (editor: Editor) => {
        editor.Storage.add('editor-account', {
          async load() {
            try {
              const projectData = isGuest
                ? loadGuestProjectData()
                : await loadEditorProjectData(editorProjectId)
              if (projectData.supabaseConfig) {
                const nextConfig = normalizedSupabaseConfig(
                  projectData.supabaseConfig as unknown as SupabaseEditorConfig,
                )
                supabaseConfigRef.current = nextConfig
                setSupabaseConfig(nextConfig)
                storeSupabaseConfig(nextConfig)
              }

              if (projectData.grapesjs && Object.keys(projectData.grapesjs).length > 0) {
                return normalizedGrapesProjectData(projectData.grapesjs)
              }

              const nextConfig = normalizedSupabaseConfig(EMPTY_SUPABASE_CONFIG)
              supabaseConfigRef.current = nextConfig
              setSupabaseConfig(nextConfig)
              storeSupabaseConfig(nextConfig)
            } catch (cause: unknown) {
              setError(cause instanceof Error ? cause.message : 'No se pudo cargar el proyecto guardado.')
            }

            return editor.getProjectData()
          },
          async store(data) {
            try {
              const projectData = {
                grapesjs: data as Record<string, unknown>,
                supabaseConfig: supabaseConfigRef.current as unknown as Record<string, unknown>,
              }
              if (isGuest) saveGuestProjectData(projectData)
              else await saveEditorProjectData(editorProjectId, projectData)
            } catch (cause: unknown) {
              setError(cause instanceof Error ? cause.message : isGuest
                ? 'No se pudo guardar el proyecto en este navegador.'
                : 'No se pudo guardar el proyecto en tu cuenta.')
            }
            return data
          },
        })
      }

      const editor = grapesjs.init({
        container: canvasRef.current,
        height: '100%',
        width: 'auto',
        panels: { defaults: [] },
        blockManager: {
          appendTo: blocksRef.current,
          appendOnClick: true,
        },
        layerManager: { appendTo: layersRef.current },
        styleManager: { appendTo: stylesRef.current },
        traitManager: { appendTo: traitsRef.current },
        colorPicker: {
          appendTo: document.body,
          containerClassName: 'gjs-editor-sp visual-editor-color-picker',
          show: positionColorPicker,
        },
        canvas: {
          infiniteCanvas: true,
        },
        deviceManager: {
          default: 'desktop',
          devices: [
            { id: 'desktop', name: 'Desktop', width: '1280px' },
            { id: 'tablet', name: 'Tablet', width: '768px', widthMedia: '991px' },
            { id: 'mobilePortrait', name: 'Mobile portrait', width: '390px', widthMedia: '767px' },
          ],
        },
        storageManager: {
          type: 'editor-account',
          autosave: true,
          autoload: true,
          stepsBeforeSave: 1,
        },
        plugins: [
          editorAccountStoragePlugin,
          createMotionAnalysisPlugin(),
          presetWebpage,
          blocksBasic,
          pluginForms,
          navbar,
          tabs,
          imageEditor,
          touch,
        ],
        pluginsOpts: {
          [presetWebpage as unknown as string]: {
            useCustomTheme: false,
            showStylesOnChange: false,
          },
          [blocksBasic as unknown as string]: {
            flexGrid: true,
          },
          [tabs as unknown as string]: {
            tabsBlock: { category: 'Extra' },
          },
          [imageEditor as unknown as string]: {
            labelImageEditor: 'Editar imagen',
            labelApply: 'Aplicar',
            config: {
              includeUI: { initMenu: 'filter' },
            },
          },
        },
        pageManager: {
          pages: [BLANK_PAGE],
        },
        style: '',
        assetManager: {
          assets: [],
          uploadFile: (event) => {
            const uploadEvent = event as unknown as {
              dataTransfer?: DataTransfer | null
              target?: { files?: FileList | null }
            }
            const files = uploadEvent.dataTransfer?.files ?? uploadEvent.target?.files

            Array.from(files ?? []).forEach((file) => {
              if (!file.type.startsWith('image/')) return
              const reader = new FileReader()
              reader.onload = () => {
                if (typeof reader.result === 'string') {
                  editorRef.current?.Assets.add({
                    name: file.name,
                    src: reader.result,
                  })
                }
              }
              reader.readAsDataURL(file)
            })
          },
        },
      })

      editorRef.current = editor
      editor.Pages.select(BLANK_PAGE.id)
      editor.BlockManager.get('tabs')?.set('category', 'Extra')

      const authFormStyle = 'display:grid;gap:12px;max-width:420px;padding:24px;background:#fff;border:1px solid #d8e3e1;border-radius:12px'
      const authInputStyle = 'width:100%;min-height:42px;padding:0 12px;border:1px solid #b8c9c6;border-radius:7px'
      const authButtonStyle = 'min-height:42px;padding:0 16px;color:#fff;background:#167f78;border:0;border-radius:7px;font-weight:700;cursor:pointer'
      editor.BlockManager.add('psl-auth-login', {
        label: 'Inicio de sesión',
        category: 'Supabase',
        media: SUPABASE_BLOCK_ICONS.login,
        content: `<form data-psl-auth-action="login" style="${authFormStyle}">
          <h2 style="margin:0">Iniciar sesión</h2>
          <label>Correo<input name="email" type="email" autocomplete="email" required style="${authInputStyle}"></label>
          <label>Contraseña<input name="password" type="password" autocomplete="current-password" required style="${authInputStyle}"></label>
          <button type="submit" style="${authButtonStyle}">Entrar</button>
          <p data-psl-auth-status style="min-height:20px;margin:0" aria-live="polite"></p>
        </form>`,
      })
      editor.BlockManager.add('psl-auth-signup', {
        label: 'Crear cuenta',
        category: 'Supabase',
        media: SUPABASE_BLOCK_ICONS.signup,
        content: `<form data-psl-auth-action="signup" style="${authFormStyle}">
          <h2 style="margin:0">Crear cuenta</h2>
          <label>Correo<input name="email" type="email" autocomplete="email" required style="${authInputStyle}"></label>
          <label>Contraseña<input name="password" type="password" autocomplete="new-password" minlength="6" required style="${authInputStyle}"></label>
          <button type="submit" style="${authButtonStyle}">Registrarme</button>
          <p data-psl-auth-status style="min-height:20px;margin:0" aria-live="polite"></p>
        </form>`,
      })
      editor.BlockManager.add('psl-auth-logout', {
        label: 'Cerrar sesión',
        category: 'Supabase',
        media: SUPABASE_BLOCK_ICONS.logout,
        content: `<button data-psl-auth-action="logout" data-psl-auth-visible="signed-in" type="button" style="${authButtonStyle}">Cerrar sesión</button>`,
      })
      editor.BlockManager.add('psl-auth-email', {
        label: 'Correo del usuario',
        category: 'Supabase',
        media: SUPABASE_BLOCK_ICONS.email,
        content: '<span data-psl-auth-field="email">correo@ejemplo.com</span>',
      })
      editor.BlockManager.add(DATA_COMPONENT_BLOCK_ID, {
        label: 'Datos dinámicos',
        category: 'Supabase',
        attributes: {
          title: 'Añadir tarjetas, carrusel, lista o detalle desde una tabla',
        },
        content: '<section data-psl-data-component-launcher></section>',
        media: SUPABASE_BLOCK_ICONS.data,
        onClick: () => {
          setBlocksOpen(false)
          setDataComponentRequest((current) => current + 1)
        },
      })

      const previewController = createPreviewController({
        onStart: () => {
          try {
            const bundle = editorProjectBundle(editor, supabaseConfigRef.current)
            const selectedPageId = editor.Pages.getSelected()?.getId()
            setBlocksOpen(false)
            setPreviewSession(createEditorPreviewSession(bundle, selectedPageId))
            setPreviewActive(true)
            setError(null)
            setFlowNotice('Vista previa activa con los mismos datos y conexiones de la exportación.')
            return true
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la vista previa.')
            const previewButton = findPreviewButton(editor)
            requestAnimationFrame(() => previewButton?.set('active', false))
            return false
          }
        },
        onStop: () => {
          setPreviewActive(false)
          setPreviewSession(null)
          setFlowNotice('Vista previa finalizada.')
        },
      })
      previewControllerRef.current = previewController
      editor.Commands.add('psl-preview', {
        run: () => previewController.start(),
        stop: () => previewController.stop(),
      })
      editor.Commands.add('psl-export-project', {
        run: async () => {
          try {
            setError(null)
            await exportEditorProject(editor, supabaseConfigRef.current)
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo exportar el sitio.')
          }
        },
      })

      editor.Panels.addButton('options', {
        id: 'visual-editor-assets',
        command: 'open-assets',
        label: '▧',
        attributes: { title: 'Imágenes', 'aria-label': 'Imágenes' },
      })
      editor.Panels.addButton('options', {
        id: 'visual-editor-export-zip',
        command: 'psl-export-project',
        label: '⇩',
        attributes: { title: 'Exportar ZIP', 'aria-label': 'Exportar ZIP' },
      })
      editor.Panels.getPanel('views')?.set('visible', false)
      editor.Panels.getPanel('commands')?.set('visible', false)

      const syncPages = () => {
        setPages(editor.Pages.getAll().map((page) => ({
          id: page.getId(),
          name: page.getName() || 'Sin título',
        })))
        setActivePageId(editor.Pages.getSelected()?.getId() ?? '')
      }

      const syncSelectedElement = (component?: Component | null) => {
        const summary = summarizeComponent(component)
        const motionComponent = findMotionActivityComponent(component)
        setSelectedElement(summary)
        setSelectedMotionComponent(motionComponent)
        if (!motionComponent) setMotionNotice('')
        setFlowTargetPageId(summary?.targetPageId ?? '')
        setFlowNotice('')
        setRightPanel((current) => motionComponent ? 'motion' : current === 'motion' ? 'properties' : current)
      }

      const installDataComponentDoubleClick = () => {
        const canvasDocument = editor.Canvas.getDocument()
        if (!canvasDocument || canvasDoubleClickDocuments.has(canvasDocument)) return
        canvasDoubleClickDocuments.add(canvasDocument)
        const openDataComponentOptions = (event: MouseEvent) => {
          const target = event.target as Element | null
          if (!target || typeof target.closest !== 'function') return
          const rootElement = findDataComponentRoot(target)
          if (!rootElement) return
          const settings = readDataComponentSettings(rootElement)
          const component = editor.getWrapper()?.find([
            `[${DATA_COMPONENT_ATTRIBUTE}]`,
            '.psl-data-grid',
            '.psl-data-carousel',
            '.psl-data-list',
            '.psl-data-featured',
          ].join(',')).find((candidate) => candidate.getEl() === rootElement)
          if (!settings || !component) return
          event.preventDefault()
          event.stopPropagation()
          editingDataComponentRef.current = component
          editor.select(component)
          syncSelectedElement(component)
          setRightPanel('data')
          setDataComponentEditRequest((current) => ({
            ...settings,
            requestId: (current?.requestId ?? 0) + 1,
          }))
        }
        canvasDocument.addEventListener('dblclick', openDataComponentOptions, true)
        const openMotionComponentOptions = (event: MouseEvent) => {
          const target = event.target as Element | null
          const rootElement = target?.closest?.(`[data-motion-activity]`) as HTMLElement | null
          if (!rootElement) return
          const component = editor.getWrapper()?.find('[data-motion-activity]')
            .find((candidate) => candidate.getEl() === rootElement)
          if (!component) return
          event.preventDefault()
          event.stopPropagation()
          editor.select(component)
          syncSelectedElement(component)
          setRightPanel('motion')
          setMotionDialogOpen(true)
        }
        canvasDocument.addEventListener('dblclick', openMotionComponentOptions, true)
        canvasDoubleClickCleanups.push(() => {
          canvasDocument.removeEventListener('dblclick', openDataComponentOptions, true)
          canvasDocument.removeEventListener('dblclick', openMotionComponentOptions, true)
        })
      }

      const applyFitViewport = () => {
        if (editor.Canvas.getFrames().length === 0) return
        canvasZoomModeRef.current = 'fit'
        setCanvasZoomMode('fit')
        editor.Canvas.fitViewport({
          gap: { x: 24, y: 24 },
          ignoreHeight: true,
          zoom: clampCanvasZoom,
        })
      }

      const syncPreviewViewport = (device?: Device | null, previousDevice?: Device | null) => {
        const selected = device ?? editor.Devices.getSelected()
        const name = selected?.get('name')?.toLowerCase() ?? 'desktop'
        const width = selected?.get('width')?.trim() || '100%'
        const deviceId = String(selected?.get('id') ?? name)
        const previousDeviceId = previousDevice
          ? String(previousDevice.get('id') ?? previousDevice.get('name') ?? '')
          : currentCanvasDeviceRef.current
        const label = name.includes('mobile')
          ? 'Móvil'
          : name.includes('tablet')
            ? 'Tableta'
            : 'Escritorio'
        setPreviewViewport({ label, width })
        requestAnimationFrame(() => {
          if (previousDevice && previousDeviceId) {
            canvasViewsRef.current.set(previousDeviceId, {
              coords: editor.Canvas.getCoords(),
              mode: canvasZoomModeRef.current,
              zoom: editor.Canvas.getZoom(),
            })
          }

          currentCanvasDeviceRef.current = deviceId
          const savedView = canvasViewsRef.current.get(deviceId)
          if (savedView?.mode === 'manual') {
            canvasZoomModeRef.current = 'manual'
            setCanvasZoomMode('manual')
            editor.Canvas.setZoom(savedView.zoom, { from: 'device-restore' })
            editor.Canvas.setCoords(savedView.coords.x, savedView.coords.y)
          } else {
            applyFitViewport()
          }
        })
      }

      const moveNativePanel = (panelId: string, target: HTMLElement) => {
        const panel = editor.Panels.getPanel(panelId)
        const element = panel?.view?.el as HTMLElement | undefined
        if (!element) return
        element.classList.add('gjs-native-toolbar-panel')
        target.append(element)
      }

      const stabilizeEditorCanvas = () => {
        const canvasDocument = editor.Canvas.getDocument()
        const visibleCanvasHeight = canvasColumnRef.current?.clientHeight ?? DEFAULT_EDITOR_VIEWPORT_HEIGHT_CAP
        const heightCap = Math.min(960, Math.max(480, visibleCanvasHeight))
        if (!canvasDocument) return
        const guardedLayoutCount = installEditorCanvasLayoutGuards(canvasDocument, heightCap)
        const frameHeight = editor.Canvas.getFrameEl()?.getBoundingClientRect().height ?? 0
        if (guardedLayoutCount === 0 && frameHeight > 0) return
        canvasViewsRef.current.clear()
        editor.Canvas.setCoords(0, 0)
        requestAnimationFrame(() => {
          editor.Canvas.setCoords(0, 0)
          applyFitViewport()
        })
      }

      const installEditorViewport = () => {
        const canvasDocument = editor.Canvas.getDocument()
        const visibleCanvasHeight = canvasColumnRef.current?.clientHeight ?? DEFAULT_EDITOR_VIEWPORT_HEIGHT_CAP
        const heightCap = Math.min(960, Math.max(480, visibleCanvasHeight))
        if (canvasDocument) installEditorCanvasLayoutGuards(canvasDocument, heightCap)
      }
      const handleCanvasBodyLoad = () => {
        stabilizeEditorCanvas()
        installDataComponentDoubleClick()
      }
      editor.on('canvas:frame:load:head', installEditorViewport)
      editor.on('canvas:frame:load:body', handleCanvasBodyLoad)
      editor.onReady(() => {
        syncPages()
        syncPreviewViewport()
        editor.Css.addRules(dataComponentStyles)
        installEditorViewport()
        stabilizeEditorCanvas()
        installDataComponentDoubleClick()
        if (ensureDataDesignPlaceholders(editor) > 0) {
          void editor.store().catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : 'No se pudieron guardar los espacios de diseño.')
          })
        }
        editor.stopCommand('open-sm')
        editor.stopCommand('core:preview')
        const previewButton = findPreviewButton(editor)
        if (previewButton) {
          previewButton.set('active', false)
          previewButton.set('command', 'psl-preview')
          previewButton.set('togglable', true)
          previewButton.set('attributes', {
            title: 'Vista previa',
            'aria-label': 'Vista previa',
          })
        }
        const fullscreenButton = editor.Panels.getButton('options', 'fullscreen')
        if (fullscreenButton && canvasColumnRef.current) {
          fullscreenButton.set('options', { target: canvasColumnRef.current })
          fullscreenButton.set('attributes', {
            title: 'Pantalla completa',
            'aria-label': 'Pantalla completa',
          })
        }
        ;[
          ['set-device-desktop', 'Escritorio · 1280 px'],
          ['set-device-tablet', 'Tableta · 768 px'],
          ['set-device-mobile', 'Móvil · 390 px'],
        ].forEach(([id, label]) => {
          editor.Panels.getButton('devices-c', id)?.set('attributes', {
            title: label,
            'aria-label': label,
          })
        })
        editor.Panels.getButton('views', 'open-sm')?.set('active', false)
        editor.Panels.removePanel('views-container')
        moveNativePanel('devices-c', nativeDevicesRef.current!)
        moveNativePanel('options', nativeOptionsRef.current!)
      })
      editor.on('page:add', syncPages)
      editor.on('page:remove', syncPages)
      editor.on('page:select', syncPages)
      editor.on('page:update', syncPages)
      editor.on('device:select', (device: Device | null | undefined, previousDevice: Device | null | undefined) => {
        syncPreviewViewport(device, previousDevice)
      })
      editor.on('canvas:zoom', ({ options }: { options?: { from?: string } }) => {
        const zoom = clampCanvasZoom(editor.Canvas.getZoom())
        if (zoom !== editor.Canvas.getZoom()) {
          editor.Canvas.setZoom(zoom, { from: 'zoom-clamp' })
          return
        }
        setCanvasZoom(zoom)
        if (options?.from !== 'fitViewport') {
          canvasZoomModeRef.current = 'manual'
          setCanvasZoomMode('manual')
        }
      })
      editor.on('component:selected', (component: Component) => {
        syncSelectedElement(component)
      })
      editor.on('component:deselected', () => {
        syncSelectedElement(editor.getSelected())
      })
      editor.on('block:click', () => {
        setBlocksOpen(false)
      })
      editor.on('block:drag:stop', (component: Component | undefined, block: Block) => {
        if (!component) return
        setBlocksOpen(false)
        if ([
          MOTION_VIEW_REFERENCE_BLOCK_ID,
          MOTION_COMPARE_BLOCK_ID,
          MOTION_ANALYSIS_BLOCK_ID,
          MOTION_CAPTURE_REFERENCE_BLOCK_ID,
        ].includes(block.getId())) {
          editor.select(component)
          setRightPanel('motion')
          setMotionDialogOpen(true)
        }
        if (block.getId() === DATA_COMPONENT_BLOCK_ID) {
          component.remove()
          setDataComponentRequest((current) => current + 1)
        }
      })
      if (typeof ResizeObserver !== 'undefined' && canvasColumnRef.current) {
        canvasResizeObserver = new ResizeObserver(() => {
          if (canvasZoomModeRef.current === 'fit') applyFitViewport()
        })
        canvasResizeObserver.observe(canvasColumnRef.current)
      }

      const isTextInput = (target: EventTarget | null) => {
        const element = target instanceof HTMLElement ? target : null
        return Boolean(element?.closest('input, textarea, select, [contenteditable="true"]'))
      }
      const startTemporaryPan = (event: KeyboardEvent) => {
        if (event.code !== 'Space' || event.repeat || isTextInput(event.target) || editor.Canvas.isInputFocused()) return
        event.preventDefault()
        if (!editor.Commands.isActive('core:canvas-move')) editor.runCommand('core:canvas-move')
        setPanToolActive(true)
      }
      const stopTemporaryPan = (event: KeyboardEvent) => {
        if (event.code !== 'Space' || panToolLockedRef.current) return
        editor.stopCommand('core:canvas-move')
        setPanToolActive(false)
      }
      window.addEventListener('keydown', startTemporaryPan)
      window.addEventListener('keyup', stopTemporaryPan)

      const removePanShortcuts = () => {
        window.removeEventListener('keydown', startTemporaryPan)
        window.removeEventListener('keyup', stopTemporaryPan)
      }
      ;(editor as Editor & { __removePanShortcuts?: () => void }).__removePanShortcuts = removePanShortcuts
      ;(editor as Editor & { __removeCanvasGestures?: () => void }).__removeCanvasGestures = attachCanvasGestures(
        editor,
        () => {
          canvasZoomModeRef.current = 'manual'
          setCanvasZoomMode('manual')
        },
      )
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar el editor.')
    }

    return () => {
      canvasResizeObserver?.disconnect()
      canvasDoubleClickCleanups.forEach((cleanup) => cleanup())
      ;(editorRef.current as (Editor & { __removePanShortcuts?: () => void }) | null)?.__removePanShortcuts?.()
      ;(editorRef.current as (Editor & { __removeCanvasGestures?: () => void }) | null)?.__removeCanvasGestures?.()
      previewControllerRef.current?.stop()
      previewControllerRef.current = null
      editorRef.current?.destroy()
      editorRef.current = null
    }
  }, [editorProjectId])

  useEffect(() => {
    if (!blocksOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setBlocksOpen(false)
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [blocksOpen])

  function setManualCanvasZoom(nextZoom: number) {
    const editor = editorRef.current
    if (!editor) return
    canvasZoomModeRef.current = 'manual'
    setCanvasZoomMode('manual')
    editor.Canvas.setZoom(clampCanvasZoom(nextZoom), { from: 'zoom-toolbar' })
  }

  function fitCanvasToWorkspace() {
    const editor = editorRef.current
    if (!editor) return
    canvasZoomModeRef.current = 'fit'
    setCanvasZoomMode('fit')
    editor.Canvas.fitViewport({
      gap: { x: 24, y: 24 },
      ignoreHeight: true,
      zoom: clampCanvasZoom,
    })
  }

  function toggleCanvasPanTool() {
    const editor = editorRef.current
    if (!editor) return
    const nextActive = !panToolLockedRef.current
    panToolLockedRef.current = nextActive
    setPanToolActive(nextActive)
    if (nextActive) editor.runCommand('core:canvas-move')
    else editor.stopCommand('core:canvas-move')
  }

  function selectPage(pageId: string) {
    editorRef.current?.Pages.select(pageId)
  }

  function uniquePageId(prefix = 'page') {
    const editor = editorRef.current
    let candidate = `${prefix}-${crypto.randomUUID?.() ?? Date.now().toString(36)}`
    while (editor?.Pages.get(candidate)) candidate = `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`
    return candidate
  }

  function renamePage(pageId: string) {
    const editor = editorRef.current
    const page = editor?.Pages.get(pageId)
    if (!editor || !page) return
    setRenamingPage({ id: pageId, name: page.getName() || 'Sin título' })
  }

  function savePageName(nextName: string) {
    const editor = editorRef.current
    const page = renamingPage ? editor?.Pages.get(renamingPage.id) : undefined
    if (!editor || !page) return
    page.setName(nextName)
    setRenamingPage(null)
    setPages(editor.Pages.getAll().map((candidate) => ({
      id: candidate.getId(),
      name: candidate.getName() || 'Sin título',
    })))
    void editor.store()
  }

  function duplicatePage(pageId: string) {
    const editor = editorRef.current
    const page = editor?.Pages.get(pageId)
    const component = page?.getMainComponent()
    if (!editor || !page || !component) return
    const name = `${page.getName() || 'Página'} copia`
    editor.Pages.add({
      id: uniquePageId('copy'),
      name,
      component: editor.getHtml({ component }),
      styles: editor.getCss({ component, keepUnusedStyles: true }),
    }, { select: true })
    void editor.store()
  }

  function deletePage(pageId: string) {
    const editor = editorRef.current
    const page = editor?.Pages.get(pageId)
    if (!editor || !page) return
    if (editor.Pages.getAll().length === 1) {
      window.alert('El proyecto debe conservar al menos una página.')
      return
    }

    const inboundConnections = editor.Pages.getAll().flatMap((candidate) => (
      candidate.getMainComponent()?.find(`[${FLOW_TARGET_ATTRIBUTE}="${pageId}"]`) ?? []
    ))
    const connectionWarning = inboundConnections.length
      ? `\n\nTambién se eliminarán ${inboundConnections.length} conexiones de Flujo que apuntan a esta página.`
      : ''
    if (!window.confirm(`¿Eliminar “${page.getName() || 'Sin título'}”? Esta acción no se puede deshacer.${connectionWarning}`)) return

    inboundConnections.forEach((component) => {
      component.removeAttributes([FLOW_ACTION_ATTRIBUTE, FLOW_TARGET_ATTRIBUTE])
    })
    const fallback = editor.Pages.getAll().find((candidate) => candidate.getId() !== pageId)
    if (editor.Pages.getSelected()?.getId() === pageId && fallback) editor.Pages.select(fallback)
    editor.Pages.remove(page)
    void editor.store()
  }

  function importPages(drafts: ImportedPageDraft[]) {
    const editor = editorRef.current
    if (!editor) return
    let firstImportedId = ''
    drafts.forEach((draft) => {
      const id = uniquePageId('import')
      const prepared = prepareImportedPage(draft, id)
      editor.Pages.add({
        id: prepared.id,
        name: prepared.name,
        component: prepared.html,
        styles: prepared.css,
      })
      if (!firstImportedId) firstImportedId = id
    })
    if (firstImportedId) editor.Pages.select(firstImportedId)
    setPageImportOpen(false)
    void editor.store().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudieron guardar las páginas importadas.')
    })
  }

  const availableFlowPages = pages.filter((page) => page.id !== activePageId)
  const resolvedFlowTargetPageId = availableFlowPages.some((page) => page.id === flowTargetPageId)
    ? flowTargetPageId
    : availableFlowPages[0]?.id ?? ''

  function saveFlowConnection() {
    const editor = editorRef.current
    const component = editor?.getSelected()
    if (!editor || !component || !resolvedFlowTargetPageId) return

    component.addAttributes(screenFlowAttributes(resolvedFlowTargetPageId))
    setSelectedElement(summarizeComponent(component))
    setFlowTargetPageId(resolvedFlowTargetPageId)
    const destination = pages.find((page) => page.id === resolvedFlowTargetPageId)
    setFlowNotice(`Conexión guardada hacia ${destination?.name ?? 'la pantalla seleccionada'}.`)
    void editor.store().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la conexión.')
    })
  }

  function removeFlowConnection() {
    const editor = editorRef.current
    const component = editor?.getSelected()
    if (!editor || !component) return

    component.removeAttributes([FLOW_ACTION_ATTRIBUTE, FLOW_TARGET_ATTRIBUTE])
    setSelectedElement(summarizeComponent(component))
    setFlowTargetPageId('')
    setFlowNotice('Conexión eliminada.')
    void editor.store().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el cambio.')
    })
  }

  function saveSupabaseConfig(next: SupabaseEditorConfig) {
    supabaseConfigRef.current = next
    setSupabaseConfig(next)
    storeSupabaseConfig(next)
    void editorRef.current?.store()
  }

  function defaultBindingTarget() {
    if (selectedElement?.tag === 'IMG' || selectedElement?.tag === 'VIDEO'
      || selectedElement?.tag === 'IFRAME') return 'src'
    if (selectedElement?.tag === 'INPUT' || selectedElement?.tag === 'TEXTAREA') return 'value'
    if (selectedElement?.tag === 'A') return 'href'
    return 'text'
  }

  function saveDataBinding(tableId: string, field: string, target: string, scope: 'context' | 'first') {
    const editor = editorRef.current
    const component = editor?.getSelected()
    if (!editor || !component || !field) return
    component.addAttributes({
      [DATA_BIND_FIELD_ATTRIBUTE]: field,
      [DATA_BIND_TARGET_ATTRIBUTE]: target,
      [DATA_SOURCE_ATTRIBUTE]: tableId,
      [DATA_SCOPE_ATTRIBUTE]: scope,
    })
    setSelectedElement(summarizeComponent(component))
    void editor.store()
  }

  function removeDataBinding() {
    const editor = editorRef.current
    const component = editor?.getSelected()
    if (!editor || !component) return
    component.removeAttributes([
      DATA_BIND_FIELD_ATTRIBUTE,
      DATA_BIND_TARGET_ATTRIBUTE,
      DATA_SOURCE_ATTRIBUTE,
      DATA_SCOPE_ATTRIBUTE,
    ])
    setSelectedElement(summarizeComponent(component))
    void editor.store()
  }

  function toggleDataRepeater(tableId: string) {
    const editor = editorRef.current
    const component = editor?.getSelected()
    if (!editor || !component) return
    if (selectedElement?.isRepeater) component.removeAttributes([DATA_REPEATER_ATTRIBUTE])
    else component.addAttributes({ [DATA_REPEATER_ATTRIBUTE]: tableId })
    setSelectedElement(summarizeComponent(component))
    void editor.store()
  }

  function insertDataComponent(
    templateId: DataComponentTemplateId,
    tableId: string,
    mapping: DataComponentMapping,
    options: DataComponentOptions,
  ) {
    const editor = editorRef.current
    if (!editor) return
    const wrapper = editor.getWrapper()
    if (!wrapper) return
    const markup = createDataComponentMarkup(templateId, tableId, mapping, options)
    const added = wrapper.append(markup)
    editor.Css.addRules(dataComponentStyles)
    const component = added[0]
    if (component) {
      editor.select(component)
      setSelectedElement(summarizeComponent(component))
    }
    setFlowNotice('Componente responsive añadido y conectado con la tabla seleccionada.')
    void editor.store().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el componente con datos.')
    })
  }

  function updateDataComponent(
    templateId: DataComponentTemplateId,
    tableId: string,
    mapping: DataComponentMapping,
    options: DataComponentOptions,
  ) {
    const editor = editorRef.current
    const component = editingDataComponentRef.current
    if (!editor || !component) return
    const generatedClasses = new Set([
      'psl-data-responsive-frame',
      'psl-data-grid',
      'psl-data-carousel',
      'psl-data-list',
      'psl-data-featured',
    ])
    const preservedClasses = component.getClasses().filter((className) => !generatedClasses.has(className))
    const preservedAttributes = Object.fromEntries(Object.entries(component.getAttributes()).filter(([name]) =>
      name !== 'class'
      && name !== 'style'
      && name !== 'aria-label'
      && name !== 'tabindex'
      && name !== DATA_COMPONENT_ATTRIBUTE))
    const preservedStyles = Object.fromEntries(Object.entries(component.getStyle()).filter(([name]) =>
      !name.startsWith('--psl-data-')))
    const replacements = component.replaceWith(createDataComponentMarkup(templateId, tableId, mapping, options))
    const replacement = replacements[0]
    editingDataComponentRef.current = null
    setDataComponentEditRequest(null)
    if (!replacement) return
    if (preservedClasses.length) replacement.addClass(preservedClasses)
    if (Object.keys(preservedAttributes).length) replacement.addAttributes(preservedAttributes)
    if (Object.keys(preservedStyles).length) replacement.addStyle(preservedStyles)
    editor.Css.addRules(dataComponentStyles)
    editor.select(replacement)
    setSelectedElement(summarizeComponent(replacement))
    setFlowNotice('Opciones del componente con datos actualizadas.')
    void editor.store().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el componente con datos.')
    })
  }

  function handlePreviewRuntimeAction(message: Parameters<typeof applyEditorPreviewAction>[1]) {
    setPreviewSession((current) => {
      if (!current) return current
      const transition = applyEditorPreviewAction(current, message)
      if (transition.externalUrl) {
        window.open(transition.externalUrl, '_blank', 'noopener,noreferrer')
      }
      if (transition.session.pageId !== current.pageId) {
        requestAnimationFrame(() => editorRef.current?.Pages.select(transition.session.pageId))
      }
      return transition.session
    })
  }

  function handleMotionReference(message: MotionReferenceRuntimeMessage) {
    const editor = editorRef.current
    const match = /^(.*)-motion-(\d+)$/.exec(message.activityId)
    if (!editor || !match) return
    const page = editor.Pages.get(match[1])
    const activities = page?.getMainComponent().find(`[data-motion-activity]`) ?? []
    const component = activities[Number(match[2]) - 1]
    if (!component) return
    component.addAttributes({
      'data-motion-reference-source': 'template',
      'data-motion-reference-template': encodeURIComponent(JSON.stringify(message.template)),
    })
    editor.select(component)
    setSelectedMotionComponent(component)
    setMotionNotice('Referencia compilada e incrustada en el proyecto. Cambia a Comparar para utilizarla.')
    setRightPanel('motion')
    void editor.store().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la referencia compilada.')
    })
  }

  function addPage() {
    const editor = editorRef.current
    if (!editor) return
    const pageNumber = editor.Pages.getAll().length + 1
    editor.Pages.add({
      name: `Página ${pageNumber}`,
      component: '',
    }, { select: true })
  }

  function addTemplatePage(templateId: string) {
    const editor = editorRef.current
    const template = pageTemplateById(templateId)
    if (!editor || !template) return
    const existingPage = template.id === 'auth'
      ? editor.Pages.getAll().find((page) => editor.getHtml({
        component: page.getMainComponent(),
      }).includes('data-psl-auth-action="login"'))
      : undefined
    if (existingPage && template.id === 'auth') {
      editor.Pages.select(existingPage)
      setCreateMenuOpen(false)
      setTemplateGalleryOpen(false)
      setFlowNotice('La página de acceso ya existe. Las demás páginas requieren sesión al probar o exportar.')
      return
    }
    editor.Pages.add({
      id: uniquePageId(template.id),
      name: template.pageName,
      component: template.html,
      styles: template.css,
    }, { select: true })
    setCreateMenuOpen(false)
    setTemplateGalleryOpen(false)
    setFlowNotice(template.id === 'auth'
      ? 'Autenticación activada. Todas las demás páginas requieren iniciar sesión.'
      : `Plantilla “${template.name}” añadida. Selecciona cualquier elemento para editarlo.`)
    void editor.store().catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar la plantilla.')
    })
  }

  return (
    <main className="grapes-editor-shell">
      {error && <div className="grapes-editor-error" role="alert">{error}</div>}

      <header className="gjs-workspace-toolbar">
        <div className="gjs-workspace-brand" title="Editor visual">
          <span aria-hidden="true">G</span>
        </div>

        <div className="gjs-device-selector">
          <div className="gjs-native-devices" aria-label="Tamaño del lienzo" ref={nativeDevicesRef} />
          <output aria-live="polite" className="gjs-device-size">
            {previewViewport.label} · {previewViewport.width.replace('px', ' px')}
          </output>
        </div>
        <div className="gjs-toolbar-account-area">
          <div className="gjs-native-options" aria-label="Herramientas del editor" ref={nativeOptionsRef} />
          <div className="gjs-editor-account"><span aria-hidden="true">{accountEmail.slice(0, 1).toUpperCase()}</span><small>{accountEmail}</small></div>
          <button
            aria-label={isGuest ? 'Salir del modo invitado' : 'Cerrar sesión'}
            className="gjs-editor-signout"
            onClick={() => void onSignOut()}
            title={isGuest ? 'Salir del modo invitado' : `Cerrar sesión de ${accountEmail}`}
            type="button"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M10 5H5v14h5M14 8l4 4-4 4M8 12h10" /></svg>
            <span>{isGuest ? 'Salir' : 'Cerrar sesión'}</span>
          </button>
        </div>
      </header>

      <div className="gjs-workspace-grid">
        <aside className="gjs-left-panel" onClick={() => {
          setCreateMenuOpen(false)
          setPageMenuId(null)
        }}>
          <section className="gjs-sidebar-section gjs-pages-section">
            <div className="gjs-sidebar-heading">
              <strong>Páginas</strong>
              <div className="gjs-page-create-control">
                <button
                  aria-expanded={createMenuOpen}
                  aria-label="Añadir o importar página"
                  data-tooltip="Añadir o importar página"
                  onClick={(event) => {
                    event.stopPropagation()
                    setPageMenuId(null)
                    setCreateMenuPosition(floatingMenuPosition(
                      event.currentTarget.getBoundingClientRect(),
                      196,
                      114,
                    ))
                    setCreateMenuOpen((open) => !open)
                  }}
                  type="button"
                >+</button>
                {createMenuOpen && (
                  <div
                    className="gjs-page-menu gjs-page-create-menu gjs-page-menu-floating"
                    role="menu"
                    style={createMenuPosition}
                  >
                    <button onClick={addPage} role="menuitem" type="button">Página nueva</button>
                    <button onClick={() => {
                      setCreateMenuOpen(false)
                      setTemplateGalleryOpen(true)
                    }} role="menuitem" type="button">Explorar plantillas</button>
                    <button onClick={() => {
                      setCreateMenuOpen(false)
                      setPageImportOpen(true)
                    }} role="menuitem" type="button">Importar</button>
                  </div>
                )}
              </div>
            </div>
            <nav className="gjs-page-list" aria-label="Páginas">
              {pages.map((page) => (
                <div className={`gjs-page-row ${page.id === activePageId ? 'active' : ''}`} key={page.id}>
                  <button className="gjs-page-select" onClick={() => selectPage(page.id)} type="button">
                    <span>{page.name}</span>
                  </button>
                  <button
                    aria-expanded={pageMenuId === page.id}
                    aria-label={`Acciones de ${page.name}`}
                    className="gjs-page-more"
                    onClick={(event) => {
                      event.stopPropagation()
                      setCreateMenuOpen(false)
                      const buttonRect = event.currentTarget.getBoundingClientRect()
                      setPageMenuPosition(floatingMenuPosition(buttonRect, 150, 106))
                      setPageMenuId((current) => current === page.id ? null : page.id)
                    }}
                    type="button"
                  >•••</button>
                  {pageMenuId === page.id && (
                    <div
                      className="gjs-page-menu gjs-page-menu-floating"
                      role="menu"
                      style={pageMenuPosition}
                    >
                      <button onClick={() => renamePage(page.id)} role="menuitem" type="button">Renombrar</button>
                      <button onClick={() => duplicatePage(page.id)} role="menuitem" type="button">Duplicar</button>
                      <button className="danger" onClick={() => deletePage(page.id)} role="menuitem" type="button">Eliminar</button>
                    </div>
                  )}
                </div>
              ))}
            </nav>
          </section>

          <section className="gjs-sidebar-section gjs-layers-section">
            <div className="gjs-sidebar-heading"><strong>Capas</strong></div>
            <div className="gjs-manager-container gjs-layers-container" ref={layersRef} />
          </section>

          <button className="gjs-add-blocks" onClick={() => setBlocksOpen((open) => !open)} type="button">
            <span aria-hidden="true">+</span> Añadir
          </button>
        </aside>

        <section className="gjs-canvas-column" ref={canvasColumnRef}>
          <div className="grapes-editor" ref={canvasRef} />
          {!previewActive && (
            <div className="gjs-canvas-viewport-controls" aria-label="Zoom y movimiento del lienzo">
              <button
                aria-label="Mover lienzo"
                aria-pressed={panToolActive}
                className={panToolActive ? 'active' : ''}
                data-tooltip="Mover lienzo (o mantén Espacio)"
                onClick={toggleCanvasPanTool}
                type="button"
              >✋</button>
              <span className="gjs-canvas-control-divider" aria-hidden="true" />
              <button
                aria-label="Alejar lienzo"
                disabled={canvasZoom <= MIN_CANVAS_ZOOM}
                onClick={() => setManualCanvasZoom(stepCanvasZoom(canvasZoom, -1))}
                type="button"
              >−</button>
              <output aria-live="polite" className="gjs-canvas-zoom-value">{canvasZoom}%</output>
              <button
                aria-label="Acercar lienzo"
                disabled={canvasZoom >= MAX_CANVAS_ZOOM}
                onClick={() => setManualCanvasZoom(stepCanvasZoom(canvasZoom, 1))}
                type="button"
              >+</button>
              <button
                aria-pressed={canvasZoomMode === 'fit'}
                className={canvasZoomMode === 'fit' ? 'active gjs-canvas-fit-button' : 'gjs-canvas-fit-button'}
                onClick={fitCanvasToWorkspace}
                type="button"
              >Ajustar</button>
            </div>
          )}
          {previewActive && previewSession && (
            <EditorRuntimePreview
              onMotionReference={handleMotionReference}
              onRuntimeAction={handlePreviewRuntimeAction}
              session={previewSession}
              viewport={previewViewport}
            />
          )}
          <div
            aria-hidden={!blocksOpen}
            className={`gjs-blocks-backdrop ${blocksOpen ? 'open' : ''}`}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setBlocksOpen(false)
            }}
            role="presentation"
          >
            <section aria-label="Seleccionar qué añadir" aria-modal="true" className="gjs-blocks-dialog" role="dialog">
              <div className="gjs-drawer-heading">
                <div><strong>Añadir</strong><span>Selecciona un elemento o arrástralo a la página.</span></div>
                <button aria-label="Cerrar bloques" onClick={() => setBlocksOpen(false)} type="button">×</button>
              </div>
              <div className="gjs-manager-container" ref={blocksRef} />
            </section>
          </div>
        </section>

        <aside className="gjs-right-panel">
          <div className="gjs-inspector-tabs" role="tablist" aria-label="Inspector">
            <button
              aria-selected={rightPanel === 'styles'}
              className={rightPanel === 'styles' ? 'active' : ''}
              onClick={() => setRightPanel('styles')}
              role="tab"
              type="button"
            >Estilos</button>
            <button
              aria-selected={rightPanel === 'properties'}
              className={rightPanel === 'properties' ? 'active' : ''}
              onClick={() => setRightPanel('properties')}
              role="tab"
              type="button"
            >Propiedades</button>
            <button
              aria-selected={rightPanel === 'motion'}
              className={rightPanel === 'motion' ? 'active' : ''}
              disabled={!selectedMotionComponent}
              onClick={() => setRightPanel('motion')}
              role="tab"
              type="button"
            >Movimiento</button>
            <button
              aria-selected={rightPanel === 'flow'}
              className={rightPanel === 'flow' ? 'active' : ''}
              onClick={() => setRightPanel('flow')}
              role="tab"
              type="button"
            >Flujo</button>
            <button
              aria-selected={rightPanel === 'data'}
              className={rightPanel === 'data' ? 'active' : ''}
              onClick={() => setRightPanel('data')}
              role="tab"
              type="button"
            >Datos</button>
          </div>
          <div
            className={`gjs-manager-container gjs-styles-container ${rightPanel === 'styles' ? '' : 'hidden'}`}
            ref={stylesRef}
          />
          <div
            className={`gjs-manager-container gjs-traits-container ${rightPanel === 'properties' ? '' : 'hidden'}`}
            ref={traitsRef}
          />
          <div className={`gjs-motion-container ${rightPanel === 'motion' ? '' : 'hidden'}`}>
            <MotionPanel
              component={selectedMotionComponent}
              config={supabaseConfig}
              notice={motionNotice}
              onOpenData={() => setRightPanel('data')}
              tables={supabaseConfig.tables}
            />
          </div>
          <div className={`gjs-flow-container ${rightPanel === 'flow' ? '' : 'hidden'}`}>
            {previewActive ? (
              <div className="gjs-flow-form">
                <div className="gjs-flow-introduction gjs-flow-preview-status">
                  <span aria-hidden="true">▶</span>
                  <div>
                    <strong>Vista previa activa</strong>
                    <p>Haz clic en el elemento conectado dentro del lienzo para abrir su pantalla.</p>
                  </div>
                </div>
              </div>
            ) : !selectedElement ? (
              <div className="gjs-flow-empty">
                <span aria-hidden="true">↗</span>
                <strong>Selecciona un elemento</strong>
                <p>Elige un botón, enlace, imagen o tarjeta en el lienzo para conectarlo.</p>
              </div>
            ) : (
              <div className="gjs-flow-form">
                <label>
                  Al hacer clic
                  <select aria-label="Acción del flujo" disabled value="navigate">
                    <option value="navigate">Ir a otra pantalla</option>
                  </select>
                </label>

                <label>
                  Pantalla de destino
                  <select
                    aria-label="Pantalla de destino"
                    disabled={availableFlowPages.length === 0}
                    onChange={(event) => {
                      setFlowTargetPageId(event.target.value)
                      setFlowNotice('')
                    }}
                    value={resolvedFlowTargetPageId}
                  >
                    {availableFlowPages.length === 0 ? (
                      <option value="">Añade otra página primero</option>
                    ) : availableFlowPages.map((page) => (
                      <option key={page.id} value={page.id}>{page.name}</option>
                    ))}
                  </select>
                </label>

                <button
                  className="gjs-flow-primary"
                  disabled={!resolvedFlowTargetPageId}
                  onClick={saveFlowConnection}
                  type="button"
                >
                  {selectedElement.targetPageId ? 'Actualizar conexión' : 'Guardar conexión'}
                </button>

                {selectedElement.targetPageId && (
                  <div className="gjs-flow-connected">
                    <span aria-hidden="true">✓</span>
                    <p>
                      Conectado con <strong>{pages.find((page) => page.id === selectedElement.targetPageId)?.name ?? selectedElement.targetPageId}</strong>
                    </p>
                  </div>
                )}

                {selectedElement.targetPageId && (
                  <button className="gjs-flow-danger" onClick={removeFlowConnection} type="button">
                    Eliminar conexión
                  </button>
                )}
                {flowNotice && <p className="gjs-flow-notice" role="status">{flowNotice}</p>}
              </div>
            )}
          </div>
          <div className={`gjs-data-container ${rightPanel === 'data' ? '' : 'hidden'}`}>
            <SupabaseDataPanel
              config={supabaseConfig}
              dataComponentEditRequest={dataComponentEditRequest}
              dataComponentRequest={dataComponentRequest}
              editorProjectId={editorProjectId}
              isGuest={isGuest}
              onChange={saveSupabaseConfig}
              onInsertDataComponent={insertDataComponent}
              onRemoveBinding={removeDataBinding}
              onSaveBinding={saveDataBinding}
              onToggleRepeater={toggleDataRepeater}
              onUpdateDataComponent={updateDataComponent}
              selectedElement={selectedElement ? {
                bindingField: selectedElement.bindingField,
                bindingTarget: selectedElement.bindingTarget ?? defaultBindingTarget(),
                bindingScope: selectedElement.bindingScope,
                dataSourceTableId: selectedElement.dataSourceTableId,
                inheritedRepeaterTableId: selectedElement.inheritedRepeaterTableId,
                isRepeater: selectedElement.isRepeater,
                repeaterTableId: selectedElement.repeaterTableId,
              } : null}
            />
          </div>
        </aside>
      </div>
      {pageImportOpen && (
        <PageImportDialog
          onClose={() => setPageImportOpen(false)}
          onImport={importPages}
        />
      )}
      {templateGalleryOpen && (
        <TemplateGalleryDialog
          onAdd={addTemplatePage}
          onClose={() => setTemplateGalleryOpen(false)}
        />
      )}
      {renamingPage && (
        <PageRenameDialog
          initialName={renamingPage.name}
          onClose={() => setRenamingPage(null)}
          onRename={savePageName}
        />
      )}
      {motionDialogOpen && selectedMotionComponent && (
        <MotionSettingsDialog
          component={selectedMotionComponent}
          config={supabaseConfig}
          notice={motionNotice}
          onClose={() => setMotionDialogOpen(false)}
          onOpenData={() => {
            setMotionDialogOpen(false)
            setRightPanel('data')
          }}
          onSave={() => {
            setMotionDialogOpen(false)
            void editorRef.current?.store().catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : 'No se pudo guardar el componente de movimiento.')
            })
          }}
          tables={supabaseConfig.tables}
        />
      )}
    </main>
  )
}
