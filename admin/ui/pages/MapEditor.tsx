// Visual map editor for data/map.json + data/spawns.json.
// Layers: terrain (paint/rect/fill), objects, NPC spawns, ground item spawns.
// Tools: brush sizes, rectangle, flood fill, erase, inspect. Pan/zoom, grid,
// collision overlay, minimap, undo/redo, save & git-commit via the admin API.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { content } from '../api';
import {
  TERRAIN, BLOCKING_TERRAIN, NON_BLOCKING_OBJECTS,
  decodeTerrain, encodeTerrain, terrainImage,
} from '../lib/terrain';

interface MapObj { type: string; x: number; y: number; }
interface NpcSpawn { id: string; x: number; y: number; }
interface GroundSpawn { item: string; x: number; y: number; respawnTicks: number; }

type Tool = 'paint' | 'rect' | 'fill' | 'object' | 'npc' | 'ground' | 'erase' | 'inspect';
type Layer = 'terrain' | 'objects' | 'npcs' | 'ground';

interface Snapshot {
  terrain: Uint8Array;
  objects: MapObj[];
  npcSpawns: NpcSpawn[];
  groundSpawns: GroundSpawn[];
}

function objColor(type: string): string {
  if (/rocks|stalagmite|boulder/.test(type)) return '#a8a8a8';
  if (/tree|oak|willow|maple|yew|magic_tree|stump|bush|fern|pine|cactus/.test(type)) return '#2e6b2e';
  if (/fishing|lobster|harpoon|lilypad|reeds|driftwood/.test(type)) return '#4ea0d0';
  if (/altar|booth|range|furnace|anvil|spinning|workbench|stall|fountain/.test(type)) return '#e0a84e';
  if (/agility|ledge|rope|climb|slope|snare/.test(type)) return '#c060c0';
  if (/fire/.test(type)) return '#e06030';
  return '#d0d0d0';
}

