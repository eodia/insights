/** Codes d'erreur de l'API : stables, lisibles par une machine ; le message, lui, est en français. */
export const ERROR_CODES = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'CSRF',
  'NOT_FOUND',
  'INVALID_INPUT',
  'CONFLICT',
  'RATE_LIMITED',
  'DATA_ACCESS_DENIED',
  'QUERY_FAILED',
  'QUERY_TIMEOUT',
  'QUERY_CANCELLED',
  'ENGINE_UNAVAILABLE',
  'CONNECTION_FAILED',
  'AI_DISABLED',
  'AI_QUOTA',
  'SETUP_REQUIRED',
  'INTERNAL',
] as const
export type ErrorCode = (typeof ERROR_CODES)[number]

export interface ApiErrorBody {
  readonly error: {
    readonly code: ErrorCode
    readonly message: string
    readonly details?: unknown
  }
}
