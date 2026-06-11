// Pack: Market clerk — the Concord of Weights desk on the Aldgate Exchange plaza.
//
// In-game face of the trade site (trade.larpscape.net). One NPC, three options:
//   - 'Talk-to'  — explains the great board / trade site.
//   - 'Collect'  — POST /api/market/collect: moves owed sale proceeds into the
//     player's BANK server-side. The market module bumps the save fence
//     (onSavesMutated), so the client's next debounced save PUT 409s and
//     re-snapshots — no client-side bank mutation here, just chat reporting.
//   - 'Exchange' — opens the existing Aldgate Exchange UI. ge.ts owns that
//     modal and registers it on the 'ge_booth' object type (src/ge.ts bottom);
//     we re-dispatch through the objectActions registry rather than duplicate.
//
// New ids (npc def + spawn) ship in data/_fragments/market.json (integrator
// merges into data/npcs.json / data/spawns.json). Spawn tile (96,28) is open
// PATH adjacent to the ge_booth at (95,28).
//
// Imported for side effects by src/packs/index.ts (integrator wires).

import {
  registerNpcAction, objectActions, msg, startDialogue, state,
  Npc,
} from '../game';
import type { WorldObject } from '../world';
import { net } from '../net';

// ---------------------------------------------------------------------------
// 'Talk-to' — the Concord explains the great board.
// ---------------------------------------------------------------------------
registerNpcAction('market_clerk', 'Talk-to', (n: Npc) => {
  startDialogue([
    { speaker: n.def.name, text: 'Concord of Weights, listings desk. Mind the chalk dust.' },
    { speaker: state.player.name, text: 'What happens to an offer once I place it?' },
    { speaker: n.def.name, text: 'The Concord posts every listing on the great board at trade.larpscape.net — price from your bank, collect your coin here or there.' },
    { speaker: n.def.name, text: 'When something of yours sells, the coin sits in our ledger until you claim it. Say the word — "Collect" — and I count it into your bank on the spot.' },
    { speaker: n.def.name, text: 'And if you would rather haggle the old way, the gilded booths still take offers. I can open the Exchange for you myself; neutrality oath says I cannot bid, but I can certainly watch.' },
  ]);
  return 'done';
});

// ---------------------------------------------------------------------------
// 'Collect' — claim owed market proceeds into the bank (server-authoritative).
// ---------------------------------------------------------------------------
let collecting = false;

registerNpcAction('market_clerk', 'Collect', (n: Npc) => {
  if (!net.online) {
    msg('The Concord ledger is closed (offline mode).');
    return 'done';
  }
  if (collecting) return 'done';
  collecting = true;
  void (async () => {
    try {
      const out = await net.api('/api/market/collect', {});
      const collected: number = out?.collected ?? 0;
      const remaining: number = out?.remaining ?? 0;
      if (collected > 0) {
        msg(`The clerk counts ${collected.toLocaleString()} coins from the Concord ledger into your bank.`);
        if (remaining > 0) {
          msg(`${remaining.toLocaleString()} coins remain owed — your bank coin stack is full.`);
        }
      } else {
        msg(`${n.def.name}: "Nothing owed under your name. The ledger balances, as ever."`);
      }
    } catch (e: any) {
      msg(`The clerk squints at the ledger: ${e?.message ?? 'collect failed'}.`);
    } finally {
      collecting = false;
    }
  })();
  return 'done';
});

// ---------------------------------------------------------------------------
// 'Exchange' — open the existing GE UI via the ge_booth registration (ge.ts).
// ---------------------------------------------------------------------------
registerNpcAction('market_clerk', 'Exchange', (n: Npc) => {
  const entry = objectActions.get('ge_booth')?.find((e) => e.option === 'Exchange');
  if (!entry) {
    msg('The Exchange desk is unstaffed.'); // ge.ts not loaded — should not happen
    return 'done';
  }
  // ge.ts's handler ignores the object; pass a stand-in anchored at the clerk.
  const standIn: WorldObject = { type: 'ge_booth', x: n.x, y: n.y, depletedUntil: 0 };
  return entry.handler(standIn);
});

export {};
