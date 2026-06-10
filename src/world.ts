// World map (Lumbridge-inspired, original layout) + pathfinding.

export const MAP_W = 224;
export const MAP_H = 224;

// Old (phase-5) map bounds — legacy generation below is bounded by these so the
// 0..167 region builds byte-identically; phase-6 districts extend beyond.
const OLD_W = 168;
const OLD_H = 168;

// terrain codes
export const T = {
  GRASS: 0, WATER: 1, PATH: 2, FLOOR: 3, WALL: 4, BRIDGE: 5, SWAMP: 6, FENCE: 7, SAND: 8,
  DIRT: 9, FLOWERS: 10, CAVE: 11, LAVA: 12, ROCK: 13, SNOW: 14, ICE: 15, DSAND: 16,
} as const;

export interface WorldObject {
  type: string;        // ObjDef id
  x: number; y: number;
  depletedUntil: number;   // tick when it respawns (0 = active)
  depletedAs?: string;     // what to render while depleted ('stump' | 'rocks_empty')
  expiresAt?: number;      // for player-made fires
  meta?: Record<string, any>; // farming patch state, snare timers, etc.
}

export interface GroundItem { item: string; qty: number; x: number; y: number; expiresAt: number; }

export const terrain = new Uint8Array(MAP_W * MAP_H);
export const objects: WorldObject[] = [];
export const objectAt = new Map<number, WorldObject>();

export const key = (x: number, y: number) => y * MAP_W + x;

function setT(x: number, y: number, t: number) {
  if (x >= 0 && y >= 0 && x < MAP_W && y < MAP_H) terrain[key(x, y)] = t;
}
function rect(x0: number, y0: number, x1: number, y1: number, t: number) {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) setT(x, y, t);
}
function hollowRect(x0: number, y0: number, x1: number, y1: number, t: number) {
  for (let x = x0; x <= x1; x++) { setT(x, y0, t); setT(x, y1, t); }
  for (let y = y0; y <= y1; y++) { setT(x0, y, t); setT(x1, y, t); }
}
export function addObject(type: string, x: number, y: number) {
  const o: WorldObject = { type, x, y, depletedUntil: 0 };
  objects.push(o);
  objectAt.set(key(x, y), o);
  return o;
}
export function removeObject(o: WorldObject) {
  const i = objects.indexOf(o);
  if (i >= 0) objects.splice(i, 1);
  if (objectAt.get(key(o.x, o.y)) === o) objectAt.delete(key(o.x, o.y));
}

// Item spawns that regenerate on the ground; consumed by game.ts.
export const groundSpawns: { item: string; x: number; y: number; respawnTicks: number }[] = [
  // eggs in the chicken farm
  { item: 'egg', x: 31, y: 11, respawnTicks: 50 },
  { item: 'egg', x: 35, y: 13, respawnTicks: 50 },
  // herb spawns in the swamp
  { item: 'grimy_guam', x: 19, y: 74, respawnTicks: 80 },
  { item: 'grimy_marrentill', x: 28, y: 62, respawnTicks: 80 },
  // Aldgate city plaza spawns
  { item: 'bread', x: 97, y: 31, respawnTicks: 100 },
  { item: 'vial_of_water', x: 105, y: 31, respawnTicks: 100 },
];

// deterministic pseudo-random for scatter
let seed = 12345;
function rnd() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

