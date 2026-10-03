import type { ErrorCode } from '@eodia/contracts'

const STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  CSRF: 403,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  DATA_ACCESS_DENIED: 403,
  QUERY_FAILED: 400,
  QUERY_TIMEOUT: 408,
  QUERY_CANCELLED: 499,
  ENGINE_UNAVAILABLE: 503,
  CONNECTION_FAILED: 400,
  AI_DISABLED: 400,
  AI_QUOTA: 429,
  SETUP_REQUIRED: 409,
  INTERNAL: 500,
}

/** An error meant for the person: a stable code, a French message. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'AppError'
  }

  get status(): number {
    return STATUS[this.code]
  }
}

export const notFound = (what = 'Élément introuvable.') => new AppError('NOT_FOUND', what)
export const forbidden = (what = "Vous n'avez pas accès à cet élément.") => new AppError('FORBIDDEN', what)
export const invalid = (what: string, details?: unknown) => new AppError('INVALID_INPUT', what, details)
