// DOM-based classic sidebar UI: tabs, panels, context menus, chat, dialogue,
// make-X picker, bank/shop modals, orbs and XP drops.

import {
  SKILLS, SkillName, TRAINABLE, ITEMS, OBJS, NPCS, XP_TABLE,
  SPELLS, PRAYERS, SHOPS,
} from './defs';
import {
  state, events, level, totalLevel, combatLevel, walkTo, msg, skillIdx,
  eatFood, buryBones, equipItem, unequip, dropItem,
  bankDeposit, bankWithdraw, shopBuy, shopSell, getShopStock,
  attackNpc, attackPlayer, pickupItem, interactWithObject, interactWithNpc,
  useItemOnObject, useItemOnItem,
  itemActions, objectActions, npcActions,
  advanceDialogue, chooseOption, togglePrayer, currentAttackMode,
  saveGame, resetSave, invCount, equipBonus, freeSlots,
  sendWs, ENABLE_PVP, toggleSpecAttack, specItem,
  Npc, CombatStyle, MakeOption, EQUIP_SLOTS,
  COLLECTIBLES, COLLECTION_CATEGORIES,
} from './game';
import type { ItemDef } from './defs';
import { itemIcon, skillIcon, tabIcon, copyCanvas } from './sprites';
import { screenToTile, minimapClickToTile } from './render';
import { objects, objectAt, key, WorldObject, GroundItem } from './world';
import { audio, TRACKS } from './audio';
import { QUESTS } from './quests';
import type { EquipSlot } from './defs';
import {
  friends, addFriend, removeFriend, loadFriends, startFriendsPolling, isFriend,
  guild, loadGuild, createGuild, guildInvite, guildLeave, guildKick, guildPromote,
  guildSetDepositOnly, GUILD_COST, GuildMember,
} from './friends';
import { net, syncSaveNow, reloadServerOwned } from './net';
import { openCoinflip } from './packs/gambling';

const $ = (id: string) => document.getElementById(id)!;

type TabName = 'combat' | 'skills' | 'quests' | 'inventory' | 'equipment' | 'prayer' | 'magic' | 'music' | 'friends' | 'settings';
let activeTab: TabName = 'inventory';
let selectedQuest: string | null = null;
let collectionView = false; // quests tab: showing the collection log sub-view
let chatFilter: 'all' | 'game' | 'public' = 'all';
// Sound settings persist across sessions — players who mute the music should
// never have to mute it twice.
const VOL_KEY = 'bs-volumes';
function loadVolumes(): { music: number; sfx: number } {
  try {
    const v = JSON.parse(localStorage.getItem(VOL_KEY) ?? '');
    if (typeof v?.music === 'number' && typeof v?.sfx === 'number') {
      return { music: Math.max(0, Math.min(1, v.music)), sfx: Math.max(0, Math.min(1, v.sfx)) };
    }
  } catch { /* first run / bad data */ }
  return { music: 0.5, sfx: 0.5 };
}
function saveVolumes() {
  try { localStorage.setItem(VOL_KEY, JSON.stringify({ music: musicVol, sfx: sfxVol })); } catch { /* ignore */ }
}
let { music: musicVol, sfx: sfxVol } = loadVolumes();
let resetArmed = false;

// local chat log (game messages + player speech)
const chatLog: { text: string; cls: string }[] = [];

export function initUI() {
  ensureExtraDom();
  buildTabs();
  renderPanel();
  bindChat();
  bindViewport();
  bindMinimap();
  bindOrbs();
  bindKeys();

  events.onMessage = (text, cls) => addChatLine(text, cls);
  events.onXpDrop = (drop) => showXpDrop(drop.skill, drop.amount);
  events.onInvChange = () => {
    if (activeTab === 'inventory' || activeTab === 'equipment' || activeTab === 'magic') renderPanel();
    renderModals();
  };
  events.onStatsChange = () => {
    updateOrbs();
    updateXpTracker();
    if (['skills', 'combat', 'equipment', 'prayer', 'magic'].includes(activeTab)) renderPanel();
  };
  events.onBankShopChange = () => { renderModals(); if (activeTab === 'music') renderPanel(); };
  events.onLevelUp = () => { if (activeTab === 'skills' || activeTab === 'quests') renderPanel(); };
  events.onDialogueChange = () => renderDialogue();
  events.onRequestMake = (opts, cb) => showMakePicker(opts, cb);
  events.onCollection = () => { if (activeTab === 'quests' && collectionView) renderPanel(); };
  audio.onTrackChange = () => {
    audio.setMusicVolume(musicVol);
    audio.setSfxVolume(sfxVol);
    if (activeTab === 'music') renderPanel();
  };
  friends.onChange = () => { if (activeTab === 'friends') renderPanel(); };
  guild.onChange = () => { if (activeTab === 'friends') renderPanel(); };
  startFriendsPolling(() => activeTab === 'friends');

  updateOrbs();
}

// Create UI elements not present in index.html (prayer orb, dialogue + make-X overlays, chat tabs).
function ensureExtraDom() {
  if (!document.getElementById('orb-prayer')) {
    const orb = document.createElement('div');
    orb.id = 'orb-prayer';
    orb.className = 'orb';
    orb.innerHTML = '<span class="orb-num">1</span><span class="orb-icon">✦</span>';
    $('minimap-area').appendChild(orb);
  }
  if (!document.getElementById('chat-tabs')) {
    const row = document.createElement('div');
    row.id = 'chat-tabs';
    $('chatbox').insertBefore(row, $('chat-messages'));
  }
  if (!document.getElementById('dialogue-overlay')) {
    const d = document.createElement('div');
    d.id = 'dialogue-overlay';
    $('chatbox').appendChild(d);
  }
  if (!document.getElementById('make-strip')) {
    const m = document.createElement('div');
    m.id = 'make-strip';
    $('chatbox').appendChild(m);
  }
  if (!document.getElementById('xp-tracker')) {
    const t = document.createElement('div');
    t.id = 'xp-tracker';
    $('viewport-wrap').appendChild(t);
  }
  buildChatTabs();
}

// ---------------- Tabs ----------------
const TOP_TABS: TabName[] = ['combat', 'skills', 'quests', 'inventory', 'equipment'];
const BOTTOM_TABS: TabName[] = ['prayer', 'magic', 'music', 'friends', 'settings'];

function buildTabs() {
  const make = (row: HTMLElement, names: TabName[]) => {
    row.innerHTML = '';
    for (const name of names) {
      const el = document.createElement('div');
      el.className = 'tab' + (name === activeTab ? ' active' : '');
      el.title = name[0].toUpperCase() + name.slice(1);
      el.appendChild(copyCanvas(tabIcon(name)));
      el.onclick = () => { activeTab = name; resetArmed = false; buildTabs(); renderPanel(); };
      row.appendChild(el);
    }
  };
  make($('tabs-top'), TOP_TABS);
  make($('tabs-bottom'), BOTTOM_TABS);
}

function renderPanel() {
  const panel = $('panel');
  hideItemTooltip(); // re-rendering removes hovered slots; never strand the tooltip
  panel.innerHTML = '';
  switch (activeTab) {
    case 'combat': return renderCombat(panel);
    case 'skills': return renderSkills(panel);
    case 'quests': return renderQuests(panel);
    case 'inventory': return renderInventory(panel);
    case 'equipment': return renderEquipment(panel);
    case 'prayer': return renderPrayer(panel);
    case 'magic': return renderMagic(panel);
    case 'music': return renderMusic(panel);
    case 'friends': return renderFriends(panel);
    case 'settings': return renderSettings(panel);
  }
}

// ---------------- Combat tab ----------------
function renderCombat(panel: HTMLElement) {
  const p = state.player;
  const weapon = p.equipment.weapon ? ITEMS[p.equipment.weapon.id].name : 'Unarmed';
  const mode = currentAttackMode();
  const head = document.createElement('div');
  head.innerHTML = `
    <div class="combat-name">${esc(weapon)}</div>
    <div class="combat-lvl">Combat level: ${combatLevel()}</div>
    <div class="combat-mode">Attack mode: <b class="mode-${mode}">${mode[0].toUpperCase() + mode.slice(1)}</b></div>`;
  panel.appendChild(head);

  const styles: { id: CombatStyle; name: string; desc: string }[] = [
    { id: 'accurate', name: 'Accurate', desc: 'Trains Attack' },
    { id: 'aggressive', name: 'Aggressive', desc: 'Trains Strength' },
    { id: 'defensive', name: 'Defensive', desc: 'Trains Defence' },
  ];
  for (const s of styles) {
    const btn = document.createElement('button');
    btn.className = 'style-btn' + (p.combatStyle === s.id ? ' selected' : '');
    btn.innerHTML = `${s.name}<small>${s.desc}</small>`;
    btn.onclick = () => { p.combatStyle = s.id; renderPanel(); };
    panel.appendChild(btn);
  }

  // Special attack bar (docs/EFFECTS.md): click to arm; the next swing spends
  // the energy. Items without a spec still show the (disabled) energy bar.
  const si = specItem();
  const spec = document.createElement('div');
  spec.className = 'spec-box' + (si ? '' : ' none');
  const label = si
    ? `${si.spec.name} (${si.spec.energy}%)`
    : 'No special attack';
  spec.innerHTML = `
    <div class="spec-label">Special attack: ${esc(label)}</div>
    <div class="spec-bar${p.specArmed ? ' armed' : ''}" title="${esc(si ? si.spec.desc : 'This equipment has no special attack.')}">
      <div class="spec-fill" style="width:${p.specEnergy}%"></div>
      <span class="spec-pct">${p.specEnergy}%</span>
    </div>`;
  if (si) {
    const bar = spec.querySelector('.spec-bar') as HTMLElement;
    bar.onclick = () => { toggleSpecAttack(); renderPanel(); };
  }
  panel.appendChild(spec);

  const slayer = document.createElement('div');
  slayer.className = 'slayer-line';
  const task = p.slayerTask;
  slayer.textContent = task && task.remaining > 0
    ? `Slayer task: ${task.remaining} x ${NPCS[task.npc]?.name ?? task.npc}`
    : 'No slayer task';
  panel.appendChild(slayer);
}

