import { describe, expect, it, vi } from 'vitest'
import { createPreviewController, navigatePreviewToPage } from './preview-controller'

describe('preview controller', () => {
  it('starts and stops idempotently', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const controller = createPreviewController({ onStart, onStop })

    controller.start()
    controller.start()
    expect(controller.isActive()).toBe(true)
    expect(onStart).toHaveBeenCalledTimes(1)

    controller.stop()
    controller.stop()
    expect(controller.isActive()).toBe(false)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('uses one state for repeated toggles', () => {
    const onStart = vi.fn()
    const onStop = vi.fn()
    const controller = createPreviewController({ onStart, onStop })

    controller.toggle()
    controller.toggle()
    controller.toggle()

    expect(controller.isActive()).toBe(true)
    expect(onStart).toHaveBeenCalledTimes(2)
    expect(onStop).toHaveBeenCalledTimes(1)
  })

  it('does not become active when preview preparation is rejected', () => {
    const onStop = vi.fn()
    const controller = createPreviewController({ onStart: () => false, onStop })

    expect(controller.start()).toBe(false)
    expect(controller.isActive()).toBe(false)
    expect(controller.stop()).toBe(false)
    expect(onStop).not.toHaveBeenCalled()
  })

  it('stays active while navigating to another page', () => {
    const onStop = vi.fn()
    const navigate = vi.fn()
    const controller = createPreviewController({ onStart: vi.fn(), onStop })
    controller.start()

    expect(navigatePreviewToPage('practice', {
      controller,
      navigate,
      pageExists: (pageId) => pageId === 'practice',
    })).toBe(true)

    expect(navigate).toHaveBeenCalledWith('practice')
    expect(controller.isActive()).toBe(true)
    expect(onStop).not.toHaveBeenCalled()
  })
})
