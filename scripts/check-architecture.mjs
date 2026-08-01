import { readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'
import process from 'node:process'

const sourceRoot = resolve('src')
const codeExtensions = new Set(['.ts', '.tsx'])
const importPattern = /(?:from\s+|import\s*\()['"]([^'"]+)['"]/g
const violations = []

async function collectFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = join(directory, entry.name)
      return entry.isDirectory() ? collectFiles(path) : [path]
    }),
  )

  return nested.flat().filter((path) => codeExtensions.has(extname(path)))
}

function normalized(path) {
  return path.split(sep).join('/')
}

function report(file, specifier, rule) {
  violations.push(`${normalized(relative(process.cwd(), file))}: ${rule} (${specifier})`)
}

for (const file of await collectFiles(sourceRoot)) {
  const source = await readFile(file, 'utf8')
  const filePath = normalized(relative(sourceRoot, file))
  const imports = [...source.matchAll(importPattern)].map((match) => match[1])

  for (const specifier of imports) {
    const targetPath = specifier.startsWith('.')
      ? normalized(relative(sourceRoot, resolve(dirname(file), specifier)))
      : null

    if (filePath.startsWith('core/')) {
      if (targetPath && /^(?:app|demo|modules|runtime)(?:\/|$)/.test(targetPath)) {
        report(file, specifier, 'core cannot depend on higher layers')
      }
      if (['react', 'grapesjs', 'jszip', 'dompurify'].includes(specifier)) {
        report(file, specifier, 'core must remain framework independent')
      }
    }

    if (filePath.startsWith('runtime/')) {
      if (targetPath && /^(?:app|demo|modules)(?:\/|$)/.test(targetPath)) {
        report(file, specifier, 'runtime cannot depend on the editor')
      }
      if (['react', 'react-dom', 'grapesjs'].includes(specifier)) {
        report(file, specifier, 'runtime must remain standalone')
      }
    }

    const moduleMatch = filePath.match(/^modules\/([^/]+)\//)
    if (moduleMatch && targetPath) {
      const currentModule = moduleMatch[1]
      const crossModuleMatch = targetPath.match(/^modules\/([^/]+)(?:\/(.+))?$/)
      if (crossModuleMatch && crossModuleMatch[1] !== currentModule) {
        const internalPath = crossModuleMatch[2]
        if (internalPath && internalPath !== 'index') {
          report(file, specifier, 'modules must consume another module through its public index')
        }
      }
    }
  }
}

if (violations.length > 0) {
  console.error('Architecture boundary violations:\n')
  console.error(violations.map((violation) => `- ${violation}`).join('\n'))
  process.exit(1)
}

console.log('Architecture boundaries are valid.')
