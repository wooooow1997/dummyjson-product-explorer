export const API_BASE_URL = (
  import.meta.env?.VITE_API_BASE_URL || 'https://dummyjson.com'
).replace(/\/$/, '');

const DEFAULT_TIMEOUT_MS = 12_000;
const DEFAULT_RETRIES = 1;
const RETRY_BACKOFF_MS = 600;

/**
 * Normalised transport error.
 *
 * `kind` is what the UI switches on to produce a message a human can act on;
 * `retryable` tells the error panel whether offering "Try again" makes sense
 * (a 404 will never fix itself, a timeout might).
 */
export class ApiError extends Error {
  constructor(message, { kind = 'unknown', status = null, cause = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
    this.cause = cause;
  }

  get retryable() {
    return this.kind === 'network' || this.kind === 'timeout' || this.kind === 'server';
  }

  /** Copy tuned for end users — no status codes, no stack traces. */
  get userMessage() {
    switch (this.kind) {
      case 'offline':
        return 'You appear to be offline. Check your internet connection and try again.';
      case 'timeout':
        return 'The catalogue service took too long to respond. It may be busy — please try again.';
      case 'network':
        return 'We could not reach the catalogue service. Check your connection and try again.';
      case 'notFound':
        return 'That product is no longer available in the catalogue.';
      case 'client':
        return 'That request was not valid. Try adjusting your search or filters.';
      case 'server':
        return 'The catalogue service is having problems right now. Please try again in a moment.';
      case 'parse':
        return 'The catalogue service returned data we could not read. Please try again.';
      default:
        return 'Something went wrong while loading the catalogue. Please try again.';
    }
  }
}

const sleep = (ms, signal) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });

function classifyStatus(status) {
  if (status === 404) return 'notFound';
  if (status >= 500) return 'server';
  if (status >= 400) return 'client';
  return 'unknown';
}

/**
 * A single fetch attempt with its own timeout, chained to the caller's signal
 * so a superseded request is dropped immediately rather than after it lands.
 *
 * Timeout is implemented with an internal AbortController + setTimeout instead
 * of `AbortSignal.timeout()`/`AbortSignal.any()` so the app runs on browsers
 * that predate those APIs.
 */
async function attempt(url, { signal, timeout }) {
  const controller = new AbortController();
  let timedOut = false;

  const onExternalAbort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', onExternalAbort, { once: true });

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new ApiError(`Request failed with status ${response.status}`, {
        kind: classifyStatus(response.status),
        status: response.status,
      });
    }

    try {
      return await response.json();
    } catch (cause) {
      throw new ApiError('Malformed JSON in response', { kind: 'parse', cause });
    }
  } catch (error) {
    if (error instanceof ApiError) throw error;

    // The caller cancelled (new search typed, modal closed) — propagate as-is
    // so callers can distinguish cancellation from genuine failure.
    if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');

    if (timedOut) {
      throw new ApiError('Request timed out', { kind: 'timeout', cause: error });
    }

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new ApiError('Browser reports no network connection', { kind: 'offline', cause: error });
    }

    throw new ApiError('Network request failed', { kind: 'network', cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onExternalAbort);
  }
}

/**
 * GET a JSON resource from the API.
 *
 * Retries only transient failures (network / timeout / 5xx) — retrying a 404
 * or a 400 just wastes the user's time and delays the error message.
 *
 * @param {string} path        Path beginning with `/`
 * @param {Record<string, string|number|undefined|null>} [params]
 * @param {{signal?: AbortSignal, timeout?: number, retries?: number}} [options]
 */
export async function getJson(path, params = {}, options = {}) {
  const { signal, timeout = DEFAULT_TIMEOUT_MS, retries = DEFAULT_RETRIES } = options;

  const url = new URL(`${API_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    url.searchParams.set(key, String(value));
  }

  let lastError;
  for (let tryIndex = 0; tryIndex <= retries; tryIndex += 1) {
    try {
      return await attempt(url.toString(), { signal, timeout });
    } catch (error) {
      lastError = error;
      if (error?.name === 'AbortError') throw error;
      if (!(error instanceof ApiError) || !error.retryable || tryIndex === retries) throw error;
      await sleep(RETRY_BACKOFF_MS * (tryIndex + 1), signal);
    }
  }
  throw lastError;
}
