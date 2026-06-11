// Quest pack Q5: 'The Hush of Ravenmoor' — gothic mystery at Ravenmoor Manor.
// Lady Eseld Ravenmoor (237,152) wants the truth of the bone chimes that ring
// with no wind. The truth: Lord Ravenmoor brought a sliver of the bog's drowned
// refrain home in a jar in F.S. 738, and it outlived him in the bricked cellar.
//
// Stages (doneStage 6, contract per docs/QUEST-DESIGN.md §6/§14):
//   0 not started
//   1 accepted — search the manor library bookshelves (x231-245, y146-151)
//   2 diary found — confront Groundskeeper Mortlock
//   3 fetch a white lily (mere outflow ground spawn 287,90 OR buy from Old Fen
//     for 50 coins via 'Ask-about-lilies'); give to Mortlock -> cellar_key
//   4 cellar door unlocked (object at 232,159 removed); search the annex crate
//     (233,160), kill the manor_revenant; aux bitmask 'q5_cellar':
//     bit 1 = crate searched, bit 2 = revenant slain, bit 4 = lily delivered
//   5 used ravenmoor_diary on the library quiess_chime (244,150)
//   6 turned in to Eseld — 700 Prayer XP, 500 coins, ravenmoor_signet
//
// MULTIPLAYER CAVEAT: removing the cellar_door is client-local (sanctioned
// world-fill mechanism). Each client removes its own copy once its player's
// quest stage is >= 4 (tick hook below), so the open cellar persists per
// character across sessions; other players still see the door until they
// unlock it themselves.
//
// The manor_revenant npcSpawn (232,161, fragment q5_ravenmoor.json) is a
// permanent aggressive lair spawn — post-quest the cellar's chill never quite
// leaves. New ids ship in data/_fragments/q5_ravenmoor.json.
// Imported for side effects via src/packs/index.ts (integrator wires it).