export function buildWorld() {
  seed = 12345; // deterministic even if rebuilt
  objects.length = 0;
  objectAt.clear();
  terrain.fill(T.GRASS);

  // River running north-south, east of centre
  rect(46, 0, 50, OLD_H - 1, T.WATER);
  // gentle bends
  rect(45, 0, 45, 14, T.WATER);
  rect(51, 60, 52, OLD_H - 1, T.WATER);

  // Bridge (main, on the east-west road)
  rect(45, 38, 51, 40, T.BRIDGE);

  // Castle (west of river)
  hollowRect(13, 28, 28, 46, T.WALL);
  rect(14, 29, 27, 45, T.FLOOR);
  // entrance gap on east wall
  setT(28, 36, T.FLOOR); setT(28, 37, T.FLOOR); setT(28, 38, T.FLOOR);
  // inner courtyard path
  rect(20, 33, 24, 42, T.FLOOR);
  // castle towers (corner walls thicker)
  rect(13, 28, 15, 30, T.WALL); rect(26, 28, 28, 30, T.WALL);
  rect(13, 44, 15, 46, T.WALL); rect(26, 44, 28, 46, T.WALL);

  // Bank corner inside castle (north-west)
  addObject('bank_booth', 16, 30); addObject('bank_booth', 17, 30); addObject('bank_booth', 18, 30);
  // Kitchen range (south-west)
  addObject('range', 16, 44);

  // Chapel room: NE corner inside the castle (~x24-27, y29-32), altar within
  for (let y = 29; y <= 33; y++) setT(23, y, T.WALL); // west wall of chapel
  for (let x = 23; x <= 27; x++) setT(x, 33, T.WALL); // south wall of chapel
  setT(25, 33, T.FLOOR); // chapel door (south)
  addObject('altar', 26, 31);

  // Paths: castle entrance -> bridge -> east
  rect(29, 37, 45, 39, T.PATH);
  rect(52, 37, 70, 39, T.PATH);
  rect(36, 12, 38, 37, T.PATH);  // north road
  rect(36, 40, 38, 62, T.PATH);  // south road to swamp

  // General store (south of road, west side)
  hollowRect(31, 46, 39, 52, T.WALL);
  rect(32, 47, 38, 51, T.FLOOR);
  setT(35, 46, T.FLOOR); // door north

  // Market stalls (between road and store)
  rect(30, 41, 36, 44, T.PATH);
  addObject('bake_stall', 31, 42);
  addObject('bake_stall', 34, 42);

  // Smithy building (west of the south road, x32-40/y54-60 box)
  hollowRect(32, 54, 35, 59, T.WALL);
  rect(33, 55, 34, 58, T.FLOOR);
  setT(35, 57, T.FLOOR); // door east, opens toward the south road
  addObject('furnace', 33, 55);
  addObject('anvil', 33, 58);

  // Carpenter shack (x20-26/y50-56)
  hollowRect(21, 50, 25, 55, T.WALL);
  rect(22, 51, 24, 54, T.FLOOR);
  setT(25, 52, T.FLOOR); // door east
  addObject('workbench', 22, 51);

  // Magic tutor hut (x40-44/y28-33; clear of the road at y37-39)
  hollowRect(40, 28, 44, 33, T.WALL);
  rect(41, 29, 43, 32, T.FLOOR);
  setT(42, 33, T.FLOOR); // door south

  // Chicken farm (north-west), fenced
  hollowRect(28, 8, 38, 16, T.FENCE);
  setT(33, 16, T.GRASS); // gate
  // Cow field (north-east of river), fenced
  hollowRect(54, 6, 70, 20, T.FENCE);
  setT(54, 13, T.GRASS); // gate

  // Sheep pen (fenced, gate) + spinning house (x14-26/y8-20)
  hollowRect(14, 8, 22, 18, T.FENCE);
  setT(22, 13, T.GRASS); // gate east
  hollowRect(23, 14, 26, 19, T.WALL); // small spinning house
  rect(24, 15, 25, 18, T.FLOOR);
  setT(24, 14, T.FLOOR); // door north
  addObject('spinning_wheel', 25, 17);

  // Flax field (x40-44/y14-20), 8 plants
  addObject('flax_plant', 40, 15); addObject('flax_plant', 42, 15);
  addObject('flax_plant', 41, 16); addObject('flax_plant', 43, 16);
  addObject('flax_plant', 40, 18); addObject('flax_plant', 42, 18);
  addObject('flax_plant', 41, 19); addObject('flax_plant', 43, 19);

  // Farming patches (DIRT) near the gardener spot (x33-39/y20-26, west of the north road)
  rect(33, 20, 35, 22, T.DIRT);
  addObject('farming_patch', 34, 21);
  rect(33, 24, 35, 26, T.DIRT);
  addObject('farming_patch', 34, 25);

  // Agility course west of castle (x5-11/y28-50), obstacles N->S with a connecting path
  rect(8, 28, 8, 50, T.PATH);
  rect(9, 38, 12, 39, T.PATH); // connector toward the castle's west side
  rect(5, 32, 11, 32, T.WATER); // water ditch strip under the log
  addObject('agility_log', 8, 32);   // Walk-across (over the ditch)
  addObject('agility_rope', 8, 38);  // Swing-on
  addObject('agility_wall', 8, 43);  // Climb
  addObject('agility_ledge', 8, 48); // Balance-across

  // Swamp (south-west) with mine
  rect(12, 60, 32, 76, T.SWAMP);
  addObject('rocks_copper', 16, 64); addObject('rocks_copper', 17, 66);
  addObject('rocks_tin', 20, 64); addObject('rocks_tin', 21, 66);
  addObject('rocks_iron', 25, 68); addObject('rocks_iron', 27, 66);
  addObject('rocks_copper', 18, 70); addObject('rocks_tin', 23, 71);
  // new: coal and rune essence in the swamp mine
  addObject('rocks_coal', 15, 68); addObject('rocks_coal', 29, 70);
  addObject('rocks_essence', 14, 72); addObject('rocks_essence', 30, 73);

  // Southern bridge / ford across the river's southern stretch, toward the air altar
  rect(45, 62, 53, 63, T.BRIDGE);
  rect(54, 62, 64, 63, T.PATH);

  // Air altar stone circle (x60-70/y58-68), SE across the river
  addObject('air_altar', 65, 63);

  // Hunter meadow (x56-72/y70-84): flowers scattered through the grass
  for (let y = 70; y <= 84; y++) for (let x = 56; x <= 72; x++) {
    if (terrain[key(x, y)] === T.GRASS && rnd() < 0.45) setT(x, y, T.FLOWERS);
  }

  // Sand by river edges
  for (let y = 0; y < OLD_H; y++) {
    if (terrain[key(44, y)] === T.GRASS) setT(44, y, rnd() < 0.5 ? T.SAND : T.GRASS);
    if (terrain[key(52, y)] === T.GRASS) setT(52, y, rnd() < 0.5 ? T.SAND : T.GRASS);
  }

  // Fishing spots on the west bank
  addObject('fishing_spot', 45, 24); addObject('fishing_spot', 45, 28);
  addObject('fishing_spot', 45, 52); addObject('fishing_spot', 45, 56);
  // Rod (bait) fishing spots on the east bank
  addObject('rod_fishing_spot', 51, 48);
  addObject('rod_fishing_spot', 51, 56);

  // Willows on the river banks (x44 and x53)
  addObject('willow', 44, 46); addObject('willow', 44, 58); addObject('willow', 44, 68);
  addObject('willow', 53, 48); addObject('willow', 53, 56); addObject('willow', 53, 70);

  // ============================================================
  // Phase 5 districts (map extension to 168x168 — additive only)
  // ============================================================

  // --- East city 'Aldgate' (x76-130, y8-56) -------------------
  // Extend the east road from x70 to the city's west gate.
  rect(71, 37, 76, 39, T.PATH);
  // City walls
  hollowRect(76, 8, 130, 56, T.WALL);
  // West gate joining the road at y37-39
  setT(76, 37, T.PATH); setT(76, 38, T.PATH); setT(76, 39, T.PATH);
  // East gate (toward the warlord fort) at y20-22
  setT(130, 20, T.PATH); setT(130, 21, T.PATH); setT(130, 22, T.PATH);
  // Paved streets: main east-west, north-south avenue, east-gate street
  rect(77, 37, 129, 39, T.PATH);          // high street
  rect(100, 9, 102, 55, T.PATH);          // grand avenue
  rect(103, 20, 129, 22, T.PATH);         // east-gate street
  rect(77, 20, 99, 22, T.PATH);           // west arm of the cross street
  // Central plaza
  rect(92, 26, 110, 36, T.PATH);
  addObject('fountain', 101, 31);
  addObject('ge_booth', 95, 28); addObject('ge_booth', 95, 33);
  addObject('ge_booth', 107, 28); addObject('ge_booth', 107, 33);
  addObject('bank_booth', 98, 27); addObject('bank_booth', 104, 27);
  addObject('bake_stall', 94, 35); addObject('bake_stall', 108, 35);
  // Buildings (8): WALL shells, FLOOR interiors, door gaps
  const cityBuilding = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number) => {
    hollowRect(x0, y0, x1, y1, T.WALL);
    rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, T.FLOOR);
    setT(dx, dy, T.FLOOR); // door
  };
  cityBuilding(80, 12, 88, 18, 84, 18);    // NW row
  cityBuilding(90, 12, 97, 18, 93, 18);
  cityBuilding(112, 12, 120, 18, 116, 18); // NE
  cityBuilding(80, 25, 88, 33, 88, 29);    // west of plaza, door east
  cityBuilding(112, 26, 122, 34, 112, 30); // east of plaza, door west
  cityBuilding(80, 42, 90, 50, 85, 42);    // south row, doors north
  cityBuilding(94, 42, 104, 50, 99, 42);
  cityBuilding(110, 42, 120, 50, 115, 42);

  // --- Warlord fort (x132-160, y10-34) ------------------------
  hollowRect(132, 10, 160, 34, T.FENCE);   // palisade
  // Gate on west wall at y20-22, path linking to the city's east gate
  setT(132, 20, T.PATH); setT(132, 21, T.PATH); setT(132, 22, T.PATH);
  rect(131, 20, 131, 22, T.PATH);
  // Arena clearing for the boss
  rect(138, 14, 156, 30, T.DIRT);
  rect(133, 20, 137, 22, T.PATH);          // gate approach inside

  // --- Deep bog (x8-40, y80-110) -------------------------------
  rect(8, 80, 40, 110, T.SWAMP);
  rect(14, 77, 30, 79, T.SWAMP);           // connector from the swamp mine
  // dead trees scattered in the bog (sparse, away from the boss clearing)
  const bogTrees: [number, number][] = [
    [11, 84], [16, 88], [33, 85], [37, 92], [12, 96], [36, 100],
    [10, 104], [31, 106], [17, 108], [38, 83],
  ];
  for (const [bx, by] of bogTrees) addObject('tree', bx, by);
  // boss clearing around (24,98): kept object-free

  // --- Cave mouth + corridor to the cavern ---------------------
  addObject('cave_mouth', 22, 76);
  rect(21, 77, 23, 113, T.CAVE);           // south through the bog
  rect(21, 111, 62, 113, T.CAVE);          // east to the cavern (causeway over the river)

  // --- Cavern (x60-150, y110-160) ------------------------------
  rect(60, 110, 150, 160, T.CAVE);
  hollowRect(60, 110, 150, 160, T.WALL);
  // entrance gap in the west wall where the corridor arrives
  setT(60, 111, T.CAVE); setT(60, 112, T.CAVE); setT(60, 113, T.CAVE);
  // lava pools
  rect(72, 122, 78, 127, T.LAVA);
  rect(92, 138, 99, 144, T.LAVA);
  rect(118, 116, 126, 122, T.LAVA);
  rect(108, 152, 114, 157, T.LAVA);
  rect(130, 134, 136, 139, T.LAVA);
  // stalagmites
  const stals: [number, number][] = [
    [66, 120], [70, 135], [82, 115], [85, 148], [98, 125], [104, 132],
    [112, 142], [118, 128], [124, 150], [132, 120], [138, 132], [144, 140],
    [76, 155], [90, 158], [128, 156],
  ];
  for (const [sx, sy] of stals) addObject('stalagmite', sx, sy);
  // mithril + adamantite rocks (mid-cavern)
  addObject('rocks_mithril', 86, 130);
  addObject('rocks_mithril', 102, 146);
  addObject('rocks_mithril', 114, 124);
  addObject('rocks_adamantite', 122, 136);
  addObject('rocks_adamantite', 96, 118);
  // drake lair: far SE end, kept clear around (142,152)

  // District boxes that tree scatter must keep clear (new buildings handled via terrain)
  const noTreeBoxes: [number, number, number, number][] = [
    [14, 8, 26, 20],   // sheep pen + spinning house
    [40, 14, 44, 20],  // flax field
    [33, 20, 39, 26],  // farming patches + gardener
    [4, 27, 12, 51],   // agility course
    [59, 57, 71, 69],  // air altar circle
    [55, 69, 73, 85],  // hunter meadow
    [29, 40, 40, 45],  // market
    [39, 27, 45, 34],  // magic tutor hut surrounds
    [31, 53, 41, 61],  // smithy surrounds
    [20, 49, 26, 57],  // carpenter shack surrounds
    [43, 61, 65, 64],  // south bridge + path to altar
    [75, 7, 131, 57],  // Aldgate city
    [131, 9, 161, 35], // warlord fort (+ link path)
    [70, 36, 77, 40],  // extended east road
    [7, 79, 41, 111],  // deep bog
    [59, 109, 151, 161], // cavern
    [20, 75, 24, 114], // cave corridor (south leg) + cave mouth
    [20, 110, 63, 114], // cave corridor (east leg)
  ];
  const inNoTreeBox = (x: number, y: number) =>
    noTreeBoxes.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

  // Trees scattered on grass (avoid buildings/roads/new districts).
  // Bounded by OLD_W/OLD_H so the rnd() sequence and placements match phase 5 exactly.
  const treeSpots: [number, number][] = [];
  for (let i = 0; i < 340; i++) {
    const x = Math.floor(rnd() * OLD_W), y = Math.floor(rnd() * OLD_H);
    if (terrain[key(x, y)] !== T.GRASS) continue;
    if (objectAt.has(key(x, y))) continue;
    // keep clearings near spawn paths
    if (x > 28 && x < 44 && y > 30 && y < 46) continue;
    if (inNoTreeBox(x, y)) continue;
    treeSpots.push([x, y]);
  }
  treeSpots.forEach(([x, y], i) => addObject(i % 6 === 0 ? 'oak' : 'tree', x, y));

  // ============================================================
  // Phase 6 districts (map extension to 224x224 — additive only).
  // Laid AFTER the legacy scatter so the phase-5 rnd() sequence and
  // tree placements stay byte-identical; trees stranded on newly laid
  // terrain are swept afterwards.
  // ============================================================

  // --- South road extension (old south road x36-38 continues to the coast) ---
  rect(36, 63, 38, 188, T.PATH);

  // --- Frostpeak Mountains (x170-222, y6-104) -----------------
  // Foothills x168-179 stay GRASS; the massif proper:
  rect(180, 6, 222, 104, T.ROCK);
  rect(180, 6, 222, 52, T.SNOW);          // snowy north half
  // ice patches
  rect(186, 24, 191, 28, T.ICE);
  rect(212, 34, 218, 39, T.ICE);
  rect(192, 64, 197, 68, T.ICE);
  // Maraza's lair clearing (~205,20): glassy ice shelf, kept object-free
  rect(200, 15, 211, 25, T.ICE);
  // Mountain pass: the old east edge opens into the foothills at y50-54
  rect(131, 51, 184, 53, T.PATH);
  // Foothill trees: maples, yews and two magic trees
  addObject('maple', 172, 40); addObject('maple', 175, 60); addObject('maple', 171, 70);
  addObject('maple', 174, 28); addObject('maple', 177, 86);
  addObject('yew', 173, 46); addObject('yew', 176, 66); addObject('yew', 172, 90); addObject('yew', 178, 34);
  addObject('magic_tree', 175, 75); addObject('magic_tree', 173, 16);
  // Mountain agility course (lvl 30+), pass -> north toward the lair
  addObject('ice_ledge', 188, 48);   // Balance-across
  addObject('rope_bridge', 192, 42); // Cross
  addObject('rock_climb', 196, 36);  // Climb
  addObject('snow_slope', 200, 30);  // Scramble-up

  // --- Ashen Depths (x152-222, y108-162) -----------------------
  rect(151, 108, 222, 162, T.CAVE);
  hollowRect(151, 108, 222, 162, T.WALL);
  // opening from the existing cavern at the x150-152 boundary, y120-140
  for (let y = 120; y <= 140; y++) { setT(150, y, T.CAVE); setT(151, y, T.CAVE); }
  // lava pools
  rect(160, 115, 166, 120, T.LAVA);
  rect(175, 150, 182, 156, T.LAVA);
  rect(195, 112, 202, 117, T.LAVA);
  rect(186, 128, 192, 133, T.LAVA);
  // stalagmites
  const depthStals: [number, number][] = [
    [158, 130], [170, 140], [180, 118], [200, 158], [210, 125], [190, 148], [165, 158],
  ];
  for (const [sx, sy] of depthStals) addObject('stalagmite', sx, sy);
  // gold + runite deep in the depths
  addObject('rocks_gold', 185, 125); addObject('rocks_gold', 198, 143); addObject('rocks_gold', 210, 118);
  addObject('rocks_runite', 217, 130); addObject('rocks_runite', 190, 155);
  // Korr's lair: cleared around (210,150)

  // --- Sunscorch Desert (x6-64, y170-218) ----------------------
  rect(6, 170, 64, 211, T.DSAND);
  // oasis where the old river spills south (x45-52)
  rect(45, 168, 52, 174, T.WATER);
  rect(47, 175, 50, 176, T.WATER);
  // path connection from the swamp's south edge at ~x20
  rect(19, 111, 21, 169, T.PATH);
  rect(19, 170, 21, 184, T.DSAND);        // path fades into the sand
  // bandit camp (~30,200): palisade ring, gaps north + west, clear centre for the king
  hollowRect(24, 195, 36, 205, T.FENCE);
  setT(30, 195, T.DSAND); setT(24, 200, T.DSAND);
  addObject('crate', 26, 198); addObject('crate', 34, 202); addObject('barrel', 27, 203);
  // gem rocks
  addObject('rocks_gem', 44, 202); addObject('rocks_gem', 46, 206);
  // fire altar (~50,180)
  addObject('fire_altar', 50, 180);
  // desert nomad shop tent + gem stall
  hollowRect(10, 176, 15, 181, T.WALL);
  rect(11, 177, 14, 180, T.FLOOR);
  setT(15, 178, T.FLOOR); // door east
  addObject('crate', 11, 180);
  addObject('gem_stall', 17, 178);
  // scattered desert dressing (fixed accents; more via the deco pass)
  addObject('cactus', 12, 188); addObject('cactus', 40, 174); addObject('cactus', 58, 196);
  addObject('dead_tree_deco', 25, 178); addObject('dead_tree_deco', 55, 186);

  // --- Port Brackwater (x70-140, y178-214) + the south coast ---
  // beach + sea span the whole south edge
  rect(0, 212, 223, 215, T.SAND);
  rect(0, 216, 223, 223, T.WATER);
  // roads: junction from the south road, main street, two dock streets
  rect(39, 186, 69, 188, T.PATH);
  rect(70, 186, 138, 188, T.PATH);
  rect(99, 189, 101, 211, T.PATH);
  rect(117, 189, 119, 211, T.PATH);
  // warehouses
  const warehouse = (x0: number, y0: number, x1: number, y1: number, dx: number, dy: number) => {
    hollowRect(x0, y0, x1, y1, T.WALL);
    rect(x0 + 1, y0 + 1, x1 - 1, y1 - 1, T.FLOOR);
    setT(dx, dy, T.FLOOR); // door
  };
  warehouse(84, 192, 94, 200, 89, 192);
  warehouse(104, 192, 114, 200, 109, 192);
  warehouse(122, 192, 132, 200, 122, 196);
  addObject('crate', 85, 193); addObject('crate', 93, 199); addObject('barrel', 86, 193);
  addObject('crate', 105, 193); addObject('barrel', 113, 199); addObject('crate', 131, 193);
  // wooden docks running into the sea
  rect(99, 212, 100, 221, T.BRIDGE);
  rect(117, 212, 118, 221, T.BRIDGE);
  // fishing spots on the water beside the dock ends
  addObject('lobster_spot', 98, 220); addObject('lobster_spot', 101, 219);
  addObject('harpoon_spot', 116, 219); addObject('harpoon_spot', 119, 220);
  // dockside clutter on the beach (clear of the dock walkways)
  addObject('barrel', 96, 213); addObject('crate', 103, 214);
  addObject('barrel', 121, 213); addObject('crate', 115, 213);

  // Sweep legacy scatter trees stranded on newly laid phase-6 terrain
  // (they only ever spawn on GRASS; bog trees on SWAMP are untouched).
  for (const o of [...objects]) {
    if (o.type !== 'tree' && o.type !== 'oak') continue;
    const t = terrain[key(o.x, o.y)];
    if (t === T.PATH || t === T.CAVE || t === T.WALL || t === T.LAVA || t === T.DSAND || t === T.WATER) removeObject(o);
  }

  // ============================================================
  // Phase 6 organic dressing — deterministic deco scatter, whole map.
  // Runs last so it sees final terrain + objects. Never on PATH/FLOOR/
  // BRIDGE; blocking deco never beside roads, floors, docks or doors.
  // ============================================================
  scatterDeco();
}

