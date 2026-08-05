import { AppShell } from './app/index'
import { OpenSourceEditor } from './editor'
import { EditorAccountGate } from './editor-platform'

export default function App() {
  const showLegacyEditor = new URLSearchParams(window.location.search).has('legacy')
  return <EditorAccountGate>{(account) => showLegacyEditor
    ? <AppShell />
    : <OpenSourceEditor
        accountEmail={account.email}
        editorProjectId={account.project.id}
        isGuest={account.isGuest}
        onSignOut={account.signOut}
      />}</EditorAccountGate>
}
