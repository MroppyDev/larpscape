// Fetch helpers for the admin API. All requests carry the session cookie.

export class ApiError extends Error {
  status: number;
  issues?: string[];
  constructor(status: number, message: string, issues?: string[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

async function request(method: string, path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  if (!res.ok) {
    if (res.status === 401 && !path.endsWith('/login')) {
      window.dispatchEvent(new CustomEvent('admin-unauthorized'));
    }
    throw new ApiError(res.status, data?.error || `${res.status} ${res.statusText}`, data?.issues);
  }
  return data;
}

export const api = {
  get: (path: string) => request('GET', path),
  post: (path: string, body?: unknown) => request('POST', path, body),
  put: (path: string, body?: unknown) => request('PUT', path, body),
};

// Game-server admin endpoints (proxied; ADMIN_TOKEN attached server-side)
export const game = {
  get: (sub: string) => api.get(`/admin-api/game/${sub}`),
  post: (sub: string, body?: unknown) => api.post(`/admin-api/game/${sub}`, body),
};

// Content files
export const content = {
  load: (name: string) => api.get(`/admin-api/content/file/${name}`),
  save: (name: string, data: unknown, message?: string) =>
    api.put(`/admin-api/content/file/${name}${message ? `?message=${encodeURIComponent(message)}` : ''}`, data),
  status: () => api.get('/admin-api/content/status'),
  diff: () => api.get('/admin-api/content/diff'),
  validate: () => api.post('/admin-api/content/validate'),
};
