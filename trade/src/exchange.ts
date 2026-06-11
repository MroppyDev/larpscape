// EXCHANGE tab — the Aldgate Exchange on the web: per-item price history chart
// (canvas, hand-drawn) + last-trade price, and your standing in-game offers.
//
// Deliberately READ-ONLY for offers: the in-game GE endpoints use the
// client-trusted escrow model (the game client removes/adds the items
// locally). Driving place/abort/collect from a web page would mint or void
// items, so docs/MARKET-API.md directs the trade site to the /api/market/*
// endpoints for actual buying and selling.
import { geHistory, gePrices, geOffers, itemMeta, type GeOffer, type ItemMeta } from './api';
import { itemAutocomplete } from './autocomplete';
import { coins, commas } from './fmt';
import { el, clear, skeletonRows, emptyState, errorState } from './ui';
import { itemCanvas } from './pix';
import { renderPriceChart } from './chart';
import type { TabCtx } from './search';

export function renderExchange(container: HTMLElement, ctx: TabCtx): void {
  clear(container);
  container.appendChild(el('h2', { class: 'panel-title', text: 'The Aldgate Exchange' }));
  container.appendChild(el('p', {
    class: 'panel-note',
    text: 'Ninety days of ledgers for any item — every trade struck at the Exchange or bought off this board. Offers themselves are placed at the Exchange in Aldgate, in person; the clerks accept no letters.',
  }));

  const rail = el('div', { class: 'filter-rail' });
  const stage = el('div');
  container.appendChild(el('div', { class: 'exchange-layout' }, rail, stage));

  // ---- left rail: item picker + my standing offers ---------------------------
  const ac = itemAutocomplete({
    placeholder: 'e.g. Rune scimitar',
    onPick: (m) => void showItem(m),
  });
  rail.appendChild(el('h3', { text: 'Consult the ledgers' }));
  rail.appendChild(el('div', { class: 'field' }, el('label', { text: 'Item' }), ac.root));

  const offersBox = el('div');
  rail.appendChild(offersBox);
  void renderOffers();

  async function renderOffers(): Promise<void> {
    clear(offersBox);
    if (!ctx.username) {
      offersBox.appendChild(el('p', {
        class: 'panel-note',
        text: 'Log in to see your standing Exchange offers.',
      }));
      return;
    }
    offersBox.appendChild(el('h3', { text: 'Your standing offers', style: 'margin-top:10px' }));
    const list = el('div');
    offersBox.appendChild(list);
    list.appendChild(skeletonRows(2));
    let offers: GeOffer[];
    try {
      offers = (await geOffers()).offers;
    } catch (err) {
      clear(list);
      list.appendChild(el('p', { class: 'panel-note', text: err instanceof Error ? err.message : 'The clerk is at lunch.' }));
      return;
    }
    clear(list);
    if (!offers.length) {
      list.appendChild(el('p', { class: 'panel-note', text: 'No offers on the books. The clerks doze.' }));
      return;
    }
    for (const o of offers) {
      const meta = itemMeta(o.item);
      const owedBits: string[] = [];
      if (o.coinsOwed > 0) owedBits.push(`${coins(o.coinsOwed)} gp to collect`);
      if (o.itemsOwed > 0) owedBits.push(`${commas(o.itemsOwed)} item${o.itemsOwed === 1 ? '' : 's'} to collect`);
      list.appendChild(el(
        'div', { class: 'offer-row' },
        itemCanvas(o.item, 24),
        el('span', { class: o.kind === 'buy' ? 'kind-buy' : 'kind-sell', text: o.kind.toUpperCase() }),
        el('span', { text: meta?.name ?? o.item }),
        el('span', { class: 'offer-fill', text: `${commas(o.filled)} / ${commas(o.qty)} @ ${coins(o.price)} ea${o.active ? '' : ' · done'}` }),
        owedBits.length ? el('span', { class: 'offer-fill', text: owedBits.join(' · ') }) : null
      ));
    }
    list.appendChild(el('p', {
      class: 'panel-note',
      text: 'Manage and collect these at the Exchange in game — the board cannot touch the clerks’ strongbox.',
    }));
  }

  // ---- right stage: chart -----------------------------------------------------
  stage.appendChild(emptyState(
    'Name an item, and the ledgers open.',
    'Ninety days of prices and volume, drawn fresh.'
  ));

  async function showItem(meta: ItemMeta): Promise<void> {
    clear(stage);
    stage.appendChild(skeletonRows(4));
    let days;
    let last: number | undefined;
    try {
      const [hist, prices] = await Promise.all([
        geHistory(meta.id),
        gePrices().catch(() => ({} as Record<string, number>)),
      ]);
      days = hist.days;
      last = prices[meta.id];
    } catch (err) {
      clear(stage);
      stage.appendChild(errorState(err instanceof Error ? err.message : 'The ledgers are sealed today.'));
      return;
    }
    clear(stage);

    const head = el(
      'div', { class: 'item-cell', style: 'margin-bottom:10px' },
      itemCanvas(meta.id),
      el('div', {},
        el('span', { class: 'item-name', style: 'font-size:20px', text: meta.name }),
        el('span', { class: 'item-qty', text: last ? `Last traded at ${commas(last)} gp` : 'Never traded — a blank page.' }))
    );
    stage.appendChild(head);

    const canvas = el('canvas');
    const box = el(
      'div', { class: 'parch chart-box' },
      canvas,
      el('div', { class: 'chart-caption' },
        el('span', { class: 'key' }, el('span', { class: 'swatch', style: 'background:#8a3a1c' }), 'avg daily price'),
        el('span', { class: 'key' }, el('span', { class: 'swatch', style: 'background:rgba(110,90,50,.55)' }), 'volume traded'))
    );
    stage.appendChild(box);
    renderPriceChart(canvas, days);

    if (days.length) {
      const totVol = days.reduce((a, d) => a + d.volume, 0);
      const hi = Math.max(...days.map((d) => d.avgPrice));
      const lo = Math.min(...days.map((d) => d.avgPrice));
      stage.appendChild(el('p', { class: 'panel-note', style: 'margin-top:8px' },
        `${commas(totVol)} traded over ${days.length} day${days.length === 1 ? '' : 's'} · high ${coins(hi)} · low ${coins(lo)}`));
    }
  }
}
