// Contrat figé (plan §5.4). Erreurs typées, traduites par l'i18n (le message n'est jamais montré tel quel).
export type DomainErrorCode =
  | 'NOT_IN_VOICE'
  | 'NOT_FOUND'
  | 'UNPLAYABLE'
  | 'FORBIDDEN'
  | 'QUEUE_EMPTY'
  | 'ENGINE_UNAVAILABLE'
  | 'PLAYLIST_EXISTS'
  | 'PLAYLIST_NOT_FOUND';

export class DomainError extends Error {
  override readonly name = 'DomainError';
  readonly code: DomainErrorCode;

  constructor(code: DomainErrorCode, message?: string, options?: { cause?: unknown }) {
    super(message ?? code, options);
    this.code = code;
  }
}

export function isDomainError(e: unknown, code?: DomainErrorCode): e is DomainError {
  return e instanceof DomainError && (code === undefined || e.code === code);
}
