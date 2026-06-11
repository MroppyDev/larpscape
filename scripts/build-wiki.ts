// Generates wiki content JSON from game data files.
// Run: npx tsx scripts/build-wiki.ts
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import itemsJson from '../data/items.json';
import npcsJson from '../data/npcs.json';
import objectsJson from '../data/objects.json';
import recipesJson from '../data/recipes.json';
import shopsJson from '../data/shops.json';
import magicJson from '../data/magic.json';
import spawnsJson from '../data/spawns.json';

import {
  type WikiData, type WikiArticle, esc, link, p, h2, h3, ul, table, infobox, article,
  chanceLabel, shopBuyPrice, shopSellPrice, addArticle, finalize,
} from './wiki-helpers';
import { NPC_LORE, REGION_LORE, addLorePages } from '../wiki/lore';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '../wiki/ui/data/wiki-data.json');
if (process.env.WIKI_BASE) {
  console.log(`Building wiki data with base path: ${process.env.WIKI_BASE}`);
}

type ItemDef = typeof itemsJson[string];
type NpcDef = typeof npcsJson[string];
type ShopDef = typeof shopsJson[string];

const ITEMS = itemsJson as Record<string, ItemDef>;
const NPCS = npcsJson as Record<string, NpcDef>;
const SHOPS = shopsJson as Record<string, ShopDef>;
const OBJS = objectsJson.objs as Record<string, { id: string; name: string; examine: string; action?: string }>;
const SKILL_OBJS = objectsJson.skillObjs as Record<string, { level: number; xp: number; item: string }>;
const NPC_SPAWNS = spawnsJson.npcSpawns as { id: string; x: number; y: number }[];
const GROUND_SPAWNS = spawnsJson.groundSpawns as { item: string; x: number; y: number }[];

const SKILLS = [
  'Attack', 'Hitpoints', 'Mining', 'Strength', 'Agility', 'Smithing',
  'Defence', 'Herblore', 'Fishing', 'Ranged', 'Thieving', 'Cooking',
  'Prayer', 'Crafting', 'Firemaking', 'Magic', 'Fletching', 'Woodcutting',
  'Runecraft', 'Slayer', 'Farming', 'Construction', 'Hunter', 'Gun',
] as const;

function itemLink(id: string, text?: string): string {
  const name = ITEMS[id]?.name ?? id;
  return link(`item/${id}`, text ?? name);
}

function npcLink(id: string, text?: string): string {
  const name = NPCS[id]?.name ?? id;
  return link(`npc/${id}`, text ?? name);
}

function shopLink(id: string, text?: string): string {
  const name = SHOPS[id]?.name ?? id;
  return link(`shop/${id}`, text ?? name);
}

function questLink(id: string, name: string): string {
  return link(`quest/${id}`, name);
}

// Reverse indexes
const itemShops: Record<string, { shop: string; qty: number }[]> = {};
for (const [shopId, shop] of Object.entries(SHOPS)) {
  for (const s of shop.stock) {
    (itemShops[s.item] ??= []).push({ shop: shopId, qty: s.qty });
  }
}

const npcLocations: Record<string, { x: number; y: number }[]> = {};
for (const s of NPC_SPAWNS) {
  (npcLocations[s.id] ??= []).push({ x: s.x, y: s.y });
}

const groundItemSpawns: Record<string, { x: number; y: number }[]> = {};
for (const s of GROUND_SPAWNS) {
  (groundItemSpawns[s.item] ??= []).push({ x: s.x, y: s.y });
}

const itemUsedIn: Record<string, string[]> = {};
function noteUse(item: string, desc: string) {
  (itemUsedIn[item] ??= []).push(desc);
}

for (const c of recipesJson.cookables) {
  noteUse(c.raw, `Cook into ${ITEMS[c.cooked]?.name ?? c.cooked} (Cooking ${c.level}, ${c.xp} XP)`);
}
for (const s of recipesJson.smeltables) {
  for (const inp of s.inputs) noteUse(inp.item, `Smelt ${ITEMS[s.bar]?.name ?? s.bar}`);
}
for (const s of recipesJson.smithables) {
  noteUse(s.bar, `Smith ${ITEMS[s.output]?.name ?? s.output}`);
}
for (const f of recipesJson.fletchables) {
  for (const inp of f.inputs) noteUse(inp.item, `Fletch ${ITEMS[f.output]?.name ?? f.output}`);
}
for (const c of recipesJson.craftables) {
  for (const inp of c.inputs) noteUse(inp.item, `Craft ${ITEMS[c.output]?.name ?? c.output}`);
}
for (const g of recipesJson.gemCuts) noteUse(g.uncut, `Cut into ${ITEMS[g.cut]?.name ?? g.cut}`);
for (const h of recipesJson.herbs) noteUse(h.grimy, `Clean into ${ITEMS[h.clean]?.name ?? h.clean}`);
for (const pot of recipesJson.potions) {
  noteUse(pot.herb, `Mix ${ITEMS[pot.output]?.name ?? pot.output}`);
  noteUse(pot.secondary, `Mix ${ITEMS[pot.output]?.name ?? pot.output}`);
}
for (const sp of magicJson.spells) {
  for (const r of sp.runes) noteUse(r.item, `Cast ${sp.name}`);
}

const SHOP_NPCS: Record<string, { npc: string; x: number; y: number }> = {
  general: { npc: 'shopkeeper', x: 35, y: 49 },
  magic: { npc: 'magic_tutor', x: 42, y: 30 },
  gardener: { npc: 'gardener', x: 36, y: 23 },
  aldgate_armoury: { npc: 'armourer', x: 116, y: 23 },
  aldgate_food: { npc: 'grocer', x: 116, y: 44 },
  brackwater_fish: { npc: 'fishmonger', x: 107, y: 187 },
  nomad_supplies: { npc: 'desert_nomad', x: 13, y: 178 },
  gem_stall: { npc: 'gem_trader', x: 18, y: 178 },
  gun_guild: { npc: 'gun_trainer', x: 118, y: 21 },
};

