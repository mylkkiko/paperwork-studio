/**
 * Thin fetch wrapper around the backend REST API.
 * - adds the JWT (from localStorage) to every request
 * - turns `{ error: { code, message, details } }` responses into ApiError
 * - a 401 on an authenticated call clears the session (the app shell then redirects to /login)
 */
import { API_URL } from './env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

const TOKEN_KEY = 'ps.token';
export const tokenStore = {
  get: () => (typeof window === 'undefined' ? null : window.localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => window.localStorage.setItem(TOKEN_KEY, t),
  clear: () => window.localStorage.removeItem(TOKEN_KEY),
};

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => {
    unauthorizedListeners.delete(fn);
  };
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** multipart upload */
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** public endpoints (signing page) */
  anonymous?: boolean;
  signal?: AbortSignal;
}

export function apiUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  return url.toString();
}

async function raw(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = opts.anonymous ? null : tokenStore.get();
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(apiUrl(path, opts.query), { method: opts.method ?? (body ? 'POST' : 'GET'), headers, body, signal: opts.signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK_ERROR', 'Network error');
  }
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const e = payload?.error ?? {};
    if (res.status === 401 && token) {
      tokenStore.clear();
      unauthorizedListeners.forEach((fn) => fn());
    }
    throw new ApiError(res.status, e.code ?? `HTTP_${res.status}`, e.message ?? res.statusText, e.details);
  }
  return res;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await raw(path, opts);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** Fetch a protected file as a Blob (files are never public; the JWT must be sent). */
export async function apiBlob(path: string, opts: RequestOptions = {}): Promise<{ blob: Blob; fileName: string | null }> {
  const res = await raw(path, opts);
  const disposition = res.headers.get('content-disposition') ?? '';
  const m = /filename\*=UTF-8''([^;]+)/.exec(disposition);
  return { blob: await res.blob(), fileName: m ? decodeURIComponent(m[1]) : null };
}

/** Download a protected file through the browser's save dialog. */
export async function download(path: string, fallbackName: string, query?: RequestOptions['query']) {
  const { blob, fileName } = await apiBlob(path, { query });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName ?? fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
