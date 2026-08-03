import type { Editor } from 'grapesjs'
import { clampCanvasZoom } from './canvas-viewport'

type Point = { x: number; y: number }

export type TouchGestureSnapshot = {
  coords: Point
  distance: number
  midpoint: Point
  zoom: number
}

export function touchGestureTransform(
  start: TouchGestureSnapshot,
  currentMidpoint: Point,
  currentDistance: number,
) {
  const nextZoom = clampCanvasZoom(start.zoom * (currentDistance / Math.max(1, start.distance)))
  const zoomRatio = nextZoom / start.zoom
  return {
    coords: {
      x: currentMidpoint.x - (start.midpoint.x - start.coords.x) * zoomRatio,
      y: currentMidpoint.y - (start.midpoint.y - start.coords.y) * zoomRatio,
    },
    zoom: nextZoom,
  }
}

function midpoint(first: Point, second: Point): Point {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
}

function distance(first: Point, second: Point) {
  return Math.hypot(second.x - first.x, second.y - first.y)
}

export function attachCanvasTouchGestures(editor: Editor, onGestureStart: () => void) {
  const pointers = new Map<number, Point>()
  let gesture: TouchGestureSnapshot | null = null
  const cleanups: Array<() => void> = []

  const points = () => Array.from(pointers.values()).slice(0, 2)
  const beginGesture = () => {
    const [first, second] = points()
    if (!first || !second) return
    gesture = {
      coords: editor.Canvas.getCoords(),
      distance: distance(first, second),
      midpoint: midpoint(first, second),
      zoom: editor.Canvas.getZoom(),
    }
    onGestureStart()
  }

  const pointerDown = (event: PointerEvent) => {
    if (event.pointerType !== 'touch') return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (pointers.size === 2) {
      event.preventDefault()
      event.stopPropagation()
      beginGesture()
    }
  }
  const pointerMove = (event: PointerEvent) => {
    if (!pointers.has(event.pointerId)) return
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    if (!gesture || pointers.size < 2) return
    event.preventDefault()
    event.stopPropagation()
    const [first, second] = points()
    if (!first || !second) return
    const next = touchGestureTransform(gesture, midpoint(first, second), distance(first, second))
    editor.Canvas.setZoom(next.zoom, { from: 'touch-gesture' })
    editor.Canvas.setCoords(next.coords.x, next.coords.y)
  }
  const pointerEnd = (event: PointerEvent) => {
    pointers.delete(event.pointerId)
    if (pointers.size < 2) gesture = null
  }

  const attach = (target: Document | HTMLElement) => {
    target.addEventListener('pointerdown', pointerDown as EventListener, { capture: true, passive: false })
    target.addEventListener('pointermove', pointerMove as EventListener, { capture: true, passive: false })
    target.addEventListener('pointerup', pointerEnd as EventListener, { capture: true })
    target.addEventListener('pointercancel', pointerEnd as EventListener, { capture: true })
    cleanups.push(() => {
      target.removeEventListener('pointerdown', pointerDown as EventListener, true)
      target.removeEventListener('pointermove', pointerMove as EventListener, true)
      target.removeEventListener('pointerup', pointerEnd as EventListener, true)
      target.removeEventListener('pointercancel', pointerEnd as EventListener, true)
    })
  }

  const attachFrame = () => {
    const document = editor.Canvas.getDocument()
    if (!document || document.documentElement.dataset.pslTouchGestures === 'true') return
    document.documentElement.dataset.pslTouchGestures = 'true'
    document.documentElement.style.touchAction = 'none'
    attach(document)
  }

  const canvasElement = editor.Canvas.getElement()
  if (canvasElement) {
    canvasElement.style.touchAction = 'none'
    attach(canvasElement)
  }
  editor.on('canvas:frame:load', attachFrame)
  attachFrame()

  return () => {
    editor.off('canvas:frame:load', attachFrame)
    cleanups.splice(0).forEach((cleanup) => cleanup())
    pointers.clear()
    gesture = null
  }
}