// ---------------- Skills tab ----------------
function renderSkills(panel: HTMLElement) {
  const grid = document.createElement('div');
  grid.className = 'skills-grid';
  for (const name of SKILLS) {
    const lvl = level(name);
    const xp = state.player.xp[skillIdx(name)];
    const cell = document.createElement('div');
    cell.className = 'skill-cell' + (TRAINABLE.has(name) ? '' : ' locked');
    cell.appendChild(copyCanvas(skillIcon(name)));
    const lvls = document.createElement('div');
    lvls.className = 'skill-lvls';
    lvls.innerHTML = `${lvl}<span class="denom">${lvl}</span>`;
    cell.appendChild(lvls);
    const next = lvl < 99 ? XP_TABLE[lvl + 1] - xp : 0;
    cell.title = `${name} — Level ${lvl}\nXP: ${Math.floor(xp).toLocaleString()}`
      + (lvl < 99 ? `\nNext level at: ${XP_TABLE[lvl + 1].toLocaleString()} xp\nRemaining: ${Math.ceil(next).toLocaleString()} xp` : '\nMaximum level!');
    const bar = document.createElement('div');
    bar.className = 'skill-bar';
    bar.innerHTML = `<div class="skill-bar-fill" style="width:${(levelProgress(name) * 100).toFixed(1)}%"></div>`;
    cell.appendChild(bar);
    grid.appendChild(cell);
  }
  const total = document.createElement('div');
  total.className = 'total-level';
  total.textContent = `Total level: ${totalLevel()}`;
  grid.appendChild(total);
  panel.appendChild(grid);
}

// ---------------- Quests tab ----------------
interface QuestLike {
  id: string; name: string; doneStage: number;
  journal?: unknown;
}

function questStage(q: QuestLike): number { return state.player.quests[q.id] ?? 0; }

function questJournalText(q: QuestLike): string {
  const stage = questStage(q);
  const j: any = (q as any).journal;
  try {
    if (typeof j === 'function') return String(j(stage));
    if (Array.isArray(j)) return String(j[Math.min(stage, j.length - 1)] ?? '');
    if (j && typeof j === 'object') return String(j[stage] ?? j[Object.keys(j).length - 1] ?? '');
  } catch { /* tolerate quest data still in flight */ }
  if (stage >= q.doneStage) return 'You have completed this quest.';
  if (stage > 0) return 'This quest is in progress.';
  return 'You have not started this quest.';
}

function renderQuests(panel: HTMLElement) {
  const quests = (QUESTS ?? []) as unknown as QuestLike[];
  if (collectionView) return renderCollectionLog(panel);
  if (selectedQuest) {
    const q = quests.find((x) => x.id === selectedQuest);
    if (q) {
      const title = document.createElement('div');
      title.className = 'panel-title';
      title.textContent = q.name;
      panel.appendChild(title);
      const back = document.createElement('button');
      back.className = 'mini-btn';
      back.textContent = '< Back to quest list';
      back.onclick = () => { selectedQuest = null; renderPanel(); };
      panel.appendChild(back);
      const body = document.createElement('div');
      body.className = 'quest-journal';
      body.textContent = questJournalText(q);
      panel.appendChild(body);
      return;
    }
    selectedQuest = null;
  }
  const head = document.createElement('div');
  head.className = 'quest-head';
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'Quest Journal';
  head.appendChild(title);
  const clogBtn = document.createElement('button');
  clogBtn.className = 'mini-btn clog-btn';
  clogBtn.textContent = 'Collection Log';
  const clog = state.player.collectionLog ?? {};
  const obtained = [...COLLECTIBLES.keys()].filter((id) => clog[id] !== undefined).length;
  clogBtn.title = `Collection Log — ${obtained}/${COLLECTIBLES.size} items obtained`;
  clogBtn.onclick = () => { collectionView = true; renderPanel(); };
  head.appendChild(clogBtn);
  panel.appendChild(head);
  const list = document.createElement('div');
  list.className = 'quest-list';
  if (quests.length === 0) {
    const note = document.createElement('div');
    note.className = 'panel-note';
    note.textContent = 'No quests available in this region yet.';
    panel.appendChild(note);
    return;
  }
  let done = 0;
  for (const q of quests) {
    const stage = questStage(q);
    const cls = stage >= q.doneStage ? 'q-done' : stage > 0 ? 'q-progress' : 'q-not';
    if (stage >= q.doneStage) done++;
    const el = document.createElement('div');
    el.className = 'quest-row ' + cls;
    el.textContent = q.name;
    el.onclick = () => { selectedQuest = q.id; renderPanel(); };
    list.appendChild(el);
  }
  panel.appendChild(list);
  const note = document.createElement('div');
  note.className = 'panel-note';
  note.textContent = `${done}/${quests.length} quests complete.`;
  panel.appendChild(note);
}

// ---------------- Collection log ----------------
function renderCollectionLog(panel: HTMLElement) {
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'Collection Log';
  panel.appendChild(title);
  const back = document.createElement('button');
  back.className = 'mini-btn';
  back.textContent = '< Back to quest list';
  back.onclick = () => { collectionView = false; renderPanel(); };
  panel.appendChild(back);

  const log = state.player.collectionLog ?? {};
  let totalGot = 0;
  for (const cat of COLLECTION_CATEGORIES) {
    const ids = [...COLLECTIBLES.entries()]
      .filter(([, c]) => c === cat)
      .map(([id]) => id)
      .sort((a, b) => ITEMS[a].name.localeCompare(ITEMS[b].name));
    if (ids.length === 0) continue;
    const got = ids.filter((id) => log[id] !== undefined).length;
    totalGot += got;
    const head = document.createElement('div');
    head.className = 'clog-cat' + (got === ids.length ? ' clog-complete' : '');
    head.textContent = `${cat} — ${got}/${ids.length}`;
    panel.appendChild(head);
    const list = document.createElement('div');
    list.className = 'clog-list';
    for (const id of ids) {
      const have = log[id] !== undefined;
      const row = document.createElement('div');
      row.className = 'clog-row ' + (have ? 'clog-got' : 'clog-missing');
      try { row.appendChild(copyCanvas(itemIcon(id))); } catch { /* no icon */ }
      const name = document.createElement('span');
      name.textContent = have ? ITEMS[id].name : '???';
      row.appendChild(name);
      row.title = have ? itemExamine(id) : 'You have not obtained this item yet.';
      if (have) row.onclick = () => msg(itemExamine(id), 'examine');
      list.appendChild(row);
    }
    panel.appendChild(list);
  }
  const note = document.createElement('div');
  note.className = 'panel-note';
  note.textContent = `${totalGot}/${COLLECTIBLES.size} items collected. Rare drops and dungeon spoils are recorded here.`;
  panel.appendChild(note);
}

// ---------------- Item examine + effect discovery ----------------
// Auto-generated one-liners so effect/spec mechanics are discoverable in-game.
function effectLines(def: ItemDef): string {
  const parts: string[] = [];
  for (const e of def.effects ?? []) {
    if (e.type === 'poison') parts.push('Poisons on hit.');
    else if (e.type === 'burn') parts.push('Burns on hit.');
    else if (e.type === 'bleed') parts.push('Inflicts bleeding on hit.');
    else if (e.type === 'freeze') parts.push('Can freeze a target in place.');
    else if (e.type === 'lifesteal') parts.push(`Heals you for ${Math.round(e.pct * 100)}% of damage dealt.`);
    else if (e.type === 'family_bane') {
      const fam = e.family.charAt(0).toUpperCase() + e.family.slice(1);
      parts.push(`Strikes truer against the ${fam}.`);
    }
  }
  if (def.spec) parts.push(`Special: ${def.spec.name} (${def.spec.energy}%) — ${def.spec.desc}`);
  return parts.join(' ');
}

function itemExamine(id: string): string {
  const def = ITEMS[id];
  if (!def) return 'Nothing interesting.';
  const fx = effectLines(def);
  return fx ? `${def.examine} ${fx}` : def.examine;
}

// ---------------- Item stat tooltips (inventory + equipment hover) ----------------
const STAT_KEYS = [
  ['attBonus', 'Attack'], ['strBonus', 'Strength'], ['defBonus', 'Defence'],
  ['rangedBonus', 'Ranged'], ['gunBonus', 'Gun'],
] as const;

function ensureTooltipEl(): HTMLElement {
  let el = document.getElementById('item-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'item-tooltip';
    document.body.appendChild(el);
  }
  return el;
}

function tooltipHtml(itemId: string, compare: boolean): string {
  const def = ITEMS[itemId];
  if (!def) return '';
  let html = `<div class="tt-name">${esc(def.name)}</div>`;
  // compare against what's currently in the same equipment slot
  const eqStack = compare && def.equipSlot ? state.player.equipment[def.equipSlot] : null;
  const eqDef = eqStack && eqStack.id !== itemId ? ITEMS[eqStack.id] : null;
  if (eqDef) html += `<div class="tt-vs">vs ${esc(eqDef.name)} (equipped)</div>`;
  for (const [key, label] of STAT_KEYS) {
    const v = (def[key] as number | undefined) ?? 0;
    const ev = (eqDef?.[key] as number | undefined) ?? 0;
    if (v === 0 && (!eqDef || ev === 0)) continue;
    let diff = '';
    if (eqDef) {
      const d = v - ev;
      diff = d > 0 ? `<span class="tt-up">▲+${d}</span>`
        : d < 0 ? `<span class="tt-down">▼${d}</span>`
        : '<span class="tt-same">=</span>';
    }
    html += `<div class="tt-row"><span>${label}: ${v >= 0 ? '+' : ''}${v}</span>${diff}</div>`;
  }
  if (def.attackSpeed !== undefined) {
    let diff = '';
    if (eqDef?.attackSpeed !== undefined) {
      const d = def.attackSpeed - eqDef.attackSpeed; // lower = faster = better
      diff = d < 0 ? `<span class="tt-up">▲faster</span>`
        : d > 0 ? `<span class="tt-down">▼slower</span>`
        : '<span class="tt-same">=</span>';
    }
    html += `<div class="tt-row"><span>Speed: ${def.attackSpeed} ticks</span>${diff}</div>`;
  }
  if (def.edible) html += `<div class="tt-row"><span>Heals ${def.edible.heals} HP</span></div>`;
  const fx = effectLines(def);
  if (fx) html += `<div class="tt-fx">${esc(fx)}</div>`;
  if (def.equipSlot && compare) html += `<div class="tt-hint">Shift-click to drop</div>`;
  return html;
}

function positionTooltip(el: HTMLElement, e: MouseEvent) {
  const pad = 14;
  el.style.left = Math.min(e.clientX + pad, window.innerWidth - el.offsetWidth - 6) + 'px';
  el.style.top = Math.min(e.clientY + pad, window.innerHeight - el.offsetHeight - 6) + 'px';
}

function attachItemTooltip(slot: HTMLElement, itemId: string, compare: boolean) {
  slot.addEventListener('mouseenter', (e) => {
    const el = ensureTooltipEl();
    el.innerHTML = tooltipHtml(itemId, compare);
    el.style.display = 'block';
    positionTooltip(el, e);
  });
  slot.addEventListener('mousemove', (e) => {
    const el = document.getElementById('item-tooltip');
    if (el && el.style.display === 'block') positionTooltip(el, e);
  });
  slot.addEventListener('mouseleave', hideItemTooltip);
  slot.addEventListener('mousedown', hideItemTooltip);
}

