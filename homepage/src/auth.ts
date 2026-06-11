// Shared auth helpers for the larpscape.net homepage + auth pages.
// Cookie sessions (bs_session, Domain=.larpscape.net) — every request sends
// credentials:'include' so the cookie set by the API is honored cross-page.

export const PLAY_URL = 'https://play.larpscape.net';
export const FORUM_URL = 'https://forum.larpscape.net';

export const USERNAME_RE = /^[a-zA-Z0-9]{3,12}$/;

/** Where to send the user after a successful login/register.
 *  ?return=play  -> the game client
 *  ?return=forum -> the forum
 *  default       -> /profile on this site. */
export function returnTarget(): string {
  const r = new URLSearchParams(location.search).get('return');
  if (r === 'play') return PLAY_URL;
  if (r === 'forum') return FORUM_URL;
  return '/profile';
}

/** GET /api/me — resolves the logged-in username, or null. Never throws. */
export async function apiMe(): Promise<string | null> {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { username?: unknown };
    return typeof data.username === 'string' ? data.username : null;
  } catch {
    return null;
  }
}

export type AuthResult = { ok: true; username: string } | { ok: false; error: string };

/** POST credentials as JSON. Tries /api/auth/<kind> first and falls back to
 *  the server's current /api/<kind> route if the aliased path isn't mounted. */
export async function postAuth(
  kind: 'login' | 'register',
  body: { username: string; password: string }
): Promise<AuthResult> {
  for (const path of [`/api/auth/${kind}`, `/api/${kind}`]) {
    let res: Response;
    try {
      res = await fetch(path, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      return { ok: false, error: 'Could not reach the realm — check your connection and try again.' };
    }
    if (res.status === 404 || res.status === 405) continue; // alias not mounted; try fallback
    let data: { username?: unknown; error?: unknown } | null = null;
    try {
      data = (await res.json()) as { username?: unknown; error?: unknown };
    } catch {
      /* non-JSON error body */
    }
    if (res.ok) {
      return { ok: true, username: typeof data?.username === 'string' ? data.username : body.username };
    }
    return {
      ok: false,
      error: typeof data?.error === 'string' ? data.error : `Something went wrong (${res.status}). Try again.`,
    };
  }
  return { ok: false, error: 'The sign-in service is unavailable right now — try again shortly.' };
}

/** POST /api/auth/logout — clears the session cookie server-side. Never throws. */
export async function logout(): Promise<void> {
  try {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
  } catch {
    /* cookie clear is best-effort */
  }
}

/** Wire an auth <form> page: error line, already-logged-in redirect,
 *  cross-link query preservation. */
export function showFormError(message: string): void {
  const box = document.getElementById('form-error');
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
}

export function clearFormError(): void {
  const box = document.getElementById('form-error');
  if (box) box.hidden = true;
}

/** Make the login<->register cross-link carry the ?return= param along. */
export function preserveQueryOnLinks(): void {
  if (!location.search) return;
  document.querySelectorAll<HTMLAnchorElement>('a[data-keep-query]').forEach((a) => {
    a.href = a.pathname + location.search;
  });
}

/** If a session already exists, skip the form and honor ?return=. */
export async function redirectIfLoggedIn(): Promise<void> {
  if (await apiMe()) location.replace(returnTarget());
}
