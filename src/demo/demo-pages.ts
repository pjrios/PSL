import catalogHtml from '../../examples/three-screen-demo/pages/catalogo.html?raw'
import homeHtml from '../../examples/three-screen-demo/pages/inicio.html?raw'
import practiceHtml from '../../examples/three-screen-demo/pages/practica.html?raw'
import demoCss from '../../examples/three-screen-demo/styles/app.css?raw'
import handSvg from '../../examples/three-screen-demo/assets/hand.svg?raw'
import type { ProjectBundle, ProjectFile } from '../core/project'
import { demoProject } from './demo-project'

export const demoPages: Record<string, string> = {
  inicio: homeHtml,
  catalogo: catalogHtml,
  practica: practiceHtml,
}

export { demoCss }

const encoder = new TextEncoder()

function textFile(path: string, content: string, mediaType: string): ProjectFile {
  return { path, bytes: encoder.encode(content), mediaType }
}

export const demoBundle: ProjectBundle = {
  manifest: demoProject,
  files: [
    textFile('project.json', JSON.stringify(demoProject, null, 2), 'application/json'),
    textFile('pages/inicio.html', homeHtml, 'text/html'),
    textFile('pages/catalogo.html', catalogHtml, 'text/html'),
    textFile('pages/practica.html', practiceHtml, 'text/html'),
    textFile('styles/app.css', demoCss, 'text/css'),
    textFile('assets/hand.svg', handSvg, 'image/svg+xml'),
  ],
}
