// Core definitions: skills, XP curve, items, NPCs, world objects, and the full
// data catalog for the v2 overhaul (smithing, fletching, crafting, herblore,
// magic, prayer, farming, shops, slayer, construction).
// Mechanics and numbers follow the classic publicly documented formulas;
// all text/art here is original.

export const SKILLS = [
  'Attack', 'Hitpoints', 'Mining',
  'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing',
  'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking',
  'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming',
  'Construction', 'Hunter',
] as const;
export type SkillName = (typeof SKILLS)[number];

// Skills the player can actually train in this build (all of them, as of v2).
export const TRAINABLE = new Set<SkillName>(SKILLS);

// Classic experience table: cumulative XP required for each level 1..99.
export const XP_TABLE: number[] = (() => {
  const t = [0, 0]; // index by level; level 1 = 0 xp
  let points = 0;
  for (let lvl = 1; lvl < 99; lvl++) {
    points += Math.floor(lvl + 300 * Math.pow(2, lvl / 7));
    t.push(Math.floor(points / 4));
  }
  return t;
})();

export function levelForXp(xp: number): number {
  let lvl = 1;
  for (let i = 99; i >= 1; i--) {
    if (xp >= XP_TABLE[i]) { lvl = i; break; }
  }
  return Math.min(99, lvl);
}

// ---------------- Equipment ----------------
export type EquipSlot = 'head' | 'body' | 'legs' | 'weapon' | 'shield' | 'gloves' | 'boots' | 'ammo' | 'neck' | 'ring';

// ---------------- Items ----------------
export interface ItemDef {
  id: string;
  name: string;
  examine: string;
  stackable?: boolean;
  value: number;            // base shop value in coins
  equipSlot?: EquipSlot;
  attBonus?: number;
  strBonus?: number;
  defBonus?: number;
  rangedBonus?: number;
  attackSpeed?: number;     // in ticks, for weapons
  levelReq?: { skill: SkillName; level: number }[];
  edible?: { heals: number };
  buryXp?: number;          // prayer xp when buried
  restoresPrayer?: number;  // prayer points restored when drunk (content wires drinking)
}

export const ITEMS: Record<string, ItemDef> = {};
function item(d: ItemDef) { ITEMS[d.id] = d; }

// --- currency ---
item({ id: 'coins', name: 'Coins', examine: 'Lovely money!', stackable: true, value: 1 });

// --- tools ---
item({ id: 'bronze_axe', name: 'Bronze axe', examine: 'A woodcutter\'s axe. The trees fear it, slowly.', value: 16, equipSlot: 'weapon', attBonus: 2, strBonus: 1, attackSpeed: 5, levelReq: [{ skill: 'Attack', level: 1 }] });
item({ id: 'bronze_pickaxe', name: 'Bronze pickaxe', examine: 'For persuading rocks to part with their ore.', value: 1, equipSlot: 'weapon', attBonus: 2, strBonus: 1, attackSpeed: 5, levelReq: [{ skill: 'Attack', level: 1 }] });
item({ id: 'tinderbox', name: 'Tinderbox', examine: 'A small box of sparks waiting to happen.', value: 1 });
item({ id: 'small_net', name: 'Small fishing net', examine: 'More holes than net, yet somehow it works.', value: 5 });
item({ id: 'knife', name: 'Knife', examine: 'Keen-edged and eager to whittle.', value: 6 });
item({ id: 'hammer', name: 'Hammer', examine: 'For hitting hot metal until it apologises.', value: 1 });
item({ id: 'needle', name: 'Needle', examine: 'Easy to lose, painful to find.', value: 1 });
item({ id: 'thread', name: 'Thread', examine: 'A spool of sturdy thread.', stackable: true, value: 1 });
item({ id: 'shears', name: 'Shears', examine: 'Sheep see these and start jogging.', value: 1 });
item({ id: 'rake', name: 'Rake', examine: 'Weeds tremble before it.', value: 6 });
item({ id: 'seed_dibber', name: 'Seed dibber', examine: 'Pokes a seed-sized hole in the soil.', value: 6 });
item({ id: 'fishing_rod', name: 'Fishing rod', examine: 'A rod, a line, and a great deal of patience.', value: 5 });
item({ id: 'bucket', name: 'Bucket', examine: 'An empty bucket, full of potential.', value: 2 });
item({ id: 'vial_of_water', name: 'Vial of water', examine: 'A glass vial of perfectly ordinary water.', value: 2 });
item({ id: 'bird_snare', name: 'Bird snare', examine: 'A looped trap for small, overconfident birds.', value: 6 });
item({ id: 'fishing_bait', name: 'Fishing bait', examine: 'Wriggly. The fish disagree about whether that\'s appetising.', stackable: true, value: 1 });
item({ id: 'lobster_pot', name: 'Lobster pot', examine: 'A wicker cage. Lobsters check in; they don\'t check out.', value: 20 });
item({ id: 'harpoon', name: 'Harpoon', examine: 'A barbed harpoon for the fish that fight back.', value: 5 });
item({ id: 'chisel', name: 'Chisel', examine: 'For coaxing the sparkle out of rough gems.', value: 1 });

// --- melee weapons ---
item({ id: 'bronze_sword', name: 'Bronze sword', examine: 'A basic but dependable blade.', value: 26, equipSlot: 'weapon', attBonus: 7, strBonus: 6, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 1 }] });
item({ id: 'iron_sword', name: 'Iron sword', examine: 'A solid iron blade with a sensible edge.', value: 91, equipSlot: 'weapon', attBonus: 10, strBonus: 9, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 1 }] });
item({ id: 'steel_sword', name: 'Steel sword', examine: 'Bright steel; the smith was clearly showing off.', value: 325, equipSlot: 'weapon', attBonus: 14, strBonus: 13, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 5 }] });
item({ id: 'bronze_scimitar', name: 'Bronze scimitar', examine: 'A curved blade that favours the swift.', value: 32, equipSlot: 'weapon', attBonus: 7, strBonus: 8, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 1 }] });
item({ id: 'iron_scimitar', name: 'Iron scimitar', examine: 'A curved iron blade with a wicked whisper.', value: 112, equipSlot: 'weapon', attBonus: 10, strBonus: 11, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 1 }] });
item({ id: 'steel_scimitar', name: 'Steel scimitar', examine: 'Curved steel, polished to a smug shine.', value: 400, equipSlot: 'weapon', attBonus: 15, strBonus: 16, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 5 }] });
item({ id: 'mithril_sword', name: 'Mithril sword', examine: 'Featherlight blue steel. The arm barely notices it.', value: 845, equipSlot: 'weapon', attBonus: 20, strBonus: 18, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 20 }] });
item({ id: 'mithril_scimitar', name: 'Mithril scimitar', examine: 'A curved sweep of sky-blue metal.', value: 1040, equipSlot: 'weapon', attBonus: 21, strBonus: 22, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 20 }] });
item({ id: 'adamant_sword', name: 'Adamant sword', examine: 'Deep green metal with a grudge against shields.', value: 2080, equipSlot: 'weapon', attBonus: 28, strBonus: 26, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 30 }] });
item({ id: 'adamant_scimitar', name: 'Adamant scimitar', examine: 'Heavy, green, and very persuasive.', value: 2560, equipSlot: 'weapon', attBonus: 29, strBonus: 31, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 30 }] });
item({ id: 'drake_sword', name: 'Drake sword', examine: 'Still warm from its previous owner. Smells of cinders.', value: 12000, equipSlot: 'weapon', attBonus: 38, strBonus: 41, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 40 }] });
item({ id: 'rune_sword', name: 'Rune sword', examine: 'A blade of storm-grey rune metal. It hums when drawn.', value: 12800, equipSlot: 'weapon', attBonus: 38, strBonus: 39, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 40 }] });
item({ id: 'rune_scimitar', name: 'Rune scimitar', examine: 'The curve every swordhand dreams about.', value: 16000, equipSlot: 'weapon', attBonus: 45, strBonus: 44, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 40 }] });
item({ id: 'rimeglass_blade', name: 'Rimeglass blade', examine: 'A sword of frozen glass that never melts. Maraza\'s grudge, given an edge.', value: 32000, equipSlot: 'weapon', attBonus: 50, strBonus: 49, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 45 }] });

// --- ranged weapons & ammo ---
item({ id: 'shortbow', name: 'Shortbow', examine: 'Short, springy, and surprisingly opinionated.', value: 50, equipSlot: 'weapon', rangedBonus: 8, attackSpeed: 5, levelReq: [{ skill: 'Ranged', level: 1 }] });
item({ id: 'oak_shortbow', name: 'Oak shortbow', examine: 'An oak bow with a satisfying thrum.', value: 100, equipSlot: 'weapon', rangedBonus: 14, attackSpeed: 5, levelReq: [{ skill: 'Ranged', level: 5 }] });
item({ id: 'bronze_arrow', name: 'Bronze arrow', examine: 'A flight of bronze-tipped arrows.', stackable: true, value: 2, equipSlot: 'ammo', rangedBonus: 7, levelReq: [{ skill: 'Ranged', level: 1 }] });
item({ id: 'iron_arrow', name: 'Iron arrow', examine: 'Iron-tipped and ready to argue at range.', stackable: true, value: 4, equipSlot: 'ammo', rangedBonus: 10, levelReq: [{ skill: 'Ranged', level: 1 }] });
item({ id: 'mithril_arrow', name: 'Mithril arrow', examine: 'Blue-tipped arrows that fly like rumours.', stackable: true, value: 16, equipSlot: 'ammo', rangedBonus: 22, levelReq: [{ skill: 'Ranged', level: 20 }] });
item({ id: 'adamant_arrow', name: 'Adamant arrow', examine: 'Green-tipped arrows for serious disagreements.', stackable: true, value: 40, equipSlot: 'ammo', rangedBonus: 31, levelReq: [{ skill: 'Ranged', level: 30 }] });
item({ id: 'rune_arrow', name: 'Rune arrow', examine: 'Storm-grey tips that arrive before the apology.', stackable: true, value: 100, equipSlot: 'ammo', rangedBonus: 49, levelReq: [{ skill: 'Ranged', level: 40 }] });
item({ id: 'maple_shortbow_u', name: 'Maple shortbow (u)', examine: 'A shaped maple stave awaiting a string.', value: 50 });
item({ id: 'maple_shortbow', name: 'Maple shortbow', examine: 'A springy maple bow with an autumn temper.', value: 200, equipSlot: 'weapon', rangedBonus: 29, attackSpeed: 5, levelReq: [{ skill: 'Ranged', level: 30 }] });
item({ id: 'yew_shortbow_u', name: 'Yew shortbow (u)', examine: 'A shaped yew stave. Patience made portable.', value: 120 });
item({ id: 'yew_shortbow', name: 'Yew shortbow', examine: 'A yew bow that takes archery very seriously.', value: 480, equipSlot: 'weapon', rangedBonus: 47, attackSpeed: 5, levelReq: [{ skill: 'Ranged', level: 40 }] });
item({ id: 'magic_shortbow_u', name: 'Magic shortbow (u)', examine: 'A stave of glimmer-grained magic wood. It twitches.', value: 320 });
item({ id: 'magic_shortbow', name: 'Magic shortbow', examine: 'A bow cut from magic wood. The arrows are mostly a formality.', value: 1280, equipSlot: 'weapon', rangedBonus: 69, attackSpeed: 5, levelReq: [{ skill: 'Ranged', level: 50 }] });

