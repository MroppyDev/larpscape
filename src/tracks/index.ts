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
// Phase 6 wave — eastern expansion, coast, towers and the Untuned Mine.
import { track as harvestRoad } from './harvest_road';
import { track as tanglewoodDepths } from './tanglewood_depths';
import { track as stonewatchGarrison } from './stonewatch_garrison';
import { track as wraithrun } from './wraithrun';
import { track as ravenmoor } from './ravenmoor';
import { track as imbersSpire } from './imbers_spire';
import { track as quiessRest } from './quiess_rest';
import { track as gullswreckShanty } from './gullswreck_shanty';
import { track as beaconRock } from './beacon_rock';
import { track as untunedHalls } from './untuned_halls';
import { track as theCrystalHeart } from './the_crystal_heart';

export const BASE_TRACKS: Track[] = [
  newbieMeadow, riverside, goblinStrut, boghollow, stonecourt,
  shepherdsRest, marketDay, whisperingStones, quietMeadow,
  aldgateStreets, warbanner, underdeep,
  rimewind, sunscorch, brackwaterTide, ashfall,
  // eastern expansion (farm belt -> woods -> garrison -> moor -> towers)
  harvestRoad, tanglewoodDepths, stonewatchGarrison, wraithrun, ravenmoor,
  imbersSpire, quiessRest,
  // southern coast
  gullswreckShanty, beaconRock,
  // the Untuned Mine
  untunedHalls, theCrystalHeart,
];
