// Magic & slayer editor: spells (with rune costs), prayers, slayer targets.
import { useState } from 'react';
import {
  Datalist, IdInput, ItemQtyList, LoadGuard, NewIdModal, RawJson, SaveBar,
  Tabs, useContentFile, useItemIds, useNpcIds,
} from './common';
import type { MagicFile } from './types';

type Spell = MagicFile['spells'][number];
type PrayerDef = MagicFile['prayers'][number];
type SlayerTarget = MagicFile['slayerTargets'][number];

export default function MagicEditor() {
  const file = useContentFile<MagicFile>('magic.json');
  const itemIds = useItemIds();
  const npcIds = useNpcIds();
  const [tab, setTab] = useState<'spells' | 'prayers' | 'slayerTargets'>('spells');

  return (
    <div>
      <SaveBar file={file} title="Magic & slayer" />
      <Datalist id="dl-items-magic" options={itemIds} />
      <Datalist id="dl-npcs-magic" options={npcIds} />
      <LoadGuard file={file}>
        {() => (
          <>
            <Tabs
              tabs={[
                { key: 'spells', label: 'Spells', badge: file.data!.spells.length },
                { key: 'prayers', label: 'Prayers', badge: file.data!.prayers.length },
                { key: 'slayerTargets', label: 'Slayer targets', badge: file.data!.slayerTargets.length },
              ]}
              active={tab}
              onSelect={(k) => setTab(k as typeof tab)}
            />
            {tab === 'spells' && (
              <SpellsTab rows={file.data!.spells} onChange={(spells) => file.update((p) => ({ ...p, spells }))} />
            )}
            {tab === 'prayers' && (
              <PrayersTab rows={file.data!.prayers} onChange={(prayers) => file.update((p) => ({ ...p, prayers }))} />
            )}
            {tab === 'slayerTargets' && (
              <SlayerTab rows={file.data!.slayerTargets} onChange={(slayerTargets) => file.update((p) => ({ ...p, slayerTargets }))} />
            )}
          </>
        )}
      </LoadGuard>
    </div>
  );
}

