import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  cssForHtmlFile,
  prepareImportedPage,
  replaceAssetReferences,
  scopePageCss,
  suggestedPageName,
  templateZipAsDrafts,
} from './page-import'

const realTemplatePath = resolve(process.cwd(), 'startbootstrap-heroic-features-gh-pages.zip')

describe('page import helpers', () => {
  it('suggests readable page names from filenames', () => {
    expect(suggestedPageName('pages/contact-us.html')).toBe('Contact us')
    expect(suggestedPageName('practice_mobile.htm')).toBe('Practice mobile')
  })

  it('scopes selectors and global roots to the imported page', () => {
    const css = scopePageCss(':root { --ink: #123; } body, .card { color: var(--ink); }', 'page-7')

    expect(css).toContain('[data-psl-import-page="page-7"]')
    expect(css).toContain('--ink: #123')
    expect(css).not.toMatch(/(^|\})\s*\.card\s*\{/)
  })

  it('sanitizes markup and includes embedded and supplied CSS', () => {
    const page = prepareImportedPage({
      name: 'Imported',
      html: '<style>.hero{color:red}</style><main class="hero">Hello<script>alert(1)</script></main>',
      css: '.hero { font-weight: 700; }',
    }, 'imported-1')

    expect(page.html).toContain('data-psl-import-page="imported-1"')
    expect(page.html).toContain('<main class="hero">Hello</main>')
    expect(page.html).not.toContain('<script')
    expect(page.css).toMatch(/color:\s*red/)
    expect(page.css).toContain('font-weight: 700')
  })

  it('rewrites uploaded image references in HTML and CSS', () => {
    const result = replaceAssetReferences(
      '<img src="assets/hand.png">',
      '.hero { background: url(assets/hand.png); }',
      { 'hand.png': 'data:image/png;base64,abc' },
    )

    expect(result.html).toContain('src="data:image/png;base64,abc"')
    expect(result.css).toContain('url("data:image/png;base64,abc")')
  })

  it('pairs same-name styles and recognized shared styles', () => {
    expect(cssForHtmlFile('inicio.html', [
      { name: 'inicio.css', text: '.hero{}' },
      { name: 'catalogo.css', text: '.grid{}' },
      { name: 'styles.css', text: ':root{}' },
    ])).toBe('.hero{}\n:root{}')
  })

  it('imports HTML, linked CSS, nested assets, and ignores JavaScript from a template ZIP', async () => {
    const archive = new JSZip()
    archive.file('template/index.html', `<!doctype html><html><head>
      <title>Learning starter</title>
      <link rel="stylesheet" href="css/styles.css">
    </head><body><img src="assets/card.png"><script src="js/app.js"></script></body></html>`)
    archive.file('template/css/styles.css', '.card{background:url(../assets/card.png)}@media(max-width:600px){.card{width:100%}}')
    archive.file('template/assets/card.png', 'image-bytes')
    archive.file('template/js/app.js', 'alert(1)')
    const bytes = await archive.generateAsync({ type: 'uint8array' })

    const result = await templateZipAsDrafts(new Blob([
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    ]))
    const prepared = prepareImportedPage(result.drafts[0], 'learning')

    expect(result).toMatchObject({ assetCount: 1, cssCount: 1, externalStylesheetCount: 0, ignoredScriptCount: 1 })
    expect(result.drafts[0].name).toBe('Learning starter')
    expect(result.drafts[0].css).toContain('@media(max-width:600px)')
    expect(result.drafts[0].css).toContain('data:image/png;base64,')
    expect(prepared.html).not.toContain('<script')
    expect(prepared.html).toContain('data:image/png;base64,')
  })

  it.skipIf(!existsSync(realTemplatePath))('imports the Start Bootstrap Heroic Features archive', async () => {
    const bytes = await readFile(realTemplatePath)
    const result = await templateZipAsDrafts(new Blob([
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    ]))
    const prepared = prepareImportedPage(result.drafts[0], 'heroic-features')

    expect(result).toMatchObject({ assetCount: 1, cssCount: 1, externalStylesheetCount: 1, ignoredScriptCount: 1 })
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0].html).toContain('A warm welcome!')
    expect(result.drafts[0].html).toContain('data:image/x-icon;base64,')
    expect(result.drafts[0].css.length).toBeGreaterThan(200_000)
    expect(result.drafts[0].css).toContain('@media')
    expect(prepared.html).toContain('class="navbar navbar-expand-lg navbar-dark bg-dark"')
    expect(prepared.html).not.toContain('<script')
    expect(prepared.css).toContain('[data-psl-import-page="heroic-features"]')
    expect(prepared.css).toContain('@media')
    expect(prepared.css).toMatch(/navbar-collapse\.collapse[^}]*display:\s*flex\s*!important/i)
  })
})
