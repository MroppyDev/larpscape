// Lore content for the Larpscape wiki, adapted from docs/LORE.md (the Cantorne Codex).
// Every fact here is canon; contradicting the Codex is a bug.
import {
  type WikiData, link, p, h2, h3, ul, infobox, article, addArticle,
} from '../scripts/wiki-helpers';

const n = (id: string, text: string) => link(`npc/${id}`, text);
const loc = (slug: string, text: string) => link(`location/${slug}`, text);

// ---------------------------------------------------------------------------
// Per-NPC lore paragraphs, keyed by npc id. Rendered on each NPC page.
// ---------------------------------------------------------------------------
export const NPC_LORE: Record<string, string> = {
  man: 'Citizens of Bellmeadow and Aldgate — farmers, clerks, and gawkers. Each wants, on average, one quiet decade. Pickpockets find their pockets disappointingly honest.',
  goblin: 'A war-chant from the Discord Wars that never stopped marching, given legs by the Offnote. Goblins spawn wherever old battle-rhythm soaked into the ground; they carry bronze swords because they cannot forge, only take. A warband\'s banner is its sheet music — tear it down and the band forgets its own rhythm.',
  chicken: 'Yep, definitely a chicken. The chicken farm predates the castle, and the chickens know this.',
  cow: 'Converts grass into beef. Content. The most in-tune creature in the vale — Syla\'s gift, perfectly on pitch and completely unbothered.',
  giant_rat: 'Ordinary vermin grown fat on grain stores and discord-mote runoff from the bog. Wants your lunch, structurally.',
  shopkeeper: 'Bellmeadow\'s general-store keeper, third generation behind that counter. Keeps a ledger of every adventurer\'s first purchase, out of sentiment, and wants nothing to change, ever.',
  banker: 'An officer of the Vaultwrights, the realm-wide banking order whose vaults are tuned chambers — the world\'s song keeps your goods in stasis, which is why banks are everywhere and identical. Wants your deposits and your discretion.',
  sheep: 'A walking jumper that hasn\'t been knitted yet. Wants grass; tolerates shears.',
  tanner: 'Bellmeadow\'s tanner, who turns cowhides into leather for a modest fee. His nose burned out years ago — the famous tannery smell is, to him, a rumour. Forever in want of reliable wool suppliers.',
  slayer_master: 'Brogan is a Discord Wars veteran, and his famous "list of grudges" is in fact the duchy\'s official ledger of untuned creatures, kept in his handwriting with annotations like "owes me a boot." Slayer is his ledger-craft: the science of which skipped note a monster is, and what retunes it fastest. The first name on the list is crossed out so hard it tore the page. He won\'t say whose it was.',
  magic_tutor: 'Mira is an Aldgate-trained songcaster who took the quiet vale posting on purpose; her sleeves smell faintly of ozone. Her first lesson: the world is a sentence, and you are allowed to edit. She wants one student a decade worth teaching, suspects you might be it, and will never say so.',
  gardener: 'Old Fen knows every weed in the realm by first name. He is Bellmeadow\'s gardener and the Stillwater Circle\'s vale-side friend — "Fen" is a Circle name, not a birth name; he took it the day he left the Eastern Marshes. He holds that a well-turned patch is a tuned instrument.',
  cook: 'Cook Edda runs the castle kitchen with an iron ladle. She fed three armies during the Discord Wars from one larder, and the banquet panic of The Empty Larder is her worst nightmare recurring. She wants the duke to eat fewer than three slices. She fails wanting it.',
  carpenter: 'Carpenter Lenny measures twice, saws once, sweeps never. He built half the market stalls and the LARP field\'s totems — the Chimperton court pays promptly. Wants someone else to invent the broom rota.',
  goblin_warlord: 'The Broken-Tooth conductor: a marching-chant grown a conductor of its own, and the first goblin since F.S. 701 to hold a fort — which means some banner survived the Discord Wars that shouldn\'t have. His banner is load-bearing in the literal sense: it is the warband\'s sheet music, which is why every warband collapses when its warlord falls. He wants to be a verse of history. He will settle for a footnote with casualties.',
  bog_horror: 'The drowned refrain of three villages lost on the Night of Skipped Beats (F.S. 612), circulating in the peat for centuries until it congealed a body in F.S. 742 — a heap of swamp that decided to hold grudges. It drops back what the bog swallowed, slightly fermented. What it wants — and this is the unsettling part — is to be <em>heard</em>.',
  shadow_drake: 'A drake the colour of a bad night, hatched in the Underdeep dark from an egg laid during the wars. Its scales shed darkness the way hot iron sheds sparks — a blade quenched in its blood holds an edge of night. It wants the dark to stay unbothered. You are bother.',
  city_guard: 'Aldgate\'s watch keeps the peace, mostly by leaning on things. They are paid by the Concord of Weights, and any guard can deputize an adventurer against the Warlord. Collectively they want a quiet shift and a sandwich.',
  ge_clerk: 'Exchange clerks buy low, sell high, and blink rarely. Each is sworn to the Concord\'s neutrality oath — a clerk may not own what they list. They want order books that balance, and fear nothing except round numbers.',
  innkeeper: 'Maro keeps Aldgate\'s inn and polishes the same tankard all day, and it gleams. The tankard was his brother\'s — a Discord Wars man who never came back for it. It will be full and gleaming when he does.',
  ice_troll: 'Boulders that Maraza\'s unfinished note taught to have opinions, and frostbite. They drop ore and the occasional sapphire because they <em>are</em> mineral. What they want is warmth, eventually, but on their own terms.',
  ice_wolf: 'Wolves the colour of a hard winter — Frostpeak\'s honest predators, not Offnote work at all. They want elk. They accept adventurers.',
  scorpion: 'The desert\'s opinion of visitors, in armour — all attitude and the arithmetic of stings. Not the Offnote\'s work; just Sunscorch being honest. Wants shade and the last word.',
  desert_bandit: 'Saif\'s Red Smiles travel light: a blade, a grin, and your purse. Most are caravan kids who chose the wrong charisma to follow — Saif teaches greed, not discipline, which is why their pockets pick so easily. The quieter ones want out. The louder ones want <em>yours</em>.',
  magma_crawler: 'A many-legged ember that never learned to cool — spillage from Korr\'s forge given legs. It drops gold ore, coal, and fire runes because it is, essentially, ambulatory slag. It wants fuel. It is fuel. It has not resolved this.',
  ash_fiend: 'A scorched silhouette: the shapes of the Depths\' dead miners, baked into the rock and peeled off by Korr\'s hammering. They carry the deep\'s treasury — chaos runes, runite, rubies — because ghosts inherit the estate. They want the hammering to stop. They express this poorly.',
  ice_queen: 'Maraza, last Queen of the Frostpeak holds and greatest singer of her age, was convinced she could sing a Verse of the First Chord alone. She attempted her Solo at the summit in F.S. 402; the note holds her, her court, and the high passes in ice mid-syllable, and she has been furious about it for 341 years. The cold radiating from the unfinished note is why the passes never thaw. She wants to finish the note. The mountain prays she never does.',
  bandit_king: 'Saif the Red Smile is King of the Dunes by vote; he counted the votes himself. A Sarrash-blooded showman who believes the desert owes his family a city — and his red sash is genuine Sarrash temple silk, so he may be right. When he finally falls, the smile is surrendered with the sash.',
  magma_fiend: 'Korr the Molten is the Offnote\'s second great fragment, wearing a body of slag. "Stone that walks. Fire that thinks," in Brogan\'s words — the deep speaks in fire, and Korr is its loudest word. The hammering heard at night in the upper caves is Korr forging, day and night, at the bottom of the Ashen Depths. Nobody knows what. Brogan\'s worst theory: a <em>bell</em>.',
  fishmonger: 'Fishmonger Pell smells of the sea and sound business sense — Brackwater\'s fish trade in one apron. He wants Tidefest gold and lobster futures. He cannot swim, and considers this a professional boundary.',
  harbormaster: 'Harbormaster Quill keeps the tide schedule in her head and the docks in line. Forty years of Tidefest entries are her ledger and her honour, and she means to keep Brackwater\'s name on the trade charts. The laid-up harpooner whose record needs defending was her student — and her son.',
  mountain_guide: 'Guide Torvald has fallen off every ledge on the mountain, once each, and counts ledges the way priests count beads. He keeps Frostpeak\'s routes open and teaches Agility as falling, postponed. He wants spring to reach the high passes before he\'s too old to see it.',
  desert_nomad: 'Nomad Zahra sells what the desert forgot you would need. She is the last of a Sarrash caravan line; her routes are inherited memory. She can read the script of the Sunken Ruins, and tells no one what the doorposts say.',
  gem_trader: 'Aldgate\'s gem trader has eyes like a jeweller\'s loupe and prices to match. She counts her stock twice and likes the answer less each time. She knows exactly who her thief is — the ledger matters more than the grudge.',
  bear: 'The forest\'s landlord. It was here first, and it knows it. It wants the rent: salmon, berries, distance.',
  dire_wolf: 'Too big for its forest and too hungry for yours — Syla\'s verse running loud in the deep woods. It wants the Tanglewood\'s old deep paths back from the spiders.',
  forest_spider: 'Cart-wheel-sized, none of the charm. The spiders choke the Tanglewood toll path whenever traffic lapses — the wood remembers every footfall, and so do they. They want the toll path quiet. Eldermere disagrees.',
  ruin_wraith: 'The choristers of Sarrash: notes that refused to return to Quiess when the singing city fell silent in F.S. 537. Cold shapes that remember the ruins when they had roofs, they drop grave dust (their own residue) and ranarr — the prayer-herb grows where prayer is owed. They want the final hymn sung so they can go home to Quiess. Slaying them is, technically, a mercy with XP.',
  pirate: 'Gullswreck Wreckers — everything they own belonged to someone else, drops included. They want what the sea takes, before the sea unpacks it.',
  pirate_captain: 'Captain Saltjaw, master of the cove\'s Wreckers, has a grin with more gold than teeth. He holds the chart to the wreck of the <em>Gull</em> — the treasure ship that named the cove — chained to his belt, and has never dived it. He is afraid of what his grandmother\'s log says went down <em>with</em> the gold, and would very much like someone else to find out first.',
  cinder_imp: 'Pocket-sized arsonists who giggle like cracking embers — Imber\'s verse over-concentrated on Cinderholm. The volcano is their parent and they are <em>so proud of it</em>. They want things to be briefly, beautifully on fire.',
  village_elder: 'Elder Maeryn is Eldermere\'s memory, conscience, and final word on everything. She wants the village fed and the wood respected — and she pays the Tanglewood an actual toll: a saucer of milk at the dark heart clearing, every Rest Day. She has never missed one.',
  boatman: 'Boatman Wick rows anywhere for a fair price and a dry story. He works the Brackstrait ferry and the Gullswreck run; the ferry lists worse than his last three marriages. He wants a boat that doesn\'t need him to be charming.',
  trapper: 'Trapper Hode smells of woodsmoke and pelts, and counts furs the way bankers count coins. He runs Stonewatch\'s fur trade and serves as its unofficial quartermaster; he wants the watch warm by winter. He also releases one bear a season — always the same one. They have an arrangement.',
  wayfarer: 'Wayfarer Sorrel is a travelling merchant whose pack holds a little of everywhere. She walks the Eldermere–vale circuit selling snares, not courage. She wants every road open and no road home.',
  armourer: 'Hetta the Armourer keeps her arms folded, like everything she sells, and does a short laugh instead of refunds. She wants one customer who oils their armour. She has wanted this for twenty years.',
  grocer: 'Pim the Grocer smells faintly of fresh bread and ambition. Nothing in his shop will bite you back, which in Aldgate is a strong guarantee. He wants a second stall on the plaza; the Concord keeps tabling it.',
  gun_trainer: 'Sergeant Vex, former city watch, teaches Gun to anyone who can keep both eyes open. She lost her watch commission for proving, publicly, that the watch armoury was selling powder to Saif\'s bandits — the Gun Guild hired her the same afternoon. She wants recruits who count their rounds, and she issues every adventurer their first Glock 18.',
  gun_guild_master: 'Master Flint heads the Aldgate Gun Guild; his coat has more pockets than sense. He personally swept up Hannelore Glock\'s pistol patterns 1 through 17 (the exploding ones, now on the memorial plaque). He wants the thunder-shale road safe and the Stillwater Circle to stop sending pamphlets. He reads every pamphlet. Twice.',
  casino_dealer: 'Dealer Pip runs Pip\'s House of Mild Regret (est. F.S. 731) with a smile sharp enough to cut cards. He once won the Aldgate city seal at cards from the last lord-mayor and returned it framed — which is how Aldgate ended up governed by a merchant council. The casino\'s charter was granted under Rest Day law, which is why it never closes. The house wins slightly more often; that\'s the definition of fair.',
  party_host: 'Host Hedon is professional enthusiasm in a waistcoat that has seen things. He runs the Hedonism Patch lounge — dance floor, hot tub, delayed regrets — and wants the conga line unbroken since F.S. 739 to stay unbroken. It has technically been one conga line. Shifts change.',
  bartender_fizz: 'Fizz shakes cocktails like personal grudges and pours courage in a glass. She wants the recipe for one drink her mentor took to sea. Saltjaw\'s Wreckers may have the recipe book. She doesn\'t know that yet.',
  pride_marshal: 'Marshal Riley keeps the parade route safe and the vibes immaculate. They raised Rainbow Avenue in F.S. 735; their words at the ribbon are quoted era canon: "We built it so the whole world could see we\'re still here, still fabulous." They want the Avenue to outlive everyone who needed it and welcome everyone who finds it.',
  drag_icon: 'Sashabella, legend of the stage, has eyeliner that could cut steel. The spotlight is negotiable, the drama complimentary. She sang in a Stillwater choir once, and the Circle quietly believes her encores are why the Offnote can\'t touch the Avenue. She believes it\'s the eyeliner. Both may be right.',
  larp_marshal_monk: 'Sir Chimpwick, marshal of the Black Monkey LARP Pride field, was knighted by Danquavious II for valour in re-enactment and takes the Foam Accord as holy writ — "foam swords only; real steel is for the goblin field" is Accord law, not a joke. He wants a perfect re-staging of the Battle of Aldgate Gates with zero injuries and full attendance.',
  larp_quartermaster: 'Quartermaster Peel sells foam weapons and capes loud enough to spot from the castle. Human; proceeds fund the monkey totems. Wants a foam pattern that survives more than one heroic death scene.',
  danquavious_chimperton: 'Danquavious Chimperton III, Sovereign of Bananas, Duke of the Southern Lawn, is the third chimp of his line since Duke Reginald the Odd\'s airtight will of F.S. 703 (do not ask about the First, who died beloved, or the Second, who abdicated to pursue percussion). He does not merely rule; he <em>chimps</em>. The only monarch in Cantorne to win both a joust and a banana-eating contest, he wants the golden banana on its pedestal to remain forever unpeeled — it was Reginald\'s last gift, and peeling it would end something he has no word for.',
  chimperton_herald: 'Herald Bananrick announces Danquavious with unnecessary volume and sells officially unofficial medallions. Human, and fluent in the court\'s gesture-protocol, he wants — one day — to be announced <em>himself</em>, by anyone, at any volume.',
  dentist_dr_tick: 'Dr. Ticksworth — dentist, tick wrangler, reluctant taste-tester supervisor — founded the Dentist Tick Eat clinic in F.S. 741 when he proved that bog ticks carrying discord-motes are neutralized by proper preparation and consumption. Dentistry in front, discord-mote remediation in back. He insists it\'s artisanal; it is, technically, public health. He wants academic recognition from Aldgate and receives clientele instead. He has never eaten one.',
  tick_eater_glen: 'Glen, the clinic\'s most dedicated patron and volunteer remediator, calls it farm-to-mouth protein. He has eaten more of the Offnote, gram for gram, than any mortal in history, with no effect except mild smugness. The Stillwater Circle has a thick file on Glen. Glen wants a bigger cracker.',
};

