// Item-name autocomplete — client-side over the /api/market/items catalogue,
// with sprite thumbnails. Shared by the Search rail, Sell form and Exchange.
import { getItems, type ItemMeta } from './api';
import { itemCanvas } from './pix';
import { el, clear } from './ui';

export interface AutocompleteOpts {
  placeholder?: string;
  /** Called when a concrete item is picked from the list. */
  onPick?: (item: ItemMeta) => void;
  /** Called on free-typed input (debounced upstream by the caller). */
  onInput?: (text: string) => void;
}

export interface Autocomplete {
  root: HTMLElement;
  input: HTMLInputElement;
  setValue(text: string): void;
}

export function itemAutocomplete(opts: AutocompleteOpts = {}): Autocomplete {
  const input = el('input', {
    type: 'text',
    placeholder: opts.placeholder ?? 'Item name…',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const list = el('div', { class: 'ac-list' });
  list.hidden = true;
  const root = el('div', { class: 'ac-wrap' }, input, list);

  let items: ItemMeta[] = [];
  let matches: ItemMeta[] = [];
  let sel = -1;
  getItems().then((all) => { items = all.filter((m) => m.id !== 'coins'); }).catch(() => { /* board still searchable by raw text */ });

  function close(): void {
    list.hidden = true;
    sel = -1;
  }

  function render(): void {
    clear(list);
    matches.forEach((m, i) => {
      const row = el(
        'button',
        {
          type: 'button',
          class: `ac-item${i === sel ? ' sel' : ''}`,
          mousedown: (e: Event) => e.preventDefault(), // keep input focus
          click: () => pick(m),
        },
        itemCanvas(m.id, 22),
        m.name
      );
      list.appendChild(row);
    });
    list.hidden = matches.length === 0;
  }

  function pick(m: ItemMeta): void {
    input.value = m.name;
    close();
    opts.onPick?.(m);
  }

  function update(): void {
    const q = input.value.trim().toLowerCase();
    if (!q) { matches = []; render(); opts.onInput?.(''); return; }
    matches = items
      .filter((m) => m.name.toLowerCase().includes(q))
      .sort((a, b) => {
        const aw = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bw = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return aw - bw || a.name.localeCompare(b.name);
      })
      .slice(0, 9);
    sel = -1;
    render();
    opts.onInput?.(input.value.trim());
  }

  input.addEventListener('input', update);
  input.addEventListener('focus', update);
  input.addEventListener('blur', () => window.setTimeout(close, 120));
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(sel + 1, matches.length - 1); render(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(sel - 1, 0); render(); }
    else if (e.key === 'Enter' && sel >= 0) { e.preventDefault(); pick(matches[sel]); }
    else if (e.key === 'Escape') close();
  });

  return {
    root,
    input,
    setValue(text: string) { input.value = text; close(); },
  };
}
