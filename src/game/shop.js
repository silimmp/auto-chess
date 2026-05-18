import {
  BOARD_LIMIT,
  CONTENT_TIER_CAP,
  ENEMY_BOARD_RULES,
  MAX_TAVERN_TIER,
  SHOP_SLOTS,
} from "../data/rules.js";
import { MINION_POOL, cloneTemplate, createOwnedMinion } from "../data/minions.js";

export function startNextTurnState(state, generateShop, refillShop, generateEnemyBoard) {
  state.turn += 1;
  state.gold = Math.min(10, state.turn + 2);
  state.shop = state.shopFrozen ? refillShop(state.shop, state.tavernTier) : generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.enemyBoard = generateEnemyBoard(state.turn);
}

export function generateShop(maxTier, pickRandom) {
  const effectiveTier = Math.min(maxTier, CONTENT_TIER_CAP);
  const candidates = MINION_POOL.filter((minion) => !minion.token && minion.tier <= effectiveTier);
  return Array.from({ length: SHOP_SLOTS }, () => cloneTemplate(pickRandom(candidates)));
}

export function refillShop(currentShop, maxTier, pickRandom) {
  const filledShop = currentShop.map(cloneTemplate);
  const missing = Math.max(0, SHOP_SLOTS - filledShop.length);
  if (missing === 0) {
    return filledShop;
  }
  return [...filledShop, ...generateShop(maxTier, pickRandom).slice(0, missing)];
}

export function generateEnemyBoard(turn, pickRandom, randomInt) {
  const enemyTier = Math.min(Math.min(MAX_TAVERN_TIER, ENEMY_BOARD_RULES.tierCap), 1 + Math.floor((turn - 1) / 2));
  const baseSize = Math.min(BOARD_LIMIT, 1 + Math.floor((turn - 1) / 2));
  const size = Math.min(
    BOARD_LIMIT,
    baseSize +
      (turn >= ENEMY_BOARD_RULES.extraSizeTurnThreshold
        ? randomInt(0, ENEMY_BOARD_RULES.extraSizeRollMax)
        : 0)
  );
  const candidates = MINION_POOL.filter((minion) => !minion.token && minion.tier <= enemyTier);
  const board = [];

  for (let index = 0; index < size; index += 1) {
    const minion = createOwnedMinion(pickRandom(candidates).id);
    board.push(minion);
  }
  return board;
}
