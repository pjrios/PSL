import { describe, expect, it } from 'vitest'
import { findBrokenConnections } from '../modules/navigation'
import { collectPreviewElementIds } from '../modules/preview'
import { demoBundle } from './demo-pages'

describe('demo project', () => {
  it('ships with usable connections for the test mode', () => {
    const elementIdsByPage = new Map(
      demoBundle.manifest.pages.map((page) => [
        page.id,
        collectPreviewElementIds(demoBundle, page),
      ]),
    )

    expect(demoBundle.manifest.connections).toHaveLength(4)
    expect(findBrokenConnections(demoBundle.manifest, elementIdsByPage)).toEqual([])
  })
})
