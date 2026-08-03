import { describe, expect, it } from 'vitest'
import { pageTemplateById, pageTemplates } from './page-templates'

describe('page template catalog', () => {
  it('offers a varied set of responsive screen templates', () => {
    expect(pageTemplates).toHaveLength(6)
    expect(new Set(pageTemplates.map((template) => template.category)).size).toBeGreaterThanOrEqual(5)
    expect(pageTemplates.every((template) => template.css.includes('@media'))).toBe(true)
    expect(pageTemplates.every((template) => template.html.length > 500)).toBe(true)
  })

  it('keeps the access template wired to the authentication runtime', () => {
    const auth = pageTemplateById('auth')
    expect(auth?.html).toContain('data-psl-auth-action="login"')
    expect(auth?.html).toContain('data-psl-auth-action="signup"')
  })
})
