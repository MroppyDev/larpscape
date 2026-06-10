// Grand Exchange client — owns the 'ge_booth' Exchange action + modal UI.
// Talks to the server via net.api (see SPEC.md Phase 5 server contract).

import {
  registerObjectAction, registerNpcAction, msg,
  addItem, removeItem, invCount, freeSlots, state,
} from './game';
import { ITEMS } from './defs';
import { itemIcon } from './sprites';
import { net } from './net';

interface GeOffer {
  id: number;
  kind: 'buy' | 'sell';
  item: string;
  qty: number;
  price: number;
  filled: number;
  collectedQty: number;
  coinsOwed: number;
  itemsOwed: number;
  active: boolean;
}

// ---------------- styles ----------------

const STYLE = `
#ge-layer { position: fixed; inset: 0; display: none; z-index: 52; pointer-events: none; }
.ge-modal {
  position: absolute; pointer-events: auto; background: var(--parchment, #d8c9a3);
  background-image: repeating-linear-gradient(0deg, rgba(80,60,30,0.06) 0 1px, transparent 1px 3px);
  border: 5px solid var(--stone-dark, #3a342a); border-radius: 4px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.8);
  width: 460px; padding: 8px; font-size: 11px; color: #3a2a10;
}
.ge-modal h2 { text-align: center; color: #5a2000; font-size: 14px; margin: 0 0 6px 0; }
.ge-close {
  position: absolute; top: 4px; right: 6px; width: 20px; height: 20px;
  background: #8a2020; color: #fff; border: 1px solid #000; border-radius: 2px;
  cursor: pointer; font-weight: bold; text-align: center; line-height: 18px; font-size: 12px;
}
.ge-close:hover { background: #a83030; }
.ge-offers { max-height: 170px; overflow-y: auto; border: 1px solid #8a7a5c; border-radius: 3px; background: rgba(0,0,0,0.05); }
.ge-offer-row { display: flex; align-items: center; gap: 6px; padding: 3px 6px; border-bottom: 1px solid rgba(80,60,30,0.25); }
.ge-offer-row:last-child { border-bottom: none; }
.ge-offer-row canvas { image-rendering: pixelated; width: 24px; height: 24px; flex: 0 0 24px; }
.ge-kind-buy { color: #1a5a1a; font-weight: bold; width: 30px; }
.ge-kind-sell { color: #7a1a1a; font-weight: bold; width: 30px; }
.ge-offer-info { flex: 1; }
.ge-offer-sub { font-size: 9px; color: #6a543a; }
.ge-btn {
  background: linear-gradient(180deg, #7a6a4a, #5a4c32); color: #fff; border: 1px solid #2a2418;
  border-radius: 3px; padding: 2px 8px; cursor: pointer; font-size: 10px; text-shadow: 1px 1px 0 #000;
  font-family: inherit;
}
.ge-btn:hover { background: linear-gradient(180deg, #8a7a5a, #6a5c42); }
.ge-btn:disabled { opacity: 0.5; cursor: default; }
.ge-btn.ge-collect { background: linear-gradient(180deg, #3a7a3a, #2a5a2a); }
.ge-btn.ge-collect:hover { background: linear-gradient(180deg, #4a8a4a, #3a6a3a); }
.ge-btn.ge-abort { background: linear-gradient(180deg, #8a3a3a, #6a2a2a); }
.ge-btn.ge-abort:hover { background: linear-gradient(180deg, #9a4a4a, #7a3a3a); }
.ge-tabs { display: flex; gap: 4px; margin: 8px 0 6px 0; }
.ge-form { border: 1px solid #8a7a5c; border-radius: 3px; padding: 6px; background: rgba(255,255,255,0.12); }
.ge-form label { display: inline-block; width: 70px; font-weight: bold; }
.ge-form input {
  background: #efe6cd; border: 1px solid #8a7a5c; border-radius: 2px; padding: 2px 4px;
  font-family: inherit; font-size: 11px; color: #3a2a10; width: 120px;
}
.ge-row { margin: 4px 0; display: flex; align-items: center; gap: 4px; }
.ge-suggest { position: relative; flex: 1; }
.ge-suggest-list {
  position: absolute; left: 0; right: 0; top: 100%; z-index: 5; max-height: 110px; overflow-y: auto;
  background: #efe6cd; border: 1px solid #5a4c32; box-shadow: 0 3px 8px rgba(0,0,0,0.5);
}
.ge-suggest-item { display: flex; align-items: center; gap: 4px; padding: 2px 4px; cursor: pointer; }
.ge-suggest-item:hover { background: #d8c089; }
.ge-suggest-item canvas { image-rendering: pixelated; width: 20px; height: 20px; }
.ge-picked { display: flex; align-items: center; gap: 6px; margin: 4px 0; min-height: 26px; }
.ge-picked canvas { image-rendering: pixelated; width: 24px; height: 24px; }
.ge-hint { font-size: 9px; color: #6a543a; }
.ge-total { font-weight: bold; color: #5a2000; }
.ge-total.ge-bad { color: #8a2020; }
.ge-inv-strip { display: flex; flex-wrap: wrap; gap: 2px; max-height: 78px; overflow-y: auto; margin: 4px 0; }
.ge-inv-slot {
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  cursor: pointer; border: 1px solid rgba(80,60,30,0.3); border-radius: 3px; position: relative;
}
.ge-inv-slot:hover { background: rgba(255,255,255,0.25); }
.ge-inv-slot.ge-selected { border-color: #5a2000; background: rgba(255,220,120,0.4); }
.ge-inv-slot canvas { image-rendering: pixelated; width: 26px; height: 26px; }
.ge-inv-slot .ge-q { position: absolute; top: 0; left: 1px; font-size: 8px; color: #f5d800; text-shadow: 1px 1px 0 #000; }
.ge-empty { text-align: center; padding: 12px; color: #6a543a; }
`;

