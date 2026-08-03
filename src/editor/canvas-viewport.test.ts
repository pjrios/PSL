import { describe, expect, it } from 'vitest'
import {
  MAX_CANVAS_ZOOM,
  MIN_CANVAS_ZOOM,
  clampCanvasZoom,
  stepCanvasZoom,
} from './canvas-viewport'

describe('canvas viewport zoom', () => {
  it('keeps zoom inside the supported range', () => {
    expect(clampCanvasZoom(12)).toBe(MIN_CANVAS_ZOOM)
    expect(clampCanvasZoom(64.6)).toBe(65)
    expect(clampCanvasZoom(140)).toBe(MAX_CANVAS_ZOOM)
  })

  it('uses predictable toolbar steps', () => {
    expect(stepCanvasZoom(50, 1)).toBe(60)
    expect(stepCanvasZoom(50, -1)).toBe(40)
    expect(stepCanvasZoom(95, 1)).toBe(MAX_CANVAS_ZOOM)
    expect(stepCanvasZoom(30, -1)).toBe(MIN_CANVAS_ZOOM)
  })
})