function hideItemTooltip() {
  const el = document.getElementById('item-tooltip');
  if (el) el.style.display = 'none';
}

// ---------------- Inventory ----------------
function renderInventory(panel: HTMLElement) {
  const grid = document.createElement('div');
  grid.className = 'inv-grid';
  state.player.inventory.forEach((it, i) => {
    const slot = document.createElement('div');
    slot.className = 'inv-slot' + (state.usingSlot === i ? ' using' : '');
    if (it) {
      const icon = copyCanvas(itemIcon(it.id));
      slot.appendChild(icon);
      if (ITEMS[it.id].stackable && it.qty > 1) {
        const q = document.createElement('span');
        q.className = 'inv-qty';
        q.textContent = fmtQty(it.qty);
        slot.appendChild(q);
      }
      attachItemTooltip(slot, it.id, true);
      slot.onclick = (e) => {
        e.stopPropagation();
        // shift-click drop QoL (the right-click Drop option remains)
        if (e.shiftKey && state.usingSlot === null) { dropItem(i); return; }
        itemPrimaryAction(i);
      };
      slot.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); showItemMenu(e, i); };
    } else if (state.usingSlot !== null) {
      slot.onclick = () => { /* clicking empty slot while using: cancel */ clearUsing(); };
    }
    grid.appendChild(slot);
  });
  panel.appendChild(grid);
  if (state.usingSlot !== null) {
    const it = state.player.inventory[state.usingSlot];
    if (it) {
      const note = document.createElement('div');
      note.className = 'panel-note';
      note.textContent = `Use ${ITEMS[it.id].name} with...`;
      panel.appendChild(note);
    }
  }
}

function fmtQty(q: number): string {
  if (q >= 10_000_000) return Math.floor(q / 1_000_000) + 'M';
  if (q >= 100_000) return Math.floor(q / 1000) + 'K';
  return String(q);
}

function clearUsing() {
  state.usingSlot = null;
  if (activeTab === 'inventory') renderPanel();
}

function itemPrimaryAction(slot: number) {
  const it = state.player.inventory[slot];
  if (!it) return;
  if (state.usingSlot !== null) {
    const from = state.usingSlot;
    state.usingSlot = null;
    if (from !== slot) useItemOnItem(from, slot);
    if (activeTab === 'inventory') renderPanel();
    return;
  }
  const def = ITEMS[it.id];
  if (def.edible) return eatFood(slot);
  if (def.buryXp) return buryBones(slot);
  if (def.equipSlot) return equipItem(slot);
  const acts = itemActions.get(it.id);
  if (acts && acts.length > 0) return acts[0].handler(slot);
  // nothing registered: select as 'Use'
  state.usingSlot = slot;
  if (activeTab === 'inventory') renderPanel();
}

function showItemMenu(e: MouseEvent, slot: number) {
  const it = state.player.inventory[slot];
  if (!it) return;
  const def = ITEMS[it.id];
  const opts: MenuOption[] = [];
  opts.push({
    label: 'Use', target: def.name,
    fn: () => { state.usingSlot = slot; if (activeTab === 'inventory') renderPanel(); },
  });
  for (const a of itemActions.get(it.id) ?? []) {
    opts.push({ label: a.option, target: def.name, fn: () => a.handler(slot) });
  }
  if (def.equipSlot) opts.push({ label: def.equipSlot === 'weapon' ? 'Wield' : 'Wear', target: def.name, fn: () => equipItem(slot) });
  if (def.edible) opts.push({ label: 'Eat', target: def.name, fn: () => eatFood(slot) });
  if (def.buryXp) opts.push({ label: 'Bury', target: def.name, fn: () => buryBones(slot) });
  opts.push({ label: 'Drop', target: def.name, fn: () => dropItem(slot) });
  opts.push({ label: 'Examine', target: def.name, fn: () => msg(itemExamine(it.id), 'examine') });
  showContextMenu(e.clientX, e.clientY, opts);
}

// ---------------- Equipment ----------------
const EQUIP_HINTS: Record<EquipSlot, string> = {
  head: '🪖', body: '👕', legs: '👖', weapon: '⚔', shield: '🛡',
  gloves: '🧤', boots: '🥾', ammo: '➶', neck: '📿', ring: '💍',
};

function renderEquipment(panel: HTMLElement) {
  const p = state.player;
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'Worn Equipment';
  panel.appendChild(title);

  const grid = document.createElement('div');
  grid.className = 'equip-grid';
  const layout: (EquipSlot | null)[][] = [
    [null, 'head', 'ammo'],
    ['neck', 'body', 'ring'],
    ['weapon', 'legs', 'shield'],
    ['gloves', 'boots', null],
  ];
  for (const rowSlots of layout) {
    const row = document.createElement('div');
    row.className = 'equip-row';
    for (const slotName of rowSlots) {
      const slot = document.createElement('div');
      if (!slotName) { slot.className = 'equip-slot ghost'; row.appendChild(slot); continue; }
      slot.className = 'equip-slot';
      const it = p.equipment[slotName];
      if (it) {
        slot.appendChild(copyCanvas(itemIcon(it.id)));
        if (ITEMS[it.id].stackable && it.qty > 1) {
          const q = document.createElement('span');
          q.className = 'inv-qty';
          q.textContent = fmtQty(it.qty);
          slot.appendChild(q);
        }
        attachItemTooltip(slot, it.id, false);
        slot.onclick = () => unequip(slotName);
        slot.oncontextmenu = (e) => {
          e.preventDefault();
          showContextMenu(e.clientX, e.clientY, [
            { label: 'Remove', target: ITEMS[it.id].name, fn: () => unequip(slotName) },
            { label: 'Examine', target: ITEMS[it.id].name, fn: () => msg(itemExamine(it.id), 'examine') },
          ]);
        };
      } else {
        slot.innerHTML = `<span class="slot-hint">${EQUIP_HINTS[slotName]}</span>`;
        slot.title = slotName[0].toUpperCase() + slotName.slice(1) + ' slot';
      }
      row.appendChild(slot);
    }
    grid.appendChild(row);
  }
  panel.appendChild(grid);

  const stats = document.createElement('div');
  stats.className = 'equip-stats';
  stats.innerHTML = `<b>Total bonuses</b><br/>`
    + `Attack: +${equipBonus('att')}<br/>`
    + `Strength: +${equipBonus('str')}<br/>`
    + `Defence: +${equipBonus('def')}<br/>`
    + `Ranged: +${equipBonus('ranged')}<br/>`
    + `Gun: +${equipBonus('gun')}`;
  panel.appendChild(stats);
}

// ---------------- Prayer tab ----------------
function renderPrayer(panel: HTMLElement) {
  const p = state.player;
  const head = document.createElement('div');
  head.className = 'panel-title';
  head.textContent = `Prayer points: ${p.prayerPoints}/${level('Prayer')}`;
  panel.appendChild(head);

  const grid = document.createElement('div');
  grid.className = 'prayer-grid';
  for (const pr of PRAYERS) {
    const usable = level('Prayer') >= pr.level;
    const active = p.activePrayers.has(pr.id);
    const cell = document.createElement('div');
    cell.className = 'prayer-cell' + (active ? ' lit' : '') + (usable ? '' : ' locked');
    const ic = copyCanvas(skillIcon('Prayer'));
    cell.appendChild(ic);
    const lab = document.createElement('div');
    lab.className = 'prayer-name';
    lab.innerHTML = `${esc(pr.name)}<small>Lvl ${pr.level} — +${Math.round((pr.mult - 1) * 100)}% ${pr.boost}</small>`;
    cell.appendChild(lab);
    cell.title = usable
      ? `${pr.name}\nBoosts ${pr.boost} by ${Math.round((pr.mult - 1) * 100)}%.\nDrain rate: ${pr.drain}`
      : `${pr.name}\nRequires Prayer level ${pr.level}.`;
    cell.onclick = () => { togglePrayer(pr.id); renderPanel(); };
    grid.appendChild(cell);
  }
  panel.appendChild(grid);
  const note = document.createElement('div');
  note.className = 'panel-note';
  note.textContent = 'Bury bones to train Prayer. Recharge points at an altar.';
  panel.appendChild(note);
}

// ---------------- Magic tab ----------------
function renderMagic(panel: HTMLElement) {
  const p = state.player;
  const head = document.createElement('div');
  head.className = 'panel-title';
  head.textContent = 'Spellbook';
  panel.appendChild(head);

  const list = document.createElement('div');
  list.className = 'spell-list';
  for (const sp of SPELLS) {
    const hasLevel = level('Magic') >= sp.level;
    const hasRunes = sp.runes.every((r) => invCount(r.item) >= r.qty);
    const selected = p.autocastSpell === sp.id;
    const cell = document.createElement('div');
    cell.className = 'spell-cell' + (selected ? ' selected' : '') + (hasLevel && hasRunes ? '' : ' locked');
    const top = document.createElement('div');
    top.className = 'spell-name';
    top.innerHTML = `${esc(sp.name)} <small>Lvl ${sp.level} · Max hit ${sp.maxHit}</small>`;
    cell.appendChild(top);
    const runes = document.createElement('div');
    runes.className = 'spell-runes';
    for (const r of sp.runes) {
      const chip = document.createElement('span');
      chip.className = 'rune-chip' + (invCount(r.item) >= r.qty ? ' ok' : ' missing');
      const ic = copyCanvas(itemIcon(r.item));
      ic.style.width = '16px'; ic.style.height = '16px';
      chip.appendChild(ic);
      chip.appendChild(document.createTextNode(`${invCount(r.item)}/${r.qty}`));
      chip.title = ITEMS[r.item].name;
      runes.appendChild(chip);
    }
    cell.appendChild(runes);
    cell.title = hasLevel
      ? (hasRunes ? `${sp.name} — click to ${selected ? 'stop autocasting' : 'autocast'}.` : `${sp.name} — you are missing runes.`)
      : `${sp.name} — requires Magic level ${sp.level}.`;
    cell.onclick = () => {
      if (selected) { p.autocastSpell = null; msg('You stop autocasting.'); renderPanel(); return; }
      if (!hasLevel) { msg(`You need a Magic level of ${sp.level} to cast ${sp.name}.`); return; }
      if (!hasRunes) { msg("You don't have enough runes to cast this spell."); return; }
      p.autocastSpell = sp.id;
      msg(`You prepare to cast ${sp.name}.`);
      renderPanel();
    };
    list.appendChild(cell);
  }
  panel.appendChild(list);
  const note = document.createElement('div');
  note.className = 'panel-note';
  note.textContent = 'Select a spell to autocast it in combat.';
  panel.appendChild(note);
}

