export const authPageTemplateHtml = `
<main class="psl-auth-page">
  <section class="psl-auth-brand" aria-label="Bienvenida">
    <a class="psl-auth-logo" href="#" aria-label="Inicio">
      <span aria-hidden="true">P</span>
      <strong>Tu plataforma</strong>
    </a>
    <div class="psl-auth-intro">
      <p class="psl-auth-eyebrow">Aprende · Practica · Avanza</p>
      <h1>Todo lo que necesitas, en un solo lugar.</h1>
      <p>Inicia sesión para continuar o crea una cuenta nueva en menos de un minuto.</p>
    </div>
    <div class="psl-auth-orbit" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <p class="psl-auth-copyright">Una experiencia segura con Supabase</p>
  </section>

  <section class="psl-auth-content">
    <div class="psl-auth-mobile-logo" aria-hidden="true"><span>P</span><strong>Tu plataforma</strong></div>

    <div class="psl-auth-shell" data-psl-auth-visible="signed-out">
      <div class="psl-auth-tabs" role="tablist" aria-label="Acceso a la cuenta">
        <button aria-selected="true" data-psl-auth-tab="login" role="tab" type="button">Iniciar sesión</button>
        <button aria-selected="false" data-psl-auth-tab="signup" role="tab" tabindex="-1" type="button">Crear cuenta</button>
      </div>

      <div class="psl-auth-panels">
        <form class="psl-auth-form psl-auth-login-form" data-psl-auth-action="login" data-psl-auth-panel="login">
          <header>
            <p class="psl-auth-kicker">Te damos la bienvenida</p>
            <h2>Inicia sesión</h2>
            <p>Usa el correo y la contraseña de tu cuenta.</p>
          </header>
          <label class="psl-auth-field">
            <span>Correo electrónico</span>
            <input name="email" type="email" autocomplete="email" inputmode="email" placeholder="nombre@ejemplo.com" required>
          </label>
          <label class="psl-auth-field">
            <span>Contraseña</span>
            <input name="password" type="password" autocomplete="current-password" placeholder="Tu contraseña" required>
          </label>
          <button class="psl-auth-submit" type="submit">Entrar a mi cuenta</button>
          <p class="psl-auth-status" data-psl-auth-status aria-live="polite"></p>
          <p class="psl-auth-helper">¿Aún no tienes cuenta? Selecciona <strong>Crear cuenta</strong> arriba.</p>
        </form>

        <form class="psl-auth-form psl-auth-signup-form" data-psl-auth-action="signup" data-psl-auth-panel="signup" hidden>
          <header>
            <p class="psl-auth-kicker">Comienza hoy</p>
            <h2>Crea tu cuenta</h2>
            <p>Solo necesitas un correo y una contraseña segura.</p>
          </header>
          <label class="psl-auth-field">
            <span>Correo electrónico</span>
            <input name="email" type="email" autocomplete="email" inputmode="email" placeholder="nombre@ejemplo.com" required>
          </label>
          <label class="psl-auth-field">
            <span>Contraseña</span>
            <input name="password" type="password" autocomplete="new-password" minlength="8" placeholder="Mínimo 8 caracteres" required>
          </label>
          <button class="psl-auth-submit" type="submit">Crear mi cuenta</button>
          <p class="psl-auth-status" data-psl-auth-status aria-live="polite"></p>
          <p class="psl-auth-helper">¿Ya tienes cuenta? Selecciona <strong>Iniciar sesión</strong> arriba.</p>
        </form>
      </div>
    </div>

    <div class="psl-auth-shell psl-auth-signed-in" data-psl-auth-visible="signed-in" hidden>
      <div class="psl-auth-success" aria-hidden="true">✓</div>
      <p class="psl-auth-kicker">Sesión activa</p>
      <h2>¡Qué bueno verte!</h2>
      <p>Ingresaste como <strong data-psl-auth-field="email">usuario@ejemplo.com</strong>.</p>
      <button class="psl-auth-submit" data-psl-auth-action="logout" type="button">Cerrar sesión</button>
    </div>

    <p class="psl-auth-legal">Al continuar, aceptas los términos de uso y la política de privacidad.</p>
  </section>
</main>`

