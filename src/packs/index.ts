// Content packs — each registers items/NPCs/objects/quests via the game registries.
// Imported by main.ts before initGame so spawns and quests are in place.
import './city';
import './gambling';
import './hedonism_pride';
import './starter_south';
import './gun_guild';
import './boss_warlord';
import './boss_bog';
import './boss_drake';
import './quest_city';
import './quest_warlord';
import './quest_bog';
import './quest_drake';
// Phase 6 content
import './region_frostpeak';
import './region_desert';
import './region_port';
import './region_depths';
import './skills_gathering';
import './skills_production';
import './quest6_a';
import './quest6_b';
import './quest6_c';
// Phase 5 expansion hubs — re-enabled now that the handcrafted 300×300 map
// gives Eldermere, Stonewatch and Gullswreck Cove real ground to stand on.
import './hub_eldermere';
import './hub_stonewatch';
import './hub_gullswreck';
import './wildlife';
// Phase 6 quest wave — the Gathering Discord arc (Q1-Q4) in chapter order,
// then the standalone quests (Q5-Q10), then the Untuned Mine dungeon client
// (its entrance gate contract is owned by Q3 / gd3_sealed_wing — see
// docs/QUEST-DESIGN.md §14.2).
import './gd1_sour_notes';          // Q1
import './gd2_quarrel_of_wizards';  // Q2
import './gd3_sealed_wing';         // Q3
import './gd4_gathering_discord';   // Q4
import './hush_of_ravenmoor';       // Q5
import './cold_comfort';            // Q6
import './hymn_for_the_hollow';     // Q7
import './keep_the_light';          // Q8
import './thunder_on_the_tide';     // Q9
import './against_the_grain';       // Q10
import './untuned_mine';            // solo dungeon (gated by Q3)
