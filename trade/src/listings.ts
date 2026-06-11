// MY LISTINGS tab — active notices (cancel), sold/cancelled history, and the
// proceeds purse with a collect button.
import { myListings, myProceeds, cancelListing, collectProceeds, type Listing } from './api';
import { coins, commas, age } from './fmt';
import { el, clear, toast, confirmDialog, skeletonRows, emptyState, errorState, itemCell, sellerCell } from './ui';
import type { TabCtx } from './search';

export function renderMyListings(container: HTMLElement, ctx: TabCtx): void {
  clear(container);
  container.appendChild(el('h2', { class: 'panel-title', text: 'Your notices' }));

  if (!ctx.username) {
    container.appendChild(emptyState(
      '"No name, no notices," says the board keeper.',
      'Log in to see your listings and collect your coin.'
    ));
    container.appendChild(el('p', { style: 'text-align:center' },
      el('a', { class: 'btn', href: ctx.loginUrl, text: 'Log in' })));
    return;
  }

  const body = el('div');
  container.appendChild(body);
  void load();

  async function load(): Promise<void> {
    clear(body);
    body.appendChild(skeletonRows(4));
    let listings: Listing[];
    let owed = 0;
    try {
      const [mine, proceeds] = await Promise.all([myListings(), myProceeds()]);
      listings = mine.listings;
      owed = proceeds.coins;
    } catch (err) {
      clear(body);
      body.appendChild(errorState(err instanceof Error ? err.message : 'The ledger is smudged.'));
      return;
    }
    render(listings, owed);
  }

  function render(listings: Listing[], owed: number): void {
    clear(body);

    // proceeds purse
    const collectBtn = el('button', {
      class: 'btn btn-primary',
      type: 'button',
      text: 'Collect',
      disabled: owed <= 0,
      click: async () => {
        collectBtn.disabled = true;
        try {
          const r = await collectProceeds();
          if (r.remaining > 0) {
            toast(`Collected ${commas(r.collected)} gp — ${commas(r.remaining)} gp still owed (your coin stack is near full).`);
          } else {
            toast(`Collected ${commas(r.collected)} gp into your bank.`);
          }
        } catch (err) {
          toast(err instanceof Error ? err.message : 'The purse stayed shut.', 'err');
        }
        void load();
      },
    });
    body.appendChild(el(
      'div', { class: 'parch proceeds-bar' },
      el('span', { class: 'sum' }, 'Coins owed to you: ', el('b', { text: `${commas(owed)} gp` })),
      collectBtn
    ));

    const active = listings.filter((l) => l.status === 'active');
    const past = listings.filter((l) => l.status !== 'active');

    body.appendChild(el('h3', { class: 'section-title', text: `Active notices (${active.length} / 12)` }));
    if (!active.length) {
      body.appendChild(emptyState('Nothing of yours hangs on the board.', 'Pin something from the Sell page.'));
    } else {
      for (const l of active) body.appendChild(row(l, true));
    }

    body.appendChild(el('h3', { class: 'section-title', text: 'Past notices' }));
    if (!past.length) {
      body.appendChild(emptyState('No history yet. Every merchant starts with an empty ledger.'));
    } else {
      for (const l of past) body.appendChild(row(l, false));
    }
  }

  function row(l: Listing, cancellable: boolean): HTMLElement {
    const priceWrap = el('span', {},
      el('span', { class: 'price', title: `${commas(l.price)} coins total`, text: coins(l.price) }),
      l.qty > 1 ? el('span', { class: 'price-per', text: `${coins(l.pricePer)} ea` }) : null);

    const pill = el('span', { class: `status-pill status-${l.status}`, text: l.status });

    const tail = cancellable
      ? el('button', {
          class: 'btn btn-small', type: 'button', text: 'Take down',
          click: () => void onCancel(l),
        })
      : el('span', { class: 'age-cell', text: l.status === 'sold' && l.soldAt ? `sold ${age(l.soldAt)}` : age(l.createdAt) });

    return el(
      'div', { class: 'listing-row' },
      itemCell(l.item, l.name, l.qty),
      pill,
      priceWrap,
      sellerCell(l.seller, undefined),
      el('span', { class: 'age-cell', text: age(l.createdAt) }),
      tail
    );
  }

  async function onCancel(l: Listing): Promise<void> {
    const what = l.qty > 1 ? `${commas(l.qty)} × ${l.name}` : l.name;
    const ok = await confirmDialog({
      title: 'Take down the notice?',
      body: `${what} returns to your bank. The pinning fee stays with the keeper — house rules.`,
      confirmLabel: 'Take it down',
    });
    if (!ok) return;
    try {
      await cancelListing(l.id);
      toast(`${what} returned to your bank.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'The keeper would not budge.', 'err');
    }
    void load();
  }
}