// ---------------- modal state ----------------

let layer: HTMLElement | null = null;
let modal: HTMLElement | null = null;
let pollTimer: number | undefined;
let open = false;

let view: 'offers' | 'buy' | 'sell' = 'offers';
let offers: GeOffer[] = [];
let buyItem: string | null = null;
let sellItem: string | null = null;
let lastPrice: number | null = null;
let buyQty = 1, buyPrice = 1, sellQty = 1, sellPrice = 1;
let buyFilter = '';

function ensureDom(): HTMLElement {
  if (layer) return layer;
  const st = document.createElement('style');
  st.textContent = STYLE;
  document.head.appendChild(st);
  layer = document.createElement('div');
  layer.id = 'ge-layer';
  const sibling = document.getElementById('modal-layer');
  if (sibling && sibling.parentElement) sibling.parentElement.insertBefore(layer, sibling.nextSibling);
  else document.body.appendChild(layer);
  return layer;
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function itemName(id: string) { return ITEMS[id]?.name ?? id; }

function icon(id: string): HTMLCanvasElement | null {
  try { return itemIcon(id); } catch { return null; }
}

// ---------------- server helpers ----------------

async function fetchOffers() {
  try {
    const r = await net.api('/api/ge/offers');
    offers = r.offers ?? [];
    if (open) redraw();
  } catch (e: any) {
    msg('The Grand Exchange clerk shuffles papers: ' + (e?.message ?? 'connection trouble') + '.');
  }
}

async function fetchLastPrice(item: string) {
  lastPrice = null;
  try {
    const r = await net.api('/api/ge/price/' + encodeURIComponent(item));
    lastPrice = r.last ?? null;
  } catch { lastPrice = null; }
  if (open) redraw();
}

// ---------------- actions ----------------

async function doCollect(o: GeOffer) {
  const slotsNeeded = (o.itemsOwed > 0 ? 1 : 0) + (o.coinsOwed > 0 && invCount('coins') === 0 ? 1 : 0);
  if (freeSlots() < slotsNeeded) {
    msg("You don't have enough inventory space to collect that.");
    return;
  }
  try {
    const r = await net.api('/api/ge/collect', { id: o.id });
    let got = false;
    for (const it of (r.items ?? []) as { id: string; qty: number }[]) {
      if (it.qty > 0) {
        if (addItem(it.id, it.qty)) got = true;
        else msg('Your pack is too full for the ' + itemName(it.id) + '!');
      }
    }
    if ((r.coins ?? 0) > 0) {
      if (addItem('coins', r.coins)) got = true;
      else msg('Your pack is too full for the coins!');
    }
    if (got) msg('You collect from the Grand Exchange.');
  } catch (e: any) {
    msg('Collection failed: ' + (e?.message ?? 'unknown error') + '.');
  }
  await fetchOffers();
}

async function doAbort(o: GeOffer) {
  try {
    await net.api('/api/ge/abort', { id: o.id });
    msg('Offer aborted. Collect your returned goods from the slot.');
  } catch (e: any) {
    msg('Abort failed: ' + (e?.message ?? 'unknown error') + '.');
  }
  await fetchOffers();
}

async function submitBuy() {
  if (!buyItem) { msg('Choose an item to buy first.'); return; }
  const qty = Math.floor(buyQty), price = Math.floor(buyPrice);
  if (qty < 1 || price < 1) { msg('Quantity and price must be at least 1.'); return; }
  const total = qty * price;
  if (invCount('coins') < total) { msg("You don't have enough coins for that offer."); return; }
  if (!removeItem('coins', total)) { msg("You don't have enough coins for that offer."); return; }
  try {
    await net.api('/api/ge/offer', { kind: 'buy', item: buyItem, qty, price });
    msg('Buy offer placed: ' + qty + ' x ' + itemName(buyItem) + ' at ' + price + ' gp each.');
    buyItem = null; buyFilter = ''; buyQty = 1; buyPrice = 1; lastPrice = null;
    view = 'offers';
  } catch (e: any) {
    addItem('coins', total); // refund — the offer never reached the books
    msg('Offer failed: ' + (e?.message ?? 'unknown error') + '.');
  }
  await fetchOffers();
}

async function submitSell() {
  if (!sellItem) { msg('Choose an item to sell first.'); return; }
  const held = invCount(sellItem);
  const qty = Math.min(Math.floor(sellQty), held);
  const price = Math.floor(sellPrice);
  if (qty < 1 || price < 1) { msg('Quantity and price must be at least 1.'); return; }
  const id = sellItem;
  if (!removeItem(id, qty)) { msg("You don't have that many."); return; }
  try {
    await net.api('/api/ge/offer', { kind: 'sell', item: id, qty, price });
    msg('Sell offer placed: ' + qty + ' x ' + itemName(id) + ' at ' + price + ' gp each.');
    sellItem = null; sellQty = 1; sellPrice = 1; lastPrice = null;
    view = 'offers';
  } catch (e: any) {
    addItem(id, qty); // refund — the offer never reached the books
    msg('Offer failed: ' + (e?.message ?? 'unknown error') + '.');
  }
  await fetchOffers();
}

// ---------------- rendering ----------------

function openModal() {
  const l = ensureDom();
  open = true;
  view = 'offers';
  l.style.display = 'block';
  redraw();
  fetchOffers();
  if (pollTimer === undefined) {
    pollTimer = window.setInterval(() => { if (open) fetchOffers(); }, 5000);
  }
}

function closeModal() {
  open = false;
  if (layer) { layer.style.display = 'none'; layer.innerHTML = ''; }
  modal = null;
  if (pollTimer !== undefined) { clearInterval(pollTimer); pollTimer = undefined; }
}

function shell(): HTMLElement {
  const l = ensureDom();
  l.innerHTML = '';
  modal = document.createElement('div');
  modal.className = 'ge-modal';
  const frame = document.getElementById('frame');
  const left = frame ? frame.getBoundingClientRect().left + 30 : 30;
  const top = frame ? frame.getBoundingClientRect().top + 50 : 50;
  modal.style.left = left + 'px';
  modal.style.top = top + 'px';
  const h = document.createElement('h2');
  h.textContent = 'Grand Exchange';
  modal.appendChild(h);
  const close = document.createElement('div');
  close.className = 'ge-close';
  close.textContent = 'X';
  close.onclick = closeModal;
  modal.appendChild(close);
  l.appendChild(modal);
  return modal;
}

function btn(label: string, cls: string, fn: () => void, disabled?: boolean): HTMLButtonElement {
  const b = document.createElement('button');
  b.className = 'ge-btn' + (cls ? ' ' + cls : '');
  b.textContent = label;
  b.onclick = fn;
  if (disabled) b.disabled = true;
  return b;
}

function redraw() {
  if (!open) return;
  const m = shell();

  const tabs = document.createElement('div');
  tabs.className = 'ge-tabs';
  tabs.appendChild(btn('My Offers', view === 'offers' ? 'ge-collect' : '', () => { view = 'offers'; redraw(); }));
  tabs.appendChild(btn('New Buy Offer', view === 'buy' ? 'ge-collect' : '', () => { view = 'buy'; redraw(); }));
  tabs.appendChild(btn('New Sell Offer', view === 'sell' ? 'ge-collect' : '', () => { view = 'sell'; redraw(); }));
  m.appendChild(tabs);

  if (view === 'offers') drawOffers(m);
  else if (view === 'buy') drawBuyForm(m);
  else drawSellForm(m);
}

function drawOffers(m: HTMLElement) {
  const box = document.createElement('div');
  box.className = 'ge-offers';
  if (offers.length === 0) {
    const e = document.createElement('div');
    e.className = 'ge-empty';
    e.textContent = 'You have no offers on the books.';
    box.appendChild(e);
  }
  for (const o of offers) {
    const row = document.createElement('div');
    row.className = 'ge-offer-row';
    const kind = document.createElement('span');
    kind.className = o.kind === 'buy' ? 'ge-kind-buy' : 'ge-kind-sell';
    kind.textContent = o.kind === 'buy' ? 'BUY' : 'SELL';
    row.appendChild(kind);
    const ic = icon(o.item);
    if (ic) row.appendChild(ic);
    const info = document.createElement('div');
    info.className = 'ge-offer-info';
    info.innerHTML = `<div>${esc(itemName(o.item))}</div>` +
      `<div class="ge-offer-sub">${o.filled}/${o.qty} at ${o.price} gp each` +
      `${o.active ? '' : ' &middot; finished'}</div>`;
    row.appendChild(info);
    if (o.coinsOwed > 0 || o.itemsOwed > 0) {
      const what: string[] = [];
      if (o.itemsOwed > 0) what.push(o.itemsOwed + ' items');
      if (o.coinsOwed > 0) what.push(o.coinsOwed + ' gp');
      row.appendChild(btn('Collect (' + what.join(', ') + ')', 'ge-collect', () => doCollect(o)));
    }
    if (o.active) row.appendChild(btn('Abort', 'ge-abort', () => doAbort(o)));
    box.appendChild(row);
  }
  m.appendChild(box);
  const hint = document.createElement('div');
  hint.className = 'ge-hint';
  hint.style.textAlign = 'center';
  hint.style.marginTop = '4px';
  hint.textContent = 'Offers update every few seconds while the ledger is open.';
  m.appendChild(hint);
}

function drawBuyForm(m: HTMLElement) {
  const form = document.createElement('div');
  form.className = 'ge-form';

  // item picker with suggestions
  const row = document.createElement('div');
  row.className = 'ge-row';
  const lab = document.createElement('label');
  lab.textContent = 'Item:';
  row.appendChild(lab);
  const wrap = document.createElement('div');
  wrap.className = 'ge-suggest';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Type an item name...';
  input.value = buyFilter;
  wrap.appendChild(input);
  const list = document.createElement('div');
  list.className = 'ge-suggest-list';
  list.style.display = 'none';
  wrap.appendChild(list);
  row.appendChild(wrap);
  form.appendChild(row);

  const renderSuggestions = () => {
    const q = input.value.trim().toLowerCase();
    list.innerHTML = '';
    if (q.length < 1) { list.style.display = 'none'; return; }
    const matches = Object.values(ITEMS)
      .filter(d => d.name.toLowerCase().includes(q))
      .slice(0, 8);
    if (matches.length === 0) { list.style.display = 'none'; return; }
    for (const d of matches) {
      const it = document.createElement('div');
      it.className = 'ge-suggest-item';
      const ic = icon(d.id);
      if (ic) it.appendChild(ic);
      const nm = document.createElement('span');
      nm.textContent = d.name;
      it.appendChild(nm);
      it.onclick = () => {
        buyItem = d.id;
        buyFilter = d.name;
        fetchLastPrice(d.id);
        redraw();
      };
      list.appendChild(it);
    }
    list.style.display = 'block';
  };
  input.oninput = () => { buyFilter = input.value; buyItem = null; renderSuggestions(); };
  input.onfocus = renderSuggestions;

  // picked item display + last-price hint
  const picked = document.createElement('div');
  picked.className = 'ge-picked';
  if (buyItem) {
    const ic = icon(buyItem);
    if (ic) picked.appendChild(ic);
    const nm = document.createElement('b');
    nm.textContent = itemName(buyItem);
    picked.appendChild(nm);
    const lp = document.createElement('span');
    lp.className = 'ge-hint';
    lp.textContent = lastPrice != null ? 'Last traded: ' + lastPrice + ' gp' : 'No recent trades.';
    picked.appendChild(lp);
  } else {
    picked.innerHTML = '<span class="ge-hint">No item chosen yet.</span>';
  }
  form.appendChild(picked);

  // qty + price
  const qtyRow = document.createElement('div');
  qtyRow.className = 'ge-row';
  qtyRow.innerHTML = '<label>Quantity:</label>';
  const qtyIn = document.createElement('input');
  qtyIn.type = 'number'; qtyIn.min = '1'; qtyIn.value = String(buyQty);
  qtyRow.appendChild(qtyIn);
  form.appendChild(qtyRow);

  const priceRow = document.createElement('div');
  priceRow.className = 'ge-row';
  priceRow.innerHTML = '<label>Price each:</label>';
  const priceIn = document.createElement('input');
  priceIn.type = 'number'; priceIn.min = '1'; priceIn.value = String(buyPrice);
  priceRow.appendChild(priceIn);
  form.appendChild(priceRow);

  const totalLine = document.createElement('div');
  totalLine.className = 'ge-row';
  const totalSpan = document.createElement('span');
  totalSpan.className = 'ge-total';
  totalLine.appendChild(totalSpan);
  form.appendChild(totalLine);

  const confirm = btn('Place Buy Offer', 'ge-collect', () => submitBuy());
  form.appendChild(confirm);

  const updateTotal = () => {
    const total = Math.floor(buyQty) * Math.floor(buyPrice);
    const have = invCount('coins');
    totalSpan.textContent = 'Total: ' + total + ' gp (you have ' + have + ')';
    totalSpan.classList.toggle('ge-bad', total > have);
    confirm.disabled = !buyItem || total > have;
  };
  qtyIn.oninput = () => { buyQty = Math.max(1, parseInt(qtyIn.value, 10) || 1); updateTotal(); };
  priceIn.oninput = () => { buyPrice = Math.max(1, parseInt(priceIn.value, 10) || 1); updateTotal(); };
  updateTotal();

  m.appendChild(form);
}

function drawSellForm(m: HTMLElement) {
  const form = document.createElement('div');
  form.className = 'ge-form';

  const hint = document.createElement('div');
  hint.className = 'ge-hint';
  hint.textContent = 'Pick an item from your pack to sell:';
  form.appendChild(hint);

  // inventory strip — dedupe by item id, exclude coins (everything tradeable in v1)
  const strip = document.createElement('div');
  strip.className = 'ge-inv-strip';
  const counts = new Map<string, number>();
  for (const s of state.player.inventory as ({ id: string; qty: number } | null)[]) {
    if (!s || s.id === 'coins') continue;
    counts.set(s.id, (counts.get(s.id) ?? 0) + s.qty);
  }
  if (counts.size === 0) {
    const e = document.createElement('div');
    e.className = 'ge-empty';
    e.textContent = 'Nothing in your pack to sell.';
    strip.appendChild(e);
  }
  for (const [id, qty] of counts) {
    const slot = document.createElement('div');
    slot.className = 'ge-inv-slot' + (sellItem === id ? ' ge-selected' : '');
    slot.title = itemName(id) + ' x' + qty;
    const ic = icon(id);
    if (ic) slot.appendChild(ic);
    if (qty > 1) {
      const q = document.createElement('span');
      q.className = 'ge-q';
      q.textContent = String(qty);
      slot.appendChild(q);
    }
    slot.onclick = () => {
      sellItem = id;
      sellQty = qty;
      fetchLastPrice(id);
      redraw();
    };
    strip.appendChild(slot);
  }
  form.appendChild(strip);

  const picked = document.createElement('div');
  picked.className = 'ge-picked';
  if (sellItem) {
    const ic = icon(sellItem);
    if (ic) picked.appendChild(ic);
    const nm = document.createElement('b');
    nm.textContent = itemName(sellItem) + ' (held: ' + invCount(sellItem) + ')';
    picked.appendChild(nm);
    const lp = document.createElement('span');
    lp.className = 'ge-hint';
    lp.textContent = lastPrice != null ? 'Last traded: ' + lastPrice + ' gp' : 'No recent trades.';
    picked.appendChild(lp);
  } else {
    picked.innerHTML = '<span class="ge-hint">No item chosen yet.</span>';
  }
  form.appendChild(picked);

  const qtyRow = document.createElement('div');
  qtyRow.className = 'ge-row';
  qtyRow.innerHTML = '<label>Quantity:</label>';
  const qtyIn = document.createElement('input');
  qtyIn.type = 'number'; qtyIn.min = '1'; qtyIn.value = String(sellQty);
  qtyIn.oninput = () => {
    const held = sellItem ? invCount(sellItem) : 1;
    sellQty = Math.min(Math.max(1, parseInt(qtyIn.value, 10) || 1), Math.max(1, held));
  };
  qtyRow.appendChild(qtyIn);
  form.appendChild(qtyRow);

  const priceRow = document.createElement('div');
  priceRow.className = 'ge-row';
  priceRow.innerHTML = '<label>Price each:</label>';
  const priceIn = document.createElement('input');
  priceIn.type = 'number'; priceIn.min = '1'; priceIn.value = String(sellPrice);
  priceIn.oninput = () => { sellPrice = Math.max(1, parseInt(priceIn.value, 10) || 1); };
  priceRow.appendChild(priceIn);
  form.appendChild(priceRow);

  form.appendChild(btn('Place Sell Offer', 'ge-collect', () => submitSell(), !sellItem));
  m.appendChild(form);
}

// ---------------- registration ----------------

function tryOpenExchange(): 'done' {
  if (!net.online) {
    msg('The Grand Exchange is closed (offline mode).');
    return 'done';
  }
  openModal();
  return 'done';
}

registerObjectAction('ge_booth', 'Exchange', () => tryOpenExchange());
registerNpcAction('ge_clerk', 'Exchange', () => tryOpenExchange());

export {};
