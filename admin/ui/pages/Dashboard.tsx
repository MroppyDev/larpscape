import { useState } from 'react';
import { game } from '../api';
import { errMsg, fmtTime, fmtUptime, usePoll } from '../lib/util';

interface Stats {
  uptimeSec: number;
  online: number;
  users: number;
  characters: number;
  activeOffers: number;
  tradesToday: number;
  chatLines: number;
}

interface ChatLine {
  id: number;
  userId: number;
  username: string;
  text: string;
  createdAt: number;
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

function BroadcastCard() {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await game.post('broadcast', { text: message });
      setResult({ ok: true, msg: `Delivered to ${res?.delivered ?? 0} player${res?.delivered === 1 ? '' : 's'}.` });
      setText('');
    } catch (e) {
      setResult({ ok: false, msg: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Broadcast</h2>
      <div className="row">
        <input
          style={{ flex: 1, minWidth: 220 }}
          placeholder="Server-wide message…"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button className="primary" disabled={busy || !text.trim()} onClick={send}>
          {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
      {result && (
        <div className={result.ok ? 'ok-text' : 'error-text'} style={{ marginTop: 8 }}>
          {result.msg}
        </div>
      )}
    </div>
  );
}

function RecentChatCard() {
  const chat = usePoll<{ lines: ChatLine[] }>(() => game.get('chat?limit=15'), 5000);
  const lines = chat.data?.lines ?? [];

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Recent chat</h2>
      {chat.loading && <div className="dim">Loading chat…</div>}
      {!chat.loading && chat.error && !chat.data && (
        <div className="error-text">Could not load chat: {chat.error}</div>
      )}
      {!chat.loading && !lines.length && !chat.error && (
        <div className="dim">No chat messages yet.</div>
      )}
      {lines.length > 0 && (
        <div className="log" style={{ maxHeight: 300 }}>
          {[...lines].reverse().map((l) => (
            <div key={l.id}>
              <span className="dim">[{fmtTime(l.createdAt)}]</span>{' '}
              <span style={{ color: 'var(--accent)' }}>{l.username}</span>: {l.text}
            </div>
          ))}
        </div>
      )}
      {chat.data && chat.error && (
        <div className="error-text" style={{ marginTop: 6 }}>Refresh failed: {chat.error}</div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const stats = usePoll<Stats>(() => game.get('stats'), 10000);
  const online = stats.error === null && stats.data !== null;

  return (
    <div>
      <div className="row" style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        {!stats.loading && (
          <span className={`tag ${online ? 'good' : 'bad'}`}>
            {online ? 'online' : 'unreachable'}
          </span>
        )}
      </div>

      {stats.loading && <div className="card dim">Loading server stats…</div>}

      {!stats.loading && !stats.data && (
        <div className="card">
          <span className="error-text">
            Game server unreachable — stats unavailable. {stats.error}
          </span>
        </div>
      )}

      {stats.data && (
        <>
          {stats.error && (
            <div className="card">
              <span className="error-text">
                Lost contact with the game server — showing last known stats. {stats.error}
              </span>
            </div>
          )}
          <div className="cards-row" style={{ marginBottom: 16 }}>
            <StatCard label="Players online" value={stats.data.online} />
            <StatCard label="Accounts" value={stats.data.users.toLocaleString()} />
            <StatCard label="Characters" value={stats.data.characters.toLocaleString()} />
            <StatCard label="Active GE offers" value={stats.data.activeOffers} />
            <StatCard label="Uptime" value={fmtUptime(stats.data.uptimeSec)} />
            <StatCard label="Chat lines" value={stats.data.chatLines.toLocaleString()} />
          </div>
        </>
      )}

      <BroadcastCard />
      <RecentChatCard />
    </div>
  );
}
