/**
 * Errors raised by the CLI. `exitCode` 2 is a usage error (bad flags or
 * arguments), 1 is everything else (API, network, signing).
 */
export class CliError extends Error {
  constructor(message: string, public readonly exitCode: number = 1) {
    super(message);
    this.name = 'CliError';
  }
}

export class UsageError extends CliError {
  constructor(message: string) {
    super(message, 2);
    this.name = 'UsageError';
  }
}

/**
 * Turn anything thrown by the SDK into a one-line message.
 *
 * The SDK's HttpClient rejects with the raw API body on HTTP errors
 * (`{ message, statusCode, error }`), not an `Error`, so `err.message` alone
 * is not enough.
 */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object') {
    const body = err as Record<string, unknown>;
    const raw = body.message ?? body.error ?? body.detail;
    const message = Array.isArray(raw) ? raw.join('; ') : raw !== undefined ? String(raw) : JSON.stringify(body);
    const status = body.statusCode;
    if (status === 401 || status === 403) {
      return `API error ${status}: ${message}. Check that DEFINDEX_API_KEY is set to a valid key (get one at https://console.defindex.io)`;
    }
    return status !== undefined ? `API error ${status}: ${message}` : message;
  }
  return String(err);
}