// --- armour ---
item({ id: 'wooden_shield', name: 'Wooden shield', examine: 'Splintery, but better than catching blows by hand.', value: 20, equipSlot: 'shield', defBonus: 8, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'bronze_full_helm', name: 'Bronze full helm', examine: 'Keeps the rain and most of the swords off.', value: 44, equipSlot: 'head', defBonus: 6, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'iron_full_helm', name: 'Iron full helm', examine: 'A full iron helm. Slightly echoey inside.', value: 154, equipSlot: 'head', defBonus: 9, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'steel_full_helm', name: 'Steel full helm', examine: 'Heavy, shiny, and excellent at deflecting compliments.', value: 550, equipSlot: 'head', defBonus: 12, levelReq: [{ skill: 'Defence', level: 5 }] });
item({ id: 'bronze_platebody', name: 'Bronze platebody', examine: 'Provides decent protection for the torso.', value: 160, equipSlot: 'body', defBonus: 15, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'iron_platebody', name: 'Iron platebody', examine: 'A breastplate of solid iron plates.', value: 560, equipSlot: 'body', defBonus: 21, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'steel_platebody', name: 'Steel platebody', examine: 'Steel plate. You clank with authority.', value: 2000, equipSlot: 'body', defBonus: 28, levelReq: [{ skill: 'Defence', level: 5 }] });
item({ id: 'bronze_platelegs', name: 'Bronze platelegs', examine: 'Bronze plates for the lower half.', value: 80, equipSlot: 'legs', defBonus: 7, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'iron_platelegs', name: 'Iron platelegs', examine: 'Iron legwear. Walks loudly, carries big defence.', value: 280, equipSlot: 'legs', defBonus: 10, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'steel_platelegs', name: 'Steel platelegs', examine: 'Steel platelegs. Stairs are now a workout.', value: 1000, equipSlot: 'legs', defBonus: 14, levelReq: [{ skill: 'Defence', level: 5 }] });
item({ id: 'bronze_kiteshield', name: 'Bronze kiteshield', examine: 'A kite-shaped shield of beaten bronze.', value: 68, equipSlot: 'shield', defBonus: 9, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'iron_kiteshield', name: 'Iron kiteshield', examine: 'An iron kiteshield. Does not actually fly.', value: 238, equipSlot: 'shield', defBonus: 12, levelReq: [{ skill: 'Defence', level: 1 }] });
item({ id: 'steel_kiteshield', name: 'Steel kiteshield', examine: 'A broad steel shield with a mirror polish.', value: 850, equipSlot: 'shield', defBonus: 17, levelReq: [{ skill: 'Defence', level: 5 }] });
item({ id: 'mithril_full_helm', name: 'Mithril full helm', examine: 'Light as a hat, tough as a tax collector.', value: 1430, equipSlot: 'head', defBonus: 16, levelReq: [{ skill: 'Defence', level: 20 }] });
item({ id: 'mithril_platebody', name: 'Mithril platebody', examine: 'Blue plate that lets you breathe and survive at once.', value: 5200, equipSlot: 'body', defBonus: 38, levelReq: [{ skill: 'Defence', level: 20 }] });
item({ id: 'mithril_platelegs', name: 'Mithril platelegs', examine: 'Mithril legwear. Surprisingly easy on the knees.', value: 2600, equipSlot: 'legs', defBonus: 19, levelReq: [{ skill: 'Defence', level: 20 }] });
item({ id: 'mithril_kiteshield', name: 'Mithril kiteshield', examine: 'A pale-blue kiteshield. Arrows slide off, sulking.', value: 2210, equipSlot: 'shield', defBonus: 23, levelReq: [{ skill: 'Defence', level: 20 }] });
item({ id: 'adamant_full_helm', name: 'Adamant full helm', examine: 'A green helm with a view like an arrow slit.', value: 3520, equipSlot: 'head', defBonus: 22, levelReq: [{ skill: 'Defence', level: 30 }] });
item({ id: 'adamant_platebody', name: 'Adamant platebody', examine: 'Adamant plate. Doorways now require planning.', value: 12800, equipSlot: 'body', defBonus: 52, levelReq: [{ skill: 'Defence', level: 30 }] });
item({ id: 'adamant_platelegs', name: 'Adamant platelegs', examine: 'Green plate for the legs. Heavy, but so is regret.', value: 6400, equipSlot: 'legs', defBonus: 26, levelReq: [{ skill: 'Defence', level: 30 }] });
item({ id: 'adamant_kiteshield', name: 'Adamant kiteshield', examine: 'A broad green shield you could serve dinner on.', value: 5440, equipSlot: 'shield', defBonus: 32, levelReq: [{ skill: 'Defence', level: 30 }] });
item({ id: 'rune_full_helm', name: 'Rune full helm', examine: 'Storm-grey steel. Thoughts echo grandly inside.', value: 21120, equipSlot: 'head', defBonus: 30, levelReq: [{ skill: 'Defence', level: 40 }] });
item({ id: 'rune_platebody', name: 'Rune platebody', examine: 'Rune plate. Arrows file formal complaints.', value: 39000, equipSlot: 'body', defBonus: 70, levelReq: [{ skill: 'Defence', level: 40 }] });
item({ id: 'rune_platelegs', name: 'Rune platelegs', examine: 'Rune legwear. Each step sounds expensive.', value: 25600, equipSlot: 'legs', defBonus: 35, levelReq: [{ skill: 'Defence', level: 40 }] });
item({ id: 'rune_kiteshield', name: 'Rune kiteshield', examine: 'A storm-grey wall with a handle.', value: 32640, equipSlot: 'shield', defBonus: 44, levelReq: [{ skill: 'Defence', level: 40 }] });
item({ id: 'warlord_helm', name: 'Warlord helm', examine: 'A horned goblin warhelm. Smells of victory and cabbage.', value: 2400, equipSlot: 'head', defBonus: 14, strBonus: 2, levelReq: [{ skill: 'Defence', level: 10 }] });
item({ id: 'molten_gauntlets', name: 'Molten gauntlets', examine: 'Gauntlets quenched in Korr\'s own forge-blood. Always warm.', value: 9000, equipSlot: 'gloves', defBonus: 8, strBonus: 4, levelReq: [{ skill: 'Defence', level: 40 }] });
item({ id: 'red_sash', name: 'Red sash', examine: 'Saif\'s silk sash. The smile is implied.', value: 3000, equipSlot: 'neck', attBonus: 2, strBonus: 2 });
item({ id: 'leather_body', name: 'Leather body', examine: 'Supple leather armour. Smells faintly of cow.', value: 21, equipSlot: 'body', defBonus: 4 });
item({ id: 'leather_gloves', name: 'Leather gloves', examine: 'Keeps the blisters at bay.', value: 6, equipSlot: 'gloves', defBonus: 1 });
item({ id: 'leather_boots', name: 'Leather boots', examine: 'Comfortable boots for the long road.', value: 6, equipSlot: 'boots', defBonus: 1 });

// --- jewelry & gems ---
item({ id: 'gold_ring', name: 'Gold ring', examine: 'A plain gold band. Sentimental value sold separately.', value: 350, equipSlot: 'ring' });
item({ id: 'sapphire_ring', name: 'Sapphire ring', examine: 'A gold ring set with a sea-blue sapphire.', value: 900, equipSlot: 'ring', defBonus: 1 });
item({ id: 'ruby_ring', name: 'Ruby ring', examine: 'A gold ring with a ruby like a drop of dawn.', value: 2050, equipSlot: 'ring', strBonus: 1 });
item({ id: 'gold_amulet', name: 'Gold amulet', examine: 'A gold amulet on a sturdy chain.', value: 350, equipSlot: 'neck' });
item({ id: 'sapphire_amulet', name: 'Sapphire amulet', examine: 'The sapphire catches the light; the light keeps it.', value: 900, equipSlot: 'neck', attBonus: 2, defBonus: 1 });
item({ id: 'ruby_amulet', name: 'Ruby amulet', examine: 'A ruby amulet that pulses faintly with borrowed courage.', value: 2050, equipSlot: 'neck', strBonus: 4 });
item({ id: 'uncut_sapphire', name: 'Uncut sapphire', examine: 'A rough blue stone with a fortune hiding inside.', value: 25 });
item({ id: 'uncut_emerald', name: 'Uncut emerald', examine: 'A lumpy green stone, sparkle pending.', value: 50 });
item({ id: 'uncut_ruby', name: 'Uncut ruby', examine: 'A rough red stone that glows like banked coals.', value: 100 });
item({ id: 'sapphire', name: 'Sapphire', examine: 'A cut sapphire, blue as deep water.', value: 250 });
item({ id: 'emerald', name: 'Emerald', examine: 'A cut emerald, green as fresh envy.', value: 500 });
item({ id: 'ruby', name: 'Ruby', examine: 'A cut ruby. It does most of the talking.', value: 1000 });

