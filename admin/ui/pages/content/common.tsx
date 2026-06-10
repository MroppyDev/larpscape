// Shared infrastructure for the content editors: file load/save lifecycle,
// save bar with inline commit message, field helpers, datalist autocomplete,
// tabs, confirm-delete buttons and the raw-JSON power-editing fallback.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ApiError, content } from '../../api';

// ---------------------------------------------------------------------------
// File state hook
// ---------------------------------------------------------------------------

export interface FileState<T> {
  data: T | null;
  /** Functional update; marks the draft dirty. */
  update: (fn: (prev: T) => T) => void;
  loading: boolean;
  loadError: string;
  dirty: boolean;
  saving: boolean;
  saveError: string;
  issues: string[];
  savedOk: boolean;
  save: (message?: string) => Promise<boolean>;
  reload: () => void;
}

export function useContentFile<T>(name: string): FileState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [issues, setIssues] = useState<string[]>([]);
  const [savedOk, setSavedOk] = useState(false);

  const reload = useCallback(() => {
    setLoading(true);
    setLoadError('');
    setDirty(false);
    setSavedOk(false);
    setSaveError('');
    setIssues([]);
    content.load(name)
      .then((d) => setData(d as T))
      .catch((e: any) => setLoadError(e?.message || 'load failed'))
      .finally(() => setLoading(false));
  }, [name]);

  useEffect(() => { reload(); }, [reload]);

  const update = useCallback((fn: (prev: T) => T) => {
    setData((prev) => (prev === null ? prev : fn(prev)));
    setDirty(true);
    setSavedOk(false);
  }, []);

  const save = useCallback(async (message?: string): Promise<boolean> => {
    if (data === null) return false;
    setSaving(true);
    setSaveError('');
    setIssues([]);
    setSavedOk(false);
    try {
      await content.save(name, data, message);
      setDirty(false);
      setSavedOk(true);
      return true;
    } catch (e: any) {
      if (e instanceof ApiError && e.issues?.length) {
        setSaveError(e.message);
        setIssues(e.issues);
      } else {
        setSaveError(e?.message || 'save failed');
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [name, data]);

  return { data, update, loading, loadError, dirty, saving, saveError, issues, savedOk, save, reload };
}

// ---------------------------------------------------------------------------
// Save bar (dirty hint + inline commit message + error panel)
// ---------------------------------------------------------------------------

export function SaveBar({ file, title }: { file: FileState<any>; title: string }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const doSave = async () => {
    const ok = await file.save(msg.trim() || undefined);
    if (ok) {
      setOpen(false);
      setMsg('');
    }
  };

  return (
    <div className="card" style={{ position: 'sticky', top: 0, zIndex: 10, padding: '10px 18px' }}>
      <div className="row">
        <h1 style={{ margin: 0, fontSize: 18, flex: 1 }}>{title}</h1>
        {file.dirty && <span className="tag warn">unsaved changes</span>}
        {file.savedOk && !file.dirty && <span className="tag good">saved &amp; committed</span>}
        <button className="small" onClick={file.reload} disabled={file.loading || file.saving} title="Discard draft and reload from disk">
          Reload
        </button>
        {!open ? (
          <button className="primary" disabled={!file.dirty || file.saving || file.loading} onClick={() => setOpen(true)}>
            Save &amp; commit
          </button>
        ) : (
          <>
            <input
              ref={inputRef}
              placeholder="Commit message (optional)"
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') doSave();
                if (e.key === 'Escape') setOpen(false);
              }}
              style={{ width: 320 }}
            />
            <button className="primary" onClick={doSave} disabled={file.saving}>
              {file.saving ? 'Saving…' : 'Commit'}
            </button>
            <button onClick={() => setOpen(false)} disabled={file.saving}>Cancel</button>
          </>
        )}
      </div>
      {file.saveError && (
        <div style={{ marginTop: 10 }}>
          <div className="error-text" style={{ fontWeight: 600 }}>{file.saveError}</div>
          {file.issues.length > 0 && (
            <ul className="error-text mono" style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {file.issues.map((iss, i) => <li key={i}>{iss}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export function LoadGuard({ file, children }: { file: FileState<any>; children: () => ReactNode }) {
  if (file.loading) return <div className="card dim">Loading…</div>;
  if (file.loadError) return <div className="card"><span className="error-text">Failed to load: {file.loadError}</span></div>;
  if (file.data === null) return <div className="card dim">No data.</div>;
  return <>{children()}</>;
}

// ---------------------------------------------------------------------------
// Raw JSON fallback (collapsible per-entity textarea)
// ---------------------------------------------------------------------------

export function RawJson({ value, onApply, label = 'Raw JSON' }: {
  value: unknown;
  onApply: (parsed: any) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [err, setErr] = useState('');

  const toggle = () => {
    if (!open) {
      setText(JSON.stringify(value, null, 2));
      setErr('');
    }
    setOpen(!open);
  };

  const apply = () => {
    try {
      onApply(JSON.parse(text));
      setErr('');
      setOpen(false);
    } catch (e: any) {
      setErr(e?.message || 'invalid JSON');
    }
  };

  return (
    <div style={{ marginTop: 14 }}>
      <button className="small" onClick={toggle} aria-expanded={open}>
        {open ? '▾' : '▸'} {label}
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <textarea
            className="mono"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={Math.min(24, Math.max(6, text.split('\n').length))}
            style={{ width: '100%', resize: 'vertical' }}
            spellCheck={false}
          />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="small primary" onClick={apply}>Apply</button>
            <button className="small" onClick={() => setOpen(false)}>Cancel</button>
            {err && <span className="error-text">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field helpers
// ---------------------------------------------------------------------------

export function Field({ label, children, width }: { label: string; children: ReactNode; width?: number }) {
  return (
    <div className="field" style={width ? { width } : undefined}>
      <label>{label}</label>
      {children}
    </div>
  );
}

export function TextField({ label, value, onChange, placeholder, textarea, width }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
  width?: number;
}) {
  return (
    <Field label={label} width={width}>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} style={{ width: '100%', resize: 'vertical' }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%' }} />
      )}
    </Field>
  );
}

/** Numeric field; empty input maps to undefined (caller decides whether the key is optional). */
export function NumField({ label, value, onChange, step, min, max, width = 110 }: {
  label: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  step?: number | 'any';
  min?: number;
  max?: number;
  width?: number;
}) {
  return (
    <Field label={label} width={width}>
      <input
        type="number"
        value={value ?? ''}
        step={step ?? 'any'}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </Field>
  );
}

export function CheckField({ label, checked, onChange }: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="row" style={{ display: 'inline-flex', gap: 6, cursor: 'pointer', color: 'var(--text)', fontSize: 13, marginBottom: 0 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function SelectField({ label, value, onChange, options, emptyLabel, width = 150 }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  emptyLabel?: string; // when set, an empty option is offered
  width?: number;
}) {
  return (
    <Field label={label} width={width}>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: '100%' }}>
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Autocomplete datalists (item / npc / object ids)
// ---------------------------------------------------------------------------

const idsCache = new Map<string, Promise<string[]>>();

function loadIds(name: string, extract: (d: any) => string[]): Promise<string[]> {
  let p = idsCache.get(name);
  if (!p) {
    p = content.load(name).then(extract).catch(() => []);
    idsCache.set(name, p);
  }
  return p;
}

function useIds(name: string, extract: (d: any) => string[]): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    loadIds(name, extract).then((v) => { if (alive) setIds(v); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  return ids;
}

export function useItemIds(): string[] {
  return useIds('items.json', (d) => Object.keys(d).sort());
}

export function useNpcIds(): string[] {
  return useIds('npcs.json', (d) => Object.keys(d).sort());
}

export function Datalist({ id, options }: { id: string; options: readonly string[] }) {
  return (
    <datalist id={id}>
      {options.map((o) => <option key={o} value={o} />)}
    </datalist>
  );
}

/** Text input wired to a datalist; used for item/npc id autocomplete. */
export function IdInput({ value, onChange, listId, width = 180, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  listId: string;
  width?: number;
  placeholder?: string;
}) {
  return (
    <input
      className="mono"
      value={value}
      list={listId}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{ width }}
      spellCheck={false}
    />
  );
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export function Tabs({ tabs, active, onSelect }: {
  tabs: readonly { key: string; label: string; badge?: number }[];
  active: string;
  onSelect: (k: string) => void;
}) {
  return (
    <div className="row" style={{ marginBottom: 14, gap: 6 }} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={active === t.key}
          className="small"
          onClick={() => onSelect(t.key)}
          style={active === t.key
            ? { borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--bg-3)' }
            : undefined}
        >
          {t.label}{t.badge !== undefined ? ` (${t.badge})` : ''}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confirm-delete button (two-step, no window.confirm)
// ---------------------------------------------------------------------------

export function ConfirmDeleteButton({ onDelete, label = 'Delete', small }: {
  onDelete: () => void;
  label?: string;
  small?: boolean;
}) {
  const [arm, setArm] = useState(false);
  useEffect(() => {
    if (!arm) return;
    const t = setTimeout(() => setArm(false), 3000);
    return () => clearTimeout(t);
  }, [arm]);
  return (
    <button
      className={`danger${small ? ' small' : ''}`}
      onClick={() => {
        if (arm) { setArm(false); onDelete(); }
        else setArm(true);
      }}
    >
      {arm ? 'Confirm?' : label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// New-entity id prompt (modal)
// ---------------------------------------------------------------------------

export const ID_RE = /^[a-z][a-z0-9_]{0,47}$/;

export function NewIdModal({ title, existing, onCreate, onClose }: {
  title: string;
  existing: readonly string[];
  onCreate: (id: string) => void;
  onClose: () => void;
}) {
  const [id, setId] = useState('');
  const err = id === '' ? ''
    : !ID_RE.test(id) ? 'Must be snake_case: lowercase letter, then a-z 0-9 _ (max 48 chars).'
    : existing.includes(id) ? 'That id already exists.'
    : '';
  const valid = id !== '' && err === '';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        <Field label="ID (snake_case, unique)">
          <input
            className="mono"
            autoFocus
            value={id}
            onChange={(e) => setId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) onCreate(id);
              if (e.key === 'Escape') onClose();
            }}
            placeholder="e.g. rune_scimitar"
            style={{ width: '100%' }}
          />
        </Field>
        {err && <div className="error-text" style={{ marginBottom: 10 }}>{err}</div>}
        <div className="row">
          <button className="primary" disabled={!valid} onClick={() => onCreate(id)}>Create</button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item+qty list editor (shop stock, recipe inputs, spell runes)
// ---------------------------------------------------------------------------

export interface ItemQty { item: string; qty: number }

export function ItemQtyList({ value, onChange, listId, compact }: {
  value: ItemQty[];
  onChange: (v: ItemQty[]) => void;
  listId: string;
  compact?: boolean;
}) {
  const set = (i: number, patch: Partial<ItemQty>) =>
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {value.map((r, i) => (
        <div key={i} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <IdInput value={r.item} onChange={(v) => set(i, { item: v })} listId={listId} width={compact ? 140 : 180} placeholder="item id" />
          <input
            type="number"
            min={1}
            value={r.qty}
            onChange={(e) => set(i, { qty: Number(e.target.value) || 0 })}
            style={{ width: 64 }}
            aria-label="quantity"
          />
          <button className="small" onClick={() => onChange(value.filter((_, j) => j !== i))} title="Remove" aria-label="Remove row">✕</button>
        </div>
      ))}
      <div>
        <button className="small" onClick={() => onChange([...value, { item: '', qty: 1 }])}>+ add</button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

/** Set or delete an optional key on a shallow copy. */
export function withOpt<T extends object>(obj: T, key: string, v: unknown): T {
  const copy: any = { ...obj };
  if (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v)) || v === false) delete copy[key];
  else copy[key] = v;
  return copy;
}

export function useSearch<T>(rows: T[], query: string, keys: (row: T) => string[]): T[] {
  return useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => keys(r).some((s) => s.toLowerCase().includes(q)));
  }, [rows, query, keys]);
}

export function SortHeader({ label, field, sort, onSort }: {
  label: string;
  field: string;
  sort: { field: string; asc: boolean };
  onSort: (field: string) => void;
}) {
  const active = sort.field === field;
  return (
    <th
      onClick={() => onSort(field)}
      style={{ cursor: 'pointer', userSelect: 'none', color: active ? 'var(--accent)' : undefined }}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSort(field); } }}
    >
      {label}{active ? (sort.asc ? ' ▲' : ' ▼') : ''}
    </th>
  );
}
