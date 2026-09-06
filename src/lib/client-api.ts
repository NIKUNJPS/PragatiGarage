'use client';

export class ApiClientError extends Error {
  constructor(
    public status: number,
    message: string,
    public fieldErrors?: Record<string, string[]> | null,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** First message for a specific field, if the server flagged one. */
  fieldMessage(field: string): string | undefined {
    return this.fieldErrors?.[field]?.[0];
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiClientError(0, 'No connection. Check your internet and try again.');
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let payload: any = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!res.ok) {
    // A 401 anywhere means the session is gone - bounce to login once.
    if (res.status === 401 && typeof window !== 'undefined') {
      const path = window.location.pathname;
      if (!path.startsWith('/login') && !path.startsWith('/i/')) {
        window.location.href = `/login?next=${encodeURIComponent(path)}&reason=expired`;
      }
    }
    throw new ApiClientError(
      res.status,
      payload?.error || `Request failed (${res.status}). Please try again.`,
      payload?.fieldErrors ?? null,
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body ?? {}),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body ?? {}),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
};

/** Build a query string, skipping empty/default values so URLs stay readable. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '' || value === 'ALL') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}

/** Push server-side field errors into a react-hook-form instance. */
export function applyFieldErrors(
  error: unknown,
  setError: (field: any, err: { type: string; message: string }) => void,
): boolean {
  if (!(error instanceof ApiClientError) || !error.fieldErrors) return false;
  let applied = false;
  for (const [field, messages] of Object.entries(error.fieldErrors)) {
    if (messages?.[0]) {
      setError(field, { type: 'server', message: messages[0] });
      applied = true;
    }
  }
  return applied;
}

export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiClientError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