// --- resources & materials ---
item({ id: 'logs', name: 'Logs', examine: 'A number of wooden logs.', value: 4 });
item({ id: 'oak_logs', name: 'Oak logs', examine: 'Logs cut from an oak tree.', value: 20 });
item({ id: 'willow_logs', name: 'Willow logs', examine: 'Logs cut from a weeping willow.', value: 40 });
item({ id: 'maple_logs', name: 'Maple logs', examine: 'Logs cut from a maple. Faintly sweet-smelling.', value: 80 });
item({ id: 'yew_logs', name: 'Yew logs', examine: 'Logs from an ancient yew. Centuries, by the cord.', value: 160 });
item({ id: 'magic_logs', name: 'Magic logs', examine: 'Logs that shimmer when nobody is looking directly at them.', value: 320 });
item({ id: 'copper_ore', name: 'Copper ore', examine: 'A lump of copper ore, awaiting the furnace.', value: 3 });
item({ id: 'tin_ore', name: 'Tin ore', examine: 'A lump of tin ore. Half of a bronze bar, really.', value: 3 });
item({ id: 'iron_ore', name: 'Iron ore', examine: 'A heavy lump of iron ore.', value: 17 });
item({ id: 'coal', name: 'Coal', examine: 'A chunk of coal. The furnace\'s favourite snack.', value: 45 });
item({ id: 'mithril_ore', name: 'Mithril ore', examine: 'A blue-sheened lump of ore. Lighter than it looks.', value: 162 });
item({ id: 'adamantite_ore', name: 'Adamantite ore', examine: 'A dense green ore that dents pickaxes for fun.', value: 400 });
item({ id: 'gold_ore', name: 'Gold ore', examine: 'A lump of ore with an unmistakable gleam.', value: 150 });
item({ id: 'runite_ore', name: 'Runite ore', examine: 'Storm-grey ore. Pickaxes speak of it in whispers.', value: 3200 });
item({ id: 'rune_essence', name: 'Rune essence', examine: 'A pale stone humming with unspent magic.', value: 4 });
item({ id: 'bronze_bar', name: 'Bronze bar', examine: 'A bar of bronze, ready for the anvil.', value: 8 });
item({ id: 'iron_bar', name: 'Iron bar', examine: 'A bar of iron, hard-won from stubborn ore.', value: 28 });
item({ id: 'steel_bar', name: 'Steel bar', examine: 'A bar of fine steel. Coal makes all the difference.', value: 60 });
item({ id: 'mithril_bar', name: 'Mithril bar', examine: 'A bar of sky-blue metal, humming faintly with promise.', value: 300 });
item({ id: 'adamantite_bar', name: 'Adamantite bar', examine: 'A bar of adamantite. The anvil braces itself.', value: 640 });
item({ id: 'gold_bar', name: 'Gold bar', examine: 'A bar of solid gold. Heavier than it looks, lighter than it leaves.', value: 300 });
item({ id: 'rune_bar', name: 'Rune bar', examine: 'A bar of rune metal. The pinnacle of the furnace\'s art.', value: 3700 });
item({ id: 'air_rune', name: 'Air rune', examine: 'A rune stone carrying the breath of the sky.', stackable: true, value: 4 });
item({ id: 'mind_rune', name: 'Mind rune', examine: 'A rune stone holding a single sharp thought.', stackable: true, value: 3 });
item({ id: 'water_rune', name: 'Water rune', examine: 'A rune stone with a tide trapped inside.', stackable: true, value: 4 });
item({ id: 'earth_rune', name: 'Earth rune', examine: 'A rune stone with the patience of mountains.', stackable: true, value: 4 });
item({ id: 'fire_rune', name: 'Fire rune', examine: 'A rune stone warm to the touch.', stackable: true, value: 4 });
item({ id: 'chaos_rune', name: 'Chaos rune', examine: 'A rune stone that can\'t quite make up its mind. Violently.', stackable: true, value: 90 });
item({ id: 'arrow_shaft', name: 'Arrow shaft', examine: 'A straight wooden shaft, two-thirds of an arrow.', stackable: true, value: 1 });
item({ id: 'headless_arrow', name: 'Headless arrow', examine: 'Flighted shafts in need of a point.', stackable: true, value: 1 });
item({ id: 'bronze_arrowtips', name: 'Bronze arrowtips', examine: 'Small pointed caps of bronze.', stackable: true, value: 1 });
item({ id: 'rune_arrowtips', name: 'Rune arrowtips', examine: 'Small pointed caps of rune metal. Handle respectfully.', stackable: true, value: 50 });
item({ id: 'iron_arrowtips', name: 'Iron arrowtips', examine: 'Small pointed caps of iron.', stackable: true, value: 2 });
item({ id: 'mithril_arrowtips', name: 'Mithril arrowtips', examine: 'Small pointed caps of pale-blue mithril.', stackable: true, value: 8 });
item({ id: 'adamant_arrowtips', name: 'Adamant arrowtips', examine: 'Small pointed caps of green adamantite.', stackable: true, value: 20 });
item({ id: 'shortbow_u', name: 'Shortbow (u)', examine: 'A shaped bow stave. Needs a string.', value: 23 });
item({ id: 'flax', name: 'Flax', examine: 'A bundle of flax stems with pretty blue flowers.', value: 3 });
item({ id: 'bowstring', name: 'Bowstring', examine: 'Spun flax, strong enough to fling arrows.', value: 30 });
item({ id: 'wool', name: 'Wool', examine: 'Freshly sheared and faintly indignant.', value: 1 });
item({ id: 'ball_of_wool', name: 'Ball of wool', examine: 'Wool, but rounder and more useful.', value: 3 });
item({ id: 'cowhide', name: 'Cowhide', examine: 'The tanner could make something of this.', value: 1 });
item({ id: 'leather', name: 'Leather', examine: 'Tanned hide, soft and workable.', value: 1 });
item({ id: 'plank', name: 'Plank', examine: 'A sawn plank. Flat-pack furniture awaits.', value: 30 });
item({ id: 'nails', name: 'Nails', examine: 'A handful of nails. Mind your thumbs.', stackable: true, value: 2 });
item({ id: 'eye_of_newt', name: 'Eye of newt', examine: 'The newt insists it has a spare.', value: 3 });
item({ id: 'feather', name: 'Feather', examine: 'Light, fluffy, and aerodynamically gifted.', stackable: true, value: 2 });
item({ id: 'bones', name: 'Bones', examine: 'Bones are for burying!', value: 1, buryXp: 4.5 });
item({ id: 'big_bones', name: 'Big bones', examine: 'Bones, but more so.', value: 1, buryXp: 15 });

// --- boss & quest items ---
item({ id: 'drake_scale', name: 'Drake scale', examine: 'A scale the size of a dinner plate, still faintly smoking.', value: 1500 });
item({ id: 'horror_hide', name: 'Horror hide', examine: 'A slab of mossy, rubbery hide. It squelches when poked.', value: 350 });
item({ id: 'warlord_banner', name: 'Warlord\'s banner', examine: 'A crude goblin war-flag. The spelling is optimistic.', value: 120 });
item({ id: 'bog_heart', name: 'Bog heart', examine: 'A fist-sized knot of peat and root. It beats, slowly.', value: 200 });
item({ id: 'ember_crystal', name: 'Ember crystal', examine: 'A crystal with a live coal trapped inside, forever burning.', value: 800 });
item({ id: 'molten_core', name: 'Molten core', examine: 'The still-beating heart of Korr\'s forge. Do not pocket near parchment.', value: 1500 });

// --- Phase 7 items ---
item({ id: 'bear_fur', name: 'Bear fur', examine: 'A thick, warm pelt. The bear drove a hard bargain.', value: 40 });
item({ id: 'spider_silk', name: 'Spider silk', examine: 'A skein of pale silk, stronger than it has any right to be.', value: 45 });
item({ id: 'grave_dust', name: 'Grave dust', examine: 'A pinch of grey dust that settles slower than it should. Herbalists pay for the strangest things.', value: 35 });
item({ id: 'boarding_cutlass', name: 'Boarding cutlass', examine: 'A broad, salt-pitted blade made for short arguments on narrow decks.', value: 6400, equipSlot: 'weapon', attBonus: 25, strBonus: 27, attackSpeed: 4, levelReq: [{ skill: 'Attack', level: 30 }] });
item({ id: 'wreck_chart', name: 'Wreck chart', examine: 'A salt-stained chart of the cove\'s shoals, with one wreck circled twice.', value: 1 });
item({ id: 'elder_charm', name: 'Elder charm', examine: 'A carved wooden charm on a cord, warm with an old village blessing.', value: 1800, equipSlot: 'neck', attBonus: 2, defBonus: 2 });

// --- herblore ---
item({ id: 'grimy_guam', name: 'Grimy guam leaf', examine: 'A herb in dire need of a wash.', value: 3 });
item({ id: 'guam_leaf', name: 'Guam leaf', examine: 'A clean, fresh guam leaf.', value: 5 });
item({ id: 'grimy_marrentill', name: 'Grimy marrentill', examine: 'A muddy herb of modest promise.', value: 5 });
item({ id: 'marrentill', name: 'Marrentill', examine: 'A clean marrentill herb.', value: 8 });
item({ id: 'attack_potion', name: 'Attack potion', examine: 'Tastes terrible, swings better.', value: 12 });
item({ id: 'defence_potion', name: 'Defence potion', examine: 'Thickens the skin and the resolve.', value: 18 });
item({ id: 'grimy_ranarr', name: 'Grimy ranarr weed', examine: 'A muddy herb that healers would tut over.', value: 25 });
item({ id: 'ranarr_weed', name: 'Ranarr weed', examine: 'A clean ranarr weed, prized by the prayerful.', value: 40 });
item({ id: 'grimy_irit', name: 'Grimy irit leaf', examine: 'A grubby leaf with a sharp, promising smell.', value: 15 });
item({ id: 'irit_leaf', name: 'Irit leaf', examine: 'A clean irit leaf. Bitter, but in a useful way.', value: 25 });
item({ id: 'prayer_potion', name: 'Prayer potion', examine: 'Tastes like cold chapel air. The soul perks up.', value: 120, restoresPrayer: 25 });
item({ id: 'super_attack', name: 'Super attack potion', examine: 'The regular attack potion\'s ambitious cousin.', value: 90 });

// --- food & farming ---
item({ id: 'raw_shrimps', name: 'Raw shrimps', examine: 'I should try cooking this.', value: 2 });
item({ id: 'shrimps', name: 'Shrimps', examine: 'Some nicely cooked shrimps.', value: 5, edible: { heals: 3 } });
item({ id: 'raw_anchovies', name: 'Raw anchovies', examine: 'I should try cooking this.', value: 4 });
item({ id: 'anchovies', name: 'Anchovies', examine: 'Some nicely cooked anchovies.', value: 15, edible: { heals: 1 } });
item({ id: 'raw_sardine', name: 'Raw sardine', examine: 'A slippery little fish, best cooked.', value: 5 });
item({ id: 'sardine', name: 'Sardine', examine: 'A modest but honest meal.', value: 10, edible: { heals: 4 } });
item({ id: 'raw_herring', name: 'Raw herring', examine: 'A silvery fish in need of a fire.', value: 8 });
item({ id: 'herring', name: 'Herring', examine: 'A nicely cooked herring.', value: 15, edible: { heals: 5 } });
item({ id: 'raw_lobster', name: 'Raw lobster', examine: 'A lobster, still glaring. Cooking is advised.', value: 100 });
item({ id: 'lobster', name: 'Lobster', examine: 'A cooked lobster. Fancy eating for a fancy adventurer.', value: 150, edible: { heals: 12 } });
item({ id: 'raw_swordfish', name: 'Raw swordfish', examine: 'A fish armed better than some guards.', value: 160 });
item({ id: 'swordfish', name: 'Swordfish', examine: 'A cooked swordfish. The sword is decorative now.', value: 240, edible: { heals: 14 } });
item({ id: 'raw_shark', name: 'Raw shark', examine: 'It took the harpoon personally.', value: 300 });
item({ id: 'shark', name: 'Shark', examine: 'A cooked shark. Revenge, served hot.', value: 450, edible: { heals: 20 } });
item({ id: 'burnt_fish', name: 'Burnt fish', examine: 'Oops!', value: 1 });
item({ id: 'raw_beef', name: 'Raw beef', examine: 'I need to cook this first.', value: 1 });
item({ id: 'cooked_meat', name: 'Cooked meat', examine: 'Mmm, this looks tasty.', value: 4, edible: { heals: 3 } });
item({ id: 'raw_chicken', name: 'Raw chicken', examine: 'I need to cook this first.', value: 1 });
item({ id: 'cooked_chicken', name: 'Cooked chicken', examine: 'Mmm, this looks tasty.', value: 4, edible: { heals: 3 } });
item({ id: 'raw_bird_meat', name: 'Raw bird meat', examine: 'A small bird, plucked and ready for the spit.', value: 2 });
item({ id: 'roast_bird_meat', name: 'Roast bird meat', examine: 'Crispy roast bird on a stick.', value: 6, edible: { heals: 4 } });
item({ id: 'burnt_meat', name: 'Burnt meat', examine: 'Oh dear.', value: 1 });
item({ id: 'bread', name: 'Bread', examine: 'Nice crispy bread.', value: 12, edible: { heals: 5 } });
item({ id: 'potato_seed', name: 'Potato seed', examine: 'A seed potato with grand ambitions.', stackable: true, value: 1 });
item({ id: 'cabbage_seed', name: 'Cabbage seed', examine: 'It dreams of being a cabbage one day.', stackable: true, value: 1 });
item({ id: 'potato', name: 'Potato', examine: 'An honest, mud-flavoured vegetable.', value: 1, edible: { heals: 1 } });
item({ id: 'cabbage', name: 'Cabbage', examine: 'Notoriously good for you.', value: 1, edible: { heals: 1 } });
item({ id: 'sweetcorn_seed', name: 'Sweetcorn seed', examine: 'A kernel with big golden plans.', stackable: true, value: 6 });
item({ id: 'watermelon_seed', name: 'Watermelon seed', examine: 'Small seed, enormous ambitions.', stackable: true, value: 25 });
item({ id: 'sweetcorn', name: 'Sweetcorn', examine: 'A golden cob of sweetcorn.', value: 8, edible: { heals: 3 } });
item({ id: 'watermelon', name: 'Watermelon', examine: 'Mostly water, entirely melon.', value: 30, edible: { heals: 6 } });
item({ id: 'egg', name: 'Egg', examine: 'A fresh egg. Handle with care.', value: 4 });
item({ id: 'bucket_of_milk', name: 'Bucket of milk', examine: 'Fresh milk, courtesy of a patient cow.', value: 6 });
item({ id: 'cake', name: 'Cake', examine: 'A proper celebration in pastry form.', value: 50, edible: { heals: 12 } });

