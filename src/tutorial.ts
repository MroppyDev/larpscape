// Tutorial: 'Getting Started' guided checklist for fresh characters.
// Shows a compact dismissible overlay (top-left of the viewport) with six steps,
// polls game state once per second, persists progress in
// state.player.quests['getting_started'] (stage = steps completed, 6 = done).
// Veterans (any other quest progress, or total level > 40) never see it.
// Imported for side effects by main.ts.

import { state, msg, addItem, totalLevel, skillIdx } from './game';
import { registerQuest } from './quests';

const QID = 'getting_started';
const DONE_STAGE = 6;

interface TutStep {
  label: string;    // checklist line in the overlay
  journal: string;  // phrasing for the quest journal
}

const STEPS: TutStep[] = [
  { label: 'Walk somewhere (click the ground)', journal: 'take a walk (click the ground to move)' },
  { label: 'Open your inventory tab', journal: 'open the inventory tab on the side panel' },
  { label: 'Chop a tree (gain Woodcutting XP)', journal: 'chop down a tree with an axe' },
  { label: 'Light a fire (gain Firemaking XP)', journal: 'light a fire with a tinderbox and logs' },
  { label: 'Cook something on a fire or range', journal: 'cook some food on a fire or range' },
  { label: 'Talk to any NPC', journal: 'have a chat with one of the locals' },
];

function stage(): number { return state.player?.quests?.[QID] ?? 0; }
function setStage(s: number) { state.player.quests[QID] = s; }

registerQuest({
  id: QID,
  name: 'Getting Started',
  doneStage: DONE_STAGE,
  journal: (s) => {
    if (s >= DONE_STAGE) {
      return 'I learned the ropes of life around here. The guide notes are filed away — adventure awaits. Quest complete!';
    }
    const remaining = STEPS.slice(s).map((st) => st.journal);
    return `I'm learning the basics. Still to do: ${remaining.join('; ')}.`;
  },
});

// ---------------- session state ----------------

let decided = false;   // have we evaluated eligibility yet this session?
let enabled = false;   // is the tutorial running for this character?
let finished = false;  // rewards handed out / overlay retired

// per-session baselines (re-captured on reload; deltas still detect new actions)
let startX = 0;
let startY = 0;
let wcBase = 0;
let fmBase = 0;
let ckBase = 0;
let sawDialogue = false;

// ---------------- DOM ----------------

let panel: HTMLDivElement | null = null;
let helpBtn: HTMLButtonElement | null = null;
let listEl: HTMLDivElement | null = null;
let styleInjected = false;

function injectStyle() {
  if (styleInjected) return;
  styleInjected = true;
  const css = document.createElement('style');
  css.textContent = `
#tut-panel {
  position: absolute; top: 22px; left: 6px; z-index: 6;
  width: 190px; padding: 5px 7px 6px;
  background: linear-gradient(#cdb592, #b69d79);
  border: 1px solid #5d4a30; border-radius: 3px;
  box-shadow: 1px 2px 0 rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,248,230,0.25);
  color: #2e2415; font-size: 11px; line-height: 1.35;
  font-family: inherit; user-select: none;
}
#tut-panel .tut-head {
  display: flex; align-items: center; justify-content: space-between;
  font-weight: bold; font-size: 12px; color: #3d2c12;
  border-bottom: 1px solid rgba(93,74,48,0.5); padding-bottom: 2px; margin-bottom: 3px;
}
#tut-panel .tut-close {
  cursor: pointer; border: none; background: none; padding: 0 1px;
  color: #6b3014; font-weight: bold; font-size: 12px; line-height: 1; font-family: inherit;
}
#tut-panel .tut-close:hover { color: #a8431a; }
#tut-panel .tut-step { display: flex; gap: 4px; align-items: baseline; }
#tut-panel .tut-step .tut-tick { width: 11px; flex: none; font-weight: bold; }
#tut-panel .tut-step.done { color: #4a6b2a; }
#tut-panel .tut-step.done .tut-tick { color: #3c7a1e; }
#tut-panel .tut-step.now { color: #1c140a; font-weight: bold; }
#tut-panel .tut-step.todo { color: rgba(46,36,21,0.62); }
#tut-help-btn {
  position: absolute; top: 22px; left: 6px; z-index: 6;
  width: 18px; height: 18px; padding: 0;
  background: linear-gradient(#cdb592, #b69d79);
  border: 1px solid #5d4a30; border-radius: 3px;
  color: #3d2c12; font-weight: bold; font-size: 12px; line-height: 1;
  cursor: pointer; font-family: inherit;
  box-shadow: 1px 1px 0 rgba(0,0,0,0.4);
}
#tut-help-btn:hover { background: linear-gradient(#dcc6a3, #c4ab86); }
`;
  document.head.appendChild(css);
}