// Boxes the deco scatter must leave clear (boss lairs / clearings / camps).
const DECO_CLEAR: [number, number, number, number][] = [
  [199, 14, 212, 26],   // Maraza's lair
  [204, 144, 216, 156], // Korr's lair
  [25, 196, 35, 204],   // bandit camp interior
  [137, 147, 147, 157], // drake lair
  [19, 93, 29, 103],    // bog horror clearing
  [137, 13, 157, 31],   // warlord arena
];
const inDecoClear = (x: number, y: number) =>
  DECO_CLEAR.some(([x0, y0, x1, y1]) => x >= x0 && x <= x1 && y >= y0 && y <= y1);

// Terrain deco must never sit on (built/laid surfaces).
const NO_DECO_T = new Set<number>([T.PATH, T.FLOOR, T.BRIDGE, T.WALL, T.FENCE, T.LAVA, T.DIRT]);

function tAt(x: number, y: number): number {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return T.WALL;
  return terrain[key(x, y)];
}
function adjacentTo(x: number, y: number, t: number): boolean {
  return tAt(x + 1, y) === t || tAt(x - 1, y) === t || tAt(x, y + 1) === t || tAt(x, y - 1) === t;
}
// Blocking deco may only stand where no orthogonal neighbour is a walkway/floor/dock,
// so roads, building doorways and dock planks are never pinched.
function blockingDecoOk(x: number, y: number): boolean {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const t = tAt(x + dx, y + dy);
    if (t === T.PATH || t === T.FLOOR || t === T.BRIDGE) return false;
  }
  return true;
}

