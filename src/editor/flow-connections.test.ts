import { describe, expect, it, vi } from 'vitest'
import {
  FLOW_ACTION_ATTRIBUTE,
  FLOW_TARGET_ATTRIBUTE,
  INTERACTION_ANIMATION_ATTRIBUTE,
  installScreenFlowNavigation,
  readInteractionAnimation,
  readScreenFlowConnection,
  screenFlowAttributes,
} from './flow-connections'

describe('screen flow connections', () => {
  it('serializes and reads a screen destination', () => {
    const attributes = screenFlowAttributes('catalog')

    expect(attributes).toEqual({
      [FLOW_ACTION_ATTRIBUTE]: 'navigate',
      [FLOW_TARGET_ATTRIBUTE]: 'catalog',
    })
    expect(readScreenFlowConnection(attributes)).toEqual({
      action: 'navigate',
      targetPageId: 'catalog',
    })
  })

  it('ignores incomplete connection attributes', () => {
    expect(readScreenFlowConnection({ [FLOW_ACTION_ATTRIBUTE]: 'navigate' })).toBeNull()
    expect(readScreenFlowConnection({ [FLOW_TARGET_ATTRIBUTE]: 'catalog' })).toBeNull()
  })

  it('reads supported interaction animations and safely defaults unknown values', () => {
    expect(readInteractionAnimation({ [INTERACTION_ANIMATION_ATTRIBUTE]: 'lift' })).toBe('lift')
    expect(readInteractionAnimation({ [INTERACTION_ANIMATION_ATTRIBUTE]: 'spin-forever' })).toBe('none')
    expect(readInteractionAnimation({})).toBe('none')
  })

  it('navigates from a connected element only while preview is enabled', async () => {
    document.body.innerHTML = `
      <button ${FLOW_TARGET_ATTRIBUTE}="practice"><span>Start</span></button>
    `
    const navigate = vi.fn()
    let enabled = false
    const cleanup = installScreenFlowNavigation(document, {
      isEnabled: () => enabled,
      navigate,
      pageExists: (pageId) => pageId === 'practice',
    })
    const label = document.querySelector('span')!

    label.click()
    expect(navigate).not.toHaveBeenCalled()

    enabled = true
    label.click()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(navigate).toHaveBeenCalledWith('practice')

    cleanup()
  })
})
