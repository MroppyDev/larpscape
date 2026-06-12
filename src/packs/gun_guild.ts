// Aldgate Gun Guild — trainer, shop, and round-loading recipes.
//
// SERVER-AUTHORITATIVE round loading (docs/CONVERSION-CONTRACT.md): using
// gunpowder on a casing sends the 'load-rounds' intent (server/intent-misc.ts).
// The server owns the tier table (level req + xp + casing→round map), validates
// Gun level + holdings, batches up to 15, and grants the rounds + Gun xp. This
// pack authors nothing — it only requests the intent and reports the echo.
import {
  registerNpcAction, registerItemOnItem,
  startDialogue, showOptions, state, msg,
  openShop, requestIntent,
} from '../game';
import { ITEMS } from '../defs';
import { audio } from '../audio';

// Map each casing to the round it loads (for the chat-log flavour only — the
// server independently resolves the tier + amount it actually grants).
const ROUND_OF: Record<string, string> = {
  bronze_bullet_casing: 'bronze_round',
  iron_bullet_casing: 'iron_round',
  steel_bullet_casing: 'steel_round',
  mithril_bullet_casing: 'mithril_round',
  adamant_bullet_casing: 'adamant_round',
  rune_bullet_casing: 'rune_round',
};

function loadRounds(casing: string) {
  registerItemOnItem('gunpowder', casing, () => {
    void (async () => {
      const echo = await requestIntent('load-rounds', { casing });
      if (!echo.ok) { if (echo.error) msg(echo.error); return; }
      const batch = (echo as unknown as { batch?: number }).batch ?? 0;
      const round = ROUND_OF[casing];
      const name = ITEMS[round]?.name ?? 'round';
      if (batch > 0) {
        msg(`You load ${batch} ${name}${batch > 1 ? 's' : ''}.`);
        audio.sfx('gun');
      }
    })();
  });
}

for (const casing of Object.keys(ROUND_OF)) loadRounds(casing);

registerNpcAction('gun_trainer', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome recruit. Every adventurer starts with a Glock 18 — equip it, load bronze rounds in your ammo slot, and shoot anything that growls back.' },
    { speaker: n.def.name, text: 'Gun is its own skill, trained by dealing damage. Better pistols and rounds need higher Gun levels, just like bows and arrows.' },
    { speaker: n.def.name, text: 'Smith bullet casings at an anvil, buy gunpowder from the guild, then use powder on casings to load ammunition. Master Flint runs the armory next to me.' },
  ], () => {
    showOptions([
      { label: 'How do I train Gun?', fn: () => {
        msg('Attack creatures with a pistol equipped and rounds in your ammo slot. Every hit grants Gun XP.');
      }},
      { label: 'Where is the guild shop?', fn: () => {
        msg('Talk to Master Flint just west of here, or use Trade on me for guild supplies.');
      }},
      { label: 'What exactly is gunpowder?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Milled thunder-shale, out of the Ashen Depths. A splinter of the Offnote\'s own percussion, ground fine. That\'s why a gunshot sounds like the world skipping a beat.' },
          { speaker: n.def.name, text: 'Guild doctrine says the Offnote put thunder in the rock to cause trouble. Firing it at monsters is recycling. Count your rounds, recruit — every casing is accounted for.' },
        ]);
      }},
      { label: 'Why did you leave the city watch?', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Leave is a generous word. I proved — publicly, with a ledger — that the watch armoury was selling powder to Saif the Red Smile.' },
          { speaker: n.def.name, text: 'Lost my commission by lunch. The Guild hired me the same afternoon. The Concord calls that the market correcting itself.' },
        ]);
      }},
    ]);
  });
  return 'done';
});

registerNpcAction('gun_trainer', 'Trade', () => { openShop('gun_guild'); return 'done'; });

registerNpcAction('gun_guild_master', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Aldgate Gun Guild — member in good standing, or at least in loud standing.' },
    { speaker: n.def.name, text: 'We stock pistols from the humble Glock 18 up to rune sidearms, and every tier of round a marksman could want.' },
    { speaker: state.player.name, text: 'Is there a test?' },
    { speaker: n.def.name, text: 'Only the eternal one: can you hit the broad side of a goblin at six tiles?' },
  ], () => {
    showOptions([
      { label: 'Ask about the memorial plaque.', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'Armsmith Hannelore Glock\'s patterns one through seventeen. Every one of them exploded. I swept up the pieces personally — that\'s how you earn a coat with this many pockets.' },
          { speaker: n.def.name, text: 'Pattern eighteen held. F.S. 718, the Guild got its charter, and the Glock 18 became the realm\'s sidearm. We polish the plaque weekly. Humility is good for marksmanship.' },
        ]);
      }},
      { label: 'Ask about the thunder-shale road.', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'All our powder comes up the Depths road through Aldgate. Whoever controls that road controls gunpowder — which is why the Concord wants the warlord\'s fort cleared yesterday.' },
          { speaker: n.def.name, text: 'And the hammering from the deep Depths? Korr the Molten, forging. Brogan has theories. I keep the cellar stocked and the doors thick.' },
        ]);
      }},
      { label: 'Ask about the pamphlets.', fn: () => {
        startDialogue([
          { speaker: n.def.name, text: 'The Stillwater Circle sends us pamphlets. "Stop milling the Offnote." "You cannot recycle a mistake." Strong opinions, excellent penmanship.' },
          { speaker: n.def.name, text: 'Official Guild position: we don\'t read them. Personal position: I read every one. Twice. Don\'t tell the Circle — they\'d only send more.' },
        ]);
      }},
    ]);
  });
  return 'done';
});

registerNpcAction('gun_guild_master', 'Trade', () => { openShop('gun_guild'); return 'done'; });

export {};
