// Spawns editor: NPC spawn points and ground item spawns as editable tables.
import { useState } from 'react';
import {
  Datalist, IdInput, LoadGuard, RawJson, SaveBar, Tabs, useContentFile,
  useItemIds, useNpcIds,
} from './common';
import type { SpawnsFile } from './types';

type NpcSpawn = SpawnsFile['npcSpawns'][number];
type GroundSpawn = SpawnsFile['groundSpawns'][number];

export default function SpawnsEditor() {
  const file = useContentFile<SpawnsFile>('spawns.json');
  const itemIds = useItemIds();
  const npcIds = useNpcIds();
  const [tab, setTab] = useState<'npc' | 'ground'>('npc');

  return (
    <div>
      <SaveBar file={file} title="Spawns" />
      <Datalist id="dl-npcs-spawns" options={npcIds} />
      <Datalist id="dl-items-spawns" options={itemIds} />
      <LoadGuard file={file}>
        {() => (
          <>
            <div className="dim" style={{ marginBottom: 10, fontSize: 13 }}>
              Coordinates are tile positions; use the map editor for visual placement.
            </div>
            <Tabs
              tabs={[
                { key: 'npc', label: 'NPC spawns', badge: file.data!.npcSpawns.length },
                { key: 'ground', label: 'Ground spawns', badge: file.data!.groundSpawns.length },
              ]}
              active={tab}
              onSelect={(k) => setTab(k as 'npc' | 'ground')}
            />
            {tab === 'npc' ? (
              <NpcSpawnsTable
                rows={file.data!.npcSpawns}
                onChange={(npcSpawns) => file.update((p) => ({ ...p, npcSpawns }))}
              />
            ) : (
              <GroundSpawnsTable
                rows={file.data!.groundSpawns}
                onChange={(groundSpawns) => file.update((p) => ({ ...p, groundSpawns }))}
              />
            )}
            <RawJson value={file.data} onApply={(parsed) => file.update(() => parsed)} label="Raw JSON (whole file)" />
          </>
        )}
      </LoadGuard>
    </div>
  );
}

function NpcSpawnsTable({ rows, onChange }: { rows: NpcSpawn[]; onChange: (r: NpcSpawn[]) => void }) {
  const [filter, setFilter] = useState('');
  const set = (i: number, patch: Partial<NpcSpawn>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const visible = filter.trim()
    ? rows.map((r, i) => [r, i] as const).filter(([r]) => r.id.includes(filter.trim().toLowerCase()))
    : rows.map((r, i) => [r, i] as const);

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 10 }}>
        <input placeholder="Filter by npc id…" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 240 }} />
        <span className="dim">{visible.length} / {rows.length} spawns</span>
      </div>
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        <table className="data">
          <thead><tr><th>NPC</th><th>X</th><th>Y</th><th /></tr></thead>
          <tbody>
            {visible.map(([r, i]) => (
              <tr key={i}>
                <td><IdInput value={r.id} listId="dl-npcs-spawns" width={200} placeholder="npc id" onChange={(v) => set(i, { id: v })} /></td>
                <td><input type="number" min={0} value={r.x} style={{ width: 80 }} aria-label="x"
                  onChange={(e) => set(i, { x: Number(e.target.value) || 0 })} /></td>
                <td><input type="number" min={0} value={r.y} style={{ width: 80 }} aria-label="y"
                  onChange={(e) => set(i, { y: Number(e.target.value) || 0 })} /></td>
                <td><button className="small" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove spawn">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="small" style={{ marginTop: 8 }} onClick={() => onChange([...rows, { id: '', x: 0, y: 0 }])}>+ add NPC spawn</button>
    </div>
  );
}

function GroundSpawnsTable({ rows, onChange }: { rows: GroundSpawn[]; onChange: (r: GroundSpawn[]) => void }) {
  const set = (i: number, patch: Partial<GroundSpawn>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="card">
      <div style={{ maxHeight: '60vh', overflow: 'auto' }}>
        <table className="data">
          <thead><tr><th>Item</th><th>X</th><th>Y</th><th>Respawn ticks</th><th /></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td><IdInput value={r.item} listId="dl-items-spawns" width={200} placeholder="item id" onChange={(v) => set(i, { item: v })} /></td>
                <td><input type="number" min={0} value={r.x} style={{ width: 80 }} aria-label="x"
                  onChange={(e) => set(i, { x: Number(e.target.value) || 0 })} /></td>
                <td><input type="number" min={0} value={r.y} style={{ width: 80 }} aria-label="y"
                  onChange={(e) => set(i, { y: Number(e.target.value) || 0 })} /></td>
                <td><input type="number" min={1} value={r.respawnTicks} style={{ width: 100 }} aria-label="respawn ticks"
                  onChange={(e) => set(i, { respawnTicks: Number(e.target.value) || 1 })} /></td>
                <td><button className="small" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove spawn">✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="small" style={{ marginTop: 8 }} onClick={() => onChange([...rows, { item: '', x: 0, y: 0, respawnTicks: 50 }])}>+ add ground spawn</button>
    </div>
  );
}
