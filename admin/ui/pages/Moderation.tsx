import { useCallback, useEffect, useState } from 'react';
import { game } from '../api';
import CharacterInspector from './CharacterInspector';
import {
  MutedUntil, errMsg, fmtDate, fmtDateTime, fmtTime, isMuted, muteLabel,
  useDebounced, usePoll,
} from '../lib/util';

const PAGE_SIZE = 50;

interface AdminUser {
  id: number;
  username: string;
  createdAt: number;
  banned: boolean;
  mutedUntil: MutedUntil;
  saveUpdatedAt: number | null;
}

interface GeOffer {
  id: number;
  username: string;
  kind: string;
  item: string;
  qty: number;
  price: number;
  filled: number;
  active: boolean;
}

interface GeTrade { item: string; qty: number; price: number; created_at: number }

interface ChatLine { id: number; userId: number; username: string; text: string; createdAt: number }

// ---------------------------------------------------------------------------
// Ban / mute modal
// ---------------------------------------------------------------------------

type PendingAction = { kind: 'ban' | 'mute'; user: AdminUser };

function ActionModal({
  action,
  onClose,
  onDone,
}: {
  action: PendingAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState('');
  const [minutes, setMinutes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { kind, user } = action;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'ban') {
        await game.post('ban', { userId: user.id, reason: reason.trim() || 'No reason given' });
      } else {
        const mins = minutes.trim() === '' ? 0 : Number(minutes);
        if (!Number.isFinite(mins) || mins < 0) {
          setError('Minutes must be a non-negative number (empty = permanent).');
          setBusy(false);
          return;
        }
        await game.post('mute', { userId: user.id, minutes: mins, reason: reason.trim() || 'No reason given' });
      }
      onDone();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{kind === 'ban' ? 'Ban' : 'Mute'} {user.username}</h2>
        <div className="field">
          <label>Reason</label>
          <input
            style={{ width: '100%' }}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Shown in moderation logs"
            autoFocus
          />
        </div>
        {kind === 'mute' && (
          <div className="field">
            <label>Duration (minutes — leave empty for permanent)</label>
            <input
              style={{ width: '100%' }}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              placeholder="e.g. 60"
              inputMode="numeric"
            />
          </div>
        )}
        {error && <div className="error-text" style={{ marginBottom: 10 }}>{error}</div>}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button disabled={busy} onClick={onClose}>Cancel</button>
          <button className="danger" disabled={busy} onClick={submit}>
            {busy ? 'Applying…' : kind === 'ban' ? 'Ban player' : 'Mute player'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Players tab
// ---------------------------------------------------------------------------

function PlayersTab() {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebounced(query, 350);
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<{ users: AdminUser[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<PendingAction | null>(null);
  const [inspect, setInspect] = useState<AdminUser | null>(null);
  const [rowBusy, setRowBusy] = useState<number | null>(null);
  const [rowStatus, setRowStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => { setOffset(0); }, [debouncedQuery]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await game.get(`users?q=${encodeURIComponent(debouncedQuery)}&offset=${offset}`);
      setData(res);
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, offset]);

  useEffect(() => { load(); }, [load]);

  const doAction = async (label: string, user: AdminUser, fn: () => Promise<unknown>, confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return;
    setRowBusy(user.id);
    setRowStatus(null);
    try {
      await fn();
      setRowStatus({ ok: true, msg: `${label} ${user.username}: done.` });
      await load();
    } catch (e) {
      setRowStatus({ ok: false, msg: `${label} ${user.username} failed: ${errMsg(e)}` });
    } finally {
      setRowBusy(null);
    }
  };

  const users = data?.users ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Search players by username…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {data && <span className="dim">{total.toLocaleString()} account{total === 1 ? '' : 's'}</span>}
      </div>

      {rowStatus && (
        <div className={rowStatus.ok ? 'ok-text' : 'error-text'} style={{ marginBottom: 8 }}>
          {rowStatus.msg}
        </div>
      )}

      {loading && !data && <div className="dim">Loading players…</div>}
      {error && !data && <div className="error-text">Could not load players: {error}</div>}
      {error && data && <div className="error-text" style={{ marginBottom: 8 }}>Refresh failed: {error}</div>}

      {data && (
        <>
          {!users.length && <div className="dim">No players match that search.</div>}
          {users.length > 0 && (
            <table className="data">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Created</th>
                  <th>Save updated</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const muted = isMuted(u.mutedUntil);
                  const busy = rowBusy === u.id;
                  return (
                    <tr key={u.id}>
                      <td>
                        {u.username} <span className="dim" style={{ fontSize: 11 }}>#{u.id}</span>
                      </td>
                      <td className="dim">{fmtDate(u.createdAt)}</td>
                      <td className="dim">{u.saveUpdatedAt ? fmtDateTime(u.saveUpdatedAt) : '—'}</td>
                      <td>
                        {u.banned && <span className="tag bad">banned</span>}{' '}
                        {muted && <span className="tag warn" title={muteLabel(u.mutedUntil)}>muted</span>}
                        {!u.banned && !muted && <span className="tag good">ok</span>}
                      </td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 5 }}>
                          <button className="small" disabled={busy} onClick={() => setInspect(u)}>Inspect</button>
                          <button
                            className="small"
                            disabled={busy}
                            onClick={() => doAction('Kick', u,
                              () => game.post('kick', { userId: u.id }),
                              `Kick ${u.username} from the server?`)}
                          >
                            Kick
                          </button>
                          {u.banned ? (
                            <button
                              className="small"
                              disabled={busy}
                              onClick={() => doAction('Unban', u,
                                () => game.post('unban', { userId: u.id }),
                                `Unban ${u.username}?`)}
                            >
                              Unban
                            </button>
                          ) : (
                            <button className="small danger" disabled={busy} onClick={() => setAction({ kind: 'ban', user: u })}>
                              Ban
                            </button>
                          )}
                          {muted ? (
                            <button
                              className="small"
                              disabled={busy}
                              onClick={() => doAction('Unmute', u,
                                () => game.post('unmute', { userId: u.id }),
                                `Unmute ${u.username}?`)}
                            >
                              Unmute
                            </button>
                          ) : (
                            <button className="small danger" disabled={busy} onClick={() => setAction({ kind: 'mute', user: u })}>
                              Mute
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {pages > 1 && (
            <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="small" disabled={offset === 0 || loading} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                ← Prev
              </button>
              <span className="dim">Page {page} of {pages}</span>
              <button
                className="small"
                disabled={offset + PAGE_SIZE >= total || loading}
                onClick={() => setOffset(offset + PAGE_SIZE)}
              >
                Next →
              </button>
            </div>
          )}
        </>
      )}

      {action && (
        <ActionModal
          action={action}
          onClose={() => setAction(null)}
          onDone={() => { setAction(null); load(); }}
        />
      )}
      {inspect && (
        <CharacterInspector
          userId={inspect.id}
          username={inspect.username}
          onClose={() => setInspect(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Grand Exchange tab
// ---------------------------------------------------------------------------

function GeTab() {
  const ge = usePoll<{ offers: GeOffer[]; trades: GeTrade[] }>(() => game.get('ge'), 10000);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const cancel = async (offer: GeOffer) => {
    if (!window.confirm(`Cancel ${offer.username}'s ${offer.kind} offer for ${offer.qty}× ${offer.item}? Remaining items/coins are returned to the player.`)) return;
    setBusyId(offer.id);
    setStatus(null);
    try {
      await game.post('ge/cancel', { id: offer.id });
      setStatus({ ok: true, msg: `Offer #${offer.id} cancelled.` });
      ge.refresh();
    } catch (e) {
      setStatus({ ok: false, msg: `Cancel failed: ${errMsg(e)}` });
    } finally {
      setBusyId(null);
    }
  };

  const offers = (ge.data?.offers ?? []).filter((o) => o.active);
  const trades = ge.data?.trades ?? [];

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Active offers ({offers.length})</h2>
        {ge.loading && <div className="dim">Loading offers…</div>}
        {!ge.loading && !ge.data && <div className="error-text">Grand Exchange unavailable: {ge.error}</div>}
        {ge.data && ge.error && <div className="error-text" style={{ marginBottom: 8 }}>Refresh failed: {ge.error}</div>}
        {status && (
          <div className={status.ok ? 'ok-text' : 'error-text'} style={{ marginBottom: 8 }}>{status.msg}</div>
        )}
        {ge.data && !offers.length && <div className="dim">No active offers.</div>}
        {offers.length > 0 && (
          <table className="data">
            <thead>
              <tr>
                <th>Player</th><th>Kind</th><th>Item</th><th>Filled</th><th>Price (ea)</th><th />
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td>{o.username}</td>
                  <td>
                    <span className={`tag ${o.kind === 'buy' ? 'good' : 'warn'}`}>{o.kind}</span>
                  </td>
                  <td className="mono">{o.item}</td>
                  <td>{o.filled.toLocaleString()} / {o.qty.toLocaleString()}</td>
                  <td>{o.price.toLocaleString()} gp</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="small danger" disabled={busyId !== null} onClick={() => cancel(o)}>
                      {busyId === o.id ? 'Cancelling…' : 'Cancel'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Recent trades</h2>
        {ge.data && !trades.length && <div className="dim">No trades recorded yet.</div>}
        {trades.length > 0 && (
          <div style={{ maxHeight: 320, overflow: 'auto' }}>
            <table className="data">
              <thead>
                <tr><th>Item</th><th>Qty</th><th>Price (ea)</th><th>When</th></tr>
              </thead>
              <tbody>
                {trades.map((t, i) => (
                  <tr key={i}>
                    <td className="mono">{t.item}</td>
                    <td>{t.qty.toLocaleString()}</td>
                    <td>{t.price.toLocaleString()} gp</td>
                    <td className="dim">{fmtDateTime(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Chat log tab
// ---------------------------------------------------------------------------

function ChatTab() {
  const chat = usePoll<{ lines: ChatLine[] }>(() => game.get('chat?limit=200'), 10000);
  const [filter, setFilter] = useState('');

  const lines = (chat.data?.lines ?? []).filter(
    (l) => !filter.trim() || l.username.toLowerCase().includes(filter.trim().toLowerCase()),
  );

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <input
          style={{ flex: 1, minWidth: 200 }}
          placeholder="Filter by username…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        {chat.data && (
          <span className="dim">{lines.length} of {chat.data.lines.length} lines</span>
        )}
        <button className="small" onClick={chat.refresh}>Refresh</button>
      </div>
      {chat.loading && <div className="dim">Loading chat log…</div>}
      {!chat.loading && !chat.data && <div className="error-text">Chat log unavailable: {chat.error}</div>}
      {chat.data && chat.error && <div className="error-text" style={{ marginBottom: 8 }}>Refresh failed: {chat.error}</div>}
      {chat.data && !lines.length && <div className="dim">No matching chat lines.</div>}
      {lines.length > 0 && (
        <div className="log" style={{ maxHeight: 520 }}>
          {lines.map((l) => (
            <div key={l.id}>
              <span className="dim">[{fmtDate(l.createdAt)} {fmtTime(l.createdAt)}]</span>{' '}
              <span style={{ color: 'var(--accent)' }}>{l.username}</span>
              <span className="dim"> (#{l.userId})</span>: {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function Moderation() {
  const [tab, setTab] = useState<'players' | 'ge' | 'chat'>('players');

  return (
    <div>
      <h1>Moderation</h1>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className={`small ${tab === 'players' ? 'primary' : ''}`} onClick={() => setTab('players')}>
          Players
        </button>
        <button className={`small ${tab === 'ge' ? 'primary' : ''}`} onClick={() => setTab('ge')}>
          Grand Exchange
        </button>
        <button className={`small ${tab === 'chat' ? 'primary' : ''}`} onClick={() => setTab('chat')}>
          Chat log
        </button>
      </div>
      {tab === 'players' && <PlayersTab />}
      {tab === 'ge' && <GeTab />}
      {tab === 'chat' && <ChatTab />}
    </div>
  );
}
