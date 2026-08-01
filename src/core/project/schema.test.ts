import { describe, expect, it } from 'vitest'
import type { VisualBuilderProject } from './schema'
import { ProjectSchema } from './schema'

const validProject: VisualBuilderProject = {
  version: 1,
  name: 'Schema fixture',
  startPage: 'home',
  pages: [
    { id: 'home', name: 'Home', file: 'pages/home.html' },
    { id: 'practice', name: 'Practice', file: 'pages/practice.html' },
  ],
  connections: [],
}

describe('ProjectSchema', () => {
  it('accepts the milestone zero demo project', () => {
    expect(ProjectSchema.parse(validProject)).toEqual(validProject)
  })

  it('accepts root and nested HTML files from design exporters', () => {
    expect(ProjectSchema.safeParse({
      ...validProject,
      pages: [
        { id: 'home', name: 'Home', file: 'index.html' },
        { id: 'practice', name: 'Practice', file: 'figma/screens/practice.html' },
      ],
    }).success).toBe(true)
  })

  it('rejects unsafe page file paths', () => {
    expect(ProjectSchema.safeParse({
      ...validProject,
      pages: [{ id: 'home', name: 'Home', file: '../index.html' }],
    }).success).toBe(false)
  })

  it('rejects a start page that does not exist', () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      startPage: 'missing-page',
    })

    expect(result.success).toBe(false)
  })

  it('rejects duplicate page IDs', () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      pages: [...validProject.pages, validProject.pages[0]],
    })

    expect(result.success).toBe(false)
  })

  it('rejects navigation to an unknown page', () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      connections: [
        {
          id: 'connection-001',
          sourcePage: 'home',
          elementId: 'element-001',
          event: 'click',
          action: 'navigate',
          targetPage: 'missing-page',
        },
      ],
    })

    expect(result.success).toBe(false)
  })

  it('rejects unsafe external URL protocols', () => {
    const result = ProjectSchema.safeParse({
      ...validProject,
      connections: [{
        id: 'connection-url',
        sourcePage: 'home',
        elementId: 'home::button:1',
        event: 'click',
        action: 'url',
        url: 'javascript:alert(1)',
      }],
    })

    expect(result.success).toBe(false)
  })
})
