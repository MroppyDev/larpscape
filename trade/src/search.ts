// SEARCH tab — filter rail + dense listing results with buyout.
import {
  search, buyListing, ApiError,
  type Listing, type SearchParams, type SearchResult,
} from './api';
import { itemAutocomplete } from './autocomplete';
import { coins, commas, parseCoins, age, EFFECT_LABELS, SLOT_LABELS } from './fmt';
import {
  el, clear, toast, confirmDialog, skeletonRows, emptyState, errorState,
  itemCell, statLine, sellerCell,
} from './ui';

export interface TabCtx {
  username: string | null;
  loginUrl: string;
  refreshSession(): Promise<void>;
}

const EMPTY_LINES = [
  'The board is bare. Saltjaw weeps.',
  'Not a single nail holds a notice here.',
  'The Offnote took the last one. Probably.',
];

export function renderSearch(container: HTMLElement, ctx: TabCtx): void {
  clear(container);

  // ---- filter rail ----------------------------------------------------------
  const nameAc = itemAutocomplete({
    placeholder: 'e.g. Rimeglass blade',
    onPick: () => run(1),
    onInput: () => debounceRun(),
  });

  const slotSel = el('select', {}, el('option', { value: '', text: 'Any slot' }));
  for (const [v, label] of Object.entries(SLOT_LABELS)) {
    slotSel.appendChild(el('option', { value: v, text: label }));
  }

  const effectBoxes: HTMLInputElement[] = [];
  const effectGrid = el('div', { class: 'check-grid' });
  for (const [v, label] of Object.entries(EFFECT_LABELS)) {
    const box = el('input', { type: 'checkbox', value: v });
    effectBoxes.push(box);
    effectGrid.appendChild(el('label', {}, box, label));
  }

  const specBox = el('input', { type: 'checkbox' });
  const maxLevel = el('input', { type: 'number', min: '1', max: '99', placeholder: 'Any' });
  const minPrice = el('input', { type: 'text', placeholder: 'e.g. 5k' });
  const maxPrice = el('input', { type: 'text', placeholder: 'e.g. 2m' });
  const sortSel = el(
    'select', {},
    el('option', { value: 'price', text: 'Cheapest first (per unit)' }),
    el('option', { value: 'age', text: 'Newest first' })
  );

  const field = (label: string, node: HTMLElement) =>
    el('div', { class: 'field' }, el('label', { text: label }), node);

  // filters apply themselves — no need to find the Search button first
  slotSel.addEventListener('change', () => run(1));
  sortSel.addEventListener('change', () => run(1));
  specBox.addEventListener('change', () => run(1));
  for (const b of effectBoxes) b.addEventListener('change', () => run(1));
  maxLevel.addEventListener('input', debounceRun);
  minPrice.addEventListener('input', debounceRun);
  maxPrice.addEventListener('input', debounceRun);

  const isNarrow = () => window.matchMedia('(max-width: 920px)').matches;
  const railToggle = el('button', {
    class: 'rail-toggle', type: 'button', 'aria-expanded': 'true',
    text: 'Refine the board',
    click: () => {
      const open = !rail.classList.toggle('collapsed');
      railToggle.setAttribute('aria-expanded', String(open));
    },
  });
  const collapseRail = () => {
    rail.classList.add('collapsed');
    railToggle.setAttribute('aria-expanded', 'false');
  };

  const rail = el(
    'form',
    {
      class: 'filter-rail',
      submit: (e: Event) => {
        e.preventDefault();
        run(1);
        if (isNarrow()) collapseRail(); // give the phone screen back to the results
      },
    },
    railToggle,
    field('Item name', nameAc.root),
    field('Equipment slot', slotSel),
    el('div', { class: 'field' }, el('label', { text: 'Weapon effects' }), effectGrid),
    el('div', { class: 'check-solo' }, el('label', {}, specBox, 'Has a special attack')),
    field('Max level req.', maxLevel),
    el(
      'div', { class: 'field-row' },
      field('Min price', minPrice),
      field('Max price', maxPrice)
    ),
    field('Sort', sortSel),
    el('button', { class: 'btn', type: 'submit', text: 'Search the board' }),
    el('button', {
      class: 'btn btn-ghost', type: 'button', text: 'Clear filters',
      click: () => {
        nameAc.setValue('');
        slotSel.value = ''; specBox.checked = false;
        maxLevel.value = ''; minPrice.value = ''; maxPrice.value = '';
        sortSel.value = 'price';
        for (const b of effectBoxes) b.checked = false;
        run(1);
      },
    })
  );

  if (isNarrow()) collapseRail(); // phones land on results, not a wall of filters

  const resultsBox = el('div', { class: 'results' });
  container.appendChild(el('div', { class: 'search-layout' }, rail, resultsBox));

  // ---- search execution -------------------------------------------------------
  let page = 1;
  let inFlight = 0;
  let debounceTimer = 0;

  function params(): SearchParams {
    const checkedEffects = effectBoxes.filter((b) => b.checked).map((b) => b.value);
    const p: SearchParams = { page, sort: sortSel.value as 'price' | 'age' };
    const name = nameAc.input.value.trim();
    if (name) p.name = name;
    if (slotSel.value) p.slot = slotSel.value;
    // The API takes a single effect token; extra checked effects are applied client-side.
    if (checkedEffects.length) p.effect = checkedEffects[0];
    if (specBox.checked) p.hasSpec = true;
    const lvl = parseInt(maxLevel.value, 10);
    if (Number.isInteger(lvl) && lvl > 0) p.maxLevelReq = lvl;
    const lo = parseCoins(minPrice.value);
    const hi = parseCoins(maxPrice.value);
    if (lo !== null && minPrice.value.trim()) p.minPrice = lo;
    if (hi !== null && maxPrice.value.trim()) p.maxPrice = hi;
    return p;
  }

  function debounceRun(): void {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => run(1), 320);
  }

  async function run(toPage: number): Promise<void> {
    page = toPage;
    const ticket = ++inFlight;
    clear(resultsBox);
    resultsBox.appendChild(skeletonRows());
    let result: SearchResult;
    try {
      result = await search(params());
    } catch (err) {
      if (ticket !== inFlight) return;
      clear(resultsBox);
      resultsBox.appendChild(errorState(err instanceof Error ? err.message : 'The board keeper is away.'));
      return;
    }
    if (ticket !== inFlight) return;
    renderResults(result);
  }

  function renderResults(result: SearchResult): void {
    clear(resultsBox);

    // client-side narrowing for 2nd..nth checked effect
    const extraEffects = effectBoxes.filter((b) => b.checked).map((b) => b.value).slice(1);
    const rows = extraEffects.length
      ? result.listings.filter((l) => extraEffects.every((e) => l.meta.effects.includes(e as never)))
      : result.listings;

    const pager = () => el(
      'div', { class: 'pager' },
      el('button', {
        class: 'btn btn-small', type: 'button', text: '← Prev',
        disabled: result.page <= 1, click: () => run(result.page - 1),
      }),
      el('span', { text: `${result.page} / ${result.pages}` }),
      el('button', {
        class: 'btn btn-small', type: 'button', text: 'Next →',
        disabled: result.page >= result.pages, click: () => run(result.page + 1),
      })
    );

    if (!rows.length) {
      // distinguish "nothing matched at all" from "this page lost out to the extra effects"
      if (extraEffects.length && result.total > 0) {
        resultsBox.appendChild(emptyState(
          'Nothing on this page bears every mark you asked for.',
          result.pages > 1
            ? 'The extra effects are checked page by page — try the next page.'
            : 'Untick an effect or two to widen the net.'
        ));
        if (result.pages > 1) resultsBox.appendChild(pager());
      } else {
        resultsBox.appendChild(emptyState(
          EMPTY_LINES[Math.floor(Math.random() * EMPTY_LINES.length)],
          'Loosen a filter or two — somewhere in Cantorne, someone is hoarding exactly what you want.'
        ));
      }
      return;
    }

    resultsBox.appendChild(el(
      'div', { class: 'results-head' },
      el('span', {
        class: 'count',
        text: extraEffects.length
          ? `${commas(rows.length)} shown of ${commas(result.total)} (extra effects narrow each page)`
          : `${commas(result.total)} listing${result.total === 1 ? '' : 's'}`,
      }),
      el('span', { text: `page ${result.page} of ${result.pages}` })
    ));

    for (const listing of rows) resultsBox.appendChild(listingRow(listing));

    if (result.pages > 1) resultsBox.appendChild(pager());
  }

  function listingRow(l: Listing): HTMLElement {
    const priceWrap = el('span', {}, el('span', { class: 'price', title: `${commas(l.price)} coins total`, text: coins(l.price) }));
    if (l.qty > 1) priceWrap.appendChild(el('span', { class: 'price-per', text: `${coins(l.pricePer)} ea` }));

    const isMine = ctx.username !== null && l.seller === ctx.username;
    const buyBtn = el('button', {
      class: 'btn btn-primary btn-small',
      type: 'button',
      text: isMine ? 'Yours' : 'Buyout',
      disabled: isMine,
      click: () => onBuy(l),
    });

    return el(
      'div', { class: 'listing-row' },
      itemCell(l.item, l.name, l.qty),
      statLine(l.meta),
      priceWrap,
      sellerCell(l.seller, l.sellerOnline),
      el('span', { class: 'age-cell', text: age(l.createdAt) }),
      buyBtn
    );
  }

  async function onBuy(l: Listing): Promise<void> {
    if (!ctx.username) {
      const go = await confirmDialog({
        title: 'Adventurer unknown',
        body: 'Only signed-in adventurers may buy from the board. Head to the gate and log in?',
        confirmLabel: 'Go to login',
      });
      if (go) location.href = ctx.loginUrl;
      return;
    }
    const what = l.qty > 1 ? `${commas(l.qty)} × ${l.name}` : l.name;
    const ok = await confirmDialog({
      title: 'Seal the bargain?',
      body: el('div', {},
        el('p', { class: 'deal-line' },
          'You pay: ',
          el('b', { class: 'price', text: `${commas(l.price)} coins` }),
          l.qty > 1 ? ` (${commas(l.pricePer)} each)` : '',
          ' from your bank.'),
        el('p', { class: 'deal-line' },
          'You receive: ',
          el('b', { text: what }),
          ', delivered to your bank.'),
        el('p', { class: 'deal-fine', text: 'The coins leave the moment you nod.' })),
      confirmLabel: `Buy for ${coins(l.price)}`,
    });
    if (!ok) return;
    try {
      await buyListing(l.id);
      toast(`Bought ${what} for ${commas(l.price)} coins. It awaits in your bank.`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast('Too slow — that notice was already torn down.', 'err');
      } else {
        toast(err instanceof Error ? err.message : 'The deal fell through.', 'err');
      }
    }
    run(page);
  }

  run(1);
}
