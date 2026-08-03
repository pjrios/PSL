import { z } from 'zod'

export const PageSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  access: z.enum(['public', 'authenticated', 'guestOnly']).optional(),
  file: z.string().min(1).refine((value) => {
    const hasUnsafeSegment = value.split('/').some((segment) => segment === '..')
    return value.toLowerCase().endsWith('.html')
      && !value.startsWith('/')
      && !value.includes('\\')
      && !hasUnsafeSegment
  }, 'Page files must use a safe relative HTML path.'),
})

export const AuthenticationSchema = z.object({
  provider: z.literal('supabase'),
  projectUrl: z.string().url().refine((value) => new URL(value).protocol === 'https:',
    'Supabase project URLs must use https.'),
  publishableKey: z.string().min(10),
  loginPage: z.string().min(1),
  afterLoginPage: z.string().min(1),
  afterLogoutPage: z.string().min(1),
})

const DataRecordSchema = z.object({
  id: z.string().min(1),
}).catchall(z.unknown())

export const DataSourceSchema = z.discriminatedUnion('type', [
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal('static'),
    records: z.array(DataRecordSchema),
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal('rest'),
    recordUrl: z.string().url().refine((value) => {
      const protocol = new URL(value).protocol
      return (protocol === 'http:' || protocol === 'https:') && value.includes('{id}')
    }, 'REST record URLs must use http/https and include {id}.'),
    listUrl: z.string().url().refine((value) => {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    }, 'REST list URLs must use http or https.').optional(),
  }),
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    type: z.literal('supabase'),
    projectUrl: z.string().url().refine((value) => {
      const url = new URL(value)
      return url.protocol === 'https:'
    }, 'Supabase project URLs must use https.'),
    publishableKey: z.string().min(10),
    table: z.string().regex(/^[a-z][a-z0-9_]*$/),
    publishedOnly: z.boolean().default(true),
    requiresAuth: z.boolean().optional(),
    orderColumn: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
  }),
])

export const NavigationContextValueSchema = z.object({
  dataSourceId: z.string().min(1),
  recordId: z.string().min(1),
})

export const DataBindingSchema = z.object({
  id: z.string().min(1),
  pageId: z.string().min(1),
  elementId: z.string().min(1),
  target: z.enum(['text', 'src', 'alt', 'href', 'title', 'ariaLabel', 'value']),
  contextKey: z.string().min(1),
  dataSourceId: z.string().min(1).optional(),
  sourceMode: z.enum(['context', 'first']).optional(),
  field: z.string().min(1),
  fallback: z.string().max(10_000).optional(),
})

export const DataRepeaterSchema = z.object({
  id: z.string().min(1),
  pageId: z.string().min(1),
  elementId: z.string().min(1),
  dataSourceId: z.string().min(1),
  itemContext: z.string().min(1),
  pageSize: z.number().int().min(1).max(100).optional(),
  pagination: z.boolean().optional(),
})

export const ConnectionSchema = z.object({
  id: z.string().min(1),
  sourcePage: z.string().min(1),
  elementId: z.string().min(1),
  event: z.literal('click'),
  action: z.enum(['navigate', 'back', 'url']),
  targetPage: z.string().min(1).optional(),
  context: z.record(z.string(), NavigationContextValueSchema).optional(),
  url: z.string().url().refine((value) => {
    const protocol = new URL(value).protocol
    return protocol === 'http:' || protocol === 'https:'
  }, 'URLs must use http or https.').optional(),
})

export const StyleDeclarationSchema = z.object({
  color: z.string().max(200).optional(),
  backgroundColor: z.string().max(200).optional(),
  fontSize: z.string().max(100).optional(),
  fontWeight: z.string().max(100).optional(),
  textAlign: z.string().max(100).optional(),
  display: z.string().max(100).optional(),
  flexDirection: z.string().max(100).optional(),
  justifyContent: z.string().max(100).optional(),
  justifyItems: z.string().max(100).optional(),
  alignItems: z.string().max(100).optional(),
  flexWrap: z.string().max(100).optional(),
  objectFit: z.string().max(100).optional(),
  objectPosition: z.string().max(100).optional(),
  padding: z.string().max(100).optional(),
  paddingTop: z.string().max(100).optional(),
  paddingRight: z.string().max(100).optional(),
  paddingBottom: z.string().max(100).optional(),
  paddingLeft: z.string().max(100).optional(),
  margin: z.string().max(100).optional(),
  marginTop: z.string().max(100).optional(),
  marginRight: z.string().max(100).optional(),
  marginBottom: z.string().max(100).optional(),
  marginLeft: z.string().max(100).optional(),
  gap: z.string().max(100).optional(),
  rowGap: z.string().max(100).optional(),
  columnGap: z.string().max(100).optional(),
  width: z.string().max(100).optional(),
  height: z.string().max(100).optional(),
  borderColor: z.string().max(200).optional(),
  borderWidth: z.string().max(100).optional(),
  borderRadius: z.string().max(100).optional(),
  boxShadow: z.string().max(300).optional(),
  opacity: z.string().max(100).optional(),
  visibility: z.string().max(100).optional(),
  transform: z.string().max(300).optional(),
  transition: z.string().max(300).optional(),
})

