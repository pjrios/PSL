import type { Editor } from 'grapesjs'

const starterStyles = `<style>
.psl-starter-section{width:100%;padding:clamp(28px,5vw,64px);color:#17302e;background:#f7faf9;font-family:Inter,ui-sans-serif,system-ui,sans-serif}
.psl-starter-grid{display:grid;gap:20px;align-items:stretch}
.psl-starter-grid--2{grid-template-columns:repeat(2,minmax(0,1fr))}
.psl-starter-grid--3{grid-template-columns:repeat(3,minmax(0,1fr))}
.psl-starter-grid--aside{grid-template-columns:minmax(180px,.35fr) minmax(0,1fr)}
.psl-starter-card{min-width:0;padding:24px;background:#fff;border:1px solid #d8e3e1;border-radius:16px;box-shadow:0 10px 24px rgba(20,55,52,.07)}
.psl-starter-card h2,.psl-starter-card h3{margin:0 0 10px;color:#173f3d;line-height:1.15}
.psl-starter-card p{margin:0;color:#58706c;line-height:1.6}
.psl-starter-eyebrow{margin:0 0 10px!important;color:#6d53d9!important;font-size:12px;font-weight:800;letter-spacing:.1em;text-transform:uppercase}
.psl-starter-button{display:inline-block;margin-top:20px;padding:11px 16px;color:#fff!important;background:#6f52dc;border-radius:8px;text-decoration:none;font-weight:800}
.psl-starter-visual{min-height:240px;display:grid;place-items:center;padding:24px;color:#e9fffa;background:linear-gradient(135deg,#126f69,#243f5f 58%,#7456df);border-radius:18px;text-align:center}
.psl-starter-visual strong{display:block;font-size:22px}.psl-starter-visual span{display:block;margin-top:7px;opacity:.8}
.psl-starter-number{width:36px;height:36px;display:grid;place-items:center;margin-bottom:32px;color:#fff;background:#6f52dc;border-radius:10px;font-weight:850}
@media(max-width:767px){.psl-starter-grid--2,.psl-starter-grid--3,.psl-starter-grid--aside{grid-template-columns:1fr}.psl-starter-section{padding:24px 18px}}
</style>`

export const starterLayoutBlocks = {
  column1: `<section class="psl-starter-section" data-gjs-name="Sección destacada">
    <div class="psl-starter-card" style="max-width:780px;margin:0 auto;text-align:center">
      <p class="psl-starter-eyebrow">Presenta tu idea</p>
      <h2 style="font-size:clamp(30px,5vw,54px)">Un título claro que invite a continuar</h2>
      <p style="max-width:620px;margin:0 auto">Explica aquí el propósito de esta sección. Puedes editar el texto, los colores y el botón.</p>
      <a class="psl-starter-button" href="#">Conoce más</a>
    </div>
  </section>${starterStyles}`,
  column2: `<section class="psl-starter-section" data-gjs-name="Imagen y texto">
    <div class="psl-starter-grid psl-starter-grid--2">
      <div class="psl-starter-visual" data-gjs-name="Imagen de ejemplo"><div><strong>Tu imagen aquí</strong><span>Reemplaza este bloque por una foto o video</span></div></div>
      <article class="psl-starter-card" data-gjs-name="Contenido">
        <p class="psl-starter-eyebrow">Destaca lo importante</p>
        <h2>Combina una imagen con una explicación</h2>
        <p>Este diseño funciona bien para presentar un proyecto, una actividad, una persona o un servicio.</p>
        <a class="psl-starter-button" href="#">Ver detalles</a>
      </article>
    </div>
  </section>${starterStyles}`,
  column3: `<section class="psl-starter-section" data-gjs-name="Tres tarjetas">
    <div class="psl-starter-grid psl-starter-grid--3">
      <article class="psl-starter-card"><div class="psl-starter-number">1</div><h3>Primer beneficio</h3><p>Describe una idea principal con una frase breve y fácil de entender.</p></article>
      <article class="psl-starter-card"><div class="psl-starter-number">2</div><h3>Segundo beneficio</h3><p>Cambia el texto, el color o agrega una imagen para personalizar esta tarjeta.</p></article>
      <article class="psl-starter-card"><div class="psl-starter-number">3</div><h3>Tercer beneficio</h3><p>Las tarjetas se acomodan automáticamente en pantallas pequeñas.</p></article>
    </div>
  </section>${starterStyles}`,
  'column3-7': `<section class="psl-starter-section" data-gjs-name="Barra lateral y contenido">
    <div class="psl-starter-grid psl-starter-grid--aside">
      <aside class="psl-starter-card" style="background:#e9e4ff;border-color:#d1c7ff"><p class="psl-starter-eyebrow">En resumen</p><h3>Idea clave</h3><p>Usa esta columna para una nota, dato o llamada de atención.</p></aside>
      <article class="psl-starter-card"><h2>Contenido principal</h2><p>La columna ancha ofrece espacio para explicar el tema con más detalle. Puedes añadir imágenes, listas, botones u otros componentes dentro de ella.</p><a class="psl-starter-button" href="#">Continuar</a></article>
    </div>
  </section>${starterStyles}`,
} as const

