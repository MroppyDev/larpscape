// Small DOM helpers + shared widgets (toast, confirm dialog, badges, skeletons).
import type { Listing } from './api';
import { itemCanvas } from './pix';
import { coins, commas, EFFECT_LABELS } from './fmt';

type Child = Node | string | null | undefined;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string | boolean | EventListener>,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (typeof v === 'function') node.addEventListener(k, v);
      else if (typeof v === 'boolean') { if (v) node.setAttribute(k, ''); }
      else if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else node.setAttribute(k, v);
    }
  }
  for (const c of children) {
    if (c === null || c === undefined) continue;
    node.append(c);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

// ---- toast -----------------------------------------------------------------

let toastTimer = 0;
export function toast(message: string, kind: 'ok' | 'err' = 'ok'): void {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('div', { id: 'toast', role: 'status' });
    document.body.appendChild(box);
  }
  box.textContent = message;
  box.className = `show ${kind}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { box!.className = ''; }, 3600);
}

// ---- confirm dialog ----------------------------------------------------------

export function confirmDialog(opts: {
  title: string;
  body: Node | string;
  confirmLabel: string;
}): Promise<boolean> {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'dialog-overlay' });
    const done = (v: boolean) => { overlay.remove(); resolve(v); };
    const box = el(
      'div',
      { class: 'dialog', role: 'dialog', 'aria-modal': 'true' },
      el('h3', { text: opts.title }),
      el('div', { class: 'dialog-body' }, opts.body),
      el(
        'div',
        { class: 'dialog-actions' },
        el('button', { class: 'btn btn-ghost', text: 'Never mind', click: () => done(false) }),
        el('button', { class: 'btn btn-primary', text: opts.confirmLabel, click: () => done(true) })
      )
    );
    overlay.addEventListener('click', (e) => { if (e.target === overlay) done(false); });
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); done(false); }
    });
    (box.querySelector('.btn-primary') as HTMLButtonElement).focus();
  });
}

// ---- shared listing fragments --------------------------------------------------

export function priceTag(total: number): HTMLElement {
  const node = el('span', { class: 'price', title: `${commas(total)} coins` }, coins(total));
  return node;
}

export function effectBadges(effects: string[]): HTMLElement | null {
  if (!effects.length) return null;
  const wrap = el('span', { class: 'badges' });
  for (const eff of effects) {
    wrap.appendChild(el('span', { class: `badge eff-${eff}`, text: EFFECT_LABELS[eff] ?? eff }));
  }
  return wrap;
}

/** Inline stat summary for a listing row: bonuses, speed, spec, level req. */
export function statLine(meta: Listing['meta']): HTMLElement {
  const bits: string[] = [];
  const b = meta.bonuses;
  const pairs: [string, number][] = [
    ['Att', b.att], ['Str', b.str], ['Rng', b.ranged], ['Mag', b.mage], ['Gun', b.gun],
  ];
  for (const [label, v] of pairs) if (v) bits.push(`${label} ${v > 0 ? '+' : ''}${v}`);
  if (meta.attackSpeed) bits.push(`Spd ${meta.attackSpeed}`);
  if (meta.levelReq > 0) {
    const req = meta.levelReqs.map((r) => `${r.skill} ${r.level}`).join(', ');
    bits.push(`Req ${req || meta.levelReq}`);
  }
  const line = el('span', { class: 'stat-line' }, bits.join(' · '));
  if (meta.spec) {
    line.appendChild(el('span', { class: 'badge badge-spec', text: `✨ ${meta.spec}` }));
  }
  const badges = effectBadges(meta.effects);
  if (badges) line.appendChild(badges);
  return line;
}

export function itemCell(id: string, name: string, qty: number): HTMLElement {
  const cell = el(
    'div',
    { class: 'item-cell' },
    itemCanvas(id),
    el(
      'div',
      { class: 'item-cell-text' },
      el('span', { class: 'item-name', text: name }),
      qty > 1 ? el('span', { class: 'item-qty', text: `× ${commas(qty)}` }) : null
    )
  );
  return cell;
}

export function sellerCell(name: string, online: boolean | undefined): HTMLElement {
  return el(
    'span',
    { class: 'seller' },
    el('span', {
      class: `dot ${online ? 'on' : 'off'}`,
      title: online ? 'In the realm now' : 'Away from the realm',
    }),
    name
  );
}

// ---- loading / empty states ----------------------------------------------------

export function skeletonRows(n = 6): HTMLElement {
  const wrap = el('div', { class: 'skeletons', 'aria-hidden': 'true' });
  for (let i = 0; i < n; i++) wrap.appendChild(el('div', { class: 'skeleton-row' }));
  return wrap;
}

export function emptyState(line: string, sub?: string): HTMLElement {
  return el(
    'div',
    { class: 'empty-state' },
    el('p', { class: 'empty-lore', text: line }),
    sub ? el('p', { class: 'empty-sub', text: sub }) : null
  );
}

export function errorState(message: string): HTMLElement {
  return el('div', { class: 'empty-state error' }, el('p', { text: message }));
}
