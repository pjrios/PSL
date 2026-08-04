import { describe, expect, it } from 'vitest'
import type { VisualBuilderProject } from './schema'
import { ProjectSchema } from './schema'

const validProject: VisualBuilderProject = {
  version: 2,
  elementOverrides: [],
  name: 'Schema fixture',
  startPage: 'home',
  pages: [
    { id: 'home', name: 'Home', file: 'pages/home.html' },
    { id: 'practice', name: 'Practice', file: 'pages/practice.html' },
  ],
  connections: [],
}

describe('ProjectSchema', () => {
  it('migrates version 1 manifests to version 2', () => {
    const migrated = ProjectSchema.parse({
      ...validProject,
      version: 1,
      elementOverrides: undefined,
    })

    expect(migrated.version).toBe(2)
    expect(migrated.elementOverrides).toEqual([])
  })

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

  it('validates project authentication routes', () => {
    expect(ProjectSchema.safeParse({
      ...validProject,
      pages: validProject.pages.map((page) => ({
        ...page,
        access: page.id === 'home' ? 'guestOnly' : 'authenticated',
      })),
      authentication: {
        provider: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        loginPage: 'home',
        afterLoginPage: 'practice',
        afterLogoutPage: 'home',
      },
    }).success).toBe(true)

    expect(ProjectSchema.safeParse({
      ...validProject,
      authentication: {
        provider: 'supabase',
        projectUrl: 'https://school.supabase.co',
        publishableKey: 'sb_publishable_test_key',
        loginPage: 'missing',
        afterLoginPage: 'home',
        afterLogoutPage: 'home',
      },
    }).success).toBe(false)
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

  it('requires current-user single-row bindings to reference a data source', () => {
    expect(ProjectSchema.safeParse({
      ...validProject,
      bindings: [{
        id: 'profile-name',
        pageId: 'home',
        elementId: 'home::h1:1',
        target: 'text',
        contextKey: 'record',
        sourceMode: 'first',
        field: 'display_name',
      }],
    }).success).toBe(false)
  })

  it('rejects duplicate overrides for the same element', () => {
    const override = {
      pageId: 'home',
      elementId: 'home::button:1',
      content: { text: 'Continue' },
    }
    expect(ProjectSchema.safeParse({
      ...validProject,
      elementOverrides: [override, override],
    }).success).toBe(false)
  })

  it('validates generic motion activities and their data references', () => {
    const activity = {
      id: 'practice-motion',
      pageId: 'practice',
      elementId: 'practice::section:1',
      input: { type: 'camera' as const, durationMs: 3000 },
      reference: { type: 'url' as const, url: 'https://media.example/reference.mp4' },
      features: { hands: true, pose: true, face: false },
      passingScore: 75,
    }
    expect(ProjectSchema.safeParse({ ...validProject, motionActivities: [activity] }).success)
      .toBe(true)
    expect(ProjectSchema.safeParse({
      ...validProject,
      motionActivities: [{
        ...activity,
        reference: {
          type: 'data',
          dataSourceId: 'missing',
          contextKey: 'record',
          videoField: 'media_url',
          templateField: 'motion_reference',
        },
      }],
    }).success).toBe(false)
  })
})