// ---------------- Music tab ----------------
function renderMusic(panel: HTMLElement) {
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'Music Player';
  panel.appendChild(title);
  const list = document.createElement('div');
  list.className = 'music-list';
  for (const t of TRACKS) {
    const el = document.createElement('div');
    const unlocked = audio.unlocked.has(t.name);
    el.className = 'music-track' + (unlocked ? ' unlocked' : '') + (audio.current?.name === t.name ? ' playing' : '');
    el.textContent = t.name;
    el.onclick = () => {
      if (!unlocked) { msg('You have not unlocked this music track yet.'); return; }
      audio.play(t, true); // manual pick locks against region auto-switch
    };
    list.appendChild(el);
  }
  panel.appendChild(list);
  const now = document.createElement('div');
  now.className = 'music-now';
  now.textContent = audio.current ? `Now playing: ${audio.current.name}` : 'No track playing';
  panel.appendChild(now);
  const ctr = document.createElement('div');
  ctr.className = 'music-controls';
  const stop = document.createElement('button');
  stop.textContent = 'Stop';
  stop.onclick = () => audio.stop();
  ctr.appendChild(stop);
  panel.appendChild(ctr);
  const note = document.createElement('div');
  note.className = 'panel-note';
  note.textContent = `${audio.unlocked.size}/${TRACKS.length} tracks unlocked. Explore to unlock more.`;
  panel.appendChild(note);
}

// ---------------- Settings ----------------
function renderFriends(panel: HTMLElement) {
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'Friends';
  panel.appendChild(title);

  const addRow = document.createElement('div');
  addRow.className = 'setting-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 12;
  input.placeholder = 'Username';
  input.style.cssText = 'flex:1;padding:3px 6px;background:#1b1610;color:#e8dcc0;border:1px solid #6b5a36;border-radius:3px;font:inherit;';
  const addBtn = document.createElement('button');
  addBtn.className = 'mini-btn';
  addBtn.textContent = 'Add';
  addBtn.onclick = () => {
    const name = input.value.trim();
    if (name) void addFriend(name).then((ok) => { if (ok) input.value = ''; });
  };
  addRow.appendChild(input);
  addRow.appendChild(addBtn);
  panel.appendChild(addRow);

  if (!friends.loaded) void loadFriends();

  if (friends.list.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'panel-hint';
    empty.textContent = 'No friends yet. Add someone or right-click a player.';
    panel.appendChild(empty);
  } else {
    const list = document.createElement('div');
    list.className = 'friends-list';
    for (const f of friends.list) {
      const row = document.createElement('div');
      row.className = 'friend-row';
      const dot = document.createElement('span');
      dot.className = 'friend-dot' + (f.online ? ' online' : '');
      dot.title = f.online ? 'Online' : 'Offline';
      const name = document.createElement('span');
      name.className = 'friend-name';
      name.textContent = f.username;
      const rm = document.createElement('button');
      rm.className = 'mini-btn';
      rm.textContent = '×';
      rm.title = 'Remove friend';
      rm.onclick = () => { void removeFriend(f.username); };
      row.appendChild(dot);
      row.appendChild(name);
      row.appendChild(rm);
      list.appendChild(row);
    }
    panel.appendChild(list);
  }

  renderGuildSection(panel);
}

// ---------------- Guild section (friends tab) ----------------
function renderGuildSection(panel: HTMLElement) {
  const title = document.createElement('div');
  title.className = 'panel-title guild-title';
  title.textContent = 'Guild';
  panel.appendChild(title);

  if (!guild.loaded) void loadGuild();
  const g = guild.info;

  if (!g) {
    const hint = document.createElement('div');
    hint.className = 'panel-hint';
    hint.textContent = `Found a guild for ${GUILD_COST.toLocaleString()} coins, or wait for an invitation.`;
    panel.appendChild(hint);

    const nameRow = document.createElement('div');
    nameRow.className = 'setting-row';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.maxLength = 24;
    nameInput.placeholder = 'Guild name';
    nameInput.className = 'guild-input';
    nameRow.appendChild(nameInput);
    panel.appendChild(nameRow);

    const tagRow = document.createElement('div');
    tagRow.className = 'setting-row';
    const tagInput = document.createElement('input');
    tagInput.type = 'text';
    tagInput.maxLength = 5;
    tagInput.placeholder = 'Tag (3-5)';
    tagInput.className = 'guild-input';
    tagInput.style.width = '70px';
    const createBtn = document.createElement('button');
    createBtn.className = 'mini-btn';
    createBtn.textContent = `Create (${(GUILD_COST / 1000)}k)`;
    createBtn.onclick = () => {
      const name = nameInput.value.trim();
      const tag = tagInput.value.trim();
      if (name.length < 3) { msg('Guild name must be at least 3 characters.'); return; }
      if (tag.length < 3) { msg('Guild tag must be 3-5 letters or numbers.'); return; }
      void createGuild(name, tag).then((ok) => { if (ok) renderPanel(); });
    };
    tagRow.appendChild(tagInput);
    tagRow.appendChild(createBtn);
    panel.appendChild(tagRow);
    return;
  }

  const head = document.createElement('div');
  head.className = 'guild-head';
  head.textContent = `${g.name} [${g.tag}]`;
  head.title = `You are ${g.rank === 'leader' ? 'the leader' : `an ${g.rank}` } of this guild.`;
  panel.appendChild(head);

  const myRank = g.rank;
  const canInvite = myRank !== 'member';

  if (canInvite) {
    const invRow = document.createElement('div');
    invRow.className = 'setting-row';
    const invInput = document.createElement('input');
    invInput.type = 'text';
    invInput.maxLength = 12;
    invInput.placeholder = 'Invite player';
    invInput.className = 'guild-input';
    const invBtn = document.createElement('button');
    invBtn.className = 'mini-btn';
    invBtn.textContent = 'Invite';
    invBtn.onclick = () => {
      const n = invInput.value.trim();
      if (n) { void guildInvite(n); invInput.value = ''; }
    };
    invRow.appendChild(invInput);
    invRow.appendChild(invBtn);
    panel.appendChild(invRow);
  }

  const list = document.createElement('div');
  list.className = 'friends-list guild-roster';
  for (const m of g.roster) {
    const row = document.createElement('div');
    row.className = 'friend-row';
    const dot = document.createElement('span');
    dot.className = 'friend-dot' + (m.online ? ' online' : '');
    dot.title = m.online ? 'Online' : 'Offline';
    const name = document.createElement('span');
    name.className = 'friend-name';
    name.textContent = m.username;
    const rank = document.createElement('span');
    rank.className = 'guild-rank guild-rank-' + m.rank;
    rank.textContent = m.rank === 'leader' ? '★' : m.rank === 'officer' ? '◆' : '';
    rank.title = m.rank;
    row.appendChild(dot);
    row.appendChild(name);
    row.appendChild(rank);
    const isSelf = !!net.username && m.username.toLowerCase() === net.username.toLowerCase();
    row.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      const opts: MenuOption[] = [];
      if (!isSelf) {
        const canKick = (myRank === 'leader' && m.rank !== 'leader')
          || (myRank === 'officer' && m.rank === 'member');
        if (canKick) opts.push({ label: 'Kick', target: m.username, fn: () => { void guildKick(m.username); } });
        if (myRank === 'leader') {
          if (m.rank === 'member') opts.push({ label: 'Promote to officer', target: m.username, fn: () => { void guildPromote(m.username, 'officer'); } });
          if (m.rank === 'officer') {
            opts.push({ label: 'Demote to member', target: m.username, fn: () => { void guildPromote(m.username, 'member'); } });
            opts.push({ label: 'Make leader', target: m.username, fn: () => { void guildPromote(m.username, 'leader'); } });
          }
        }
        if (!isFriend(m.username)) opts.push({ label: 'Add friend', target: m.username, fn: () => { void addFriend(m.username); } });
      }
      if (opts.length) showContextMenu(e.clientX, e.clientY, opts);
    };
    list.appendChild(row);
  }
  panel.appendChild(list);

  if (myRank === 'leader') {
    const toggleRow = document.createElement('div');
    toggleRow.className = 'setting-row';
    toggleRow.innerHTML = '<span>Members deposit-only</span>';
    const tog = document.createElement('button');
    tog.className = 'mini-btn';
    tog.style.width = '50px';
    tog.textContent = g.memberDepositOnly ? 'On' : 'Off';
    tog.onclick = () => { void guildSetDepositOnly(!g.memberDepositOnly); };
    toggleRow.appendChild(tog);
    panel.appendChild(toggleRow);
  }

  const btnRow = document.createElement('div');
  btnRow.className = 'setting-row';
  const chatBtn = document.createElement('button');
  chatBtn.className = 'mini-btn';
  chatBtn.textContent = 'Guild chat';
  chatBtn.title = "Type '/g message' in the chat box";
  chatBtn.onclick = () => {
    const input = $('chat-input') as HTMLInputElement;
    input.value = '/g ';
    input.focus();
  };
  const leaveBtn = document.createElement('button');
  leaveBtn.className = 'mini-btn';
  leaveBtn.textContent = 'Leave guild';
  leaveBtn.onclick = () => { void guildLeave().then(() => renderPanel()); };
  btnRow.appendChild(chatBtn);
  btnRow.appendChild(leaveBtn);
  panel.appendChild(btnRow);

  const note = document.createElement('div');
  note.className = 'panel-hint';
  note.textContent = 'The guild vault stands beside the Aldgate bank.';
  panel.appendChild(note);
}

