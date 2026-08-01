const unsafePathPattern = /(^|\/)\.\.(\/|$)|^\/|\\/

export function assertSafeProjectPath(path: string) {
  if (!path || unsafePathPattern.test(path)) {
    throw new Error(`Unsafe project path: ${path || '(empty)'}`)
  }
}

export function pageIdFromPath(path: string) {
  const filename = path.split('/').at(-1) ?? path
  return filename
    .replace(/\.html$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'page'
}

export function pageNameFromId(id: string) {
  return id
    .split('-')
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ')
}
