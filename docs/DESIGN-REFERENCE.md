# DESIGN-REFERENCE.md

Practical design rules for Larpscape implementers, distilled from OSRS wiki research
(June 2026). **Patterns only — zero copied names, lore, or text.** Every section cites
the wiki page that taught the lesson. Where the source gives real numbers, the rule
keeps them; convert ticks at our 600ms tick rate (same as the reference game).

---

## 1. Early quest structure

Sources: wiki pages for the three classic starter quests — the cooking fetch-quest,
the ghost quest, and the mansion/chicken-machine quest.

### Shape of a starter quest
- **4–6 stages, 10–20 minutes**, completable at combat level 3 with no skill reqs.
- **Stage skeleton that works** (cooking fetch-quest): 1 hook dialogue → 3–4 parallel
  fetch sub-tasks → 1 turn-in dialogue. The fetches are *order-independent* — the player
  picks their own route. Our quest stage counter (`state.player.quests[id]=stage`) can
  hold a bitmask or just check inventory at turn-in.
- **Stage skeleton with escalation** (ghost quest): talk → travel+talk (get key item) →
  explore dangerous place + grab fetch item (one avoidable ambush) → return + place item.
  Strictly linear, each stage gated by the previous dialogue.
- **Stage skeleton with a puzzle** (mansion quest): hook dialogue → 3 fetch items, where
  one item is free, one needs a 2-step chain (tool → dig spot → key), and one sits behind
  a lever/door puzzle → turn-in.
- **Rule: alternate verbs.** No two consecutive stages should be the same verb. Cycle
  talk → fetch → explore/fight/puzzle → talk. The reference quests never do
  fetch-fetch-fetch in sequence at the *stage* level (parallel fetches inside one stage
  are fine because the player interleaves them).

### Fetch design rules
- Every fetch item has **2+ acquisition paths**: a world spawn (free, requires walking)
  AND a shop purchase (1–3 coins) or pre-gathered inventory. Never hard-lock one source.
- One fetch per quest should be a **mini process, not a pickup**: e.g. the flour chain
  is pick raw material → carry to machine → operate hopper → pull lever → collect at
  output. 4–5 interactions teach a production loop inside a quest.
- Place an **optional tutor NPC adjacent to each fetch** who explains the mechanic if
  talked to (milking tutor near the cows, milling tutor near the mill). Optional —
  never gate on them.
- Fetch radius for a novice quest: everything within ~60–100 tiles of the quest giver.

### Dialogue gating
- The quest giver's dialogue **branches on stage**: re-talking mid-quest repeats a short
  reminder of the current objective (1–2 lines), not the full intro.
- Key items double as gates: the ghost quest gives a **translator amulet** without which
  the target NPC literally cannot be understood — the gate is diegetic, not a wall.
  Prefer "you lack the thing that makes this interaction work" over "come back later."
- A staged ambush (lvl-13 skeleton popping out when you grab the skull) gives stakes
  without requiring a kill — it's **avoidable**, deals a couple hits, grants no XP.
  Rule: early-quest combat must be escapable by walking away.

### Humor density
- Tone: light absurdism. One **comedic premise** per quest (a chef who can't bake; a
  machine that turns a man into a chicken) plus ~1 joke per dialogue screen, but the
  *objective line* in each dialogue is always played straight so players can't miss it.
- NPCs may lampshade the player being an errand-runner; never break the fourth wall
  about game mechanics inside quest dialogue.

### Reward shape (novice tier)
- 1 quest point + **one skill XP chunk + one keepsake**. Observed values: 300 Cooking XP
  + a burn-reduction perk; 1,125 Prayer XP + a permanently useful amulet; 4 QP + 300
  coins + area access.
- XP rewards at this tier: **300–1,200 XP**, enough to jump a level-1 skill to ~9.
  Direct-XP rewards into a *specific* skill beat generic lamps for starter quests —
  they advertise the skill.
- At least one reward should be a **permanent unlock the player keeps using** (item with
  an ongoing function, area access, perk), not just consumables. Make finished quests
  prerequisites for later content so they feel foundational.

---

## 2. Early dungeon design

Sources: wiki pages for the security-themed training stronghold and the city sewers.

### Layout shapes (two proven templates)
1. **Floor ladder** (stronghold): 4 floors, strictly gated, each floor a maze of small
   rooms with **door-pair airlocks** — the gap between two doors is a safe zone where
   nothing can attack. Each second door asks a question/interaction (we can theme as a
   lore riddle or toll). One reward room per floor.
2. **Branching sprawl** (sewers): one entrance, paths fork by difficulty. Weak mobs
   (lvl 1–14, ~30+ spawns) cluster at the entrance; mid mobs (lvl 13–25, ~15 spawns)
   in the middle; strong mobs (lvl 34–42, ~10 spawns) deepest, ending in 1–2 boss
   chambers, one behind a key-item gate.

