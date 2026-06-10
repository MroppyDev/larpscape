import { useEffect, useMemo, useState } from 'react';
import { api, game } from '../api';
import { SKILLS, levelForXp, totalLevel } from '../lib/skills';
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

function countCoins(save: CharSave): number {
  let total = 0;
  for (const s of save.inventory ?? []) if (s?.id === 'coins') total += s.qty;
  for (const s of save.bank ?? []) if (s?.id === 'coins') total += s.qty;
  for (const s of Object.values(save.equipment ?? {})) if (s?.id === 'coins') total += s.qty;
  return total;
}

function SkillsGrid({ xp }: { xp: number[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 6 }}>
      {SKILLS.map((name, i) => {
        const skillXp = xp?.[i] ?? 0;
        return (
          <div
            key={name}
            title={`${Math.floor(skillXp).toLocaleString()} xp`}
            style={{
              background: 'var(--bg-3)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '4px 8px', display: 'flex',
              justifyContent: 'space-between', fontSize: 12,
            }}
          >
            <span className="dim">{name}</span>
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{levelForXp(skillXp)}</span>
          </div>
        );
      })}
    </div>
  );
}

function InventoryGrid({ inventory }: { inventory: (ItemStack | null)[] }) {
  const slots = Array.from({ length: 28 }, (_, i) => inventory?.[i] ?? null);
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
      {slots.map((s, i) => (
        <div
          key={i}
          style={{
            background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4,
            padding: '5px 7px', minHeight: 38, fontSize: 11.5,
          }}
        >
          {s ? (
            <>
              <div className="mono" style={{ fontSize: 11, color: s.id === 'coins' ? 'var(--accent)' : undefined, wordBreak: 'break-all' }}>
                {s.id}
              </div>
              <div className="dim">×{s.qty.toLocaleString()}</div>
            </>
          ) : (
            <span className="dim" style={{ fontSize: 10 }}>—</span>
          )}
        </div>
      ))}
    </div>
  );
}