const REGIONS = [
  { slug: 'the-castle', name: 'The Castle', desc: 'The starting area around the duke\'s castle. Bank, cooking range, general store, chicken farm, cow field, and the first quests await newcomers here.', x: 21, y: 37 },
  { slug: 'aldgate', name: 'Aldgate', desc: 'A walled city with the Aldgate Exchange plaza, bank, armoury, food shop, inn, and city guards. The commercial heart of the realm.', x: 103, y: 30 },
  { slug: 'warlords-fort', name: "Warlord's Fort", desc: 'A goblin palisade east of Aldgate. The Goblin Warlord holds court here — home of The Warlord\'s Banner quest.', x: 146, y: 21 },
  { slug: 'swamp-mine', name: 'Swamp Mine', desc: 'Copper, tin, and iron rocks in the southern swamp. Herbs grow on the ground and the cave mouth leads to the Underdeep.', x: 22, y: 68 },
  { slug: 'deep-bog', name: 'Deep Bog', desc: 'South of the swamp mine. The Bog Horror lurks here — target of Heart of the Bog.', x: 24, y: 95 },
  { slug: 'underdeep', name: 'The Underdeep', desc: 'Underground cavern with mithril, adamantite, and lava. The Shadow Drake nests at the far end.', x: 105, y: 135 },
  { slug: 'frostpeak', name: 'Frostpeak Mountains', desc: 'Ice trolls, wolves, and agility obstacles. Maraza the Rimebound holds the summit.', x: 196, y: 55 },
  { slug: 'sunscorch-desert', name: 'Sunscorch Desert', desc: 'Scorpions, desert bandits, nomad tents, and the gem stall. Saif the Red Smile rules the deep dunes.', x: 35, y: 190 },
  { slug: 'port-brackwater', name: 'Port Brackwater', desc: 'Fishing docks, fishmonger, and harbormaster. Tidefest sharks are landed here.', x: 105, y: 196 },
  { slug: 'ashen-depths', name: 'Ashen Depths', desc: 'Beyond the Underdeep — magma crawlers, ash fiends, and Korr the Molten at the deepest lava pools.', x: 190, y: 135 },
  { slug: 'hunter-meadow', name: 'Hunter Meadow', desc: 'Quiet meadow suited for bird snaring and low-level hunting.', x: 64, y: 77 },
];