### Concrete dungeon rules
- **Difficulty ramps with depth, monotonically.** Per-floor level bands from the
  stronghold: F1 lvl 1–27, F2 lvl 26–53, F3 lvl 24–68, F4 lvl 60–159. Overlap bands by
  ~20% so the transition isn't a wall.
- **Mob density**: 3–6 mobs per room; entrance areas can swarm with trivial mobs
  (it reads as atmosphere, not threat). Deeper rooms: fewer, stronger.
- **Safe pockets every 2–3 rooms** (the door-pair airlock pattern) so low-level players
  can rest/eat. Multi-combat deep zones, single-file safe corridors.
- **Visible reward cadence ~every 90s of progress**: a coin/item floor-spawn, a resource
  node, or a chest roughly every 2–3 rooms. The stronghold pays 2k / 3k / 5k coins plus
  a cosmetic emote per floor, with the best prize (choice of 3 boot styles — let the
  player pick) only on the final floor; total 10k coins. Escalate per-floor payouts
  ~1.5–2× each floor.
- **Shortcuts unlock backwards**: completing a floor opens a portal/ladder straight back
  to it, gated by combat level (26+/51+/76+ in the source). Replay never repeats the maze.
- One **stat-restore / heal point** mid-dungeon (the stronghold's floor-3 grain bag
  analog) as a free pit stop.
- **Hazard gating via tools**: webs that need a slash weapon, doors that need a key from
  a mob in the same dungeon. Telegraph the requirement in the examine text.
- Put a **mid-level boss behind a droppable key** (the moss-giant-key pattern): key drops
  from the strongest regular mob, boss is optional, chamber is separate.

### Boss telegraphs (beginner boss, from the giant-rat boss page)
- Beginner boss spec: ~500 HP, 3×3 size, **4-tick (2.4s) attack cycle**, three attack
  styles with distinct projectiles/animations, max hits 7–13 on standard attacks.
- The *environmental* special (falling debris) hits hardest (max 22) but is **fully
  dodgeable**: shadow/marker appears on the target tile 2–3 ticks before impact. Rule:
  the biggest hit in any early fight must be telegraphed ≥2 ticks (1.2s) ahead and
  avoidable by moving 1–2 tiles.
- Adds in waves: boss periodically summons ~6 trivial adds — clears teach AoE/targeting
  without threatening death.
- Phases: 3 phases with a heal/breather beat between phases; respawn ~18s; loot gives a
  **guaranteed common drop every kill** + a ~1/33 unique + a very rare vanity drop.
  Whoever does the most damage gets the good roll (matters if we share boss rooms).

---

## 3. Skilling loop (deposit-cycle mining)

Source: wiki page for the pay-dirt mine minigame.

### The loop
mine raw material from veins → carry to hopper (deposit) → machine washes it →
collect refined output + bonus currency from a sack. Four distinct verbs per cycle.

### Why it feels good — extractable rules
- **Batch rhythm**: inventory fills (~27 units) → walk to hopper → deposit → repeat
  until the sack cap forces a collection trip. Sack caps at **108 units (4 inventories)**,
  upgradeable to **189 (7 inventories)**. The cap creates a satisfying macro-cycle on top
  of the micro-cycle.
- **Node depletion timers, not instant depletion**: a vein lasts **23–27s after first
  hit** (36–40s in the upgraded area). Players hop between 2–3 nearby nodes; depletion
  forces small movements, killing pure AFK without demanding attention.
- **Randomized output**: refined output is a level-scaled mix of ores, so every
  collection is a small slot machine.
- **Bonus currency**: flat **~3.1% chance per unit** (≈1 per 32) to yield a special
  currency regardless of level. Spend it at a dedicated shop on: cosmetic outfit pieces
  (40–60 each, set grants small XP bonus), QoL utility bags (100 each), and a cheap
  consumable sink (10 each). Cheap+expensive items in the same shop give short- and
  long-term goals.
- **Tiered area unlock**: an upper level requiring **level 57 + 100 currency** (plus 50
  more for a second hopper) with denser nodes and slower depletion. Rule: the unlock
  must improve *layout efficiency*, not just numbers.
- **Breakdown mini-event**: the machine occasionally breaks; fixing it needs a tool from
  nearby crates and grants small crafting XP (scaled ~1.5× crafting level). A rare
  interrupt that rewards rather than punishes.
- XP curve: ~13k/hr at the unlock level up to ~64k/hr at cap — the loop should stay
  slightly below the best focused-grind alternative, paying the difference in currency
  and relaxation.

---

## 4. Trade window UX

Source: wiki trade-mechanics page.

- **Two-phase flow is mandatory.** Screen 1: both sides build offers, both must accept.
  Screen 2: read-only confirmation, both must accept again. Decline at any point cancels
  everything for both.