export default function MapEditor() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [size, setSize] = useState({ w: 224, h: 224 });
  const terrainRef = useRef<Uint8Array>(new Uint8Array(0));
  const objectsRef = useRef<MapObj[]>([]);
  const npcSpawnsRef = useRef<NpcSpawn[]>([]);
  const groundSpawnsRef = useRef<GroundSpawn[]>([]);
  const [objDefs, setObjDefs] = useState<string[]>([]);
  const [npcIds, setNpcIds] = useState<string[]>([]);
  const [itemIds, setItemIds] = useState<string[]>([]);

  const [tool, setTool] = useState<Tool>('paint');
  const [terrainCode, setTerrainCode] = useState(0);
  const [brush, setBrush] = useState(1);
  const [objType, setObjType] = useState('tree');
  const [npcId, setNpcId] = useState('goblin');
  const [groundItem, setGroundItem] = useState('egg');
  const [respawnTicks, setRespawnTicks] = useState(50);
  const [layers, setLayers] = useState<Record<Layer, boolean>>({ terrain: true, objects: true, npcs: true, ground: true });
  const [showGrid, setShowGrid] = useState(false);
  const [showCollision, setShowCollision] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [saveResult, setSaveResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null);
  const [, setRenderTick] = useState(0);

  // view transform (canvas px per tile + offset in canvas px)
  const viewRef = useRef({ scale: 4, ox: 0, oy: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ mode: 'paint' | 'pan' | 'rect' | null; startX: number; startY: number; lastTile?: { x: number; y: number }; rectStart?: { x: number; y: number }; rectEnd?: { x: number; y: number } }>({ mode: null, startX: 0, startY: 0 });

  const undoStack = useRef<Snapshot[]>([]);
  const redoStack = useRef<Snapshot[]>([]);

  const objIndex = useMemo(() => {
    // recompute lazily on each render tick via ref contents
    const m = new Map<number, MapObj>();
    for (const o of objectsRef.current) m.set(o.y * size.w + o.x, o);
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size, dirty, loaded, hover === null]);

  const snapshot = (): Snapshot => ({
    terrain: new Uint8Array(terrainRef.current),
    objects: objectsRef.current.map((o) => ({ ...o })),
    npcSpawns: npcSpawnsRef.current.map((s) => ({ ...s })),
    groundSpawns: groundSpawnsRef.current.map((s) => ({ ...s })),
  });

  const pushUndo = () => {
    undoStack.current.push(snapshot());
    if (undoStack.current.length > 60) undoStack.current.shift();
    redoStack.current = [];
  };

  const restore = (s: Snapshot) => {
    terrainRef.current = new Uint8Array(s.terrain);
    objectsRef.current = s.objects.map((o) => ({ ...o }));
    npcSpawnsRef.current = s.npcSpawns.map((x) => ({ ...x }));
    groundSpawnsRef.current = s.groundSpawns.map((x) => ({ ...x }));
    setDirty(true);
    requestRender();
  };

  const undo = useCallback(() => {
    const s = undoStack.current.pop();
    if (!s) return;
    redoStack.current.push(snapshot());
    restore(s);
  }, []);
  const redo = useCallback(() => {
    const s = redoStack.current.pop();
    if (!s) return;
    undoStack.current.push(snapshot());
    restore(s);
  }, []);

  // ------------------------------------------------------------------ load
  useEffect(() => {
    (async () => {
      try {
        const [map, spawns, objects, npcs, items] = await Promise.all([
          content.load('map.json'),
          content.load('spawns.json'),
          content.load('objects.json'),
          content.load('npcs.json'),
          content.load('items.json'),
        ]);
        setSize({ w: map.width, h: map.height });
        terrainRef.current = decodeTerrain(map.terrain);
        objectsRef.current = map.objects;
        npcSpawnsRef.current = spawns.npcSpawns;
        groundSpawnsRef.current = spawns.groundSpawns;
        setObjDefs(Object.keys(objects.objs).sort());
        setNpcIds(Object.keys(npcs).sort());
        setItemIds(Object.keys(items).sort());
        setLoaded(true);
      } catch (e: any) {
        setError(e.message);
      }
    })();
  }, []);

  // ------------------------------------------------------------------ render
  const baseCanvas = useRef<HTMLCanvasElement | null>(null);
  const baseDirty = useRef(true);

  const renderBase = useCallback(() => {
    if (!baseCanvas.current) {
      baseCanvas.current = document.createElement('canvas');
    }
    const c = baseCanvas.current;
    c.width = size.w; c.height = size.h;
    const ctx = c.getContext('2d')!;
    ctx.putImageData(terrainImage(terrainRef.current, size.w, size.h), 0, 0);
    baseDirty.current = false;
  }, [size]);

  const requestRender = useCallback(() => {
    baseDirty.current = true;
    setRenderTick((t) => t + 1);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement!;
    canvas.width = parent.clientWidth;
    canvas.height = Math.max(420, window.innerHeight - 290);
    if (baseDirty.current) renderBase();

    const ctx = canvas.getContext('2d')!;
    const { scale, ox, oy } = viewRef.current;
    ctx.fillStyle = '#0e1014';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    if (layers.terrain) {
      ctx.drawImage(baseCanvas.current!, ox, oy, size.w * scale, size.h * scale);
    }

    const tileToPx = (x: number, y: number) => [ox + x * scale, oy + y * scale] as const;

    if (layers.objects) {
      for (const o of objectsRef.current) {
        const [px, py] = tileToPx(o.x, o.y);
        if (px < -scale || py < -scale || px > canvas.width || py > canvas.height) continue;
        ctx.fillStyle = objColor(o.type);
        ctx.fillRect(px + scale * 0.2, py + scale * 0.2, scale * 0.6, scale * 0.6);
      }
    }
    if (layers.npcs) {
      for (const s of npcSpawnsRef.current) {
        const [px, py] = tileToPx(s.x, s.y);
        ctx.fillStyle = '#ff5a5a';
        ctx.beginPath();
        ctx.arc(px + scale / 2, py + scale / 2, Math.max(2, scale * 0.35), 0, Math.PI * 2);
        ctx.fill();
        if (scale >= 8) {
          ctx.fillStyle = '#fff';
          ctx.font = '10px sans-serif';
          ctx.fillText(s.id, px + scale + 2, py + scale * 0.7);
        }
      }
    }
    if (layers.ground) {
      for (const s of groundSpawnsRef.current) {
        const [px, py] = tileToPx(s.x, s.y);
        ctx.strokeStyle = '#ffd84e';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px + scale * 0.15, py + scale * 0.15, scale * 0.7, scale * 0.7);
        if (scale >= 8) {
          ctx.fillStyle = '#ffd84e';
          ctx.font = '10px sans-serif';
          ctx.fillText(s.item, px + scale + 2, py + scale * 0.7);
        }
      }
    }
    if (showCollision) {
      ctx.fillStyle = 'rgba(224,90,78,0.4)';
      const x0 = Math.max(0, Math.floor(-ox / scale));
      const y0 = Math.max(0, Math.floor(-oy / scale));
      const x1 = Math.min(size.w - 1, Math.ceil((canvas.width - ox) / scale));
      const y1 = Math.min(size.h - 1, Math.ceil((canvas.height - oy) / scale));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = terrainRef.current[y * size.w + x];
          const o = objIndex.get(y * size.w + x);
          const blockedTile = BLOCKING_TERRAIN.has(t) || (o ? !NON_BLOCKING_OBJECTS.has(o.type) : false);
          if (blockedTile) {
            const [px, py] = tileToPx(x, y);
            ctx.fillRect(px, py, scale, scale);
          }
        }
      }
    }
    if (showGrid && scale >= 6) {
      ctx.strokeStyle = 'rgba(255,255,255,0.07)';
      ctx.lineWidth = 1;
      const x0 = Math.max(0, Math.floor(-ox / scale));
      const y0 = Math.max(0, Math.floor(-oy / scale));
      const x1 = Math.min(size.w, Math.ceil((canvas.width - ox) / scale));
      const y1 = Math.min(size.h, Math.ceil((canvas.height - oy) / scale));
      ctx.beginPath();
      for (let x = x0; x <= x1; x++) { ctx.moveTo(ox + x * scale, oy + y0 * scale); ctx.lineTo(ox + x * scale, oy + y1 * scale); }
      for (let y = y0; y <= y1; y++) { ctx.moveTo(ox + x0 * scale, oy + y * scale); ctx.lineTo(ox + x1 * scale, oy + y * scale); }
      ctx.stroke();
    }
    // rect tool preview
    const d = dragRef.current;
    if (d.mode === 'rect' && d.rectStart && d.rectEnd) {
      const x0 = Math.min(d.rectStart.x, d.rectEnd.x), x1 = Math.max(d.rectStart.x, d.rectEnd.x);
      const y0 = Math.min(d.rectStart.y, d.rectEnd.y), y1 = Math.max(d.rectStart.y, d.rectEnd.y);
      ctx.strokeStyle = '#c8a85a';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox + x0 * scale, oy + y0 * scale, (x1 - x0 + 1) * scale, (y1 - y0 + 1) * scale);
    }
    // hover highlight
    if (hover) {
      const [px, py] = tileToPx(hover.x, hover.y);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 0.5, py + 0.5, scale - 1, scale - 1);
    }

    // minimap
    const mini = miniRef.current;
    if (mini) {
      mini.width = size.w; mini.height = size.h;
      const mctx = mini.getContext('2d')!;
      mctx.drawImage(baseCanvas.current!, 0, 0);
      mctx.strokeStyle = '#fff';
      mctx.lineWidth = 2;
      mctx.strokeRect(-ox / scale, -oy / scale, canvas.width / scale, canvas.height / scale);
    }
  });

  // ------------------------------------------------------------------ edits
  const paintTile = (tx: number, ty: number) => {
    const half = Math.floor(brush / 2);
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const x = tx + dx, y = ty + dy;
        if (x < 0 || y < 0 || x >= size.w || y >= size.h) continue;
        terrainRef.current[y * size.w + x] = terrainCode;
      }
    }
    setDirty(true);
    requestRender();
  };

  const floodFill = (tx: number, ty: number) => {
    const t = terrainRef.current;
    const from = t[ty * size.w + tx];
    if (from === terrainCode) return;
    pushUndo();
    const stack = [ty * size.w + tx];
    let guard = 0;
    while (stack.length && guard++ < size.w * size.h) {
      const k = stack.pop()!;
      if (t[k] !== from) continue;
      t[k] = terrainCode;
      const x = k % size.w, y = Math.floor(k / size.w);
      if (x > 0) stack.push(k - 1);
      if (x < size.w - 1) stack.push(k + 1);
      if (y > 0) stack.push(k - size.w);
      if (y < size.h - 1) stack.push(k + size.w);
    }
    setDirty(true);
    requestRender();
  };

  const placeAt = (tx: number, ty: number) => {
    const k = ty * size.w + tx;
    if (tool === 'object') {
      if (!objectsRef.current.some((o) => o.x === tx && o.y === ty)) {
        objectsRef.current.push({ type: objType, x: tx, y: ty });
      }
    } else if (tool === 'npc') {
      npcSpawnsRef.current.push({ id: npcId, x: tx, y: ty });
    } else if (tool === 'ground') {
      groundSpawnsRef.current.push({ item: groundItem, x: tx, y: ty, respawnTicks });
    } else if (tool === 'erase') {
      objectsRef.current = objectsRef.current.filter((o) => !(o.x === tx && o.y === ty));
      npcSpawnsRef.current = npcSpawnsRef.current.filter((s) => !(s.x === tx && s.y === ty));
      groundSpawnsRef.current = groundSpawnsRef.current.filter((s) => !(s.x === tx && s.y === ty));
    }
    void k;
    setDirty(true);
    requestRender();
  };

  // ------------------------------------------------------------------ mouse
  const tileAt = (e: React.MouseEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const { scale, ox, oy } = viewRef.current;
    const x = Math.floor((e.clientX - r.left - ox) / scale);
    const y = Math.floor((e.clientY - r.top - oy) / scale);
    if (x < 0 || y < 0 || x >= size.w || y >= size.h) return null;
    return { x, y };
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      dragRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY };
      return;
    }
    const t = tileAt(e);
    if (!t) return;
    if (tool === 'paint') {
      pushUndo();
      dragRef.current = { mode: 'paint', startX: e.clientX, startY: e.clientY, lastTile: t };
      paintTile(t.x, t.y);
    } else if (tool === 'rect') {
      dragRef.current = { mode: 'rect', startX: e.clientX, startY: e.clientY, rectStart: t, rectEnd: t };
    } else if (tool === 'fill') {
      floodFill(t.x, t.y);
    } else if (tool === 'inspect') {
      setHover(t);
      requestRender();
    } else {
      pushUndo();
      dragRef.current = { mode: 'paint', startX: e.clientX, startY: e.clientY, lastTile: t };
      placeAt(t.x, t.y);
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    const t = tileAt(e);
    setHover(t);
    if (d.mode === 'pan') {
      viewRef.current.ox += e.clientX - d.startX;
      viewRef.current.oy += e.clientY - d.startY;
      d.startX = e.clientX;
      d.startY = e.clientY;
      requestRender();
    } else if (d.mode === 'paint' && t && (t.x !== d.lastTile?.x || t.y !== d.lastTile?.y)) {
      d.lastTile = t;
      if (tool === 'paint') paintTile(t.x, t.y);
      else if (tool === 'erase') placeAt(t.x, t.y);
      // object/npc/ground tools place once per click, not per drag
    } else if (d.mode === 'rect' && t) {
      d.rectEnd = t;
      requestRender();
    } else {
      requestRender();
    }
  };

  const onMouseUp = () => {
    const d = dragRef.current;
    if (d.mode === 'rect' && d.rectStart && d.rectEnd) {
      pushUndo();
      const x0 = Math.min(d.rectStart.x, d.rectEnd.x), x1 = Math.max(d.rectStart.x, d.rectEnd.x);
      const y0 = Math.min(d.rectStart.y, d.rectEnd.y), y1 = Math.max(d.rectStart.y, d.rectEnd.y);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) terrainRef.current[y * size.w + x] = terrainCode;
      setDirty(true);
    }
    dragRef.current = { mode: null, startX: 0, startY: 0 };
    requestRender();
  };

  const onWheel = (e: React.WheelEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const v = viewRef.current;
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const factor = e.deltaY < 0 ? 1.25 : 0.8;
    const ns = Math.min(28, Math.max(1.5, v.scale * factor));
    v.ox = mx - ((mx - v.ox) / v.scale) * ns;
    v.oy = my - ((my - v.oy) / v.scale) * ns;
    v.scale = ns;
    requestRender();
  };

  const onMiniClick = (e: React.MouseEvent) => {
    const mini = miniRef.current!;
    const r = mini.getBoundingClientRect();
    const tx = ((e.clientX - r.left) / r.width) * size.w;
    const ty = ((e.clientY - r.top) / r.height) * size.h;
    const canvas = canvasRef.current!;
    const v = viewRef.current;
    v.ox = canvas.width / 2 - tx * v.scale;
    v.oy = canvas.height / 2 - ty * v.scale;
    requestRender();
  };

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); }
      else if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ------------------------------------------------------------------ save
  const save = async () => {
    setSaving(true);
    setSaveResult(null);
    try {
      const msg = saveMsg.trim() || undefined;
      await content.save('map.json', {
        width: size.w,
        height: size.h,
        terrain: encodeTerrain(terrainRef.current),
        objects: objectsRef.current,
      }, msg ? `map: ${msg}` : 'map: edit world map');
      await content.save('spawns.json', {
        npcSpawns: npcSpawnsRef.current,
        groundSpawns: groundSpawnsRef.current,
      }, msg ? `spawns: ${msg}` : 'spawns: edit spawn placements');
      setDirty(false);
      setSaveResult({ ok: true, text: 'Saved & committed. Changes go live on next publish.' });
    } catch (e: any) {
      const issues = e.issues ? '\n' + e.issues.join('\n') : '';
      setSaveResult({ ok: false, text: e.message + issues });
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------------------------ UI
  if (error) return <div><h1>Map editor</h1><div className="card error-text">{error}</div></div>;
  if (!loaded) return <div><h1>Map editor</h1><div className="card dim">Loading map…</div></div>;

  const hoverObj = hover ? objectsRef.current.find((o) => o.x === hover.x && o.y === hover.y) : undefined;
  const hoverNpc = hover ? npcSpawnsRef.current.find((s) => s.x === hover.x && s.y === hover.y) : undefined;
  const hoverGround = hover ? groundSpawnsRef.current.find((s) => s.x === hover.x && s.y === hover.y) : undefined;
  const hoverT = hover ? TERRAIN[terrainRef.current[hover.y * size.w + hover.x]] : undefined;

  return (
    <div>
      <h1>Map editor {dirty && <span className="tag warn">unsaved changes</span>}</h1>

      <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          {(['paint', 'rect', 'fill', 'object', 'npc', 'ground', 'erase', 'inspect'] as Tool[]).map((t) => (
            <button key={t} className={tool === t ? 'primary' : ''} onClick={() => setTool(t)}>
              {{ paint: 'Brush', rect: 'Rectangle', fill: 'Fill', object: 'Object', npc: 'NPC spawn', ground: 'Ground item', erase: 'Erase', inspect: 'Inspect' }[t]}
            </button>
          ))}
          <span className="dim" style={{ marginLeft: 8 }}>shift/middle-drag pans · wheel zooms · Ctrl+Z/Y undo/redo</span>
        </div>

        {(tool === 'paint' || tool === 'rect' || tool === 'fill') && (
          <div className="row" style={{ marginBottom: 10 }}>
            {TERRAIN.map((t) => (
              <button
                key={t.code}
                className="small"
                style={{
                  borderColor: terrainCode === t.code ? '#c8a85a' : undefined,
                  borderWidth: terrainCode === t.code ? 2 : 1,
                }}
                onClick={() => setTerrainCode(t.code)}
                title={t.name}
              >
                <span style={{ display: 'inline-block', width: 10, height: 10, background: t.color, marginRight: 5, verticalAlign: 'middle', borderRadius: 2 }} />
                {t.name}
              </button>
            ))}
            {tool === 'paint' && (
              <span style={{ marginLeft: 10 }}>
                Brush:{' '}
                {[1, 3, 5, 9].map((b) => (
                  <button key={b} className={`small ${brush === b ? 'primary' : ''}`} onClick={() => setBrush(b)} style={{ marginLeft: 4 }}>{b}×{b}</button>
                ))}
              </span>
            )}
          </div>
        )}
        {tool === 'object' && (
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ margin: 0 }}>Object type</label>
            <select value={objType} onChange={(e) => setObjType(e.target.value)}>
              {objDefs.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        {tool === 'npc' && (
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ margin: 0 }}>NPC</label>
            <select value={npcId} onChange={(e) => setNpcId(e.target.value)}>
              {npcIds.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        )}
        {tool === 'ground' && (
          <div className="row" style={{ marginBottom: 10 }}>
            <label style={{ margin: 0 }}>Item</label>
            <select value={groundItem} onChange={(e) => setGroundItem(e.target.value)}>
              {itemIds.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <label style={{ margin: 0 }}>Respawn ticks</label>
            <input type="number" min={1} value={respawnTicks} style={{ width: 90 }} onChange={(e) => setRespawnTicks(Math.max(1, Number(e.target.value)))} />
          </div>
        )}

        <div className="row">
          {(['terrain', 'objects', 'npcs', 'ground'] as Layer[]).map((l) => (
            <label key={l} style={{ margin: 0, color: 'var(--text)' }}>
              <input type="checkbox" checked={layers[l]} onChange={(e) => setLayers({ ...layers, [l]: e.target.checked })} /> {l}
            </label>
          ))}
          <label style={{ margin: 0, color: 'var(--text)' }}>
            <input type="checkbox" checked={showCollision} onChange={(e) => { setShowCollision(e.target.checked); requestRender(); }} /> collision
          </label>
          <label style={{ margin: 0, color: 'var(--text)' }}>
            <input type="checkbox" checked={showGrid} onChange={(e) => { setShowGrid(e.target.checked); requestRender(); }} /> grid
          </label>
          <button className="small" onClick={undo}>Undo</button>
          <button className="small" onClick={redo}>Redo</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16 }}>
        <div className="card" style={{ flex: 1, padding: 8 }}>
          <canvas
            ref={canvasRef}
            style={{ width: '100%', display: 'block', cursor: tool === 'inspect' ? 'default' : 'crosshair', imageRendering: 'pixelated' }}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={() => { onMouseUp(); setHover(null); }}
            onWheel={onWheel}
            onContextMenu={(e) => e.preventDefault()}
          />
        </div>
        <div style={{ width: 250, flexShrink: 0 }}>
          <div className="card" style={{ padding: 8 }}>
            <canvas ref={miniRef} style={{ width: '100%', imageRendering: 'pixelated', cursor: 'pointer' }} onClick={onMiniClick} />
          </div>
          <div className="card">
            <div className="stat-label">Tile</div>
            {hover ? (
              <div className="mono" style={{ marginTop: 6 }}>
                ({hover.x}, {hover.y}) — {hoverT?.name}
                {hoverObj && <div>object: {hoverObj.type}</div>}
                {hoverNpc && <div>npc spawn: {hoverNpc.id}</div>}
                {hoverGround && <div>ground: {hoverGround.item} ({hoverGround.respawnTicks}t)</div>}
              </div>
            ) : <div className="dim" style={{ marginTop: 6 }}>hover the map</div>}
          </div>
          <div className="card">
            <div className="stat-label" style={{ marginBottom: 8 }}>Save</div>
            <div className="field">
              <input placeholder="Commit message (optional)" value={saveMsg} onChange={(e) => setSaveMsg(e.target.value)} style={{ width: '100%' }} />
            </div>
            <button className="primary" style={{ width: '100%' }} disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save & commit'}
            </button>
            {saveResult && (
              <div className={saveResult.ok ? 'ok-text' : 'error-text'} style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{saveResult.text}</div>
            )}
            <div className="dim" style={{ marginTop: 8, fontSize: 12 }}>
              {objectsRef.current.length} objects · {npcSpawnsRef.current.length} NPC spawns · {groundSpawnsRef.current.length} ground spawns
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
