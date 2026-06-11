// Starter-town casino — slots, blackjack, roulette (vs house) and coinflip (P2P).
import {
  registerObjectAction, registerNpcAction, msg, removeItem, addItem, invCount,
  state, startDialogue, showOptions,
} from '../game';
import { net } from '../net';
import { audio } from '../audio';

// ---------------- shared modal chrome ----------------

const STYLE = `
#gamble-layer { position: fixed; inset: 0; display: none; z-index: 53; pointer-events: none; }
.gamble-modal {
  position: absolute; pointer-events: auto; background: var(--parchment, #d8c9a3);
  background-image: repeating-linear-gradient(0deg, rgba(80,60,30,0.06) 0 1px, transparent 1px 3px);
  border: 5px solid var(--stone-dark, #3a342a); border-radius: 4px;
  box-shadow: 0 6px 24px rgba(0,0,0,0.8);
  width: 420px; padding: 8px; font-size: 11px; color: #3a2a10;
}
.gamble-modal h2 { text-align: center; color: #5a2000; font-size: 14px; margin: 0 0 6px 0; }
.gamble-close {
  position: absolute; top: 4px; right: 6px; width: 20px; height: 20px;
  background: #8a2020; color: #fff; border: 1px solid #000; border-radius: 2px;
  cursor: pointer; font-weight: bold; text-align: center; line-height: 18px; font-size: 12px;
}
.gamble-close:hover { background: #a83030; }
.gamble-btn {
  background: linear-gradient(180deg, #7a6a4a, #5a4c32); color: #fff; border: 1px solid #2a2418;
  border-radius: 3px; padding: 4px 10px; cursor: pointer; font-size: 10px; text-shadow: 1px 1px 0 #000;
  font-family: inherit; margin: 2px;
}
.gamble-btn:hover { background: linear-gradient(180deg, #8a7a5a, #6a5c42); }
.gamble-btn:disabled { opacity: 0.5; cursor: default; }
.gamble-btn.gamble-green { background: linear-gradient(180deg, #3a7a3a, #2a5a2a); }
.gamble-btn.gamble-red { background: linear-gradient(180deg, #8a3a3a, #6a2a2a); }
.gamble-row { display: flex; align-items: center; gap: 6px; margin: 6px 0; flex-wrap: wrap; }
.gamble-row label { font-weight: bold; min-width: 50px; }
.gamble-row input {
  background: #efe6cd; border: 1px solid #8a7a5c; border-radius: 2px; padding: 2px 4px;
  font-family: inherit; font-size: 11px; color: #3a2a10; width: 80px;
}
.gamble-status { text-align: center; min-height: 18px; color: #5a2000; font-weight: bold; margin: 6px 0; }
.gamble-coins { text-align: center; color: #6a543a; font-size: 10px; margin-bottom: 4px; }
.gamble-cards { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; min-height: 48px; }
.gamble-card {
  width: 34px; height: 46px; border: 1px solid #2a2418; border-radius: 3px;
  background: #fff; display: flex; align-items: center; justify-content: center;
  font-weight: bold; font-size: 12px; color: #1a1a1a;
}
.gamble-card.red { color: #a02020; }
.gamble-reels { display: flex; gap: 8px; justify-content: center; margin: 10px 0; }
.gamble-reel {
  width: 56px; height: 56px; border: 2px solid #5a2000; border-radius: 4px;
  background: #1a1410; color: #f5d800; font-size: 28px; display: flex;
  align-items: center; justify-content: center;
}
.gamble-wheel {
  width: 120px; height: 120px; border-radius: 50%; margin: 8px auto;
  border: 4px solid #5a2000; display: flex; align-items: center; justify-content: center;
  font-size: 22px; font-weight: bold; color: #fff; background: #2a5a2a;
}
.gamble-wheel.red { background: #8a2020; }
.gamble-wheel.green { background: #2a6a2a; }
.gamble-bets { display: flex; gap: 4px; flex-wrap: wrap; justify-content: center; }
.gamble-bet-chip {
  padding: 4px 8px; border-radius: 12px; cursor: pointer; border: 2px solid #3a2a10;
  font-size: 10px; font-weight: bold;
}
.gamble-bet-chip.sel { border-color: #f5d800; box-shadow: 0 0 6px #f5d800; }
.gamble-bet-chip.red-chip { background: #8a2020; color: #fff; }
.gamble-bet-chip.black-chip { background: #2a2418; color: #fff; }
.gamble-bet-chip.green-chip { background: #2a6a2a; color: #fff; }
.gamble-bet-chip.gold-chip { background: #c8a020; color: #2a1a00; }
.gamble-player-list { max-height: 100px; overflow-y: auto; border: 1px solid #8a7a5c; border-radius: 3px; }
.gamble-player-row {
  display: flex; align-items: center; justify-content: space-between; padding: 3px 6px;
  border-bottom: 1px solid rgba(80,60,30,0.2); cursor: pointer;
}
.gamble-player-row:hover { background: rgba(255,255,255,0.2); }
`;

