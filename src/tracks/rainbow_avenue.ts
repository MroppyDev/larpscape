// 'Rainbow Avenue' — pride district celebration. Upbeat dance-pop energy
// built on the Market Day faire-band orchestration, recomposed for the parade.
import { track as marketDay } from './market_day';
import type { Track } from './notation';

export const track: Track = { ...marketDay, name: 'Rainbow Avenue' };
