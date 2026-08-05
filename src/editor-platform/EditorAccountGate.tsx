import { useEffect, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { editorPlatformConfigured, editorSupabase, ensureEditorProject } from './client'
import type { EditorProjectRecord } from './client'

export interface EditorAccountContext {
  email: string
  isGuest: boolean
  project: EditorProjectRecord
  signOut: () => Promise<void>
  userId: string
}

const guestProject: EditorProjectRecord = {
  id: 'guest-local',
  name: 'Proyecto de invitado',
  owner_id: 'guest-local',
  project_data: {},
}

export function EditorAccountGate({ children }: { children: (account: EditorAccountContext) => ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [project, setProject] = useState<EditorProjectRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [guest, setGuest] = useState(false)

  useEffect(() => {
    if (!editorSupabase) {
      setLoading(false)
      return
    }
    let active = true
    void editorSupabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })
    const { data: subscription } = editorSupabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      if (!nextSession) setProject(null)
    })
    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return
    let active = true
    setLoading(true)
    void ensureEditorProject(session.user.id).then((nextProject) => {
      if (active) setProject(nextProject)
    }).catch((cause: unknown) => {
      if (active) setNotice(cause instanceof Error ? cause.message : 'No pudimos abrir tu proyecto.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [session?.user.id])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!editorSupabase) return
    setSubmitting(true)
    setNotice('')
    try {
      if (mode === 'signup') {
        const { data, error } = await editorSupabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() } },
        })
        if (error) throw error
        if (!data.session) setNotice('Cuenta creada. Revisa tu correo para confirmar el acceso.')
      } else {
        const { error } = await editorSupabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      }
    } catch (cause) {
      setNotice(cause instanceof Error ? cause.message : 'No pudimos completar el acceso.')
    } finally {
      setSubmitting(false)
    }
  }

  async function signOut() {
    if (!editorSupabase) return
    const { error } = await editorSupabase.auth.signOut()
    if (error) setNotice(error.message)
  }

  if (guest) {
    return children({
      email: 'Invitado',
      isGuest: true,
      project: guestProject,
      signOut: async () => setGuest(false),
      userId: 'guest-local',
    })
  }

  if (!editorPlatformConfigured) {
    return <main className="editor-account-screen"><section className="editor-account-card"><strong>Falta configurar Supabase</strong><p>Añade la URL y la publishable key del proyecto del editor para habilitar cuentas, o continúa como invitado.</p><button className="editor-account-guest" onClick={() => setGuest(true)} type="button">Continuar como invitado</button></section></main>
  }

  if (loading) return <main className="editor-account-screen"><div className="editor-account-loading">Abriendo tu editor…</div></main>

  if (session && project) {
    return children({
      email: session.user.email ?? 'Cuenta del editor',
      isGuest: false,
      project,
      signOut,
      userId: session.user.id,
    })
  }

  return (
    <main className="editor-account-screen">
      <section className="editor-account-card" aria-label={mode === 'login' ? 'Acceder al editor' : 'Crear cuenta del editor'}>
        <div className="editor-account-brand"><span aria-hidden="true">G</span><div><strong>Editor visual</strong><p>Guarda tus sitios y conexiones de forma segura.</p></div></div>
        <div className="editor-account-tabs" role="tablist" aria-label="Acceso al editor">
          <button aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setNotice('') }} role="tab" type="button">Iniciar sesión</button>
          <button aria-selected={mode === 'signup'} className={mode === 'signup' ? 'active' : ''} onClick={() => { setMode('signup'); setNotice('') }} role="tab" type="button">Crear cuenta</button>
        </div>
        <form onSubmit={submit}>
          {mode === 'signup' && <label>Tu nombre<input autoComplete="name" onChange={(event) => setDisplayName(event.target.value)} required value={displayName} /></label>}
          <label>Correo electrónico<input autoComplete="email" onChange={(event) => setEmail(event.target.value)} required type="email" value={email} /></label>
          <label>Contraseña<input autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={8} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          <button className="editor-account-primary" disabled={submitting} type="submit">{submitting ? 'Espera…' : mode === 'login' ? 'Entrar al editor' : 'Crear mi cuenta'}</button>
        </form>
        <div className="editor-account-separator"><span>o</span></div>
        <button className="editor-account-guest" onClick={() => setGuest(true)} type="button">Continuar como invitado</button>
        {notice && <p className="editor-account-notice" role="status">{notice}</p>}
        <small>El trabajo de invitado se guarda solamente en este navegador. Las conexiones privadas requieren una cuenta.</small>
      </section>
    </main>
  )
}
