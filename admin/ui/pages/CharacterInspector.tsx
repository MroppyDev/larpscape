import { useEffect, useMemo, useState } from 'react';
import { api, game, content } from '../api';
import { SKILLS, XP_TABLE, levelForXp, totalLevel } from '../lib/skills';
import { errMsg, fmtDateTime } from '../lib/util';

interface ItemStack { id: string; qty: number }

interface CharSave {
  name: string;
  x: number;
  y: number;
  xp: number[];
  curHp: number;
  inventory: (ItemStack | null)[];
  equipment: Record<string, ItemStack | null>;
  bank: ItemStack[];
  quests: Record<string, number>;
  [key: string]: unknown;
}

interface Backup { id: number; createdAt: number; label: string }
interface CharData { save: CharSave; updatedAt: number; backups: Backup[] }

const EQUIP_SLOTS = ['head', 'cape', 'amulet', 'ammo', 'weapon', 'body', 'shield', 'legs', 'gloves', 'boots', 'ring'];

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }
function clampInt(v: string | number, lo: number, hi: number): number {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

// Shared catalog of known item ids → datalist for autocomplete in every id input.
function useItemIds(): string[] {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => {
    content.load('items.json')
      .then((data) => setIds(Object.keys(data ?? {}).sort()))
      .catch(() => setIds([]));
  }, []);
  return ids;
}

function countCoins(save: CharSave): number {
  let total = 0;
  for (const s of save.inventory ?? []) if (s?.id === 'coins') total += s.qty;
  for (const s of save.bank ?? []) if (s?.id === 'coins') total += s.qty;
  for (const s of Object.values(save.equipment ?? {})) if (s?.id === 'coins') total += s.qty;
  return total;
}

/* ----------------------------------------------------------------- editor */

type SubTab = 'stats' | 'skills' | 'items' | 'gear' | 'json';