function scatterDeco() {
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const r = rnd(); // one draw per tile keeps the pass deterministic
      const t = terrain[key(x, y)];
      if (NO_DECO_T.has(t)) continue;
      if (objectAt.has(key(x, y))) continue;
      if (inDecoClear(x, y)) continue;
      const nearWater = adjacentTo(x, y, T.WATER);
      const nearLand = adjacentTo(x, y, T.GRASS) || adjacentTo(x, y, T.SAND) ||
        adjacentTo(x, y, T.SWAMP) || adjacentTo(x, y, T.DSAND) || adjacentTo(x, y, T.FLOWERS);
      switch (t) {
        case T.GRASS:
          if (nearWater && r < 0.14) { addObject('reeds', x, y); break; }
          if (r < 0.012) addObject('bush', x, y);
          else if (r < 0.024) addObject('fern', x, y);
          else if (r < 0.030) addObject('mushroom_patch', x, y);
          else if (r < 0.036) addObject('boulder_small', x, y);
          break;
        case T.FLOWERS:
          if (r < 0.008) addObject('bush', x, y);
          break;
        case T.WATER:
          // lilypads hug the shore; never block (and they don't — see NON_BLOCKING)
          if (nearLand && r < 0.07) addObject('lilypad', x, y);
          break;
        case T.SWAMP:
          if (nearWater && r < 0.12) { addObject('reeds', x, y); break; }
          if (r < 0.020) addObject('mushroom_patch', x, y);
          else if (r < 0.038) addObject('fern', x, y);
          break;
        case T.SAND:
          if (r < 0.045) addObject('driftwood', x, y);
          else if (r < 0.060) addObject('boulder_small', x, y);
          break;
        case T.DSAND:
          if (r < 0.016 && blockingDecoOk(x, y)) addObject('cactus', x, y);
          else if (r < 0.022 && blockingDecoOk(x, y)) addObject('dead_tree_deco', x, y);
          else if (r < 0.034) addObject('boulder_small', x, y);
          break;
        case T.SNOW:
          if (r < 0.025 && blockingDecoOk(x, y)) addObject('snow_pine', x, y);
          else if (r < 0.035 && blockingDecoOk(x, y)) addObject('ice_spike', x, y);
          else if (r < 0.045) addObject('boulder_small', x, y);
          break;
        case T.ROCK:
          if (r < 0.012 && blockingDecoOk(x, y)) addObject('snow_pine', x, y);
          else if (r < 0.030) addObject('boulder_small', x, y);
          break;
        case T.ICE:
          if (r < 0.020 && blockingDecoOk(x, y)) addObject('ice_spike', x, y);
          break;
        case T.CAVE:
          if (r < 0.008) addObject('mushroom_patch', x, y);
          else if (r < 0.018) addObject('boulder_small', x, y);
          break;
      }
    }
  }
  // barrels/crates beside old-town buildings (fixed, clear of doors and roads;
  // skipped if a legacy tree already occupies the tile)
  const clutter = (type: string, x: number, y: number) => {
    if (!objectAt.has(key(x, y))) addObject(type, x, y);
  };
  clutter('barrel', 30, 49); clutter('crate', 40, 50);   // general store
  clutter('barrel', 31, 53); clutter('crate', 31, 60);   // smithy
  clutter('barrel', 26, 55);                             // carpenter shack
  clutter('crate', 81, 13); clutter('barrel', 96, 17);   // Aldgate
  clutter('crate', 113, 43); clutter('barrel', 121, 35);
}