const imagePlaceholder = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#126f69"/><stop offset="1" stop-color="#7456df"/></linearGradient></defs><rect width="1200" height="675" rx="28" fill="url(#g)"/><circle cx="600" cy="285" r="72" fill="none" stroke="#fff" stroke-width="18" opacity=".85"/><path d="M310 520 485 355l110 103 96-83 199 145H310Z" fill="#fff" opacity=".82"/><text x="600" y="600" fill="#fff" font-family="Arial,sans-serif" font-size="34" text-anchor="middle">Haz doble clic para reemplazar esta imagen</text></svg>`)}`

export function configureStarterBlocks(editor: Editor) {
  Object.entries(starterLayoutBlocks).forEach(([id, content]) => {
    const block = editor.BlockManager.get(id)
    if (!block) return
    const labels: Record<string, string> = {
      column1: 'Sección destacada',
      column2: 'Imagen + texto',
      column3: 'Tres tarjetas',
      'column3-7': 'Barra lateral',
    }
    block.set({ category: 'Diseño', content, label: labels[id] })
  })

  editor.BlockManager.get('text-basic')?.set({
    category: 'Diseño',
    label: 'Texto con título',
    content: `<section class="psl-starter-section"><div class="psl-starter-card"><h2>Título de la sección</h2><p>Escribe aquí una explicación clara. Puedes seleccionar cualquier texto para cambiar su tamaño, color y estilo.</p></div></section>${starterStyles}`,
  })
  editor.BlockManager.get('quote')?.set({
    category: 'Diseño',
    label: 'Cita',
    content: '<blockquote style="margin:24px;padding:24px 28px;color:#253e3b;background:#f1f7f5;border-left:5px solid #6f52dc;border-radius:0 12px 12px 0;font:600 20px/1.5 Georgia,serif">“Escribe aquí una frase importante que quieras destacar.”<footer style="margin-top:12px;color:#617773;font:500 14px/1.4 Inter,system-ui,sans-serif">— Nombre de la persona</footer></blockquote>',
  })
  editor.BlockManager.get('link-block')?.set({ category: 'Diseño', label: 'Enlace destacado' })
  editor.BlockManager.get('text')?.set({
    category: 'Elementos',
    label: 'Texto',
    content: { type: 'text', content: 'Escribe aquí tu texto.', style: { padding: '10px', color: '#263b38', 'line-height': '1.6' } },
  })
  editor.BlockManager.get('link')?.set({
    category: 'Elementos',
    label: 'Enlace',
    content: { type: 'link', content: 'Conoce más →', style: { color: '#5f45cf', 'font-weight': '700' } },
  })
  editor.BlockManager.get('image')?.set({
    category: 'Elementos',
    label: 'Imagen',
    content: { type: 'image', attributes: { alt: 'Imagen de ejemplo', src: imagePlaceholder }, style: { display: 'block', width: '100%', 'max-width': '900px', 'border-radius': '14px' } },
  })
  editor.BlockManager.get('video')?.set({ category: 'Elementos', label: 'Video' })
  editor.BlockManager.get('map')?.set({ category: 'Elementos', label: 'Mapa' })

  editor.BlockManager.get('form')?.set({
    category: 'Formularios',
    label: 'Formulario de contacto',
    content: `<form style="display:grid;gap:14px;max-width:560px;padding:28px;color:#243d39;background:#fff;border:1px solid #d8e3e1;border-radius:16px;box-shadow:0 12px 30px rgba(20,55,52,.08)">
      <h2 style="margin:0">Contáctanos</h2><p style="margin:0 0 8px;color:#627773">Completa el formulario y te responderemos pronto.</p>
      <label style="display:grid;gap:6px;font-weight:700">Nombre<input name="name" placeholder="Tu nombre" style="min-height:44px;padding:0 12px;border:1px solid #b9cbc7;border-radius:8px"></label>
      <label style="display:grid;gap:6px;font-weight:700">Correo<input name="email" type="email" placeholder="nombre@ejemplo.com" style="min-height:44px;padding:0 12px;border:1px solid #b9cbc7;border-radius:8px"></label>
      <label style="display:grid;gap:6px;font-weight:700">Mensaje<textarea name="message" placeholder="¿Cómo podemos ayudarte?" style="min-height:120px;padding:12px;border:1px solid #b9cbc7;border-radius:8px"></textarea></label>
      <button type="submit" style="min-height:44px;color:#fff;background:#6f52dc;border:0;border-radius:8px;font-weight:800">Enviar mensaje</button>
    </form>`,
  })
  ;['input', 'textarea', 'select', 'button', 'label', 'checkbox', 'radio'].forEach((id) => {
    editor.BlockManager.get(id)?.set('category', 'Formularios')
  })
}
