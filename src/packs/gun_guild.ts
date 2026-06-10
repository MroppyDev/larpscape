// Aldgate Gun Guild — trainer, shop, and round-loading recipes.
import {
  registerNpcAction, registerItemOnItem,
  startDialogue, showOptions, state, msg,
  openShop, addItem, removeItem, invCount, addXp, level, freeSlots,
} from '../game';
import { ITEMS } from '../defs';
import { audio } from '../audio';

function loadRounds(casing: string, round: string, gunLevel: number, xp: number) {
  registerItemOnItem('gunpowder', casing, () => {
    if (level('Gun') < gunLevel) {
      msg(`You need a Gun level of ${gunLevel} to load ${ITEMS[round].name}s.`);
      return;
    }
    const max = Math.min(Math.floor(invCount('gunpowder')), Math.floor(invCount(casing)));
    if (max <= 0) { msg("You don't have casings and gunpowder to load rounds."); return; }
    const batch = Math.min(max, 15);
    removeItem('gunpowder', batch);
    removeItem(casing, batch);
    addItem(round, batch);
    addXp('Gun', (xp / 15) * batch);
    msg(`You load ${batch} ${ITEMS[round].name}${batch > 1 ? 's' : ''}.`);
    audio.sfx('gun');
  });
}

loadRounds('bronze_bullet_casing', 'bronze_round', 1, 15);
loadRounds('iron_bullet_casing', 'iron_round', 5, 25);
loadRounds('steel_bullet_casing', 'steel_round', 20, 37.5);
loadRounds('mithril_bullet_casing', 'mithril_round', 40, 50);
loadRounds('adamant_bullet_casing', 'adamant_round', 55, 62.5);
loadRounds('rune_bullet_casing', 'rune_round', 60, 75);

registerNpcAction('gun_trainer', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Welcome recruit. Every adventurer starts with a Glock 18 — equip it, load bronze rounds in your ammo slot, and shoot anything that growls back.' },
    { speaker: n.def.name, text: 'Gun is its own skill, trained by dealing damage. Better pistols and rounds need higher Gun levels, just like bows and arrows.' },
    { speaker: n.def.name, text: 'Smith bullet casings at an anvil, buy gunpowder from the guild, then use powder on casings to load ammunition. Master Flint runs the armory next to me.' },
  ]);
  showOptions([
    { label: 'How do I train Gun?', fn: () => {
      msg('Attack creatures with a pistol equipped and rounds in your ammo slot. Every hit grants Gun XP.');
    }},
    { label: 'Where is the guild shop?', fn: () => {
      msg('Talk to Master Flint just west of here, or use Trade on me for guild supplies.');
    }},
  ]);
  return 'done';
});

registerNpcAction('gun_trainer', 'Trade', () => { openShop('gun_guild'); return 'done'; });

registerNpcAction('gun_guild_master', 'Talk-to', (n) => {
  startDialogue([
    { speaker: n.def.name, text: 'Aldgate Gun Guild — member in good standing, or at least in loud standing.' },
    { speaker: n.def.name, text: 'We stock pistols from the humble Glock 18 up to rune sidearms, and every tier of round a marksman could want.' },
    { speaker: state.player.name, text: 'Is there a test?' },
    { speaker: n.def.name, text: 'Only the eternal one: can you hit the broad side of a goblin at six tiles?' },
  ]);
  return 'done';
});

registerNpcAction('gun_guild_master', 'Trade', () => { openShop('gun_guild'); return 'done'; });

export {};
