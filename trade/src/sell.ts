// SELL tab — bank picker (from /api/character save.bank), qty + price form
// with 1% fee preview and live price suggestions (last sold + cheapest listed).
import {
  getBank, getItems, listItem, search, gePrices, itemMeta,
  type BankStack, type ItemMeta,
} from './api';
import { coins, commas, parseCoins, listingFee } from './fmt';
import { el, clear, toast, confirmDialog, skeletonRows, emptyState, errorState } from './ui';
import { itemCanvas } from './pix';
import type { TabCtx } from './search';

export function renderSell(container: HTMLElement, ctx: TabCtx): void {
  clear(container);
  container.appendChild(el('h2', { class: 'panel-title', text: 'Pin a notice to the board' }));

  if (!ctx.username) {
    container.appendChild(emptyState(
      'The board keeper squints at you. "And who might you be?"',
      'Log in at the gate to sell from your bank.'
    ));
    container.appendChild(el('p', { style: 'text-align:center' },
      el('a', { class: 'btn', href: ctx.loginUrl, text: 'Log in' })));
    return;
  }

  container.appendChild(el('p', {
    class: 'panel-note',
    text: 'Items are taken from your bank into escrow when listed. The board keeper takes a 1% pinning fee (min 10 gp), kept whether or not it sells. Max 12 active notices.',
  }));

  const bankBox = el('div', { class: 'parch' }, el('h3', { text: 'Your bank' }), skeletonRows(3));
  const formBox = el('div', { class: 'parch sell-form' }, el('h3', { text: 'The notice' }),
    el('p', { class: 'panel-note', style: 'color:#6b5a40', text: 'Pick an item from your bank.' }));
  container.appendChild(el('div', { class: 'sell-layout' }, bankBox, formBox));

  let bank: BankStack[] = [];
  let coinsHeld = 0;
  let selected: { stack: BankStack; meta: ItemMeta | null } | null = null;

  void (async () => {
    try {
      const [stacks] = await Promise.all([getBank(), getItems()]);
      if (!stacks) {
        clear(bankBox);
        bankBox.appendChild(el('h3', { text: 'Your bank' }));
        bankBox.appendChild(emptyState(
          'No character save found.',
          'Step into the realm once at play.larpscape.net and your bank will appear here.'
        ));
        return;
      }
      bank = stacks;
      coinsHeld = stacks.find((s) => s.id === 'coins')?.qty ?? 0;
      renderBank();
    } catch (err) {
      clear(bankBox);
      bankBox.appendChild(errorState(err instanceof Error ? err.message : 'Could not open the vault.'));
    }
  })();

  function renderBank(): void {
    clear(bankBox);
    bankBox.appendChild(el('h3', { text: 'Your bank' }));
    bankBox.appendChild(el('p', { class: 'suggest-line' },
      'Coins on hand: ', el('b', { text: `${commas(coinsHeld)} gp` })));
    const sellable = bank.filter((s) => s.id !== 'coins');
    if (!sellable.length) {
      bankBox.appendChild(emptyState('Your vault echoes. Nothing to sell but ambition.'));
      return;
    }
    const grid = el('div', { class: 'bank-grid' });
    for (const stack of sellable) {
      const meta = itemMeta(stack.id);
      const slot = el(
        'button',
        {
          type: 'button',
          class: 'bank-slot',
          title: meta?.name ?? stack.id,
          click: () => {
            selected = { stack, meta };
            grid.querySelectorAll('.bank-slot.sel').forEach((n) => n.classList.remove('sel'));
            slot.classList.add('sel');
            renderForm();
          },
        },
        itemCanvas(stack.id, 30),
        el('span', { class: 'qty', text: commas(stack.qty) }),
        el('span', { class: 'nm', text: meta?.name ?? stack.id })
      );
      grid.appendChild(slot);
    }
    bankBox.appendChild(grid);
  }

  function renderForm(): void {
    clear(formBox);
    formBox.appendChild(el('h3', { text: 'The notice' }));
    if (!selected) {
      formBox.appendChild(el('p', { class: 'panel-note', style: 'color:#6b5a40', text: 'Pick an item from your bank.' }));
      return;
    }
    const { stack, meta } = selected;
    const name = meta?.name ?? stack.id;

    const qtyInput = el('input', { type: 'number', min: '1', max: String(stack.qty), value: '1' });
    const priceInput = el('input', { type: 'text', placeholder: 'total price — e.g. 120k' });
    const FEE_HINT = 'Pinning fee: 1% of asking price, min 10 gp — shown here before you commit.';
    const feeLine = el('p', { class: 'fee-line', text: FEE_HINT });
    const suggestLine = el('p', { class: 'suggest-line', text: 'Consulting the ledgers…' });
    const submit = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Pin the notice' });

    function updateFee(): void {
      const p = parseCoins(priceInput.value);
      feeLine.classList.remove('fee-warn');
      if (p === null || p < 1) { feeLine.textContent = FEE_HINT; return; }
      const fee = listingFee(p);
      const short = fee > coinsHeld;
      if (short) feeLine.classList.add('fee-warn');
      feeLine.replaceChildren(
        'Pinning fee: ', el('b', { text: `${commas(fee)} gp` }),
        ` paid now from your bank — you receive the full ${commas(p)} gp when it sells.`,
        short
          ? el('span', { class: 'fee-short', text: ` You hold only ${commas(coinsHeld)} gp; the keeper won't pin on credit.` })
          : ''
      );
    }
    priceInput.addEventListener('input', updateFee);

    const form = el(
      'form',
      {
        submit: (e: Event) => { e.preventDefault(); void onSubmit(); },
      },
      el('div', { class: 'item-cell', style: 'margin-bottom:8px' },
        itemCanvas(stack.id),
        el('span', { class: 'item-name', style: 'color:#2b2114', text: `${name} (${commas(stack.qty)} banked)` })),
      el('div', { class: 'field' }, el('label', { text: 'Quantity' }), qtyInput),
      el('div', { class: 'field' }, el('label', { text: 'Total asking price (coins)' }), priceInput),
      feeLine,
      suggestLine,
      submit
    );
    formBox.appendChild(form);

    // live suggestions: last sold (GE trades) + cheapest active listing.
    // Each is a button — tap to fill the price (per-unit × current quantity).
    const usePrice = (per: number, label: string) =>
      el('button', {
        type: 'button', class: 'suggest-btn',
        title: `Use ${commas(per)} gp each as your asking price`,
        click: () => {
          const q = Math.max(1, Math.min(stack.qty, parseInt(qtyInput.value, 10) || 1));
          priceInput.value = commas(per * q);
          updateFee();
        },
      }, `${label} ${coins(per)} ea`);

    void (async () => {
      const bits: (string | Node)[] = [];
      try {
        const prices = await gePrices();
        const last = prices[stack.id];
        if (last) bits.push(usePrice(last, 'Last sold:'));
      } catch { /* ledgers unavailable */ }
      try {
        const res = await search({ name, sort: 'price', page: 1 });
        const cheapest = res.listings.find((l) => l.item === stack.id);
        if (cheapest) bits.push(usePrice(cheapest.pricePer, 'Cheapest on the board:'));
      } catch { /* board unavailable */ }
      if (bits.length) bits.push(el('span', { class: 'suggest-hint', text: ' — tap to use' }));
      suggestLine.replaceChildren(...(bits.length ? bits : ['No prior sales — name your price, pioneer.']));
    })();

    async function onSubmit(): Promise<void> {
      const qty = parseInt(qtyInput.value, 10);
      const price = parseCoins(priceInput.value);
      if (!Number.isInteger(qty) || qty < 1 || qty > stack.qty) {
        toast(`Quantity must be between 1 and ${commas(stack.qty)}.`, 'err'); return;
      }
      if (price === null || price < 1 || price > 2_000_000_000) {
        toast('Enter a price between 1 and 2b coins (e.g. 120k, 1.5m).', 'err'); return;
      }
      const fee = listingFee(price);
      if (fee > coinsHeld) {
        toast(`The ${commas(fee)} gp pinning fee exceeds your ${commas(coinsHeld)} gp on hand.`, 'err');
        return;
      }
      const ok = await confirmDialog({
        title: 'Pin this notice?',
        body: el('p', {},
          `List ${qty > 1 ? `${commas(qty)} × ` : ''}${name} for `,
          el('b', { text: `${commas(price)} coins` }),
          ` total? The keeper's fee of ${commas(fee)} gp is paid now from your bank and is not returned.`),
        confirmLabel: 'Pin it',
      });
      if (!ok) return;
      submit.disabled = true;
      try {
        await listItem(stack.id, qty, price);
        toast(`Notice pinned: ${name} for ${commas(price)} coins.`);
        // refresh the bank snapshot (item escrowed + fee taken)
        const stacks = await getBank();
        if (stacks) {
          bank = stacks;
          coinsHeld = stacks.find((s) => s.id === 'coins')?.qty ?? 0;
        }
        selected = null;
        renderBank();
        renderForm();
      } catch (err) {
        toast(err instanceof Error ? err.message : 'The keeper refused the notice.', 'err');
        submit.disabled = false;
      }
    }
  }
}
