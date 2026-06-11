// Homepage news content for larpscape.net.
// Typed, dependency-free module consumed by the marketing homepage build.
// All copy is original Larpscape content, consistent with docs/LORE.md
// (the Cantorne Codex). Posts are ordered newest-first.

export interface NewsPost {
  /** URL slug for the article page, e.g. /news/<slug> */
  slug: string;
  title: string;
  category: 'Game Updates' | 'Dev Blog' | 'Community' | 'Events';
  /** ISO date (YYYY-MM-DD) */
  date: string;
  /** Card teaser — 2 sentences max */
  excerpt: string;
  /** Full article body, markdown, ~300–600 words */
  body: string;
  /** CSS color for the card's art band */
  accent: string;
}

export const NEWS_POSTS: NewsPost[] = [
  {
    slug: 'the-concord-audit',
    title: 'The Concord Audit — We Closed a Hole and Reset the Ledgers',
    category: 'Dev Blog',
    date: '2026-06-11',
    excerpt:
      'A flaw let a handful of accounts mint coins and items from nothing. We have rebuilt the economy so the server — not your browser — is the keeper of every coin, and we have wiped the slate clean. Here is exactly what happened.',
    accent: '#b91c1c',
    body: `The Concord of Weights audits the chalk on every ledger in Cantorne. This week, so did we — and we did not like what we found.

**What went wrong.** For a window of time, the game trusted your own browser to report how much you owned. Your coins, items, levels and quest progress were written by the client and stored more or less as-is. A determined player could edit that record and hand themselves wealth that never existed — then sell it, trade it, or list it at the Aldgate Exchange as if it were real. A few accounts did exactly that. One had walked off with the better part of a billion forged coins.

This is our mistake, plainly. The convenience of a client-owned save was a door we left unlocked, and we are not going to dress it up as anything else.

**What we did about it.** The moment we confirmed it, we froze every path that moves wealth between players — the Exchange, the market, trading, drops — so the bleeding stopped while we rebuilt. Then we rebuilt the foundation properly:

- **The server is now the sole keeper of value.** Coins, bank, inventory, equipment, experience, quest stages — all of it lives on our side now. Your client *asks* to mine a rock or sell a bar; the server checks you have the tool, the level, the range, and the goods, then grants the result. Editing your local save now does precisely nothing.
- **Combat is honest.** Your hit, your speed, your defences and your health are all worked out on the server from your real, earned stats. No more reporting yourself unkillable.
- **The Exchange, market, trading, drops and the guild vault** all move real, backed value now — escrowed properly, conserved exactly. We threw thirty separate attacks at the new system, replaying every trick that worked before. All thirty bounced.

**The reset.** Because forged wealth had already leaked into the world, the only fair fix was the clean one. **Every account has been reset to a fresh new-beginner character.** Twenty-five coins, an empty pack, and the whole world ahead of you again — same as your first morning in Bellmeadow. We kept full backups of every prior character, so nothing is truly lost on our end, but the live ledgers all start from zero today.

We know a reset stings, especially if you played fair. We are sorry to spend your time twice. But a marketplace is only worth anything if every coin in it was earned, and we would rather hand you an honest world a day late than a rigged one on schedule.

The vale is quiet, the chalk is clean, and the Exchange is open for honest business. We will see you on the road. — *The Larpscape team*`,
  },
  {
    slug: 'the-gathering-discord',
    title: 'The Gathering Discord — the Quiet Measure Is Ending',
    category: 'Game Updates',
    date: '2026-06-11',
    excerpt:
      'A four-chapter questline arrives, and with it the first crack in forty-two years of peace. Someone down there calls himself the Conductor — and he says thank you.',
    accent: '#7c3aed',
    body: `For forty-two years Cantorne has lived in the Quiet Measure — the long, comfortable rest that followed the Discord Wars. Today's update is about what comes after the rest.

**The Gathering Discord** is our first multi-chapter questline, four quests that take you from a novice errand in Bellmeadow to the bottom of a place that should have stayed bricked up:

- **Sour Notes** — Mira, the Bellmeadow magic tutor, hears the vale singing a half-beat flat. She hands you her tuning fork and sends you to sound it at the chapel altar and the riverside willow. Then Dr. Ticksworth's clinic has a rat problem, because of course it does.
- **A Quarrel of Wizards** — Master Flint of the Aldgate Gun Guild sends you to the realm's two consulting wizards: Calder Brightverse atop Imber's Spire and Vesper Hollowell in the Quiess Tower. They agree the slivers are ringing, and on absolutely nothing else. Triangulate the source by ringing the fork at three road waystones.
- **The Sealed Wing** — the trail ends at the Swamp Mine's north wing, bricked from the inside in '88. This chapter opens the Untuned Mine itself (see our previous post), and what's at the bottom of it.
- **The Gathering Discord** — chapter four. You ring the fork one last time at a resonance stand in the deep dark, and something answers. It calls itself **the Conductor**. It is polite. It thanks you for opening the wing. Then it walks into the stone like a door, leaves behind a page of an unfinished score — and every waystone in the realm chimes at once.

Destroy his copyist, **the Dissonant**, and carry the news back to Slayer-Master Brogan, who closes the old ledger he has kept since the wars, takes out a new one, and writes a single name on the first page.

We won't spoil more, except to say: this arc is the spine of everything we ship next. The Foam Accord marshals re-fight the old battles with foam so the real ones stay dead. As of today, F.S. 743, that arrangement is on notice.

Start at Mira in Bellmeadow. Chapter one is tuned for brand-new accounts; chapter four expects you to survive a level 62 copyist with strong opinions about plagiarism. Bring the tuning fork. You'll be keeping it.`,
  },
  {
    slug: 'the-untuned-mine',
    title: 'The Untuned Mine — Our First Instanced Dungeon',
    category: 'Game Updates',
    date: '2026-06-04',
    excerpt:
      'The sealed north wing of the Swamp Mine is open, and every vein down there hums a half-beat flat. Solo instance, two bosses, a leaderboard plaque, and ore that rings wrong.',
    accent: '#0ea5e9',
    body: `In '88 the miners of the Swamp Mine bricked up their own north wing — from the inside. Fifty-five years later, the bricks are coming down, and Larpscape gets its first **instanced dungeon**.

**The Untuned Mine** is a solo, private instance tuned for levels ~10–30. Step through the breach (unlocked during *The Sealed Wing*, chapter three of the Gathering Discord arc) and you get your own copy of the Ringing Galleries: nobody steals your rocks, nobody tanks your boss, nobody watches you fail the dodge. Everyone watches the plaque, though. More on that below.

What's down there:

- **The ringing veins.** Real Mining training on a level-scaled ore mix, with a ~6% chance per ore of a bonus **resonant shard** — a sliver that rings a note the rock never sang. Cantor-Surveyor Brigh at the door buys shards and trades them for Guild-approved gear, including the **tuned pickaxe**, whose head hums a true fifth above the seam and finds the ore a tenth sooner (10% faster mining, and it'll crack a goblin skull in a pinch).
- **Foreman Echo**, floor one. A shift-boss who never clocked out, still keeping the count. It knocks twice — and the next beat is *skipped*, along with two tiles of floor. Move on the knock or eat the slam. Until its last loop ends, the knotted rope to floor two won't hold you: the kill is your key down, every run.
- **The Crystal Heart**, the bottom. The Offnote fragment that's been teaching the ore the wrong note since before the wing was sealed. Phase one it rings — keep moving through the shockwaves. Phase two it cracks down its length and the wrong note begins to *solo*. The fight has its own 280 BPM music track, because subtlety is for phase one.

Silence the Heart and the wing holds its first true rest in fifty-five years. Then Brigh checks her watch.

**The surveyor's plaque** outside the entrance records the fastest descents — time from breach to a silenced Crystal Heart, chiseled in by Brigh herself if you rank. The Heart at the bottom keeps perfect time, so we may as well keep yours. Current developer best is embarrassing and will not be disclosed.

Entrance is in the Swamp Mine cave. Bring a pickaxe, food, and a sense of rhythm.`,
  },
  {
    slug: 'boss-signature-drops',
    title: 'Boss Signature Drops & Special Attacks',
    category: 'Game Updates',
    date: '2026-05-28',
    excerpt:
      'Every boss in Cantorne now drops a unique with its own special attack. Banner cleaver, Mirefang, the Red Smile, Cindermaul, Errata — five weapons, five very bad ideas.',
    accent: '#dc2626',
    body: `Monsters in Cantorne are music gone wrong, and killing them is retuning the world. As of this update, the world occasionally tips you for it.

Every boss now has a **signature unique drop**, and every unique carries a **special attack** — a named ability that burns special energy for a moment of poor judgment made manifest:

- **Banner cleaver** (Goblin warlord, 1/125) — a cleaver hafted on the Broken-Tooth banner-pole, the whole march scored down the blade. Spec: *Broken Chorus* — bellow the march back at them, off-key; nearby foes attack at 70% for 16 ticks. Attack 25. The budget warcry your group always needed.
- **Mirefang** (Bog horror, 1/125) — black bog-oak and tooth, still weeping. Three villages drowned on the Night of Skipped Beats; this is what their refrain bites with. Passive poison, and the spec *Third Toll* drives a guaranteed venom that tolls once for each drowned village. Attack 40.
- **The Red Smile** (Saif the Red Smile, 1/125) — the bandit king's own scimitar. Every cut a ballot, and he counted those himself too. Bleeds on hit; the spec *Landslide Victory* carves +25% damage and a guaranteed deep bleed. Attack 40.
- **Cindermaul** (Korr the Molten, 1/200) — stone that walks, fire that thinks, and this is what it thinks with. The spec *Forgefall* brings the whole forge down at once: +50% damage and a guaranteed burn on an accurate hit. Attack 50, swings slow, regrets nothing.
- **Errata** (the Dissonant, 1/200) — a pistol transcribed from the copyist's slate and stretched wire; every shot is a note the First Chord never wrote. It is *especially* rude to Offnote creatures (+20% accuracy and damage against them), and the spec *Second Chord* fires two boosted notes at once — a chord the Choir never sanctioned. Gun 60.

Special energy regenerates over time and is shared across weapons, so swapping to spec is a real choice, not a rotation. Drop rates are deliberately chase-tier: these are the items you'll see glinting on someone at the Aldgate Exchange and quietly hate them for.

All five are tradeable. The Exchange booths opened in F.S. 726 precisely so coin could move faster than carts; we see no reason a cursed bog fang should be exempt. Good luck on the 1/200s.`,
  },
  {
    slug: 'trading-and-guilds',
    title: 'Player Trading & Guilds (with Vaults!)',
    category: 'Game Updates',
    date: '2026-05-21',
    excerpt:
      'Direct player-to-player trading is live, and so are guilds — tags, ranks, guild chat, and a shared vault. PvP remains off, and the marshals would like a word about why.',
    accent: '#d97706',
    body: `Cantorne's economy grows a second leg this week: you can now trade **directly with other players**, and band together into **guilds** with their own shared vault.

**Trading.** Right-click a player, offer a trade, and both sides build their offer in a two-panel window with an explicit accept step — both players confirm before anything moves. The server validates every item on both sides at the moment of exchange, so the classic "lag out mid-trade and duplicate a Cindermaul" speedrun category is closed before it opens. The Aldgate Exchange remains the place for anonymous buy/sell offers; direct trading is for deals with a face on them.

**Guilds.** Found one for a modest fee, pick a name and a 3–5 character tag, and it appears over your head for all of Cantorne to judge. Features at launch:

- **Roster and ranks** — leader, officers, members, with invite and kick permissions where you'd expect them.
- **Guild chat** — prefix any message with \`/g\` and it's delivered only to your online guildmates. Plotting in public is for goblins.
- **The guild vault** — a shared bank tab for the whole guild. Officers can toggle **member-deposit-only** mode, for guilds whose trust has a rank requirement. Withdrawals are clamped to what the vault actually holds, which sounds obvious until you've written banking code.

**And no, still no PvP.** The attack option, the swing intents, the whole pipeline exists in the code — and it is switched off everywhere, on purpose. The lore reason is the real reason: in F.S. 698 the war-weary veterans of every banner swore the **Foam Accord** — the old battles are re-fought forever so no one forgets, but only ever with foam, because real bloodshed *feeds the Offnote*. The LARP marshals on the Bellmeadow south lawn take this with complete seriousness, and frankly, so do we. The design reason is the same sentence with different nouns: a small world where every player is a potential teammate feels better than one where the bank path is a gauntlet. If ranked foam duels ever arrive, they will be exactly that — foam, consensual, and refereed by Marshal Riley.

Go found something. The first guild to fill a vault page with resonant shards gets nothing but our respect, which is non-withdrawable.`,
  },
  {
    slug: 'music-and-the-cantorne-codex',
    title: '11 New Music Tracks & the Lore Wiki Launches',
    category: 'Community',
    date: '2026-05-14',
    excerpt:
      'The soundtrack grows from 17 tracks to 28, including a 280 BPM boss theme. Plus: wiki.larpscape.net is live, built on the Cantorne Codex — our complete lore bible.',
    accent: '#16a34a',
    body: `Two launches this week, one for your ears and one for your bookmarks.

**Eleven new music tracks** join the in-game music tab, bringing the soundtrack to 28. Every track is original and composed in our own notation system — sequenced, not sampled. The new wave covers the eastern expansion, the southern coast, and the Untuned Mine:

- *Harvest Road* — the farm belt at 104 BPM with just enough swing to walk to.
- *Tanglewood Depths* — 70 BPM of the forest deciding whether you leave.
- *Stonewatch Garrison* — drums, drills, and a garrison that's seen things.
- *Wraithrun* and *Ravenmoor* — the moor tracks. Pack a lantern.
- *Imber's Spire* — bright, ambitious, slightly singed, like its wizard.
- *Quiess' Rest* — 56 BPM. The Thin Voice only listens to music, so we wrote her some quiet.
- *Gullswreck Shanty* and *Beacon Rock* — the coast: one for the docks, one for the light.
- *Untuned Halls* — the mine's galleries, deliberately a half-beat uneasy.
- *The Crystal Heart* — the final boss theme. **280 BPM.** You'll understand when it cracks.

Tracks unlock as you discover their regions, classic-style, and your unlock list is saved with your character.

**The Larpscape Wiki** is now live at **wiki.larpscape.net** — a fast, static reference site generated straight from the live game data, so item stats, drop tables, shop stock, and quest stages are accurate by construction rather than by volunteer heroism. At launch it covers every item, NPC, quest, shop, skill, location, and boss in the game, plus an item-prices page tracking Exchange and shop values.

The crown jewel is the lore section, built from **the Cantorne Codex** — the canonical lore bible we've been writing alongside the game. *The World of Cantorne* covers the cosmology (the Choir of Five, the First Chord, and the Offnote that slipped into the final cadence) and all four eras from the Unstruck Age to the present year, F.S. 743. *Factions of Cantorne* runs from the Duchy of Stonecourt to the legally unimpeachable chimpanzee court of the Southern Lawn. *Bestiary of the Offnote* explains why every monster exists — each one a place where the world's song skipped — and what it drops when you retune it.

Read up. There will not be a test, but there will be a chapter four.`,
  },
  {
    slug: 'mobile-client-launch',
    title: 'Larpscape in Your Pocket — Mobile Client Launch',
    category: 'Game Updates',
    date: '2026-05-07',
    excerpt:
      'The full game now runs in mobile browsers — same world, same characters, no app store. Tap to move, long-press for menus, and your sound settings finally stay put.',
    accent: '#0891b2',
    body: `Larpscape has always had one installation step: type the URL. As of today that's true on your phone, too.

**The mobile client is live.** Open the game in a mobile browser and you get the full world — same servers, same characters, same 600ms ticks — reflowed for a touch screen. Nothing was cut down or forked; this is the real client, taught some manners.

What we built:

- **Touch movement.** Tap a tile to walk there, exactly as you'd click. The pathfinder doesn't care what kind of pointer you are.
- **Long-press context menus.** The right-click menu — the soul of any game in this genre — maps to a long press. Hold on an NPC, object, or item and the full action list appears: *Talk-to*, *Examine*, *Use*, and every quest-specific option packs register. Examine text on a phone at the bus stop is the experience we got into this business for.
- **Touch-friendly interface panels.** Inventory slots, bank, shops, the spellbook, and dialogue choice buttons were all given hit targets sized for thumbs rather than cursors. Drag-to-reorder works in the inventory and bank.
- **Pinch and camera handling** tuned so the most common accident on mobile — zooming to the moon while trying to walk — is much harder to achieve. Still possible. We believe in you.
- **Sound settings that persist.** Music and effect volume (and mute) now save with your account and survive reloads, on every platform. This was the single most-reported paper cut after the soundtrack shipped, and the fix benefits desktop players equally: set it once, never again.

A note on expectations: this is a browser MMO on a phone, and a mid-range device runs the full 3D world comfortably — but the Untuned Mine's dodge-on-the-beat bosses are genuinely harder on touch, and we've left them that way rather than auto-nerf mechanics per platform. The plaque does not have an asterisk column.

iOS Safari, Android Chrome, and Firefox mobile are all supported. Add the page to your home screen for the closest thing to an app icon we will ever ask of you. Your account, bank, and quest progress are shared across every device — log in from your desk, log out, and pick the same fight back up in line for coffee.`,
  },
  {
    slug: 'eastern-southern-expansion',
    title: 'The World Grows East and South — Four New Regions',
    category: 'Game Updates',
    date: '2026-04-30',
    excerpt:
      'The map expands to roughly 300×300 tiles with Eldermere, Tanglewood, Stonewatch, and Gullswreck Cove. New hubs, new quests, new wraiths — the moor is exactly as advertised.',
    accent: '#65a30d',
    body: `The biggest world update in Larpscape's history is live: the map has grown to roughly **300×300 tiles**, pushing the frontier east through the farm belt and south to the sea. Four named regions, each with its own hub, quests, and music:

**Eldermere** — a forest village at the edge of the Tanglewood, where Elder Maeryn has been muttering about the overgrown road for longer than anyone's been listening. Her quest, *The Tanglewood Toll*, has you brace the path with five logs — a proper villager's errand, and the gateway to everything east of it. The wayfarer's stall and a general supplies shop make Eldermere a real waypoint, not a postcard.

**Tanglewood** — the deep forest itself, old growth where Syla's Green Voice runs thick and the canopy keeps its own twilight. Higher-tier trees for Woodcutting, new wildlife that bites back, and paths that reward players who actually learn them. The region theme, *Tanglewood Depths*, plays at 70 BPM, which is the correct speed for a forest that is deciding things about you.

**Stonewatch** — a fortified garrison outpost watching the eastern roads, manned by soldiers who remember why it was built. Trapper Hode runs a fur trade out of the outpost and the watch always needs supplies. North of the walls the land goes wrong in the old way: **Ravenmoor** and the Wraithrun, where notes that refused to return to Quiess drift between the stones. Bring prayer points. The wraiths remember roofs.

**Gullswreck Cove** — the southern coast. The ferry that served the cove has been wrecked for years, and Boatman Wick needs ten iron bars to put her back together — *Wreck of the Gull* is a smith's quest in the best tradition of "the economy is held together by one guy and he needs bars." Beyond the docks: beach fishing, the Beacon Rock light, and a shanty soundtrack with a disreputable amount of swing.

The expansion also places the realm's two wizard towers — **Imber's Spire** and the **Quiess Tower** — out in the world, which sharp-eyed readers will recognize as load-bearing for a certain upcoming questline.

Every region was hand-placed, not generated; the new land connects to the old roads the way real geography would. The east road out of Aldgate now actually goes somewhere. Go see.`,
  },
  {
    slug: 'graphics-overhaul-retrospective',
    title: 'Dev Blog: The Great De-Cubing — A Graphics Retrospective',
    category: 'Dev Blog',
    date: '2026-04-22',
    excerpt:
      'How Larpscape stopped being a game about cubes: new character models, world objects, roofs that hide, shadows that follow, and a UI carved from honest stone.',
    accent: '#6b7280',
    body: `For most of its life, Larpscape's player character was a cube wearing a smaller cube as a hat. We were fond of it. It is gone. This is the story of the graphics overhaul, in the order we shipped it.

**Phase one: un-breaking the map.** Before making anything prettier we performed surgery on the world itself — reverting an over-eager generated map back to the handcrafted 224×224 world, then rebuilding our deploy pipeline so clients auto-refresh on release instead of haunting us with stale caches. Lesson learned and now tattooed on the team: handcrafted beats generated, every time, and cache headers are load-bearing.

**Phase two: the de-cubing of the people.** Characters and NPCs were rebuilt as proper low-poly models — heads that are head-shaped, limbs that articulate, walk and combat animations that read at a glance. Every NPC from Cook Edda to Korr the Molten got the treatment. Maraza the Rimebound is still frozen mid-fury, but now you can tell it's fury.

**Phase three: the world catches up.** Trees, rocks, buildings, fences, furnaces, banks, altars — hundreds of world objects remodeled to match the new inhabitants. The headline features: **roofs** that fade away when you walk inside (the genre's most beloved trick, and harder than it looks when your buildings were not designed to have insides), and **dynamic shadows** that ground every model in the world instead of leaving it floating on the grass like a sticker.

**Phase four: the interface.** We reskinned the entire UI in the game's design language — stone bevels, parchment panels, yellow outlined text — and added a scaled fixed mode so the classic boxed layout stays crisp at any window size. The interface should feel like part of the world: a thing carved and ink-stained, not a website floating over a game.

**What we learned.** Three things. First, ship the overhaul in phases — players forgave week-by-week unevenness because each week visibly improved. Second, silhouettes beat polycounts: most models are still well under a thousand triangles, and they read better than the high-poly experiments we threw away. Third, the examine text was always the real graphics engine; the models just have to not embarrass it.

The cube era is survived by one screenshot on the office wall, labeled *the Unstruck Age*. Onward.`,
  },
];

export default NEWS_POSTS;