const QUESTS: {
  id: string; name: string; giver: string; giverNpc: string; location: string;
  requirements: string[]; steps: string[]; rewards: string[];
  xp: string[]; prereq?: string;
}[] = [
  {
    id: 'getting_started', name: 'Getting Started', giver: 'Tutorial overlay', giverNpc: '', location: 'The Castle (auto)',
    requirements: ['New character with no other quest progress'],
    steps: [
      'Walk somewhere by clicking the ground.',
      'Open your inventory tab on the side panel.',
      'Chop a tree with a bronze axe for Woodcutting XP.',
      'Light a fire with a tinderbox and logs.',
      'Cook food on a fire or range.',
      'Talk to any NPC.',
    ],
    rewards: ['3 bread', '50 coins'],
    xp: [],
  },
  {
    id: 'empty_larder', name: 'The Empty Larder', giver: 'Cook Edda', giverNpc: 'cook', location: 'Castle kitchen (17, 43)',
    requirements: ['None'],
    steps: [
      'Talk to Cook Edda and accept the quest.',
      'Fetch an egg from the chicken farm (ground spawns at 31,11 and 35,13).',
      'Milk a cow with a bucket (buy bucket from general store).',
      'Buy or steal bread from the general store or bake stall.',
      'Return all three ingredients to Cook Edda.',
    ],
    rewards: ['1 cake'],
    xp: ['300 Cooking XP'],
  },
  {
    id: 'seeds_of_trouble', name: 'Seeds of Trouble', giver: 'Old Fen', giverNpc: 'gardener', location: 'Gardens (36, 23)',
    requirements: ['None'],
    steps: [
      'Talk to Old Fen and accept.',
      'Kill 5 goblins east of the castle.',
      'Bring one cabbage to Old Fen.',
    ],
    rewards: ['2 potato seeds', '2 cabbage seeds', '200 coins'],
    xp: ['500 Farming XP'],
  },
  {
    id: 'streets_of_aldgate', name: 'Streets of Aldgate', giver: 'Maro (innkeeper)', giverNpc: 'innkeeper', location: 'Gilded Kettle, Aldgate (89, 22)',
    requirements: ['None'],
    steps: [
      'Talk to Maro at the Gilded Kettle inn.',
      'Gather 3 logs (chop any tree) and 1 plank (carpenter or sawmill).',
      'Return the timber to Maro.',
    ],
    rewards: ['150 coins'],
    xp: ['300 Construction XP'],
  },
  {
    id: 'warlords_banner', name: "The Warlord's Banner", giver: 'City Guard', giverNpc: 'city_guard', location: 'Aldgate walls (79, 37)',
    requirements: ['Combat gear and food recommended'],
    steps: [
      'Talk to a city guard in Aldgate.',
      'Travel east to the Warlord\'s Fort.',
      'Slay the Goblin Warlord (drops banner always).',
      'Return the warlord banner to any city guard.',
    ],
    rewards: ['500 coins'],
    xp: ['800 Attack XP'],
  },
  {
    id: 'heart_of_the_bog', name: 'Heart of the Bog', giver: 'Old Fen', giverNpc: 'gardener', location: 'Gardens — Ask-about-bog (36, 23)',
    requirements: ['Complete Seeds of Trouble'],
    steps: [
      'Complete Seeds of Trouble first.',
      'Right-click Old Fen → Ask-about-bog.',
      'Travel south through the swamp to the Deep Bog.',
      'Slay the Bog Horror and take its bog heart.',
      'Return the heart to Old Fen.',
    ],
    rewards: ['2 attack potions', '2 defence potions'],
    xp: ['600 Herblore XP', '600 Farming XP'],
    prereq: 'Seeds of Trouble',
  },
  {
    id: 'embers_below', name: 'Embers Below', giver: 'Brogan (slayer master)', giverNpc: 'slayer_master', location: 'Castle (30, 35) — Ask-about-embers',
    requirements: ['Combat gear, food, prayers recommended'],
    steps: [
      'Right-click Brogan → Ask-about-embers.',
      'Enter the cave at the south edge of the swamp mine.',
      'Slay the Shadow Drake at the cavern\'s far end.',
      'Bring the ember crystal to Brogan.',
    ],
    rewards: ['1 mithril scimitar', '1500 coins'],
    xp: ['1000 Slayer XP', '800 Smithing XP'],
  },
  {
    id: 'frozen_crown', name: 'The Frozen Crown', giver: 'Guide Torvald', giverNpc: 'mountain_guide', location: 'Frostpeak foothills (172, 54) — Ask-about-the-peak',
    requirements: ['High combat and food'],
    steps: [
      'Talk to Torvald → Ask-about-the-peak.',
      'Climb the Frostpeak Mountains to the summit.',
      'Slay Maraza the Rimebound (ice queen).',
      'Return to Torvald.',
    ],
    rewards: ['2000 coins', '1 prayer potion'],
    xp: ['1200 Agility XP', '1200 Magic XP'],
  },
  {
    id: 'red_smile', name: 'The Red Smile', giver: 'Nomad Zahra', giverNpc: 'desert_nomad', location: 'Sunscorch Desert (13, 178) — Ask-about-bandits',
    requirements: ['Combat gear'],
    steps: [
      'Talk to Zahra → Ask-about-bandits.',
      'Travel deep into the southwest dunes.',
      'Slay Saif the Red Smile (bandit king).',
      'Return to Zahra.',
    ],
    rewards: ['1 sapphire ring', '1500 coins'],
    xp: ['900 Thieving XP', '900 Attack XP'],
  },
  {
    id: 'catch_of_a_lifetime', name: 'The Catch of a Lifetime', giver: 'Harbormaster Quill', giverNpc: 'harbormaster', location: 'Port Brackwater (118, 210) — Ask-about-work',
    requirements: ['76 Fishing', 'Harpoon'],
    steps: [
      'Talk to Quill → Ask-about-work.',
      'Fish a shark at the harpoon spots on Brackwater docks.',
      'Bring a raw or cooked shark to Quill.',
    ],
    rewards: ['1 harpoon', '1000 coins'],
    xp: ['1800 Fishing XP', '800 Cooking XP'],
  },
  {
    id: 'ash_and_ruin', name: 'Ash and Ruin', giver: 'Brogan', giverNpc: 'slayer_master', location: 'Castle — Ask-about-the-depths',
    requirements: ['Complete Embers Below', 'High combat'],
    steps: [
      'Complete Embers Below first.',
      'Right-click Brogan → Ask-about-the-depths.',
      'Travel east through the Underdeep into the Ashen Depths.',
      'Slay Korr the Molten and take its molten core.',
      'Return the core to Brogan.',
    ],
    rewards: ['1 molten gauntlets', '3000 coins'],
    xp: ['2500 Slayer XP', '1500 Mining XP'],
    prereq: 'Embers Below',
  },
  {
    id: 'gem_problem', name: 'A Gem of a Problem', giver: 'Gem trader', giverNpc: 'gem_trader', location: 'Sunscorch (18, 178) — Ask-about-rumours',
    requirements: ['None'],
    steps: [
      'Talk to gem trader → Ask-about-rumours.',
      'Collect 3 uncut gems (sapphire, emerald, or ruby — any mix).',
      'Deliver them to the gem trader.',
    ],
    rewards: ['1 chisel', '800 coins'],
    xp: ['700 Crafting XP', '700 Mining XP'],
  },
  {
    id: 'lost_flock', name: "The Shepherd's Lost Flock", giver: 'Tanner', giverNpc: 'tanner', location: 'Near castle (37, 56) — Ask-about-wool',
    requirements: ['Shears'],
    steps: [
      'Talk to tanner → Ask-about-wool.',
      'Shear 5 sheep in the paddock north of the castle.',
      'Deliver 5 wool to the tanner.',
    ],
    rewards: ['500 coins', '2 balls of wool'],
    xp: ['600 Crafting XP', '400 Farming XP'],
  },
];

const data: WikiData = { generatedAt: new Date().toISOString(), articles: {}, search: [], categories: {} };

// ---- Home ----
addArticle(data, {
  slug: '',
  title: 'Larpscape Wiki',
  category: 'Main',
  excerpt: 'The official Larpscape game encyclopedia — items, quests, NPCs, skills, and more.',
  html: article('Larpscape Wiki', [
    p('Welcome to the <strong>Larpscape Wiki</strong>, the complete guide to the browser-based MMORPG at <a href="https://larpscape.net" class="wiki-link">larpscape.net</a>.'),
    h2('New players'),
    ul([
      link('guide/getting-started', 'Getting Started guide'),
      link('guide/controls', 'Controls'),
      link('guide/combat', 'Combat basics'),
      link('quest/getting_started', 'Getting Started quest'),
    ]),
    h2('Popular pages'),
    ul([
      link('guide/aldgate-exchange', 'Aldgate Exchange'),
      link('location/aldgate', 'Aldgate'),
      link('skill/woodcutting', 'Woodcutting'),
      link('skill/mining', 'Mining'),
      link('npc/goblin_warlord', 'Goblin Warlord'),
      link('item/mithril_scimitar', 'Mithril scimitar'),
    ]),
    h2('Browse by category'),
    ul([
      link('category/items', 'Items'),
      link('category/npcs', 'NPCs'),
      link('category/quests', 'Quests'),
      link('category/shops', 'Shops'),
      link('category/skills', 'Skills'),
      link('category/locations', 'Locations'),
      link('category/bosses', 'Bosses'),
      link('item-prices', 'Item prices (GE & shops)'),
    ]),
    h2('The world of Cantorne'),
    p('The world was <em>sung</em> into being by the Choir of Five — and something sour slipped into the final cadence. Every monster in Cantorne is a place where the song skipped, and every adventurer is a freelancer of the retuning. It is the year F.S. 743: a goblin warlord holds a fort, a horror has congealed in the bog, something is hammering at the bottom of the Ashen Depths, and a chimpanzee legally rules the Southern Lawn. Start with ' + link('lore/world', 'The World of Cantorne') + '.'),
    ul([
      link('lore/world', 'The World of Cantorne') + ' — cosmology and the four eras',
      link('lore/factions', 'Factions of Cantorne') + ' — from the Duchy to the chimp court',
      link('lore/bestiary', 'Bestiary of the Offnote') + ' — why monsters exist and what they drop',
      link('category/locations', 'Locations') + ' — every region, including the rumored lands',
    ]),
    h2('About the game'),
    p('Larpscape is a fan-made homage to classic RuneScape running entirely in the browser. All art and music are original. The game uses 600ms ticks, the classic XP curve, 24 trainable skills, multiplayer with Aldgate Exchange trading, and a growing world from The Castle through Aldgate to Frostpeak, the desert, and Port Brackwater.'),
  ].join('')),
});

