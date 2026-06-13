// Generates data/town-layouts/quaverside.json — a crooked river-weir district.
const fs = require('fs');
const path = require('path');

const W = 30, H = 30;
const OX = 150, OY = 135;
const GRASS=0,WATER=1,PATH=2,FLOOR=3,WALL=4,BRIDGE=5,SWAMP=6,FENCE=7,SAND=8,DIRT=9,FLOWERS=10,ROCK=13;

const t = Array.from({length:H},()=>Array(W).fill(GRASS));
const set=(dx,dy,v)=>{ if(dx>=0&&dx<W&&dy>=0&&dy<H) t[dy][dx]=v; };
const get=(dx,dy)=> (dx>=0&&dx<W&&dy>=0&&dy<H)? t[dy][dx] : -1;

// ---- River channel: WATER dx16-21, sand banks dx14-15 & dx22-23 ----
for(let dy=0;dy<H;dy++){
  for(let dx=14;dx<=23;dx++){
    if(dx>=16&&dx<=21) set(dx,dy,WATER); else set(dx,dy,SAND);
  }
}
// crooked, soft banks: nibble grass into the sand so the river meanders
[[14,1],[15,2],[14,7],[23,3],[22,4],[23,9],[14,13],[22,14],[14,18],[23,17],
 [15,23],[22,24],[14,27],[23,27]].forEach(([x,y])=>set(x,y,GRASS));
[[16,2],[21,6],[16,10],[21,15],[16,19],[21,23],[16,26]].forEach(([x,y])=>set(x,y,SAND)); // shallow shoals

function building(x0,y0,w,h,doors){
  for(let y=y0;y<y0+h;y++)for(let x=x0;x<x0+w;x++){
    if(x===x0||x===x0+w-1||y===y0||y===y0+h-1) set(x,y,WALL); else set(x,y,FLOOR);
  }
  for(const [dx,dy] of doors) set(dx,dy,FLOOR);
}

// ===================== WEST BANK (the District) =====================
// Spine street runs at dx7 (north->south). West-bank buildings open EAST onto it.
// THIEVES' DEN   dx2-6 dy3-7, door EAST (dx6,dy5)
building(2,3,5,5,[[6,5]]);
// BANK / GUILD HALL dx1-6 dy10-16, door EAST (dx6,dy13)
building(1,10,6,7,[[6,13]]);
// GENERAL STORE  dx1-6 dy18-22, door EAST (dx6,dy20)
building(1,18,6,5,[[6,20]]);
// MARKET HALL (east of spine, roof anchor) dx9-13 dy5-10, door WEST (dx9,dy7)
building(9,5,5,6,[[9,7]]);

// ===================== EAST BANK (yard & taverns) ===================
// CONSTRUCTION FORGE-HALL dx24-29 dy15-23 (6x9), door WEST (dx24,dy19); roomy lane inside
building(24,15,6,9,[[24,19]]);
// STILT TAVERN over the water: built east of the bank-spine, deck reaching the river
building(24,3,5,6,[[24,5]]);           // dx24-28,dy3-8; door WEST (dx24,dy5) -> spine dx23
// tiny stilt-snug (south)
building(25,22,4,4,[[25,24]]);         // dx25-28,dy22-25; door WEST (dx25,dy24) -> grove path
set(24,24,PATH);

// ===================== STREETS / PLAZAS =====================
// WEST SPINE (dx7) continuous dy0..dy24
for(let y=0;y<=24;y++){ if(get(7,y)===GRASS) set(7,y,PATH); }
// MARKET PLAZA (north) dx2-13 dy0-2 broad path; stalls line it
for(let y=0;y<=2;y++)for(let x=2;x<=13;x++){ if(get(x,y)===GRASS) set(x,y,PATH); }
set(8,3,PATH);set(9,3,PATH);set(10,3,PATH); set(3,3,PATH);set(4,3,PATH);
// door stubs from spine to each west building door
[[6,5],[6,13],[6,20]].forEach(([dx,dy])=>{ /* door already FLOOR; ensure spine tile dx7 path */ });
// market-hall west door stub
set(8,7,PATH);
// central plaza (between bank & store) with fountain — widen spine dx5-8 dy16-17
[[5,16],[6,16],[8,16],[5,17],[6,17],[8,17],[4,17]].forEach(([x,y])=>{ if(get(x,y)===GRASS) set(x,y,PATH); });
// store south frontage + copse trail (SW)
[[6,23],[5,23],[4,23],[6,24],[5,24],[4,24],[3,24],[3,25],[3,26],[3,27],[2,27]].forEach(([x,y])=>{ if(get(x,y)===GRASS) set(x,y,PATH); });

// ---- BRIDGES across the river (spine -> east bank) ----
// North bridge dy12: spine dx7 -> east dx24
for(let x=8;x<=23;x++) set(x,12, (x>=16&&x<=21)?BRIDGE:PATH);
// South bridge dy19
for(let x=8;x<=23;x++) set(x,19, (x>=16&&x<=21)?BRIDGE:PATH);

