const L=require('../data/town-layouts/quaverside.json');
const objDefs=require('../data/objects.json');
const npcs=require('../data/npcs.json');
const frag=require('../data/fragments/agility-thieving-hunter-construction.json');
const t=L.terrain,W=L.w,H=L.h;
const errs=[],warns=[];

// 1. shape
if(t.length!==H) errs.push('terrain rows '+t.length+' != h '+H);
for(let y=0;y<t.length;y++){ if(t[y].length!==W) errs.push('row '+y+' len '+t[y].length+' != w '+W);
  for(const v of t[y]) if(v<0||v>16) errs.push('bad terrain code '+v+' at row '+y); }

// 2. object types exist
const validObj=new Set([...Object.keys(objDefs.objs),...Object.keys(objDefs.skillObjs)]);
for(const o of L.objects){
  if(!validObj.has(o.type)) errs.push('UNKNOWN obj type '+o.type);
  if(o.dx<0||o.dx>=W||o.dy<0||o.dy>=H) errs.push('obj OOB '+o.type+' '+o.dx+','+o.dy);
}
// 3. npc ids exist
const validNpc=new Set(Object.keys(npcs));
for(const s of L.spawns){
  if(!validNpc.has(s.id)) errs.push('UNKNOWN npc '+s.id);
  if(s.dx<0||s.dx>=W||s.dy<0||s.dy>=H) errs.push('spawn OOB '+s.id);
}

// 4. coverage: every functional obj type + npc id in fragment must appear
const placedTypes=new Set(L.objects.map(o=>o.type));
const placedNpc=new Set(L.spawns.map(s=>s.id));
const fragObjTypes=new Set();
for(const mo of frag.mapObjects) fragObjTypes.add(mo.type);
for(const ty of fragObjTypes){ if(!placedTypes.has(ty)) errs.push('MISSING fragment mapObject type: '+ty); }
for(const sp of frag.spawns){ if(!placedNpc.has(sp.id)) errs.push('MISSING fragment npc: '+sp.id); }
// also masters/shops npcs list
for(const n of frag.npcs){ if(!placedNpc.has(n.id)) warns.push('fragment npc not spawned: '+n.id); }

// 5. walkability + reachability
const BLOCK_TERRAIN=new Set([1,4,7,12]);
const NONBLOCK_OBJ=new Set(['fire','fishing_spot','rod_fishing_spot','flax_plant','farming_patch','snare_set','agility_log','agility_rope','agility_wall','agility_ledge','ice_ledge','rope_bridge','rock_climb','snow_slope','fire_altar','lobster_spot','harpoon_spot','bush','fern','boulder_small','mushroom_patch','reeds','lilypad','driftwood']);
const blockFlag={}; for(const k in objDefs.objs) blockFlag[k]=objDefs.objs[k].blocks;
const blockObjAt={};
for(const o of L.objects){
  let b = NONBLOCK_OBJ.has(o.type)?false:(o.type in blockFlag?blockFlag[o.type]:true);
  if(b) blockObjAt[o.dx+','+o.dy]=o.type;
}
const walk=(x,y)=> x>=0&&x<W&&y>=0&&y<H && !BLOCK_TERRAIN.has(t[y][x]) && !blockObjAt[x+','+y];
// flood from plaza fountain neighbour (5,16) PATH
let start=null;
for(const [sx,sy] of [[5,17],[5,16],[8,17],[3,17]]) if(walk(sx,sy)){start=[sx,sy];break;}
if(!start) errs.push('no start tile');
const seen=Array.from({length:H},()=>Array(W).fill(false));
if(start){ const st=[start]; seen[start[1]][start[0]]=true;
  while(st.length){const [x,y]=st.pop();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=W||ny>=H||seen[ny][nx]||!walk(nx,ny))continue;seen[ny][nx]=true;st.push([nx,ny]);}}
}
const adjReach=(dx,dy)=>{ for(const [ax,ay] of [[dx,dy],[dx+1,dy],[dx-1,dy],[dx,dy+1],[dx,dy-1]]) if(ax>=0&&ay>=0&&ax<W&&ay<H&&seen[ay][ax]) return true; return false; };
// functional objects must be interactable (adjacent reachable)
const funcTypes=new Set([...fragObjTypes,'bank_booth','spinning_wheel']);
for(const o of L.objects){ if(funcTypes.has(o.type) && !adjReach(o.dx,o.dy)) errs.push('UNREACHABLE func '+o.type+'@'+o.dx+','+o.dy); }
// spawns must stand on reachable walkable
for(const s of L.spawns){ if(!walk(s.dx,s.dy)) errs.push('SPAWN on blocked tile '+s.id+'@'+s.dx+','+s.dy); else if(!seen[s.dy][s.dx]) errs.push('SPAWN unreachable '+s.id+'@'+s.dx+','+s.dy); }

// 6. buildings: each FLOOR region must contain a reachable floor tile (no sealed rooms)
const visF=Array.from({length:H},()=>Array(W).fill(false));
let buildings=0;
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  if(t[y][x]===3 && !visF[y][x]){
    // flood this floor region
    const comp=[]; const st=[[x,y]]; visF[y][x]=true;
    while(st.length){const [cx,cy]=st.pop();comp.push([cx,cy]);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=cx+dx,ny=cy+dy;if(nx<0||ny<0||nx>=W||ny>=H)continue;if(t[ny][nx]===3&&!visF[ny][nx]){visF[ny][nx]=true;st.push([nx,ny]);}}}
    buildings++;
    const anyReach=comp.some(([cx,cy])=>seen[cy][cx]);
    if(!anyReach) errs.push('SEALED building floor region near '+x+','+y+' size '+comp.length);
  }
}

console.log('buildings (floor regions):', buildings);
console.log('objects:', L.objects.length, 'spawns:', L.spawns.length);
console.log('ERRORS('+errs.length+'):'); errs.forEach(e=>console.log('  ✗ '+e));
console.log('WARNINGS('+warns.length+'):'); warns.forEach(w=>console.log('  ! '+w));
console.log(errs.length===0?'\\nVALID ✓':'\\nINVALID');