function StructuredEditor({ userId, save, onSaved }: { userId: number; save: CharSave; onSaved: () => void }) {
  const [draft, setDraft] = useState<CharSave>(() => clone(save));
  const [sub, setSub] = useState<SubTab>('stats');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const itemIds = useItemIds();

  useEffect(() => { setDraft(clone(save)); setStatus(null); }, [save]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(save), [draft, save]);

  // immutable-ish update: clone, mutate via fn, commit
  const edit = (fn: (d: CharSave) => void) => setDraft((prev) => { const d = clone(prev); fn(d); return d; });

  const submit = async () => {
    if (!window.confirm(`Overwrite ${draft.name || 'this character'}'s save? A backup of the current save is taken automatically; the player loads the new data on next login.`)) return;
    setBusy(true); setStatus(null);
    try {
      await api.put(`/admin-api/game/character/${userId}`, { save: draft });
      setStatus({ ok: true, msg: 'Save written — backup taken.' });
      onSaved();
    } catch (e) {
      setStatus({ ok: false, msg: errMsg(e) });
    } finally { setBusy(false); }
  };

  const bankCoins = (draft.bank ?? []).find((s) => s.id === 'coins')?.qty ?? 0;
  const setBankCoins = (amount: number) => edit((d) => {
    d.bank = (d.bank ?? []).filter((s) => s.id !== 'coins');
    if (amount > 0) d.bank.unshift({ id: 'coins', qty: amount });
  });

  return (
    <div>
      <datalist id="se-item-ids">{itemIds.map((id) => <option key={id} value={id} />)}</datalist>

      <div className="se-tabs">
        {([['stats', 'Identity & Stats'], ['skills', 'Skills'], ['items', 'Inventory & Bank'], ['gear', 'Equipment & Quests'], ['json', 'Raw JSON']] as [SubTab, string][])
          .map(([id, label]) => (
            <button key={id} className={`se-tab ${sub === id ? 'active' : ''}`} onClick={() => setSub(id)}>{label}</button>
          ))}
      </div>

      {sub === 'stats' && (
        <div className="se-section">
          <h2>Identity</h2>
          <div className="se-grid cols-4">
            <div className="field" style={{ gridColumn: 'span 2', margin: 0 }}>
              <label>Display name</label>
              <input value={draft.name ?? ''} onChange={(e) => edit((d) => { d.name = e.target.value; })} style={{ width: '100%' }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Current HP</label>
              <input type="number" value={draft.curHp ?? 0} onChange={(e) => edit((d) => { d.curHp = clampInt(e.target.value, 0, 9999); })} style={{ width: '100%' }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Total level</label>
              <input value={totalLevel(draft.xp ?? [])} disabled style={{ width: '100%', color: 'var(--accent)' }} />
            </div>
          </div>
          <div className="se-grid cols-4" style={{ marginTop: 8 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Position X</label>
              <input type="number" value={draft.x ?? 0} onChange={(e) => edit((d) => { d.x = clampInt(e.target.value, 0, 1024); })} style={{ width: '100%' }} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Position Y</label>
              <input type="number" value={draft.y ?? 0} onChange={(e) => edit((d) => { d.y = clampInt(e.target.value, 0, 1024); })} style={{ width: '100%' }} />
            </div>
          </div>

          <h2 style={{ marginTop: 22 }}>Wealth</h2>
          <div className="coins-input">
            <label style={{ margin: 0 }}>Bank coins</label>
            <input type="number" value={bankCoins} onChange={(e) => setBankCoins(clampInt(e.target.value, 0, 2_000_000_000))} />
            <span className="gp">gp</span>
            <span className="dim" style={{ fontSize: 12 }}>· total across save: {countCoins(draft).toLocaleString()} gp</span>
          </div>
          <div className="quick-actions" style={{ marginTop: 8 }}>
            {[1000, 100_000, 1_000_000, 100_000_000].map((n) => (
              <button key={n} className="small" onClick={() => setBankCoins(n)}>{n.toLocaleString()}</button>
            ))}
            <button className="small danger" onClick={() => setBankCoins(0)}>Clear</button>
          </div>
        </div>
      )}

      {sub === 'skills' && (
        <div className="se-section">
          <div className="quick-actions">
            <button className="small gold" onClick={() => edit((d) => { d.xp = SKILLS.map(() => XP_TABLE[99]); })}>Max all (99)</button>
            <button className="small" onClick={() => edit((d) => { d.xp = SKILLS.map(() => 0); })}>Reset all to 1</button>
            <button className="small" onClick={() => edit((d) => { d.xp = clone(save.xp ?? []); })}>Revert skills</button>
          </div>
          <div className="hint-bar">Edit a level to set that skill's XP to the level minimum. Hitpoints stays usable in combat after the player reloads.</div>
          <div className="se-grid cols-3">
            {SKILLS.map((name, i) => {
              const xp = draft.xp?.[i] ?? 0;
              return (
                <div key={name} className="skill-cell">
                  <div>
                    <div className="sk-name"><b>{name}</b></div>
                    <div className="sk-xp">{Math.floor(xp).toLocaleString()} xp</div>
                  </div>
                  <input
                    type="number" min={1} max={99} value={levelForXp(xp)}
                    onChange={(e) => edit((d) => {
                      if (!Array.isArray(d.xp)) d.xp = [];
                      while (d.xp.length < SKILLS.length) d.xp.push(0);
                      d.xp[i] = XP_TABLE[clampInt(e.target.value, 1, 99)];
                    })}
                  />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {sub === 'items' && (
        <div className="se-section">
          <h2>Inventory (28 slots)</h2>
          <div className="quick-actions">
            <button className="small danger" onClick={() => edit((d) => { d.inventory = Array(28).fill(null); })}>Clear inventory</button>
          </div>
          <div className="slot-grid">
            {Array.from({ length: 28 }, (_, i) => draft.inventory?.[i] ?? null).map((s, i) => (
              <div key={i} className={`slot ${s ? 'filled' : ''} ${s?.id === 'coins' ? 'coins' : ''}`}>
                <span className="slot-num">{i}</span>
                {s && <button className="clear-x" title="Clear slot" onClick={() => edit((d) => { (d.inventory ??= [])[i] = null; })}>×</button>}
                <input
                  className="id" list="se-item-ids" placeholder="item id" value={s?.id ?? ''}
                  onChange={(e) => edit((d) => {
                    d.inventory ??= []; while (d.inventory.length < 28) d.inventory.push(null);
                    const id = e.target.value.trim();
                    d.inventory[i] = id ? { id, qty: d.inventory[i]?.qty || 1 } : null;
                  })}
                />
                {s && (
                  <input className="qty" type="number" min={1} value={s.qty}
                    onChange={(e) => edit((d) => { const slot = (d.inventory ??= [])[i]; if (slot) slot.qty = clampInt(e.target.value, 1, 2_000_000_000); })} />
                )}
              </div>
            ))}
          </div>

          <h2 style={{ marginTop: 22 }}>Bank ({(draft.bank ?? []).length})</h2>
          <div className="quick-actions">
            <button className="small" onClick={() => edit((d) => { (d.bank ??= []).push({ id: '', qty: 1 }); })}>+ Add row</button>
            <button className="small danger" onClick={() => edit((d) => { d.bank = []; })}>Clear bank</button>
          </div>
          <div style={{ maxHeight: 280, overflow: 'auto', paddingRight: 4 }}>
            {(draft.bank ?? []).map((s, i) => (
              <div key={i} className="kv-row">
                <input list="se-item-ids" placeholder="item id" value={s.id}
                  onChange={(e) => edit((d) => { d.bank[i].id = e.target.value.trim(); })} />
                <input type="number" min={1} value={s.qty}
                  onChange={(e) => edit((d) => { d.bank[i].qty = clampInt(e.target.value, 1, 2_000_000_000); })} />
                <button className="small danger" onClick={() => edit((d) => { d.bank.splice(i, 1); })}>×</button>
              </div>
            ))}
            {!(draft.bank ?? []).length && <div className="dim">Bank is empty.</div>}
          </div>
        </div>
      )}

      {sub === 'gear' && (
        <div className="se-section">
          <h2>Equipment</h2>
          {Array.from(new Set([...EQUIP_SLOTS, ...Object.keys(draft.equipment ?? {})])).map((slot) => {
            const s = draft.equipment?.[slot] ?? null;
            return (
              <div key={slot} className="kv-row eq">
                <span className="slot-name">{slot}</span>
                <input list="se-item-ids" placeholder="(empty)" value={s?.id ?? ''}
                  onChange={(e) => edit((d) => {
                    d.equipment ??= {};
                    const id = e.target.value.trim();
                    d.equipment[slot] = id ? { id, qty: d.equipment[slot]?.qty || 1 } : null;
                  })} />
                <input type="number" min={1} value={s?.qty ?? 1} disabled={!s}
                  onChange={(e) => edit((d) => { const it = (d.equipment ??= {})[slot]; if (it) it.qty = clampInt(e.target.value, 1, 2_000_000_000); })} />
                <button className="small danger" disabled={!s} onClick={() => edit((d) => { (d.equipment ??= {})[slot] = null; })}>×</button>
              </div>
            );
          })}

          <h2 style={{ marginTop: 22 }}>Quests</h2>
          <div className="quick-actions">
            <button className="small" onClick={() => edit((d) => { d.quests = { ...(d.quests ?? {}), '': 0 }; })}>+ Add</button>
          </div>
          {Object.entries(draft.quests ?? {}).map(([q, stage], i) => (
            <div key={i} className="kv-row">
              <input placeholder="quest id / sub-key" value={q}
                onChange={(e) => edit((d) => {
                  const entries = Object.entries(d.quests ?? {});
                  entries[i] = [e.target.value, stage];
                  d.quests = Object.fromEntries(entries);
                })} />
              <input type="number" value={stage}
                onChange={(e) => edit((d) => { d.quests = { ...(d.quests ?? {}), [q]: clampInt(e.target.value, 0, 1_000_000) }; })} />
              <button className="small danger" onClick={() => edit((d) => { const c = { ...(d.quests ?? {}) }; delete c[q]; d.quests = c; })}>×</button>
            </div>
          ))}
          {!Object.keys(draft.quests ?? {}).length && <div className="dim">No quest progress.</div>}
        </div>
      )}

      {sub === 'json' && (
        <div className="se-section">
          <div className="hint-bar">Advanced: full save document. Edits here apply to all tabs once valid. Use for fields not surfaced above.</div>
          <RawJson draft={draft} onApply={(parsed) => setDraft(parsed)} />
        </div>
      )}

      <div className="se-actionbar">
        <button className="primary" disabled={busy || !dirty} onClick={submit}>{busy ? 'Writing…' : 'Write save'}</button>
        <button disabled={busy || !dirty} onClick={() => { setDraft(clone(save)); setStatus(null); }}>Discard changes</button>
        {dirty ? <span className="se-dirty">Unsaved changes</span> : <span className="dim" style={{ fontSize: 12 }}>In sync with server</span>}
        {status && <span className={status.ok ? 'ok-text' : 'error-text'}>{status.msg}</span>}
      </div>
    </div>
  );
}

function RawJson({ draft, onApply }: { draft: CharSave; onApply: (p: CharSave) => void }) {
  const [text, setText] = useState(() => JSON.stringify(draft, null, 2));
  const [err, setErr] = useState('');
  useEffect(() => { setText(JSON.stringify(draft, null, 2)); }, [draft]);
  const apply = () => {
    try { onApply(JSON.parse(text)); setErr(''); }
    catch (e) { setErr(`Invalid JSON: ${errMsg(e)}`); }
  };
  return (
    <>
      <textarea className="mono" style={{ width: '100%', height: 340, resize: 'vertical' }} value={text} spellCheck={false} onChange={(e) => setText(e.target.value)} />
      <div className="row" style={{ marginTop: 8 }}>
        <button className="small" onClick={apply}>Apply JSON to editor</button>
        {err && <span className="error-text">{err}</span>}
      </div>
    </>
  );
}

/* --------------------------------------------------------------- overview */

function Overview({ save }: { save: CharSave }) {
  const coins = countCoins(save);
  const equipment = Object.entries(save.equipment ?? {}).filter(([, s]) => s);
  const bank = save.bank ?? [];
  const quests = Object.entries(save.quests ?? {});
  return (
    <>
      <div className="cards-row" style={{ marginBottom: 16 }}>
        <div className="card"><div className="stat-value">{totalLevel(save.xp ?? [])}</div><div className="stat-label">Total level</div></div>
        <div className="card"><div className="stat-value">{coins.toLocaleString()}</div><div className="stat-label">Coins</div></div>
        <div className="card"><div className="stat-value">{save.curHp ?? 0}</div><div className="stat-label">Current HP</div></div>
        <div className="card"><div className="stat-value" style={{ fontSize: 18 }}>({save.x}, {save.y})</div><div className="stat-label">Position</div></div>
      </div>

      <h2>Skills</h2>
      <div className="se-grid cols-4">
        {SKILLS.map((name, i) => (
          <div key={name} className="skill-cell" title={`${Math.floor(save.xp?.[i] ?? 0).toLocaleString()} xp`}>
            <span className="sk-name">{name}</span>
            <span style={{ color: 'var(--cyan)', fontWeight: 700, fontFamily: 'var(--mono)' }}>{levelForXp(save.xp?.[i] ?? 0)}</span>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start', marginTop: 6 }}>
        <div style={{ flex: 1, minWidth: 230 }}>
          <h2>Equipment</h2>
          {!equipment.length && <div className="dim">Nothing equipped.</div>}
          <table className="data"><tbody>
            {equipment.map(([slot, s]) => (<tr key={slot}><td className="dim">{slot}</td><td className="mono">{s!.id}{s!.qty > 1 ? ` ×${s!.qty.toLocaleString()}` : ''}</td></tr>))}
          </tbody></table>
        </div>
        <div style={{ flex: 1, minWidth: 230 }}>
          <h2>Quests</h2>
          {!quests.length && <div className="dim">No quest progress.</div>}
          <table className="data"><tbody>
            {quests.map(([q, stage]) => (<tr key={q}><td className="mono">{q}</td><td>stage {stage}</td></tr>))}
          </tbody></table>
        </div>
      </div>

      <h2>Bank ({bank.length} item{bank.length === 1 ? '' : 's'})</h2>
      {!bank.length && <div className="dim">Bank is empty.</div>}
      {bank.length > 0 && (
        <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table className="data"><thead><tr><th>Item</th><th>Qty</th></tr></thead><tbody>
            {bank.map((s, i) => (<tr key={`${s.id}-${i}`}><td className="mono" style={{ color: s.id === 'coins' ? 'var(--accent)' : undefined }}>{s.id}</td><td>{s.qty.toLocaleString()}</td></tr>))}
          </tbody></table>
        </div>
      )}
    </>
  );
}

function Backups({ userId, backups, onRolledBack }: { userId: number; backups: Backup[]; onRolledBack: () => void }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const rollback = async (b: Backup) => {
    if (!window.confirm(`Roll this character back to "${b.label}" from ${fmtDateTime(b.createdAt)}? The current save is replaced.`)) return;
    setBusyId(b.id); setStatus(null);
    try { await game.post(`character/${userId}/rollback`, { backupId: b.id }); setStatus({ ok: true, msg: 'Rollback applied.' }); onRolledBack(); }
    catch (e) { setStatus({ ok: false, msg: errMsg(e) }); }
    finally { setBusyId(null); }
  };
  return (
    <>
      {!backups.length && <div className="dim">No backups recorded for this character.</div>}
      {backups.length > 0 && (
        <table className="data"><thead><tr><th>Label</th><th>Created</th><th /></tr></thead><tbody>
          {backups.map((b) => (
            <tr key={b.id}>
              <td>{b.label}</td><td className="dim">{fmtDateTime(b.createdAt)}</td>
              <td style={{ textAlign: 'right' }}><button className="small danger" disabled={busyId !== null} onClick={() => rollback(b)}>{busyId === b.id ? 'Rolling back…' : 'Rollback'}</button></td>
            </tr>
          ))}
        </tbody></table>
      )}
      {status && <div className={status.ok ? 'ok-text' : 'error-text'} style={{ marginTop: 8 }}>{status.msg}</div>}
    </>
  );
}

export default function CharacterInspector({ userId, username, onClose }: { userId: number; username: string; onClose: () => void }) {
  const [data, setData] = useState<CharData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'edit' | 'backups'>('overview');

  const load = useMemo(() => async () => {
    setLoading(true); setError(null);
    try { setData(await game.get(`character/${userId}`)); }
    catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 960, maxWidth: '96vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
          <h2 style={{ margin: 0 }}>
            {data?.save?.name || username} <span className="tag cyan" style={{ marginLeft: 8 }}>user #{userId}</span>
          </h2>
          <button className="small" onClick={onClose}>Close</button>
        </div>
        {data && <div className="dim" style={{ fontSize: 12, marginBottom: 12 }}>Save last updated {fmtDateTime(data.updatedAt)}</div>}

        <div className="row" style={{ marginBottom: 14 }}>
          {(['overview', 'edit', 'backups'] as const).map((t) => (
            <button key={t} className={`small ${tab === t ? 'primary' : ''}`} onClick={() => setTab(t)}>
              {t === 'overview' ? 'Overview' : t === 'edit' ? 'Save editor' : `Backups (${data?.backups?.length ?? 0})`}
            </button>
          ))}
        </div>

        {loading && <div className="dim">Loading character…</div>}
        {!loading && error && (
          <div>
            <div className="error-text" style={{ marginBottom: 10 }}>Failed to load character: {error}</div>
            <button className="small" onClick={load}>Retry</button>
          </div>
        )}
        {!loading && !error && data && (
          <>
            {tab === 'overview' && <Overview save={data.save} />}
            {tab === 'edit' && <StructuredEditor userId={userId} save={data.save} onSaved={load} />}
            {tab === 'backups' && <Backups userId={userId} backups={data.backups ?? []} onRolledBack={load} />}
          </>
        )}
      </div>
    </div>
  );
}