function renderSettings(panel: HTMLElement) {
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'Settings';
  panel.appendChild(title);

  const mkSlider = (label: string, value: number, fn: (v: number) => void) => {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `<span>${label}</span>`;
    const input = document.createElement('input');
    input.type = 'range'; input.min = '0'; input.max = '100'; input.value = String(Math.round(value * 100));
    input.oninput = () => fn(parseInt(input.value) / 100);
    row.appendChild(input);
    panel.appendChild(row);
  };
  mkSlider('Music volume', musicVol, (v) => { musicVol = v; audio.setMusicVolume(v); saveVolumes(); });
  mkSlider('Sound effects', sfxVol, (v) => { sfxVol = v; audio.setSfxVolume(v); saveVolumes(); });

  const runRow = document.createElement('div');
  runRow.className = 'setting-row';
  runRow.innerHTML = `<span>Run mode</span>`;
  const btn = document.createElement('button');
  btn.className = 'mini-btn';
  btn.style.width = '80px';
  btn.textContent = state.player.run ? 'On' : 'Off';
  btn.onclick = () => { state.player.run = !state.player.run; btn.textContent = state.player.run ? 'On' : 'Off'; updateOrbs(); };
  runRow.appendChild(btn);
  panel.appendChild(runRow);

  const save = document.createElement('button');
  save.className = 'style-btn';
  save.textContent = 'Save game';
  save.onclick = () => { saveGame(); msg('Your game has been saved.'); };
  panel.appendChild(save);

  const reset = document.createElement('button');
  reset.className = 'style-btn danger' + (resetArmed ? ' selected' : '');
  reset.innerHTML = resetArmed ? 'Confirm reset?<small>Click again to erase your save</small>' : 'Reset save<small>Erases all progress</small>';
  reset.onclick = () => {
    if (!resetArmed) { resetArmed = true; renderPanel(); return; }
    resetArmed = false;
    resetSave();
  };
  panel.appendChild(reset);
  if (resetArmed) {
    const cancel = document.createElement('button');
    cancel.className = 'mini-btn';
    cancel.textContent = 'Cancel reset';
    cancel.onclick = () => { resetArmed = false; renderPanel(); };
    panel.appendChild(cancel);
  }
}

// ---------------- Chat ----------------
function buildChatTabs() {
  const row = $('chat-tabs');
  row.innerHTML = '';
  const tabs: { id: typeof chatFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'game', label: 'Game' },
    { id: 'public', label: 'Public' },
  ];
  for (const t of tabs) {
    const el = document.createElement('div');
    el.className = 'chat-tab' + (chatFilter === t.id ? ' active' : '');
    el.textContent = t.label;
    el.onclick = () => { chatFilter = t.id; buildChatTabs(); rerenderChat(); };
    row.appendChild(el);
  }
}

function chatVisible(cls: string): boolean {
  if (chatFilter === 'all') return true;
  if (chatFilter === 'public') return cls === 'player-msg' || cls === 'guild-msg';
  return cls !== 'player-msg' && cls !== 'guild-msg'; // 'game' filter: everything but chat
}

function addChatLine(text: string, cls: string) {
  chatLog.push({ text, cls });
  while (chatLog.length > 150) chatLog.shift();
  // mobile-full: flash the collapsed chat pill so new lines get noticed
  if (document.body.classList.contains('mobile-full') && !document.body.classList.contains('chat-open')) {
    const cb = document.getElementById('chatbox');
    if (cb) {
      cb.classList.remove('chat-flash');
      void cb.offsetWidth; // restart the animation
      cb.classList.add('chat-flash');
      window.setTimeout(() => cb.classList.remove('chat-flash'), 750);
    }
  }
  if (!chatVisible(cls)) return;
  const box = $('chat-messages');
  appendChatEl(box, text, cls);
  while (box.children.length > 100) box.removeChild(box.firstChild!);
  box.scrollTop = box.scrollHeight;
}

function appendChatEl(box: HTMLElement, text: string, cls: string) {
  const line = document.createElement('div');
  line.className = 'chat-line ' + cls;
  line.textContent = text;
  box.appendChild(line);
}

function rerenderChat() {
  const box = $('chat-messages');
  box.innerHTML = '';
  for (const m of chatLog) if (chatVisible(m.cls)) appendChatEl(box, m.text, m.cls);
  box.scrollTop = box.scrollHeight;
}

function bindChat() {
  const input = $('chat-input') as HTMLInputElement;
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && input.value.trim()) {
      const text = input.value.trim();
      // '/g ' lines go to the guild channel; the server echoes them back to
      // every member (including us), so skip the local public echo.
      if (!/^\/g(\s|$)/i.test(text)) {
        const name = state.player?.name ?? 'Adventurer';
        addChatLine(`${name}: ${text}`, 'player-msg');
      } else if (!guild.info) {
        addChatLine('You are not in a guild.', 'game');
      }
      input.value = '';
    }
  });
}

// ---------------- Dialogue overlay ----------------
function renderDialogue() {
  const box = $('dialogue-overlay');
  const d = state.dialogue;
  if (!d) { box.style.display = 'none'; box.innerHTML = ''; return; }
  box.style.display = 'flex';
  box.innerHTML = '';
  if (d.options) {
    const title = document.createElement('div');
    title.className = 'dlg-speaker';
    title.textContent = 'Select an option';
    box.appendChild(title);
    d.options.forEach((opt, i) => {
      const el = document.createElement('div');
      el.className = 'dlg-option';
      el.textContent = `${i + 1}. ${opt.label}`;
      el.onclick = () => chooseOption(i);
      box.appendChild(el);
    });
    return;
  }
  const line = d.lines[d.idx];
  if (!line) { box.style.display = 'none'; return; }
  const speaker = document.createElement('div');
  speaker.className = 'dlg-speaker';
  speaker.textContent = line.speaker;
  box.appendChild(speaker);
  const text = document.createElement('div');
  text.className = 'dlg-text';
  text.textContent = line.text;
  box.appendChild(text);
  const cont = document.createElement('div');
  cont.className = 'dlg-continue';
  cont.textContent = 'Click here to continue';
  cont.onclick = () => advanceDialogue();
  box.appendChild(cont);
  box.onclick = (e) => { if (e.target === box) advanceDialogue(); };
}

function bindKeys() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (makeCancel) { cancelMake(); return; }
      if (state.usingSlot !== null) { clearUsing(); return; }
    }
    // number keys pick dialogue options; space advances
    const d = state.dialogue;
    if (!d) return;
    if (d.options) {
      const n = parseInt(e.key);
      if (n >= 1 && n <= d.options.length) chooseOption(n - 1);
    } else if (e.key === ' ' || e.key === 'Enter') {
      if ((e.target as HTMLElement)?.id !== 'chat-input') advanceDialogue();
    }
  });
}

// ---------------- Make-X picker ----------------
let makeCancel: (() => void) | null = null;

function cancelMake() { makeCancel?.(); }

function showMakePicker(opts: MakeOption[], cb: (id: string | null, qty: number) => void) {
  const strip = $('make-strip');
  let finished = false;
  const finish = (id: string | null, qty: number) => {
    if (finished) return;
    finished = true;
    makeCancel = null;
    strip.style.display = 'none';
    strip.innerHTML = '';
    cb(id, qty);
  };
  makeCancel = () => finish(null, 0);

  let selected: string | null = null;

  const draw = () => {
    strip.innerHTML = '';
    strip.style.display = 'flex';
    const title = document.createElement('div');
    title.className = 'make-title';
    title.textContent = selected ? 'How many would you like to make?' : 'What would you like to make?';
    strip.appendChild(title);

    const row = document.createElement('div');
    row.className = 'make-row';
    for (const o of opts) {
      const cell = document.createElement('div');
      cell.className = 'make-opt'
        + (o.disabled ? ' disabled' : '')
        + (selected === o.id ? ' selected' : '');
      try { cell.appendChild(copyCanvas(itemIcon(o.icon))); } catch { /* unknown icon id */ }
      const lab = document.createElement('div');
      lab.className = 'make-label';
      lab.textContent = o.label;
      cell.appendChild(lab);
      cell.title = o.disabled ? `${o.label}\n${o.disabled}` : o.label;
      if (!o.disabled) {
        cell.onclick = () => { selected = o.id; draw(); };
      }
      row.appendChild(cell);
    }
    strip.appendChild(row);

    if (selected) {
      const qtys = document.createElement('div');
      qtys.className = 'make-qtys';
      for (const [label, qty] of [['1', 1], ['5', 5], ['All', 28]] as const) {
        const b = document.createElement('button');
        b.className = 'mini-btn';
        b.textContent = label;
        b.onclick = () => finish(selected, qty);
        qtys.appendChild(b);
      }
      strip.appendChild(qtys);
    }

    const close = document.createElement('div');
    close.className = 'make-close';
    close.textContent = 'X';
    close.title = 'Cancel';
    close.onclick = () => finish(null, 0);
    strip.appendChild(close);
  };
  strip.oncontextmenu = (e) => { e.preventDefault(); finish(null, 0); };
  draw();
}

// ---------------- XP drops + active-skill tracker ----------------
let trackedSkill: SkillName | null = null;

function showXpDrop(skill: SkillName, amount: number) {
  // Owner rule: Hitpoints XP is awarded silently — never a floating popup and
  // never retargets the tracker. If the tracker IS on Hitpoints, keep its
  // numbers fresh (onStatsChange also refreshes it; this is belt-and-braces).
  if (skill === 'Hitpoints') { updateXpTracker(); return; }
  const wrap = $('xp-drops');
  const el = document.createElement('div');
  el.className = 'xp-drop';
  const icon = copyCanvas(skillIcon(skill));
  icon.style.verticalAlign = 'middle';
  el.appendChild(icon);
  el.appendChild(document.createTextNode(' +' + (Math.round(amount * 10) / 10)));
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 2200);

  trackedSkill = skill;
  updateXpTracker();
}

// progress through the current level, 0..1
function levelProgress(skill: SkillName): number {
  const lvl = level(skill);
  if (lvl >= 99) return 1;
  const xp = state.player.xp[skillIdx(skill)];
  const lo = XP_TABLE[lvl], hi = XP_TABLE[lvl + 1];
  return Math.max(0, Math.min(1, (xp - lo) / (hi - lo)));
}

function updateXpTracker() {
  const el = document.getElementById('xp-tracker');
  if (!el) return;
  if (!trackedSkill) { el.style.display = 'none'; return; }
  const skill = trackedSkill;
  const lvl = level(skill);
  const xp = Math.floor(state.player.xp[skillIdx(skill)]);
  const pct = levelProgress(skill) * 100;
  const remaining = lvl < 99 ? XP_TABLE[lvl + 1] - xp : 0;
  el.style.display = 'block';
  el.innerHTML = '';
  const row = document.createElement('div');
  row.className = 'xpt-row';
  row.appendChild(copyCanvas(skillIcon(skill)));
  const label = document.createElement('span');
  label.textContent = `${skill} XP: ${xp.toLocaleString()}`;
  row.appendChild(label);
  el.appendChild(row);
  const bar = document.createElement('div');
  bar.className = 'xpt-bar';
  bar.innerHTML = `<div class="xpt-fill" style="width:${pct.toFixed(1)}%"></div>`;
  el.appendChild(bar);
  el.title = lvl < 99
    ? `${skill} — level ${lvl}\n${remaining.toLocaleString()} xp to level ${lvl + 1}`
    : `${skill} — level 99`;
}

// ---------------- Orbs ----------------
// Threshold classes recolor both the number and the orb fill (see style.css):
// >50% green, 25-50% yellow, <=25% red.
function setOrbLevel(el: HTMLElement, frac: number) {
  el.classList.toggle('orb-high', frac > 0.5);
  el.classList.toggle('orb-mid', frac <= 0.5 && frac > 0.25);
  el.classList.toggle('orb-low', frac <= 0.25);
}

