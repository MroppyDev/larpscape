// Items catalog editor: searchable/sortable table + full ItemDef form.
import { useCallback, useMemo, useState } from 'react';
import { EQUIP_SLOTS, SKILL_NAMES } from '../../../../shared/schema';
import {
  CheckField, ConfirmDeleteButton, Field, LoadGuard, NewIdModal, NumField,
  RawJson, SaveBar, SelectField, SortHeader, TextField, useContentFile,
  useSearch, withOpt,
} from './common';
import { ItemIcon } from './ItemIcon';
import type { ItemDef, ItemsFile } from './types';

type SortField = 'id' | 'name' | 'value' | 'slot' | 'stackable';

export default function ItemsEditor() {
  const file = useContentFile<ItemsFile>('items.json');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<{ field: SortField; asc: boolean }>({ field: 'id', asc: true });
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = useMemo(() => Object.values(file.data ?? {}), [file.data]);
  const searchKeys = useCallback((it: ItemDef) => [it.id, it.name, it.examine], []);
  const filtered = useSearch(rows, query, searchKeys);

  const sorted = useMemo(() => {
    const dir = sort.asc ? 1 : -1;
    const key = (it: ItemDef): string | number | boolean => {
      switch (sort.field) {
        case 'name': return it.name.toLowerCase();
        case 'value': return it.value;
        case 'slot': return it.equipSlot ?? '';
        case 'stackable': return !!it.stackable;
        default: return it.id;
      }
    };
    return [...filtered].sort((a, b) => {
      const ka = key(a), kb = key(b);
      return ka < kb ? -dir : ka > kb ? dir : 0;
    });
  }, [filtered, sort]);

  const onSort = (f: string) =>
    setSort((s) => (s.field === f ? { ...s, asc: !s.asc } : { field: f as SortField, asc: true }));

  const setItem = (id: string, it: ItemDef) =>
    file.update((prev) => ({ ...prev, [id]: it }));

  const createItem = (id: string) => {
    file.update((prev) => ({
      ...prev,
      [id]: {
        id,
        name: id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()),
        examine: 'A mysterious new item.',
        value: 1,
      },
    }));
    setCreating(false);
    setSelected(id);
  };

  const deleteItem = (id: string) => {
    file.update((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
    setSelected(null);
  };

  const selectedItem = selected && file.data ? file.data[selected] : undefined;

  return (
    <div>
      <SaveBar file={file} title="Items" />
      <LoadGuard file={file}>
        {() => (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className="card" style={{ flex: '1 1 480px', minWidth: 420 }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <input
                  placeholder="Search id / name / examine…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={{ flex: 1 }}
                />
                <button className="primary" onClick={() => setCreating(true)}>New item</button>
              </div>
              <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                <table className="data">
                  <thead>
                    <tr>
                      <th style={{ width: 34 }} />
                      <SortHeader label="ID" field="id" sort={sort} onSort={onSort} />
                      <SortHeader label="Name" field="name" sort={sort} onSort={onSort} />
                      <SortHeader label="Value" field="value" sort={sort} onSort={onSort} />
                      <SortHeader label="Slot" field="slot" sort={sort} onSort={onSort} />
                      <SortHeader label="Stack" field="stackable" sort={sort} onSort={onSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map((it) => (
                      <tr
                        key={it.id}
                        onClick={() => setSelected(it.id)}
                        style={{ cursor: 'pointer', background: selected === it.id ? 'var(--bg-3)' : undefined }}
                      >
                        <td><ItemIcon id={it.id} size={24} /></td>
                        <td className="mono">{it.id}</td>
                        <td>{it.name}</td>
                        <td>{it.value}</td>
                        <td>{it.equipSlot ? <span className="tag">{it.equipSlot}</span> : <span className="dim">—</span>}</td>
                        <td>{it.stackable ? <span className="tag good">yes</span> : <span className="dim">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {sorted.length === 0 && <div className="dim" style={{ padding: 12 }}>No items match.</div>}
              </div>
              <div className="dim" style={{ marginTop: 8, fontSize: 12 }}>{sorted.length} / {rows.length} items</div>
            </div>

            <div style={{ flex: '1 1 420px', minWidth: 380 }}>
              {selectedItem ? (
                <ItemForm
                  key={selectedItem.id}
                  item={selectedItem}
                  onChange={(it) => setItem(selectedItem.id, it)}
                  onDelete={() => deleteItem(selectedItem.id)}
                />
              ) : (
                <div className="card dim">Select an item to edit, or create a new one.</div>
              )}
            </div>
          </div>
        )}
      </LoadGuard>
      {creating && (
        <NewIdModal
          title="New item"
          existing={Object.keys(file.data ?? {})}
          onCreate={createItem}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  );
}

function ItemForm({ item, onChange, onDelete }: {
  item: ItemDef;
  onChange: (it: ItemDef) => void;
  onDelete: () => void;
}) {
  const opt = (key: keyof ItemDef, v: unknown) => onChange(withOpt(item, key, v));

  return (
    <div className="card">
      <div className="row" style={{ marginBottom: 12 }}>
        <ItemIcon id={item.id} size={32} />
        <h2 style={{ margin: 0, flex: 1 }}>
          {item.name} <span className="mono dim">({item.id})</span>
        </h2>
        <ConfirmDeleteButton onDelete={onDelete} small />
      </div>

      <TextField label="Name" value={item.name} onChange={(v) => onChange({ ...item, name: v })} />
      <TextField label="Examine" value={item.examine} onChange={(v) => onChange({ ...item, examine: v })} textarea />

      <div className="row">
        <NumField label="Value (gp)" value={item.value} min={0} step={1} onChange={(v) => onChange({ ...item, value: v ?? 0 })} />
        <SelectField
          label="Equip slot"
          value={item.equipSlot ?? ''}
          onChange={(v) => opt('equipSlot', v || undefined)}
          options={EQUIP_SLOTS}
          emptyLabel="(none)"
        />
        <div className="field" style={{ alignSelf: 'flex-end', paddingBottom: 8 }}>
          <CheckField label="Stackable" checked={!!item.stackable} onChange={(v) => opt('stackable', v || undefined)} />
        </div>
      </div>

      <h2>Combat</h2>
      <div className="row">
        <NumField label="Att bonus" value={item.attBonus} step={1} width={90} onChange={(v) => opt('attBonus', v)} />
        <NumField label="Str bonus" value={item.strBonus} step={1} width={90} onChange={(v) => opt('strBonus', v)} />
        <NumField label="Def bonus" value={item.defBonus} step={1} width={90} onChange={(v) => opt('defBonus', v)} />
        <NumField label="Ranged bonus" value={item.rangedBonus} step={1} width={100} onChange={(v) => opt('rangedBonus', v)} />
        <NumField label="Gun bonus" value={item.gunBonus} step={1} width={100} onChange={(v) => opt('gunBonus', v)} />
        <NumField label="Attack speed" value={item.attackSpeed} min={1} step={1} width={100} onChange={(v) => opt('attackSpeed', v)} />
      </div>

      <h2>Level requirements</h2>
      <LevelReqEditor
        value={item.levelReq ?? []}
        onChange={(v) => opt('levelReq', v.length ? v : undefined)}
      />

      <h2>Special</h2>
      <div className="row">
        <NumField
          label="Edible: heals"
          value={item.edible?.heals}
          min={0}
          width={110}
          onChange={(v) => opt('edible', v !== undefined && v > 0 ? { heals: v } : undefined)}
        />
        <NumField label="Bury XP" value={item.buryXp} min={0} width={100} onChange={(v) => opt('buryXp', v)} />
        <NumField label="Restores prayer" value={item.restoresPrayer} min={0} width={120} onChange={(v) => opt('restoresPrayer', v)} />
      </div>

      {/* id is forced to keep the record key and def id in sync */}
      <RawJson value={item} onApply={(parsed) => onChange({ ...parsed, id: item.id })} label="Raw JSON (this item)" />
    </div>
  );
}

function LevelReqEditor({ value, onChange }: {
  value: { skill: typeof SKILL_NAMES[number]; level: number }[];
  onChange: (v: { skill: typeof SKILL_NAMES[number]; level: number }[]) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {value.map((r, i) => (
        <div key={i} className="row" style={{ gap: 6 }}>
          <select
            value={r.skill}
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, skill: e.target.value as typeof SKILL_NAMES[number] } : x)))}
          >
            {SKILL_NAMES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <input
            type="number"
            min={1}
            max={99}
            value={r.level}
            aria-label="level"
            onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, level: Number(e.target.value) || 1 } : x)))}
            style={{ width: 64 }}
          />
          <button className="small" onClick={() => onChange(value.filter((_, j) => j !== i))} aria-label="Remove requirement">✕</button>
        </div>
      ))}
      <div>
        <button className="small" onClick={() => onChange([...value, { skill: 'Attack', level: 1 }])}>+ add requirement</button>
      </div>
    </div>
  );
}