// ---------------------------------------------------------------------------
// Lore sections appended to existing location pages, keyed by region slug.
// ---------------------------------------------------------------------------
export const REGION_LORE: Record<string, string> = {
  'the-castle': [
    p('<strong>Bellmeadow</strong> is the oldest continuously settled vale in Cantorne, on the west bank of the ' + loc('river-murmur', 'River Murmur') + ' — the first mortals woke here mid-meadow in F.S. 1 with the Choir\'s melody stuck in their heads. <strong>Stonecourt Castle</strong> has warded it since Duke Coram the Mason raised the walls (F.S. 88–94).'),
    p('The current ruler is <strong>Duke Aldous Stonecourt</strong>, a decent administrator with a sweet tooth — ' + n('cook', 'Cook Edda') + ' confirms he had three slices at the banquet, and his physician is not to be told. Since F.S. 742 the duchy licenses adventurers and funds ' + n('slayer_master', 'Brogan') + '\'s slayer ledger, while politely pretending ' + loc('rainbow-avenue', 'Rainbow Avenue') + ', the casino, and the chimp court of ' + loc('bellmeadow-south', 'the south district') + ' are someone else\'s jurisdiction. (They are.) The duchy archive holds the only surviving Discord Wars maps of the ' + loc('underdeep', 'Underdeep') + ', and the larder is chronically under-provisioned.'),
  ].join(''),
  aldgate: [
    p('Chartered in F.S. 305 as a market town at the old toll-arch — "the Ald Gate" — on the east road, Aldgate held against the last goblin host of the Discord Wars in F.S. 701. Today it is run by the <strong>Concord of Weights</strong>, a merchant council that took over when the last lord-mayor lost the city seal at cards to ' + n('casino_dealer', 'Dealer Pip') + ', who returned it framed.'),
    p('The Exchange opened its gilded booths in F.S. 726 (clerks swear a neutrality oath: they may not own what they list), and the <strong>Aldgate Gun Guild</strong> was chartered in F.S. 718, after Armsmith Hannelore Glock\'s eighteenth pistol pattern finally failed to explode. Whoever controls the road to the ' + loc('ashen-depths', 'Ashen Depths') + ' controls thunder-shale — and so controls gunpowder, which is why the Concord pays adventurers to keep the ' + loc('warlords-fort', 'Warlord\'s Fort') + ' off its trade road.'),
  ].join(''),
  'warlords-fort': [
    p('A Cracked Refrain-era palisade fort, seized in F.S. 742 by the ' + n('goblin_warlord', 'Goblin Warlord') + ' and his Broken-Tooth banner — the first goblin to hold a fort since F.S. 701, which means some banner survived the Discord Wars that shouldn\'t have.'),
    p('The banner is load-bearing in the most literal sense. Goblins are a marching-chant made flesh, and a warband\'s banner <em>is</em> the chant\'s notation: tear it down and the warband forgets its own rhythm. This is why every warband collapses when its warlord falls, and why Aldgate pays for the banner as proof.'),
  ].join(''),
  'swamp-mine': [
    p('The duchy\'s old ore mine, half-swallowed by the bog\'s slow northward creep. It is still worked — copper, tin, iron, coal, and rune essence — because Aulden\'s bass line runs shallow here. The cave mouth at its south end is the only safe descent toward the ' + loc('underdeep', 'Underdeep') + '.'),
    p('Miners knock twice on the timbers going in: once for Aulden, once for whoever didn\'t come back in \'88.'),
  ].join(''),
  'deep-bog': [
    p('This is where the Offnote\'s first great fragment fell at the end of the First Chord. On the <strong>Night of Skipped Beats</strong> (F.S. 612) the fragment surged, the bog drowned three villages, and the Discord Wars began. The drowned refrain of those villages circulated in the peat for centuries until, in F.S. 742, it congealed a body: the ' + n('bog_horror', 'Bog Horror') + '.'),
    p('The <strong>Stillwater Circle</strong> tends the bog\'s edges, harvesting the strangely potent herbs that grow where the song decomposes. Note well: the bog heart the Horror carries is only a clot of the refrain. The fragment itself is still down there.'),
  ].join(''),
  underdeep: [
    p('The great cavern system east and below the vale — stalagmites, lava pools, mithril and adamantite where Aulden\'s score runs deep. It was breached and abandoned twice during the Discord Wars; the duchy archive holds the only surviving maps from that era.'),
    p('It is currently the nesting ground of the ' + n('shadow_drake', 'Shadow Drake') + ', "the colour of a bad night," whose scales shed darkness the way hot iron sheds sparks.'),
  ].join(''),
  frostpeak: [
    p('The eastern range: foothill yews and maples, the mountain agility course, ' + n('ice_troll', 'ice trolls') + ' and ' + n('ice_wolf', 'ice wolves') + ' — and at the summit, the frozen court of ' + n('ice_queen', 'Maraza the Rimebound') + ', Queen of the Frostpeak holds, who attempted to sing a Verse of the First Chord alone in F.S. 402 and has been held mid-syllable ever since. The cold radiating from her unfinished note is why the high passes never thaw.'),
    p(n('mountain_guide', 'Guide Torvald') + ' maintains the routes, along with a personal census of every ledge he has fallen off (all of them, once each).'),
  ].join(''),
  'sunscorch-desert': [
    p('Once the green hinterland of <strong>Sarrash</strong>, the singing city founded in F.S. 211, whose thousand-throat choirs kept the land in tune and in bloom. Sarrash fell silent in a single night in F.S. 537 — the cause is a guarded mystery; the Stillwater Circle believes its choirs were lured into singing the Offnote\'s counter-melody. Without song, the south dried to desert within a generation, and the sand swallowed the city, leaving the <strong>Sunken Ruins</strong> and the ' + n('ruin_wraith', 'wraiths') + ' that remember roofs.'),
    p('The fire altar is a surviving Sarrash choir-stone that still takes the verse. ' + n('desert_nomad', 'Nomad Zahra') + '\'s caravan line remembers the old routes — and since those routes got profitable again, ' + n('bandit_king', 'Saif the Red Smile') + ' has strangled them from his bandit camp in the deep dunes. Saif styles himself King of the Dunes by vote; he counted the votes himself.'),
  ].join(''),
  'port-brackwater': [
    p('The south-coast port burned once in the Discord Wars and rebuilt itself in stone and stubbornness. Its civic religion is <strong>Tidefest</strong>, the annual coastal catch competition — Brackwater has entered a shark every year for forty years and regards this as a load-bearing fact about reality. ' + n('harbormaster', 'Harbormaster Quill') + ' keeps all forty years of entries in her ledger.'),
    p('The Brackstrait ferry — ' + n('boatman', 'Wick') + '\'s, when it floats — serves the western water and is the only way to reach ' + loc('gullswreck-cove', 'Gullswreck Cove') + '.'),
  ].join(''),
  'ashen-depths': [
    p('The deepest, hottest reach of the cavern system, where the Offnote\'s second great fragment fell into the fire-veins before mortals existed. Quarrymen working the spoil-heaps discovered <strong>thunder-shale</strong> here in F.S. 712 — brittle black stone holding a splinter of the Offnote\'s percussion, which, milled fine, becomes gunpowder. That is why a gunshot sounds like the world skipping a beat.'),
    p('At the very bottom waits ' + n('magma_fiend', 'Korr the Molten') + ', the fragment itself wearing a body of slag — "stone that walks, fire that thinks." The hammering heard at night in the upper caves is Korr forging. Nobody knows what. The ' + n('ash_fiend', 'ash fiends') + ' are the silhouettes of the Depths\' dead, peeled off the rock by that hammering; the ' + n('magma_crawler', 'magma crawlers') + ' are forge-spillage given legs.'),
  ].join(''),
  'hunter-meadow': [
    p('A flower meadow south-east of the vale, tuned so gently that snared birds are said to be merely embarrassed rather than afraid. It is trappers\' common land under duchy law — and the <strong>Foam Accord</strong> of F.S. 698, the oath that ended real bloodshed in favour of eternal foam re-enactment, was drafted within sight of it.'),
  ].join(''),
};