import {
  state, msg, addItem, removeItem, invCount, hasItem, addXp,
  registerNpcAction, registerObjectAction, registerItemOnObject,
  registerTickHook, onKill, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';
import { removeObject, objectAt, key, WorldObject } from '../world';

const HUSH = 'hush_of_ravenmoor';
const CELLAR = 'q5_cellar'; // bitmask: 1 = crate searched, 2 = revenant slain, 4 = lily delivered
const BIT_CRATE = 1;
const BIT_REVENANT = 2;
const BIT_LILY = 4;

// Manor geometry (data/map.json): library room band, cellar door, annex crate, chimes.
const LIB = { x0: 231, x1: 245, y0: 146, y1: 151 };
const DOOR = { x: 232, y: 159 };
const ANNEX_CRATE = { x: 233, y: 160 };
const CHIME = { x: 244, y: 150 };

function stage(): number { return state.player.quests[HUSH] ?? 0; }
function setStage(s: number) { state.player.quests[HUSH] = s; }
function cellarBits(): number { return state.player.quests[CELLAR] ?? 0; }
function setBit(b: number) { state.player.quests[CELLAR] = cellarBits() | b; }
function hasBit(b: number): boolean { return (cellarBits() & b) !== 0; }

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

const ESELD = 'Lady Eseld Ravenmoor';
const MORTLOCK = 'Mortlock';
const FEN = 'Old Fen';

registerQuest({
  id: HUSH,
  name: 'The Hush of Ravenmoor',
  doneStage: 6,
  journal: (s) => {
    if (s <= 0) return 'Lady Ravenmoor stands at her gate at dusk, listening to chimes that shouldn\'t be ringing.';
    if (s === 1) return 'Search the manor library. Lady Ravenmoor says her husband\'s last weeks live on those shelves.';
    if (s === 2) return 'Mortlock has the cellar key and a condition: a white lily for Lord Ravenmoor\'s grave.';
    if (s === 3) {
      if (hasItem('cellar_key')) return 'Mortlock has his lily and I have the cellar key. The iron-banded door waits north of the manor house.';
      return 'A white lily grows where water sits quiet — the mere\'s outflow by the Quiess Tower. Or Old Fen might part with one.';
    }
    if (s === 4) {
      if (!hasBit(BIT_REVENANT)) return 'The cellar is open. The jar is broken — from the inside. Something in there is still keeping its hour.';
      if (!hasBit(BIT_CRATE)) return 'The thing in the cellar is ended, but I haven\'t found what the lord kept down there. The crate.';
      return 'The revenant is ended and the jar found. The diary\'s melody — the bone chimes in the library might finish what he started.';
    }
    if (s === 5) return 'The diary held his melody. The chimes have finally finished the phrase. Lady Ravenmoor should hear it from me.';
    return 'The hush over Ravenmoor is an honest silence now. Lady Ravenmoor counts me a friend of the house. Quest complete!';
  },
});

// ============================================================
// Lady Eseld Ravenmoor — quest giver (Talk-to is free, Q5 owns it)
// ============================================================

registerNpcAction('lady_ravenmoor', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s === 0) {
    startDialogue([
      ...say(ESELD, 'You hear them too, then. Good. The servants pretended they didn\'t, right up until the morning they were gone.'),
      ...say(ESELD, 'Bone chimes, above the library window. My husband hung them the year we married. They ring every night at the same hour, and there is never any wind.'),
      ...me('Perhaps it\'s only the—'),
      ...say(ESELD, 'If you say "settling timbers" I will have Mortlock escort you off the grounds, and he will explain the fountain to you on the way. It takes an hour. The fountain does not come out of it well.'),
      ...say(ESELD, 'Lord Ravenmoor died in seven-thirty-eight — the same night the cellar was bricked shut. Five years of kind lies since. I want the truth of this house, whatever it weighs.'),
    ], () => {
      showOptions([
        {
          label: 'Then I\'ll find it for you. All of it.',
          fn: () => {
            setStage(1);
            startDialogue([
              ...say(ESELD, 'Start in the library — the northeast room. He never burned a page in his life; his last weeks live on those shelves, written down and hidden behind duller books.'),
              ...say(ESELD, 'Search the cases. And if Mortlock asks, you are admiring the architecture.'),
            ]);
          },
        },
        {
          label: 'Some houses are better left listening to themselves.',
          fn: () => {
            startDialogue(say(ESELD, 'Then good evening. The chimes will ring at the usual hour, whether or not anyone is brave enough to ask why.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    startDialogue([
      ...say(ESELD, 'The library, northeast room. Search the shelves properly — my husband hid his honest writing behind the almanacs, where nobody sane would ever look.'),
    ]);
    return 'done';
  }
  if (s === 2) {
    startDialogue([
      ...me('I found his diary. He bought a jar from the bog. A note that never resolves — he said it helped him sleep.'),
      ...say(ESELD, '*She reads the final entry twice, and her face does not move at all, which is worse than if it had.* He told me it was a music box.'),
      ...say(ESELD, 'Mortlock bricked that cellar the night he died. Go and ask my groundskeeper what, precisely, he was bricking in. He will say timbers. Do not accept timbers.'),
    ]);
    return 'done';
  }
  if (s === 3) {
    startDialogue([
      ...say(ESELD, hasItem('cellar_key')
        ? 'He gave you the key? Then he has been carrying my husband\'s last order for five years. Open the door, and finish whatever it shut in.'
        : 'Mortlock and his lily. Indulge him — he has tended my husband\'s grave longer than the church has. They grow at the mere\'s outflow under the Quiess Tower, or Old Fen in Bellmeadow sells anything with roots.'),
    ]);
    return 'done';
  }
  if (s === 4) {
    startDialogue([
      ...say(ESELD, hasBit(BIT_REVENANT)
        ? 'The house felt that. Whatever you ended down there, end the rest of it — the chimes are still waiting on their last note. His diary may know it.'
        : 'You opened it, then. Whatever is down there has rung its hour five years running. End it.'),
    ]);
    return 'done';
  }
  if (s === 5) {
    startDialogue([
      ...me('It\'s finished, my lady. All of it.'),
      ...say(ESELD, 'I heard. The whole house heard — the phrase ended. Five years of the same unfinished bar, and last night it resolved. Tell me everything, and leave nothing out to spare me.'),
      ...me('He bought a sliver of the bog\'s drowned refrain in a jar. A note that never resolves; it helped him sleep. It outgrew the jar. And him. Mortlock bricked it under the house on his dying order — to keep it from you.'),
      ...say(ESELD, 'Five years I believed my husband died of a weak heart. He died of a collector\'s one. That is somehow both better and worse, and I will be years deciding which.'),
      ...say(ESELD, 'I asked Mortlock this morning what stopped the chimes. He looked me dead in the eye and said the timbers had finished settling. I have decided to let him have that one. He has earned one.'),
      ...say(ESELD, 'May I keep the diary? It is the last of his voice — and the first honest thing this house has held in years.'),
    ], () => {
      removeItem('ravenmoor_diary', 1);
      setStage(6);
      addXp('Prayer', 700);
      addItem('coins', 500);
      addItem('ravenmoor_signet', 1);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say(ESELD, 'The house of Ravenmoor pays its debts. Coin from the estate — and this: my husband\'s signet. Wear it, and you will always have a roof here, and a fire, and the truth. We keep that here now.'),
        ...say(ESELD, 'Listen. No chimes. Just the wind, when it troubles to come. An honest silence, at last.'),
      ]);
    });
    return 'done';
  }
  // Post-quest idle line
  startDialogue([
    ...say(ESELD, 'The cellar stays open, by my order. The chill down there never quite leaves — but it is our chill now, honestly come by. You are always welcome at Ravenmoor.'),
  ]);
  return 'done';
});

// ============================================================
// Groundskeeper Mortlock — Talk-to (Q5 owns it)
// ============================================================

registerNpcAction('groundskeeper', 'Talk-to', (_n: Npc) => {
  const s = stage();
  if (s <= 1) {
    startDialogue([
      ...say(MORTLOCK, 'Evening. Mind the gravel — I raked it.'),
      ...me('The chimes rang again last night. There was no wind.'),
      ...say(MORTLOCK, 'Settling timbers. Old house, old beams. They sing a bit as they settle.'),
      ...me('The chimes hang outside. On a cord.'),
      ...say(MORTLOCK, 'Settling cord.'),
    ]);
    return 'done';
  }
  if (s === 2) {
    startDialogue([
      ...me('I found his diary, Mortlock. The jar from the bog. The note that never resolves.'),
      ...say(MORTLOCK, '...'),
      ...say(MORTLOCK, 'Settling timb— no. No, I suppose we are past that, you and I.'),
      ...say(MORTLOCK, 'He called me down the night he died. Could barely stand. He said: "Brick it up, Mortlock, and tell her nothing. It was my folly; let it be my tomb\'s neighbour." So I bricked it. And I kept the key, because a door without a key is just a wall that knows better.'),
      ...me('Then give me the key. The lady wants the truth, not the wall.'),
      ...say(MORTLOCK, 'And she\'ll have it. But one thing first, done properly. There\'s a grave behind this house I have tended five years with everything but the right flower. He planted white lilies for her the year they married, and the bog took the last of ours.'),
      ...say(MORTLOCK, 'Bring me one white lily for my lord\'s grave, and the key is yours.'),
    ], () => {
      setStage(3);
      startDialogue([
        ...say(MORTLOCK, 'They grow where water sits quiet — the mere\'s outflow, under the Quiess Tower, away east past everything sensible. Or Old Fen in Bellmeadow sells anything that grows, if you ask him kindly and pay him promptly.'),
      ]);
    });
    return 'done';
  }
  if (s === 3) {
    // Key already handed over (or lily delivered but key lost — re-issue).
    if (hasItem('cellar_key')) {
      startDialogue([
        ...say(MORTLOCK, 'The annex is north of the house — the iron-banded door. Five years that lock has been oiled and never once turned. Seemed wrong to let it rust.'),
      ]);
      return 'done';
    }
    if (hasBit(BIT_LILY)) {
      // Safety: lily was delivered but the key was lost. Mortlock keeps spares of everything.
      if (!addItem('cellar_key', 1)) { msg('You need a free inventory slot for the key.'); return 'done'; }
      startDialogue([
        ...say(MORTLOCK, 'Lost the key. Five years I keep it safe and you lose it in an afternoon. Here — the spare. There is always a spare. That is the whole of groundskeeping, if you write it down.'),
      ]);
      return 'done';
    }
    if (hasItem('white_lily')) {
      startDialogue([
        ...me('One white lily.'),
        ...say(MORTLOCK, '*He takes it with both hands, the way you\'d take an egg or an apology.* Five years. Five years I\'ve tended that grave with everything but the right flower.'),
        ...say(MORTLOCK, 'Here is the key, then, as promised. The annex is north of the house — the iron-banded door.'),
        ...say(MORTLOCK, 'Whatever rings down there kept my lord company while he died. Don\'t be gentle with it.'),
      ], () => {
        if (!addItem('cellar_key', 1)) {
          msg('You need a free inventory slot for the key. Mortlock holds onto it for now.');
          return;
        }
        removeItem('white_lily', 1);
        setBit(BIT_LILY);
        msg('Mortlock takes the white lily and hands you a cold iron key.');
      });
      return 'done';
    }
    startDialogue([
      ...say(MORTLOCK, 'One white lily, done properly. The mere\'s outflow under the Quiess Tower grows them, or Old Fen sells them. The grave has waited five years; it can wait an honest errand longer.'),
    ]);
    return 'done';
  }
  if (s === 4 || s === 5) {
    startDialogue([
      ...say(MORTLOCK, 'That noise from the annex last night. The crash. The... unpleasantness.'),
      ...me(hasBit(BIT_REVENANT) ? 'That was me, killing what was in your cellar.' : 'That\'s me, dealing with what\'s in your cellar.'),
      ...say(MORTLOCK, 'Settling adventurer.'),
    ]);
    return 'done';
  }
  // Post-quest idle line
  startDialogue([
    ...say(MORTLOCK, 'The chimes have stopped. House must be done settling. *He almost smiles, then rakes the gravel you are standing on.*'),
  ]);
  return 'done';
});

// ============================================================
// Old Fen — 'Ask-about-lilies' (Q5 owns; his Talk-to belongs to quests.ts)
// ============================================================

registerNpcAction('gardener', 'Ask-about-lilies', (_n: Npc) => {
  const buying = stage() === 3 && !hasItem('cellar_key') && !hasBit(BIT_LILY);
  startDialogue([
    ...say(FEN, 'White lilies? Now there\'s a flower with manners. They grow where water sits quiet and thinks things over — the mere\'s outflow under the Quiess Tower, away east.'),
    ...say(FEN, 'I keep a few myself. A lily by the door says the house has nothing to hide, which is why you hardly ever see one by a door.'),
  ], () => {
    if (!buying) {
      startDialogue(say(FEN, 'If you ever need one, you know where they sit. Or where I sit, which is closer.'));
      return;
    }
    showOptions([
      {
        label: 'Could I buy one? Fifty coins?',
        fn: () => {
          if (invCount('coins') < 50) {
            startDialogue(say(FEN, 'Fifty is the price, and your purse says otherwise. Come back when it\'s heavier than your conscience.'));
            return;
          }
          if (!addItem('white_lily', 1)) { msg('You need a free inventory slot.'); return; }
          removeItem('coins', 50);
          startDialogue([
            ...say(FEN, 'Fifty coins, and don\'t haggle — the lily heard you ask, and it knows what it\'s worth.'),
            ...say(FEN, 'For a grave, is it? Thought so. They always are. Carry it stem-down and walk slow; it\'ll keep.'),
          ]);
        },
      },
      {
        label: 'I\'ll go pick one myself.',
        fn: () => {
          startDialogue(say(FEN, 'Cheaper, and the walk will do you good. Mind the bank — quiet water is only ever quiet on top.'));
        },
      },
    ]);
  });
  return 'done';
});

// ============================================================
// Library bookshelves — 'Search' (coordinate-gated; polite no-op elsewhere)
// ============================================================

function inLibrary(o: WorldObject): boolean {
  return o.x >= LIB.x0 && o.x <= LIB.x1 && o.y >= LIB.y0 && o.y <= LIB.y1;
}

registerObjectAction('bookshelf', 'Search', (o) => {
  if (!inLibrary(o)) {
    msg('Almanacs, ledgers and a treatise on fence posts. Nothing here sings.');
    return 'done';
  }
  const s = stage();
  if (s === 1) {
    if (!addItem('ravenmoor_diary', 1)) { msg('You need a free inventory slot.'); return 'done'; }
    msg('Estate ledgers, sermon collections, forty years of almanacs... and one diary, wedged spine-in behind the rest.');
    startDialogue([
      ...say('The diary', 'Final entry, F.S. 738: "The jar again. I paid the bog-trader far too little for what it is — a note that never resolves. It helps me sleep. Eseld must not know; she would make me give it up, and I find that I cannot."'),
      ...me('That\'s the lord\'s hand. And that is no music box.'),
    ], () => {
      setStage(2);
      msg('You take the Ravenmoor diary. Mortlock has some settling to account for.', 'level');
    });
    return 'done';
  }
  if (s >= 2) {
    msg('You\'ve already found what these shelves were keeping.');
    return 'done';
  }
  msg('Fine books, finely dusted. Whatever this library knows, it isn\'t telling strangers.');
  return 'done';
});

// ============================================================
// Cellar door — 'Unlock' object action + cellar_key|cellar_door (Q5 owns both)
// ============================================================

function tryUnlock(o: WorldObject): void {
  if (o.x !== DOOR.x || o.y !== DOOR.y) { msg('It doesn\'t budge.'); return; }
  if (stage() >= 4) { msg('The cellar stands open.'); return; }
  if (!hasItem('cellar_key')) {
    msg('Locked. The lock is clean and oiled — kept ready, all these years, by someone who never once opened it.');
    return;
  }
  removeItem('cellar_key', 1);
  setStage(4);
  removeObject(o);
  msg('The key turns like it was oiled yesterday — because it was.');
  msg('Cold air climbs the steps to meet you. Somewhere below, a single note holds, and holds, and refuses to end.', 'level');
}

registerObjectAction('cellar_door', 'Unlock', (o) => { tryUnlock(o); return 'done'; });
registerItemOnObject('cellar_key', 'cellar_door', (_slot, o) => { tryUnlock(o); });

// Persistence: the cellar stays open forever once unlocked (stage >= 4).
// Client-local removal — see the multiplayer caveat in the header comment.
registerTickHook(() => {
  if (!state.player) return;
  if ((state.player.quests[HUSH] ?? 0) < 4) return;
  const o = objectAt.get(key(DOOR.x, DOOR.y));
  if (o && o.type === 'cellar_door') removeObject(o);
});

// ============================================================
// Annex crate — 'Search' (coordinate-gated; polite no-op elsewhere)
// ============================================================

registerObjectAction('crate', 'Search', (o) => {
  if (o.x !== ANNEX_CRATE.x || o.y !== ANNEX_CRATE.y) {
    msg('You search the crate. Straw, and a spider that was here first.');
    return 'done';
  }
  const s = stage();
  if (s < 4) {
    msg('A crate. The manor\'s cellar keeps its own counsel.');
    return 'done';
  }
  if (s === 4 && !hasBit(BIT_CRATE)) {
    setBit(BIT_CRATE);
    msg('Straw, wax-cloth, packing paper... and a jar.');
    startDialogue([
      ...me('The seal is unbroken. The glass is shattered outward. It didn\'t escape — it grew.'),
      ...me('Five years in the dark under his house, ringing the hour he died. No wonder the chimes answered.'),
    ]);
    return 'done';
  }
  msg('The broken jar sits where he left it. The glass still hums, very faintly, when you stop breathing.');
  return 'done';
});

// ============================================================
// Manor revenant kill tracking — server youKilled (killer gets credit)
// ============================================================

onKill((defId) => {
  if (!state.player || defId !== 'manor_revenant') return;
  if (stage() !== 4 || hasBit(BIT_REVENANT)) return;
  setBit(BIT_REVENANT);
  msg('The revenant frays apart, and the note it was keeping finally lets go of the hour.', 'level');
  msg('The melody in the diary\'s margins — the bone chimes in the library could finish it.');
});

// ============================================================
// Diary on the bone chimes — ravenmoor_diary|quiess_chime (coordinate-gated)
// ============================================================

registerItemOnObject('ravenmoor_diary', 'quiess_chime', (_slot, o) => {
  if (o.x !== CHIME.x || o.y !== CHIME.y) { msg('These chimes don\'t know this melody.'); return; }
  const s = stage();
  if (s < 4) {
    msg('The chimes stir at the diary, flat and unfriendly. Not yet.');
    return;
  }
  if (s === 4) {
    if (!hasBit(BIT_REVENANT)) {
      msg('The chimes shiver and fall silent. Whatever still keeps its hour in the cellar is holding the phrase open.');
      return;
    }
    if (!hasBit(BIT_CRATE)) {
      msg('The cellar is quiet now — but you still haven\'t found what he kept down there. The crate.');
      return;
    }
    msg('You hold the diary open and let the bone chimes read over your shoulder.');
    startDialogue([
      ...me('There — in the margins of his last pages. He was writing the note an ending. He just never finished it.'),
      ...say('The bone chimes', '*One by one, the chimes take up the melody scrawled beside his final entry — his melody — and for the first time in five years, they finish it.*'),
      ...say('The bone chimes', '*The last note resolves. The silence afterward is only silence.*'),
    ], () => {
      setStage(5);
      msg('The hush over Ravenmoor is an honest one now. Lady Ravenmoor should hear it from you.', 'level');
    });
    return;
  }
  msg('The chimes hang still. The phrase is finished; there is nothing left to play it to.');
});

export {};