// ---- Guides ----
function addGuide(slug: string, title: string, excerpt: string, body: string, ib?: [string, string][]) {
  addArticle(data, {
    slug: `guide/${slug}`,
    title,
    category: 'Guides',
    excerpt,
    html: article(title, body, ib ? infobox(title, ib) : undefined),
  });
}

addGuide('getting-started', 'Getting Started', 'New player guide for Larpscape.',
  [
    p('Larpscape begins at <strong>The Castle</strong>, a Lumbridge-inspired starter area. Create an account at <a href="https://larpscape.net" class="wiki-link">larpscape.net</a> or play offline with local saves.'),
    h2('First steps'),
    ul([
      'Complete the ' + link('quest/getting_started', 'Getting Started') + ' tutorial checklist (6 steps).',
      'Chop trees south of the castle for logs, then light a fire with your tinderbox.',
      'Cook raw shrimps from the river fishing spots on a fire or range.',
      'Bank your valuables at the ' + link('location/the-castle', 'castle bank') + ' (17, 31).',
      'Talk to ' + npcLink('cook') + ' for ' + questLink('empty_larder', 'The Empty Larder') + '.',
    ]),
    h2('Starter equipment'),
    p('The ' + shopLink('general') + ' sells bronze axe, pickaxe, tinderbox, fishing net, and basic tools. Prices are based on each item\'s base value.'),
    h2('Where to go next'),
    ul([
      link('location/aldgate', 'Aldgate') + ' — walled city with Aldgate Exchange, better shops, and more quests.',
      link('location/swamp-mine', 'Swamp Mine') + ' — copper, tin, iron, and the cave to the Underdeep.',
      link('quest/seeds_of_trouble', 'Seeds of Trouble') + ' — first combat quest from Old Fen.',
    ]),
  ].join(''),
  [['Released', 'v0.1'], ['Starting area', link('location/the-castle', 'The Castle')]],
);

addGuide('controls', 'Controls', 'Mouse and keyboard controls.',
  [
    h2('Movement'),
    ul([
      '<strong>Left click</strong> — walk to tile / default action (chop, mine, attack, talk)',
      '<strong>Right click</strong> — full context menu with all options',
      '<strong>Minimap click</strong> — walk to location',
      '<strong>M key</strong> — open world map',
    ]),
    h2('Interface'),
    ul([
      'Sidebar tabs: Inventory, Equipment, Skills, Quest journal, Music',
      '<strong>Run orb</strong> — toggle run (2 tiles per tick, drains energy)',
      '<strong>Compass</strong> — click to face north; middle-mouse drag to rotate camera',
      '<strong>Scroll wheel</strong> — zoom camera',
    ]),
    h2('Inventory'),
    ul([
      'Left click — context action (eat, wield, bury, cook)',
      'Right click — Drop, Examine, Use',
      'Bank: click to deposit/withdraw one; right-click for all',
    ]),
  ].join(''),
);

addGuide('combat', 'Combat', 'Melee, ranged, magic, and prayer combat.',
  [
    p('Combat runs on 600ms ticks. Choose your combat style to train Attack, Strength, or Defence. You earn 4 XP per damage dealt in your chosen style, plus 1.33 Hitpoints XP.'),
    h2('Combat styles'),
    table(['Style', 'Trains', 'Notes'], [
      ['Accurate', 'Attack', 'Balanced accuracy'],
      ['Aggressive', 'Strength', 'Higher max hit'],
      ['Defensive', 'Defence', 'Better defence rolls'],
      ['Controlled', 'Attack + Strength + Defence', 'Split XP'],
    ]),
    h2('Equipment'),
    p('Weapons provide attack and strength bonuses. Armour provides defence. Check item pages for stat bonuses and level requirements.'),
    h2('Prayer'),
    p('Bury bones for Prayer XP, then activate prayers from the Prayer tab. Recharge at altars. Prayers reduce damage — essential for bosses like the ' + npcLink('shadow_drake') + '.'),
    h2('Bosses'),
    ul([
      npcLink('goblin_warlord') + ' — telegraphed ground slam',
      npcLink('bog_horror') + ' — poison spit, self-heals',
      npcLink('shadow_drake') + ' — fire breath (mitigated by prayers)',
      npcLink('ice_queen') + ' — frost attacks at the summit',
      npcLink('bandit_king') + ' — desert bandit king',
      npcLink('magma_fiend') + ' — Korr the Molten in Ashen Depths',
    ]),
  ].join(''),
);