export const authPageTemplateCss = `
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@600;700;800&display=swap');

* { box-sizing: border-box; }
html, body { min-height: 100%; margin: 0; }
body { color: #17222b; background: #f8faf9; font-family: 'DM Sans', system-ui, sans-serif; }
button, input { font: inherit; }
.psl-auth-page { min-height: 100vh; display: grid; grid-template-columns: minmax(320px, .92fr) minmax(500px, 1.08fr); background: #f8faf9; }
.psl-auth-brand { position: relative; min-height: 100vh; padding: clamp(32px, 5vw, 72px); overflow: hidden; display: flex; flex-direction: column; color: #fff; background: linear-gradient(145deg, #102f36 0%, #155d5b 52%, #1b8580 100%); isolation: isolate; }
.psl-auth-brand::before { content: ''; position: absolute; width: 540px; height: 540px; right: -250px; top: -210px; border: 1px solid rgba(255,255,255,.18); border-radius: 50%; box-shadow: 0 0 0 70px rgba(255,255,255,.035), 0 0 0 140px rgba(255,255,255,.025); z-index: -1; }
.psl-auth-logo, .psl-auth-mobile-logo { display: flex; align-items: center; gap: 12px; color: inherit; text-decoration: none; font-family: 'Manrope', sans-serif; }
.psl-auth-logo > span, .psl-auth-mobile-logo > span { width: 38px; height: 38px; display: grid; place-items: center; color: #155d5b; background: #d9fff5; border-radius: 11px; font-weight: 800; }
.psl-auth-logo strong, .psl-auth-mobile-logo strong { font-size: 17px; letter-spacing: -.02em; }
.psl-auth-intro { max-width: 570px; margin: auto 0; padding: 80px 0; }
.psl-auth-eyebrow, .psl-auth-kicker { margin: 0 0 12px; color: #78e6d7; font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; }
.psl-auth-intro h1 { max-width: 10ch; margin: 0; font-family: 'Manrope', sans-serif; font-size: clamp(42px, 5.4vw, 76px); line-height: 1.02; letter-spacing: -.055em; }
.psl-auth-intro > p:last-child { max-width: 48ch; margin: 26px 0 0; color: rgba(255,255,255,.74); font-size: clamp(16px, 1.5vw, 19px); line-height: 1.7; }
.psl-auth-copyright { margin: 0; color: rgba(255,255,255,.54); font-size: 12px; }
.psl-auth-orbit { position: absolute; right: 8%; bottom: 12%; width: 122px; height: 122px; border: 1px solid rgba(255,255,255,.2); border-radius: 50%; z-index: -1; }
.psl-auth-orbit::before { content: ''; position: absolute; inset: 25px; border: 1px solid rgba(255,255,255,.2); border-radius: 50%; }
.psl-auth-orbit span { position: absolute; width: 10px; height: 10px; background: #8cf2df; border-radius: 50%; box-shadow: 0 0 18px rgba(140,242,223,.8); }
.psl-auth-orbit span:nth-child(1) { top: -5px; left: 53px; }
.psl-auth-orbit span:nth-child(2) { right: 9px; bottom: 16px; width: 7px; height: 7px; }
.psl-auth-orbit span:nth-child(3) { left: 24px; top: 45px; width: 6px; height: 6px; }
.psl-auth-content { min-height: 100vh; padding: clamp(32px, 6vw, 88px); display: flex; flex-direction: column; justify-content: center; align-items: center; }
.psl-auth-mobile-logo { display: none; align-self: flex-start; margin-bottom: 42px; color: #154b4c; }
.psl-auth-shell { width: min(100%, 490px); }
.psl-auth-tabs { display: grid; grid-template-columns: 1fr 1fr; margin-bottom: 38px; padding: 5px; background: #e9efed; border-radius: 13px; }
.psl-auth-tabs button { min-height: 42px; display: grid; place-items: center; color: #64716f; background: transparent; border: 0; border-radius: 9px; font-size: 14px; font-weight: 700; cursor: pointer; transition: .2s ease; }
.psl-auth-tabs button:focus-visible { outline: 3px solid rgba(22,132,125,.28); outline-offset: 2px; }
.psl-auth-tabs button[aria-selected='true'] { color: #174d4c; background: #fff; box-shadow: 0 4px 18px rgba(17,59,58,.09); }
.psl-auth-panels { position: relative; }
.psl-auth-form { display: grid; gap: 20px; }
.psl-auth-form[hidden] { display: none; }
.psl-auth-form header { margin-bottom: 5px; }
.psl-auth-form h2, .psl-auth-signed-in h2 { margin: 0; font-family: 'Manrope', sans-serif; font-size: clamp(30px, 4vw, 42px); line-height: 1.15; letter-spacing: -.045em; }
.psl-auth-form header > p:last-child, .psl-auth-signed-in > p { margin: 12px 0 0; color: #667370; line-height: 1.6; }
.psl-auth-kicker { color: #167f78; }
.psl-auth-field { display: grid; gap: 8px; color: #273532; font-size: 13px; font-weight: 700; }
.psl-auth-field input { width: 100%; height: 52px; padding: 0 16px; color: #17222b; background: #fff; border: 1px solid #cbd7d4; border-radius: 11px; outline: 0; transition: border-color .2s, box-shadow .2s; }
.psl-auth-field input::placeholder { color: #9ba7a4; }
.psl-auth-field input:focus { border-color: #16847d; box-shadow: 0 0 0 4px rgba(22,132,125,.12); }
.psl-auth-submit { min-height: 54px; padding: 0 20px; display: flex; align-items: center; justify-content: center; gap: 12px; color: #fff; background: #157c75; border: 0; border-radius: 11px; box-shadow: 0 10px 24px rgba(21,124,117,.18); font-weight: 700; cursor: pointer; transition: transform .2s, background .2s; }
.psl-auth-submit:hover { background: #116a65; transform: translateY(-1px); }
.psl-auth-status { min-height: 20px; margin: -8px 0 0; color: #18756f; font-size: 13px; text-align: center; }
.psl-auth-status[role='alert'] { color: #b73d48; }
.psl-auth-helper { margin: -4px 0 0; color: #667370; font-size: 14px; text-align: center; }
.psl-auth-helper strong { color: #12756f; }
.psl-auth-signed-in { padding: clamp(30px, 5vw, 48px); text-align: center; background: #fff; border: 1px solid #dce5e2; border-radius: 22px; box-shadow: 0 24px 80px rgba(21,53,51,.1); }
.psl-auth-signed-in .psl-auth-submit { width: 100%; margin-top: 28px; }
.psl-auth-success { width: 54px; height: 54px; margin: 0 auto 22px; display: grid; place-items: center; color: #116b65; background: #dff8f2; border-radius: 50%; font-size: 25px; font-weight: 800; }
.psl-auth-legal { max-width: 490px; margin: 38px 0 0; color: #8a9693; font-size: 11px; line-height: 1.6; text-align: center; }

@media (max-width: 900px) {
  .psl-auth-page { grid-template-columns: minmax(250px, .72fr) minmax(430px, 1.28fr); }
  .psl-auth-brand { padding: 34px; }
  .psl-auth-intro h1 { font-size: clamp(36px, 6vw, 54px); }
  .psl-auth-content { padding: 48px; }
}

@media (max-width: 700px) {
  .psl-auth-page { display: block; }
  .psl-auth-brand { display: none; }
  .psl-auth-content { min-height: 100svh; padding: 28px clamp(20px, 7vw, 44px) 30px; justify-content: flex-start; }
  .psl-auth-mobile-logo { display: flex; }
  .psl-auth-shell { margin: auto 0; }
  .psl-auth-tabs { margin-bottom: 30px; }
  .psl-auth-form { gap: 17px; }
  .psl-auth-field input { height: 50px; }
  .psl-auth-legal { margin-top: 32px; }
}

@media (max-width: 380px) {
  .psl-auth-content { padding-left: 17px; padding-right: 17px; }
  .psl-auth-mobile-logo { margin-bottom: 28px; }
  .psl-auth-tabs { margin-bottom: 25px; }
  .psl-auth-form h2 { font-size: 29px; }
}

@media (prefers-reduced-motion: reduce) {
  .psl-auth-tabs button, .psl-auth-field input, .psl-auth-submit { transition: none; }
}
`
