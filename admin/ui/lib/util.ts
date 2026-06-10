// Small shared hooks + formatting helpers for the admin pages.

import { useCallback, useEffect, useRef, useState } from 'react';

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e ?? 'Request failed');
}

/**
 * Polls an async loader on a fixed interval. Keeps the last good data around
 * when a refresh fails so the UI can show a warning instead of going blank.
 */
export function usePoll<T>(fn: () => Promise<T>, intervalMs: number, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const refresh = useCallback(async () => {
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh };
}

/** Debounces a changing value (used for search inputs). */
export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);
  return debounced;
}

export function fmtUptime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '—';
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${Math.floor(sec % 60)}s`;
  return `${Math.floor(sec)}s`;
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

export function fmtDateTime(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export type MutedUntil = null | number | 'permanent';

export function isMuted(mutedUntil: MutedUntil): boolean {
  if (mutedUntil === 'permanent') return true;
  return typeof mutedUntil === 'number' && mutedUntil > Date.now();
}

export function muteLabel(mutedUntil: MutedUntil): string {
  if (mutedUntil === 'permanent') return 'muted (permanent)';
  if (typeof mutedUntil === 'number' && mutedUntil > Date.now()) {
    return `muted until ${fmtDateTime(mutedUntil)}`;
  }
  return '';
}