addGuide('aldgate-exchange', 'Aldgate Exchange', 'Player-driven trading in Aldgate.',
  [
    p('The Aldgate Exchange (GE) in ' + link('location/aldgate', 'Aldgate') + ' plaza lets players buy and sell items through an order book. Talk to a GE clerk or use the GE booth.'),
    h2('How it works'),
    ul([
      'Place buy offers (coins escrowed) or sell offers (items escrowed)',
      'Offers match automatically when prices cross',
      'Collect items and coins from completed offers',
      '4 offer slots per player',
    ]),
    h2('Prices'),
    p('GE prices are <strong>player-driven</strong> — the last traded price is shown on item pages and the ' + link('item-prices', 'price list') + '. Shop prices use each item\'s fixed base value (buy at full value, sell at 40%).'),
    h2('Location'),
    p('GE booths and clerks are in Aldgate plaza around coordinates (101–105, 30).'),
  ].join(''),
  [['Location', link('location/aldgate', 'Aldgate')], ['Type', 'Order book']],
);

// ---- Category indexes ----
function addCategory(slug: string, title: string, cat: string, intro: string) {
  // populated after finalize — we'll add a placeholder and rebuild in finalize step
  addArticle(data, {
    slug: `category/${slug}`,
    title,
    category: 'Categories',
    excerpt: `All ${title.toLowerCase()} in Larpscape.`,
    html: article(title, [p(intro), '<div id="cat-list-' + slug + '"></div>'].join('')),
  });
}

addCategory('items', 'Items', 'Items', 'Every item in the game with examine text, stats, shop stock, and Aldgate Exchange prices.');
addCategory('npcs', 'NPCs', 'NPCs', 'All NPCs including monsters, shopkeepers, quest givers, and bosses.');
addCategory('quests', 'Quests', 'Quests', 'All quests with step-by-step walkthroughs and rewards.');
addCategory('shops', 'Shops', 'Shops', 'Every shop, its stock, location, and pricing.');
addCategory('skills', 'Skills', 'Skills', 'All 24 trainable skills with training methods.');
addCategory('locations', 'Locations', 'Locations', 'Regions and areas across the world map.');
addCategory('bosses', 'Bosses', 'Bosses', 'Boss monsters with mechanics and quest ties.');
addCategory('lore', 'Lore', 'Lore', 'The history, cosmology, factions, and peoples of Cantorne — adapted from the Cantorne Codex.');

// ---- Item prices master page ----
{
  const rows = Object.entries(ITEMS)
    .filter(([id]) => id !== 'coins')
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([id, it]) => [
      itemLink(id),
      String(it.value),
      String(shopBuyPrice(it.value)),
      String(shopSellPrice(it.value)),
      (itemShops[id] ?? []).map((s) => shopLink(s.shop)).join(', ') || '—',
      `<span class="ge-price" data-item="${esc(id)}">—</span>`,
    ]);
  addArticle(data, {
    slug: 'item-prices',
    title: 'Item prices',
    category: 'Guides',
    excerpt: 'Shop buy/sell prices and live Aldgate Exchange last-trade prices for every item.',
    html: article('Item prices', [
      p('Shop <strong>buy</strong> price = item base value (rounded up). Shop <strong>sell</strong> price = 40% of base value (rounded down). GE prices are fetched live from player trades.'),
      table(['Item', 'Base value', 'Shop buy', 'Shop sell', 'Sold in shops', 'GE last price'], rows),
    ].join('')),
  });
}

// ---- Items ----
for (const [id, it] of Object.entries(ITEMS)) {
  if (id === 'coins') continue;
  const ibRows: [string, string][] = [['Examine', esc(it.examine)]];
  ibRows.push(['Value', `${it.value} coins`]);
  ibRows.push(['Shop buy', `${shopBuyPrice(it.value)} coins`]);
  ibRows.push(['Shop sell', `${shopSellPrice(it.value)} coins`]);
  ibRows.push(['GE price', `<span class="ge-price" data-item="${esc(id)}">Loading…</span>`]);
  if (it.stackable) ibRows.push(['Stackable', 'Yes']);
  if (it.equipSlot) {
    ibRows.push(['Slot', esc(it.equipSlot)]);
    if (it.attBonus) ibRows.push(['Attack bonus', String(it.attBonus)]);
    if (it.strBonus) ibRows.push(['Strength bonus', String(it.strBonus)]);
    if (it.defBonus) ibRows.push(['Defence bonus', String(it.defBonus)]);
    if (it.rangedBonus) ibRows.push(['Ranged bonus', String(it.rangedBonus)]);
    if (it.gunBonus) ibRows.push(['Gun bonus', String(it.gunBonus)]);
    if (it.attackSpeed) ibRows.push(['Attack speed', `${it.attackSpeed} ticks`]);
    if (it.levelReq?.length) {
      ibRows.push(['Requirements', it.levelReq.map((r) => `${r.level} ${r.skill}`).join(', ')]);
    }
  }
  if (it.edible) ibRows.push(['Heals', `${it.edible.heals} HP`]);
  if (it.buryXp) ibRows.push(['Prayer XP (bury)', String(it.buryXp)]);
  if (it.restoresPrayer) ibRows.push(['Restores prayer', String(it.restoresPrayer)]);

  const sections: string[] = [p(it.examine)];

  const shops = itemShops[id];
  if (shops?.length) {
    sections.push(h2('Shop locations'));
    sections.push(table(['Shop', 'Initial stock', 'Location'], shops.map((s) => {
      const meta = SHOP_NPCS[s.shop];
      const loc = meta ? `(${meta.x}, ${meta.y})` : '';
      return [shopLink(s.shop), String(s.qty), loc];
    })));
  }

  const spawns = groundItemSpawns[id];
  if (spawns?.length) {
    sections.push(h2('Ground spawns'));
    sections.push(ul(spawns.map((s) => `(${s.x}, ${s.y})`)));
  }

  const uses = itemUsedIn[id];
  if (uses?.length) {
    sections.push(h2('Used in'));
    sections.push(ul([...new Set(uses)].slice(0, 20)));
  }

  // Drops from NPCs
  const droppedBy: string[] = [];
  for (const [npcId, npc] of Object.entries(NPCS)) {
    if (npc.drops?.some((d) => d.item === id)) droppedBy.push(npcLink(npcId));
  }
  if (droppedBy.length) {
    sections.push(h2('Dropped by'));
    sections.push(ul(droppedBy));
  }

  addArticle(data, {
    slug: `item/${id}`,
    title: it.name,
    category: 'Items',
    excerpt: it.examine,
    html: article(it.name, sections.join(''), infobox(it.name, ibRows)),
  });
}

