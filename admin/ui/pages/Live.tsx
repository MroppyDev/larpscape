import { useEffect, useRef, useState } from 'react';
import { content, game } from '../api';
import { decodeTerrain, terrainImage } from '../lib/terrain';
import { errMsg, fmtTime, usePoll } from '../lib/util';

const SCALE = 3; // px per tile

interface OnlinePlayer {
  userId: number;
  name: string;
  x: number;
  y: number;
  app: Record<string, unknown>;
}

interface ChatLine {
  id: number;
  userId: number;
  username: string;
  text: string;
  createdAt: number;
}

interface MapFile {
  width: number;
  height: number;
  terrain: string;
}

function WorldCanvas({
  map,
  players,
  selectedId,
  onSelect,
}: {
  map: MapFile;
  players: OnlinePlayer[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);

  // Render the terrain once to an offscreen canvas.
  useEffect(() => {
    const base = document.createElement('canvas');
    base.width = map.width;
    base.height = map.height;
    const ctx = base.getContext('2d');
    if (ctx) {
      ctx.putImageData(terrainImage(decodeTerrain(map.terrain), map.width, map.height), 0, 0);
    }
    baseRef.current = base;
  }, [map]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(base, 0, 0, map.width * SCALE, map.height * SCALE);

    for (const p of players) {
      const px = p.x * SCALE + SCALE / 2;
      const py = p.y * SCALE + SCALE / 2;
      if (p.userId === selectedId) {
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe35a';
      ctx.fill();
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = p.userId === selectedId ? '#ffffff' : '#ffe35a';
      ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.lineWidth = 2.5;
      ctx.strokeText(p.name, px, py - 7);
      ctx.fillText(p.name, px, py - 7);
    }
  }, [map, players, selectedId]);

  const onClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    let best: OnlinePlayer | null = null;
    let bestDist = 12; // px hit radius
    for (const p of players) {
      const dx = p.x * SCALE + SCALE / 2 - x;
      const dy = p.y * SCALE + SCALE / 2 - y;
      const dist = Math.hypot(dx, dy);
      if (dist < bestDist) { best = p; bestDist = dist; }
    }
    onSelect(best ? best.userId : null);
  };

  return (
    <canvas
      ref={canvasRef}
      width={map.width * SCALE}
      height={map.height * SCALE}
      onClick={onClick}
      style={{
        imageRendering: 'pixelated',
        border: '1px solid var(--border)',
        borderRadius: 6,
        cursor: 'crosshair',
        display: 'block',
        maxWidth: '100%',
      }}
    />
  );
}

function ChatPanel() {
  const chat = usePoll<{ lines: ChatLine[] }>(() => game.get('chat?limit=30'), 3000);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const lines = chat.data?.lines ?? [];

  const send = async () => {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await game.post('broadcast', { text: message });
      setStatus({ ok: true, msg: `Broadcast delivered to ${res?.delivered ?? 0}.` });
      setText('');
      chat.refresh();
    } catch (e) {
      setStatus({ ok: false, msg: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Live chat</h2>
      {chat.loading && <div className="dim">Loading chat…</div>}
      {!chat.loading && !chat.data && (
        <div className="error-text">Chat unavailable: {chat.error}</div>
      )}
      {chat.data && (
        <div className="log" style={{ maxHeight: 240 }}>
          {!lines.length && <div className="dim">No chat messages yet.</div>}
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
      <div className="row" style={{ marginTop: 10 }}>
        <input
          style={{ flex: 1, minWidth: 160 }}
          placeholder="Broadcast to all players…"
          value={text}
          maxLength={200}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
        />
        <button className="primary" disabled={busy || !text.trim()} onClick={send}>
          {busy ? 'Sending…' : 'Broadcast'}
        </button>
      </div>
      {status && (
        <div className={status.ok ? 'ok-text' : 'error-text'} style={{ marginTop: 6 }}>
          {status.msg}
        </div>
      )}
    </div>
  );
}

export default function Live() {
  const [map, setMap] = useState<MapFile | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    content.load('map.json')
      .then((m: MapFile) => setMap(m))
      .catch((e) => setMapError(errMsg(e)));
  }, []);

  const online = usePoll<{ players: OnlinePlayer[]; count: number }>(
    () => game.get('online'), 2000,
  );
  const players = online.data?.players ?? [];
  const selected = players.find((p) => p.userId === selectedId) ?? null;
  const reachable = online.error === null && online.data !== null;

  return (
    <div>
      <div className="row" style={{ marginBottom: 18 }}>
        <h1 style={{ margin: 0 }}>Live view</h1>
        {!online.loading && (
          <span className={`tag ${reachable ? 'good' : 'bad'}`}>
            {reachable ? 'online' : 'unreachable'}
          </span>
        )}
        {online.data && <span className="dim">{online.data.count} player{online.data.count === 1 ? '' : 's'} in world</span>}
      </div>

      {online.error && (
        <div className="card">
          <span className="error-text">
            Game server unreachable — player positions may be stale. {online.error}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div className="card" style={{ flexShrink: 0 }}>
          {mapError && <div className="error-text">Failed to load map: {mapError}</div>}
          {!map && !mapError && <div className="dim">Loading world map…</div>}
          {map && (
            <WorldCanvas
              map={map}
              players={players}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 300 }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Online players</h2>
            {online.loading && <div className="dim">Loading…</div>}
            {!online.loading && !players.length && <div className="dim">Nobody is online right now.</div>}
            {players.length > 0 && (
              <table className="data">
                <thead>
                  <tr><th>Name</th><th>Position</th></tr>
                </thead>
                <tbody>
                  {players.map((p) => (
                    <tr
                      key={p.userId}
                      onClick={() => setSelectedId(p.userId === selectedId ? null : p.userId)}
                      style={{
                        cursor: 'pointer',
                        background: p.userId === selectedId ? 'var(--bg-3)' : undefined,
                      }}
                    >
                      <td style={{ color: p.userId === selectedId ? 'var(--accent)' : undefined }}>{p.name}</td>
                      <td className="mono">({p.x}, {p.y})</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {selected && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>{selected.name}</h2>
              <div className="row" style={{ marginBottom: 8 }}>
                <span className="dim">User ID</span>
                <span className="mono">{selected.userId}</span>
                <span className="dim">Position</span>
                <span className="mono">({selected.x}, {selected.y})</span>
              </div>
              <label>Equipment appearance</label>
              <div className="log" style={{ maxHeight: 180 }}>
                {JSON.stringify(selected.app ?? {}, null, 2)}
              </div>
            </div>
          )}

          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
