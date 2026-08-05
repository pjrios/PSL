export const AUTH_ACTION_ATTRIBUTE = 'data-psl-auth-action'
export const AUTH_DESTINATION_ATTRIBUTE = 'data-psl-auth-destination'

export const AUTH_ACTIONS = ['login', 'signup', 'logout'] as const
export type AuthAction = typeof AUTH_ACTIONS[number]

export interface AuthComponentSettings {
  action: AuthAction
  destinationPageId?: string
}

export function readAuthComponentSettings(
  attributes: Record<string, unknown>,
): AuthComponentSettings | null {
  const action = attributes[AUTH_ACTION_ATTRIBUTE]
  if (!AUTH_ACTIONS.includes(action as AuthAction)) return null
  const destination = attributes[AUTH_DESTINATION_ATTRIBUTE]
  return {
    action: action as AuthAction,
    ...(typeof destination === 'string' && destination.trim()
      ? { destinationPageId: destination.trim() }
      : {}),
  }
}
