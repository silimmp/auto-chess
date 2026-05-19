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
  2: 6,
  3: 7,
  4: 8,
  5: 9,
  6: 10,
  7: null,
};

const TURN_GOLD_BY_TURN = {
  1: 3,
  2: 4,
  3: 5,
  4: 6,
  5: 8,
  6: 9,
  7: 10,
};

const MINION_ABILITY_FIELDS = ["deathrattle", "combatStart", "reborn", "damageTrigger"];
const SHOP_SLOTS = 5;
const CONTENT_TIER_CAP = MAX_TAVERN_TIER;

const ENEMY_BOARD_RULES = {
  tierCap: CONTENT_TIER_CAP,
  extraSizeTurnThreshold: 5,
  extraSizeRollMax: 1,
  sizeByTurn: {
    1: 1,
    2: 1,
    3: 2,
    4: 2,
    5: 3,
    6: 3,
    7: 4,
    8: 4,
    9: 5,
    10: 5,
    11: 6,
    12: 6,
    13: 7,
  },
  tierByTurn: {
    1: 1,
    2: 1,
    3: 1,
    4: 2,
    5: 2,
    6: 3,
    7: 3,
    8: 4,
    9: 4,
    10: 5,
    11: 5,
    12: 6,
    13: 6,
    14: 7,
  },
};

const SHOP_TIER_ODDS = {
  1: { 1: 1 },
  2: { 1: 0.7, 2: 0.3 },
  3: { 1: 0.45, 2: 0.35, 3: 0.2 },
  4: { 1: 0.2, 2: 0.35, 3: 0.3, 4: 0.15 },
  5: { 1: 0.08, 2: 0.22, 3: 0.3, 4: 0.25, 5: 0.15 },
  6: { 1: 0.03, 2: 0.12, 3: 0.25, 4: 0.3, 5: 0.2, 6: 0.1 },
  7: { 1: 0.01, 2: 0.07, 3: 0.17, 4: 0.28, 5: 0.23, 6: 0.16, 7: 0.08 },
};

const ENEMY_TIER_ODDS = {
  1: { 1: 1 },
  2: { 1: 0.6, 2: 0.4 },
  3: { 1: 0.25, 2: 0.45, 3: 0.3 },
  4: { 1: 0.1, 2: 0.25, 3: 0.4, 4: 0.25 },
  5: { 2: 0.15, 3: 0.3, 4: 0.35, 5: 0.2 },
  6: { 3: 0.2, 4: 0.3, 5: 0.3, 6: 0.2 },
  7: { 4: 0.18, 5: 0.28, 6: 0.32, 7: 0.22 },
};

const COMBAT_START_PROGRESS_LABEL = "战斗开始";
const BATTLE_DAMAGE_TIER_DIVISOR = 4;

function getTurnGold(turn) {
  return TURN_GOLD_BY_TURN[turn] ?? 10;
}

function getEnemyBoardBaseSize(turn) {
  return ENEMY_BOARD_RULES.sizeByTurn[turn] ?? BOARD_LIMIT;
}

function getEnemyBoardTier(turn) {
  return Math.min(
    MAX_TAVERN_TIER,
    ENEMY_BOARD_RULES.tierCap,
    ENEMY_BOARD_RULES.tierByTurn[turn] ?? MAX_TAVERN_TIER
  );
}

function calculateBattleDamage(remainingEnemy) {
  if (!remainingEnemy.length) {
    return 0;
  }

  const totalTier = remainingEnemy.reduce((sum, minion) => sum + minion.tier, 0);
  return Math.max(1, remainingEnemy.length + Math.floor(totalTier / BATTLE_DAMAGE_TIER_DIVISOR));
}
