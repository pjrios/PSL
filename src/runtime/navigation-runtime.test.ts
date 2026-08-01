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
})