// ---- NPCs ----
for (const [id, npc] of Object.entries(NPCS)) {
  const ibRows: [string, string][] = [
    ['Examine', esc(npc.examine)],
    ['Combat level', String(npc.combatLevel)],
    ['Hitpoints', String(npc.hitpoints)],
  ];
  if (npc.aggressive) ibRows.push(['Aggressive', 'Yes']);
  if (npc.boss) ibRows.push(['Boss', 'Yes']);
  if (npc.attackable) ibRows.push(['Attackable', 'Yes']);
  if (npc.option) ibRows.push(['Special option', esc(npc.option)]);

  const sections: string[] = [p(npc.examine)];

  const lore = NPC_LORE[id];
  if (lore) {
    sections.push(h2('Lore'));
    sections.push(p(lore));
  }

  const locs = npcLocations[id];
  if (locs?.length) {
    sections.push(h2('Locations'));
    sections.push(ul(locs.map((l) => `(${l.x}, ${l.y})`)));
  } else if (!npc.boss) {
    sections.push(p('<em>This NPC is defined but not currently spawned in the world.</em>'));
  }

  if (npc.attackable) {
    sections.push(h2('Combat stats'));
    sections.push(table(['Stat', 'Value'], [
      ['Attack', String(npc.attack)],
      ['Strength', String(npc.strength)],
      ['Defence', String(npc.defence)],
      ['Attack speed', `${npc.attackSpeed} ticks`],
      ['Respawn', `${npc.respawnTicks} ticks`],
    ]));
  }

  if (npc.drops?.length) {
    sections.push(h2('Drops'));
    sections.push(table(['Item', 'Quantity', 'Chance'], npc.drops.map((d) => [
      itemLink(d.item),
      d.qty[0] === d.qty[1] ? String(d.qty[0]) : `${d.qty[0]}–${d.qty[1]}`,
      chanceLabel(d.chance),
    ])));
  }

  if (npc.pickpocket) {
    sections.push(h2('Pickpocket'));
    sections.push(table(['Level', 'XP', 'Stun damage'], [[
      String(npc.pickpocket.level),
      String(npc.pickpocket.xp),
      String(npc.pickpocket.stunDmg),
    ]]));
    if (npc.pickpocket.loot?.length) {
      sections.push(table(['Loot', 'Qty'], npc.pickpocket.loot.map((l) => [
        itemLink(l.item),
        `${l.qty[0]}–${l.qty[1]}`,
      ])));
    }
  }

  const slayer = magicJson.slayerTargets.find((t) => t.npc === id);
  if (slayer) sections.push(p(`Slayer level required: <strong>${slayer.level}</strong>`));

  const cat = npc.boss ? 'Bosses' : 'NPCs';
  addArticle(data, {
    slug: `npc/${id}`,
    title: npc.name,
    category: cat,
    excerpt: `${npc.name} — combat level ${npc.combatLevel}. ${npc.examine}`,
    html: article(npc.name, sections.join(''), infobox(npc.name, ibRows)),
  });
}

// ---- Shops ----
for (const [id, shop] of Object.entries(SHOPS)) {
  const meta = SHOP_NPCS[id];
  const ibRows: [string, string][] = [['Items', String(shop.stock.length)]];
  if (meta) {
    ibRows.push(['NPC', npcLink(meta.npc)]);
    ibRows.push(['Location', `(${meta.x}, ${meta.y})`]);
  }

  const rows = shop.stock.map((s) => {
    const it = ITEMS[s.item];
    const val = it?.value ?? 0;
    return [
      itemLink(s.item),
      String(s.qty),
      String(shopBuyPrice(val)),
      String(shopSellPrice(val)),
    ];
  });

  addArticle(data, {
    slug: `shop/${id}`,
    title: shop.name,
    category: 'Shops',
    excerpt: `${shop.name} — ${shop.stock.length} items in stock.`,
    html: article(shop.name, [
      p(`Trade with ${meta ? npcLink(meta.npc) : 'the shopkeeper'} at ${meta ? `(${meta.x}, ${meta.y})` : 'the shop location'}.`),
      h2('Stock'),
      table(['Item', 'Qty', 'Buy price', 'Sell price'], rows),
      p('Buy price = item base value. Sell price = 40% of base value. Stock replenishes when players sell items back.'),
    ].join(''), infobox(shop.name, ibRows)),
  });
}

// ---- Quests ----
for (const q of QUESTS) {
  const ibRows: [string, string][] = [
    ['Quest points', '—'],
    ['Difficulty', q.id.includes('ash') || q.id.includes('frozen') ? 'Experienced' : q.id.includes('warlord') || q.id.includes('embers') ? 'Intermediate' : 'Novice'],
  ];
  if (q.giverNpc) ibRows.push(['Start point', npcLink(q.giverNpc, q.giver)]);
  else ibRows.push(['Start point', esc(q.giver)]);
  ibRows.push(['Location', esc(q.location)]);
  if (q.prereq) ibRows.push(['Prerequisite', esc(q.prereq)]);

  addArticle(data, {
    slug: `quest/${q.id}`,
    title: q.name,
    category: 'Quests',
    excerpt: `${q.name} — started at ${q.location}.`,
    html: article(q.name, [
      h2('Overview'),
      p(`${q.name} is a quest started by talking to ${q.giverNpc ? npcLink(q.giverNpc, q.giver) : esc(q.giver)} at ${esc(q.location)}.`),
      h2('Requirements'),
      ul(q.requirements.map(esc)),
      h2('Walkthrough'),
      ul(q.steps.map((s, i) => `<strong>${i + 1}.</strong> ${esc(s)}`)),
      h2('Rewards'),
      ul([...q.rewards.map((r) => esc(r)), ...q.xp.map((x) => esc(x))]),
    ].join(''), infobox(q.name, ibRows)),
  });
}

