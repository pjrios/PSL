export function relativeProjectPath(fromFile: string, toFile: string) {
  const fromParts = fromFile.split('/')
  fromParts.pop()
  const toParts = toFile.split('/')

  while (fromParts[0] && fromParts[0] === toParts[0]) {
    fromParts.shift()
    toParts.shift()
  }

  return [...fromParts.map(() => '..'), ...toParts].join('/') || './'
}