// ---------------- Cooking ----------------
export interface CookDef { raw: string; cooked: string; burnt: string; level: number; xp: number; stopBurn: number; }
export const COOKABLES: CookDef[] = [
  { raw: 'raw_shrimps', cooked: 'shrimps', burnt: 'burnt_fish', level: 1, xp: 30, stopBurn: 34 },
  { raw: 'raw_anchovies', cooked: 'anchovies', burnt: 'burnt_fish', level: 1, xp: 30, stopBurn: 34 },
  { raw: 'raw_sardine', cooked: 'sardine', burnt: 'burnt_fish', level: 1, xp: 40, stopBurn: 38 },
  { raw: 'raw_herring', cooked: 'herring', burnt: 'burnt_fish', level: 5, xp: 50, stopBurn: 41 },
  { raw: 'raw_beef', cooked: 'cooked_meat', burnt: 'burnt_meat', level: 1, xp: 30, stopBurn: 31 },
  { raw: 'raw_chicken', cooked: 'cooked_chicken', burnt: 'burnt_meat', level: 1, xp: 30, stopBurn: 31 },
  { raw: 'raw_bird_meat', cooked: 'roast_bird_meat', burnt: 'burnt_meat', level: 1, xp: 30, stopBurn: 30 },
  { raw: 'raw_lobster', cooked: 'lobster', burnt: 'burnt_fish', level: 40, xp: 120, stopBurn: 74 },
  { raw: 'raw_swordfish', cooked: 'swordfish', burnt: 'burnt_fish', level: 45, xp: 140, stopBurn: 86 },
  { raw: 'raw_shark', cooked: 'shark', burnt: 'burnt_fish', level: 80, xp: 210, stopBurn: 94 },
];

// ---------------- NPCs ----------------
export interface NpcDef {
  id: string;
  name: string;
  examine: string;
  combatLevel: number;
  hitpoints: number;
  attack: number; strength: number; defence: number;
  attackSpeed: number;        // in ticks
  aggressive?: boolean;
  boss?: boolean;             // render shows a big top-of-screen HP bar
  pickpocket?: { level: number; xp: number; loot: { item: string; qty: [number, number] }[]; stunDmg: number };
  option?: string;            // extra context-menu verb, e.g. 'Shear'
  respawnTicks: number;
  drops: { item: string; qty: [number, number]; chance: number }[]; // chance 0..1
  color: string;              // sprite tint
  size: number;               // render scale
  attackable: boolean;
}

export const NPCS: Record<string, NpcDef> = {};
function npc(d: NpcDef) { NPCS[d.id] = d; }

npc({
  id: 'man', name: 'Man', examine: 'One of the many citizens of the realm.',
  combatLevel: 2, hitpoints: 7, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 25, color: '#b08868', size: 1, attackable: true,
  pickpocket: { level: 1, xp: 8, loot: [{ item: 'coins', qty: [3, 3] }], stunDmg: 1 },
  drops: [{ item: 'bones', qty: [1, 1], chance: 1 }, { item: 'coins', qty: [3, 25], chance: 0.6 }],
});
npc({
  id: 'goblin', name: 'Goblin', examine: 'An ugly green creature.',
  combatLevel: 2, hitpoints: 5, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  aggressive: true, respawnTicks: 20, color: '#5a8a3a', size: 0.9, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [1, 16], chance: 0.5 },
    { item: 'bronze_sword', qty: [1, 1], chance: 0.04 },
  ],
});
npc({
  id: 'chicken', name: 'Chicken', examine: 'Yep, definitely a chicken.',
  combatLevel: 1, hitpoints: 3, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 15, color: '#e8e0d0', size: 0.6, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'raw_chicken', qty: [1, 1], chance: 1 },
    { item: 'feather', qty: [5, 15], chance: 0.75 },
    { item: 'egg', qty: [1, 1], chance: 0.1 },
  ],
});
npc({
  id: 'cow', name: 'Cow', examine: 'Converts grass into beef.',
  combatLevel: 2, hitpoints: 8, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 25, color: '#d8d0c0', size: 1.15, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'cowhide', qty: [1, 1], chance: 1 },
    { item: 'raw_beef', qty: [1, 1], chance: 1 },
  ],
});
npc({
  id: 'giant_rat', name: 'Giant rat', examine: 'Overgrown vermin.',
  combatLevel: 3, hitpoints: 5, attack: 2, strength: 3, defence: 2, attackSpeed: 4,
  aggressive: true, respawnTicks: 20, color: '#7a6a5a', size: 0.8, attackable: true,
  drops: [{ item: 'bones', qty: [1, 1], chance: 1 }, { item: 'raw_beef', qty: [1, 1], chance: 0.5 }],
});
npc({
  id: 'shopkeeper', name: 'Shop keeper', examine: 'He can sell you adventuring supplies.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#8888c0', size: 1, attackable: false, drops: [],
});
npc({
  id: 'banker', name: 'Banker', examine: 'He looks after your money.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#404060', size: 1, attackable: false, drops: [],
});
npc({
  id: 'sheep', name: 'Sheep', examine: 'A walking jumper that hasn\'t been knitted yet.',
  combatLevel: 0, hitpoints: 5, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  option: 'Shear', respawnTicks: 30, color: '#ece8e0', size: 0.9, attackable: false, drops: [],
});
npc({
  id: 'tanner', name: 'Tanner', examine: 'Turns cowhides into leather, for a modest fee.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#a07040', size: 1, attackable: false, drops: [],
});
npc({
  id: 'slayer_master', name: 'Brogan', examine: 'A gruff slayer master with a list of grudges.',
  combatLevel: 0, hitpoints: 30, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#704848', size: 1.05, attackable: false, drops: [],
});
npc({
  id: 'magic_tutor', name: 'Mira the Magic Tutor', examine: 'Her sleeves smell faintly of ozone.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#6060b0', size: 1, attackable: false, drops: [],
});
npc({
  id: 'gardener', name: 'Old Fen', examine: 'Knows every weed in the realm by first name.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#688048', size: 1, attackable: false, drops: [],
});
npc({
  id: 'cook', name: 'Cook Edda', examine: 'Runs the castle kitchen with an iron ladle.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#c0c0c8', size: 1, attackable: false, drops: [],
});
npc({
  id: 'carpenter', name: 'Carpenter Lenny', examine: 'Measures twice, saws once, sweeps never.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#90683c', size: 1, attackable: false, drops: [],
});

npc({
  id: 'goblin_warlord', name: 'Goblin warlord', examine: 'The biggest, meanest goblin in the fort. The banner is load-bearing.',
  combatLevel: 28, hitpoints: 60, attack: 24, strength: 26, defence: 22, attackSpeed: 4,
  aggressive: true, boss: true, respawnTicks: 200, color: '#3f6f2a', size: 1.6, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'warlord_banner', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [40, 220], chance: 1 },
    { item: 'warlord_helm', qty: [1, 1], chance: 0.1 },
    { item: 'mithril_sword', qty: [1, 1], chance: 0.03 },
    { item: 'mithril_ore', qty: [1, 2], chance: 0.08 },
    { item: 'steel_scimitar', qty: [1, 1], chance: 0.06 },
  ],
});
npc({
  id: 'bog_horror', name: 'Bog horror', examine: 'A heap of swamp that decided to hold grudges.',
  combatLevel: 45, hitpoints: 90, attack: 38, strength: 42, defence: 36, attackSpeed: 5,
  aggressive: true, boss: true, respawnTicks: 250, color: '#465a36', size: 1.8, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'horror_hide', qty: [1, 1], chance: 1 },
    { item: 'bog_heart', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [60, 300], chance: 0.8 },
    { item: 'grimy_guam', qty: [1, 3], chance: 0.5 },
    { item: 'grimy_marrentill', qty: [1, 2], chance: 0.35 },
    { item: 'potato_seed', qty: [2, 6], chance: 0.3 },
    { item: 'cabbage_seed', qty: [2, 6], chance: 0.3 },
  ],
});
npc({
  id: 'shadow_drake', name: 'Shadow drake', examine: 'A cave-dwelling drake the colour of a bad night.',
  combatLevel: 70, hitpoints: 150, attack: 60, strength: 64, defence: 58, attackSpeed: 4,
  aggressive: true, boss: true, respawnTicks: 300, color: '#3a3050', size: 2.2, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'drake_scale', qty: [1, 1], chance: 1 },
    { item: 'ember_crystal', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [120, 600], chance: 1 },
    { item: 'drake_sword', qty: [1, 1], chance: 0.05 },
    { item: 'adamantite_ore', qty: [1, 2], chance: 0.1 },
    { item: 'mithril_bar', qty: [1, 2], chance: 0.12 },
  ],
});
npc({
  id: 'city_guard', name: 'City guard', examine: 'Keeps the peace in Aldgate, mostly by leaning on things.',
  combatLevel: 21, hitpoints: 22, attack: 18, strength: 17, defence: 16, attackSpeed: 5,
  respawnTicks: 50, color: '#8090a8', size: 1.05, attackable: true,
  pickpocket: { level: 40, xp: 46.8, loot: [{ item: 'coins', qty: [30, 30] }], stunDmg: 2 },
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [5, 45], chance: 0.7 },
    { item: 'bread', qty: [1, 1], chance: 0.15 },
    { item: 'iron_sword', qty: [1, 1], chance: 0.04 },
  ],
});
npc({
  id: 'ge_clerk', name: 'Exchange clerk', examine: 'Buys low, sells high, blinks rarely.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  option: 'Exchange', respawnTicks: 50, color: '#b89c50', size: 1, attackable: false, drops: [],
});
npc({
  id: 'innkeeper', name: 'Innkeeper', examine: 'Polishes the same tankard all day. It gleams.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#9a5a40', size: 1, attackable: false, drops: [],
});

