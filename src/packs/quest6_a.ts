// Quest pack 6a: two boss-slayer quests.
//  - 'The Frozen Crown' — Guide Torvald (mountain_guide) sends you to end
//    Maraza the Rimebound at the Frostpeak summit. Kill tracked via dead-edge
//    polling on ice_queen npcs (quests['frozen_crown_kill']).
//  - 'The Red Smile' — Nomad Zahra (desert_nomad) asks you to end Saif the
//    Red Smile, king of the dune bandits. Tracked via dead-edge polling on
//    bandit_king (quests['red_smile_kill']).
// Imported for side effects via src/packs; registers quests + npc options.

import {
  state, msg, addItem, addXp,
  registerNpcAction, registerTickHook, startDialogue, showOptions,
  DialogueLine, Npc,
} from '../game';
import { registerQuest } from '../quests';

function say(npc: string, ...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: npc, text: t }));
}
function me(...texts: string[]): DialogueLine[] {
  return texts.map((t) => ({ speaker: 'You', text: t }));
}

// ============================================================
// Quest 1: The Frozen Crown
// ============================================================

const CROWN = 'frozen_crown';
const CROWN_KILL = 'frozen_crown_kill';

function crownStage(): number { return state.player.quests[CROWN] ?? 0; }
function setCrownStage(s: number) { state.player.quests[CROWN] = s; }
function marazaSlain(): boolean { return (state.player.quests[CROWN_KILL] ?? 0) >= 1; }

registerQuest({
  id: CROWN,
  name: 'The Frozen Crown',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Guide Torvald in the Frostpeak foothills mutters that the mountain\'s storms blow wrong. He might know more about the peak.';
    if (s === 1) {
      return marazaSlain()
        ? 'Maraza the Rimebound has shattered and the summit storms are breaking. I should bring the news to Guide Torvald.'
        : 'Torvald says the blizzards aren\'t weather at all — a queen crowned in rime holds court at the summit. I must climb up and end Maraza the Rimebound.';
    }
    return 'I broke the frozen crown and the mountain breathes again. Torvald says spring may finally reach the high passes. Quest complete!';
  },
});

const TORVALD = 'Torvald';