function updateOrbs() {
  const p = state.player;
  if (!p) return;
  const hpOrb = $('orb-hp');
  const hp = hpOrb.querySelector('.orb-num') as HTMLElement;
  hp.textContent = String(Math.max(0, p.curHp));
  setOrbLevel(hpOrb, p.curHp / Math.max(1, level('Hitpoints')));
  const prayOrb = $('orb-prayer');
  const pray = prayOrb.querySelector('.orb-num') as HTMLElement;
  pray.textContent = String(Math.max(0, p.prayerPoints));
  setOrbLevel(prayOrb, p.prayerPoints / Math.max(1, level('Prayer')));
  prayOrb.classList.toggle('on', p.activePrayers.size > 0);
  const runOrb = $('orb-run');
  runOrb.querySelector('.orb-num')!.textContent = String(Math.floor(p.energy));
  setOrbLevel(runOrb, p.energy / 100);
  runOrb.classList.toggle('on', p.run);
}

function bindOrbs() {
  $('orb-run').onclick = () => { state.player.run = !state.player.run; updateOrbs(); };
  $('orb-prayer').onclick = () => { activeTab = 'prayer'; buildTabs(); renderPanel(); };
  $('orb-prayer').style.cursor = 'pointer';
}

// ---------------- Viewport interaction ----------------
interface MenuOption { label: string; target: string; lvl?: string; fn: () => void; }

function usingItemName(): string | null {
  if (state.usingSlot === null) return null;
  const it = state.player.inventory[state.usingSlot];
  return it ? ITEMS[it.id].name : null;
}

function optionsAt(tx: number, ty: number): MenuOption[] {
  const opts: MenuOption[] = [];
  const usingName = usingItemName();
  const usingSlot = state.usingSlot;

  // object on tile (resolved early so 'Use ->' can lead the list)
  const o = objectAt.get(key(tx, ty)) ?? objects.find((ob) => ob.x === tx && ob.y === ty) ?? null;

  // 'Use <selected> -> <target>' goes first when an item is selected
  if (usingName !== null && usingSlot !== null && o) {
    const renderType = o.depletedUntil > 0 ? (o.depletedAs ?? o.type) : o.type;
    const def = OBJS[renderType] ?? OBJS[o.type];
    if (def) {
      const obj = o;
      opts.push({
        label: `Use ${usingName} ->`, target: def.name,
        fn: () => { clearUsing(); useItemOnObject(usingSlot, obj); },
      });
    }
  }

  // other players on tile
  for (const rp of state.remotePlayers) {
    if (rp.x !== tx || rp.y !== ty || rp.dead) continue;
    if (ENABLE_PVP) {
      // PvP disabled: the attack option stays dormant behind the switch
      opts.push({
        label: 'Attack', target: rp.name,
        lvl: rp.cb ? `(level-${rp.cb})` : undefined,
        fn: () => attackPlayer(rp.name),
      });
    }
    opts.push({
      label: 'Trade with', target: rp.name,
      fn: () => requestTrade(rp.name),
    });
    if (!isFriend(rp.name)) {
      opts.push({
        label: 'Add friend', target: rp.name,
        fn: () => { void addFriend(rp.name); },
      });
    }
    opts.push({
      label: 'Coinflip', target: rp.name,
      fn: () => { openCoinflip(rp.name); },
    });
    opts.push({ label: 'Examine', target: rp.name, fn: () => msg(`It's ${rp.name}.`, 'examine') });
  }

  // NPCs on tile
  for (const n of state.npcs) {
    if (n.dead || n.x !== tx || n.y !== ty) continue;
    const def = n.def;
    for (const a of npcActions.get(def.id) ?? []) {
      opts.push({ label: a.option, target: def.name, fn: () => interactWithNpc(n, a.option) });
    }
    if (def.attackable) {
      opts.push({
        label: 'Attack', target: def.name, lvl: `(level-${def.combatLevel})`,
        fn: () => attackNpc(n),
      });
    }
    opts.push({ label: 'Examine', target: def.name, fn: () => msg(def.examine, 'examine') });
  }

  // ground items — most valuable stack first so left-click takes the best loot
  const giHere = state.groundItems.filter((gi) => gi.x === tx && gi.y === ty && ITEMS[gi.item]);
  giHere.sort((a, b) => (ITEMS[b.item].value * b.qty) - (ITEMS[a.item].value * a.qty));
  for (const gi of giHere) {
    const def = ITEMS[gi.item];
    opts.push({ label: 'Take', target: def.name, fn: () => pickupItem(gi) });
    opts.push({ label: 'Examine', target: def.name, fn: () => msg(itemExamine(gi.item), 'examine') });
  }

  // object actions
  if (o) {
    if (o.depletedUntil > 0) {
      const def = OBJS[o.depletedAs ?? o.type] ?? OBJS[o.type];
      if (def) opts.push({ label: 'Examine', target: def.name, fn: () => msg(def.examine, 'examine') });
    } else {
      const def = OBJS[o.type];
      if (def) {
        for (const a of objectActions.get(o.type) ?? []) {
          opts.push({ label: a.option, target: def.name, fn: () => interactWithObject(o, a.option) });
        }
        opts.push({ label: 'Examine', target: def.name, fn: () => msg(def.examine, 'examine') });
      }
    }
  }

  opts.push({ label: 'Walk here', target: '', fn: () => walkTo(tx, ty) });
  return opts;
}

function bindViewport() {
  const vp = $('viewport');
  const hover = $('hover-text');

  vp.addEventListener('mousemove', (e) => {
    const { x, y } = screenToTile(e.clientX, e.clientY);
    const usingName = usingItemName();
    const opts = optionsAt(x, y);
    const first = opts[0];
    if (usingName !== null) {
      const tgt = first && first.label !== 'Walk here'
        ? (first.label.startsWith('Use ') ? first.target : `${first.target}`)
        : '...';
      hover.innerHTML = `<span class="opt">Use</span> <span style="color:#ff8c38">${esc(usingName)}</span> <span class="opt">with</span> <span style="color:#ff0">${esc(tgt)}</span>`;
      return;
    }
    if (first && first.label !== 'Walk here') {
      hover.innerHTML = `<span class="opt">${esc(first.label)}</span> <span style="color:#ff0">${esc(first.target)}</span> ${first.lvl ? `<span style="color:#0f0">${esc(first.lvl)}</span>` : ''}`
        + (opts.length > 2 ? ' <span style="color:#fff">/ ' + (opts.length - 1) + ' more options</span>' : '');
    } else {
      hover.innerHTML = `<span class="opt">Walk here</span>`;
    }
  });
  vp.addEventListener('mouseleave', () => { hover.innerHTML = ''; });

  vp.addEventListener('click', (e) => {
    hideContextMenu();
    const { x, y } = screenToTile(e.clientX, e.clientY);
    if (state.usingSlot !== null) {
      const usingSlot = state.usingSlot;
      const o = objectAt.get(key(x, y)) ?? objects.find((ob) => ob.x === x && ob.y === y) ?? null;
      clearUsing();
      if (o) useItemOnObject(usingSlot, o);
      else walkTo(x, y);
      return;
    }
    const opts = optionsAt(x, y);
    opts[0]?.fn();
  });

  vp.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const { x, y } = screenToTile(e.clientX, e.clientY);
    showContextMenu(e.clientX, e.clientY, optionsAt(x, y));
  });
}

function bindMinimap() {
  $('minimap').addEventListener('click', (e) => {
    const t = minimapClickToTile(e as MouseEvent);
    if (t) walkTo(t.x, t.y);
  });
}

// ---------------- Context menu ----------------
function showContextMenu(px: number, py: number, opts: MenuOption[]) {
  const menu = $('context-menu');
  menu.innerHTML = `<div class="cm-title">Choose Option</div>`;
  for (const o of opts) {
    const el = document.createElement('div');
    el.className = 'cm-opt';
    el.innerHTML = `${esc(o.label)} <span class="tgt">${esc(o.target)}</span>${o.lvl ? ` <span class="lvl">${esc(o.lvl)}</span>` : ''}`;
    el.onclick = () => { hideContextMenu(); o.fn(); };
    menu.appendChild(el);
  }
  const cancel = document.createElement('div');
  cancel.className = 'cm-opt';
  cancel.textContent = 'Cancel';
  cancel.onclick = hideContextMenu;
  menu.appendChild(cancel);
  menu.style.display = 'block';
  const rect = menu.getBoundingClientRect();
  menu.style.left = Math.max(2, Math.min(px - rect.width / 2, window.innerWidth - rect.width - 4)) + 'px';
  menu.style.top = Math.max(2, Math.min(py - 8, window.innerHeight - rect.height - 4)) + 'px';
}

function hideContextMenu() { $('context-menu').style.display = 'none'; }
document.addEventListener('click', (e) => {
  if (!(e.target as HTMLElement).closest('#context-menu')) hideContextMenu();
});

// ---------------- Bank / shop modals ----------------
function renderModals() {
  const layer = $('modal-layer');
  if (state.bankOpen) return renderBank(layer);
  if (state.shopOpen) return renderShop(layer, state.shopOpen);
  if (tradeView) return renderTrade(layer);
  if (vaultOpen) return renderVault(layer);
  layer.style.display = 'none';
  layer.innerHTML = '';
}

function modalShell(layer: HTMLElement, title: string, onClose: () => void): HTMLElement {
  layer.style.display = 'block';
  layer.innerHTML = '';
  const modal = document.createElement('div');
  modal.className = 'game-modal';
  const frame = $('frame').getBoundingClientRect();
  modal.style.left = frame.left + 30 + 'px';
  modal.style.top = frame.top + 50 + 'px';
  modal.innerHTML = `<h2>${esc(title)}</h2>`;
  const close = document.createElement('div');
  close.className = 'modal-close';
  close.textContent = 'X';
  close.onclick = onClose;
  modal.appendChild(close);
  layer.appendChild(modal);
  return modal;
}

