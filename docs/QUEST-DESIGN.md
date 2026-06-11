# QUEST-DESIGN.md — "The Gathering Discord" arc + 6 side quests

Implementation-ready specs for 10 quests: the 4-chapter main questline **THE GATHERING
DISCORD** (the Quiet Measure is ending) and 6 side quests. Written against
`docs/LORE.md` (binding canon), `docs/DESIGN-REFERENCE.md` (quality bar), and the
world-fill structures pass (Ravenmoor Manor, Imber Spire, Quiess Tower, the windmill,
Gullswreck Light, the ruined chapel, the waystones).

**Implementers write the final prose.** Dialogue below is *intent per beat*, not script.
Every dialogue screen: ~1 joke max, objective line always played straight (quality bar
rule 4).

---

## 0. Conventions all 10 implementers follow

- **Stage state**: `state.player.quests[questId] = stage` (0 = not started; `doneStage`
  = complete). Auxiliary counters/bitmasks live in their own keys (existing precedent:
  `seeds_kills`). All aux keys are listed in §14.5 — do not invent colliding ones.
- **Pack idiom**: copy `src/packs/quest_city.ts` / `quest_warlord.ts` —
  `registerQuest`, `registerNpcAction`, `registerObjectAction`, `registerItemOnObject`,
  `startDialogue`, `showOptions`, `onKill`, `addXp`, `addItem`. New packs do NOT edit
  `src/packs/index.ts` (integrator wires imports).
- **NPC option collision rule**: `registerNpcAction` *appends* — two packs registering
  the same `(npc, option)` produce duplicate menu entries. Each `(npc, option)` pair in
  §14.3 is owned by exactly ONE implementer. Quests touching an NPC whose `Talk-to` is
  already taken (Mira, Brogan, Flint, Vex, Lenny, Quill, Wick, Old Fen, Ticksworth,
  Sorrel, Danquavious…) use a bespoke option label (existing idiom: `Ask-about-wool`,
  `Ask-about-the-depths`).
- **`registerItemOnObject` is single-handler per `item|objType` key** (Map.set). Keys
  are allocated in §14.4 — one owner each. Handlers on shared object *types* (altar,
  bookshelf) must coordinate-gate on the object's `x,y` and no-op politely elsewhere.
- **Re-talk reminders**: quest giver mid-quest repeats a 1–2 line objective reminder
  (quality bar rule 5). Post-quest: one idle line.
- **Fetch items need ≥2 acquisition paths** (rule 3) — each fetch below lists both.
- **Existing-id verification**: any *existing* item/object id referenced below (`coal`,
  `logs`, `plank`, `bones`, `wheat`, `flour`, `bread`, `hammer`, `tinderbox`,
  `ember_crystal`, `bookshelf`, `altar`, `brazier`, `crate`…) must be verified against
  `data/items.json` / `data/objects.json` before use; if one is genuinely missing, add
  it to YOUR fragment and note it in your report.
- **Fragments**: every NEW id ships in the owner's fragment file
  `data/_fragments/<name>.json` (exact real-file schemas; copy a live entry as
  template). File assignments in §13 — no two implementers touch the same file.
- **XP scale (calibrated to live packs)**: Empty Larder 300 Cooking; Streets of Aldgate
  300 Construction + 150c; Seeds of Trouble 500 Farming + 200c; Warlord's Banner
  800 Attack + 500c. Tiers used below: novice 300–500, intermediate 600–900,
  experienced 1,000–1,500 (+ coins in proportion). Every quest's reward includes one
  **permanent keepsake or access** (rule 6) — never consumables-only.
- **Coordinates**: world is 300×300; player spawn (22,38) Bellmeadow. Key anchors:
  Castle (21,37), Aldgate (103,30), Swamp Mine (22,68), Imber Spire (270,12; wizard at
  270,17), Quiess Tower (288,86; wizard at 284,86), Ravenmoor Manor (238,155; cellar
  door 232,159), windmill (227–231,59–63), Gullswreck Light (103,246; beacon 103,245),
  ruined chapel (275–281,107–114; altar 278,109), waystones (236,38) / (263,130) /
  (241,202).

---

## 1. ARC OVERVIEW — The Gathering Discord

F.S. 743. The Quiet Measure has held for forty-two years, and it is ending. The
Offnote's countless slivers — inert since the Discord Wars — have begun ringing in
sympathy with something, faintly and *together*, like an orchestra tuning before a
performance. Someone is collecting them. Someone with a score.

- **Ch1 — Sour Notes** (Bellmeadow, novice): the vale's song is a half-beat flat;
  the player gathers the first proof.
- **Ch2 — A Quarrel of Wizards** (Aldgate → both towers, intermediate): the realm's
  two consulting wizards agree the slivers are ringing and on absolutely nothing else;
  the waystones triangulate the source — *west*, under the vale.
- **Ch3 — The Sealed Wing** (Swamp Mine, experienced): the source sits behind the
  gallery the miners bricked from the *inside* in '88. Opening it **unlocks the Untuned
  Mine dungeon** (gate contract §14.2).
- **Ch4 — The Gathering Discord** (Untuned Mine, experienced+): the player meets the
  collector — **the Conductor**, a robed voice in Sarrash temple silk transcribing the
  slivers into a score he calls the *Second Chord* — defeats his copyist-construct, and
  does NOT catch him. The Measure is over; the arc's villain is at large; every
  waystone in Cantorne chimes once. (MMO rule: the Offnote is never resolved — Ch4
  opens the next era of content: the Conductor, the Sarrash F.S. 537 mystery, Maraza's
  slipping note, the Deep Bog fragment.)

Canon threads used (all from LORE.md): monsters are music gone wrong; slivers fell
"everywhere else"; Sarrash's choirs were "lured into singing the Offnote's
counter-melody" (Stillwater theory — the Conductor is the payoff); Swamp Mine canon
"once for whoever didn't come back in '88"; Brogan's torn-out first ledger name;
gunpowder = powdered Offnote percussion (fizzle rates are a *sensor*).

---

## 2. CH1 — "Sour Notes" — `gd1_sour_notes` — implementer **Q1**

| | |
|---|---|
| Quest id / doneStage | `gd1_sour_notes` / **5** |
| Start | **Mira the Magic Tutor** (`magic_tutor`), Bellmeadow, option **`Ask-about-the-hum`** (her `Talk-to`/`Trade` are taken) |
| Prereq | none |
| Recommended | combat 3; no skills |
| Comedic premise | Mira's air runes keep casting slightly to the left, and she has been compensating by standing slightly to the right |

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Mira the magic tutor keeps tilting her head at nothing, like she's hearing a fly nobody else can." |
| 1 | Accept at Mira | Receives **`tuning_fork`** (NEW). Sound it at two landmarks (order-independent, bitmask `gd1_rings`): use fork on the **castle chapel `altar`** (bit 1) and on a **riverside `willow`** by the old bridge (bit 2). Each gives a flat, sour chime + flavor msg. | "Mira gave me a tuning fork. I should sound it at the chapel altar and at a willow by the River Murmur." (lists which remain) |
| 2 | Second ring sets stage | Return to Mira. | "Both readings are flat by the same half-beat. Mira needs to hear this." |
| 3 | Talk Mira | She's alarmed — the *same* sourness in Aulden's stone and Syla's green means it isn't local. Sends player to **Dr. Ticksworth** (`dentist_dr_tick`, option **`Ask-about-motes`**): his tick-mote intake doubled this bar, and something rat-shaped raided his tick larder. He asks the player to kill **2 `giant_rat`** behind the clinic (lvl 3; aux `gd1_rats`, `onKill`). | "Dr. Ticksworth's discord-mote ticks have doubled. First: deal with the rats in his larder. (x/2)" |
| 4 | Talk Ticksworth after 2 kills | He confirms in writing — gives **`clinic_note`** (NEW). Return to Mira. | "I have Dr. Ticksworth's note. Mira will want to see it." |
| 5 | Talk Mira (turn-in) | She removes `clinic_note`, writes **`mira_letter`** (NEW, kept) addressed to Master Flint of the Aldgate Gun Guild — "the Guild measures the Offnote daily; they just call it quality control." **Complete.** | "The vale is singing flat and the motes are rising. Mira's letter is for Master Flint in Aldgate. Quest complete!" |