// ---- Skills ----
const SKILL_GUIDES: Record<string, string> = {
  Attack: 'Train by dealing damage in Accurate or Controlled combat style. Quest rewards and boss kills grant large XP lamps.',
  Hitpoints: 'Earned automatically from all combat — 1.33 XP per damage dealt.',
  Mining: 'Mine rocks with a pickaxe. Copper/tin at level 1, iron at 15, coal at 30, mithril and adamantite in the Underdeep.',
  Strength: 'Train with Aggressive or Controlled combat style for higher max hits.',
  Agility: 'Complete the agility course obstacles for lap XP. Frostpeak has additional obstacles.',
  Smithing: 'Smelt bars at a furnace, smith items at an anvil. Bronze through rune tiers available.',
  Defence: 'Train with Defensive or Controlled combat. Armour with high defence bonus helps survivability.',
  Herblore: 'Clean grimy herbs, mix with secondaries in vials of water. Potions restore stats in combat.',
  Fishing: 'Net shrimps at river spots, bait fish with rod, lobster pot and harpoon at higher levels. Port Brackwater has harpoon spots.',
  Ranged: 'Wield a bow and arrows. Shortbows through magic shortbow tiers. Trains Ranged XP on hit.',
  Thieving: 'Pickpocket NPCs or steal from the bake stall. Desert bandits offer higher-level pickpocketing.',
  Cooking: 'Cook raw food on fires or ranges. Burn rates decrease as level rises. Shrimps at 1, sharks at 80.',
  Prayer: 'Bury bones for XP. Activate prayers for combat boosts. Recharge at altars.',
  Crafting: 'Spin wool/flax, tan hides, craft leather armour and jewellery. Cut gems with a chisel.',
  Firemaking: 'Use tinderbox on logs. Higher logs grant more XP — oak, willow, maple, yew.',
  Magic: 'Cast strike and bolt spells with runes. Autocast from the spellbook. Runecraft at altars for runes.',
  Fletching: 'Use knife on logs for shafts, string bows, fletch arrows from arrowtips and feathers.',
  Woodcutting: 'Chop trees with an axe. Tree (1), oak (15), willow (30), maple (45), yew (60), magic (75).',
  Runecraft: 'Mine rune essence, craft runes at altars. Air altar at the stone circle near the castle.',
  Slayer: 'Get tasks from Brogan the slayer master. Kill assigned monsters for Slayer XP. Required for some high-level targets.',
  Farming: 'Rake patches, plant seeds, wait for growth, harvest. Seeds from Old Fen\'s stall.',
  Construction: 'Build at workbenches with planks and nails. Carpenter sells planks in the castle area.',
  Hunter: 'Set bird snares in the Hunter Meadow. Catch birds for Hunter XP and meat.',
  Gun: 'Train at the Aldgate Gun Guild. Load pistols with rounds and gunpowder. Unique ranged style.',
};

for (const skill of SKILLS) {
  const body: string[] = [p(SKILL_GUIDES[skill] ?? `Train ${skill} through related activities in the game.`)];

  // Add relevant tables
  if (skill === 'Cooking') {
    body.push(h2('Cookables'));
    body.push(table(['Raw', 'Cooked', 'Level', 'XP', 'Stop burn'], recipesJson.cookables.map((c) => [
      itemLink(c.raw), itemLink(c.cooked), String(c.level), String(c.xp), String(c.stopBurn),
    ])));
  }
  if (skill === 'Woodcutting' || skill === 'Firemaking') {
    body.push(h2('Trees'));
    body.push(table(['Tree', 'Level', 'XP', 'Product'], Object.entries(SKILL_OBJS)
      .filter(([k]) => k.startsWith('tree') || ['oak', 'willow', 'maple', 'yew', 'magic_tree'].includes(k))
      .map(([k, v]) => [OBJS[k]?.name ?? k, String(v.level), String(v.xp), itemLink(v.item)])));
  }
  if (skill === 'Mining') {
    body.push(h2('Rocks'));
    body.push(table(['Rock', 'Level', 'XP', 'Ore'], Object.entries(SKILL_OBJS)
      .filter(([k]) => k.startsWith('rocks_'))
      .map(([k, v]) => [OBJS[k]?.name ?? k, String(v.level), String(v.xp), itemLink(v.item)])));
  }
  if (skill === 'Smithing') {
    body.push(h2('Smelting'));
    body.push(table(['Bar', 'Level', 'XP', 'Inputs'], recipesJson.smeltables.map((s) => [
      itemLink(s.bar), String(s.level), String(s.xp),
      s.inputs.map((i) => `${i.qty}× ${ITEMS[i.item]?.name ?? i.item}`).join(', '),
    ])));
    body.push(h2('Smithing (sample)'));
    body.push(table(['Item', 'Bars', 'Level', 'XP'], recipesJson.smithables.slice(0, 15).map((s) => [
      itemLink(s.output), `${s.bars}× ${ITEMS[s.bar]?.name ?? s.bar}`, String(s.level), String(s.xp),
    ])));
    body.push(p(`…and ${recipesJson.smithables.length - 15} more recipes. See individual item pages.`));
  }
  if (skill === 'Magic') {
    body.push(h2('Spells'));
    body.push(table(['Spell', 'Level', 'XP', 'Max hit', 'Runes'], magicJson.spells.map((s) => [
      link(`spell/${s.id}`, s.name), String(s.level), String(s.xp), String(s.maxHit),
      s.runes.map((r) => `${r.qty}× ${ITEMS[r.item]?.name ?? r.item}`).join(', '),
    ])));
  }
  if (skill === 'Prayer') {
    body.push(h2('Prayers'));
    body.push(table(['Prayer', 'Level', 'Drain', 'Boost'], magicJson.prayers.map((pr) => [
      link(`prayer/${pr.id}`, pr.name), String(pr.level), String(pr.drain), `${pr.boost} ×${pr.mult}`,
    ])));
  }
  if (skill === 'Slayer') {
    body.push(h2('Slayer targets'));
    body.push(table(['Monster', 'Slayer level'], magicJson.slayerTargets.map((t) => [
      npcLink(t.npc), String(t.level),
    ])));
  }
  if (skill === 'Farming') {
    body.push(h2('Seeds'));
    body.push(table(['Seed', 'Produce', 'Level', 'Plant XP', 'Harvest XP'], recipesJson.seeds.map((s) => [
      itemLink(s.seed), itemLink(s.produce), String(s.level), String(s.plantXp), String(s.harvestXp),
    ])));
  }
  if (skill === 'Herblore') {
    body.push(h2('Herb cleaning'));
    body.push(table(['Grimy', 'Clean', 'Level', 'XP'], recipesJson.herbs.map((h) => [
      itemLink(h.grimy), itemLink(h.clean), String(h.level), String(h.xp),
    ])));
    body.push(h2('Potions'));
    body.push(table(['Potion', 'Level', 'XP', 'Ingredients'], recipesJson.potions.map((p) => [
      itemLink(p.output), String(p.level), String(p.xp),
      `${ITEMS[p.herb]?.name ?? p.herb} + ${ITEMS[p.secondary]?.name ?? p.secondary}`,
    ])));
  }

  addArticle(data, {
    slug: `skill/${skill.toLowerCase()}`,
    title: skill,
    category: 'Skills',
    excerpt: `How to train ${skill} in Larpscape.`,
    html: article(skill, body.join(''), infobox(skill, [['Members', 'No'], ['Max level', '99']])),
  });
}