function promptQty(label: string): number {
  const raw = window.prompt(label, '1');
  const n = parseInt(raw ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function renderBank(layer: HTMLElement) {
  const modal = modalShell(layer, 'The Bank of Larpscape', () => { state.bankOpen = false; renderModals(); });
  const grid = document.createElement('div');
  grid.className = 'modal-grid';
  let bankValue = 0;
  state.player.bank.forEach((b, i) => {
    const def = ITEMS[b.id];
    bankValue += (def?.value ?? 0) * b.qty;
    const slot = document.createElement('div');
    slot.className = 'modal-slot';
    slot.appendChild(copyCanvas(itemIcon(b.id)));
    const q = document.createElement('span');
    q.className = 'inv-qty';
    q.textContent = fmtQty(b.qty);
    slot.appendChild(q);
    slot.title = `${def?.name ?? b.id} x ${b.qty.toLocaleString()}`;
    slot.onclick = () => bankWithdraw(i, 1);
    slot.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      const name = def?.name ?? b.id;
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Withdraw-1', target: name, fn: () => bankWithdraw(i, 1) },
        { label: 'Withdraw-5', target: name, fn: () => bankWithdraw(i, 5) },
        { label: 'Withdraw-All', target: name, fn: () => bankWithdraw(i, 'all') },
        { label: 'Withdraw-X', target: name, fn: () => { const n = promptQty('Withdraw how many?'); if (n) bankWithdraw(i, n); } },
        { label: 'Examine', target: name, fn: () => msg(itemExamine(b.id), 'examine') },
      ]);
    };
    grid.appendChild(slot);
  });
  modal.appendChild(grid);
  const value = document.createElement('div');
  value.className = 'bank-value';
  value.textContent = `Bank value: ${bankValue.toLocaleString()} coins`;
  modal.appendChild(value);
  const hint = document.createElement('div');
  hint.className = 'modal-hint';
  hint.textContent = 'Left-click to withdraw 1; right-click for 1/5/All/X. Items below: click to deposit 1, right-click for more.';
  modal.appendChild(hint);
  modal.appendChild(makeInvStrip(
    (slot) => bankDeposit(slot, 1),
    (e, slot) => {
      const it = state.player.inventory[slot];
      if (!it) return;
      const name = ITEMS[it.id].name;
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Deposit-1', target: name, fn: () => bankDeposit(slot, 1) },
        { label: 'Deposit-5', target: name, fn: () => bankDeposit(slot, 5) },
        { label: 'Deposit-All', target: name, fn: () => bankDeposit(slot, 'all') },
        { label: 'Deposit-X', target: name, fn: () => { const n = promptQty('Deposit how many?'); if (n) bankDeposit(slot, n); } },
      ]);
    },
  ));
}

function renderShop(layer: HTMLElement, shopId: string) {
  const shopName = SHOPS[shopId]?.name ?? 'Shop';
  const modal = modalShell(layer, shopName, () => { state.shopOpen = null; renderModals(); });
  const grid = document.createElement('div');
  grid.className = 'modal-grid';
  for (const s of getShopStock(shopId)) {
    const def = ITEMS[s.item];
    if (!def) continue;
    const slot = document.createElement('div');
    slot.className = 'modal-slot' + (s.qty <= 0 ? ' empty-stock' : '');
    slot.appendChild(copyCanvas(itemIcon(s.item)));
    const q = document.createElement('span');
    q.className = 'inv-qty';
    q.textContent = fmtQty(s.qty);
    slot.appendChild(q);
    const price = Math.max(1, Math.ceil(def.value));
    slot.title = `${def.name}\nPrice: ${price} coins\nIn stock: ${s.qty}`;
    slot.onclick = () => shopBuy(shopId, s.item);
    slot.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Buy-1', target: def.name, fn: () => shopBuy(shopId, s.item) },
        { label: 'Buy-5', target: def.name, fn: () => { for (let n = 0; n < 5; n++) shopBuy(shopId, s.item); } },
        { label: 'Examine', target: def.name, fn: () => msg(itemExamine(s.item), 'examine') },
      ]);
    };
    grid.appendChild(slot);
  }
  modal.appendChild(grid);
  const hint = document.createElement('div');
  hint.className = 'modal-hint';
  hint.textContent = 'Click stock to buy 1 (right-click: buy 5). Your items below: click to sell 1, right-click for 1/5/All.';
  modal.appendChild(hint);

  const sellMany = (slot: number, count: number | 'all') => {
    const it = state.player.inventory[slot];
    if (!it) return;
    const id = it.id;
    if (ITEMS[id].stackable) { shopSell(shopId, slot); return; } // sells the stack
    const slots: number[] = [];
    state.player.inventory.forEach((s, i) => { if (s && s.id === id) slots.push(i); });
    const n = count === 'all' ? slots.length : Math.min(count, slots.length);
    // sell highest indices first so earlier slot indices stay valid
    slots.slice(0, n).reverse().forEach((i) => shopSell(shopId, i));
  };

  modal.appendChild(makeInvStrip(
    (slot) => shopSell(shopId, slot),
    (e, slot) => {
      const it = state.player.inventory[slot];
      if (!it) return;
      const def = ITEMS[it.id];
      const price = Math.max(1, Math.floor(def.value * 0.4));
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Sell-1', target: def.name, lvl: `(${price} gp)`, fn: () => shopSell(shopId, slot) },
        { label: 'Sell-5', target: def.name, fn: () => sellMany(slot, 5) },
        { label: 'Sell-All', target: def.name, fn: () => sellMany(slot, 'all') },
        { label: 'Examine', target: def.name, fn: () => msg(itemExamine(it.id), 'examine') },
      ]);
    },
    (it) => `${ITEMS[it].name}\nSells for: ${Math.max(1, Math.floor(ITEMS[it].value * 0.4))} coins`,
  ));
}

function makeInvStrip(
  onClick: (slot: number) => void,
  onContext?: (e: MouseEvent, slot: number) => void,
  tooltip?: (itemId: string) => string,
): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'modal-grid inv-strip';
  state.player.inventory.forEach((it, i) => {
    const slot = document.createElement('div');
    slot.className = 'modal-slot';
    if (it) {
      slot.appendChild(copyCanvas(itemIcon(it.id)));
      if (it.qty > 1) {
        const q = document.createElement('span');
        q.className = 'inv-qty';
        q.textContent = fmtQty(it.qty);
        slot.appendChild(q);
      }
      slot.title = tooltip ? tooltip(it.id) : ITEMS[it.id].name;
      slot.onclick = () => onClick(i);
      if (onContext) slot.oncontextmenu = (e) => { e.preventDefault(); e.stopPropagation(); onContext(e, i); };
    }
    grid.appendChild(slot);
  });
  return grid;
}

// ---------------- Player trading ----------------
// Two-panel OSRS-style trade window. The server owns the session state; every
// change comes back as a trade_state message and re-renders from scratch.

interface TradeStack { id: string; qty: number }
interface TradeSideView { items: TradeStack[]; coins: number; accepted: boolean; name?: string }
let tradeView: { with: string; screen: 1 | 2; you: TradeSideView; them: TradeSideView } | null = null;
let tradeAcceptBusy = false;

function requestTrade(name: string) {
  if (!net.online) { msg('You are not connected to the server.'); return; }
  if (tradeView) { msg('You are already trading.'); return; }
  sendWs({ t: 'trade_req', to: name });
}

export function showTradeRequest(id: string, from: string) {
  msg(`${from} wishes to trade with you.`, 'player-msg');
  showContextMenu(window.innerWidth / 2, window.innerHeight / 2, [
    { label: 'Trade with', target: from, fn: () => sendWs({ t: 'trade_req_accept', id }) },
    { label: 'Decline trade', target: from, fn: () => sendWs({ t: 'trade_req_decline', id }) },
  ]);
}

export function openTradeWindow(withName: string) {
  tradeView = {
    with: withName, screen: 1,
    you: { items: [], coins: 0, accepted: false },
    them: { items: [], coins: 0, accepted: false },
  };
  tradeAcceptBusy = false;
  renderModals();
}

export function updateTradeState(m: any) {
  if (!tradeView) return;
  if (m.you) tradeView.you = { items: m.you.items ?? [], coins: m.you.coins ?? 0, accepted: !!m.you.accepted };
  if (m.them) tradeView.them = { items: m.them.items ?? [], coins: m.them.coins ?? 0, accepted: !!m.them.accepted, name: m.them.name };
  if (m.screen === 1 || m.screen === 2) {
    if (tradeView.screen !== m.screen) tradeAcceptBusy = false;
    tradeView.screen = m.screen;
  }
  renderModals();
}

export function tradeCancelled(reason: string) {
  if (!tradeView) return;
  tradeView = null;
  msg(reason, 'game');
  renderModals();
}

export function tradeComplete(_m: any) {
  tradeView = null;
  msg('Trade completed.', 'game');
  renderModals();
  setTimeout(() => { void reloadServerOwned(); }, 4500);
}

function offeredCount(id: string): number {
  if (!tradeView) return 0;
  let n = tradeView.you.items.reduce((s, it) => s + (it.id === id ? it.qty : 0), 0);
  if (id === 'coins') n += tradeView.you.coins;
  return n;
}

function sendOffer(items: TradeStack[], coins: number) {
  sendWs({ t: 'trade_set', items, coins });
}

function offerAdd(id: string, qty: number) {
  if (!tradeView || tradeView.screen !== 1) return;
  const held = invCount(id) - offeredCount(id);
  const n = Math.min(qty, Math.max(0, held));
  if (n <= 0) return;
  if (id === 'coins') { sendOffer(tradeView.you.items, tradeView.you.coins + n); return; }
  const items = tradeView.you.items.map((it) => ({ ...it }));
  const cur = items.find((it) => it.id === id);
  if (cur) cur.qty += n; else items.push({ id, qty: n });
  sendOffer(items, tradeView.you.coins);
}

function offerRemove(id: string, qty: number) {
  if (!tradeView || tradeView.screen !== 1) return;
  if (id === 'coins') {
    sendOffer(tradeView.you.items, Math.max(0, tradeView.you.coins - qty));
    return;
  }
  const items: TradeStack[] = [];
  for (const it of tradeView.you.items) {
    if (it.id !== id) { items.push({ ...it }); continue; }
    const left = it.qty - qty;
    if (left > 0) items.push({ id, qty: left });
  }
  sendOffer(items, tradeView.you.coins);
}

function tradeOfferGrid(side: TradeSideView, mine: boolean): HTMLElement {
  const grid = document.createElement('div');
  grid.className = 'trade-grid';
  const entries: TradeStack[] = [...side.items];
  if (side.coins > 0) entries.push({ id: 'coins', qty: side.coins });
  for (const it of entries) {
    const def = ITEMS[it.id];
    const slot = document.createElement('div');
    slot.className = 'modal-slot';
    if (def) slot.appendChild(copyCanvas(itemIcon(it.id)));
    if (it.qty > 1 || def?.stackable) {
      const q = document.createElement('span');
      q.className = 'inv-qty';
      q.textContent = fmtQty(it.qty);
      slot.appendChild(q);
    }
    slot.title = `${def?.name ?? it.id} x ${it.qty.toLocaleString()}`;
    if (mine && tradeView?.screen === 1) {
      slot.onclick = () => offerRemove(it.id, 1);
      slot.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation();
        const name = def?.name ?? it.id;
        showContextMenu(e.clientX, e.clientY, [
          { label: 'Remove-1', target: name, fn: () => offerRemove(it.id, 1) },
          { label: 'Remove-All', target: name, fn: () => offerRemove(it.id, it.qty) },
          { label: 'Remove-X', target: name, fn: () => { const n = promptQty('Remove how many?'); if (n) offerRemove(it.id, n); } },
        ]);
      };
    }
    grid.appendChild(slot);
  }
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'trade-empty';
    empty.textContent = mine ? 'Click items below to offer them.' : 'Nothing offered yet.';
    grid.appendChild(empty);
  }
  return grid;
}

