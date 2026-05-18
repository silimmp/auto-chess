const BUY_COST = 3;
const REFRESH_COST = 1;
const BOARD_LIMIT = 7;
const HAND_LIMIT = 7;
const MAX_TAVERN_TIER = 7;
const PREP_SECONDS_EARLY = 15;
const PREP_SECONDS_NORMAL = 25;
const TIMER_TICK_MS = 250;
const POST_BATTLE_DELAY_MS = 1400;
const BATTLE_INTRO_DELAY_MS = 450;
const BATTLE_ACTION_DELAY_MS = 620;
const BATTLE_HIT_DELAY_MS = 420;
const BATTLE_CLEANUP_DELAY_MS = 320;
const TOUCH_LONG_PRESS_MS = 110;
const POINTER_DRAG_START_DISTANCE = 8;
const TOUCH_DRAG_CANCEL_DISTANCE = 18;

const UPGRADE_COSTS = {
  1: 5,
  2: 7,
  3: 8,
  4: 9,
  5: 10,
  6: 11,
  7: null,
};

const MINION_ABILITY_FIELDS = ["deathrattle", "combatStart"];
const SHOP_SLOTS = 5;
const CONTENT_TIER_CAP = 3;

const ENEMY_BOARD_RULES = {
  tierCap: CONTENT_TIER_CAP,
  extraSizeTurnThreshold: 3,
  extraSizeRollMax: 1,
};

const COMBAT_START_PROGRESS_LABEL = "战斗开始";