// EAST SPINE (dx23, the sand bank) linking both bridges + forge hall door + taverns + grove
for(let y=5;y<=27;y++){ set(23,y,PATH); }
// connect bridge ends (dx22) to the east spine
[[22,12],[22,19]].forEach(([x,y])=>set(x,y,PATH));
// stubs to forge door (dx24,dy19) and grove lane (dx24,dy24)
set(24,19,FLOOR); // door already; ensure
[[24,24]].forEach(([x,y])=>set(x,y,PATH));

// ===================== GARDENS / SOFT EDGES =====================
[[3,15],[6,15],[7,15],[4,19],[5,19],[7,19],[3,20],[2,17],
 [10,2],[12,2],[5,16],[7,16],
 [26,14],[27,14],[28,14],[26,26],[27,26],[28,26],
 [1,11],[1,17],[0,12]].forEach(([x,y])=>{ if(get(x,y)===GRASS) set(x,y,FLOWERS); });

// hunter copse: marshy SW corner
[[1,26],[2,27],[1,28],[5,27],[6,28],[2,29],[4,29],[0,27]].forEach(([x,y])=>{ if(get(x,y)===GRASS) set(x,y,SWAMP); });
[[3,26],[4,26],[5,26],[6,26],[1,25],[2,25],[6,27]].forEach(([x,y])=>{ if(get(x,y)===GRASS) set(x,y,DIRT); });

// construction yard: dirt apron + path south of the forge hall (the timber grove)
for(let y=24;y<=29;y++)for(let x=24;x<=29;x++){ if(get(x,y)===GRASS) set(x,y,DIRT); }
// grove lane: a single connected path from east spine (dx23) east, trees flank it
[[24,25],[25,25],[26,25],[27,25],[28,25],[29,25],[24,26],[26,26],[28,26]].forEach(([x,y])=>set(x,y,PATH));
// a little fenced training paddock corner (NE grass)
[[27,9],[28,9],[29,9],[27,13],[28,13],[29,13]].forEach(([x,y])=>set(x,y,FENCE));
[[27,10],[28,10],[29,10],[27,11],[28,11],[29,11],[27,12],[28,12],[29,12]].forEach(([x,y])=>{ if(get(x,y)===GRASS) set(x,y,DIRT); });

// ====================== OBJECTS ======================
const objects=[];
const O=(type,dx,dy)=>objects.push({type,dx,dy});

// ---- AGILITY ROOFTOP COURSE (walkable chain; obstacles are non-blocking, on the spine/banks) ----
// beam over canal -> lock leap -> climb market hall -> spire run -> chimney squeeze -> gap vault -> zip across river
O('qv_beam', 7, 9);         // tuned beam on the spine over a side-canal
O('qv_lock_jump', 7, 16);   // lock-gate leap further down the spine
O('qv_rooftop', 8, 7);      // ladder up onto the market hall roof (west door side)
O('qv_spire_run', 8, 4);    // ridgeline run reached from the roof
O('qv_chimney', 7, 4);      // squeeze the chimney gap
O('qv_gap_vault', 7, 11);   // vault the rooftop gap onto the bridgehead
O('qv_zipline', 8, 12);     // zip from the bridgehead across the weir to the east bank

// ---- MARKET ROW (stalls line the north plaza; crowd in the open) ----
O('fruit_stall', 2, 0);  O('fruit_stall', 4, 0);  O('fruit_stall', 6, 0);
O('silk_stall', 9, 0);   O('silk_stall', 11, 0);  O('silk_stall', 13, 0);
O('coffer_stall', 2, 2); O('coffer_stall', 4, 2);
O('relic_stall', 11, 2); O('relic_stall', 13, 2);
O('wrightsong_banner', 8, 0); O('wrightsong_banner', 13, 3);

// ---- THIEVES' DEN interior (dx3-5,dy4-6): the fence's table ----
O('fence_table', 4, 5);

// ---- BANK / GUILD HALL interior (dx2-5,dy11-15) ----
O('bank_booth', 3, 12); O('bank_booth', 4, 12);
O('spinning_wheel', 3, 14);          // silk-rope crafting station
O('wrightsong_banner', 2, 11); O('wrightsong_banner', 5, 11);

// ---- WEIR & LOCK (namesake, at the river edge — on sand banks) ----
O('qv_weir', 15, 10); O('qv_weir', 15, 14);
O('qv_canal_lock', 15, 22); O('qv_canal_lock', 22, 22);

// ---- CONSTRUCTION FORGE-HALL interior (dx25-28,dy16-22): stations on N wall, clear lane dy17-21 ----
O('qv_workbench', 25,16); O('qv_workbench', 26,16); O('qv_workbench', 27,16);
O('qv_sawmill', 28,16);
O('contract_board', 25,18);          // on west wall, beside the lane
O('wrightsong_banner', 28,18);
// teak/mahogany grove (trees flank the grove path, each path-adjacent)
O('teak', 25,24); O('teak', 27,24); O('teak', 24,27);
O('mahogany', 26,27); O('mahogany', 29,24);
// scaffolds standing in the open yard (dirt, beside the path)
O('qv_scaffold', 24,24); O('qv_scaffold', 29,26);

