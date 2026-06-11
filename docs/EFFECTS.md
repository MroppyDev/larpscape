# EFFECTS.md — Weapon Effects & Special Attacks (binding schema)

This is the contract for combat effects and special attacks. Downstream item /
NPC designers write JSON against this document; the engine lives in
`shared/effects.ts` (types + math), `server/sim.ts` (authoritative resolution)
and `src/game.ts` (client intent + spec energy). Do not invent new effect
types or spec kinds in data — extend `shared/effects.ts` first.

Ticks are game ticks (600 ms).

---

## 1. Item schema additions (`data/items.json`)

Two new OPTIONAL keys on any equippable item def:

```json
"effects": [ ...EffectDef ],
"spec": { ...SpecDef }
```

`effects` work from ANY equipped slot (weapon, shield, gloves, ...). `spec` is
only honoured on the **weapon** or **shield** slot (weapon wins if both).

### 1.1 EffectDef variants

Damage-over-time (`poison` | `burn` | `bleed` — identical mechanics, different
hitsplat colour):

```json
{ "type": "poison", "chance": 0.2, "dmg": 2, "hits": 5, "every": 3, "maxStacks": 1 }
```
- `chance` 0..1 — proc roll once per swing that dealt damage > 0
- `dmg` — damage per DoT tick (server clamps 1..10)
- `hits` — number of DoT ticks (clamped 1..20)
- `every` — game ticks between DoT ticks (clamped 1..20)
- `maxStacks` — optional, default 1; at cap a re-proc refreshes the oldest stack

Freeze (movement hold; target can still attack if already in range):

```json
{ "type": "freeze", "chance": 0.15, "holdTicks": 3 }
```
- `holdTicks` clamped 1..16

Lifesteal (heal % of damage dealt; heal rides back on the `youHit` message):

```json
{ "type": "lifesteal", "pct": 0.15 }
```

Family bane (accuracy/damage multipliers vs an NPC family tag):

```json
{ "type": "family_bane", "family": "offnote", "accMult": 1.2, "dmgMult": 1.2 }
```
- `accMult` multiplies the attack roll; `dmgMult` multiplies max hit; both default 1
- multiple banes vs the same family multiply together

### 1.2 SpecDef

```json
"spec": {
  "name": "True Strike",
  "energy": 60,
  "desc": "A re-truing blow: +50% damage with improved accuracy.",
  "kind": "heavy_hit",
  "params": { "accMult": 1.25, "dmgMult": 1.5 }
}
```

- `energy`: 25..100 (% of the spec bar consumed)
- `kind` + `params` (server clamps shown in brackets):

| kind | params | behaviour |
|---|---|---|
| `double_hit` | `accMult?`, `dmgMult?` | two independent accuracy+damage rolls, two hitsplats |
| `heavy_hit` | `accMult?` [0.25..3], `dmgMult?` [0..3] | one boosted roll |
| `aoe_adjacent` | `radius?` [1..3, dflt 1], `accMult?`, `dmgMult?` | main hit + up to 3 extra NPCs within `radius` of the target each take a rolled hit |
| `stun` | `holdTicks?` [1..8, dflt 3], `dmgMult?` | hit; on an accurate hit the target can neither move nor attack for `holdTicks`; emits fx kind `stun` |
| `drain_def` | `amount?` [1..30, dflt 5], `dmgMult?` | hit; on an accurate hit the NPC loses `amount` defence levels until respawn (floor 0) |
| `warcry_aoe_debuff` | `radius?` [1..5, dflt 2], `atkMult?` [0.25..1, dflt 0.7], `ticks?` [1..50, dflt 16] | normal hit on target + every NPC within `radius` of the PLAYER attacks at `atkMult` of its attack level for `ticks`; emits fx kind `warcry` |
| `guaranteed_dot` | `dot` (a DoT EffectDef, `chance` ignored), `dmgMult?` | hit; on an accurate hit applies the DoT at 100% |

Spec hits use the `spec` hitsplat kind (gold). Specs fire on melee/ranged/gun
swings only (not magic autocast).

## 2. NPC schema addition (`data/npcs.json`)

Optional `family` string tag, matched by `family_bane`:

```json
"family": "offnote"
```

Canonical tags in use (pick from these; coordinate before adding new ones):
`goblinkind`, `beastkind`, `scorpionkind`, `drakekind`, `trollkind`,
`humankind`, `wraithkind`, `offnote`, `fiendkind`.

Current assignments (lore-checked against docs/LORE.md):
- `goblinkind`: goblin, goblin_warlord
- `beastkind`: chicken, cow, giant_rat, bear, dire_wolf, forest_spider, ice_wolf
- `scorpionkind`: scorpion · `drakekind`: shadow_drake · `trollkind`: ice_troll
- `humankind`: man, city_guard, desert_bandit, bandit_king, pirate, pirate_captain
- `wraithkind`: ruin_wraith, manor_revenant, ash_fiend, ice_queen ("Not Offnote: hubris, preserved")
- `offnote`: discord_mote, discord_wisp, untuned_golem, seam_creeper, foreman_echo,
  crystal_heart, hollow_miner, the_dissonant, bog_horror, magma_fiend