// --- Phase 6 monsters ---
npc({
  id: 'ice_troll', name: 'Ice troll', examine: 'A boulder with opinions and frostbite.',
  combatLevel: 28, hitpoints: 45, attack: 24, strength: 26, defence: 24, attackSpeed: 5,
  respawnTicks: 40, color: '#9ab8c8', size: 1.4, attackable: true,
  drops: [
    { item: 'big_bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [10, 80], chance: 0.6 },
    { item: 'iron_ore', qty: [1, 2], chance: 0.2 },
    { item: 'coal', qty: [1, 2], chance: 0.12 },
    { item: 'uncut_sapphire', qty: [1, 1], chance: 0.03 },
  ],
});
npc({
  id: 'ice_wolf', name: 'Ice wolf', examine: 'A wolf the colour of a hard winter.',
  combatLevel: 38, hitpoints: 60, attack: 34, strength: 35, defence: 32, attackSpeed: 4,
  respawnTicks: 45, color: '#c8d8e4', size: 1.2, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'raw_beef', qty: [1, 1], chance: 0.4 },
  ],
});
npc({
  id: 'scorpion', name: 'Scorpion', examine: 'All armour, attitude, and arithmetic of stings.',
  combatLevel: 14, hitpoints: 20, attack: 12, strength: 13, defence: 11, attackSpeed: 4,
  aggressive: true, respawnTicks: 25, color: '#b07838', size: 0.9, attackable: true,
  drops: [],
});
npc({
  id: 'desert_bandit', name: 'Desert bandit', examine: 'Travels light: a blade, a grin, and your purse.',
  combatLevel: 26, hitpoints: 40, attack: 23, strength: 24, defence: 21, attackSpeed: 4,
  respawnTicks: 35, color: '#a8845c', size: 1, attackable: true,
  pickpocket: {
    level: 35, xp: 65.8, stunDmg: 3,
    loot: [
      { item: 'coins', qty: [20, 50] },
      { item: 'uncut_sapphire', qty: [1, 1] },
    ],
  },
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [10, 60], chance: 0.7 },
    { item: 'uncut_sapphire', qty: [1, 1], chance: 0.04 },
    { item: 'uncut_emerald', qty: [1, 1], chance: 0.02 },
  ],
});
npc({
  id: 'magma_crawler', name: 'Magma crawler', examine: 'A many-legged ember that never learned to cool down.',
  combatLevel: 54, hitpoints: 80, attack: 46, strength: 48, defence: 44, attackSpeed: 4,
  respawnTicks: 60, color: '#c84818', size: 1.3, attackable: true,
  drops: [
    { item: 'big_bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [30, 150], chance: 0.7 },
    { item: 'gold_ore', qty: [1, 2], chance: 0.15 },
    { item: 'coal', qty: [1, 3], chance: 0.2 },
    { item: 'fire_rune', qty: [5, 15], chance: 0.25 },
  ],
});
npc({
  id: 'ash_fiend', name: 'Ash fiend', examine: 'A scorched silhouette with a temper to match its habitat.',
  combatLevel: 82, hitpoints: 120, attack: 70, strength: 72, defence: 68, attackSpeed: 4,
  aggressive: true, respawnTicks: 80, color: '#584848', size: 1.5, attackable: true,
  drops: [
    { item: 'big_bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [60, 300], chance: 0.8 },
    { item: 'chaos_rune', qty: [5, 20], chance: 0.3 },
    { item: 'runite_ore', qty: [1, 1], chance: 0.02 },
    { item: 'uncut_ruby', qty: [1, 1], chance: 0.05 },
    { item: 'grimy_irit', qty: [1, 2], chance: 0.15 },
  ],
});

// --- Phase 6 bosses ---
npc({
  id: 'ice_queen', name: 'Maraza the Rimebound', examine: 'A queen frozen mid-fury, several centuries ago. Still furious.',
  combatLevel: 90, hitpoints: 180, attack: 76, strength: 80, defence: 74, attackSpeed: 4,
  aggressive: true, boss: true, respawnTicks: 300, color: '#a0d0e8', size: 1.9, attackable: true,
  drops: [
    { item: 'big_bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [150, 700], chance: 1 },
    { item: 'rimeglass_blade', qty: [1, 1], chance: 0.05 },
    { item: 'runite_ore', qty: [1, 2], chance: 0.08 },
    { item: 'uncut_sapphire', qty: [1, 2], chance: 0.3 },
    { item: 'prayer_potion', qty: [1, 1], chance: 0.15 },
  ],
});
npc({
  id: 'bandit_king', name: 'Saif the Red Smile', examine: 'King of the dunes by vote. He counted the votes himself.',
  combatLevel: 55, hitpoints: 120, attack: 48, strength: 50, defence: 44, attackSpeed: 4,
  aggressive: true, boss: true, respawnTicks: 250, color: '#a83828', size: 1.5, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [200, 900], chance: 1 },
    { item: 'red_sash', qty: [1, 1], chance: 0.08 },
    { item: 'uncut_sapphire', qty: [1, 2], chance: 0.35 },
    { item: 'uncut_ruby', qty: [1, 1], chance: 0.15 },
    { item: 'gold_bar', qty: [1, 2], chance: 0.2 },
  ],
});
npc({
  id: 'magma_fiend', name: 'Korr the Molten', examine: 'The deep speaks in fire, and Korr is its loudest word.',
  combatLevel: 110, hitpoints: 250, attack: 92, strength: 96, defence: 88, attackSpeed: 4,
  aggressive: true, boss: true, respawnTicks: 400, color: '#e85818', size: 2.4, attackable: true,
  drops: [
    { item: 'big_bones', qty: [1, 1], chance: 1 },
    { item: 'molten_core', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [300, 1200], chance: 1 },
    { item: 'molten_gauntlets', qty: [1, 1], chance: 0.06 },
    { item: 'rune_bar', qty: [1, 1], chance: 0.05 },
    { item: 'rune_sword', qty: [1, 1], chance: 0.02 },
    { item: 'runite_ore', qty: [1, 2], chance: 0.1 },
  ],
});

// --- Phase 6 friendly NPCs ---
npc({
  id: 'fishmonger', name: 'Fishmonger Pell', examine: 'Smells of the sea and sound business sense.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#4878a0', size: 1, attackable: false, drops: [],
});
npc({
  id: 'harbormaster', name: 'Harbormaster Quill', examine: 'Keeps the tide schedule in her head and the docks in line.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#385878', size: 1, attackable: false, drops: [],
});
npc({
  id: 'mountain_guide', name: 'Guide Torvald', examine: 'Has fallen off every ledge on the mountain, once each.',
  combatLevel: 0, hitpoints: 20, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#8898a8', size: 1.05, attackable: false, drops: [],
});
npc({
  id: 'desert_nomad', name: 'Nomad Zahra', examine: 'Sells what the desert forgot you would need.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#c0a060', size: 1, attackable: false, drops: [],
});
npc({
  id: 'gem_trader', name: 'Gem trader', examine: 'Eyes like a jeweller\'s loupe and prices to match.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#7858a0', size: 1, attackable: false, drops: [],
});

// --- Phase 7 monsters ---
npc({
  id: 'bear', name: 'Bear', examine: 'A great brown bear. It was here first, and it knows it.',
  combatLevel: 21, hitpoints: 32, attack: 18, strength: 20, defence: 16, attackSpeed: 5,
  respawnTicks: 35, color: '#6a4a30', size: 1.3, attackable: true,
  drops: [
    { item: 'big_bones', qty: [1, 1], chance: 1 },
    { item: 'bear_fur', qty: [1, 1], chance: 1 },
    { item: 'raw_beef', qty: [1, 1], chance: 0.5 },
  ],
});
npc({
  id: 'dire_wolf', name: 'Dire wolf', examine: 'A wolf grown too big for its forest, and too hungry for yours.',
  combatLevel: 25, hitpoints: 38, attack: 22, strength: 23, defence: 19, attackSpeed: 4,
  aggressive: true, respawnTicks: 35, color: '#5a584e', size: 1.15, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'raw_beef', qty: [1, 1], chance: 0.4 },
  ],
});
npc({
  id: 'forest_spider', name: 'Forest spider', examine: 'A spider the size of a wheelbarrow, with none of the charm.',
  combatLevel: 24, hitpoints: 35, attack: 21, strength: 21, defence: 18, attackSpeed: 4,
  aggressive: true, respawnTicks: 30, color: '#3c4a2c', size: 1.05, attackable: true,
  drops: [
    { item: 'spider_silk', qty: [1, 1], chance: 0.6 },
  ],
});
npc({
  id: 'ruin_wraith', name: 'Ruin wraith', examine: 'A cold shape that remembers the ruins when they had roofs.',
  combatLevel: 45, hitpoints: 70, attack: 39, strength: 40, defence: 37, attackSpeed: 4,
  aggressive: true, respawnTicks: 55, color: '#7a8898', size: 1.35, attackable: true,
  drops: [
    { item: 'big_bones', qty: [1, 1], chance: 1 },
    { item: 'grave_dust', qty: [1, 2], chance: 1 },
    { item: 'coins', qty: [20, 120], chance: 0.6 },
    { item: 'grimy_ranarr', qty: [1, 1], chance: 0.08 },
  ],
});
npc({
  id: 'pirate', name: 'Pirate', examine: 'A wrecker of Gullswreck Cove. Everything he owns belonged to someone else.',
  combatLevel: 30, hitpoints: 45, attack: 26, strength: 27, defence: 24, attackSpeed: 4,
  respawnTicks: 40, color: '#7a3838', size: 1.05, attackable: true,
  pickpocket: {
    level: 45, xp: 75, stunDmg: 3,
    loot: [
      { item: 'coins', qty: [25, 60] },
      { item: 'fishing_bait', qty: [3, 10] },
    ],
  },
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [10, 90], chance: 0.7 },
    { item: 'fishing_bait', qty: [2, 12], chance: 0.3 },
    { item: 'uncut_sapphire', qty: [1, 1], chance: 0.04 },
    { item: 'uncut_emerald', qty: [1, 1], chance: 0.02 },
  ],
});
npc({
  id: 'pirate_captain', name: 'Captain Saltjaw', examine: 'Master of the cove\'s wreckers. His grin has more gold than teeth.',
  combatLevel: 60, hitpoints: 130, attack: 52, strength: 54, defence: 48, attackSpeed: 4,
  aggressive: true, boss: true, respawnTicks: 250, color: '#902828', size: 1.6, attackable: true,
  drops: [
    { item: 'bones', qty: [1, 1], chance: 1 },
    { item: 'wreck_chart', qty: [1, 1], chance: 1 },
    { item: 'coins', qty: [200, 900], chance: 1 },
    { item: 'boarding_cutlass', qty: [1, 1], chance: 0.1 },
    { item: 'uncut_ruby', qty: [1, 1], chance: 0.12 },
    { item: 'raw_swordfish', qty: [1, 3], chance: 0.25 },
  ],
});
npc({
  id: 'cinder_imp', name: 'Cinder imp', examine: 'A pocket-sized arsonist with a giggle like cracking embers.',
  combatLevel: 35, hitpoints: 50, attack: 30, strength: 31, defence: 28, attackSpeed: 4,
  aggressive: true, respawnTicks: 45, color: '#c05020', size: 0.85, attackable: true,
  drops: [
    { item: 'coins', qty: [15, 100], chance: 0.7 },
    { item: 'fire_rune', qty: [3, 12], chance: 0.4 },
    { item: 'ember_crystal', qty: [1, 1], chance: 0.01 },
  ],
});

// --- Phase 7 friendly NPCs ---
npc({
  id: 'village_elder', name: 'Elder Maeryn', examine: 'Eldermere\'s memory, conscience, and final word on everything.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#8a7a58', size: 1, attackable: false, drops: [],
});
npc({
  id: 'boatman', name: 'Boatman Wick', examine: 'Rows anywhere for a fair price and a dry story.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#406078', size: 1, attackable: false, drops: [],
});
npc({
  id: 'trapper', name: 'Trapper Hode', examine: 'Smells of woodsmoke and pelts. Counts furs the way bankers count coins.',
  combatLevel: 0, hitpoints: 15, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#705838', size: 1.05, attackable: false, drops: [],
});
npc({
  id: 'wayfarer', name: 'Wayfarer Sorrel', examine: 'A travelling merchant whose pack holds a little of everywhere.',
  combatLevel: 0, hitpoints: 10, attack: 1, strength: 1, defence: 1, attackSpeed: 4,
  respawnTicks: 50, color: '#a08848', size: 1, attackable: false, drops: [],
});

// ---------------- World objects ----------------
export interface ObjDef {
  id: string;
  name: string;
  examine: string;
  action?: string;            // context-menu verb, e.g. 'Chop down'
  blocks: boolean;
}
export const OBJS: Record<string, ObjDef> = {};
function obj(d: ObjDef) { OBJS[d.id] = d; }