### Beats & dialogue intent
1. **Hook (talk):** Mira, played dry: her runes drift left; the kettle sings flat; she
   wants data, not panic. Objective stated straight: sound the fork at stone (altar)
   and green (willow). Decline option: she notes the kettle will still be flat tomorrow.
2. **Soundings (use-item, parallel):** each handler coordinate-free (any `altar` /
   `willow` works — generosity beats pedantry at novice tier); flavor differs per
   object. The fork "hums a half-beat behind itself."
3. **Ticksworth (talk):** clinic comedy — artisanal remediation, Glen offstage asking
   for a bigger cracker — but the mote-count line is straight. Rat task stated plainly.
4. **Rats (fight):** lvl-3 rats by the clinic; escapable by walking away; at-level
   (rule 7 satisfied).
5. **Turn-in (talk):** Mira connects flat song + rising motes = the slivers are ringing
   *in sympathy*. She won't say with what. Letter handed over; completion is gated on
   stage, never on still-holding the letter (it's flavor — Flint's Ch2 dialogue works
   with or without it).

### Content needed
- **NEW items** (fragment `q1_gd1.json`): `tuning_fork` (key item, kept forever —
  Ch2/Ch4 reuse it; examine: it hums before you strike it), `clinic_note`,
  `mira_letter`.
- Existing: `altar`, `willow` objects; `giant_rat`, `magic_tutor`, `dentist_dr_tick`.
- Combat: 2× `giant_rat` (existing spawns near clinic suffice; add 1 spawn in fragment
  only if none are within ~15 tiles of the Tick Eat clinic).

### Rewards
400 Magic XP, 100 coins, keep the **tuning fork** (permanent key item the whole arc
uses). Progression: introduces the meta-plot, teaches use-item-on, points the player at
Aldgate.

---

## 3. CH2 — "A Quarrel of Wizards" — `gd2_quarrel_of_wizards` — implementer **Q2**

| | |
|---|---|
| Quest id / doneStage | `gd2_quarrel_of_wizards` / **6** |
| Start | **Master Flint** (`gun_guild_master`), Aldgate Gun Guild hall, option **`Ask-about-the-fizzles`** |
| Prereq | `gd1_sour_notes >= 5` (otherwise the option gives a brush-off line) |
| Recommended | combat 15 (all combat avoidable) |
| Comedic premise | The two wizards answer every letter promptly — with angrier letters about each other. They have not agreed since F.S. 720 and keep meticulous records of it |

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Master Flint has been frowning at the Guild's powder ledger and muttering about fizzle rates." |
| 1 | Accept at Flint | Powder misfires are up — the milled Offnote is *livelier*. Flint forwards the problem to the realm's two consulting wizards. Go to **Calder Brightverse** (`imber_wizard`, Imber Spire, 270,17). | "Master Flint wants the wizards consulted. Calder Brightverse keeps the Imber Spire in the eastern snows." |
| 2 | Talk Calder (`Talk-to` — Q2 owns it) | Beat inside the stage: he won't scry until you stoke his brazier (use `tinderbox` on a spire `brazier` — key `tinderbox\|brazier`, coord-gated to the spire). Verdict: *the Offnote is waking; burn the source out;* also Vesper Hollowell is a graveyard romantic. Go to Vesper. | "Calder says the Offnote is waking and the answer is fire. He insists Vesper will say something soggy about listening." |
| 3 | Talk Vesper (`quiess_wizard`, `Talk-to` — Q2 owns it) | Vesper: *not waking — gathering. Something is calling the slivers in.* They agree on one thing only: triangulate. Sound the **fork on all 3 `waystone`s** (236,38 / 263,130 / 241,202; key `tuning_fork\|waystone`; bitmask `gd2_rings`). The corridor stone (263,130) sits near dire wolves / forest spiders — avoidable. | "Ring the tuning fork at the three road waystones: Aldgate east road, the corridor road, the Stonewatch south road. (x/3)" |
| 4 | Third ring sets stage | Each ring reports a beat-offset; player returns to **either** wizard (both handlers accept; flavor differs, outcome identical). | "I have all three readings. Either wizard can read them — preferably without the other in the room." |
| 5 | Talk either wizard | The offsets triangulate **west — under the vale, at the Swamp Mine**. Horrified into cooperation, they co-sign **`wizards_writ`** (NEW; one parchment, two furious signatures, three postscripts). Deliver to Flint. | "West. Under Bellmeadow itself. The wizards co-signed a writ for Master Flint — the postscripts are mostly about each other." |
| 6 | Talk Flint (turn-in) | Removes writ; Flint stamps the Guild seal and says he'll put it before Brogan and the Duke. Gives reward + **`guild_powder_horn`**. **Complete.** | "The discord is coming from under the Swamp Mine. Flint is taking the writ to the duchy. Quest complete!" |

### Beats & dialogue intent
- Flint: dry logistics man; fizzle-rate graph as comedy, conclusion straight. Mentions
  Mira's letter if `gd1` done (always true).
- Calder: all certainty and singed eyebrows; fire doctrine; one genuine insight (the
  slivers ring *louder at night* — when Korr hammers).