// ---- HUNTER COPSE (SW marsh, around the copse trail) ----
O('box_trap_set', 1,26); O('box_trap_set', 5,26);
O('pitfall_set', 0,28); O('pitfall_set', 6,27);
O('high_box_trap_set', 4,28); O('high_box_trap_set', 1,24);
O('trophy_mount', 0,25);
O('teak', 6,29); O('mahogany', 5,24);

// ====================== DECOR ======================
const decor=[
  // bank/guild hall interior (dx2-5,dy11-15) — keep door-lane dx5,dy13 clear
  ['chair',5,14],['bookshelf',2,15],['rug_deco',3,13],['banner',4,15],['chair',2,12],
  // general store interior (dx2-5,dy19-21)
  ['crate',2,19],['barrel',5,19],['table',3,21],['crate',4,21],['rug_deco',3,20],
  // thieves' den interior (dx3-5,dy4-6)
  ['table',3,4],['chair',5,4],['crate',5,6],['barrel',3,6],['rug_deco',4,6],
  // market hall interior (dx10-12,dy6-9)
  ['bookshelf',10,6],['table',11,8],['chair',12,8],['crate',12,6],['barrel',10,9],['rug_deco',11,7],
  // stilt tavern interior (dx25-27,dy4-7) — over the water
  ['table',25,4],['chair',26,4],['table',27,5],['barrel',27,6],['banner',25,5],['rug_deco',26,6],
  // tavern snug interior (dx26-27,dy23-24)
  ['chair',27,23],['rug_deco',26,24],['table',27,24],
  // forge-hall interior (dx25-28,dy16-22) — decor on the south wall, lane dy17-20 clear
  ['crate',25,22],['barrel',26,22],['bookshelf',27,22],['rug_deco',26,19],['chair',25,19],['banner',28,17],
  // plaza & street life
  ['fountain',5,17],['lamp_post',6,16],['lamp_post',8,11],['lamp_post',8,16],['lamp_post',24,12],
  ['lamp_post',2,3],['lamp_post',8,3],['hay_bale',8,17],['weapon_rack',6,21],['hay_bale',25,12],
  // riverside nature on the banks
  ['reeds',14,3],['reeds',14,9],['reeds',14,16],['reeds',23,7],['reeds',22,16],['reeds',23,21],
  ['lilypad',17,4],['lilypad',20,8],['lilypad',18,15],['lilypad',19,23],['lilypad',17,27],['lilypad',20,11],
  ['driftwood',14,24],['driftwood',23,10],['reeds',14,27],['reeds',23,28],
  // gardens
  ['bush',2,17],['bush',8,15],['fern',1,17],['bush',26,14],['fern',28,14],['bush',27,26],
  ['bush',8,9],['fern',10,2],['mushroom_patch',0,12],
  // hunter copse atmosphere
  ['reeds',0,27],['reeds',2,28],['reeds',6,28],['fern',2,24],['bush',5,29],['mushroom_patch',3,29],
  ['fern',0,29],['bush',6,25],
  // construction yard atmosphere
  ['crate',25,20],['crate',26,21],['barrel',28,22],['hay_bale',29,20],['lamp_post',24,18],
  // paddock (NE)
  ['hay_bale',28,11],['fern',28,12],
];
decor.forEach(([type,dx,dy])=>O(type,dx,dy));

// ====================== SPAWNS ======================
const spawns=[
  {id:'qv_banker', dx:3, dy:13},          // bank interior
  {id:'qv_general_clerk', dx:3, dy:19},   // store interior
  {id:'qv_thieving_master', dx:4, dy:4},  // den interior
  {id:'qv_agility_master', dx:8, dy:8},   // course start (spine)
  {id:'qv_construction_master', dx:26, dy:20}, // forge-hall interior
  {id:'qv_hunter_master', dx:3, dy:26},   // copse trail
  // market pickpocket crowd (open plaza)
  {id:'silk_merchant', dx:10, dy:1},
  {id:'guild_treasurer', dx:5, dy:1},
  {id:'gilded_noble', dx:8, dy:1},
  {id:'market_crowd_thug', dx:3, dy:1},
  {id:'market_crowd_thug', dx:12, dy:1},
  {id:'market_crowd_thug', dx:7, dy:2},
];

const out={ town:'Quaverside', origin:[OX,OY], w:W, h:H, terrain:t, objects, spawns };
const dir=path.join(__dirname,'..','data','town-layouts');
fs.mkdirSync(dir,{recursive:true});
fs.writeFileSync(path.join(dir,'quaverside.json'), JSON.stringify(out,null,2));
console.log('WROTE quaverside.json objects='+objects.length+' spawns='+spawns.length);