export const StyleStatesSchema = z.object({
  base: StyleDeclarationSchema.optional(),
  hover: StyleDeclarationSchema.optional(),
  focus: StyleDeclarationSchema.optional(),
  active: StyleDeclarationSchema.optional(),
  disabled: StyleDeclarationSchema.optional(),
})

export const ElementOverrideSchema = z.object({
  pageId: z.string().min(1),
  elementId: z.string().min(1),
  content: z.object({
    text: z.string().max(10_000).optional(),
    src: z.string().max(4_500_000).optional(),
    alt: z.string().max(1_000).optional(),
    href: z.string().max(10_000).optional(),
    title: z.string().max(1_000).optional(),
    ariaLabel: z.string().max(1_000).optional(),
  }).optional(),
  styles: z.object({
    desktop: StyleStatesSchema.optional(),
    tablet: StyleStatesSchema.optional(),
    mobile: StyleStatesSchema.optional(),
  }).optional(),
})

const projectFields = {
  name: z.string().min(1),
  startPage: z.string().min(1),
  pages: z.array(PageSchema).min(1),
  connections: z.array(ConnectionSchema),
  dataSources: z.array(DataSourceSchema).optional(),
  bindings: z.array(DataBindingSchema).optional(),
  repeaters: z.array(DataRepeaterSchema).optional(),
  authentication: AuthenticationSchema.optional(),
}