function renderTrade(layer: HTMLElement) {
  const tv = tradeView!;
  const modal = modalShell(layer, `Trading with: ${tv.with}`, () => {
    sendWs({ t: 'trade_decline' });
    tradeView = null;
    renderModals();
  });
  modal.classList.add('trade-modal');

  if (tv.screen === 2) {
    const warn = document.createElement('div');
    warn.className = 'trade-confirm-title';
    warn.textContent = 'Are you sure you want to make this trade?';
    modal.appendChild(warn);
  }

  const cols = document.createElement('div');
  cols.className = 'trade-cols';
  for (const [label, side, mine] of [
    ['Your offer', tv.you, true],
    [`${tv.with}'s offer`, tv.them, false],
  ] as const) {
    const col = document.createElement('div');
    col.className = 'trade-col';
    const head = document.createElement('div');
    head.className = 'trade-col-head';
    head.textContent = label;
    col.appendChild(head);
    col.appendChild(tradeOfferGrid(side, mine));
    const status = document.createElement('div');
    status.className = 'trade-status' + (side.accepted ? ' ok' : '');
    status.textContent = side.accepted
      ? (mine ? 'You have accepted.' : 'Other player has accepted.')
      : (mine ? 'Waiting for you...' : 'Waiting for other player...');
    col.appendChild(status);
    cols.appendChild(col);
  }
  modal.appendChild(cols);

  const note = document.createElement('div');
  note.className = 'modal-hint';
  note.textContent = tv.screen === 1
    ? 'Click inventory items to offer (right-click for amounts). Changing an offer clears both accepts.'
    : 'Check the offers carefully — accepting here completes the trade.';
  modal.appendChild(note);

  const btnRow = document.createElement('div');
  btnRow.className = 'trade-btn-row';
  const accept = document.createElement('button');
  accept.className = 'mini-btn trade-accept';
  accept.textContent = tv.you.accepted ? 'Waiting...' : 'Accept';
  accept.disabled = tv.you.accepted || tradeAcceptBusy;
  accept.onclick = async () => {
    if (!tradeView || tradeView.you.accepted || tradeAcceptBusy) return;
    tradeAcceptBusy = true;
    accept.disabled = true;
    if (tradeView.screen === 2) {
      // flush the live save first so the server validates against fresh data
      await syncSaveNow();
      if (!tradeView) return; // cancelled while flushing
    }
    sendWs({ t: 'trade_accept' });
    tradeAcceptBusy = false;
  };
  const decline = document.createElement('button');
  decline.className = 'mini-btn trade-decline';
  decline.textContent = 'Decline';
  decline.onclick = () => { sendWs({ t: 'trade_decline' }); tradeView = null; renderModals(); };
  btnRow.appendChild(accept);
  btnRow.appendChild(decline);
  modal.appendChild(btnRow);

  if (tv.screen === 1) {
    // inventory strip with already-offered quantities masked out
    const grid = document.createElement('div');
    grid.className = 'modal-grid inv-strip';
    const shownOffered = new Map<string, number>(); // consume offered qty across slots
    state.player.inventory.forEach((it) => {
      const slot = document.createElement('div');
      slot.className = 'modal-slot';
      if (it) {
        const already = shownOffered.get(it.id) ?? 0;
        const offered = offeredCount(it.id);
        const hide = Math.max(0, Math.min(it.qty, offered - already));
        shownOffered.set(it.id, already + hide);
        const shownQty = it.qty - hide;
        if (shownQty > 0) {
          slot.appendChild(copyCanvas(itemIcon(it.id)));
          if (shownQty > 1) {
            const q = document.createElement('span');
            q.className = 'inv-qty';
            q.textContent = fmtQty(shownQty);
            slot.appendChild(q);
          }
          slot.title = ITEMS[it.id].name;
          slot.onclick = () => offerAdd(it.id, 1);
          slot.oncontextmenu = (e) => {
            e.preventDefault(); e.stopPropagation();
            const name = ITEMS[it.id].name;
            showContextMenu(e.clientX, e.clientY, [
              { label: 'Offer-1', target: name, fn: () => offerAdd(it.id, 1) },
              { label: 'Offer-5', target: name, fn: () => offerAdd(it.id, 5) },
              { label: 'Offer-All', target: name, fn: () => offerAdd(it.id, invCount(it.id)) },
              { label: 'Offer-X', target: name, fn: () => { const n = promptQty('Offer how many?'); if (n) offerAdd(it.id, n); } },
            ]);
          };
        }
      }
      grid.appendChild(slot);
    });
    modal.appendChild(grid);
  }
}

// ---------------- Guild vault ----------------
// Shared item store backed by guild_vault, reusing the bank modal pattern.
// Deposits remove items client-side first (GE trust model); withdrawals are
// granted (and clamped) by the server before the items appear.

interface VaultData {
  items: { item: string; qty: number }[];
  canWithdraw: boolean;
  memberDepositOnly: boolean;
  rank: string;
}
let vaultOpen = false;
let vaultData: VaultData | null = null;
let vaultBusy = false;

export function openGuildVault() {
  vaultOpen = true;
  vaultData = null;
  renderModals();
  refreshGuildVault();
}

export function refreshGuildVault() {
  if (!vaultOpen) return;
  net.api('/api/guild/vault')
    .then((res) => {
      if (!vaultOpen) return;
      vaultData = {
        items: Array.isArray(res?.items) ? res.items : [],
        canWithdraw: !!res?.canWithdraw,
        memberDepositOnly: !!res?.memberDepositOnly,
        rank: String(res?.rank ?? 'member'),
      };
      renderModals();
    })
    .catch((e) => {
      vaultOpen = false;
      msg(String(e?.message || 'Could not open the vault.'), 'game');
      renderModals();
    });
}

function vaultDeposit(itemId: string, qty: number) {
  if (vaultBusy) return;
  const n = Math.min(qty, invCount(itemId));
  if (n <= 0) return;
  vaultBusy = true;
  net.api('/api/guild/vault/deposit', { item: itemId, qty: n })
    .then(async () => { await reloadServerOwned(); return refreshGuildVault(); })
    .catch((e) => msg(String(e?.message || 'Deposit failed.'), 'game'))
    .finally(() => { vaultBusy = false; });
}

function vaultWithdraw(itemId: string, qty: number) {
  if (vaultBusy) return;
  const def = ITEMS[itemId];
  if (!def) return;
  const space = def.stackable
    ? (invCount(itemId) > 0 || freeSlots() > 0 ? qty : 0)
    : Math.min(qty, freeSlots());
  if (space <= 0) { msg("You don't have enough inventory space."); return; }
  vaultBusy = true;
  net.api('/api/guild/vault/withdraw', { item: itemId, qty: space })
    .then(async () => { await reloadServerOwned(); return refreshGuildVault(); })
    .catch((e) => msg(String(e?.message || 'Withdraw failed.'), 'game'))
    .finally(() => { vaultBusy = false; });
}

function renderVault(layer: HTMLElement) {
  const gname = guild.info ? `${guild.info.name} [${guild.info.tag}]` : 'Guild';
  const modal = modalShell(layer, `${gname} Vault`, () => { vaultOpen = false; renderModals(); });
  if (!vaultData) {
    const loading = document.createElement('div');
    loading.className = 'modal-hint';
    loading.textContent = 'Opening the vault...';
    modal.appendChild(loading);
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'modal-grid';
  for (const v of vaultData.items) {
    const def = ITEMS[v.item];
    const slot = document.createElement('div');
    slot.className = 'modal-slot';
    if (def) slot.appendChild(copyCanvas(itemIcon(v.item)));
    const q = document.createElement('span');
    q.className = 'inv-qty';
    q.textContent = fmtQty(v.qty);
    slot.appendChild(q);
    const name = def?.name ?? v.item;
    slot.title = `${name} x ${v.qty.toLocaleString()}`
      + (vaultData.canWithdraw ? '' : '\nYour rank may only deposit.');
    if (vaultData.canWithdraw) {
      slot.onclick = () => vaultWithdraw(v.item, 1);
      slot.oncontextmenu = (e) => {
        e.preventDefault(); e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, [
          { label: 'Withdraw-1', target: name, fn: () => vaultWithdraw(v.item, 1) },
          { label: 'Withdraw-5', target: name, fn: () => vaultWithdraw(v.item, 5) },
          { label: 'Withdraw-All', target: name, fn: () => vaultWithdraw(v.item, v.qty) },
          { label: 'Withdraw-X', target: name, fn: () => { const n = promptQty('Withdraw how many?'); if (n) vaultWithdraw(v.item, n); } },
        ]);
      };
    }
    grid.appendChild(slot);
  }
  if (vaultData.items.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'modal-hint';
    empty.textContent = 'The vault is empty.';
    modal.appendChild(empty);
  } else {
    modal.appendChild(grid);
  }
  const hint = document.createElement('div');
  hint.className = 'modal-hint';
  hint.textContent = vaultData.canWithdraw
    ? 'Click vault items to withdraw (right-click for amounts). Your items below: click to deposit.'
    : 'Members of this guild may only deposit. Your items below: click to deposit.';
  modal.appendChild(hint);
  modal.appendChild(makeInvStrip(
    (slot) => { const it = state.player.inventory[slot]; if (it) vaultDeposit(it.id, 1); },
    (e, slot) => {
      const it = state.player.inventory[slot];
      if (!it) return;
      const name = ITEMS[it.id].name;
      showContextMenu(e.clientX, e.clientY, [
        { label: 'Deposit-1', target: name, fn: () => vaultDeposit(it.id, 1) },
        { label: 'Deposit-5', target: name, fn: () => vaultDeposit(it.id, 5) },
        { label: 'Deposit-All', target: name, fn: () => vaultDeposit(it.id, invCount(it.id)) },
        { label: 'Deposit-X', target: name, fn: () => { const n = promptQty('Deposit how many?'); if (n) vaultDeposit(it.id, n); } },
      ]);
    },
  ));
}

// ---------------- Utils ----------------
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
