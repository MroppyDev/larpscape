// Shops editor: shop list with per-shop name + stock table (item autocomplete,
// qty, add/remove and reorder rows).
import { useMemo, useState } from 'react';
import {
  ConfirmDeleteButton, Datalist, IdInput, LoadGuard, NewIdModal, RawJson,
  SaveBar, TextField, useContentFile, useItemIds,
} from './common';
import type { ShopsFile } from './types';

type Shop = ShopsFile[string];

export default function ShopsEditor() {
  const file = useContentFile<ShopsFile>('shops.json');
  const itemIds = useItemIds();
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const ids = useMemo(() => Object.keys(file.data ?? {}).sort(), [file.data]);
  const sel = selected && file.data ? file.data[selected] : undefined;

  const setShop = (id: string, shop: Shop) => file.update((prev) => ({ ...prev, [id]: shop }));

  const createShop = (id: string) => {
    file.update((prev) => ({
      ...prev,
      [id]: { name: id.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()), stock: [] },
    }));
    setCreating(false);
    setSelected(id);
  };

  return (
    <div>
      <SaveBar file={file} title="Shops" />
      <Datalist id="dl-items-shops" options={itemIds} />
      <LoadGuard file={file}>
        {() => (
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div className="card" style={{ flex: '0 0 280px' }}>
              <div className="row" style={{ marginBottom: 12 }}>
                <h2 style={{ margin: 0, flex: 1 }}>Shops</h2>
                <button className="primary small" onClick={() => setCreating(true)}>New shop</button>
              </div>
              <table className="data">
                <thead><tr><th>ID</th><th>Name</th><th>Stock</th></tr></thead>
                <tbody>
                  {ids.map((id) => (
                    <tr key={id} onClick={() => setSelected(id)}
                      style={{ cursor: 'pointer', background: selected === id ? 'var(--bg-3)' : undefined }}>
                      <td className="mono">{id}</td>
                      <td>{file.data![id].name}</td>
                      <td>{file.data![id].stock.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ flex: '1 1 460px', minWidth: 420 }}>
              {sel && selected ? (
                <div className="card" key={selected}>
                  <div className="row" style={{ marginBottom: 12 }}>
                    <h2 style={{ margin: 0, flex: 1 }}>{sel.name} <span className="mono dim">({selected})</span></h2>
                    <ConfirmDeleteButton small label="Delete shop" onDelete={() => {
                      file.update((prev) => { const c = { ...prev }; delete c[selected]; return c; });
                      setSelected(null);
                    }} />
                  </div>
                  <TextField label="Shop name" value={sel.name} onChange={(v) => setShop(selected, { ...sel, name: v })} />
                  <h2>Stock</h2>
                  <StockTable
                    stock={sel.stock}
                    onChange={(stock) => setShop(selected, { ...sel, stock })}
                  />
                  <RawJson value={sel} onApply={(parsed) => setShop(selected, parsed)} label="Raw JSON (this shop)" />
                </div>
              ) : (
                <div className="card dim">Select a shop to edit, or create a new one.</div>
              )}
            </div>
          </div>
        )}
      </LoadGuard>
      {creating && (
        <NewIdModal title="New shop" existing={ids} onCreate={createShop} onClose={() => setCreating(false)} />
      )}
    </div>
  );
}

function StockTable({ stock, onChange }: {
  stock: Shop['stock'];
  onChange: (s: Shop['stock']) => void;
}) {
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stock.length) return;
    const copy = [...stock];
    [copy[i], copy[j]] = [copy[j], copy[i]];
    onChange(copy);
  };
  const set = (i: number, patch: Partial<Shop['stock'][number]>) =>
    onChange(stock.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div>
      <table className="data">
        <thead><tr><th style={{ width: 30 }}>#</th><th>Item</th><th>Qty</th><th style={{ width: 130 }} /></tr></thead>
        <tbody>
          {stock.map((r, i) => (
            <tr key={i}>
              <td className="dim">{i + 1}</td>
              <td><IdInput value={r.item} listId="dl-items-shops" width={220} placeholder="item id" onChange={(v) => set(i, { item: v })} /></td>
              <td><input type="number" min={1} value={r.qty} style={{ width: 70 }} aria-label="quantity"
                onChange={(e) => set(i, { qty: Number(e.target.value) || 0 })} /></td>
              <td>
                <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                  <button className="small" disabled={i === 0} onClick={() => move(i, -1)} title="Move up" aria-label="Move up">↑</button>
                  <button className="small" disabled={i === stock.length - 1} onClick={() => move(i, 1)} title="Move down" aria-label="Move down">↓</button>
                  <button className="small" onClick={() => onChange(stock.filter((_, j) => j !== i))} title="Remove" aria-label="Remove row">✕</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className="small" style={{ marginTop: 8 }} onClick={() => onChange([...stock, { item: '', qty: 1 }])}>+ add stock row</button>
    </div>
  );
}