let layer: HTMLElement | null = null;
let modal: HTMLElement | null = null;

function ensureDom(): HTMLElement {
  if (layer) return layer;
  const st = document.createElement('style');
  st.textContent = STYLE;
  document.head.appendChild(st);
  layer = document.createElement('div');
  layer.id = 'gamble-layer';
  const sibling = document.getElementById('ge-layer') ?? document.getElementById('modal-layer');
  if (sibling?.parentElement) sibling.parentElement.insertBefore(layer, sibling.nextSibling);
  else document.body.appendChild(layer);
  return layer;
}

function openModal(title: string, body: HTMLElement, onClose?: () => void) {
  const el = ensureDom();
  el.style.display = 'block';
  modal = document.createElement('div');
  modal.className = 'gamble-modal';
  modal.style.left = '50%';
  modal.style.top = '50%';
  modal.style.transform = 'translate(-50%, -50%)';
  const close = document.createElement('div');
  close.className = 'gamble-close';
  close.textContent = '×';
  close.onclick = () => closeModal(onClose);
  const h2 = document.createElement('h2');
  h2.textContent = title;
  const coins = document.createElement('div');
  coins.className = 'gamble-coins';
  coins.id = 'gamble-coins';
  coins.textContent = `Coins: ${invCount('coins').toLocaleString()}`;
  modal.appendChild(close);
  modal.appendChild(h2);
  modal.appendChild(coins);
  modal.appendChild(body);
  el.innerHTML = '';
  el.appendChild(modal);
}

function refreshCoins() {
  const el = document.getElementById('gamble-coins');
  if (el) el.textContent = `Coins: ${invCount('coins').toLocaleString()}`;
}

function closeModal(onClose?: () => void) {
  if (layer) { layer.style.display = 'none'; layer.innerHTML = ''; }
  modal = null;
  onClose?.();
}

function betCoins(amount: number): boolean {
  if (!Number.isInteger(amount) || amount < 1) { msg('Enter a valid bet.'); return false; }
  if (invCount('coins') < amount) { msg("You don't have enough coins."); return false; }
  removeItem('coins', amount);
  refreshCoins();
  return true;
}

function payout(amount: number) {
  if (amount > 0) {
    addItem('coins', amount);
    audio.sfx('coins');
    refreshCoins();
  }
}

// ---------------- slot machine ----------------

const SLOT_SYM = ['🍒', '🔔', '▮', '7'] as const;
const SLOT_PAY: Record<string, number> = { '🍒': 2, '🔔': 5, '▮': 10, '7': 25 };

