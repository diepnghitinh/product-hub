import axios, { AxiosError } from 'axios';
import { env } from './env';

/**
 * Deliberately NOT `ph_token`. The console and the tenant app hold different
 * tokens signed with different secrets; if they ever end up on the same origin
 * (a shared domain, a proxy in front of both) a single key would have them
 * overwriting each other and each sending a token the other side rejects.
 */
const TOKEN_KEY = 'ph_platform_token';

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
 * instead of axios's default `?status[]=a`, which the API's query parser doesn't
 * understand.
 */
export const api = axios.create({
  baseURL: env.apiUrl,
  paramsSerializer: { indexes: null },
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Normalize errors to a plain Error carrying the API's message.
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError<{ message?: string | string[] }>) => {
    if (error.response?.status === 401 && getToken()) {
      setToken(null);
      // A dead token has to unmount the console, not just fail one request —
      // otherwise you sit on a page of stale numbers that will never refresh.
      window.dispatchEvent(new Event('platform-auth-expired'));
    }
    const data = error.response?.data;
    const message = Array.isArray(data?.message) ? data?.message.join(', ') : data?.message;
    return Promise.reject(new Error(message || error.message || 'Request failed'));
  },
);

/*
 * Thin helpers that unwrap the backend's `{ statusCode, data }` envelope, so
 * query hooks get the payload directly. Use these — not `api.*`.
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