// ---------------------------------------------------------------------------
// Standalone lore pages and extra region pages.
// ---------------------------------------------------------------------------

function addRegionPage(
  data: WikiData,
  slug: string,
  title: string,
  excerpt: string,
  body: string,
  rumored: boolean,
  related: string[],
) {
  const ibRows: [string, string][] = [['Region', title]];
  if (rumored) ibRows.push(['Status', 'Rumored lands — not yet reachable']);
  const sections = [
    rumored ? p('<em>Rumored lands: this region is canon but not yet reachable in game. Travellers\' accounts below.</em>') : '',
    body,
    related.length ? h2('Connected people and creatures') : '',
    related.length ? ul(related) : '',
  ];
  addArticle(data, {
    slug: `location/${slug}`,
    title,
    category: 'Locations',
    excerpt,
    html: article(title, sections.join(''), infobox(title, ibRows)),
  });
}

export function addLorePages(data: WikiData): void {
  // ---- World & History ----
  addArticle(data, {
    slug: 'lore/world',
    title: 'The World of Cantorne',
    category: 'Lore',
    excerpt: 'Cosmology and history of Cantorne — the Choir of Five, the Offnote, and the four eras from the Settling to the present year, F.S. 743.',
    html: article('The World of Cantorne', [
      p('The world is called <strong>Cantorne</strong> (kan-TORN). It was not forged, and it was not dreamt. It was <em>sung</em>.'),
      h2('The Choir of Five'),
      p('Before anything, there was the <strong>Choir of Five</strong> — five Voices without throats, singing in the Singing Dark. Their song is called the <strong>First Chord</strong>, and everything that exists is a held note of it:'),
      ul([
        '<strong>Aulden, the Deep Voice</strong> — stone, mountains, ore, patience. Miners say every vein of metal is a bar of Aulden\'s bass line, and smiths say an anvil rings true because it remembers the tune.',
        '<strong>Brell, the Rolling Voice</strong> — water, tide, rivers, rain, weather. Sailors call a calm sea "Brell holding her breath."',
        '<strong>Syla, the Green Voice</strong> — growth, beasts, forests, harvests, rot-that-feeds-roots. Every seed is a grace note of Syla\'s.',
        '<strong>Imber, the Bright Voice</strong> — fire, light, heat, the sun, ambition. Forges, hearths, and bad ideas all burn with borrowed Imber.',
        '<strong>Quiess, the Thin Voice</strong> — air, breath, the silence between notes, and the dead. Quiess carries the souls of the dead back into the Chord, which is why prayers are <em>hummed</em>, not spoken: Quiess only listens to music.',
      ]),
      h2('The Offnote'),
      p('At the final cadence of the First Chord, something slipped in that the Five never sang: a sixth sound, sour and off-rhythm, called <strong>the Offnote</strong>. It is not a god and not a devil; it is a <em>mistake that wants to be repeated</em>. Wherever the world\'s song goes out of tune — battlefields, abandoned places, stagnant water, untended graves, greed left to simmer — the Offnote pools like cold grease, and things congeal out of it or are warped by it.'),
      p('Every monster in Cantorne is, at root, a place where the song skipped: ' + n('goblin', 'goblins') + ' are a marching-chant gone feral, ' + n('ruin_wraith', 'wraiths') + ' are notes that refused to return to Quiess, the ' + n('bog_horror', 'Bog Horror') + ' is a whole drowned refrain. <strong>Monsters are music gone wrong, and killing them is retuning the world.</strong> The Stillwater Circle holds that the Offnote itself cannot be destroyed — only out-sung, or starved. See ' + link('lore/bestiary', 'the bestiary') + '.'),
      p('The Five still sing — quietly, underneath everything. Mortals who learn to hum along call it ' + link('skill/prayer', 'Prayer') + '. Mortals who learn the song\'s grammar call it ' + link('skill/magic', 'Magic') + '. Mortals who chip frozen syllables of it out of rock call it ' + link('skill/runecraft', 'Runecraft') + '. Mortals who fill a brass casing with powdered thunder and pull a trigger call it Tuesday in ' + loc('aldgate', 'Aldgate') + '.'),
      h2('The calendar'),
      p('Cantorne counts years <strong>F.S. — "from the Settling"</strong> — dated from the year the first mortal villages woke in the Bellmeadow vale. A year has twelve months called <strong>bars</strong>, each of thirty days, plus five intercalary <strong>Rest Days</strong> at midwinter when, by ancient custom, no contracts may be signed and no wars declared. (The casino remains open; ' + n('casino_dealer', 'Pip') + ' checked the wording.) The present year is <strong>F.S. 743</strong>.'),
      h2('Era I — The Unstruck Age (before counting)'),
      p('The Choir sings the First Chord. Land, sea, beast, and the bones of every mountain are laid down. The Offnote slips into the cadence; its largest fragments fall to earth — one into the southern peatlands (the future ' + loc('deep-bog', 'Deep Bog') + '), one into the fire-veins beneath the eastern caverns (the future ' + loc('ashen-depths', 'Ashen Depths') + '), and countless slivers everywhere else. The era ends when the Five lower their voices to a hum and the first people wake mid-meadow with the melody stuck in their heads.'),
      h2('Era II — The High Stave (F.S. 1–612)'),
      p('The classical age: kingdoms, choirs, trade, towers.'),
      ul([
        '<strong>F.S. 1</strong> — The Settling. First villages in the Bellmeadow vale on the River Murmur.',
        '<strong>F.S. 88–94</strong> — Stonecourt Castle raised by Duke Coram the Mason, first of the Stonecourt line.',
        '<strong>F.S. 211</strong> — In the then-green south, the singing city of <strong>Sarrash</strong> is founded; its thousand-throat choirs keep the land in tune and in bloom.',
        '<strong>F.S. 305</strong> — Aldgate chartered as a market town at the old toll-arch ("the Ald Gate") on the east road.',
        '<strong>F.S. 388</strong> — Maraza crowned Queen of the Frostpeak holds, greatest singer of her age.',
        '<strong>F.S. 402</strong> — <em>Maraza\'s Solo.</em> Convinced she could sing a Verse of the First Chord alone, Maraza attempts it at the summit. The note holds her, her court, and the high passes in ice mid-syllable. She has been furious about it ever since.',
        '<strong>F.S. 537</strong> — Sarrash falls silent in a single night. Without song, the green south dries to the Sunscorch Desert within a generation; the sand swallows the city, leaving the Sunken Ruins and the wraiths that remember roofs.',
      ]),
      h2('Era III — The Cracked Refrain (F.S. 612–701)'),
      p('The collapse. On the <strong>Night of Skipped Beats</strong> (F.S. 612), the Offnote fragment under the southern peat surges; the bog drowns three villages and exhales decades of war. Goblin warbands — feral marching-chants given legs — pour out of every untuned corner.'),
      ul([
        '<strong>F.S. 612–690</strong> — The <strong>Discord Wars</strong>: the Duchy, Aldgate, the Frostpeak holds, and the ports fight goblin hosts, bandit kings, and each other. The Underdeep is breached and abandoned twice. Brackwater burns once and learns to build in stone.',
        '<strong>F.S. 698</strong> — <em>The Foam Accord.</em> War-weary veterans of every banner, meeting in a meadow south of Stonecourt, swear an oath: the old battles will be re-fought forever so no one forgets — but only ever with <strong>foam</strong>. Real bloodshed feeds the Offnote; re-enactment starves it. This is the founding of the LARP marshals, and it is treated with complete seriousness by everyone except visitors.',
        '<strong>F.S. 701</strong> — The last goblin host of the wars breaks at the gates of Aldgate. The era closes.',
      ]),
      h2('Era IV — The Quiet Measure (F.S. 701–present)'),
      p('The current age: recovery, commerce, eccentricity, and a low hum of returning trouble.'),
      ul([
        '<strong>F.S. 703</strong> — Duke Reginald the Odd of the Southern Lawn dies childless and leaves his entire demesne, by airtight will, to his beloved performing chimpanzee. The courts uphold it. <strong>Danquavious Chimperton I</strong> takes the throne; his line has ruled — competently, by most measures — ever since.',
        '<strong>F.S. 712</strong> — Quarrymen in the Ashen Depths discover <strong>thunder-shale</strong>: brittle black stone holding a splinter of the Offnote\'s percussion. Milled fine, it becomes gunpowder.',
        '<strong>F.S. 718</strong> — The Aldgate Gun Guild chartered after Armsmith Hannelore Glock\'s eighteenth pistol pattern finally fails to explode (patterns one through seventeen are commemorated on a scorched plaque). The Glock 18 becomes the realm\'s standard sidearm.',
        '<strong>F.S. 726</strong> — The Aldgate Exchange opens its gilded booths; coin learns to move faster than carts.',
        '<strong>F.S. 731</strong> — Dealer Pip opens Pip\'s House of Mild Regret in Bellmeadow\'s south quarter.',
        '<strong>F.S. 735</strong> — Rainbow Avenue raised east of the River Murmur; first Pride parade. Marshal Riley, at the ribbon: "We built it so the whole world could see we\'re still here, still fabulous."',
        '<strong>F.S. 740</strong> — The Deep Bog stirs again. Bog ticks carrying discord-motes spread north.',
        '<strong>F.S. 741</strong> — Dr. Ticksworth opens the Dentist Tick Eat clinic; properly prepared tick consumption is found to neutralize discord-motes. Glen volunteers. Glen keeps volunteering.',
        '<strong>F.S. 742</strong> — The crisis year: a goblin warlord seizes the old palisade fort east of Aldgate; a horror congeals in the Deep Bog; the Shadow Drake nests in the Underdeep; hammering is heard from the deepest Ashen Depths as Korr the Molten wakes; Saif the Red Smile strangles the desert caravan roads; and Stonecourt begins licensing <strong>adventurers</strong>.',
        '<strong>F.S. 743</strong> — Now. You arrive.',
      ]),
      h2('Adventurers'),
      p('An <strong>adventurer</strong> is a person in whom the world\'s song runs unusually loud — loud enough that the Choir notices when it stops. This is why adventurers respawn: when one falls, the Five hum the verse back a few bars, and the adventurer wakes at their last anchored place, lighter a few possessions (the Offnote keeps a cut; it always keeps a cut). Ordinary folk do not get this. They know it, you know it, and the polite thing is not to mention it.'),
      p('Since F.S. 742 the Duchy of Stonecourt issues adventurer licenses — a war-measure without a war. Adventurers are freelancers of the retuning: they kill what skipped, carry what\'s needed, and get paid by whoever\'s problem it was. Veterans of the Foam Accord regard them with professional respect and mild concern: someone has to use real steel so the rest never have to again.'),
      h2('See also'),
      ul([
        link('lore/factions', 'Factions of Cantorne'),
        link('lore/bestiary', 'Bestiary of the Offnote'),
        link('category/locations', 'Locations'),
      ]),
    ].join(''), infobox('Cantorne', [
      ['World', 'Cantorne'],
      ['Sung by', 'The Choir of Five'],
      ['The flaw', 'The Offnote'],
      ['Present year', 'F.S. 743'],
      ['Era', 'The Quiet Measure'],
    ])),
  });

  // ---- Factions ----
  addArticle(data, {
    slug: 'lore/factions',
    title: 'Factions of Cantorne',
    category: 'Lore',
    excerpt: 'The powers of Cantorne — the Duchy of Stonecourt, the Concord of Weights, the Gun Guild, the Stillwater Circle, the Foam Accord Marshals, the chimp court, and the criminal coasts.',
    html: article('Factions of Cantorne', [
      p('Cantorne\'s Quiet Measure is kept — and occasionally disturbed — by the following powers. Every one of them has work for a licensed adventurer.'),
      h2('The Duchy of Stonecourt'),
      p('Duke Aldous\'s government: castle, watch, mine charters, adventurer licenses. Its goal is to keep the vale fed and the Quiet Measure quiet. Its problem: it is paying adventurers to solve what its own army — downsized after the Foam Accord — cannot, and it owes the Concord money. Seat: ' + loc('the-castle', 'Stonecourt Castle') + '. Key figures: Duke Aldous, ' + n('slayer_master', 'Brogan') + ', ' + n('cook', 'Cook Edda') + '.'),
      h2('The Concord of Weights'),
      p('The merchant council of ' + loc('aldgate', 'Aldgate') + ': the Exchange, the city watch payroll, shop charters, and the Gun Guild\'s parent body. It wants open roads and moving coin; it wants the ' + loc('warlords-fort', 'Warlord\'s Fort') + ' cleared because the fort sits on its trade road; and it quietly resents that Bellmeadow\'s casino out-earns its Exchange on feast days. ' + n('ge_clerk', 'Exchange clerks') + ' are sworn never to own what they list.'),
      h2('The Aldgate Gun Guild'),
      p('Chartered F.S. 718; keepers of the gunpowder secret. Gunpowder is milled <strong>thunder-shale</strong> — powdered Offnote percussion, which is why a gunshot sounds like the world skipping a beat. Guild doctrine: the Offnote put thunder in the rock to cause trouble, so firing it <em>at monsters</em> is recycling. ' + n('gun_guild_master', 'Master Flint') + ' runs the armoury; ' + n('gun_trainer', 'Sergeant Vex') + ' trains recruits. Every adventurer starts with a Glock 18 — patterns 1–17 are on the memorial plaque.'),
      h2('The Broken-Tooth Warbands'),
      p('Not a culture but a chant: ' + n('goblin', 'goblin') + ' bands coalesce around banners, and the banner is the warband\'s memory — its literal sheet music. Their goal: march, take, chant louder. The current ' + n('goblin_warlord', 'Warlord') + ' is the first since F.S. 701 to hold a fort, which means some banner survived the wars that shouldn\'t have.'),
      h2('The Stillwater Circle'),
      p('Herbalists, bog-tenders, and quiet listeners. ' + n('gardener', 'Old Fen') + ' is their vale-side friend; the mother-lodge stands on stilts in the ' + loc('eastern-marshes', 'Eastern Marshes') + '. Doctrine: the Offnote\'s fragments cannot be destroyed, only kept <em>asleep</em> — out-sung or starved. They opposed thunder-shale mining loudly and were ignored. They are not saying "we told you so." They are brewing it.'),
      h2('The Foam Accord Marshals'),
      p('The veterans\' order founded F.S. 698, whose oath ended the Discord Wars\' bloodshed: every battle re-enacted forever, bloodlessly, so the Offnote starves and the dead are remembered with better choreography. The Accord is recognized law — a marshal can void any duel by declaring it "foam jurisdiction." ' + n('larp_marshal_monk', 'Sir Chimpwick') + '\'s Black Monkey chapter holds the field in ' + loc('bellmeadow-south', 'Bellmeadow\'s south district') + '; ' + n('larp_quartermaster', 'Quartermaster Peel') + ' arms it.'),
      h2('The Court of the Southern Lawn'),
      p(n('danquavious_chimperton', 'Danquavious Chimperton III') + '\'s micro-monarchy, legally unimpeachable since the Will of F.S. 703. Goals: dignity, bananas, and the long defense of the Will against jealous human cousins of Duke Reginald who still file annual appeals. The court funds the LARP field\'s totems and is the casino\'s largest single depositor. ' + n('chimperton_herald', 'Herald Bananrick') + ' handles volume.'),
      h2('The Avenue'),
      p('Less a faction than a covenant: everyone is welcome, the music does not stop, and the Offnote has never once been recorded on the dance floor of ' + loc('rainbow-avenue', 'Rainbow Avenue') + '. ' + n('pride_marshal', 'Marshal Riley') + ' keeps the route safe; ' + n('drag_icon', 'Sashabella') + ' keeps it legendary. The Circle sends discreet observers to figure out <em>why</em> it works. The Avenue sends them home with glitter.'),
      h2('The criminal coasts'),
      p(n('bandit_king', 'Saif the Red Smile') + '\'s desert bandits and ' + n('pirate_captain', 'Captain Saltjaw') + '\'s cove Wreckers trade through fences in both ports and despise each other ("sand thieves" versus "wet thieves"). Both kings are charismatic, neither is elected, and both drop their regalia when finally brought to account.'),
    ].join(''), infobox('Factions', [
      ['Lawful powers', 'Duchy, Concord, Gun Guild'],
      ['Orders', 'Foam Accord, Stillwater Circle, Vaultwrights'],
      ['Courts', 'The Southern Lawn'],
      ['Outlaws', 'Broken-Tooth, Red Smiles, Wreckers'],
    ])),
  });

  // ---- Bestiary lore ----
  addArticle(data, {
    slug: 'lore/bestiary',
    title: 'Bestiary of the Offnote',
    category: 'Lore',
    excerpt: 'Why monsters exist in Cantorne, what each one used to be, and why they drop what they drop.',
    html: article('Bestiary of the Offnote', [
      p('Every hostile creature in Cantorne is a place where the world\'s song skipped. Bones drop because the body was real even if the cause wasn\'t; the Offnote builds with borrowed material. Killing a monster is not cruelty — it is retuning. Each entry below links to the creature\'s full page, where its origin is recorded under <em>Lore</em>.'),
      h2('Skipped notes (Offnote work)'),
      ul([
        n('goblin', 'Goblin') + ' — a Discord Wars marching-chant that never stopped marching.',
        n('goblin_warlord', 'Goblin Warlord') + ' — a chant grown a conductor; his banner is the warband\'s sheet music.',
        n('giant_rat', 'Giant rat') + ' — vermin grown fat on grain stores and discord-mote runoff.',
        n('magma_crawler', 'Magma crawler') + ' — spillage from Korr\'s forge given legs.',
        n('ash_fiend', 'Ash fiend') + ' — the Depths\' dead miners\' silhouettes, peeled off the rock by Korr\'s hammering.',
        n('ruin_wraith', 'Ruin wraith') + ' — Sarrash\'s choristers, notes that refused to return to Quiess. Slaying them is a mercy.',
        n('cinder_imp', 'Cinder imp') + ' — Imber\'s verse over-concentrated on Cinderholm.',
        n('ice_troll', 'Ice troll') + ' — boulders that Maraza\'s unfinished note taught to have opinions.',
        n('bog_horror', 'Bog Horror') + ' — the drowned refrain of three villages, congealed in F.S. 742.',
        n('magma_fiend', 'Korr the Molten') + ' — the Offnote\'s second great fragment, wearing slag.',
      ]),
      h2('Honest beasts and mortals (no excuse)'),
      ul([
        n('bear', 'Bear') + ', ' + n('dire_wolf', 'dire wolf') + ', ' + n('forest_spider', 'forest spider') + ', ' + n('ice_wolf', 'ice wolf') + ' — Syla\'s beasts, swollen where the Tanglewood and Frostpeak verses run loud.',
        n('scorpion', 'Scorpion') + ' — the desert\'s honest opinion of visitors.',
        n('desert_bandit', 'Desert bandit') + ' and ' + n('pirate', 'pirate') + ' — human; no excuse.',
        n('bandit_king', 'Saif the Red Smile') + ' and ' + n('pirate_captain', 'Captain Saltjaw') + ' — kings of the criminal coasts, crowns self-issued.',
        n('ice_queen', 'Maraza the Rimebound') + ' — not Offnote work: hubris, preserved.',
        n('shadow_drake', 'Shadow Drake') + ' — hatched in the wars\' dark; its scales shed darkness like sparks.',
        n('chicken', 'Chicken') + ', ' + n('cow', 'cow') + ', ' + n('sheep', 'sheep') + ' — Syla\'s gifts to the vale, perfectly in tune, completely unbothered.',
      ]),
      h2('Why the drops make sense'),
      p('The Offnote builds with what a place had to hand, so a retuned monster gives the place back. Goblins drop looted coin and the bronze they could steal but never forge. Ice trolls drop ore and sapphires because they <em>are</em> mineral. Ash fiends carry the deep\'s treasury because ghosts inherit the estate. The Bog Horror returns what the bog swallowed, slightly fermented. Wraiths leave grave dust and ranarr — the prayer-herb grows where prayer is owed. And bones are always bones: bury them, hum along, and the notes go home to Quiess.'),
      h2('See also'),
      ul([
        link('lore/world', 'The World of Cantorne'),
        link('category/bosses', 'Bosses'),
        link('skill/slayer', 'Slayer'),
      ]),
    ].join(''), infobox('Bestiary', [
      ['Cause of monsters', 'The Offnote'],
      ['Cure', 'Retuning (violence)'],
      ['Authority', 'Brogan\'s ledger'],
    ])),
  });

  // ---- Extra reachable region pages ----
  addRegionPage(data, 'river-murmur', 'The River Murmur',
    'The vale\'s river, which audibly hums Brell\'s line of the First Chord on still mornings.',
    [
      p('The vale\'s river, named because it audibly hums Brell\'s line of the First Chord on still mornings. Willows line the banks, the fishing spots are generous, and the old bridge carries the east road. By custom, oaths sworn on the bridge are considered witnessed.'),
      p('The first mortal villages of F.S. 1 were settled on its west bank, and ' + loc('rainbow-avenue', 'Rainbow Avenue') + ' was raised east of it in F.S. 735. The willows, it is said, gossip downstream.'),
    ].join(''),
    false,
    [n('man', 'Citizens of the vale'), loc('the-castle', 'Bellmeadow and Stonecourt Castle')],
  );

  addRegionPage(data, 'bellmeadow-south', 'Bellmeadow South District',
    'The lawn south of the castle: the Black Monkey LARP Pride field, the Court of the Southern Lawn, and the Dentist Tick Eat clinic.',
    [
      p('Three institutions share the lawn south of the castle, and all three are deadly serious.'),
      h3('The Black Monkey LARP Pride field'),
      p('The living memorial of the <strong>Foam Accord</strong> (F.S. 698): marshals re-enact the Discord Wars with foam weapons so the Offnote cannot feed on fresh bloodshed. "Foam swords only. Real steel is for the goblin field east of here" is Accord law, not a joke. ' + n('larp_marshal_monk', 'Sir Chimpwick') + ' marshals it; ' + n('larp_quartermaster', 'Quartermaster Peel') + ' arms it.'),
      h3('The Court of the Southern Lawn'),
      p('Seat of ' + n('danquavious_chimperton', 'Danquavious Chimperton III') + ', Sovereign of Bananas, Duke of the Southern Lawn, third chimp of his line since the Will of F.S. 703. The court is legally unimpeachable, fiscally solvent, and the only monarchy in Cantorne to win both a joust and a banana-eating contest. The golden banana on its pedestal has never been peeled and, legend insists, never will be. Do not ask about the First or the Second. ' + n('chimperton_herald', 'Herald Bananrick') + ' announces.'),
      h3('The Dentist Tick Eat clinic'),
      p(n('dentist_dr_tick', 'Dr. Ticksworth') + '\'s practice (est. F.S. 741): dentistry in front, discord-mote remediation in back. Bog ticks carry slivers of the Offnote; eaten after proper preparation, the mote is neutralized by stomach acid and spite. ' + n('tick_eater_glen', 'Glen') + ' handles the tasting menu. It is artisanal. It is, technically, public health.'),
    ].join(''),
    false,
    [n('larp_marshal_monk', 'Sir Chimpwick'), n('larp_quartermaster', 'Quartermaster Peel'), n('danquavious_chimperton', 'Danquavious Chimperton III'), n('chimperton_herald', 'Herald Bananrick'), n('dentist_dr_tick', 'Dr. Ticksworth'), n('tick_eater_glen', 'Glen the Tick Eater')],
  );

  addRegionPage(data, 'rainbow-avenue', 'Rainbow Avenue & the Casino',
    'Pip\'s House of Mild Regret and the Pride district east of the River Murmur — the one place the Offnote has never been recorded.',
    [
      p('<strong>Pip\'s House of Mild Regret</strong> (est. F.S. 731) offers slots, blackjack, roulette, and coinflip — "all fair, all loud." The house wins slightly more often, which is the definition of fair. ' + n('casino_dealer', 'Pip') + '\'s charter was granted under Rest Day law, which is why it never closes.'),
      p('<strong>Rainbow Avenue</strong> runs east of it: Pride banners, ' + n('drag_icon', 'Sashabella') + '\'s stage, ' + n('pride_marshal', 'Riley') + '\'s stall, ' + n('bartender_fizz', 'Fizz') + '\'s bar, and the Hedonism Patch hot tub and dance floor kept by ' + n('party_host', 'Host Hedon') + '. The Avenue was raised in F.S. 735 by veterans, refugees, and anyone the Discord Wars had told to be quieter, as a permanent answer. At the ribbon, Marshal Riley said: "We built it so the whole world could see we\'re still here, still fabulous."'),
      p('The Offnote demonstrably hates the place; no discord-mote has ever been recorded on the dance floor. Scholars argue whether that\'s the joy, the glitter, or Sashabella\'s encores.'),
    ].join(''),
    false,
    [n('casino_dealer', 'Dealer Pip'), n('party_host', 'Host Hedon'), n('bartender_fizz', 'Fizz the Bartender'), n('pride_marshal', 'Marshal Riley'), n('drag_icon', 'Sashabella')],
  );

  // ---- Rumored lands ----
  addRegionPage(data, 'eldermere', 'Eldermere',
    'Rumored lands: a farm-belt village beyond the vale, governed by Elder Maeryn\'s word and memory.',
    [
      p('A farm-belt village beyond the vale, governed by ' + n('village_elder', 'Elder Maeryn') + '\'s word and memory. Its west toll path into the ' + loc('tanglewood', 'Tanglewood') + ' chokes with bramble and spiders whenever traffic lapses — "Tanglewood remembers every footfall," as Maeryn says.'),
      p('Maeryn pays the wood an actual toll: a saucer of milk at the dark heart clearing, every Rest Day, without fail. ' + n('wayfarer', 'Wayfarer Sorrel') + ' walks the Eldermere–vale circuit, selling snares, not courage.'),
    ].join(''),
    true,
    [n('village_elder', 'Elder Maeryn'), n('wayfarer', 'Wayfarer Sorrel'), n('forest_spider', 'Forest spider')],
  );

  addRegionPage(data, 'tanglewood', 'The Tanglewood',
    'Rumored lands: the great forest — Syla\'s densest verse, with a dark heart clearing the trees do not discuss.',
    [
      p('The great forest west of Eldermere: Syla\'s densest verse. Yews, magic trees, mushroom glades — and a dark heart clearing where the trees grow in a circle and do not discuss why. ' + n('forest_spider', 'Spiders') + ' the size of cart wheels hold the edges, and the ' + n('dire_wolf', 'dire wolves') + ' want their old deep paths back from them.'),
      p('Woodcutters take timber here with respect, because the Tanglewood remembers every footfall, and the willows gossip downstream.'),
    ].join(''),
    true,
    [n('forest_spider', 'Forest spider'), n('dire_wolf', 'Dire wolf'), n('bear', 'Bear'), n('village_elder', 'Elder Maeryn')],
  );

  addRegionPage(data, 'stonewatch', 'Stonewatch',
    'Rumored lands: the northern range outpost — a cold garrison and Trapper Hode\'s fur trade.',
    [
      p('The northern range outpost: a cold garrison, ' + n('trapper', 'Trapper Hode') + '\'s fur trade, and the duty of watching the passes that ' + n('ice_queen', 'Maraza') + '\'s winter still leaks through. Hode counts furs the way bankers count coins, and means to have the watch warm by winter.'),
    ].join(''),
    true,
    [n('trapper', 'Trapper Hode'), n('ice_wolf', 'Ice wolf'), n('bear', 'Bear')],
  );

  addRegionPage(data, 'gullswreck-cove', 'Gullswreck Cove',
    'Rumored lands: the pirate isle off the west coast — no land route, ferry only.',
    [
      p('A pirate isle off the west coast — no land route, ferry only, via ' + n('boatman', 'Boatman Wick') + ' (whose ferry lists worse than his last three marriages). Home of the <strong>Wreckers</strong> under ' + n('pirate_captain', 'Captain Saltjaw') + ', who salvage what the sea takes and take what the sea hasn\'t gotten around to.'),
      p('The wreck of the <em>Gull</em> — the treasure ship that named the cove — has never been found. Saltjaw carries the chart, chained to his belt, and has never dared dive it.'),
    ].join(''),
    true,
    [n('pirate_captain', 'Captain Saltjaw'), n('pirate', 'Pirate'), n('boatman', 'Boatman Wick')],
  );

  addRegionPage(data, 'mirrormere', 'Mirrormere',
    'Rumored lands: the great central lake — so still it reflects the sky a half-second late.',
    [
      p('The great central lake, fed by the Brackstrait. So still it reflects the sky a half-second late; folklore says it is the world\'s tuning fork, and that Brell checks her pitch in it.'),
    ].join(''),
    true,
    [n('boatman', 'Boatman Wick')],
  );

  addRegionPage(data, 'eastern-marshes', 'The Eastern Marshes',
    'Rumored lands: reed country — herbs, waterfowl, and the Stillwater Circle\'s mother-lodge on stilts.',
    [
      p('Reed country: herbs, waterfowl, and the politest leeches in Cantorne. The <strong>Stillwater Circle</strong>\'s mother-lodge stands here on stilts — the order that keeps the Offnote\'s fragments asleep, and that ' + n('gardener', 'Old Fen') + ' left the day he took his Circle name.'),
    ].join(''),
    true,
    [n('gardener', 'Old Fen')],
  );

  addRegionPage(data, 'southern-savanna', 'The Southern Savanna',
    'Rumored lands: open grass beyond the desert, slowly going green again as the world retunes.',
    [
      p('Open grass beyond the desert: lion-coloured light, scattered herds, wayfarer routes. These were old Sarrash\'s pasture lands, and they are slowly going green again as the world retunes.'),
    ].join(''),
    true,
    [n('desert_nomad', 'Nomad Zahra'), n('wayfarer', 'Wayfarer Sorrel')],
  );

  addRegionPage(data, 'cinderholm', 'Cinderholm',
    'Rumored lands: the volcanic isle offshore — Imber\'s most concentrated verse above ground.',
    [
      p('A volcanic isle off the south-east coast: ' + n('cinder_imp', 'cinder imps') + ', a causeway at low tide, and a dormant cone that the imps treat as a parent. Imber\'s most concentrated verse above ground.'),
    ].join(''),
    true,
    [n('cinder_imp', 'Cinder imp')],
  );
}