obj({ id: 'tree', name: 'Tree', examine: 'A leafy tree.', action: 'Chop down', blocks: true });
obj({ id: 'oak', name: 'Oak tree', examine: 'A grand and sturdy oak.', action: 'Chop down', blocks: true });
obj({ id: 'willow', name: 'Willow tree', examine: 'A weeping willow trailing its branches in the breeze.', action: 'Chop down', blocks: true });
obj({ id: 'stump', name: 'Tree stump', examine: 'Someone has chopped this tree down.', blocks: true });
obj({ id: 'rocks_copper', name: 'Copper rocks', examine: 'A mineable vein of copper ore.', action: 'Mine', blocks: true });
obj({ id: 'rocks_tin', name: 'Tin rocks', examine: 'A mineable vein of tin ore.', action: 'Mine', blocks: true });
obj({ id: 'rocks_iron', name: 'Iron rocks', examine: 'A mineable vein of iron ore.', action: 'Mine', blocks: true });
obj({ id: 'rocks_coal', name: 'Coal rocks', examine: 'A dark seam of coal runs through this rock.', action: 'Mine', blocks: true });
obj({ id: 'rocks_essence', name: 'Essence rocks', examine: 'A pale rock thrumming with raw magic. It never seems to run dry.', action: 'Mine', blocks: true });
obj({ id: 'rocks_mithril', name: 'Mithril rocks', examine: 'A vein glinting pale blue in the dark.', action: 'Mine', blocks: true });
obj({ id: 'rocks_adamantite', name: 'Adamantite rocks', examine: 'A vein of green-flecked adamantite. Bring a good pick and patience.', action: 'Mine', blocks: true });
obj({ id: 'rocks_empty', name: 'Rocks', examine: 'There is no ore left in this rock.', blocks: true });
obj({ id: 'fishing_spot', name: 'Fishing spot', examine: 'I can see fish swimming in the water.', action: 'Net', blocks: false });
obj({ id: 'rod_fishing_spot', name: 'Fishing spot', examine: 'Ripples here suggest fish with a taste for bait.', action: 'Bait', blocks: false });
obj({ id: 'range', name: 'Cooking range', examine: 'A hot cooking range.', action: 'Cook', blocks: true });
obj({ id: 'bank_booth', name: 'Bank booth', examine: 'It\'s a bank booth.', action: 'Bank', blocks: true });
obj({ id: 'fire', name: 'Fire', examine: 'A warm crackling fire.', action: 'Cook', blocks: false });
obj({ id: 'furnace', name: 'Furnace', examine: 'Hot enough to turn rocks into regrets — or bars.', action: 'Smelt', blocks: true });
obj({ id: 'anvil', name: 'Anvil', examine: 'An anvil. It has heard a lot of hammering.', action: 'Smith', blocks: true });
obj({ id: 'spinning_wheel', name: 'Spinning wheel', examine: 'Spins wool and flax into useful things.', action: 'Spin', blocks: true });
obj({ id: 'altar', name: 'Altar', examine: 'A quiet altar. Good for the soul.', action: 'Pray-at', blocks: true });
obj({ id: 'air_altar', name: 'Air altar', examine: 'A weathered stone circle where the wind never stops.', action: 'Craft-rune', blocks: true });
obj({ id: 'flax_plant', name: 'Flax', examine: 'A clump of flax with delicate blue flowers.', action: 'Pick', blocks: false });
obj({ id: 'farming_patch', name: 'Farming patch', examine: 'A patch of soil ready for honest work.', action: 'Inspect', blocks: false });
obj({ id: 'bake_stall', name: 'Bake stall', examine: 'Fresh baking, lightly guarded.', action: 'Steal-from', blocks: true });
obj({ id: 'workbench', name: 'Workbench', examine: 'A sturdy bench for building furniture.', action: 'Build', blocks: true });
obj({ id: 'agility_log', name: 'Log balance', examine: 'A log laid across a muddy gap. Probably fine.', action: 'Walk-across', blocks: false });
obj({ id: 'agility_rope', name: 'Rope swing', examine: 'A rope of questionable provenance.', action: 'Swing-on', blocks: false });
obj({ id: 'agility_wall', name: 'Climbing wall', examine: 'A rough wall with convenient handholds.', action: 'Climb', blocks: false });
obj({ id: 'agility_ledge', name: 'Narrow ledge', examine: 'A ledge best crossed without looking down.', action: 'Balance-across', blocks: false });
obj({ id: 'snare_set', name: 'Bird snare', examine: 'A set snare, waiting patiently.', action: 'Check', blocks: false });
obj({ id: 'snare_caught', name: 'Bird snare', examine: 'Something small and feathery has been caught!', action: 'Check', blocks: false });
obj({ id: 'ge_booth', name: 'Grand Exchange booth', examine: 'Where fortunes are made, lost, and argued about.', action: 'Exchange', blocks: true });
obj({ id: 'fountain', name: 'Fountain', examine: 'The pride of the Aldgate plaza. Coins at the bottom, hopes attached.', blocks: true });
obj({ id: 'stalagmite', name: 'Stalagmite', examine: 'A stone spike, patiently growing upward for centuries.', blocks: true });
obj({ id: 'cave_mouth', name: 'Cave mouth', examine: 'A dark opening breathing cool air from somewhere deep below.', blocks: false });

// --- Phase 6 objects ---
obj({ id: 'maple', name: 'Maple tree', examine: 'A maple tree wearing autumn all year round.', action: 'Chop down', blocks: true });
obj({ id: 'yew', name: 'Yew tree', examine: 'An ancient yew. It has outlived everyone who planted it.', action: 'Chop down', blocks: true });
obj({ id: 'magic_tree', name: 'Magic tree', examine: 'Its leaves glitter. The tree pretends not to notice.', action: 'Chop down', blocks: true });
obj({ id: 'rocks_gold', name: 'Gold rocks', examine: 'A vein winking with honest-to-goodness gold.', action: 'Mine', blocks: true });
obj({ id: 'rocks_runite', name: 'Runite rocks', examine: 'Storm-grey ore in the living rock. The rarest of finds.', action: 'Mine', blocks: true });
obj({ id: 'rocks_gem', name: 'Gem rocks', examine: 'A rough seam glittering with buried colour.', action: 'Mine', blocks: true });
obj({ id: 'lobster_spot', name: 'Fishing spot', examine: 'The water here churns with armoured tempers.', action: 'Cage', blocks: false });
obj({ id: 'harpoon_spot', name: 'Fishing spot', examine: 'Big shapes glide beneath the surface. Bring a harpoon.', action: 'Harpoon', blocks: false });
obj({ id: 'fire_altar', name: 'Fire altar', examine: 'A scorched stone ring where the air shimmers with heat.', action: 'Craft-rune', blocks: true });
obj({ id: 'gem_stall', name: 'Gem stall', examine: 'Glittering wares, watchfully guarded.', action: 'Steal-from', blocks: true });
// mountain agility course (lvl 30+)
obj({ id: 'ice_ledge', name: 'Icy ledge', examine: 'A glassy ledge with no patience for hesitation.', action: 'Balance-across', blocks: false });
obj({ id: 'rope_bridge', name: 'Rope bridge', examine: 'Two ropes, some planks, and a long view down.', action: 'Cross', blocks: false });
obj({ id: 'rock_climb', name: 'Rock face', examine: 'A cliff with handholds, allegedly.', action: 'Climb', blocks: false });
obj({ id: 'snow_slope', name: 'Snow slope', examine: 'A steep slope of packed snow. Gravity offers a shortcut.', action: 'Slide-down', blocks: false });
// deco (Examine only)
obj({ id: 'bush', name: 'Bush', examine: 'A bush, doing bush things.', blocks: false });
obj({ id: 'fern', name: 'Fern', examine: 'A fern that predates most kingdoms and all of their taxes.', blocks: false });
obj({ id: 'boulder_small', name: 'Boulder', examine: 'A boulder that rolled here once and called it a day.', blocks: false });
obj({ id: 'mushroom_patch', name: 'Mushrooms', examine: 'A huddle of mushrooms holding a quiet meeting.', blocks: false });
obj({ id: 'reeds', name: 'Reeds', examine: 'Reeds whispering gossip to the wind.', blocks: false });
obj({ id: 'lilypad', name: 'Lilypad', examine: 'A frog\'s idea of prime real estate.', blocks: false });
obj({ id: 'driftwood', name: 'Driftwood', examine: 'Wood that took the scenic route here.', blocks: false });
obj({ id: 'barrel', name: 'Barrel', examine: 'A barrel. Contents: speculation.', blocks: true });
obj({ id: 'crate', name: 'Crate', examine: 'A crate marked "this side up", lying on its side.', blocks: true });
obj({ id: 'cactus', name: 'Cactus', examine: 'It waves hello. Do not wave back.', blocks: true });
obj({ id: 'ice_spike', name: 'Ice spike', examine: 'A frozen spear the mountain made all by itself.', blocks: true });
obj({ id: 'snow_pine', name: 'Snowy pine', examine: 'A pine wearing more snow than it can politely carry.', blocks: true });
obj({ id: 'dead_tree_deco', name: 'Dead tree', examine: 'It gave up leaves years ago and never looked back.', blocks: true });

export interface SkillObjData { level: number; xp: number; item: string; depleteChance: number; respawn: number; lowRate: number; highRate: number; }
// success rate: chance per tick interpolated between lowRate (level req) and highRate (level 99)
export const SKILL_OBJS: Record<string, SkillObjData> = {
  tree:           { level: 1,  xp: 25,   item: 'logs',         depleteChance: 0.125, respawn: 8,  lowRate: 0.25, highRate: 0.9 },
  oak:            { level: 15, xp: 37.5, item: 'oak_logs',     depleteChance: 0.125, respawn: 14, lowRate: 0.15, highRate: 0.8 },
  willow:         { level: 30, xp: 67.5, item: 'willow_logs',  depleteChance: 0.125, respawn: 18, lowRate: 0.12, highRate: 0.75 },
  rocks_copper:   { level: 1,  xp: 17.5, item: 'copper_ore',   depleteChance: 1,     respawn: 4,  lowRate: 0.3,  highRate: 0.95 },
  rocks_tin:      { level: 1,  xp: 17.5, item: 'tin_ore',      depleteChance: 1,     respawn: 4,  lowRate: 0.3,  highRate: 0.95 },
  rocks_iron:     { level: 15, xp: 35,   item: 'iron_ore',     depleteChance: 1,     respawn: 9,  lowRate: 0.2,  highRate: 0.9 },
  rocks_coal:     { level: 30, xp: 50,   item: 'coal',         depleteChance: 1,     respawn: 15, lowRate: 0.15, highRate: 0.85 },
  rocks_essence:  { level: 1,  xp: 5,    item: 'rune_essence', depleteChance: 0,     respawn: 0,  lowRate: 0.5,  highRate: 0.98 },
  rocks_mithril:  { level: 55, xp: 80,   item: 'mithril_ore',  depleteChance: 1,     respawn: 25, lowRate: 0.1,  highRate: 0.75 },
  rocks_adamantite: { level: 70, xp: 95, item: 'adamantite_ore', depleteChance: 1,   respawn: 40, lowRate: 0.08, highRate: 0.65 },
  maple:          { level: 45, xp: 100,  item: 'maple_logs',   depleteChance: 0.125, respawn: 24, lowRate: 0.1,  highRate: 0.7 },
  yew:            { level: 60, xp: 175,  item: 'yew_logs',     depleteChance: 0.125, respawn: 40, lowRate: 0.08, highRate: 0.6 },
  magic_tree:     { level: 75, xp: 250,  item: 'magic_logs',   depleteChance: 0.125, respawn: 60, lowRate: 0.05, highRate: 0.45 },
  rocks_gold:     { level: 40, xp: 65,   item: 'gold_ore',     depleteChance: 1,     respawn: 20, lowRate: 0.12, highRate: 0.8 },
  rocks_runite:   { level: 85, xp: 125,  item: 'runite_ore',   depleteChance: 1,     respawn: 80, lowRate: 0.05, highRate: 0.5 },
  // gem rocks: 'item' is the baseline drop; content rolls the actual random gem
  // (uncut_sapphire / uncut_emerald / uncut_ruby) on each successful mine.
  rocks_gem:      { level: 40, xp: 65,   item: 'uncut_sapphire', depleteChance: 1,   respawn: 25, lowRate: 0.12, highRate: 0.8 },
};