// ---- Spells & prayers ----
for (const sp of magicJson.spells) {
  addArticle(data, {
    slug: `spell/${sp.id}`,
    title: sp.name,
    category: 'Magic',
    excerpt: `${sp.name} — Magic level ${sp.level}, max hit ${sp.maxHit}.`,
    html: article(sp.name, [
      p(`${sp.name} is a Magic spell requiring level ${sp.level}.`),
      table(['Rune', 'Qty'], sp.runes.map((r) => [itemLink(r.item), String(r.qty)])),
    ].join(''), infobox(sp.name, [
      ['Level', String(sp.level)], ['XP', String(sp.xp)], ['Max hit', String(sp.maxHit)],
    ])),
  });
}
for (const pr of magicJson.prayers) {
  addArticle(data, {
    slug: `prayer/${pr.id}`,
    title: pr.name,
    category: 'Prayer',
    excerpt: `${pr.name} — Prayer level ${pr.level}.`,
    html: article(pr.name, [
      p(`${pr.name} boosts ${pr.boost} by ${Math.round((pr.mult - 1) * 100)}% while active. Drains ${pr.drain} prayer points per ~12 ticks.`),
    ].join(''), infobox(pr.name, [
      ['Level', String(pr.level)], ['Drain rate', String(pr.drain)], ['Boost', `${pr.boost} ×${pr.mult}`],
    ])),
  });
}

// ---- Locations ----
for (const r of REGIONS) {
  const npcsHere = NPC_SPAWNS.filter((s) => {
    const dx = Math.abs(s.x - r.x);
    const dy = Math.abs(s.y - r.y);
    return dx < 40 && dy < 40;
  });
  const uniqueNpcs = [...new Set(npcsHere.map((s) => s.id))];

  const regionLore = REGION_LORE[r.slug];
  addArticle(data, {
    slug: `location/${r.slug}`,
    title: r.name,
    category: 'Locations',
    excerpt: r.desc,
    html: article(r.name, [
      p(r.desc),
      regionLore ? h2('Lore') : '',
      regionLore ?? '',
      h2('Map coordinates'),
      p(`Centre: approximately <strong>(${r.x}, ${r.y})</strong>. Open the world map in-game with the globe button or M key.`),
      uniqueNpcs.length ? h2('Notable NPCs') : '',
      uniqueNpcs.length ? ul(uniqueNpcs.map((id) => npcLink(id))) : '',
    ].join(''), infobox(r.name, [['Region', r.name]])),
  });
}

// ---- Lore pages (world history, factions, bestiary, extra regions, rumored lands) ----
addLorePages(data);

// ---- Objects (skill nodes) ----
for (const [id, obj] of Object.entries(OBJS)) {
  const sk = SKILL_OBJS[id];
  if (!sk && !obj.action) continue;
  const sections = [p(obj.examine)];
  if (sk) {
    sections.push(table(['Level', 'XP', 'Product'], [[String(sk.level), String(sk.xp), itemLink(sk.item)]]));
  }
  addArticle(data, {
    slug: `object/${id}`,
    title: obj.name,
    category: 'Objects',
    excerpt: obj.examine,
    html: article(obj.name, sections.join(''), infobox(obj.name, [
      ['Action', esc(obj.action ?? 'Examine')],
      ...(sk ? [['Level', String(sk.level)], ['XP', String(sk.xp)]] as [string, string][] : []),
    ])),
  });
}

// Rebuild category pages with actual lists
finalize(data);
for (const [cat, articles] of Object.entries(data.categories)) {
  const slug = cat.toLowerCase().replace(/\s+/g, '-');
  const page = data.articles[`category/${slug}`];
  if (!page) continue;
  const list = articles.map((a) => `<li>${link(a.slug, a.title)}</li>`).join('');
  page.html = page.html.replace(`<div id="cat-list-${slug}"></div>`, `<ul class="cat-list">${list}</ul>`);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
console.log(`Wiki data written: ${OUT}`);
console.log(`${Object.keys(data.articles).length} articles across ${Object.keys(data.categories).length} categories`);
