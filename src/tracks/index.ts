// All built-in tracks, in music-tab order.
import type { Track } from './notation';
import { track as newbieMeadow } from './newbie_meadow';
import { track as riverside } from './riverside';
import { track as goblinStrut } from './goblin_strut';
import { track as boghollow } from './boghollow';
import { track as stonecourt } from './stonecourt';
import { track as shepherdsRest } from './shepherds_rest';
import { track as marketDay } from './market_day';
import { track as whisperingStones } from './whispering_stones';
import { track as quietMeadow } from './quiet_meadow';
import { track as aldgateStreets } from './aldgate_streets';
import { track as warbanner } from './warbanner';
import { track as underdeep } from './underdeep';
import { track as rimewind } from './rimewind';
import { track as sunscorch } from './sunscorch';
import { track as brackwaterTide } from './brackwater_tide';
import { track as ashfall } from './ashfall';
import { track as rainbowAvenue } from './rainbow_avenue';

export const BASE_TRACKS: Track[] = [
  newbieMeadow, riverside, goblinStrut, boghollow, stonecourt,
  shepherdsRest, marketDay, whisperingStones, quietMeadow,
  aldgateStreets, warbanner, underdeep,
  rimewind, sunscorch, brackwaterTide, ashfall, rainbowAvenue,
];
