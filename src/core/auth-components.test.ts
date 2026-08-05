import { describe, expect, it } from 'vitest'
import {
  AUTH_ACTION_ATTRIBUTE,
  AUTH_DESTINATION_ATTRIBUTE,
  readAuthComponentSettings,
} from './auth-components'

describe('auth component settings', () => {
  it('reads an auth action and optional success destination', () => {
    expect(readAuthComponentSettings({
      [AUTH_ACTION_ATTRIBUTE]: 'login',
      [AUTH_DESTINATION_ATTRIBUTE]: 'dashboard',
    })).toEqual({ action: 'login', destinationPageId: 'dashboard' })
  })

  it('rejects unsupported auth actions', () => {
    expect(readAuthComponentSettings({ [AUTH_ACTION_ATTRIBUTE]: 'reset-password' })).toBeNull()
  })
})