// Object types that never block movement.
const NON_BLOCKING = new Set([
  'fire', 'fishing_spot', 'rod_fishing_spot', 'flax_plant', 'farming_patch',
  'snare_set', 'agility_log', 'agility_rope', 'agility_wall', 'agility_ledge',
  // phase 6: mountain agility course + rune altar + sea fishing spots
  'ice_ledge', 'rope_bridge', 'rock_climb', 'snow_slope', 'fire_altar',
  'lobster_spot', 'harpoon_spot',
  // phase 6: non-blocking ground deco (barrel/crate/cactus/ice_spike/
  // snow_pine/dead_tree_deco/gem_stall stay blocking by default)
  'bush', 'fern', 'boulder_small', 'mushroom_patch', 'reeds', 'lilypad', 'driftwood',
]);

export function blocked(x: number, y: number, forNpc = false): boolean {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return true;
  const t = terrain[key(x, y)];
  if (t === T.WATER || t === T.WALL || t === T.FENCE || t === T.LAVA) return true;
  const o = objectAt.get(key(x, y));
  if (o) {
    if (NON_BLOCKING.has(o.type)) return false;
    return true; // trees, rocks, booths, range, stumps, stalls, furnaces,
                 // fountain, stalagmite, ge_booth, cave_mouth all block
  }
  if (forNpc && t === T.FLOOR) return true; // keep critters out of buildings
  return false;
}