// ---------------- Smithing ----------------
export const SMELTABLES: { bar: string; level: number; xp: number; inputs: { item: string; qty: number }[]; successChance?: number }[] = [
  { bar: 'bronze_bar', level: 1,  xp: 6.2,  inputs: [{ item: 'copper_ore', qty: 1 }, { item: 'tin_ore', qty: 1 }] },
  { bar: 'iron_bar',   level: 15, xp: 12.5, inputs: [{ item: 'iron_ore', qty: 1 }], successChance: 0.5 },
  { bar: 'steel_bar',  level: 30, xp: 17.5, inputs: [{ item: 'iron_ore', qty: 1 }, { item: 'coal', qty: 2 }] },
  { bar: 'mithril_bar', level: 50, xp: 30,  inputs: [{ item: 'mithril_ore', qty: 1 }, { item: 'coal', qty: 4 }] },
  { bar: 'adamantite_bar', level: 70, xp: 37.5, inputs: [{ item: 'adamantite_ore', qty: 1 }, { item: 'coal', qty: 6 }] },
  { bar: 'gold_bar', level: 40, xp: 22.5, inputs: [{ item: 'gold_ore', qty: 1 }] },
  { bar: 'rune_bar', level: 85, xp: 50,   inputs: [{ item: 'runite_ore', qty: 1 }, { item: 'coal', qty: 8 }] },
];

// xp is per-bar faithful: bronze 12.5/bar, iron 25/bar, steel 37.5/bar.
export const SMITHABLES: { output: string; outputQty?: number; bar: string; bars: number; level: number; xp: number }[] = [
  // bronze
  { output: 'bronze_arrowtips', outputQty: 15, bar: 'bronze_bar', bars: 1, level: 5,  xp: 12.5 },
  { output: 'nails',            outputQty: 15, bar: 'bronze_bar', bars: 1, level: 4,  xp: 12.5 },
  { output: 'bronze_sword',                    bar: 'bronze_bar', bars: 1, level: 4,  xp: 12.5 },
  { output: 'bronze_scimitar',                 bar: 'bronze_bar', bars: 2, level: 5,  xp: 25 },
  { output: 'bronze_full_helm',                bar: 'bronze_bar', bars: 2, level: 7,  xp: 25 },
  { output: 'bronze_kiteshield',               bar: 'bronze_bar', bars: 3, level: 12, xp: 37.5 },
  { output: 'bronze_platelegs',                bar: 'bronze_bar', bars: 3, level: 16, xp: 37.5 },
  { output: 'bronze_platebody',                bar: 'bronze_bar', bars: 5, level: 18, xp: 62.5 },
  // iron
  { output: 'iron_arrowtips',   outputQty: 15, bar: 'iron_bar',   bars: 1, level: 20, xp: 25 },
  { output: 'iron_sword',                      bar: 'iron_bar',   bars: 1, level: 19, xp: 25 },
  { output: 'iron_scimitar',                   bar: 'iron_bar',   bars: 2, level: 20, xp: 50 },
  { output: 'iron_full_helm',                  bar: 'iron_bar',   bars: 2, level: 22, xp: 50 },
  { output: 'iron_kiteshield',                 bar: 'iron_bar',   bars: 3, level: 27, xp: 75 },
  { output: 'iron_platelegs',                  bar: 'iron_bar',   bars: 3, level: 31, xp: 75 },
  { output: 'iron_platebody',                  bar: 'iron_bar',   bars: 5, level: 33, xp: 125 },
  // steel
  { output: 'steel_sword',                     bar: 'steel_bar',  bars: 1, level: 34, xp: 37.5 },
  { output: 'steel_scimitar',                  bar: 'steel_bar',  bars: 2, level: 35, xp: 75 },
  { output: 'steel_full_helm',                 bar: 'steel_bar',  bars: 2, level: 37, xp: 75 },
  { output: 'steel_kiteshield',                bar: 'steel_bar',  bars: 3, level: 42, xp: 112.5 },
  { output: 'steel_platelegs',                 bar: 'steel_bar',  bars: 3, level: 46, xp: 112.5 },
  { output: 'steel_platebody',                 bar: 'steel_bar',  bars: 5, level: 48, xp: 187.5 },
  // mithril (50 xp/bar)
  { output: 'mithril_sword',                     bar: 'mithril_bar', bars: 1, level: 54, xp: 50 },
  { output: 'mithril_arrowtips', outputQty: 15,  bar: 'mithril_bar', bars: 1, level: 55, xp: 50 },
  { output: 'mithril_scimitar',                  bar: 'mithril_bar', bars: 2, level: 55, xp: 100 },
  { output: 'mithril_full_helm',                 bar: 'mithril_bar', bars: 2, level: 57, xp: 100 },
  { output: 'mithril_kiteshield',                bar: 'mithril_bar', bars: 3, level: 62, xp: 150 },
  { output: 'mithril_platelegs',                 bar: 'mithril_bar', bars: 3, level: 66, xp: 150 },
  { output: 'mithril_platebody',                 bar: 'mithril_bar', bars: 5, level: 68, xp: 250 },
  // adamant (62.5 xp/bar)
  { output: 'adamant_sword',                     bar: 'adamantite_bar', bars: 1, level: 74, xp: 62.5 },
  { output: 'adamant_arrowtips', outputQty: 15,  bar: 'adamantite_bar', bars: 1, level: 75, xp: 62.5 },
  { output: 'adamant_scimitar',                  bar: 'adamantite_bar', bars: 2, level: 75, xp: 125 },
  { output: 'adamant_full_helm',                 bar: 'adamantite_bar', bars: 2, level: 77, xp: 125 },
  { output: 'adamant_kiteshield',                bar: 'adamantite_bar', bars: 3, level: 82, xp: 187.5 },
  { output: 'adamant_platelegs',                 bar: 'adamantite_bar', bars: 3, level: 86, xp: 187.5 },
  { output: 'adamant_platebody',                 bar: 'adamantite_bar', bars: 5, level: 88, xp: 312.5 },
  // rune (75 xp/bar)
  { output: 'rune_sword',                        bar: 'rune_bar', bars: 1, level: 85, xp: 75 },
  { output: 'rune_arrowtips',    outputQty: 15,  bar: 'rune_bar', bars: 1, level: 86, xp: 75 },
  { output: 'rune_scimitar',                     bar: 'rune_bar', bars: 2, level: 87, xp: 150 },
  { output: 'rune_full_helm',                    bar: 'rune_bar', bars: 2, level: 89, xp: 150 },
  { output: 'rune_kiteshield',                   bar: 'rune_bar', bars: 3, level: 93, xp: 225 },
  { output: 'rune_platelegs',                    bar: 'rune_bar', bars: 3, level: 96, xp: 225 },
  { output: 'rune_platebody',                    bar: 'rune_bar', bars: 5, level: 99, xp: 375 },
];

// ---------------- Fletching ----------------
export const FLETCHABLES: { output: string; outputQty?: number; level: number; xp: number; inputs: { item: string; qty: number }[] }[] = [
  { output: 'arrow_shaft',    outputQty: 15, level: 1,  xp: 5,    inputs: [{ item: 'logs', qty: 1 }] },
  { output: 'headless_arrow', outputQty: 15, level: 1,  xp: 15,   inputs: [{ item: 'arrow_shaft', qty: 15 }, { item: 'feather', qty: 15 }] },
  { output: 'bronze_arrow',   outputQty: 15, level: 1,  xp: 19.5, inputs: [{ item: 'headless_arrow', qty: 15 }, { item: 'bronze_arrowtips', qty: 15 }] },
  { output: 'iron_arrow',     outputQty: 15, level: 15, xp: 37.5, inputs: [{ item: 'headless_arrow', qty: 15 }, { item: 'iron_arrowtips', qty: 15 }] },
  { output: 'mithril_arrow',  outputQty: 15, level: 45, xp: 112.5, inputs: [{ item: 'headless_arrow', qty: 15 }, { item: 'mithril_arrowtips', qty: 15 }] },
  { output: 'adamant_arrow',  outputQty: 15, level: 60, xp: 150,  inputs: [{ item: 'headless_arrow', qty: 15 }, { item: 'adamant_arrowtips', qty: 15 }] },
  { output: 'shortbow_u',                    level: 5,  xp: 5,    inputs: [{ item: 'logs', qty: 1 }] },
  { output: 'shortbow',                      level: 5,  xp: 5,    inputs: [{ item: 'shortbow_u', qty: 1 }, { item: 'bowstring', qty: 1 }] },
  { output: 'oak_shortbow',                  level: 20, xp: 33,   inputs: [{ item: 'oak_logs', qty: 1 }, { item: 'bowstring', qty: 1 }] },
  { output: 'rune_arrow',     outputQty: 15, level: 75, xp: 187.5, inputs: [{ item: 'headless_arrow', qty: 15 }, { item: 'rune_arrowtips', qty: 15 }] },
  { output: 'maple_shortbow_u',              level: 50, xp: 50,   inputs: [{ item: 'maple_logs', qty: 1 }] },
  { output: 'maple_shortbow',                level: 50, xp: 50,   inputs: [{ item: 'maple_shortbow_u', qty: 1 }, { item: 'bowstring', qty: 1 }] },
  { output: 'yew_shortbow_u',                level: 65, xp: 67.5, inputs: [{ item: 'yew_logs', qty: 1 }] },
  { output: 'yew_shortbow',                  level: 65, xp: 67.5, inputs: [{ item: 'yew_shortbow_u', qty: 1 }, { item: 'bowstring', qty: 1 }] },
  { output: 'magic_shortbow_u',              level: 80, xp: 83.3, inputs: [{ item: 'magic_logs', qty: 1 }] },
  { output: 'magic_shortbow',                level: 80, xp: 83.3, inputs: [{ item: 'magic_shortbow_u', qty: 1 }, { item: 'bowstring', qty: 1 }] },
];

// ---------------- Crafting ----------------
export const CRAFTABLES: { output: string; level: number; xp: number; inputs: { item: string; qty: number }[]; station?: 'spinning_wheel' | null }[] = [
  { output: 'ball_of_wool',   level: 1,  xp: 2.5,  inputs: [{ item: 'wool', qty: 1 }], station: 'spinning_wheel' },
  { output: 'bowstring',      level: 10, xp: 15,   inputs: [{ item: 'flax', qty: 1 }], station: 'spinning_wheel' },
  { output: 'leather_gloves', level: 1,  xp: 13.8, inputs: [{ item: 'leather', qty: 1 }], station: null },
  { output: 'leather_boots',  level: 7,  xp: 16.2, inputs: [{ item: 'leather', qty: 1 }], station: null },
  { output: 'leather_body',   level: 14, xp: 25,   inputs: [{ item: 'leather', qty: 1 }], station: null },
  // jewelry (station null — content routes these through the furnace flow)
  { output: 'gold_ring',       level: 5,  xp: 15, inputs: [{ item: 'gold_bar', qty: 1 }], station: null },
  { output: 'gold_amulet',     level: 8,  xp: 30, inputs: [{ item: 'gold_bar', qty: 1 }], station: null },
  { output: 'sapphire_ring',   level: 20, xp: 40, inputs: [{ item: 'gold_bar', qty: 1 }, { item: 'sapphire', qty: 1 }], station: null },
  { output: 'sapphire_amulet', level: 24, xp: 65, inputs: [{ item: 'gold_bar', qty: 1 }, { item: 'sapphire', qty: 1 }], station: null },
  { output: 'ruby_ring',       level: 34, xp: 70, inputs: [{ item: 'gold_bar', qty: 1 }, { item: 'ruby', qty: 1 }], station: null },
  { output: 'ruby_amulet',     level: 50, xp: 85, inputs: [{ item: 'gold_bar', qty: 1 }, { item: 'ruby', qty: 1 }], station: null },
];