function openSlots() {
  const body = document.createElement('div');
  const reels = document.createElement('div');
  reels.className = 'gamble-reels';
  const reelEls = [0, 1, 2].map(() => {
    const r = document.createElement('div');
    r.className = 'gamble-reel';
    r.textContent = '?';
    reels.appendChild(r);
    return r;
  });
  body.appendChild(reels);
  const status = document.createElement('div');
  status.className = 'gamble-status';
  body.appendChild(status);
  const row = document.createElement('div');
  row.className = 'gamble-row';
  row.innerHTML = '<label>Bet</label>';
  const betIn = document.createElement('input');
  betIn.type = 'number'; betIn.min = '1'; betIn.value = '10';
  row.appendChild(betIn);
  const spin = document.createElement('button');
  spin.className = 'gamble-btn gamble-green';
  spin.textContent = 'Spin';
  let spinning = false;
  spin.onclick = () => {
    if (spinning) return;
    const bet = Math.floor(Number(betIn.value) || 0);
    if (!betCoins(bet)) return;
    spinning = true;
    spin.disabled = true;
    status.textContent = 'Spinning...';
    let ticks = 0;
    const anim = setInterval(() => {
      for (const r of reelEls) r.textContent = SLOT_SYM[Math.floor(Math.random() * SLOT_SYM.length)];
      if (++ticks >= 8) {
        clearInterval(anim);
        const result = SLOT_SYM.map(() => SLOT_SYM[Math.floor(Math.random() * SLOT_SYM.length)]);
        for (let i = 0; i < 3; i++) reelEls[i].textContent = result[i];
        const mult = result[0] === result[1] && result[1] === result[2] ? (SLOT_PAY[result[0]] ?? 0) : 0;
        if (mult > 0) {
          const win = bet * mult;
          payout(win);
          status.textContent = `Jackpot! You win ${win.toLocaleString()} coins (${mult}x).`;
          msg(`The slots pay out ${win.toLocaleString()} coins!`, 'game');
        } else {
          status.textContent = 'No luck this spin.';
          msg('The reels stop cold. Your coins are gone.', 'game');
        }
        spinning = false;
        spin.disabled = false;
      }
    }, 120);
  };
  row.appendChild(spin);
  body.appendChild(row);
  openModal('Lucky Larps — Slots', body);
}

// ---------------- blackjack ----------------