function Overview({ save }: { save: CharSave }) {
  const coins = countCoins(save);
  const equipment = Object.entries(save.equipment ?? {});
  const bank = save.bank ?? [];
  const quests = Object.entries(save.quests ?? {});

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <span className="dim">Position</span>
        <span className="mono">({save.x}, {save.y})</span>
        <span className="dim">HP</span>
        <span className="mono">{save.curHp}</span>
        <span className="dim">Total level</span>
        <span className="mono">{totalLevel(save.xp ?? [])}</span>
        <span className="dim">Coins</span>
        <span className="mono" style={{ color: 'var(--accent)', fontWeight: 600 }}>{coins.toLocaleString()} gp</span>
      </div>

      <h2>Skills</h2>
      <SkillsGrid xp={save.xp ?? []} />

      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <h2>Inventory</h2>
          <InventoryGrid inventory={save.inventory ?? []} />
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2>Equipment</h2>
          {!equipment.some(([, s]) => s) && <div className="dim">Nothing equipped.</div>}
          <table className="data">
            <tbody>
              {equipment.filter(([, s]) => s).map(([slot, s]) => (
                <tr key={slot}>
                  <td className="dim">{slot}</td>
                  <td className="mono">{s!.id}{s!.qty > 1 ? ` ×${s!.qty.toLocaleString()}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Quests</h2>
          {!quests.length && <div className="dim">No quest progress.</div>}
          <table className="data">
            <tbody>
              {quests.map(([q, stage]) => (
                <tr key={q}>
                  <td className="mono">{q}</td>
                  <td>stage {stage}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <h2>Bank ({bank.length} item{bank.length === 1 ? '' : 's'})</h2>
      {!bank.length && <div className="dim">Bank is empty.</div>}
      {bank.length > 0 && (
        <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
          <table className="data">
            <thead>
              <tr><th>Item</th><th>Qty</th></tr>
            </thead>
            <tbody>
              {bank.map((s, i) => (
                <tr key={`${s.id}-${i}`}>
                  <td className="mono" style={{ color: s.id === 'coins' ? 'var(--accent)' : undefined }}>{s.id}</td>
                  <td>{s.qty.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SaveEditor({ userId, save, onSaved }: { userId: number; save: CharSave; onSaved: () => void }) {
  const [text, setText] = useState(() => JSON.stringify(save, null, 2));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    setText(JSON.stringify(save, null, 2));
    setStatus(null);
  }, [save]);

  const submit = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      setStatus({ ok: false, msg: `Invalid JSON: ${errMsg(e)}` });
      return;
    }
    if (!window.confirm('Overwrite this character save? The player will load this data on next login.')) return;
    setBusy(true);
    setStatus(null);
    try {
      await api.put(`/admin-api/game/character/${userId}`, { save: parsed });
      setStatus({ ok: true, msg: 'Save updated.' });
      onSaved();
    } catch (e) {
      setStatus({ ok: false, msg: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="field">
        <label>Raw character save (JSON)</label>
        <textarea
          className="mono"
          style={{ width: '100%', height: 360, resize: 'vertical' }}
          value={text}
          onChange={(e) => setText(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className="row">
        <button className="primary" disabled={busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button disabled={busy} onClick={() => { setText(JSON.stringify(save, null, 2)); setStatus(null); }}>
          Reset
        </button>
        {status && <span className={status.ok ? 'ok-text' : 'error-text'}>{status.msg}</span>}
      </div>
    </>
  );
}

function Backups({ userId, backups, onRolledBack }: { userId: number; backups: Backup[]; onRolledBack: () => void }) {
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const rollback = async (b: Backup) => {
    if (!window.confirm(`Roll this character back to backup "${b.label}" from ${fmtDateTime(b.createdAt)}? The current save will be replaced.`)) return;
    setBusyId(b.id);
    setStatus(null);
    try {
      await game.post(`character/${userId}/rollback`, { backupId: b.id });
      setStatus({ ok: true, msg: 'Rollback applied.' });
      onRolledBack();
    } catch (e) {
      setStatus({ ok: false, msg: errMsg(e) });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      {!backups.length && <div className="dim">No backups recorded for this character.</div>}
      {backups.length > 0 && (
        <table className="data">
          <thead>
            <tr><th>Label</th><th>Created</th><th /></tr>
          </thead>
          <tbody>
            {backups.map((b) => (
              <tr key={b.id}>
                <td>{b.label}</td>
                <td className="dim">{fmtDateTime(b.createdAt)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="small danger" disabled={busyId !== null} onClick={() => rollback(b)}>
                    {busyId === b.id ? 'Rolling back…' : 'Rollback'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {status && (
        <div className={status.ok ? 'ok-text' : 'error-text'} style={{ marginTop: 8 }}>{status.msg}</div>
      )}
    </>
  );
}

export default function CharacterInspector({
  userId,
  username,
  onClose,
}: {
  userId: number;
  username: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<CharData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'save' | 'backups'>('overview');

  const load = useMemo(() => async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await game.get(`character/${userId}`));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ width: 820, maxWidth: '95vw' }} onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>
            {data?.save?.name || username} <span className="dim" style={{ fontWeight: 400 }}>· user #{userId}</span>
          </h2>
          <button className="small" onClick={onClose}>Close</button>
        </div>
        {data && (
          <div className="dim" style={{ fontSize: 12, marginBottom: 10 }}>
            Save last updated {fmtDateTime(data.updatedAt)}
          </div>
        )}

        <div className="row" style={{ marginBottom: 14 }}>
          {(['overview', 'save', 'backups'] as const).map((t) => (
            <button
              key={t}
              className={`small ${tab === t ? 'primary' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'overview' ? 'Overview' : t === 'save' ? 'Save editor' : `Backups (${data?.backups?.length ?? 0})`}
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
            {tab === 'save' && <SaveEditor userId={userId} save={data.save} onSaved={load} />}
            {tab === 'backups' && <Backups userId={userId} backups={data.backups ?? []} onRolledBack={load} />}
          </>
        )}
      </div>
    </div>
  );
}
