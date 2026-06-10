// World object editor: object definitions + skill-object data, in two tabs.
import { useMemo, useState } from 'react';
import {
  CheckField, ConfirmDeleteButton, Datalist, IdInput, LoadGuard, NewIdModal,
  RawJson, SaveBar, Tabs, TextField, useContentFile, useItemIds, withOpt,
} from './common';
import type { ObjDef, ObjectsFile, SkillObj } from './types';

export default function ObjectsEditor() {
  const file = useContentFile<ObjectsFile>('objects.json');
  const itemIds = useItemIds();
  const [tab, setTab] = useState<'objs' | 'skillObjs'>('objs');

  return (
    <div>
      <SaveBar file={file} title="Objects" />
      <Datalist id="dl-items-objects" options={itemIds} />
      <LoadGuard file={file}>
        {() => (
          <>
            <Tabs
              tabs={[
                { key: 'objs', label: 'Object defs', badge: Object.keys(file.data!.objs).length },
                { key: 'skillObjs', label: 'Skill objects', badge: Object.keys(file.data!.skillObjs).length },
              ]}
              active={tab}
              onSelect={(k) => setTab(k as 'objs' | 'skillObjs')}
            />
            {tab === 'objs' ? (
              <ObjDefsTab
                objs={file.data!.objs}
                update={(fn) => file.update((prev) => ({ ...prev, objs: fn(prev.objs) }))}
              />
            ) : (
              <SkillObjsTab
                skillObjs={file.data!.skillObjs}
                objIds={Object.keys(file.data!.objs)}
                update={(fn) => file.update((prev) => ({ ...prev, skillObjs: fn(prev.skillObjs) }))}
              />
            )}
          </>
        )}
      </LoadGuard>
    </div>
  );
}

// ---------------------------------------------------------------------------

