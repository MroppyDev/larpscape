// 'Keep the Light' (keep_the_light) — side quest at Gullswreck Light.
// Keeper Brand Wicklow's beacon "Marigold" keeps guttering at convenient hours.
// Fetch fuel (5 logs + lamp oil), service the brazier in strict order, then
// deal with the Wrecker skulker who has been shuttering her for dark landings.
// New content (fragment data/_fragments/q8_lighthouse.json): lamp_oil,
// keepers_spyglass, light_keeper + spawns, warehouse lamp_oil groundSpawn.
// Imported for side effects via src/packs/index.ts.

import {
  state, msg, addItem, removeItem, invCount, hasItem, addXp,
  registerNpcAction, registerObjectAction, registerItemOnObject,
  onKill, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

const LIGHT = 'keep_the_light';
const BRAZIER = 'q8_brazier'; // 0 = cold, 1 = logs loaded, 2 = oiled (lit = stage 3+)
const LOGS_NEEDED = 5;
const OIL_PRICE = 30;

function stage(): number { return state.player.quests[LIGHT] ?? 0; }
function setStage(s: number) { state.player.quests[LIGHT] = s; }
function brazier(): number { return state.player.quests[BRAZIER] ?? 0; }
function setBrazier(v: number) { state.player.quests[BRAZIER] = v; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const WICKLOW = 'Keeper Wicklow';
const WICK = 'Boatman Wick';

function hasFuel(): boolean {
  return invCount('logs') >= LOGS_NEEDED && hasItem('lamp_oil');
}

registerQuest({
  id: LIGHT,
  name: 'Keep the Light',
  doneStage: 5,
  journal: (s) => {
    if (s <= 0) return 'The keeper at Gullswreck Light is arguing with his own beacon, and losing.';
    if (s === 1) {
      const logs = Math.min(invCount('logs'), LOGS_NEEDED);
      const oil = hasItem('lamp_oil') ? 'have the lamp oil' : 'still need a flask of lamp oil';
      return `Marigold wants feeding: ${LOGS_NEEDED} logs and a flask of lamp oil. Wick sells oil; Brackwater's warehouses misplace it. I have ${logs}/${LOGS_NEEDED} logs and ${oil}.`;
    }
    if (s === 2) return 'Load her, oil her, light her — in that order, and Marigold knows if you cheat.';
    if (s === 3) return 'Someone\'s been putting Marigold out on purpose. He\'s due back tonight. Be ready.';
    if (s === 4) return 'The light-killer carried Wrecker tools. Wicklow is writing to Harbormaster Quill — slowly, he says, so the anger stays legible.';
    return 'Marigold burns steady over the causeway. Quest complete!';
  },
});

// ============================================================
// Keeper Brand Wicklow
// ============================================================

registerNpcAction('light_keeper', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say(WICKLOW, '*The keeper is glaring up at the cold brazier.* Don\'t you look at me like that, Marigold. I cleaned your mirrors Tuesday.'),
      ...me('Are you... talking to the lighthouse?'),
      ...say(WICKLOW, 'To the beacon. Marigold. Thirty-one years we\'ve kept this light together, and lately she goes out whenever she pleases. Always at night. Always when the strait is busiest.'),
      ...say(WICKLOW, 'I\'d call it a sulk, but even Marigold\'s sulks keep better hours than this. A dead light over a wrecking coast, friend — that\'s not temper, that\'s funerals.'),
      ...say(WICKLOW, `My knees won't do the fuel run any more. Five good logs and a flask of lamp oil, and I'll owe you more than I'll admit to her.`),
    ], () => {
      showOptions([
        {
          label: 'I\'ll fetch the fuel. Marigold and I will get along fine.',
          fn: () => {
            setStage(1);
            startDialogue([
              ...say(WICKLOW, 'That\'s what the last one said. He\'s a fisherman now. Logs you can chop anywhere a tree stands still long enough.'),
              ...say(WICKLOW, 'The oil\'s the trick. Boatman Wick sells it off his ferry — thirty coins, and worth it. Or Port Brackwater\'s warehouses misplace a flask now and then, if your conscience rows that way.'),
              ...say(WICKLOW, 'Don\'t mix the two errands up. Oil from a tree and logs from a whale have both been tried, and Marigold remembers.'),
            ]);
          },
        },
        {
          label: 'I don\'t get between a man and his beacon.',
          fn: () => {
            startDialogue(say(WICKLOW, 'Wise. She\'s heard that too, mind, and she holds a grudge like a third anchor. The offer keeps — the dark, sadly, also keeps.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    if (!hasFuel()) {
      const logsLeft = Math.max(0, LOGS_NEEDED - invCount('logs'));
      const oilLine = hasItem('lamp_oil') ? 'You\'ve the oil — good. Marigold approves of the oil. She said nothing, which is how she approves.' : 'And the oil — Wick sells it, thirty coins. Tell him it\'s for Marigold and he\'ll stop trying to sell you bait.';
      startDialogue([
        ...say(WICKLOW, 'Fuel run going well? Marigold\'s been asking. Not in words. In meaningful darkness.'),
        ...say(WICKLOW, logsLeft > 0 ? `Still ${logsLeft} log${logsLeft === 1 ? '' : 's'} short of five. ${oilLine}` : oilLine),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Five logs and a flask of lamp oil. Where do you want them?'),
      ...say(WICKLOW, '*Wicklow inspects the logs, then the flask, then you, in descending order of warmth.* Acceptable. All three of you.'),
      ...say(WICKLOW, 'Now listen, because Marigold won\'t say it twice and neither will I. Load her, oil her, light her. In that order.'),
      ...say(WICKLOW, 'Logs in the grate first. Oil over the logs second. Tinderbox last. Do it backwards and you\'ll be the brightest thing on this coast for about four seconds.'),
      ...me('Load, oil, light. How hard can it be?'),
      ...say(WICKLOW, 'Thirty-one years, and I still flinch on step three. Up you go.'),
    ], () => { setStage(2); setBrazier(0); });
    return 'done';
  }
  if (s === 2) {
    const b = brazier();
    startDialogue([
      ...say(WICKLOW, b === 0 ? 'The grate\'s still empty. Logs first — she likes to feel fed before she\'s flattered.'
        : b === 1 ? 'Loaded, good. Now the oil, poured slow. If you rush it she spits, and she aims.'
        : 'Loaded and oiled. One spark left between us and a working coastline. The tinderbox, when you\'re ready.'),
      ...say(WICKLOW, 'I\'ll be down here. Supervising. From a distance she\'d call cowardly and I call experienced.'),
    ]);
    return 'done';
  }
  if (s === 3) {
    startDialogue([
      ...say(WICKLOW, '*Marigold burns overhead, and Wicklow is not smiling, which for Wicklow is close.* Look at her. Steady as a sermon. Which is the problem.'),
      ...say(WICKLOW, 'She didn\'t gutter because she was hungry, friend. I fed her plenty before my knees went. A light doesn\'t go out at convenient hours. Somebody\'s been coming up here and shuttering her.'),
      ...me('Shuttering her? Who darkens a lighthouse?'),
      ...say(WICKLOW, 'Someone who wants the strait blind while a boat slips in heavy and slips out light. And he doesn\'t know she\'s lit again — which means tonight he\'ll come back to fix that.'),
      ...say(WICKLOW, 'He\'ll be skulking by the rocks below. I\'d handle it myself, but Marigold and I agreed I\'m more use as a witness. Be ready.'),
    ]);
    return 'done';
  }
  if (s === 4) {
    startDialogue([
      ...me('Your light-killer won\'t be back. He put up a fight about it.'),
      ...say(WICKLOW, '*Wicklow turns something over in his hands — a long iron hook, sea-greened, with a wrecker\'s knot worked into the haft.* He dropped this. Know what it is?'),
      ...me('A boat hook?'),
      ...say(WICKLOW, 'A shutter-hook. Made for one job: reaching a beacon\'s vent from below and choking her quiet. Wrecker make — Saltjaw\'s lot out of the cove. They weren\'t waiting for wrecks. They were ordering them.'),
      ...say(WICKLOW, 'I\'m writing to Harbormaster Quill at Brackwater. Slowly. If I write it fast the anger goes illegible, and I want every word of this read.'),
      ...say(WICKLOW, 'As for you — Marigold and I settled on a payment, and for once we agreed.'),
    ], () => {
      setStage(5);
      addXp('Firemaking', 700);
      addItem('coins', 300);
      addItem('keepers_spyglass', 1);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say(WICKLOW, 'Three hundred coins from the keeper\'s box, and my spare spyglass. She\'s a fine glass — finds sails before they find rocks. Treat her gently; she\'s used to it.'),
        ...say(WICKLOW, 'And take the trick of the fire with you. Anyone who can light Marigold on the first match can light anything.'),
        ...say(WICKLOW, '*He glances up at the beacon.* Don\'t let it go to your head, dear. He had help.'),
      ]);
    });
    return 'done';
  }
  // Post-quest idle
  startDialogue([
    ...say(WICKLOW, 'Not one gutter since the night you lit her. Burning steady out of pure spite, which is how she shows love.'),
    ...say(WICKLOW, 'The causeway crews wave at her now when they cross. She doesn\'t wave back. She\'s a lighthouse. But I tell her about it.'),
  ]);
  return 'done';
});

// ============================================================
// Boatman Wick — lamp oil sales (Q8-owned option)
// ============================================================

registerNpcAction('boatman', 'Buy-lamp-oil', (_n: Npc) => {
  startDialogue([
    ...me('I hear you sell lamp oil.'),
    ...say(WICK, `Finest pressed whale-oil this side of the strait. Thirty coins the flask. Burns clean, smells like a profitable voyage.`),
  ], () => {
    showOptions([
      {
        label: `Buy a flask of lamp oil. (${OIL_PRICE} coins)`,
        fn: () => {
          if (!hasItem('coins', OIL_PRICE)) {
            startDialogue(say(WICK, 'That\'s a purse with more echo than coin, friend. Thirty. The whales don\'t press themselves.'));
            return;
          }
          removeItem('coins', OIL_PRICE);
          addItem('lamp_oil', 1);
          startDialogue([
            ...say(WICK, '*Wick swaps the flask for your coins with practised sympathy.* There you are. For old Wicklow\'s beacon, is it?'),
            ...say(WICK, 'Give Marigold my regards. From a respectful distance. She and my ferry have history, and the ferry started it.'),
          ]);
        },
      },
      {
        label: 'Not today.',
        fn: () => {
          startDialogue(say(WICK, 'Suit yourself. The dark\'s free, and you get what you pay for.'));
        },
      },
    ]);
  });
  return 'done';
});

// ============================================================
// The beacon brazier — load, oil, light (strict order)
// ============================================================

registerObjectAction('beacon_brazier', 'Inspect', () => {
  const s = stage();
  if (s >= 3) { msg('Marigold burns high and steady. The whole causeway glows with what is, frankly, smugness.'); return 'done'; }
  if (s === 2) {
    const b = brazier();
    msg(b === 0 ? 'The grate stands cold and empty. It manages to look expectant.'
      : b === 1 ? 'Five logs sit stacked in the grate. The brazier wants oil next, and seems to know it.'
      : 'Loaded and oiled. One spark from a working lighthouse.');
    return 'done';
  }
  msg('A great cold brazier atop Gullswreck Light. The keeper below is glaring at it, or it at him.');
  return 'done';
});

registerItemOnObject('logs', 'beacon_brazier', () => {
  const s = stage();
  if (s < 1) { msg('The brazier is cold. Feeding someone else\'s lighthouse uninvited seems forward — the keeper below might have opinions.'); return; }
  if (s === 1) {
    if (!hasFuel()) { msg(`Marigold takes a full meal or none: ${LOGS_NEEDED} logs and a flask of lamp oil. Wicklow was firm about this.`); return; }
    setStage(2); setBrazier(0); // fuel in hand at the brazier — Wicklow's briefing is implied; proceed to load
  }
  if (s > 2 || (s === 2 && brazier() >= 1)) { msg('The grate is already loaded. Marigold does not care for seconds.'); return; }
  if (invCount('logs') < LOGS_NEEDED) { msg(`You need ${LOGS_NEEDED} logs to load the grate properly.`); return; }
  removeItem('logs', LOGS_NEEDED);
  setBrazier(1);
  msg(`You stack ${LOGS_NEEDED} logs into the great grate, the way one sets a table for royalty. Now the oil.`);
});

registerItemOnObject('lamp_oil', 'beacon_brazier', () => {
  const s = stage();
  if (s < 2) { msg('Pouring good oil into a cold, empty grate would achieve a very expensive puddle.'); return; }
  if (s > 2) { msg('Marigold is lit and wants for nothing. Save the oil.'); return; }
  const b = brazier();
  if (b === 0) { msg('Logs first, then oil. Marigold knows if you cheat — Wicklow was specific, and a little haunted.'); return; }
  if (b >= 2) { msg('The logs already glisten with oil. Any more and the first spark becomes a regional event.'); return; }
  removeItem('lamp_oil', 1);
  setBrazier(2);
  msg('You pour the lamp oil slow and even over the logs. The brazier accepts this in dignified silence. Now: a light.');
});

registerItemOnObject('tinderbox', 'beacon_brazier', () => {
  const s = stage();
  if (s < 2) { msg('There is nothing in the grate to light. The brazier radiates patience, barely.'); return; }
  if (s > 2) { msg('Marigold is already burning. Lighting her twice is the sort of insult that gets remembered.'); return; }
  const b = brazier();
  if (b === 0) { msg('Load her, oil her, light her — in that order. The grate is still empty.'); return; }
  if (b === 1) { msg('The logs need oil before the spark, unless you enjoy coaxing damp timber until dawn.'); return; }
  setStage(3);
  msg('You strike the tinderbox. The oil catches, the logs roar, and Marigold blazes to life over the causeway!', 'level');
  msg('Far below, Keeper Wicklow is applauding. You should speak with him.');
});

// ============================================================
// The skulker — any pirate felled at stage 3 settles the matter
// ============================================================

onKill((defId) => {
  if (!state.player) return;
  if (defId === 'pirate' && stage() === 3) {
    setStage(4);
    msg('The skulker drops something long and hooked as he falls. Keeper Wicklow will want to see this.', 'level');
  }
});

export {};