registerNpcAction('mountain_guide', 'Ask-about-the-peak', (_n: Npc) => {
  const s = crownStage();
  if (s === 0) {
    startDialogue([
      ...me('These storms — do they ever let up?'),
      ...say(TORVALD, 'Let up? Friend, I\'ve guided this mountain thirty years and fallen off most of it, and I\'ll tell you plain: this is no weather.'),
      ...say(TORVALD, 'Real storms wander. These circle the summit like a dog on a chain. Something up there is holding court, and the blizzard is its herald.'),
      ...say(TORVALD, 'I climbed high once, before my knee went. Through the white I saw a throne of blue ice, and on it a figure crowned in rime. Maraza, the old songs call her. The Rimebound.'),
      ...say(TORVALD, 'While she sits that throne, the passes stay shut and good climbers keep dying. Somebody with steadier legs than mine needs to climb up and unseat her — for good.'),
    ], () => {
      showOptions([
        {
          label: 'Point me at the summit. I\'ll melt that crown.',
          fn: () => {
            setCrownStage(1);
            startDialogue([
              ...say(TORVALD, 'Ha! There\'s the spine I was hoping for. Take the high ledges up and bear north — her court sits on the ice near the very top.'),
              ...say(TORVALD, 'Mind yourself: she\'s had centuries to grow cold and cruel, and the rime drinks the heat right out of a sword arm. Carry food, carry prayers, and don\'t stop moving.'),
              ...say(TORVALD, 'Come back down alive and I\'ll see you rewarded. Come back down dead and, well, you\'ll roll most of the way anyhow.'),
            ]);
          },
        },
        {
          label: 'A frozen queen? I like my blood unfrozen, thanks.',
          fn: () => {
            startDialogue(say(TORVALD, 'Sensible. Wrong, but sensible. The offer keeps — the mountain isn\'t going anywhere, and neither, worse luck, is she.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    if (!marazaSlain()) {
      startDialogue([
        ...say(TORVALD, 'Still in one piece! And the storm still circling, so I take it Her Frostiness still holds court.'),
        ...me('I\'m getting there. The mountain doesn\'t make it quick.'),
        ...say(TORVALD, 'That it does not. North past the high ledges, near the summit ice. Break the queen and you break the storm.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('It\'s done. Maraza is shattered. The throne is empty ice.'),
      ...say(TORVALD, '*Torvald squints up the slope, where the clouds are pulling apart like old wool.* Well, I\'ll be hanged. Thirty years I\'ve watched that storm circle, and now it just... wanders off.'),
      ...say(TORVALD, 'You\'ve opened the high passes, friend. Every climber and trader on this mountain owes you their toes.'),
    ], () => {
      setCrownStage(2);
      addXp('Agility', 1200);
      addXp('Magic', 1200);
      addItem('coins', 2000);
      addItem('prayer_potion', 1);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say(TORVALD, 'Here — two thousand coins from the guides\' purse, and a prayer potion I was saving for my own funeral. Won\'t be needing it as soon now.'),
        ...say(TORVALD, 'And take what the mountain taught you: nobody climbs through a witch-storm and comes down the same. Lighter on the ledges, and something of her magic in your fingers, I\'d wager.'),
      ]);
    });
    return 'done';
  }
  // Post-quest
  startDialogue([
    ...say(TORVALD, '*Torvald tips his hat to the clear summit.* Look at that. Blue sky over the peak. I keep waiting for it to be a trick.'),
    ...say(TORVALD, 'Crown-breaker, the other guides are calling you. I started it. You\'re welcome.'),
  ]);
  return 'done';
});

// ============================================================
// Quest 2: The Red Smile
// ============================================================

const SMILE = 'red_smile';
const SMILE_KILL = 'red_smile_kill';

function smileStage(): number { return state.player.quests[SMILE] ?? 0; }
function setSmileStage(s: number) { state.player.quests[SMILE] = s; }
function saifSlain(): boolean { return (state.player.quests[SMILE_KILL] ?? 0) >= 1; }

registerQuest({
  id: SMILE,
  name: 'The Red Smile',
  doneStage: 2,
  journal: (s) => {
    if (s <= 0) return 'Nomad Zahra in the Sunscorch Desert watches the dunes like she\'s lost something to them. She might talk about the bandits.';
    if (s === 1) {
      return saifSlain()
        ? 'Saif the Red Smile is dead and his crooked court is broken. Zahra will want to hear it from me.'
        : 'Zahra asked me to end Saif the Red Smile, the bandit king bleeding the caravans dry. His camp lies deep in the southwest dunes.';
    }
    return 'Saif\'s red smile is closed for good and the caravan roads run free. Zahra can finally sell in peace. Quest complete!';
  },
});

const ZAHRA = 'Zahra';

registerNpcAction('desert_nomad', 'Ask-about-bandits', (_n: Npc) => {
  const s = smileStage();
  if (s === 0) {
    startDialogue([
      ...me('I hear there are bandits in these dunes.'),
      ...say(ZAHRA, 'Bandits? No, traveller. A bandit takes your purse. These take everything — the water, the camels, the will to cross.'),
      ...say(ZAHRA, 'Three caravans this season, bled dry on the south road. The drivers come back on foot, if they come back, all telling of the same man: Saif, the one they call the Red Smile.'),
      ...say(ZAHRA, 'He crowned himself king of the dunes. Held a vote, they say, and counted it himself. His camp squats out in the deep sand, and no trade moves without paying his "kindness tax".'),
      ...say(ZAHRA, 'I am one nomad with a tent of goods I cannot sell to caravans that never arrive. But you — you carry steel like you know its weight. End Saif, and the desert breathes again.'),
    ], () => {
      showOptions([
        {
          label: 'Consider his smile closed. Where do I find him?',
          fn: () => {
            setSmileStage(1);
            startDialogue([
              ...say(ZAHRA, 'West and south, deep in the dunes — follow the picked-clean wagon bones and you will find his camp. He keeps cutthroats around him, so come quietly or come ready.'),
              ...say(ZAHRA, 'Do not let the grin fool you. Saif smiles widest just before the knife. Watch his hands, never his teeth.'),
              ...say(ZAHRA, 'Return to me when it is done. The nomads pay their debts — in coin, and in things worth more than coin.'),
            ]);
          },
        },
        {
          label: 'Dune politics aren\'t my business.',
          fn: () => {
            startDialogue(say(ZAHRA, 'So says everyone, until the dunes make it their business. Drink your water and go safely, traveller. I will be here — and so, sadly, will he.'));
          },
        },
      ]);
    });
    return 'done';
  }
  if (s === 1) {
    if (!saifSlain()) {
      startDialogue([
        ...say(ZAHRA, 'You still wear all your fingers, so you have not shaken hands with Saif yet.'),
        ...me('Not yet. The desert hides his camp well.'),
        ...say(ZAHRA, 'It hides nothing — it only waits for you to look properly. Deep in the southwest dunes, among the wagon bones. Watch his hands, not his teeth.'),
      ]);
      return 'done';
    }
    startDialogue([
      ...me('Saif is dead. The Red Smile won\'t tax another caravan.'),
      ...say(ZAHRA, '*Zahra is quiet for a long moment, listening to the wind.* You hear that? Nothing. No drums from the deep sand. Just desert, the way it should sound.'),
      ...say(ZAHRA, 'His cutthroats will scatter without him — rats vote with their feet, and this time no one counts it for them. The caravans will return by the new moon.'),
    ], () => {
      setSmileStage(2);
      addXp('Thieving', 900);
      addXp('Attack', 900);
      addItem('sapphire_ring', 1);
      addItem('coins', 1500);
      msg('Congratulations! Quest complete!', 'level');
      startDialogue([
        ...say(ZAHRA, 'The nomads pay their debts. Fifteen hundred coins, gathered from every tent on this road — and this sapphire ring. It crossed the desert nine times and was never once stolen. Until tonight. By me. For you.'),
        ...say(ZAHRA, 'You walked into a den of thieves and out again — there is craft in that worth keeping, and your sword arm is the stronger for it. Go well, friend of the caravans.'),
      ]);
    });
    return 'done';
  }
  // Post-quest
  startDialogue([
    ...say(ZAHRA, '*Zahra gestures at the horizon, where a caravan line shimmers in the heat.* Three this week. Three! I have nearly run out of things to sell them.'),
    ...say(ZAHRA, 'The drivers toast "the one who closed the Red Smile". I tell them I know you. It is excellent for business.'),
  ]);
  return 'done';
});

// ============================================================
// Boss kill tracking — no kill-event hook; poll dead-state edges.
// ============================================================

const lastDeadCrown = new Map<Npc, boolean>();
const lastDeadSmile = new Map<Npc, boolean>();

registerTickHook(() => {
  if (!state.player) return;
  const crownQuesting = crownStage() === 1;
  const smileQuesting = smileStage() === 1;
  if (!crownQuesting && !smileQuesting) return;
  for (const n of state.npcs) {
    if (crownQuesting && n.def.id === 'ice_queen') {
      const was = lastDeadCrown.get(n) ?? n.dead;
      if (!was && n.dead && !marazaSlain()) {
        state.player.quests[CROWN_KILL] = (state.player.quests[CROWN_KILL] ?? 0) + 1;
        msg('Maraza the Rimebound shatters! The summit storm begins to break. Guide Torvald should hear of this.', 'level');
      }
      lastDeadCrown.set(n, n.dead);
    }
    if (smileQuesting && n.def.id === 'bandit_king') {
      const was = lastDeadSmile.get(n) ?? n.dead;
      if (!was && n.dead && !saifSlain()) {
        state.player.quests[SMILE_KILL] = (state.player.quests[SMILE_KILL] ?? 0) + 1;
        msg('Saif the Red Smile falls, grin and all. Nomad Zahra will want to hear of this.', 'level');
      }
      lastDeadSmile.set(n, n.dead);
    }
  }
});