- **Any offer modification resets both accept states** on screen 1.
- **Removal warning**: removing an item leaves a **flashing red exclamation marker in the
  vacated slot** plus a chat message; accepting right after a removal triggers an extra
  "are you sure" check.
- **Value transparency**: each offer shows total value in coins using market prices; a
  wealth-transfer readout shows the net difference and turns red when lopsided (Aldgate
  Exchange prices give us this for free).
- **Exact quantities on the confirm screen**: full digits ("10,435,672"), never
  abbreviated ("10M") — abbreviation scams are the classic exploit. Items changed since
  screen 1 get a full-width red bar on that player's side.
- Trade only from **visible inventory** — no hidden/equipped/bank-side transfers.
- Show the partner's display name on both screens; consider per-account trade caps for
  brand-new accounts if we ever see scam pressure.
- For our coinflip relay (server/social.ts): same two-phase commit + exact-number
  display rules apply.

---

## 5. Guild / clan surfacing in UI

Sources: wiki pages for player-hosted chat channels and the clan system.

- **One side-panel tab** owns social grouping. Join flow: click Join → type the host
  player's name → you're in their channel. Channel name ≤12 chars, shown as a prefix on
  every channel message in the chatbox; channel chat gets its **own chat color**, guest
  chat a distinct second color, both user-customizable.
- A chat-prefix shortcut (the source uses `/`) routes a typed message to the channel
  without switching tabs.
- **Roster panel**: scrolling list (cap ~500) showing each member's name + rank icon +
  current world/server. Rank icons are tiny inline glyphs reused next to names in the
  chatbox.
- **Rank ladder** (7 steps is plenty): friend → 5 ascending officer ranks → owner.
  Modern clans allow renaming/extending ranks (up to ~15 below admin, 9 above) — for v1,
  fixed icons + custom labels is enough.
- **Permissions are three dropdowns, set by owner per-rank threshold**: minimum rank to
  *enter*, to *talk*, to *kick*. That's the whole permission matrix for a v1 — resist
  building more.
- **Kick = 60-minute temp ban**, with a clear "you have been kicked" message; bans clear
  if the channel empties. Recruiting via right-click "Recruit" on a nearby player
  (requires their accept-aid-style consent flag) plus an "Apply" button on a guest view.
- Track and show **last-seen dates per member** in the management view.

---

## QUALITY BAR

The 20 rules every implementer must hit. Check your work against each.

1. Starter quests are 4–6 stages, ≤20 min, no skill requirements, soloable at base combat.
2. No two consecutive quest stages use the same verb (talk/fetch/fight/explore/puzzle).
3. Every quest fetch item has ≥2 acquisition paths (world spawn + shop or craft).
4. Each quest contains exactly one comedic premise; the objective line in every dialogue is unambiguous and played straight.
5. Re-talking to a quest giver mid-quest yields a 1–2 line reminder of the current objective.
6. Quest rewards = QP + 300–1,200 targeted skill XP + one permanent keepsake (item/perk/access), never consumables-only.
7. Early-quest combat encounters are avoidable by walking away; none require a kill below stage-appropriate level.
8. Dungeon difficulty increases monotonically with depth; adjacent zones overlap ~20% in level band.
9. Dungeons place a safe pocket (no-aggro space) every 2–3 rooms.
10. A visible reward (spawn, node, chest, payout) appears roughly every 90 seconds of dungeon progress, escalating ~1.5–2× per tier.
11. Completing a dungeon tier unlocks a permanent shortcut back to it; players never re-run solved content.
12. Any attack that can hit for >⅓ of an at-level player's HP is telegraphed ≥2 ticks (1.2s) ahead and dodgeable by moving 1–2 tiles.
13. Bosses drop something useful on every kill; uniques sit at ~1/33-style rates, vanity at very-rare rates.
14. Skilling loops have both a micro-cycle (fill inventory, ~30–60s) and a macro-cycle (fill a cap of 4–7 inventories) before a collection payoff.
15. Resource nodes deplete on a 20–40s timer after first use, forcing hops between 2–3 nearby nodes.
16. Every skilling loop pays a flat-rate bonus currency (~3% per unit) spendable on cosmetics (40–60), QoL (100), and cheap consumables (10) in one shop.
17. Skilling area upgrades cost level + currency and improve layout/efficiency, not just raw numbers.
18. Trades are two-phase (offer + read-only confirm); any modification resets both accepts; removed items leave a flashing warning marker.
19. Trade and confirm screens show full exact quantities and coin values — never abbreviated numbers.
20. Group UI fits one tab: roster with rank icons + world, ≤7 default ranks, and exactly three owner-set permission thresholds (enter/talk/kick); kicks are 60-min temp bans.
