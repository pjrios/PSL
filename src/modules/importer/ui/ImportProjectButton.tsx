import { useRef, useState } from 'react'
import type { ProjectBundle } from '../../../core/project'
import { ProjectImportError } from '../zip/errors'
import { zipProjectImporter } from '../zip/ZipProjectImporter'

interface ImportProjectButtonProps {
  onImport: (bundle: ProjectBundle) => void
}

export function ImportProjectButton({ onImport }: ImportProjectButtonProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)

  async function importSelectedFile(file: File) {
    setIsImporting(true)
    setError(null)

    try {
      onImport(await zipProjectImporter.import(file))
    } catch (caughtError) {
      setError(
        caughtError instanceof ProjectImportError
          ? caughtError.message
          : 'No fue posible importar el proyecto.',
      )
    } finally {
      setIsImporting(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div className="import-control">
      <input
        accept=".zip,application/zip"
        aria-label="Seleccionar proyecto ZIP"
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void importSelectedFile(file)
        }}
        ref={inputRef}
        type="file"
      />
      <button
        className="button secondary"
        disabled={isImporting}
        onClick={() => inputRef.current?.click()}
        type="button"
      >
        {isImporting ? 'Importando…' : 'Importar proyecto'}
      </button>
      {error && <p className="import-error" role="alert">{error}</p>}
    </div>
  )
}
