export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';

export interface ApiErrorPayload {
  detail?: string;
  message?: string;
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getCsrfTokenFromCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|;\s*)ks_csrf=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const headers = new Headers(options.headers ?? {});
  if (!headers.has('Content-Type') && options.body) {
    headers.set('Content-Type', 'application/json');
  }
  const method = (options.method ?? 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfTokenFromCookie();
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      !path.startsWith('/api/v1/auth/me') &&
      !path.startsWith('/api/v1/auth/login') &&
      !path.startsWith('/api/v1/auth/register')
    ) {
      window.dispatchEvent(new CustomEvent('ks:auth-expired'));
    }
    let msg = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as ApiErrorPayload;
      if (payload.detail) msg = payload.detail;
      else if (payload.message) msg = payload.message;
    } catch {
      // ignore json parse failure
    }
    throw new ApiError(response.status, msg);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
