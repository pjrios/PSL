import { describe, expect, it } from 'vitest'
import { touchGestureTransform } from './canvas-gestures'

describe('canvas touch gestures', () => {
  it('pans with a two-finger midpoint drag', () => {
    expect(touchGestureTransform({
      coords: { x: 10, y: 20 },
      distance: 100,
      midpoint: { x: 200, y: 200 },
      zoom: 50,
    }, { x: 225, y: 170 }, 100)).toEqual({
      coords: { x: 35, y: -10 },
      zoom: 50,
    })
  })

  it('zooms around the midpoint and respects zoom limits', () => {
    expect(touchGestureTransform({
      coords: { x: 0, y: 0 },
      distance: 100,
      midpoint: { x: 100, y: 100 },
      zoom: 50,
    }, { x: 100, y: 100 }, 150)).toEqual({
      coords: { x: -50, y: -50 },
      zoom: 75,
    })
    expect(touchGestureTransform({
      coords: { x: 0, y: 0 },
      distance: 100,
      midpoint: { x: 100, y: 100 },
      zoom: 90,
    }, { x: 100, y: 100 }, 200).zoom).toBe(100)
  })
})
