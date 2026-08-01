import { z } from 'zod'

export const PageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  file: z.string().regex(/^pages\/.+\.html$/),
})

export const ConnectionSchema = z.object({
  id: z.string().min(1),
  sourcePage: z.string().min(1),
  elementId: z.string().min(1),
  event: z.literal('click'),
  action: z.enum(['navigate', 'back', 'url']),
  targetPage: z.string().min(1).optional(),
  url: z.string().url().optional(),
})

export const ProjectSchema = z
  .object({
    version: z.literal(1),
    name: z.string().min(1),
    startPage: z.string().min(1),
    pages: z.array(PageSchema).min(1),
    connections: z.array(ConnectionSchema),
  })
  .superRefine((project, context) => {
    const pageIds = project.pages.map((page) => page.id)
    const uniquePageIds = new Set(pageIds)

    if (uniquePageIds.size !== pageIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['pages'],
        message: 'Page IDs must be unique.',
      })
    }

    if (!uniquePageIds.has(project.startPage)) {
      context.addIssue({
        code: 'custom',
        path: ['startPage'],
        message: 'The start page must reference an existing page.',
      })
    }

    project.connections.forEach((connection, index) => {
      if (!uniquePageIds.has(connection.sourcePage)) {
        context.addIssue({
          code: 'custom',
          path: ['connections', index, 'sourcePage'],
          message: 'The source page must exist.',
        })
      }

      if (connection.action === 'navigate') {
        if (!connection.targetPage || !uniquePageIds.has(connection.targetPage)) {
          context.addIssue({
            code: 'custom',
            path: ['connections', index, 'targetPage'],
            message: 'Navigate actions must reference an existing target page.',
          })
        }
      }

      if (connection.action === 'url' && !connection.url) {
        context.addIssue({
          code: 'custom',
          path: ['connections', index, 'url'],
          message: 'URL actions must include a valid URL.',
        })
      }
    })
  })

export type ProjectPage = z.infer<typeof PageSchema>
export type ProjectConnection = z.infer<typeof ConnectionSchema>
export type VisualBuilderProject = z.infer<typeof ProjectSchema>
