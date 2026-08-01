export type ProjectImportErrorCode =
  | 'invalid-archive'
  | 'invalid-manifest'
  | 'missing-page'
  | 'no-pages'
  | 'unsafe-path'

export class ProjectImportError extends Error {
  readonly code: ProjectImportErrorCode

  constructor(code: ProjectImportErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'ProjectImportError'
    this.code = code
  }
}
