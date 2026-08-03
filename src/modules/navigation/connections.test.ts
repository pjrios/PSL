import { describe, expect, it } from 'vitest'
import type { VisualBuilderProject } from '../../core/project'
import { deleteConnection, findBrokenConnections, saveConnection } from './connections'

const project: VisualBuilderProject = {
  version: 2,
  elementOverrides: [],
  name: 'Navigation fixture',
  startPage: 'home',
  pages: [
    { id: 'home', name: 'Home', file: 'pages/home.html' },
    { id: 'practice', name: 'Practice', file: 'pages/practice.html' },
  ],
  connections: [],
}

describe('navigation connections', () => {
  it('saves and updates one click connection per element', () => {
    const withNavigation = saveConnection(project, {
      action: 'navigate',
      elementId: 'home::main:1/button:1',
      sourcePage: 'home',
      targetPage: 'practice',
    })
    const updated = saveConnection(withNavigation, {
      action: 'back',
      elementId: 'home::main:1/button:1',
      sourcePage: 'home',
    })

    expect(updated.connections).toHaveLength(1)
    expect(updated.connections[0]).toMatchObject({ action: 'back' })
    expect(updated.connections[0]).not.toHaveProperty('targetPage')
  })

  it('removes the selected element connection', () => {
    const connected = saveConnection(project, {
      action: 'navigate',
      elementId: 'home::main:1/button:1',
      sourcePage: 'home',
      targetPage: 'practice',
    })

    expect(deleteConnection(connected, 'home', 'home::main:1/button:1').connections).toEqual([])
  })

  it('reports connections whose source element disappeared', () => {
    const connected = saveConnection(project, {
      action: 'back',
      elementId: 'home::main:1/button:1',
      sourcePage: 'home',
    })
    const elements = new Map([
      ['home', new Set(['home::main:1/button:2'])],
      ['practice', new Set<string>()],
    ])

    expect(findBrokenConnections(connected, elements)).toHaveLength(1)
    expect(findBrokenConnections(connected, elements)[0].reason).toContain('elemento')
  })
})
