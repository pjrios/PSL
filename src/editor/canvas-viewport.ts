export const MIN_CANVAS_ZOOM = 25
export const MAX_CANVAS_ZOOM = 100
export const CANVAS_ZOOM_STEP = 10

export type CanvasZoomMode = 'fit' | 'manual'

export function clampCanvasZoom(zoom: number) {
  if (!Number.isFinite(zoom)) return MAX_CANVAS_ZOOM
  return Math.min(MAX_CANVAS_ZOOM, Math.max(MIN_CANVAS_ZOOM, Math.round(zoom)))
}

export function stepCanvasZoom(zoom: number, direction: -1 | 1) {
  return clampCanvasZoom(zoom + direction * CANVAS_ZOOM_STEP)
}
