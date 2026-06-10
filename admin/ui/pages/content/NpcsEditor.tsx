// NPC catalog editor: table + full NpcDef form with drops and pickpocket.
import { useCallback, useMemo, useState } from 'react';
import {
  CheckField, ConfirmDeleteButton, Datalist, Field, IdInput, LoadGuard,
  NewIdModal, NumField, RawJson, SaveBar, SortHeader, TextField,
  useContentFile, useItemIds, useSearch, withOpt,
} from './common';
import type { NpcDef, NpcsFile } from './types';

type Drop = NpcDef['drops'][number];
type Pickpocket = NonNullable<NpcDef['pickpocket']>;

type SortField = 'id' | 'name' | 'combatLevel' | 'hitpoints';

export default function NpcsEditor() {
  const file = useContentFile<NpcsFile>('npcs.json');
  const itemIds = useItemIds();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ field: SortField; asc: boolean }>({ field: 'id', asc: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => Object.values(file.data ?? {}), [file.data]);
  const searchKeys = useCallback((n: NpcDef) => [n.id, n.name, n.examine], []);
  const filtered = useSearch(rows, query, searchKeys);

  const sorted = useMemo(() => {
    const dir = sort.asc ? 1 : -1;
    const key = (n: NpcDef): string | number => {
      switch (sort.field) {
        case 'name': return n.name.toLowerCase();
        case 'combatLevel': return n.combatLevel;
        case 'hitpoints': return n.hitpoints;
        default: return n.id;
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka < kb ? -dir : ka > kb ? dir : 0;
    });
  }, [filtered, sort]);

  const onSort = (f: string) =>
    setSort((s) => (s.field === f ? { ...s, asc: !s.asc } : { field: f as SortField, asc: true }));

  const createNpc = (id: string) => {
    file.update((prev) => ({
      ...prev,
      [id]: {
        id,
        name: id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        examine: 'A new inhabitant of the realm.',
        combatLevel: 1,
        hitpoints: 5,
        attack: 1,
        strength: 1,
        defence: 1,
        attackSpeed: 4,
        respawnTicks: 25,
        drops: [],
        color: '#b08868',
        size: 1,
        attackable: true,
      },
    }));
    setCreating(false);
    setSelected(id);
  };

  const deleteNpc = (id: string) => {
    file.update((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setSelected(null);
  };

  const selectedNpc = selected && file.data ? file.data[selected] : undefined;

  return (
    <div>
      <SaveBar file={file} title="NPCs" />
      <Datalist id="dl-items-npcs" options={itemIds} />
      <LoadGuard file={file}>
        {() => (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className="card" style={{ flex: '1 1 440px', minWidth: 400 }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <input
                  placeholder="Search id / name / examine…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="primary" onClick={() => setCreating(true)}>New NPC</button>
              </div>
              <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <SortHeader label="ID" field="id" sort={sort} onSort={onSort} />
                      <SortHeader label="Name" field="name" sort={sort} onSort={onSort} />
                      <SortHeader label="Cmb" field="combatLevel" sort={sort} onSort={onSort} />
                      <SortHeader label="HP" field="hitpoints" sort={sort} onSort={onSort} />
                      <th>Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((n) => (
                      <tr
                        key={n.id}
                        onClick={() => setSelected(n.id)}
                        style={{ cursor: 'pointer', background: selected === n.id ? 'var(--bg-3)' : undefined }}
                      >
                        <td className="mono">
                          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: n.color, marginRight: 6 }} />
                          {n.id}
                        </td>
                        <td>{n.name}</td>
                        <td>{n.combatLevel}</td>
                        <td>{n.hitpoints}</td>
                        <td>
                          {n.boss && <span className="tag bad" style={{ marginRight: 4 }}>boss</span>}
                          {n.aggressive && <span className="tag warn">aggressive</span>}
                          {!n.boss && !n.aggressive && <span className="dim">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sorted.length === 0 && <div className="dim" style={{ padding: 12 }}>No NPCs match.</div>}
              </div>
              <div className="dim" style={{ marginTop: 8, fontSize: 12 }}>{sorted.length} / {rows.length} NPCs</div>
            </div>

            <div style={{ flex: '1 1 460px', minWidth: 420 }}>
              {selectedNpc ? (
                <NpcForm
                  key={selectedNpc.id}
                  npc={selectedNpc}
                  onChange={(n) => file.update((prev) => ({ ...prev, [n.id]: n }))}
                  onDelete={() => deleteNpc(selectedNpc.id)}
                />
              ) : (
                <div className="card dim">Select an NPC to edit, or create a new one.</div>
              )}
            </div>
          </div>
        )}
      </LoadGuard>
      {creating && (
        <NewIdModal
          title="New NPC"
          existing={Object.keys(file.data ?? {})}
          onCreate={createNpc}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function NpcForm({ npc, onChange, onDelete }: {
  npc: NpcDef;
  onChange: (n: NpcDef) => void;
  onDelete: () => void;
}) {
  const opt = (key: keyof NpcDef, v: unknown) => onChange(withOpt(npc, key, v));

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 style={{ margin: 0, flex: 1 }}>
          {npc.name} <span className="mono dim">({npc.id})</span>
        </h2>
        <ConfirmDeleteButton onDelete={onDelete} small />
      </div>

      <TextField label="Name" value={npc.name} onChange={(v) => onChange({ ...npc, name: v })} />
      <TextField label="Examine" value={npc.examine} onChange={(v) => onChange({ ...npc, examine: v })} textarea />
      <TextField label="Extra option (e.g. Talk-to, Pickpocket)" value={npc.option ?? ''} onChange={(v) => opt('option', v || undefined)} />

      <h2>Combat</h2>
      <div className="row">
        <NumField label="Combat level" value={npc.combatLevel} min={0} step={1} width={100} onChange={(v) => onChange({ ...npc, combatLevel: v ?? 0 })} />
        <NumField label="Hitpoints" value={npc.hitpoints} min={1} step={1} width={90} onChange={(v) => onChange({ ...npc, hitpoints: v ?? 1 })} />
        <NumField label="Attack" value={npc.attack} min={1} step={1} width={80} onChange={(v) => onChange({ ...npc, attack: v ?? 1 })} />
        <NumField label="Strength" value={npc.strength} min={1} step={1} width={80} onChange={(v) => onChange({ ...npc, strength: v ?? 1 })} />
        <NumField label="Defence" value={npc.defence} min={1} step={1} width={80} onChange={(v) => onChange({ ...npc, defence: v ?? 1 })} />
        <NumField label="Attack speed" value={npc.attackSpeed} min={1} step={1} width={100} onChange={(v) => onChange({ ...npc, attackSpeed: v ?? 4 })} />
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <CheckField label="Attackable" checked={npc.attackable} onChange={(v) => onChange({ ...npc, attackable: v })} />
        <CheckField label="Aggressive" checked={!!npc.aggressive} onChange={(v) => opt('aggressive', v || undefined)} />
        <CheckField label="Boss" checked={!!npc.boss} onChange={(v) => opt('boss', v || undefined)} />
      </div>

      <h2>Appearance &amp; respawn</h2>
      <div className="row">
        <Field label="Color" width={90}>
          <input
            type="color"
            value={npc.color}
            onChange={(e) => onChange({ ...npc, color: e.target.value })}
            style={{ width: '100%', height: 34, padding: 2 }}
          />
        </Field>
        <NumField label="Size (tiles)" value={npc.size} min={0.1} step={0.1} width={90} onChange={(v) => onChange({ ...npc, size: v ?? 1 })} />
        <NumField label="Respawn ticks" value={npc.respawnTicks} min={1} step={1} width={110} onChange={(v) => onChange({ ...npc, respawnTicks: v ?? 25 })} />
      </div>

      <h2>Drops</h2>
      <DropsEditor value={npc.drops} onChange={(v) => onChange({ ...npc, drops: v })} />

      <h2>Pickpocket</h2>
      {npc.pickpocket ? (
        <PickpocketEditor
          value={npc.pickpocket}
          onChange={(v) => onChange({ ...npc, pickpocket: v })}
          onRemove={() => opt('pickpocket', undefined)}
        />
      ) : (
        <button
          className="small"
          onClick={() => onChange({ ...npc, pickpocket: { level: 1, xp: 8, loot: [{ item: 'coins', qty: [1, 3] }], stunDmg: 1 } })}
        >
          + enable pickpocketing
        </button>
      )}

      {/* id is forced to keep the record key and def id in sync */}
      <RawJson value={npc} onApply={(parsed) => onChange({ ...parsed, id: npc.id })} label="Raw JSON (this NPC)" />
    </div>
  );
}

function DropsEditor({ value, onChange }: { value: Drop[]; onChange: (v: Drop[]) => void }) {
  const set = (i: number, patch: Partial<Drop>) =>
    onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {value.length > 0 && (
        <div className="row dim" style={{ gap: 6, fontSize: 11 }}>
          <span style={{ width: 170 }}>item</span>
          <span style={{ width: 60 }}>qty min</span>
          <span style={{ width: 60 }}>qty max</span>
          <span style={{ width: 80 }}>chance 0..1</span>
        </div>
      )}
      {value.map((d, i) => (
        <div key={i} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
          <IdInput value={d.item} onChange={(v) => set(i, { item: v })} listId="dl-items-npcs" width={170} placeholder="item id" />
          <input type="number" min={0} value={d.qty[0]} aria-label="qty min" style={{ width: 60 }}
            onChange={(e) => set(i, { qty: [Number(e.target.value) || 0, d.qty[1]] as [number, number] })} />
          <input type="number" min={0} value={d.qty[1]} aria-label="qty max" style={{ width: 60 }}
            onChange={(e) => set(i, { qty: [d.qty[0], Number(e.target.value) || 0] as [number, number] })} />
          <input type="number" min={0} max={1} step={0.01} value={d.chance} aria-label="chance" style={{ width: 80 }}
            onChange={(e) => set(i, { chance: Number(e.target.value) })} />
          <button className="small" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove drop">✕</button>
        </div>
      ))}
      <div>
        <button className="small" onClick={() => onChange([...value, { item: '', qty: [1, 1], chance: 1 }])}>+ add drop</button>
      </div>
    </div>
  );
}

function PickpocketEditor({ value, onChange, onRemove }: {
  value: Pickpocket;
  onChange: (v: Pickpocket) => void;
  onRemove: () => void;
}) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 6, padding: 12 }}>
      <div className="row">
        <NumField label="Level req" value={value.level} min={1} max={99} step={1} width={90} onChange={(v) => onChange({ ...value, level: v ?? 1 })} />
        <NumField label="XP" value={value.xp} min={0} width={90} onChange={(v) => onChange({ ...value, xp: v ?? 0 })} />
        <NumField label="Stun damage" value={value.stunDmg} min={0} step={1} width={100} onChange={(v) => onChange({ ...value, stunDmg: v ?? 0 })} />
      </div>
      <label>Loot</label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
        {value.loot.map((l, i) => (
          <div key={i} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
            <IdInput value={l.item} listId="dl-items-npcs" width={170} placeholder="item id"
              onChange={(v) => onChange({ ...value, loot: value.loot.map((x, j) => (j === i ? { ...x, item: v } : x)) })} />
            <input type="number" min={0} value={l.qty[0]} aria-label="qty min" style={{ width: 60 }}
              onChange={(e) => onChange({ ...value, loot: value.loot.map((x, j) => (j === i ? { ...x, qty: [Number(e.target.value) || 0, x.qty[1]] as [number, number] } : x)) })} />
            <input type="number" min={0} value={l.qty[1]} aria-label="qty max" style={{ width: 60 }}
              onChange={(e) => onChange({ ...value, loot: value.loot.map((x, j) => (j === i ? { ...x, qty: [x.qty[0], Number(e.target.value) || 0] as [number, number] } : x)) })} />
            <button className="small" aria-label="Remove loot row"
              onClick={() => onChange({ ...value, loot: value.loot.filter((_, j) => j !== i) })}>✕</button>
          </div>
        ))}
        <div className="row">
          <button className="small" onClick={() => onChange({ ...value, loot: [...value.loot, { item: '', qty: [1, 1] }] })}>+ add loot</button>
          <button className="small danger" onClick={onRemove}>Remove pickpocketing</button>
        </div>
      </div>
    </div>
  );
}