- Vesper: near-whisper; one genuine insight (the ringing has *tempo* — random noise
  doesn't keep time; someone is keeping time).
- The waystone leg is the explore spine — pulls the player across the whole east
  expansion past Eldermere, the corridor, and the Stonewatch road. New ambient mob
  **`discord_wisp`** (NEW, lvl 12, non-aggressive) placed near the corridor waystone and
  the ruined chapel: slivers shaken loose, drifting like dust motes that hum. Optional
  kills; pure atmosphere + drops.
- Verb spine: talk → use+talk → use-item×3 (explore) → talk → talk-deliver. No two
  identical consecutive stage verbs.

### Content needed
- **NEW** (fragment `q2_gd2.json`): item `wizards_writ`; item `guild_powder_horn`
  (keepsake — examine joke; doubles as a tinderbox if implementers wire
  `registerItemAction('guild_powder_horn','Strike',…)`, else flavor); **npc
  `discord_wisp`** def (spec §12) + 2 npcSpawns: (262,128) and (277,112).
- Existing: `waystone`, `brazier` objects; `tuning_fork` (Q1's def — reference the id).

### Rewards
800 Magic XP, 400 coins, `guild_powder_horn` keepsake. Progression: introduces both
wizards and the waystone network, walks the east expansion, aims the arc back west at
the Swamp Mine.

---

## 4. CH3 — "The Sealed Wing" — `gd3_sealed_wing` — implementer **Q3**

| | |
|---|---|
| Quest id / doneStage | `gd3_sealed_wing` / **6** — **this stage gates the Untuned Mine dungeon (§14.2)** |
| Start | **Brogan** (`slayer_master`), Bellmeadow, option **`Ask-about-the-sealed-wing`** |
| Prereq | `gd2_quarrel_of_wizards >= 6` |
| Recommended | combat 30; Mining 15 helps (coal), not required |
| Comedic premise | Carpenter Lenny has been "about to fix the archive shelf" since F.S. 739, and every record that ever mattered is filed under the leg of his workbench |

### Story
The Swamp Mine's north gallery collapsed in '88 — except it didn't collapse. Foreman
**Wat Hollis** bricked it shut *from the inside* and never came out. His is the first
name in Brogan's ledger — the one crossed out so hard it tore the page (canon). The
wizards' triangulation points straight through that wall.

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Brogan has the wizards' writ on his desk and a face like the weather's turned." |
| 1 | Accept at Brogan | Need the old mine survey to find the gallery. The duchy archive copy went missing — Carpenter Lenny "borrowed" the shelf it sat on. Talk **Lenny** (`carpenter`, option **`Ask-about-the-survey`**): he'll dig it out of his workbench strata for **2 `plank`** (paths: sawmill/craft OR market purchase — same sourcing as Streets of Aldgate). | "Carpenter Lenny has the old mine survey buried in his workshop. He wants 2 planks — for the shelf he's been meaning to fix since '39." |
| 2 | Give Lenny planks | Receive **`mine_survey`** (NEW). It marks the sealed north gallery — annotated in Hollis's hand: *"Not a cave-in. Don't let them dig."* Take it to **Sergeant Vex** (`gun_trainer`, option **`Ask-about-blasting`**). | "The survey marks a sealed gallery in the Swamp Mine — sealed on purpose. Sergeant Vex can mill a breaching charge." |
| 3 | Talk Vex with survey | Guild process beat: she'll pack a charge for **2 `coal` + 1 `ember_crystal`** (coal: mine it at the Swamp Mine OR buy; ember_crystal: `cinder_imp`/`shadow_drake` drops OR — second path — Calder sells one for 200 coins via Q3-owned option **`Buy-ember-crystal`** on `imber_wizard`). Hand over → **`blasting_charge`** (NEW). | "Vex wants 2 coal and an ember crystal to mill a breaching charge. (lists what's missing)" |
| 4 | Use `blasting_charge` on **`untuned_mine_door`** (NEW object, Swamp Mine cave area — placeholder tile (23,75), integrator finalizes) | The blast scars the masonry — and wakes **2 `hollow_miner`** (NEW, lvl 34, aggro; the '88 crew's echoes, peeled off the rock like ash fiends). Kill both (aux `gd3_miners`, `onKill`). Required kill, at-level for the tier. | "The charge cracked the seal — and the seal answered. Put the hollow miners to rest. (x/2)" |
| 5 | Both dead → `Search` the breached door | Through the gap: Hollis's last ledger within arm's reach — **`foreman_ledger`** (NEW). Final entries: *"It isn't a vein. It's a score. Someone is down here transcribing."* Return to Brogan. | "Foreman Hollis sealed the wing because someone was down there — transcribing. Brogan has to see this ledger." |
| 6 | Talk Brogan (turn-in) | He reads the name he tore out of his own ledger, says nothing about it, and extends the duchy license: the wing is open. Gives reward + **`hollis_lamp`**. **Complete — Untuned Mine access unlocked.** | "The sealed wing is open and the duchy license covers it. Whatever Hollis walled in, it's mine to face now. Quest complete!" |

### Dungeon gate (the exact contract — see also §14.2)
Q3's pack owns `registerObjectAction('untuned_mine_door', 'Enter', …)`:

```ts
if ((state.player.quests['gd3_sealed_wing'] ?? 0) >= 6) {
  // dungeon entry (until the dungeon map ships: msg('The breach yawns dark.
  // Cold air keeps time against your face.') — dungeon team replaces body)
} else {
  msg('The gallery is bricked shut — from the inside. It would take a blasting charge and a duchy writ.');
}
```

The door object stays in the world permanently (post-blast its examine changes via
stage-gated handler text; visual swap optional for the render team).

### Content needed
- **NEW** (fragment `q3_gd3.json`): items `mine_survey`, `blasting_charge`,
  `foreman_ledger`, `hollis_lamp` (keepsake; examine: "It gutters near sour notes." —
  the dungeon team may use it as a telegraph prop later); **npc `hollow_miner`** (spec
  §12) + 2 npcSpawns flanking the door (placeholder (22,76)/(24,76)); **object
  `untuned_mine_door`** (blocking, like `cellar_door`) + 1 mapObject (placeholder
  (23,75) — at the Swamp Mine cave mouth area; **integrator finalizes the tile**, pack
  logic must key off object *type*, never coords).
- Existing: `plank`, `coal`, `ember_crystal`, `carpenter`, `gun_trainer`,
  `imber_wizard`, `slayer_master`.

### Rewards
1,200 Mining XP, 600 coins, `hollis_lamp` keepsake, **ACCESS: the Untuned Mine
dungeon** (the arc's permanent unlock; quality bar rule 6's "foundational"
requirement). Progression: opens the game's next dungeon; pays off two pieces of mine
canon ('88, Brogan's torn name).

---

## 5. CH4 — "The Gathering Discord" — `gd4_gathering_discord` — implementer **Q4**

| | |
|---|---|
| Quest id / doneStage | `gd4_gathering_discord` / **5** |
| Start | **Brogan** (`slayer_master`), option **`Ask-about-the-breach`** |
| Prereq | `gd3_sealed_wing >= 6` |
| Recommended | combat 45+, food; the boss is the realm's first telegraph-pattern fight |
| Comedic premise | Getting two wizards to sign ONE plan requires more diplomacy than the plan itself; their joint writ has a clause count higher than its word count |

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Brogan wants the breach answered, not just opened. He's assembling opinions. He hates opinions." |
| 1 | Accept at Brogan | Get the wizards to agree on ONE plan, in writing. Shuttle diplomacy (both via Q4-owned option **`Ask-about-the-plan`**): Calder demands Vesper concede the source must be *destroyed*; Vesper demands Calder concede it must be *heard first*. Player carries each concession to the other (2 visits each, bitmask `gd4_accord`); when both bits set, the second wizard hands over **`joint_writ`** (NEW). | "Calder and Vesper must sign one plan. Currently they have signed several complaints. (tracks who still needs what)" |
| 2 | Writ in hand (stage set on receipt) | Enter the breach and descend to the **resonance stand** — **`resonance_stand`** (NEW object; placeholder mapObject just inside the breach at (23,77); **the dungeon team relocates it to the Resonance Gallery, the quest wing's deepest room, when the map ships** — pack keys off object type only). Explore beat. | "The writ is signed. Time to go through the breach and find what's been keeping tempo down there." |
| 3 | Use `tuning_fork` on `resonance_stand` (key `tuning_fork\|resonance_stand`) | The fork rings true for the first time — answered, in time, from the dark. **The Conductor speaks** (dialogue only — a voice in Sarrash temple silk at the edge of the light; **no NPC entity**, all delivered via `startDialogue`): he is transcribing the slivers into a *Second Chord*; he thanks the player for opening the wing; he does not fight — his copyist does. **`the_dissonant`** (NEW boss, lvl 62 — spec §12; permanent spawn near the stand) attacks. Kill it (aux `gd4_boss`, `onKill`). | "Something down here calls itself the Conductor — and it says thank you. Its copyist disagrees. Destroy the Dissonant." |
| 4 | Boss dead → `Search` **`conductors_lectern`** (NEW object beside the stand) | The Conductor is gone into the rock — bowing first: *"You've an ear. We'll want it, when the Measure ends."* The lectern holds a **`torn_score_page`** (NEW). Broadcast flavor: **every waystone in Cantorne chimes once** (`msg`, 'level' class). | "The Conductor walked into the stone like a door. He left a page of his score — and every waystone in the realm just chimed at once." |
| 5 | Talk Brogan (turn-in) | Council epilogue: Brogan, with Mira's/Flint's/the wizards' reactions relayed in dialogue. The page is one bar of something vast; the Quiet Measure is formally over (Brogan: starts a new ledger; writes one name in it). **Complete.** Cliffhanger explicit; nothing resolved. | "The Quiet Measure is over. The Conductor is loose with his unfinished score, and Brogan's new ledger has exactly one name in it. Quest complete!" |

### Boss design (per DESIGN-REFERENCE boss telegraph rules)
`the_dissonant` — a copyist-construct of slate and stretched wire, lvl 62, 140 hp,
4-tick attack cycle. Spec note for server/sim team (Q4 documents this in code comments;
sim implementation may land later): its heavy hit (the "rest" — a crushing silence)
should be telegraphed ≥2 ticks on the target tile and dodgeable by moving 1–2 tiles
(rule 12); at half HP it shrieks in 2 `discord_wisp` adds (existing def from Q2's
fragment — sim-side summon optional; acceptable v1 fallback is a plain stat fight).
It remains as a **repeatable mini-boss** post-quest (respawn ~100 ticks): guaranteed
coins + rune drops every kill, ~1/33 unique `dissonant_baton` (vanity off-hand).

### Content needed
- **NEW** (fragment `q4_gd4.json`): items `joint_writ`, `torn_score_page` (kept —
  examine is the cliffhanger), `dissonant_baton` (drop-table vanity); **npc
  `the_dissonant`** (spec §12) + 1 npcSpawn (placeholder (24,78), relocates with the
  stand); **objects `resonance_stand`, `conductors_lectern`** + 2 mapObjects
  (placeholders (23,77)/(24,77)).
- Existing: `tuning_fork` (Q1), `discord_wisp` (Q2), `slayer_master`, both wizards,
  `waystone` (chime broadcast is message-only — no object edit).

### Rewards
1,500 Slayer XP + 800 Magic XP, 1,000 coins, `torn_score_page` keepsake, and the
repeatable Dissonant boss. Progression: ends the Quiet Measure on-screen, establishes
the arc villain, and leaves four loaded hooks (Conductor, Sarrash 537, the Deep Bog
fragment, Maraza's slipping note from Q6) for future updates.

---

## 6. SIDE — "The Hush of Ravenmoor" — `hush_of_ravenmoor` — implementer **Q5**

| | |
|---|---|
| Quest id / doneStage | `hush_of_ravenmoor` / **6** |
| Start | **Lady Eseld Ravenmoor** (`lady_ravenmoor`, 237,152), `Talk-to` (free — no prior handler) |
| Prereq | none |
| Recommended | combat 30 |
| Comedic premise | Groundskeeper Mortlock attributes everything — the chimes, the fountain, the weather, at one point the player — to "settling timbers" |

### Story (gothic mystery built on the world-fill manor)
The manor's bone chimes ring with no wind, every night, same hour. The servants left.
Lord Ravenmoor died in F.S. 738, the night the cellar (sealed annex; blocking
`cellar_door` at 232,159) was bricked up. Eseld wants the truth more than she wants
comfort. The truth: her husband brought a sliver of the bog's drowned refrain home *in
a jar* — a collector's piece — and it outlived him.

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Lady Ravenmoor stands at her gate at dusk, listening to chimes that shouldn't be ringing." |
| 1 | Accept at Eseld | Investigate the library (NE room): Q5-owned `Search` option on `bookshelf`, **coordinate-gated to the manor library tiles** (within x231–245, y146–151; elsewhere: polite no-op). Finds **`ravenmoor_diary`** (NEW): the lord's last entry — a jar from the bog, "a note that never resolves; it helps me sleep." | "Search the manor library. Lady Ravenmoor says her husband's last weeks live on those shelves." |
| 2 | Diary found | Confront **Mortlock** (`groundskeeper`, `Talk-to` — Q5 owns). He cracks past the settling-timbers routine: he bricked the cellar on his lord's dying order and kept the key. He'll yield it for one thing done properly — a **white lily** for the grave he tends. | "Mortlock has the cellar key and a condition: a white lily for Lord Ravenmoor's grave." |
| 3 | Fetch `white_lily` (NEW) | Two paths: groundSpawn on the mere's outflow bank by the Quiess Tower (≈287,90; Q5 fragment) OR buy from **Old Fen** for 50 coins (Q5-owned option **`Ask-about-lilies`** on `gardener`). Give to Mortlock → **`cellar_key`** (NEW). | "A white lily grows where water sits quiet — the mere's outflow by the Quiess Tower. Or Old Fen might part with one." |
| 4 | `Unlock` the `cellar_door` (Q5 owns the object's actions; requires key) | The pack **removes the blocking `cellar_door` object** (per world-fill caveat this is the sanctioned mechanism; client-local removal — note multiplayer caveat in code comment). Inside the 9-tile annex: search the `crate` (coord-gated) → the jar, broken from the inside. **`manor_revenant`** (NEW, lvl 30, aggro; the escaped note wearing the lord's echo; permanent spawn in the annex) attacks. Kill it. | "The cellar is open. The jar is broken — from the inside. Something in there is still keeping its hour." |
| 5 | Use `ravenmoor_diary` on the library **`quiess_chime`** (key `ravenmoor_diary\|quiess_chime`) | The chimes play the lord's own motif back — resolved, ended. The nightly ringing stops (flavor). | "The diary held his melody. The chimes have finally finished the phrase. Lady Ravenmoor should hear it from me." |
| 6 | Talk Eseld (turn-in) | Grief played straight, one beat of Mortlock comedy as relief. Reward + **`ravenmoor_signet`**. **Complete.** | "The hush over Ravenmoor is an honest silence now. Lady Ravenmoor counts me a friend of the house. Quest complete!" |

### Content needed
- **NEW** (fragment `q5_ravenmoor.json`): items `ravenmoor_diary`, `white_lily`,
  `cellar_key`, `ravenmoor_signet` (keepsake — house favor; future manor content hook);
  **npc `manor_revenant`** (spec §12) + 1 npcSpawn inside the annex (232,161);
  1 groundSpawn `white_lily` (287,90).
- Existing: `bookshelf`, `crate`, `quiess_chime`, `cellar_door` objects;
  `lady_ravenmoor`, `groundskeeper`, `gardener`.
- Note: post-quest the revenant respawn persists (a 9-tile lair); post-quest journal
  and Eseld's idle line frame it as "the cellar's chill never quite leaves" — or the
  implementer may gate its aggression by stage if the sim supports it.

### Rewards
700 Prayer XP, 500 coins, `ravenmoor_signet`. **ACCESS: the cellar stays open
permanently.** Progression: opens the manor's sealed space, ties Ravenmoor to the Deep
Bog fragment (future questline ammunition), first gothic-register quest.

---

## 7. SIDE — "Cold Comfort" — `cold_comfort` (Imber Spire) — implementer **Q6**

| | |
|---|---|
| Quest id / doneStage | `cold_comfort` / **5** |
| Start | **Calder Brightverse** (`imber_wizard`), option **`Ask-about-the-cold`** (his `Talk-to` belongs to Q2) |
| Prereq | none |
| Recommended | combat 35 (two lvl-38 ice wolves) |
| Comedic premise | A fire wizard with no eyebrows whose answer to every problem, including the problem caused by fire, is more fire |

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "The melted ring around the Imber Spire is smaller than it was last month, and Calder has noticed." |
| 1 | Accept | His scorch ring is shrinking — Maraza's cold is creeping *downhill*, which it has not done in 341 years. Fetch **5 `coal`** (paths: mine — Swamp Mine / Frostpeak rocks — OR buy from a market/Exchange). "Honest fuel. Magic fire lies about the temperature." | "Calder needs 5 coal — honest fuel — to read the cold properly. (x/5)" |
| 2 | Deliver coal | Relight the **two flanking `brazier`s** at the spire door (use `tinderbox` on each; Q6 may NOT use the `tinderbox\|brazier` key — Q2 owns it; Q6 registers an **object action `brazier`/`Relight`**, coordinate-gated to the two doorway braziers; bitmask `q6_braziers`). | "Relight both braziers flanking the spire door. (x/2)" |
| 3 | Both lit | The light draws what the cold sent: drive off **2 `ice_wolf`** (existing spawns beside the spire; aux `q6_wolves`). | "The braziers are lit and the cold sent wolves to argue. Drive off two ice wolves. (x/2)" |
| 4 | Wolves done | Return to Calder; he scrys the doubled flame — it bends **north-east, toward the summit**: "Her note is slipping. The Rimebound is going to finish her Solo or die failing, and I genuinely cannot tell you which is worse." (Future-content hook; played straight.) | "The flame bends toward Frostpeak. Calder needs a moment. And possibly eyebrows." |
| 5 | Final talk (same visit or re-talk) | Reward + **`calder_brand`**. **Complete.** | "Calder is writing to Vesper voluntarily, which frightens me more than the wolves did. Quest complete!" |

### Content needed
- **NEW** (fragment `q6_cold_comfort.json`): item `calder_brand` (keepsake firelighter
  — examine: "Never quite goes out."; optional QoL: `registerItemOnObject` is taken
  for braziers, so wire as item action `Light` that behaves as tinderbox if the
  firemaking API allows, else flavor).
- Existing: `coal`, `tinderbox`, `brazier`, `ice_wolf` (existing spire spawns),
  `imber_wizard`.

### Rewards
600 Firemaking XP, 300 coins, `calder_brand`. Progression: activates the Imber Spire
as a place, plants the Maraza-stirs hook that Ch4's epilogue lists among the era's
open threads.

---

## 8. SIDE — "A Hymn for the Hollow" — `hymn_for_the_hollow` (Quiess Tower) — implementer **Q7**

| | |
|---|---|
| Quest id / doneStage | `hymn_for_the_hollow` / **6** |
| Start | **Vesper Hollowell** (`quiess_wizard`), option **`Ask-about-the-chapel`** (her `Talk-to` belongs to Q2) |
| Prereq | none |
| Recommended | any — **zero required combat** (the chapel's giant_rat squatter is lvl 3 and avoidable) |
| Comedic premise | Vesper speaks at a volume that makes the player lean in; stage directions have the player's replies getting quieter screen by screen until both are essentially miming. Objective lines stay straight |

### Story
The ruined chapel up the corridor (altar at 278,109) holds a snagged soul: a Discord
Wars chaplain who won't pass to Quiess until his congregation's bones are buried and
the closing verse is hummed. The bones ground-spawns at (277,111)/(279,113) are his
congregation.

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Vesper Hollowell keeps glancing south-west, toward the broken chapel on the corridor road." |
| 1 | Accept | Go to the chapel; Q7-owned object action **`altar`/`Listen`**, coordinate-gated to (278,109). The player hears the snag: a verse stopped one line short. | "Listen at the broken chapel's altar — Vesper says the silence there has a shape." |
| 2 | Listened | Gather **5 `bones`** (paths: the chapel's own 2 ground spawns + any common kill — goblins, rats — i.e. world-spawn AND drop paths both live). | "Five of the congregation's bones, gathered gently. (x/5)" |
| 3 | Use `bones` on the chapel altar ×5 (key `bones\|altar`, **strictly coordinate-gated to (278,109)** — must not intercept altars elsewhere; counts via `q7_buried`) | Each burial is a small straight beat. On the fifth, **`chapel_echo`** (NEW non-attackable NPC, permanent spawn at (278,110)) becomes talkative: he needs the closing verse, which he never learned — "I was the caller, not the answer." | "The bones are laid. The chaplain's echo wants the closing verse — and doesn't know it." |
| 4 | Talk echo, then return to Vesper | Vesper teaches it — gives **`hollow_verse`** (NEW). Intent: the verse is hers to give because Quiess's people keep all endings. One whispered joke; the gift played straight. | "Vesper wrote the closing verse out for me. Her handwriting is somehow also quiet." |
| 5 | Use `hollow_verse` on the chapel altar (key `hollow_verse\|altar`, same coord gate) | The hum; the echo answers the last line and *settles* (he remains as a faint, content shade — examine/idle text shifts post-quest: "he waits for stragglers now, unhurried"). | "The verse is sung and answered. The chapel is just a ruin now — the good kind." |
| 6 | Talk Vesper (turn-in) | Reward + **`quiess_feather`**. **Complete.** | "One of the war's last stray notes has gone home to Quiess. Quest complete!" |

### Content needed
- **NEW** (fragment `q7_hymn.json`): items `hollow_verse`, `quiess_feather` (keepsake;
  examine: "Weighs less than the silence between notes."); **npc `chapel_echo`**
  (non-attackable, spec §12) + 1 npcSpawn (278,110).
- Existing: `altar` object (chapel instance), `bones`, `quiess_wizard`, the chapel's
  bones groundSpawns and `giant_rat` squatter (untouched — atmosphere).

### Rewards
800 Prayer XP, 200 coins, `quiess_feather`. Progression: the game's first
no-combat-required quest (breadth for non-fighters), activates the Quiess Tower and
the ruined chapel, and demonstrates the "killing wraiths is mercy" theology in a
gentler key.

---

## 9. SIDE — "Keep the Light" — `keep_the_light` (Gullswreck Light) — implementer **Q8**

| | |
|---|---|
| Quest id / doneStage | `keep_the_light` / **5** |
| Start | **Keeper Brand Wicklow** (`light_keeper` — NEW NPC, Q8 fragment; spawn 104,247 at the lighthouse) |
| Prereq | none |
| Recommended | combat 30 (one lvl-30 pirate) |
| Comedic premise | Wicklow has named the beacon "Marigold" and discusses her like a difficult spouse; Marigold's side of things is implied to be worse |

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "The keeper at Gullswreck Light is arguing with his own beacon, and losing." |
| 1 | Accept | Marigold keeps guttering — and lately she goes out at *convenient* hours. First, fuel: fetch **5 `logs`** (chop anywhere OR buy) and **1 `lamp_oil`** (NEW item; paths: buy from **Boatman Wick** for 30 coins — Q8-owned option **`Buy-lamp-oil`** on `boatman` — OR groundSpawn in a Port Brackwater warehouse, Q8 fragment). | "Marigold wants feeding: 5 logs and a flask of lamp oil. Wick sells oil; Brackwater's warehouses misplace it." |
| 2 | Fuel in hand | Service the beacon (process beat, three interactions on **`beacon_brazier`** (103,245), all Q8-owned keys): use `logs` on it (loads, consumes 5), use `lamp_oil` on it, then use `tinderbox` on it (key `tinderbox\|beacon_brazier`). Lit. | "Load her, oil her, light her — in that order, and Marigold knows if you cheat." |
| 3 | Lit | Night-watch beat: the gutterings weren't weather — someone's been *shuttering* her for dark landings. A Wrecker skulker comes back to do it again: defeat **1 `pirate`** (Q8 fragment adds one pirate npcSpawn at 101,247; `onKill` while stage 3). Escapable; to finish, fight. | "Someone's been putting Marigold out on purpose. He's due back tonight. Be ready." |
| 4 | Pirate down | Return to Wicklow; he finds the shutter-hook the skulker dropped — Wrecker make. He'll report it to the harbormaster (cross-flavor with `thunder_on_the_tide`; no gating either way). | "The light-killer carried Wrecker tools. Wicklow is writing to Harbormaster Quill — slowly, he says, so the anger stays legible." |
| 5 | Final talk (turn-in) | Reward + **`keepers_spyglass`**. **Complete.** Post-quest idle: Marigold has not gone out since, "out of spite, which is how she shows love." | "Marigold burns steady over the causeway. Quest complete!" |

### Content needed
- **NEW** (fragment `q8_lighthouse.json`): items `lamp_oil`, `keepers_spyglass`
  (keepsake; examine joke; future use: spotting content at sea); **npc `light_keeper`**
  "Keeper Brand Wicklow" (non-hostile def) + npcSpawn (104,247); 1 npcSpawn `pirate`
  (101,247); 1 groundSpawn `lamp_oil` (Brackwater warehouse, pick a crate-adjacent
  floor tile near 105,196-ish — verify walkable).
- Existing: `logs`, `tinderbox`, `beacon_brazier`, `boatman`, `pirate`.

### Rewards
700 Firemaking XP, 300 coins, `keepers_spyglass`. Progression: staffs the world-fill
lighthouse, lights the causeway (flavor-safety for the island road), and seeds the
smuggling thread Q9 pays off.

---

## 10. SIDE — "Thunder on the Tide" — `thunder_on_the_tide` (Gullswreck smugglers) — implementer **Q9**

| | |
|---|---|
| Quest id / doneStage | `thunder_on_the_tide` / **6** |
| Start | **Harbormaster Quill** (`harbormaster`, Port Brackwater), option **`Ask-about-the-crates`** (her `Talk-to`/`Ask-about-work` are taken) |
| Prereq | none (pairs thematically with `keep_the_light`; no gating) |
| Recommended | combat 35 (two lvl-30 pirates) |
| Comedic premise | Every smuggler crate is labeled as an increasingly implausible fish — "PICKLED LAMPREY (ASSORTED)", "FRESH SHARK (DO NOT OPEN)", "MISC. EEL" |

### Story
Quill found black grit in a "fish" crate: milled thunder-shale — Guild-controlled
gunpowder — running through Gullswreck to skip Aldgate's ledgers. For Sergeant Vex,
who lost her watch commission proving the armoury sold powder to Saif (canon), this is
personal.

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Harbormaster Quill is holding a crate labeled 'MISC. EEL' at arm's length." |
| 1 | Accept | Receives **`powder_grit`** (NEW). Take it to **Sergeant Vex** (`gun_trainer`, Aldgate, Q9-owned option **`Show-powder-sample`**). | "Quill found powder grit in a fish crate. Sergeant Vex will know the mill it came from." |
| 2 | Talk Vex | She IDs the Guild mill-stamp in the grain, goes very calm (worse than angry), deputizes the player — gives **`guild_writ`** (NEW). Go to Gullswreck Cove (Wick's ferry) and search the dock crates. | "Vex deputized me. The trail runs through Gullswreck — search the crates on the Wreckers' docks. (x/3)" |
| 3 | Search 3 **`smuggler_crate`** (NEW object, 3 mapObjects on the cove docks — Q9 picks walkable dockside tiles near the cove's landing, verify against map; option `Search`; bitmask `q9_crates`) | First two: fish-label comedy + sand. Third: **`false_manifest`** (NEW) — routing in two hands, one of them a fence's. | "Two crates of lies and one of paperwork. The manifest names a fence: 'Tilly — two receipts as always.'" |
| 4 | Confront **Tilly Two-Receipts** (`cove_fence` — NEW non-hostile NPC, cove tavern-side spawn) | `showOptions` fork (same outcome, different flavor): show the `guild_writ` OR pay 100 coins ("the second receipt"). She gives up the runners — two Wreckers working the night shed. | "Tilly sold me the truth, which she insists is her best-moving product. The runners work the night shed." |
| 5 | Defeat **2 `pirate`** (existing cove spawns; aux `q9_runners`), then re-talk Tilly | She surrenders the **`powder_keg`** (NEW) "before it surrenders me." Return to Vex with keg + manifest. | "The runners are dealt with and I have the keg and the manifest. Vex gets both. (x/2)" |
| 6 | Talk Vex (turn-in) | Removes keg + manifest. The mill-stamp implicates someone *inside* the Guild's supply chain — Vex pockets that fact for later (future content hook; played cold and straight). Reward + **`guild_deputy_badge`**. Quill gets a grateful post-quest idle line via Q9's option. **Complete.** | "The powder run through Gullswreck is broken — but the stamp says it started inside the Guild. Vex is keeping that page. Quest complete!" |

### Content needed
- **NEW** (fragment `q9_smugglers.json`): items `powder_grit`, `false_manifest`,
  `guild_writ`, `powder_keg`, `guild_deputy_badge` (keepsake — Guild standing; future
  Guild questline hook); **npc `cove_fence`** "Tilly Two-Receipts" (non-hostile) +
  npcSpawn (cove interior, walkable tile near the dock buildings — verify); **object
  `smuggler_crate`** def + 3 mapObjects (cove dockside, verify walkable-adjacent).
- Existing: `pirate` (existing cove spawns), `harbormaster`, `gun_trainer`, `boatman`
  (ferry — no new handler needed).

### Rewards
800 Gun XP, 500 coins, `guild_deputy_badge`. Progression: gives Gullswreck its
promised trouble, deepens Guild/Wreckers/Saif triangle, plants the Guild-insider
thread.

---

## 11. SIDE — "Against the Grain" — `against_the_grain` (farm-belt comedy) — implementer **Q10**

| | |
|---|---|
| Quest id / doneStage | `against_the_grain` / **6** |
| Start | **Miller Hob Greaves** (`miller` — NEW NPC, Q10 fragment; spawn 232,61 by the windmill's east door) |
| Prereq | none |
| Recommended | combat 3; no skills |
| Comedic premise | The windmill grinds *backwards* — flour in, wheat out — and the resulting lawsuit will be decided, with full legal authority, by a chimpanzee. Everyone involved treats this as normal, because it is |

### Story
Wayfarer Sorrel sold Hob a "lucky millstone shim." It is carved from a sliver-stone —
an inert Offnote sliver (micro-foreshadowing of the main arc; zero gating) — and the
mill has been un-grinding ever since. A furious customer is suing Hob in the Court of
the Southern Lawn.

### Stage table
| Stage | Trigger | What happens | Journal |
|---|---|---|---|
| 0 | — | — | "Miller Hob Greaves is staring into his hopper like it owes him money. Apparently it does." |
| 1 | Accept | Test the mill: bring **1 `wheat`** (paths: pick from the farm-belt fields by the windmill OR buy from Pim the grocer) and use it on the **`millstone`** (key `wheat\|millstone`). Out come *two* wheat. Hob lies down. | "Run one wheat through the mill so I can see the impossible happen on purpose." |
| 2 | Test done | Talk **Wayfarer Sorrel** (`wayfarer`, Q10-owned option **`Ask-about-the-shim`** — his `Talk-to`/`Trade` are taken; he walks the manor lane near 258,156). He disclaims all warranty, reveals the shim's provenance (a goblin, a campfire, a very good price), and hands over **`shim_receipt`** (NEW) — which he wrote *after* the sale, which is the joke. | "Sorrel sold the 'lucky' shim in good faith, he says, holding a receipt he visibly just wrote." |
| 3 | Pry the shim | Needs a **`hammer`** (paths: general store purchase OR world spawn — verify a spawn exists; if not, Q10 adds one groundSpawn near the windmill). Use `hammer` on `millstone` (key `hammer\|millstone`) → **`lucky_shim`** (NEW; examine: it hums a half-beat behind itself — same phrasing family as the tuning fork, for players paying attention). | "One borrowed hammer and the lucky shim is out. It's still humming. I don't like that it's humming." |
| 4 | Court! | Take shim + receipt to **Danquavious Chimperton III** (`danquavious_chimperton`, Q10-owned option **`Present-evidence`**). Herald Bananrick announces the case at unnecessary volume (one beat). The Sovereign of Bananas examines the shim *gravely*, confiscates it as crown evidence (it will be displayed beside the golden banana), and rules: Sorrel refunds Hob; Hob stops suing the wind. Receives **`court_verdict`** (NEW). The verdict text is legally impeccable. | "The court has ruled. The shim is crown evidence, Sorrel owes a refund, and the wind is no longer a defendant." |
| 5 | Return to Hob | Final mill test (re-use 1 `wheat` on the millstone — now grinds *forward*, gives `flour`): jubilation. | "One wheat in, flour out. Hob wept. The flour was excellent." |
| 6 | Talk Hob (turn-in) | Reward + **`millers_token`**. **Complete.** Post-quest: Hob's `Talk-to` (Q10 owns it) gains a **`Collect-flour`** path — 1 free `flour` per login session, gated by a session flag (not persisted state). | "The mill grinds the right way round and I eat free flour for life. Quest complete!" |

### Content needed
- **NEW** (fragment `q10_windmill.json`): items `shim_receipt`, `lucky_shim` (taken by
  the court — not kept), `court_verdict` (kept — the keepsake document), `millers_token`
  (keepsake enabling Collect-flour); **npc `miller`** "Miller Hob Greaves"
  (non-hostile) + npcSpawn (232,61).
- Existing: `wheat`, `flour`, `hammer`, `bread`, `millstone` object (world-fill),
  `wayfarer`, `danquavious_chimperton`, `chimperton_herald` (flavor only — no new
  handler), `grocer`.
- No combat anywhere in the quest (second zero-combat option alongside Q7).

### Rewards
500 Cooking XP, 150 coins, 3 `bread`, `court_verdict` + `millers_token`
(permanent flour perk). Progression: activates the windmill and the farm belt, gives
the Chimperton court its first quest screen-time, and hides a main-arc wink (the
confiscated sliver now sits beside the golden banana — future writers: you're welcome).

---

## 12. NEW HOSTILE/NPC DEF SPECS (mirror `data/npcs.json` schema exactly)

| id | name | owner | combatLevel | hitpoints | atk/str/def | attackSpeed | aggressive | respawnTicks | size | attackable | drops (verify item ids exist; substitute coins if not) |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `discord_wisp` | Discord Wisp | Q2 | 12 | 18 | 8/8/6 | 4 | false | 30 | 0.7 | true | coins 1–12 @1.0; `air_rune` 1–3 @0.4; `mind_rune` 1–2 @0.3 |
| `hollow_miner` | Hollow Miner | Q3 | 34 | 55 | 28/30/26 | 4 | true | 50 | 1.0 | true | `bones` @1.0; `iron_ore` 1–2 @0.5; `coal` 1–2 @0.35; coins 10–40 @0.5 |
| `manor_revenant` | Manor Revenant | Q5 | 30 | 48 | 26/24/22 | 4 | true | 60 | 1.0 | true | `bones` @1.0; coins 15–60 @0.6; `grave_dust` @0.25 (verify id — ruin_wraith drops it) |
| `the_dissonant` | The Dissonant | Q4 | 62 | 140 | 50/52/45 | 4 | true | 100 | 1.4 | true | coins 80–250 @1.0; `chaos_rune` 2–6 @0.6 (verify id); `big_bones` @1.0 (verify id); `dissonant_baton` @0.03 |
| `chapel_echo` | Chapel Echo | Q7 | 1 | 1 | 1/1/1 | 4 | false | 10 | 1.0 | **false** | — |
| `light_keeper` | Keeper Brand Wicklow | Q8 | 2 | 7 | 1/1/1 | 4 | false | 50 | 1.0 | false | — |
| `cove_fence` | Tilly Two-Receipts | Q9 | 6 | 10 | 1/1/4 | 4 | false | 50 | 1.0 | false | — |
| `miller` | Miller Hob Greaves | Q10 | 2 | 7 | 1/1/1 | 4 | false | 50 | 1.0 | false | — |

Examine texts: implementers write them; keep them in the codex voice (one clause of
fact, one of wit). Colors: pick hexes consistent with kin (wisp ≈ pale violet; hollow
miner ≈ ash grey; revenant ≈ bog green-grey; dissonant ≈ slate + wire).

---

## 13. IMPLEMENTER ASSIGNMENTS — files (exact, collision-free)

Each implementer creates EXACTLY these two files and edits nothing else:

| Codename | Quest | Pack file (new) | Fragment file (new) |
|---|---|---|---|
| **Q1** | gd1_sour_notes | `src/packs/gd1_sour_notes.ts` | `data/_fragments/q1_gd1.json` |
| **Q2** | gd2_quarrel_of_wizards | `src/packs/gd2_quarrel_of_wizards.ts` | `data/_fragments/q2_gd2.json` |
| **Q3** | gd3_sealed_wing | `src/packs/gd3_sealed_wing.ts` | `data/_fragments/q3_gd3.json` |
| **Q4** | gd4_gathering_discord | `src/packs/gd4_gathering_discord.ts` | `data/_fragments/q4_gd4.json` |
| **Q5** | hush_of_ravenmoor | `src/packs/hush_of_ravenmoor.ts` | `data/_fragments/q5_ravenmoor.json` |
| **Q6** | cold_comfort | `src/packs/cold_comfort.ts` | `data/_fragments/q6_cold_comfort.json` |
| **Q7** | hymn_for_the_hollow | `src/packs/hymn_for_the_hollow.ts` | `data/_fragments/q7_hymn.json` |
| **Q8** | keep_the_light | `src/packs/keep_the_light.ts` | `data/_fragments/q8_lighthouse.json` |
| **Q9** | thunder_on_the_tide | `src/packs/thunder_on_the_tide.ts` | `data/_fragments/q9_smugglers.json` |
| **Q10** | against_the_grain | `src/packs/against_the_grain.ts` | `data/_fragments/q10_windmill.json` |

The integrator wires `src/packs/index.ts` imports and merges fragments. Nobody edits
`data/{items,npcs,objects,shops,spawns}.json`, `data/map.json`, `src/world.ts`, or
another quest's files.

---

## 14. SHARED CONTRACT (binding cross-references)

### 14.1 Quest ids, doneStages, prerequisite checks
| Quest id | doneStage | Prereq check used by others |
|---|---|---|
| `gd1_sour_notes` | 5 | Ch2 start requires `>= 5` |
| `gd2_quarrel_of_wizards` | 6 | Ch3 start requires `>= 6` |
| `gd3_sealed_wing` | 6 | **Dungeon gate** + Ch4 start require `>= 6` |
| `gd4_gathering_discord` | 5 | future content gates on `>= 5` |
| `hush_of_ravenmoor` | 6 | future manor content may check `>= 6` |
| `cold_comfort` | 5 | future Frostpeak content may check `>= 5` |
| `hymn_for_the_hollow` | 6 | — |
| `keep_the_light` | 5 | — |
| `thunder_on_the_tide` | 6 | future Guild content may check `>= 6` |
| `against_the_grain` | 6 | — |

### 14.2 THE DUNGEON GATE (for the Untuned Mine dungeon team)
The dungeon entrance is the object **`untuned_mine_door`** (def + placement: Q3's
fragment; placeholder tile (23,75) at the Swamp Mine cave area — integrator/dungeon
team finalize the tile; all logic keys off object *type*). The exact check:

```ts
(state.player.quests['gd3_sealed_wing'] ?? 0) >= 6   // open
```

Q3's pack owns the door's `Enter`/`Search`/`Open` handlers. When the dungeon map
ships, the dungeon team replaces only the *body* of the open branch (entry/teleport),
never the check. Ch4's `resonance_stand` + `conductors_lectern` + `the_dissonant`
spawn (Q4 fragment, placeholders just inside the breach) are to be relocated by the
dungeon team into the quest wing's deepest room — again, type-keyed, so relocation is
a data move only.

### 14.3 NPC option ownership (one owner per `(npc, option)` pair)
| NPC | Option | Owner |
|---|---|---|
| `magic_tutor` | `Ask-about-the-hum` | Q1 |
| `dentist_dr_tick` | `Ask-about-motes` | Q1 |
| `gun_guild_master` | `Ask-about-the-fizzles` | Q2 |
| `imber_wizard` | `Talk-to` | Q2 |
| `quiess_wizard` | `Talk-to` | Q2 |
| `imber_wizard` | `Buy-ember-crystal` | Q3 |
| `imber_wizard` | `Ask-about-the-cold` | Q6 |
| `imber_wizard` / `quiess_wizard` | `Ask-about-the-plan` | Q4 |
| `quiess_wizard` | `Ask-about-the-chapel` | Q7 |
| `slayer_master` | `Ask-about-the-sealed-wing` | Q3 |
| `slayer_master` | `Ask-about-the-breach` | Q4 |
| `carpenter` | `Ask-about-the-survey` | Q3 |
| `gun_trainer` | `Ask-about-blasting` | Q3 |
| `gun_trainer` | `Show-powder-sample` | Q9 |
| `lady_ravenmoor` | `Talk-to` | Q5 |
| `groundskeeper` | `Talk-to` | Q5 |
| `gardener` | `Ask-about-lilies` | Q5 |
| `light_keeper` | `Talk-to` | Q8 |
| `boatman` | `Buy-lamp-oil` | Q8 |
| `harbormaster` | `Ask-about-the-crates` | Q9 |
| `cove_fence` | `Talk-to` | Q9 |
| `miller` | `Talk-to` (incl. post-quest `Collect-flour` flow) | Q10 |
| `wayfarer` | `Ask-about-the-shim` | Q10 |
| `danquavious_chimperton` | `Present-evidence` | Q10 |

### 14.4 `registerItemOnObject` key ownership (single-handler map!)
| Key (`item\|objType`) | Owner |
|---|---|
| `tuning_fork\|altar` | Q1 |
| `tuning_fork\|willow` | Q1 |
| `tuning_fork\|waystone` | Q2 |
| `tinderbox\|brazier` | Q2 (Q6 uses object action `brazier`/`Relight` instead) |
| `blasting_charge\|untuned_mine_door` | Q3 |
| `tuning_fork\|resonance_stand` | Q4 |
| `cellar_key\|cellar_door` (or object action `Unlock`) | Q5 |
| `ravenmoor_diary\|quiess_chime` | Q5 |
| `bones\|altar` (MUST coord-gate to 278,109; no-op elsewhere) | Q7 |
| `hollow_verse\|altar` (same gate) | Q7 |
| `logs\|beacon_brazier`, `lamp_oil\|beacon_brazier`, `tinderbox\|beacon_brazier` | Q8 |
| `wheat\|millstone`, `hammer\|millstone` | Q10 |

Object-action option ownership: `untuned_mine_door`/* → Q3; `resonance_stand`,
`conductors_lectern`/* → Q4; `cellar_door`/*, manor-library `bookshelf`/`Search`
(coord-gated) and annex `crate`/`Search` (coord-gated) → Q5; `brazier`/`Relight`
(coord-gated to the spire) → Q6; chapel `altar`/`Listen` (coord-gated) → Q7;
`beacon_brazier`/* → Q8; `smuggler_crate`/* → Q9; `millstone`/* → Q10.

### 14.5 Aux quest-state keys (besides the quest id itself)
`gd1_rings`, `gd1_rats`, `gd2_rings`, `gd3_miners`, `gd4_accord`, `gd4_boss`,
`q5_*` (none needed), `q6_braziers`, `q6_wolves`, `q7_buried`, `q8_*` (none),
`q9_crates`, `q9_runners`, `q10_*` (none). Prefix discipline: chapters use `gdN_`,
sides use `qN_` — invent nothing outside your prefix.

### 14.6 Cross-referenced NEW ids (def owner → consumers)
- `tuning_fork` — def Q1 → used by Q2, Q4 (and echoed in Q10's `lucky_shim` examine).
- `discord_wisp` — def Q2 → referenced by Q4 (boss adds, optional).
- `untuned_mine_door` — def Q3 → dungeon team (gate), Q4 (passes through).
- `resonance_stand` / `conductors_lectern` / `the_dissonant` — def Q4 → dungeon team
  relocates.
- `ember_crystal`, `coal`, `logs`, `plank`, `bones`, `wheat`, `flour`, `bread`,
  `hammer`, `tinderbox`, `grave_dust`, `air_rune`, `mind_rune`, `chaos_rune`,
  `big_bones` — assumed existing; **every implementer verifies each id they touch**
  and adds missing ones to their own fragment with a report note.

### 14.7 Render caveat (inherited from the world-fill pass)
`waystone`, `brazier`, `millstone`, `beacon_brazier`, `cellar_door`, `quiess_chime`
currently render via the default fallback in `buildObjectTemplate` (src/render.ts).
The NEW objects here (`untuned_mine_door`, `resonance_stand`, `conductors_lectern`,
`smuggler_crate`) will too. Do not block on visuals; note it in your report.

---

## 15. QUALITY-BAR SELF-CHECK MAP (how this design satisfies the reference doc)

- **Rule 1/2 (length, verb alternation)**: every quest is 4–6 player-facing stages;
  stage verb sequences alternate (talk→use→talk→fight→talk etc.); parallel fetches sit
  inside single stages.
- **Rule 3 (dual fetch paths)**: every fetch above lists both paths inline.
- **Rule 4 (one comedic premise, straight objectives)**: premise declared per quest in
  its header row; journal lines above are the straight spine.
- **Rule 5**: re-talk reminder required of all implementers (§0).
- **Rule 6**: every reward includes a permanent keepsake or access; two quests grant
  ACCESS (Ch3 dungeon, Q5 cellar).
- **Rule 7**: novice-tier combat is at-level and escapable (Q1 rats, Q7's avoidable
  rat, Q10 zero combat); required kills only appear at rec-level-appropriate tiers.
- **Rule 12/13**: Ch4 boss telegraph + guaranteed-drop + ~1/33 unique spec'd in §5.
- **MMO rule**: Ch4 resolves a fight, not the Offnote; four named threads remain open
  (Conductor, Sarrash 537, Deep Bog fragment, Maraza's slipping note).