function SpellsTab({ rows, onChange }: { rows: Spell[]; onChange: (r: Spell[]) => void }) {
  const [creating, setCreating] = useState(false);
  const set = (i: number, patch: Partial<Spell>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr><th>ID</th><th>Name</th><th>Level</th><th>XP</th><th>Max hit</th><th>Runes</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((s, i) => (
            <tr key={i}>
              <td className="mono" style={{ verticalAlign: 'top' }}>{s.id}</td>
              <td style={{ verticalAlign: 'top' }}>
                <input value={s.name} style={{ width: 140 }} aria-label="spell name" onChange={(e) => set(i, { name: e.target.value })} />
              </td>
              <td style={{ verticalAlign: 'top' }}>
                <input type="number" min={1} max={99} value={s.level} style={{ width: 60 }} aria-label="level"
                  onChange={(e) => set(i, { level: Number(e.target.value) || 1 })} />
              </td>
              <td style={{ verticalAlign: 'top' }}>
                <input type="number" min={0} step="any" value={s.xp} style={{ width: 70 }} aria-label="xp"
                  onChange={(e) => set(i, { xp: Number(e.target.value) })} />
              </td>
              <td style={{ verticalAlign: 'top' }}>
                <input type="number" min={0} value={s.maxHit} style={{ width: 60 }} aria-label="max hit"
                  onChange={(e) => set(i, { maxHit: Number(e.target.value) || 0 })} />
              </td>
              <td>
                <ItemQtyList value={s.runes} onChange={(runes) => set(i, { runes })} listId="dl-items-magic" compact />
              </td>
              <td style={{ verticalAlign: 'top' }}>
                <button className="small" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove spell">✕</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="small" style={{ marginTop: 10 }} onClick={() => setCreating(true)}>+ add spell</button>
      <RawJson value={rows} onApply={(p) => { if (Array.isArray(p)) onChange(p); }} label="Raw JSON (spells)" />
      {creating && (
        <NewIdModal
          title="New spell"
          existing={rows.map((r) => r.id)}
          onCreate={(id) => {
            onChange([...rows, {
              id,
              name: id.replace(/_/g, ' ').replace(/\b./g, (c) => c.toUpperCase()),
              level: 1, xp: 5, maxHit: 1, runes: [],
            }]);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function PrayersTab({ rows, onChange }: { rows: PrayerDef[]; onChange: (r: PrayerDef[]) => void }) {
  const [creating, setCreating] = useState(false);
  const set = (i: number, patch: Partial<PrayerDef>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="card">
      <table className="data">
        <thead>
          <tr><th>ID</th><th>Name</th><th>Level</th><th>Drain /tick</th><th>Boosts</th><th>Multiplier</th><th /></tr>
        </thead>
        <tbody>
          {rows.map((p, i) => (
            <tr key={i}>
              <td className="mono">{p.id}</td>
              <td><input value={p.name} style={{ width: 160 }} aria-label="prayer name" onChange={(e) => set(i, { name: e.target.value })} /></td>
              <td><input type="number" min={1} max={99} value={p.level} style={{ width: 60 }} aria-label="level"
                onChange={(e) => set(i, { level: Number(e.target.value) || 1 })} /></td>
              <td><input type="number" min={0} step="any" value={p.drain} style={{ width: 80 }} aria-label="drain"
                onChange={(e) => set(i, { drain: Number(e.target.value) })} /></td>
              <td>
                <select value={p.boost} aria-label="boosted stat" onChange={(e) => set(i, { boost: e.target.value as PrayerDef['boost'] })}>
                  <option value="attack">attack</option>
                  <option value="strength">strength</option>
                  <option value="defence">defence</option>
                </select>
              </td>
              <td><input type="number" min={1} step={0.05} value={p.mult} style={{ width: 70 }} aria-label="multiplier"
                onChange={(e) => set(i, { mult: Number(e.target.value) })} /></td>
              <td><button className="small" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove prayer">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="small" style={{ marginTop: 10 }} onClick={() => setCreating(true)}>+ add prayer</button>
      <RawJson value={rows} onApply={(p) => { if (Array.isArray(p)) onChange(p); }} label="Raw JSON (prayers)" />
      {creating && (
        <NewIdModal
          title="New prayer"
          existing={rows.map((r) => r.id)}
          onCreate={(id) => {
            onChange([...rows, {
              id,
              name: id.replace(/_/g, ' ').replace(/\b./g, (c) => c.toUpperCase()),
              level: 1, drain: 1, boost: 'defence', mult: 1.05,
            }]);
            setCreating(false);
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function SlayerTab({ rows, onChange }: { rows: SlayerTarget[]; onChange: (r: SlayerTarget[]) => void }) {
  const set = (i: number, patch: Partial<SlayerTarget>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="card">
      <div className="dim" style={{ marginBottom: 10, fontSize: 13 }}>
        NPCs that can be assigned as slayer tasks, with the Slayer level required.
      </div>
      <table className="data">
        <thead><tr><th>NPC</th><th>Slayer level</th><th /></tr></thead>
        <tbody>
          {rows.map((t, i) => (
            <tr key={i}>
              <td><IdInput value={t.npc} listId="dl-npcs-magic" width={220} placeholder="npc id" onChange={(v) => set(i, { npc: v })} /></td>
              <td><input type="number" min={1} max={99} value={t.level} style={{ width: 70 }} aria-label="slayer level"
                onChange={(e) => set(i, { level: Number(e.target.value) || 1 })} /></td>
              <td><button className="small" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove target">✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="small" style={{ marginTop: 10 }} onClick={() => onChange([...rows, { npc: '', level: 1 }])}>+ add slayer target</button>
      <RawJson value={rows} onApply={(p) => { if (Array.isArray(p)) onChange(p); }} label="Raw JSON (slayer targets)" />
    </div>
  );
}