function ObjDefsTab({ objs, update }: {
  objs: Record<string, ObjDef>;
  update: (fn: (prev: Record<string, ObjDef>) => Record<string, ObjDef>) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');

  const ids = useMemo(() => {
    const q = query.trim().toLowerCase();
    return Object.keys(objs)
      .filter((id) => !q || id.includes(q) || objs[id].name.toLowerCase().includes(q))
      .sort();
  }, [objs, query]);

  const sel = selected ? objs[selected] : undefined;

  const createObj = (id: string) => {
    update((prev) => ({
      ...prev,
      [id]: { id, name: id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), examine: 'A curious object.', blocks: true },
    }));
    setCreating(false);
    setSelected(id);
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div className="card" style={{ flex: '1 1 380px', minWidth: 360 }}>
        <div className="row" style={{ marginBottom: 12 }}>
          <input placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ flex: 1 }} />
          <button className="primary" onClick={() => setCreating(true)}>New object</button>
        </div>
        <div style={{ maxHeight: '66vh', overflow: 'auto' }}>
          <table className="data">
            <thead>
              <tr><th>ID</th><th>Name</th><th>Action</th><th>Blocks</th></tr>
            </thead>
            <tbody>
              {ids.map((id) => (
                <tr key={id} onClick={() => setSelected(id)}
                  style={{ cursor: 'pointer', background: selected === id ? 'var(--bg-3)' : undefined }}>
                  <td className="mono">{id}</td>
                  <td>{objs[id].name}</td>
                  <td>{objs[id].action ?? <span className="dim">—</span>}</td>
                  <td>{objs[id].blocks ? <span className="tag warn">blocks</span> : <span className="dim">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ flex: '1 1 380px', minWidth: 360 }}>
        {sel ? (
          <div className="card" key={sel.id}>
            <div className="row" style={{ marginBottom: 12 }}>
              <h2 style={{ margin: 0, flex: 1 }}>{sel.name} <span className="mono dim">({sel.id})</span></h2>
              <ConfirmDeleteButton small onDelete={() => {
                update((prev) => { const c = { ...prev }; delete c[sel.id]; return c; });
                setSelected(null);
              }} />
            </div>
            <TextField label="Name" value={sel.name} onChange={(v) => update((p) => ({ ...p, [sel.id]: { ...sel, name: v } }))} />
            <TextField label="Examine" value={sel.examine} textarea onChange={(v) => update((p) => ({ ...p, [sel.id]: { ...sel, examine: v } }))} />
            <TextField label="Action (e.g. Chop down, Mine)" value={sel.action ?? ''}
              onChange={(v) => update((p) => ({ ...p, [sel.id]: withOpt(sel, 'action', v || undefined) }))} />
            <CheckField label="Blocks movement" checked={sel.blocks}
              onChange={(v) => update((p) => ({ ...p, [sel.id]: { ...sel, blocks: v } }))} />
            <RawJson value={sel} onApply={(parsed) => update((p) => ({ ...p, [sel.id]: { ...parsed, id: sel.id } }))} label="Raw JSON (this object)" />
          </div>
        ) : (
          <div className="card dim">Select an object to edit.</div>
        )}
      </div>
      {creating && (
        <NewIdModal title="New object" existing={Object.keys(objs)} onCreate={createObj} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function SkillObjsTab({ skillObjs, objIds, update }: {
  skillObjs: Record<string, SkillObj>;
  objIds: string[];
  update: (fn: (prev: Record<string, SkillObj>) => Record<string, SkillObj>) => void;
}) {
  const [adding, setAdding] = useState(false);
  const ids = useMemo(() => Object.keys(skillObjs).sort(), [skillObjs]);
  const available = useMemo(() => objIds.filter((id) => !(id in skillObjs)).sort(), [objIds, skillObjs]);
  const [newId, setNewId] = useState('');

  const set = (id: string, patch: Partial<SkillObj>) =>
    update((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  return (
    <div className="card">
      <div className="dim" style={{ marginBottom: 10, fontSize: 13 }}>
        Gathering data per object: level/xp, the item produced, deplete chance and respawn,
        plus success rates at low (level 1) and high (level 99) skill.
      </div>
      <table className="data">
        <thead>
          <tr>
            <th>Object</th><th>Level</th><th>XP</th><th>Item produced</th>
            <th>Deplete 0..1</th><th>Respawn</th><th>Low rate</th><th>High rate</th><th />
          </tr>
        </thead>
        <tbody>
          {ids.map((id) => {
            const s = skillObjs[id];
            return (
              <tr key={id}>
                <td className="mono">{id}</td>
                <td><input type="number" min={1} max={99} value={s.level} style={{ width: 60 }} aria-label="level"
                  onChange={(e) => set(id, { level: Number(e.target.value) || 1 })} /></td>
                <td><input type="number" min={0} value={s.xp} style={{ width: 70 }} aria-label="xp"
                  onChange={(e) => set(id, { xp: Number(e.target.value) || 0 })} /></td>
                <td><IdInput value={s.item} listId="dl-items-objects" width={160} onChange={(v) => set(id, { item: v })} /></td>
                <td><input type="number" min={0} max={1} step={0.01} value={s.depleteChance} style={{ width: 70 }} aria-label="deplete chance"
                  onChange={(e) => set(id, { depleteChance: Number(e.target.value) })} /></td>
                <td><input type="number" min={0} value={s.respawn} style={{ width: 70 }} aria-label="respawn ticks"
                  onChange={(e) => set(id, { respawn: Number(e.target.value) || 0 })} /></td>
                <td><input type="number" min={0} max={1} step={0.01} value={s.lowRate} style={{ width: 70 }} aria-label="low rate"
                  onChange={(e) => set(id, { lowRate: Number(e.target.value) })} /></td>
                <td><input type="number" min={0} max={1} step={0.01} value={s.highRate} style={{ width: 70 }} aria-label="high rate"
                  onChange={(e) => set(id, { highRate: Number(e.target.value) })} /></td>
                <td>
                  <ConfirmDeleteButton small label="✕" onDelete={() =>
                    update((prev) => { const c = { ...prev }; delete c[id]; return c; })} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 12 }}>
        {adding ? (
          <>
            <select value={newId} onChange={(e) => setNewId(e.target.value)}>
              <option value="">— pick object —</option>
              {available.map((id) => <option key={id} value={id}>{id}</option>)}
            </select>
            <button className="primary small" disabled={!newId} onClick={() => {
              update((prev) => ({ ...prev, [newId]: { level: 1, xp: 10, item: '', depleteChance: 0.1, respawn: 10, lowRate: 0.2, highRate: 0.8 } }));
              setAdding(false);
              setNewId('');
            }}>Add</button>
            <button className="small" onClick={() => { setAdding(false); setNewId(''); }}>Cancel</button>
          </>
        ) : (
          <button className="small" onClick={() => setAdding(true)}>+ add skill object</button>
        )}
      </div>
    </div>
  );
}
