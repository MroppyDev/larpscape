// Boss pack: the Bog Horror — poison DoT is server-authoritative (server/hazards.ts).
import {
  msg, registerNpcAction, registerFx, startDialogue,
} from '../game';

const BOSS_ID = 'bog_horror';

const poisonStyle = document.createElement('style');
poisonStyle.textContent = '.chat-line.poison { color: #1c7a1c; }';
document.head.appendChild(poisonStyle);

registerFx('bog_spit', () => {
  msg('You have been poisoned!', 'poison');
});

registerFx('bog_heal', () => {
  msg('Moss and mire crawl across the horror, knitting its wounds back together.');
});

registerNpcAction(BOSS_ID, 'Look-at', (n) => {
  if (n.dead) return 'done';
  startDialogue([
    { speaker: '', text: 'A mound of peat and tangled roots heaves itself upright. Two pale lights blink open where eyes ought to be.' },
    { speaker: 'Bog Horror', text: 'Glrrk... the marsh keeps what it catches.' },
    { speaker: '', text: 'Its hide weeps a thin green ooze. Best not to let any of it land on you.' },
  ]);
  return 'done';
});

export {};