- `fiendkind`: cinder_imp, magma_crawler

## 3. Wire protocol / state shapes

### 3.1 Swing intent (client → server), new optional fields

```json
{ "t": "swing", "npc": 17, "mode": "melee", "eff": 45, "bonus": 50, "maxHit": 11, "speed": 4,
  "gear": ["rimeglass_blade", "molten_gauntlets"],
  "spec": "rimeglass_blade" }
```
- `gear`: equipped item IDS that carry `effects`/`spec` (≤12). The server looks
  the effects up in ITS OWN `data/items.json` — effect payloads are never
  trusted from the wire.
- `spec`: the gear id whose spec is being consumed (must be in `gear` and have
  a `spec` on the server's def). Client deducts energy before sending.

### 3.2 Hitsplat broadcast (server → all), new `kind` field

```json
{ "t": "hit", "npc": 17, "dmg": 2, "hp": 9, "by": "Adventurer", "kind": "poison" }
```
`kind` ∈ `"hit" | "poison" | "burn" | "bleed" | "spec"`. The client stores it on
`Npc.hitsplat = { dmg, until, kind }` (src/game.ts). **Renderers** (client-visuals
agent): colour by kind — `poison` green, `burn` orange, `bleed` dark red,
`spec` gold, `hit` the classic red/blue. Unknown kinds fall back to `hit`.

### 3.3 Hit confirmation (server → attacker), new riders

```json
{ "t": "youHit", "npc": 17, "def": "goblin", "dmg": 14, "mode": "melee", "heal": 2, "spec": true }
```
- `heal`: lifesteal HP (client applies, capped at max HP)
- `spec`: present when the swing resolved as a special attack

DoT damage arrives as ordinary `hit` broadcasts (with the DoT's kind) on later
ticks — kill credit, drops, slayer and xp all flow through the normal paths.

### 3.4 fx events

Spec resolution emits `{ t: "fx", npc, def, kind: "stun" | "warcry" }` for
renderers to pick up via `registerFx` (src/game.ts).

## 4. Special attack energy (client)

- `player.specEnergy` 0..100, persisted in the save (`specEnergy`), starts 100.
- Regen: +10 every 50 ticks (30 s).
- `player.specArmed` (not persisted): toggled by the spec bar in the Combat tab
  (src/ui.ts, `.spec-box`); next melee/ranged/gun swing consumes
  `spec.energy` and sends `spec: <itemId>`.
- API: `toggleSpecAttack()`, `specItem()`, `effectGear()` exported from src/game.ts.

## 5. Server engine notes (server/sim.ts)

Per-NPC effect state on `SNpc` (reset on respawn): `dots: ActiveDot[]`,
`heldUntil` (freeze: no movement), `stunnedUntil` (no movement, no attacks),
`defDrain` (flat defence reduction), `atkDebuffMult`/`atkDebuffUntil` (warcry).
DoTs tick in `tickSim` → `tickNpcDots`; a stack fades if its applier logs off.

## 6. Live examples (data/items.json — quote these verbatim)

```json
"rimeglass_blade": { "effects": [ { "type": "freeze", "chance": 0.15, "holdTicks": 3 } ] }
```

```json
"dissonant_baton": {
  "effects": [ { "type": "family_bane", "family": "offnote", "accMult": 1.15, "dmgMult": 1.1 } ],
  "spec": { "name": "Caesura", "energy": 50,
            "desc": "Conduct a hard rest: the target can neither move nor attack for 3 ticks.",
            "kind": "stun", "params": { "holdTicks": 3, "dmgMult": 1.0 } }
}
```

```json
"tuning_hammer": {
  "effects": [ { "type": "family_bane", "family": "offnote", "accMult": 1.2, "dmgMult": 1.2 } ],
  "spec": { "name": "True Strike", "energy": 60,
            "desc": "A re-truing blow: +50% damage with improved accuracy.",
            "kind": "heavy_hit", "params": { "accMult": 1.25, "dmgMult": 1.5 } }
}
```

```json
"molten_gauntlets": { "effects": [ { "type": "burn", "chance": 0.1, "dmg": 1, "hits": 3, "every": 2 } ] }
```

## 7. Integrator TODOs (outside this module's ownership)

- `shared/schema.ts` (Zod): add `effects`/`spec` to `ItemDefSchema` and
  `family` to the NPC schema so `npm run validate` checks the new keys
  (today's non-strict objects pass them through untouched).
- Renderers: colour hitsplats by `kind` (see 3.2) and optionally render the
  `stun`/`warcry` fx kinds.