function validateReferences(
  project: {
    startPage: string
    pages: Array<{ id: string }>
    connections: Array<z.infer<typeof ConnectionSchema>>
    elementOverrides?: Array<z.infer<typeof ElementOverrideSchema>>
    dataSources?: Array<z.infer<typeof DataSourceSchema>>
    bindings?: Array<z.infer<typeof DataBindingSchema>>
    repeaters?: Array<z.infer<typeof DataRepeaterSchema>>
    authentication?: z.infer<typeof AuthenticationSchema>
  },
  context: z.RefinementCtx,
) {
  const pageIds = project.pages.map((page) => page.id)
  const uniquePageIds = new Set(pageIds)

  if (uniquePageIds.size !== pageIds.length) {
    context.addIssue({ code: 'custom', path: ['pages'], message: 'Page IDs must be unique.' })
  }

  if (!uniquePageIds.has(project.startPage)) {
    context.addIssue({
      code: 'custom',
      path: ['startPage'],
      message: 'The start page must reference an existing page.',
    })
  }

  if (project.authentication) {
    for (const [field, pageId] of [
      ['loginPage', project.authentication.loginPage],
      ['afterLoginPage', project.authentication.afterLoginPage],
      ['afterLogoutPage', project.authentication.afterLogoutPage],
    ] as const) {
      if (!uniquePageIds.has(pageId)) {
        context.addIssue({
          code: 'custom',
          path: ['authentication', field],
          message: 'Authentication routes must reference existing pages.',
        })
      }
    }
  }

  const dataSourceIds = project.dataSources?.map((source) => source.id) ?? []
  if (new Set(dataSourceIds).size !== dataSourceIds.length) {
    context.addIssue({
      code: 'custom',
      path: ['dataSources'],
      message: 'Data source IDs must be unique.',
    })
  }
  project.dataSources?.forEach((source, index) => {
    if (source.type !== 'static') return
    const recordIds = source.records.map((record) => record.id)
    if (new Set(recordIds).size !== recordIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['dataSources', index, 'records'],
        message: 'Record IDs must be unique within a data source.',
      })
    }
  })

  project.connections.forEach((connection, index) => {
    if (!uniquePageIds.has(connection.sourcePage)) {
      context.addIssue({
        code: 'custom',
        path: ['connections', index, 'sourcePage'],
        message: 'The source page must exist.',
      })
    }

    if (connection.action === 'navigate'
      && (!connection.targetPage || !uniquePageIds.has(connection.targetPage))) {
      context.addIssue({
        code: 'custom',
        path: ['connections', index, 'targetPage'],
        message: 'Navigate actions must reference an existing target page.',
      })
    }

    if (connection.action === 'url' && !connection.url) {
      context.addIssue({
        code: 'custom',
        path: ['connections', index, 'url'],
        message: 'URL actions must include a valid URL.',
      })
    }

    for (const value of Object.values(connection.context ?? {})) {
      if (!project.dataSources?.some((source) => source.id === value.dataSourceId)) {
        context.addIssue({
          code: 'custom',
          path: ['connections', index, 'context'],
          message: 'Navigation context must reference an existing data source.',
        })
      }
    }
  })

  project.bindings?.forEach((binding, index) => {
    if (!uniquePageIds.has(binding.pageId)) {
      context.addIssue({
        code: 'custom',
        path: ['bindings', index, 'pageId'],
        message: 'Data bindings must reference an existing page.',
      })
    }
    if (binding.sourceMode === 'first' && !binding.dataSourceId) {
      context.addIssue({
        code: 'custom',
        path: ['bindings', index, 'dataSourceId'],
        message: 'Single-row data bindings must reference an existing data source.',
      })
    }
    if (binding.dataSourceId
      && !project.dataSources?.some((source) => source.id === binding.dataSourceId)) {
      context.addIssue({
        code: 'custom',
        path: ['bindings', index, 'dataSourceId'],
        message: 'Data bindings must reference an existing data source.',
      })
    }
  })

  project.repeaters?.forEach((repeater, index) => {
    if (!uniquePageIds.has(repeater.pageId)) {
      context.addIssue({
        code: 'custom',
        path: ['repeaters', index, 'pageId'],
        message: 'Data repeaters must reference an existing page.',
      })
    }
    if (!project.dataSources?.some((source) => source.id === repeater.dataSourceId)) {
      context.addIssue({
        code: 'custom',
        path: ['repeaters', index, 'dataSourceId'],
        message: 'Data repeaters must reference an existing data source.',
      })
    }
  })

  const overrideKeys = new Set<string>()
  project.elementOverrides?.forEach((override, index) => {
    if (!uniquePageIds.has(override.pageId)) {
      context.addIssue({
        code: 'custom',
        path: ['elementOverrides', index, 'pageId'],
        message: 'The override page must exist.',
      })
    }

    const key = `${override.pageId}:${override.elementId}`
    if (overrideKeys.has(key)) {
      context.addIssue({
        code: 'custom',
        path: ['elementOverrides', index],
        message: 'Element overrides must be unique per page and element.',
      })
    }
    overrideKeys.add(key)
  })
}

const LegacyProjectSchema = z.object({
  version: z.literal(1),
  ...projectFields,
}).superRefine(validateReferences)

export const ProjectV2Schema = z.object({
  version: z.literal(2),
  ...projectFields,
  elementOverrides: z.array(ElementOverrideSchema),
}).superRefine(validateReferences)

export const ProjectSchema = z.union([LegacyProjectSchema, ProjectV2Schema])
  .transform((project): z.infer<typeof ProjectV2Schema> => {
    if (project.version === 2) return project
    return { ...project, version: 2, elementOverrides: [] }
  })

export type StyleDeclaration = z.infer<typeof StyleDeclarationSchema>
export type StyleStates = z.infer<typeof StyleStatesSchema>
export type ElementOverride = z.infer<typeof ElementOverrideSchema>
export type ProjectPage = z.infer<typeof PageSchema>
export type ProjectAuthentication = z.infer<typeof AuthenticationSchema>
export type ProjectConnection = z.infer<typeof ConnectionSchema>
export type DataSource = z.infer<typeof DataSourceSchema>
export type DataBinding = z.infer<typeof DataBindingSchema>
export type DataRepeater = z.infer<typeof DataRepeaterSchema>
export type NavigationContextValue = z.infer<typeof NavigationContextValueSchema>
export type NavigationContext = Record<string, NavigationContextValue>
export type VisualBuilderProject = z.infer<typeof ProjectV2Schema>