// BFS pathfinding (4+diagonal). Returns path excluding start, or null.
export function findPath(sx: number, sy: number, tx: number, ty: number, acceptAdjacent = false): { x: number; y: number }[] | null {
  if (sx === tx && sy === ty) return [];
  const prev = new Int32Array(MAP_W * MAP_H).fill(-1);
  const visited = new Uint8Array(MAP_W * MAP_H);
  const q: number[] = [key(sx, sy)];
  visited[key(sx, sy)] = 1;
  const targetBlocked = blocked(tx, ty);
  const goal = (x: number, y: number) =>
    (x === tx && y === ty) || ((acceptAdjacent || targetBlocked) && Math.abs(x - tx) <= 1 && Math.abs(y - ty) <= 1);

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]];
  let found = -1;
  let head = 0;
  while (head < q.length) {
    const k = q[head++];
    const x = k % MAP_W, y = Math.floor(k / MAP_W);
    if (goal(x, y)) { found = k; break; }
    for (const [dx, dy] of dirs) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= MAP_W || ny >= MAP_H) continue;
      const nk = key(nx, ny);
      if (visited[nk]) continue;
      if (blocked(nx, ny) && !(goal(nx, ny) && !blocked(nx, ny))) {
        if (blocked(nx, ny)) { visited[nk] = 1; continue; }
      }
      // no corner cutting through blocked diagonals
      if (dx !== 0 && dy !== 0 && (blocked(x + dx, y) || blocked(x, y + dy))) continue;
      visited[nk] = 1;
      prev[nk] = k;
      q.push(nk);
    }
  }
  if (found < 0) return null;
  const path: { x: number; y: number }[] = [];
  let cur = found;
  while (cur !== key(sx, sy)) {
    path.push({ x: cur % MAP_W, y: Math.floor(cur / MAP_W) });
    cur = prev[cur];
    if (cur < 0) return null;
  }
  path.reverse();
  return path;
}