// Gem cutting: 'Cut' item action with a chisel in inventory (content wires the action).
export const GEM_CUTS: { uncut: string; cut: string; level: number; xp: number }[] = [
  { uncut: 'uncut_sapphire', cut: 'sapphire', level: 20, xp: 50 },
  { uncut: 'uncut_emerald',  cut: 'emerald',  level: 27, xp: 67.5 },
  { uncut: 'uncut_ruby',     cut: 'ruby',     level: 34, xp: 85 },
];

// ---------------- Herblore ----------------
export const HERBS: { grimy: string; clean: string; level: number; xp: number }[] = [
  { grimy: 'grimy_guam',       clean: 'guam_leaf',  level: 3, xp: 2.5 },
  { grimy: 'grimy_marrentill', clean: 'marrentill', level: 5, xp: 3.8 },
  { grimy: 'grimy_ranarr',     clean: 'ranarr_weed', level: 25, xp: 7.5 },
  { grimy: 'grimy_irit',       clean: 'irit_leaf',   level: 40, xp: 8.8 },
];

export const POTIONS: { output: string; level: number; xp: number; herb: string; secondary: string }[] = [
  { output: 'attack_potion',  level: 3, xp: 25,   herb: 'guam_leaf',  secondary: 'eye_of_newt' },
  { output: 'defence_potion', level: 9, xp: 37.5, herb: 'marrentill', secondary: 'eye_of_newt' },
  // prayer_potion restores prayer points (ItemDef.restoresPrayer; content wires drinking)
  { output: 'prayer_potion',  level: 38, xp: 87.5, herb: 'ranarr_weed', secondary: 'eye_of_newt' },
  { output: 'super_attack',   level: 45, xp: 100,  herb: 'irit_leaf',   secondary: 'eye_of_newt' },
];

// ---------------- Magic ----------------
export const SPELLS: { id: string; name: string; level: number; xp: number; maxHit: number; runes: { item: string; qty: number }[] }[] = [
  { id: 'wind_strike',  name: 'Wind Strike',  level: 1,  xp: 5.5,  maxHit: 2, runes: [{ item: 'air_rune', qty: 1 }, { item: 'mind_rune', qty: 1 }] },
  { id: 'water_strike', name: 'Water Strike', level: 5,  xp: 7.5,  maxHit: 4, runes: [{ item: 'water_rune', qty: 1 }, { item: 'air_rune', qty: 1 }, { item: 'mind_rune', qty: 1 }] },
  { id: 'earth_strike', name: 'Earth Strike', level: 9,  xp: 9.5,  maxHit: 6, runes: [{ item: 'earth_rune', qty: 2 }, { item: 'air_rune', qty: 1 }, { item: 'mind_rune', qty: 1 }] },
  { id: 'fire_strike',  name: 'Fire Strike',  level: 13, xp: 11.5, maxHit: 8, runes: [{ item: 'fire_rune', qty: 3 }, { item: 'air_rune', qty: 2 }, { item: 'mind_rune', qty: 1 }] },
  { id: 'wind_bolt',  name: 'Wind Bolt',  level: 17, xp: 13.5, maxHit: 9,  runes: [{ item: 'air_rune', qty: 2 }, { item: 'chaos_rune', qty: 1 }] },
  { id: 'water_bolt', name: 'Water Bolt', level: 23, xp: 16.5, maxHit: 10, runes: [{ item: 'water_rune', qty: 2 }, { item: 'air_rune', qty: 2 }, { item: 'chaos_rune', qty: 1 }] },
  { id: 'earth_bolt', name: 'Earth Bolt', level: 29, xp: 19.5, maxHit: 11, runes: [{ item: 'earth_rune', qty: 3 }, { item: 'air_rune', qty: 2 }, { item: 'chaos_rune', qty: 1 }] },
  { id: 'fire_bolt',  name: 'Fire Bolt',  level: 35, xp: 22.5, maxHit: 12, runes: [{ item: 'fire_rune', qty: 4 }, { item: 'air_rune', qty: 3 }, { item: 'chaos_rune', qty: 1 }] },
];

// ---------------- Prayer ----------------
// drain: prayer points drained per ~12 ticks while active.
export const PRAYERS: { id: string; name: string; level: number; drain: number; boost: 'defence' | 'strength' | 'attack'; mult: number }[] = [
  { id: 'stout_skin',      name: 'Stout Skin',      level: 1,  drain: 1, boost: 'defence',  mult: 1.05 },
  { id: 'surge_of_might',  name: 'Surge of Might',  level: 4,  drain: 1, boost: 'strength', mult: 1.05 },
  { id: 'keen_eye',        name: 'Keen Eye',        level: 7,  drain: 1, boost: 'attack',   mult: 1.05 },
  { id: 'stone_hide',      name: 'Stone Hide',      level: 10, drain: 2, boost: 'defence',  mult: 1.1 },
  { id: 'giants_strength', name: 'Giant\'s Strength', level: 13, drain: 2, boost: 'strength', mult: 1.1 },
  { id: 'hawks_focus',     name: 'Hawk\'s Focus',   level: 16, drain: 2, boost: 'attack',   mult: 1.1 },
];

// ---------------- Farming ----------------
export const SEEDS: { seed: string; produce: string; level: number; plantXp: number; harvestXp: number; growTicks: number }[] = [
  { seed: 'potato_seed',  produce: 'potato',  level: 1, plantXp: 8,  harvestXp: 9,    growTicks: 100 },
  { seed: 'cabbage_seed', produce: 'cabbage', level: 7, plantXp: 10, harvestXp: 11.5, growTicks: 150 },
  { seed: 'sweetcorn_seed',  produce: 'sweetcorn',  level: 20, plantXp: 17,   harvestXp: 19,   growTicks: 220 },
  { seed: 'watermelon_seed', produce: 'watermelon', level: 47, plantXp: 48.5, harvestXp: 54.5, growTicks: 350 },
];

// ---------------- Shops ----------------
export const SHOPS: Record<string, { name: string; stock: { item: string; qty: number }[] }> = {
  general: {
    name: 'General Store',
    stock: [
      { item: 'bronze_axe', qty: 10 },
      { item: 'bronze_pickaxe', qty: 10 },
      { item: 'tinderbox', qty: 10 },
      { item: 'small_net', qty: 10 },
      { item: 'bronze_sword', qty: 5 },
      { item: 'wooden_shield', qty: 5 },
      { item: 'bread', qty: 10 },
      { item: 'knife', qty: 10 },
      { item: 'hammer', qty: 10 },
      { item: 'needle', qty: 10 },
      { item: 'thread', qty: 100 },
      { item: 'shears', qty: 10 },
      { item: 'bucket', qty: 10 },
      { item: 'fishing_rod', qty: 10 },
      { item: 'fishing_bait', qty: 500 },
      { item: 'bird_snare', qty: 10 },
      { item: 'vial_of_water', qty: 50 },
      { item: 'chisel', qty: 10 },
    ],
  },
  magic: {
    name: 'Mira\'s Rune Supplies',
    stock: [
      { item: 'air_rune', qty: 500 },
      { item: 'mind_rune', qty: 500 },
      { item: 'water_rune', qty: 300 },
      { item: 'earth_rune', qty: 300 },
      { item: 'fire_rune', qty: 300 },
      { item: 'chaos_rune', qty: 250 },
      { item: 'eye_of_newt', qty: 50 },
    ],
  },
  gardener: {
    name: 'Old Fen\'s Seed Stall',
    stock: [
      { item: 'potato_seed', qty: 100 },
      { item: 'cabbage_seed', qty: 100 },
      { item: 'rake', qty: 10 },
      { item: 'seed_dibber', qty: 10 },
    ],
  },
  aldgate_armoury: {
    name: 'Aldgate Armoury',
    stock: [
      { item: 'steel_sword', qty: 3 },
      { item: 'steel_scimitar', qty: 3 },
      { item: 'steel_full_helm', qty: 3 },
      { item: 'steel_platebody', qty: 2 },
      { item: 'steel_platelegs', qty: 2 },
      { item: 'steel_kiteshield', qty: 2 },
      { item: 'mithril_sword', qty: 1 },
      { item: 'mithril_full_helm', qty: 1 },
      { item: 'iron_arrow', qty: 200 },
    ],
  },
  aldgate_food: {
    name: 'The Gilded Loaf',
    stock: [
      { item: 'bread', qty: 30 },
      { item: 'cake', qty: 10 },
      { item: 'cooked_meat', qty: 20 },
    ],
  },
  brackwater_fish: {
    name: 'Pell\'s Fresh Catch',
    stock: [
      { item: 'lobster_pot', qty: 10 },
      { item: 'harpoon', qty: 10 },
      { item: 'fishing_rod', qty: 10 },
      { item: 'small_net', qty: 10 },
      { item: 'fishing_bait', qty: 500 },
      { item: 'lobster', qty: 5 },
      { item: 'swordfish', qty: 3 },
    ],
  },
  nomad_supplies: {
    name: 'Zahra\'s Wandering Wares',
    stock: [
      { item: 'bread', qty: 20 },
      { item: 'cooked_meat', qty: 15 },
      { item: 'cake', qty: 5 },
      { item: 'chisel', qty: 10 },
      { item: 'tinderbox', qty: 10 },
      { item: 'vial_of_water', qty: 50 },
    ],
  },
  // Buys gems at good prices; stock starts light on purpose.
  gem_stall: {
    name: 'The Glitter Counter',
    stock: [
      { item: 'uncut_sapphire', qty: 1 },
      { item: 'sapphire', qty: 1 },
      { item: 'chisel', qty: 5 },
      { item: 'gold_ring', qty: 2 },
      { item: 'gold_amulet', qty: 2 },
    ],
  },
};

// Legacy alias kept for older importers.
export const SHOP_STOCK = SHOPS.general.stock;

// ---------------- Slayer ----------------
export const SLAYER_TARGETS: { npc: string; level: number }[] = [
  { npc: 'chicken', level: 1 },
  { npc: 'cow', level: 1 },
  { npc: 'giant_rat', level: 1 },
  { npc: 'goblin', level: 1 },
  { npc: 'man', level: 3 },
  { npc: 'scorpion', level: 5 },
  { npc: 'ice_troll', level: 15 },
  { npc: 'magma_crawler', level: 30 },
  { npc: 'ash_fiend', level: 50 },
];

// ---------------- Construction ----------------
export const CONSTRUCTION_BUILDS: { name: string; level: number; xp: number; planks: number; nails: number }[] = [
  { name: 'Crude chair',     level: 1,  xp: 58,  planks: 2, nails: 2 },
  { name: 'Wooden chair',    level: 8,  xp: 87,  planks: 3, nails: 3 },
  { name: 'Wooden table',    level: 12, xp: 115, planks: 4, nails: 4 },
  { name: 'Wooden bookcase', level: 22, xp: 145, planks: 5, nails: 5 },
];

export const TICK_MS = 600;
