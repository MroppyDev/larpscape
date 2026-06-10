// Recipes editor: one tab per recipe family, driven by a column spec so each
// family gets a consistent add/remove/edit table with item-id autocomplete.
import { useState } from 'react';
import {
  Datalist, IdInput, ItemQtyList, LoadGuard, RawJson, SaveBar, Tabs,
  useContentFile, useItemIds,
} from './common';
import type { ItemQty } from './common';
import type { RecipesFile } from './types';

type Family = keyof RecipesFile;

interface Col {
  key: string;
  label: string;
  kind: 'item' | 'int' | 'num' | 'text' | 'itemqty' | 'station';
  optional?: boolean;
  min?: number;
  max?: number;
  width?: number;
}

interface FamilySpec {
  key: Family;
  label: string;
  cols: Col[];
  blank: () => any;
}

const FAMILIES: FamilySpec[] = [
  {
    key: 'cookables', label: 'Cooking',
    cols: [
      { key: 'raw', label: 'Raw item', kind: 'item' },
      { key: 'cooked', label: 'Cooked item', kind: 'item' },
      { key: 'burnt', label: 'Burnt item', kind: 'item' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
      { key: 'stopBurn', label: 'Stop burn lvl', kind: 'int' },
    ],
    blank: () => ({ raw: '', cooked: '', burnt: 'burnt_fish', level: 1, xp: 30, stopBurn: 34 }),
  },
  {
    key: 'smeltables', label: 'Smelting',
    cols: [
      { key: 'bar', label: 'Bar', kind: 'item' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
      { key: 'inputs', label: 'Inputs', kind: 'itemqty' },
      { key: 'successChance', label: 'Success 0..1', kind: 'num', optional: true, min: 0, max: 1 },
    ],
    blank: () => ({ bar: '', level: 1, xp: 6, inputs: [] }),
  },
  {
    key: 'smithables', label: 'Smithing',
    cols: [
      { key: 'output', label: 'Output', kind: 'item' },
      { key: 'outputQty', label: 'Out qty', kind: 'int', optional: true, min: 1, width: 70 },
      { key: 'bar', label: 'Bar', kind: 'item' },
      { key: 'bars', label: 'Bars', kind: 'int', min: 1, width: 60 },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
    ],
    blank: () => ({ output: '', bar: 'bronze_bar', bars: 1, level: 1, xp: 12 }),
  },
  {
    key: 'fletchables', label: 'Fletching',
    cols: [
      { key: 'output', label: 'Output', kind: 'item' },
      { key: 'outputQty', label: 'Out qty', kind: 'int', optional: true, min: 1, width: 70 },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
      { key: 'inputs', label: 'Inputs', kind: 'itemqty' },
    ],
    blank: () => ({ output: '', level: 1, xp: 5, inputs: [] }),
  },
  {
    key: 'craftables', label: 'Crafting',
    cols: [
      { key: 'output', label: 'Output', kind: 'item' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
      { key: 'inputs', label: 'Inputs', kind: 'itemqty' },
      { key: 'station', label: 'Station', kind: 'station' },
    ],
    blank: () => ({ output: '', level: 1, xp: 10, inputs: [] }),
  },
  {
    key: 'gemCuts', label: 'Gem cutting',
    cols: [
      { key: 'uncut', label: 'Uncut gem', kind: 'item' },
      { key: 'cut', label: 'Cut gem', kind: 'item' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
    ],
    blank: () => ({ uncut: '', cut: '', level: 1, xp: 25 }),
  },
  {
    key: 'herbs', label: 'Herb cleaning',
    cols: [
      { key: 'grimy', label: 'Grimy herb', kind: 'item' },
      { key: 'clean', label: 'Clean herb', kind: 'item' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
    ],
    blank: () => ({ grimy: '', clean: '', level: 1, xp: 2.5 }),
  },
  {
    key: 'potions', label: 'Potions',
    cols: [
      { key: 'output', label: 'Potion', kind: 'item' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
      { key: 'herb', label: 'Herb', kind: 'item' },
      { key: 'secondary', label: 'Secondary', kind: 'item' },
    ],
    blank: () => ({ output: '', level: 1, xp: 25, herb: '', secondary: '' }),
  },
  {
    key: 'seeds', label: 'Farming',
    cols: [
      { key: 'seed', label: 'Seed', kind: 'item' },
      { key: 'produce', label: 'Produce', kind: 'item' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'plantXp', label: 'Plant XP', kind: 'num', min: 0 },
      { key: 'harvestXp', label: 'Harvest XP', kind: 'num', min: 0 },
      { key: 'growTicks', label: 'Grow ticks', kind: 'int', min: 1 },
    ],
    blank: () => ({ seed: '', produce: '', level: 1, plantXp: 10, harvestXp: 10, growTicks: 100 }),
  },
  {
    key: 'constructionBuilds', label: 'Construction',
    cols: [
      { key: 'name', label: 'Build name', kind: 'text' },
      { key: 'level', label: 'Level', kind: 'int', min: 1, max: 99 },
      { key: 'xp', label: 'XP', kind: 'num', min: 0 },
      { key: 'planks', label: 'Planks', kind: 'int', min: 1 },
      { key: 'nails', label: 'Nails', kind: 'int', min: 0 },
    ],
    blank: () => ({ name: '', level: 1, xp: 30, planks: 1, nails: 0 }),
  },
];

export default function RecipesEditor() {
  const file = useContentFile<RecipesFile>('recipes.json');
  const itemIds = useItemIds();
  const [tab, setTab] = useState<Family>('cookables');
  const spec = FAMILIES.find((f) => f.key === tab)!;

  return (
    <div>
      <SaveBar file={file} title="Recipes" />
      <Datalist id="dl-items-recipes" options={itemIds} />
      <LoadGuard file={file}>
        {() => (
          <>
            <Tabs
              tabs={FAMILIES.map((f) => ({ key: f.key, label: f.label, badge: (file.data![f.key] as any[]).length }))}
              active={tab}
              onSelect={(k) => setTab(k as Family)}
            />
            <FamilyTable
              key={spec.key}
              spec={spec}
              rows={file.data![spec.key] as any[]}
              onChange={(rows) => file.update((prev) => ({ ...prev, [spec.key]: rows }))}
            />
          </>
        )}
      </LoadGuard>
    </div>
  );
}

function FamilyTable({ spec, rows, onChange }: {
  spec: FamilySpec;
  rows: any[];
  onChange: (rows: any[]) => void;
}) {
  const setCell = (i: number, key: string, v: unknown, optional?: boolean) => {
    onChange(rows.map((r, j) => {
      if (j !== i) return r;
      const copy = { ...r };
      if (optional && (v === undefined || v === '' || (typeof v === 'number' && Number.isNaN(v)))) delete copy[key];
      else copy[key] = v;
      return copy;
    }));
  };

  return (
    <div className="card">
      <div style={{ maxHeight: '66vh', overflow: 'auto' }}>
        <table className="data">
          <thead>
            <tr>
              {spec.cols.map((c) => <th key={c.key}>{c.label}{c.optional ? <span className="dim"> (opt)</span> : ''}</th>)}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                {spec.cols.map((c) => (
                  <td key={c.key} style={{ verticalAlign: 'top' }}>
                    <Cell col={c} value={r[c.key]} onChange={(v) => setCell(i, c.key, v, c.optional)} />
                  </td>
                ))}
                <td>
                  <button className="small" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove recipe">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="dim" style={{ padding: 12 }}>No entries.</div>}
      </div>
      <button className="small" style={{ marginTop: 10 }} onClick={() => onChange([...rows, spec.blank()])}>
        + add {spec.label.toLowerCase()} recipe
      </button>
      <RawJson value={rows} onApply={(parsed) => { if (Array.isArray(parsed)) onChange(parsed); }} label={`Raw JSON (${spec.label})`} />
    </div>
  );
}

function Cell({ col, value, onChange }: { col: Col; value: any; onChange: (v: any) => void }) {
  switch (col.kind) {
    case 'item':
      return <IdInput value={value ?? ''} listId="dl-items-recipes" width={col.width ?? 160} placeholder="item id" onChange={onChange} />;
    case 'text':
      return <input value={value ?? ''} onChange={(e) => onChange(e.target.value)} style={{ width: col.width ?? 180 }} aria-label={col.label} />;
    case 'int':
    case 'num':
      return (
        <input
          type="number"
          value={value ?? ''}
          min={col.min}
          max={col.max}
          step={col.kind === 'int' ? 1 : 'any'}
          aria-label={col.label}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          style={{ width: col.width ?? 80 }}
        />
      );
    case 'itemqty':
      return <ItemQtyList value={(value ?? []) as ItemQty[]} onChange={onChange} listId="dl-items-recipes" compact />;
    case 'station':
      return (
        <select
          value={value ?? ''}
          aria-label={col.label}
          onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value)}
        >
          <option value="">(none)</option>
          <option value="spinning_wheel">spinning_wheel</option>
        </select>
      );
  }
}
