import axios, { AxiosError } from 'axios';
import { env } from './env';

const TOKEN_KEY = 'ph_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

/**
 * The single Axios instance every API call goes through.
 *
 * `indexes: null` serializes array params as repeated keys (`?status=a&status=b`)
 * instead of axios's default `?status[]=a`. The API's query parser doesn't
 * understand the bracket form — it would silently drop the filter and return
 * everything — so multi-select filters depend on this.
 */
export const api = axios.create({
  baseURL: env.apiUrl,
  paramsSerializer: { indexes: null },
});

// Attach the bearer token on every request.
api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize errors to a plain Error carrying the API's message.
api.interceptors.response.use(
  (res) => res,
  async (error: AxiosError<{ message?: string | string[] }>) => {
    if (error.response?.status === 401 && getToken()) {
      setToken(null);
    }
    const data = await errorBody(error.response?.data);
    const message = Array.isArray(data?.message)
      ? data?.message.join(', ')
      : data?.message;
    return Promise.reject(new Error(message || error.message || 'Request failed'));
  },
);

/**
 * A failed download (`responseType: 'blob'`) hands the error body back as a Blob
 * — the API's JSON is inside it. Without this, every download failure reads
 * "Request failed with status code 404" instead of what actually went wrong.
 */
async function errorBody(
  data: unknown,
): Promise<{ message?: string | string[] } | undefined> {
  if (data instanceof Blob) {
    try {
      return JSON.parse(await data.text());
    } catch {
      return undefined;
    }
  }
  return data as { message?: string | string[] } | undefined;
}

/*
 * Thin helpers that unwrap the backend's `{ statusCode, data }` envelope, so
 * feature query hooks get the payload directly. Use these — not `api.*` — in
 * TanStack Query hooks.
 */
export async function apiGet<T>(url: string, params?: object): Promise<T> {
  const res = await api.get(url, { params });
  return res.data.data as T;
}
export async function apiPost<T>(url: string, body?: object): Promise<T> {
  const res = await api.post(url, body);
  return res.data.data as T;
}
export async function apiPatch<T>(url: string, body?: object): Promise<T> {
  const res = await api.patch(url, body);
  return res.data.data as T;
}
export async function apiPut<T>(url: string, body?: object): Promise<T> {
  const res = await api.put(url, body);
  return res.data.data as T;
}
export async function apiDelete<T>(url: string): Promise<T> {
  const res = await api.delete(url);
  return res.data.data as T;
}

/**
 * Fetch a file and hand it to the browser's downloader.
 *
 * Deliberately not one of the helpers above: a file has no `{ statusCode, data }`
 * envelope to unwrap, and `responseType: 'blob'` is what keeps the bytes intact —
 * axios otherwise decodes the response as UTF-8 text, which quietly corrupts a
 * PDF. It goes through `api` rather than a bare `fetch` so the download carries
 * the same bearer token as everything else; that also rules out a plain
 * `<a href>`, which can't send one.
 *
 * The server's own filename wins when it sends one — it knows the page's title,
 * including characters a URL can't carry.
 */
export async function apiDownload(url: string, fallbackName: string, params?: object): Promise<void> {
  const res = await api.get<Blob>(url, { params, responseType: 'blob' });
  const name = filenameFromDisposition(res.headers['content-disposition']) || fallbackName;
  const href = URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  // Must be in the document for the click to count in Firefox.
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Freeing it in the same tick cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(href), 1000);
}

/**
 * `attachment; filename="page.pdf"; filename*=UTF-8''page%20one.pdf`
 *
 * The starred form is the one to trust — it's the only one that can carry a
 * non-ASCII title, and the plain one beside it is the deliberately-mangled
 * fallback for clients that don't understand it.
 */
function filenameFromDisposition(header: unknown): string {
  if (typeof header !== 'string') return '';
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1]);
    } catch {
      /* Malformed escape — fall through to the plain form. */
    }
  }
  return /filename="?([^";]+)"?/i.exec(header)?.[1] ?? '';
}