type Card = { rank: string; suit: string; value: number; red: boolean };
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function freshDeck(): Card[] {
  const d: Card[] = [];
  for (const s of SUITS) {
    const red = s === '♥' || s === '♦';
    for (const r of RANKS) {
      let v = parseInt(r, 10);
      if (Number.isNaN(v)) v = r === 'A' ? 11 : 10;
      d.push({ rank: r, suit: s, value: v, red });
    }
  }
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function handValue(cards: Card[]): number {
  let total = cards.reduce((s, c) => s + c.value, 0);
  let aces = cards.filter((c) => c.rank === 'A').length;
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function renderCards(container: HTMLElement, cards: Card[], hideSecond = false) {
  container.innerHTML = '';
  cards.forEach((c, i) => {
    const el = document.createElement('div');
    el.className = 'gamble-card' + (c.red ? ' red' : '');
    el.textContent = hideSecond && i === 1 ? '?' : `${c.rank}${c.suit}`;
    container.appendChild(el);
  });
}

function openBlackjack() {
  let deck = freshDeck();
  let bet = 0;
  let player: Card[] = [];
  let dealer: Card[] = [];
  let phase: 'bet' | 'play' | 'done' = 'bet';

  const body = document.createElement('div');
  const dealerCards = document.createElement('div');
  dealerCards.className = 'gamble-cards';
  const dealerLbl = document.createElement('div');
  dealerLbl.textContent = 'Dealer';
  dealerLbl.style.textAlign = 'center';
  const playerCards = document.createElement('div');
  playerCards.className = 'gamble-cards';
  const playerLbl = document.createElement('div');
  playerLbl.textContent = 'You';
  playerLbl.style.textAlign = 'center';
  const status = document.createElement('div');
  status.className = 'gamble-status';
  body.appendChild(dealerLbl);
  body.appendChild(dealerCards);
  body.appendChild(playerLbl);
  body.appendChild(playerCards);
  body.appendChild(status);

  const betRow = document.createElement('div');
  betRow.className = 'gamble-row';
  betRow.innerHTML = '<label>Bet</label>';
  const betIn = document.createElement('input');
  betIn.type = 'number'; betIn.min = '1'; betIn.value = '25';
  const dealBtn = document.createElement('button');
  dealBtn.className = 'gamble-btn gamble-green';
  dealBtn.textContent = 'Deal';
  betRow.appendChild(betIn);
  betRow.appendChild(dealBtn);

  const playRow = document.createElement('div');
  playRow.className = 'gamble-row';
  playRow.style.display = 'none';
  const hitBtn = document.createElement('button');
  hitBtn.className = 'gamble-btn';
  hitBtn.textContent = 'Hit';
  const standBtn = document.createElement('button');
  standBtn.className = 'gamble-btn gamble-green';
  standBtn.textContent = 'Stand';
  playRow.appendChild(hitBtn);
  playRow.appendChild(standBtn);

  body.appendChild(betRow);
  body.appendChild(playRow);

  function deal() {
    deck = freshDeck();
    player = [deck.pop()!, deck.pop()!];
    dealer = [deck.pop()!, deck.pop()!];
    phase = 'play';
    betRow.style.display = 'none';
    playRow.style.display = 'flex';
    renderCards(playerCards, player);
    renderCards(dealerCards, dealer, true);
    status.textContent = '';
    if (handValue(player) === 21) finishRound(true);
  }

  function finishRound(playerStood = false) {
    phase = 'done';
    playRow.style.display = 'none';
    renderCards(dealerCards, dealer);
    while (handValue(dealer) < 17) dealer.push(deck.pop()!);
    renderCards(dealerCards, dealer);
    const pv = handValue(player);
    const dv = handValue(dealer);
    let win = 0;
    if (pv > 21) {
      status.textContent = `Bust! You lose ${bet.toLocaleString()} coins.`;
      msg('The dealer collects your stake.', 'game');
    } else if (dv > 21 || pv > dv) {
      win = bet * 2;
      payout(win);
      status.textContent = `You win ${win.toLocaleString()} coins! (${pv} vs ${dv})`;
      msg(`Blackjack pays ${win.toLocaleString()} coins.`, 'game');
    } else if (pv === dv) {
      payout(bet);
      status.textContent = `Push — ${bet.toLocaleString()} coins returned.`;
    } else {
      status.textContent = `Dealer wins. (${dv} vs ${pv})`;
      msg('The house takes your bet.', 'game');
    }
    betRow.style.display = 'flex';
    dealBtn.textContent = 'New hand';
    phase = 'bet';
  }

  dealBtn.onclick = () => {
    if (phase !== 'bet') return;
    const b = Math.floor(Number(betIn.value) || 0);
    if (!betCoins(b)) return;
    bet = b;
    dealBtn.textContent = 'Deal';
    deal();
  };
  hitBtn.onclick = () => {
    if (phase !== 'play') return;
    player.push(deck.pop()!);
    renderCards(playerCards, player);
    if (handValue(player) > 21) finishRound();
  };
  standBtn.onclick = () => { if (phase === 'play') finishRound(true); };

  openModal('Blackjack', body);
}

// ---------------- roulette ----------------

const ROULETTE_RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function openRoulette() {
  const body = document.createElement('div');
  const wheel = document.createElement('div');
  wheel.className = 'gamble-wheel';
  wheel.textContent = '?';
  body.appendChild(wheel);
  const status = document.createElement('div');
  status.className = 'gamble-status';
  body.appendChild(status);

  let selectedBet: { kind: string; value?: number } | null = null;
  const bets = document.createElement('div');
  bets.className = 'gamble-bets';

  const mkChip = (label: string, kind: string, cls: string, value?: number) => {
    const c = document.createElement('div');
    c.className = `gamble-bet-chip ${cls}`;
    c.textContent = label;
    c.onclick = () => {
      bets.querySelectorAll('.gamble-bet-chip').forEach((el) => el.classList.remove('sel'));
      c.classList.add('sel');
      selectedBet = { kind, value };
    };
    bets.appendChild(c);
  };
  mkChip('Red', 'red', 'red-chip');
  mkChip('Black', 'black', 'black-chip');
  mkChip('Odd', 'odd', 'gold-chip');
  mkChip('Even', 'even', 'gold-chip');
  mkChip('0', 'number', 'green-chip', 0);
  body.appendChild(bets);

  const numRow = document.createElement('div');
  numRow.className = 'gamble-row';
  numRow.innerHTML = '<label>Number</label>';
  const numIn = document.createElement('input');
  numIn.type = 'number'; numIn.min = '0'; numIn.max = '36'; numIn.value = '7';
  const numBtn = document.createElement('button');
  numBtn.className = 'gamble-btn';
  numBtn.textContent = 'Bet number';
  numBtn.onclick = () => {
    bets.querySelectorAll('.gamble-bet-chip').forEach((el) => el.classList.remove('sel'));
    selectedBet = { kind: 'number', value: Math.max(0, Math.min(36, Math.floor(Number(numIn.value) || 0))) };
    status.textContent = `Betting on ${selectedBet.value}`;
  };
  numRow.appendChild(numIn);
  numRow.appendChild(numBtn);
  body.appendChild(numRow);

  const row = document.createElement('div');
  row.className = 'gamble-row';
  row.innerHTML = '<label>Bet</label>';
  const betIn = document.createElement('input');
  betIn.type = 'number'; betIn.min = '1'; betIn.value = '10';
  const spin = document.createElement('button');
  spin.className = 'gamble-btn gamble-green';
  spin.textContent = 'Spin';
  spin.onclick = () => {
    if (!selectedBet) { status.textContent = 'Pick a bet first.'; return; }
    const b = Math.floor(Number(betIn.value) || 0);
    if (!betCoins(b)) return;
    const result = Math.floor(Math.random() * 37);
    wheel.textContent = String(result);
    wheel.className = 'gamble-wheel' + (result === 0 ? ' green' : ROULETTE_RED.has(result) ? ' red' : '');
    let win = 0;
    const sb = selectedBet;
    if (sb.kind === 'number' && sb.value === result) win = b * 36;
    else if (sb.kind === 'red' && ROULETTE_RED.has(result)) win = b * 2;
    else if (sb.kind === 'black' && result > 0 && !ROULETTE_RED.has(result)) win = b * 2;
    else if (sb.kind === 'odd' && result > 0 && result % 2 === 1) win = b * 2;
    else if (sb.kind === 'even' && result > 0 && result % 2 === 0) win = b * 2;
    if (win > 0) {
      payout(win);
      status.textContent = `Ball lands on ${result}! You win ${win.toLocaleString()} coins.`;
      msg(`Roulette pays ${win.toLocaleString()} coins.`, 'game');
    } else {
      status.textContent = `Ball lands on ${result}. Better luck next spin.`;
      msg('The wheel takes your stake.', 'game');
    }
  };
  row.appendChild(betIn);
  row.appendChild(spin);
  body.appendChild(row);

  openModal('Roulette', body);
}

// ---------------- coinflip (P2P) ----------------

export function openCoinflip(targetName?: string) {
  const body = document.createElement('div');
  const status = document.createElement('div');
  status.className = 'gamble-status';
  body.appendChild(status);

  if (targetName) {
    status.textContent = `Challenge ${targetName} to a coinflip.`;
    const row = document.createElement('div');
    row.className = 'gamble-row';
    row.innerHTML = '<label>Bet</label>';
    const betIn = document.createElement('input');
    betIn.type = 'number'; betIn.min = '1'; betIn.value = '100';
    const send = document.createElement('button');
    send.className = 'gamble-btn gamble-green';
    send.textContent = 'Send challenge';
    send.onclick = async () => {
      const amount = Math.floor(Number(betIn.value) || 0);
      if (amount < 1) { status.textContent = 'Enter a valid bet.'; return; }
      if (invCount('coins') < amount) { status.textContent = "You don't have enough coins."; return; }
      try {
        await net.api('/api/coinflip/offer', { to: targetName, amount });
        status.textContent = `Challenge sent to ${targetName} for ${amount.toLocaleString()} coins.`;
        msg(`You challenged ${targetName} to a ${amount.toLocaleString()}-coin flip.`, 'game');
      } catch (e: any) {
        status.textContent = String(e?.message || 'Challenge failed.');
      }
    };
    row.appendChild(betIn);
    row.appendChild(send);
    body.appendChild(row);
  } else {
    const list = document.createElement('div');
    list.className = 'gamble-player-list';
    const nearby = state.remotePlayers.filter((rp) => {
      const dx = Math.abs(rp.x - state.player.x);
      const dy = Math.abs(rp.y - state.player.y);
      return dx <= 8 && dy <= 8;
    });
    if (nearby.length === 0) {
      status.textContent = 'No players nearby. Right-click a player to challenge them.';
    } else {
      status.textContent = 'Pick a nearby player:';
      for (const rp of nearby) {
        const row = document.createElement('div');
        row.className = 'gamble-player-row';
        row.innerHTML = `<span>${rp.name}</span><span class="gamble-btn" style="padding:2px 6px">Challenge</span>`;
        row.onclick = () => { closeModal(); openCoinflip(rp.name); };
        list.appendChild(row);
      }
    }
    body.appendChild(list);
  }

  openModal('Coinflip', body);
}

// Incoming challenge UI (called from net.ts)
let pendingOffer: { id: string; from: string; amount: number } | null = null;

export function showCoinflipOffer(id: string, from: string, amount: number) {
  pendingOffer = { id, from, amount };
  const body = document.createElement('div');
  const status = document.createElement('div');
  status.className = 'gamble-status';
  status.textContent = `${from} challenges you to a ${amount.toLocaleString()}-coin flip!`;
  body.appendChild(status);
  const row = document.createElement('div');
  row.className = 'gamble-row';
  row.style.justifyContent = 'center';
  const accept = document.createElement('button');
  accept.className = 'gamble-btn gamble-green';
  accept.textContent = 'Accept';
  const decline = document.createElement('button');
  decline.className = 'gamble-btn gamble-red';
  decline.textContent = 'Decline';
  accept.onclick = async () => {
    if (invCount('coins') < amount) { status.textContent = "You don't have enough coins."; return; }
    try {
      await net.api('/api/coinflip/accept', { id });
      closeModal();
    } catch (e: any) {
      status.textContent = String(e?.message || 'Accept failed.');
    }
  };
  decline.onclick = async () => {
    try { await net.api('/api/coinflip/decline', { id }); } catch { /* ignore */ }
    closeModal();
    pendingOffer = null;
  };
  row.appendChild(accept);
  row.appendChild(decline);
  body.appendChild(row);
  openModal('Coinflip Challenge', body);
}

export function handleCoinflipResult(winner: string, loser: string, amount: number, flip: 'heads' | 'tails') {
  closeModal();
  pendingOffer = null;
  const me = net.username;
  if (me === winner) {
    addItem('coins', amount);
    audio.sfx('coins');
    msg(`Coinflip: ${flip}! You win ${amount.toLocaleString()} coins from ${loser}.`, 'game');
  } else if (me === loser) {
    removeItem('coins', amount);
    msg(`Coinflip: ${flip}! You lose ${amount.toLocaleString()} coins to ${winner}.`, 'game');
  }
}

// ---------------- registrations ----------------

registerObjectAction('slot_machine', 'Play', () => { openSlots(); return 'done'; });
registerObjectAction('blackjack_table', 'Play', () => { openBlackjack(); return 'done'; });
registerObjectAction('roulette_table', 'Play', () => { openRoulette(); return 'done'; });
registerObjectAction('coinflip_pedestal', 'Coinflip', () => { openCoinflip(); return 'done'; });

registerNpcAction('casino_dealer', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome to Pip\'s House of Mild Regret. Slots, blackjack, roulette — all fair, all loud.' },
    { speaker: n.def.name, text: 'Want to gamble with another player? Use the coinflip pedestal or right-click them.' },
    { speaker: state.player.name, text: 'Define fair.' },
    { speaker: n.def.name, text: 'The house wins slightly more often. That\'s the definition.' },
  ], () => {
    showOptions([
      { label: 'Why is the casino never closed?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Rest Day law, friend. Five days at midwinter: no contracts signed, no wars declared. The charter says nothing about cards.' },
          { speaker: n.def.name, text: 'I checked the wording myself, in F.S. 731, before I hung the sign. Best read of my life.' },
        ]);
      }},
      { label: 'Is it true about the Aldgate city seal?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'The old lord-mayor wagered it on a pair of nines. I had three twos and better posture.' },
          { speaker: n.def.name, text: 'I returned the seal the next morning — framed. The Concord of Weights has run Aldgate ever since, and they\'ve never once asked me to visit. Can\'t imagine why.' },
        ]);
      }},
      { label: 'Who\'s your biggest customer?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'A dealer never names names. But I will say the Court of the Southern Lawn keeps a very healthy deposit here, and His Banana-ness has an excellent poker face.' },
          { speaker: n.def.name, text: 'It helps that it\'s technically just his face.' },
        ]);
      }},
    ]);
  });
  return 'done';
});

export {};