function ensureDom() {
  if (panel) return;
  const wrap = document.getElementById('viewport-wrap');
  if (!wrap) return;
  injectStyle();

  panel = document.createElement('div');
  panel.id = 'tut-panel';
  const head = document.createElement('div');
  head.className = 'tut-head';
  const title = document.createElement('span');
  title.textContent = 'Getting Started';
  const close = document.createElement('button');
  close.className = 'tut-close';
  close.textContent = '✕';
  close.title = 'Hide guide';
  close.addEventListener('click', () => {
    if (panel) panel.style.display = 'none';
    if (helpBtn) helpBtn.style.display = 'block';
  });
  head.appendChild(title);
  head.appendChild(close);
  panel.appendChild(head);

  listEl = document.createElement('div');
  panel.appendChild(listEl);
  wrap.appendChild(panel);

  helpBtn = document.createElement('button');
  helpBtn.id = 'tut-help-btn';
  helpBtn.textContent = '?';
  helpBtn.title = 'Show the Getting Started guide';
  helpBtn.style.display = 'none';
  helpBtn.addEventListener('click', () => {
    if (panel) panel.style.display = 'block';
    if (helpBtn) helpBtn.style.display = 'none';
  });
  wrap.appendChild(helpBtn);
}

let lastRenderedStage = -1;

function renderPanel() {
  const el = listEl;
  if (!el) return;
  const s = stage();
  if (s === lastRenderedStage) return;
  lastRenderedStage = s;
  el.innerHTML = '';
  STEPS.forEach((st, i) => {
    const row = document.createElement('div');
    row.className = 'tut-step ' + (i < s ? 'done' : i === s ? 'now' : 'todo');
    const tick = document.createElement('span');
    tick.className = 'tut-tick';
    tick.textContent = i < s ? '✓' : '•';
    const text = document.createElement('span');
    text.textContent = st.label;
    row.appendChild(tick);
    row.appendChild(text);
    el.appendChild(row);
  });
}

function retireDom() {
  if (panel) { panel.remove(); panel = null; listEl = null; }
  if (helpBtn) { helpBtn.remove(); helpBtn = null; }
}

// ---------------- step detection ----------------

function captureBaselines() {
  startX = state.player.x;
  startY = state.player.y;
  wcBase = state.player.xp[skillIdx('Woodcutting')];
  fmBase = state.player.xp[skillIdx('Firemaking')];
  ckBase = state.player.xp[skillIdx('Cooking')];
  sawDialogue = false;
}

function stepDone(i: number): boolean {
  const p = state.player;
  switch (i) {
    case 0: return p.x !== startX || p.y !== startY;
    case 1: return document.querySelector('#panel .inv-grid') !== null;
    case 2: return p.xp[skillIdx('Woodcutting')] > wcBase;
    case 3: return p.xp[skillIdx('Firemaking')] > fmBase;
    case 4: return p.xp[skillIdx('Cooking')] > ckBase;
    case 5: return sawDialogue;
    default: return false;
  }
}

function complete() {
  finished = true;
  setStage(DONE_STAGE);
  addItem('bread', 3);
  addItem('coins', 50);
  msg('Congratulations! You\'ve learned the basics. Here\'s some bread and coin for the road.', 'level');
  retireDom();
}

// ---------------- eligibility + poll loop ----------------

function decide() {
  decided = true;
  const q = state.player.quests;
  const existing = q[QID];
  if (existing !== undefined) {
    // returning character: resume if mid-tutorial, stay hidden if done
    enabled = existing < DONE_STAGE;
    finished = existing >= DONE_STAGE;
    return;
  }
  // fresh-start check: no progress on any quest, untouched stats
  const hasOtherProgress = Object.keys(q).some((k) => k !== QID && (q[k] ?? 0) > 0);
  if (hasOtherProgress || totalLevel() > 40) { enabled = false; return; }
  enabled = totalLevel() === 32;
  if (enabled) setStage(0);
}

setInterval(() => {
  if (!state.player || !state.started || finished) return;

  if (!decided) {
    decide();
    if (!enabled) { finished = true; return; }
    captureBaselines();
  }
  if (!enabled) return;

  // dialogue stays open until clicked through, so a 1s poll catches it; latch it
  if (state.dialogue) sawDialogue = true;

  let s = stage();
  while (s < DONE_STAGE && stepDone(s)) {
    s++;
    setStage(s);
    if (s < DONE_STAGE) msg(`Guide: step ${s} of ${DONE_STAGE} done. Next: ${STEPS[s].label.toLowerCase()}`);
  }

  if (s >= DONE_STAGE) { complete(); return; }

  ensureDom();
  renderPanel();
}, 1000);

export {};
