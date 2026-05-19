function startNextTurnState(state, generateShop, refillShop, generateEnemyBoard) {
  state.turn += 1;
  state.gold = getTurnGold(state.turn);
  state.shop = state.shopFrozen ? refillShop(state.shop, state.tavernTier) : generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.enemyBoard = generateEnemyBoard(state.turn);
}

function upgradeTavernState(state, upgradeCosts, generateShop) {
  const upgradeCost = upgradeCosts[state.tavernTier];
  if (state.phase !== "prep" || upgradeCost === null || state.gold < upgradeCost || state.hp <= 0) {
    return false;
  }

  state.gold -= upgradeCost;
  state.tavernTier += 1;
  state.shop = generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.message = `酒馆升级到 ${state.tavernTier} 级。`;
  return true;
}

function generateEnemyBoard(turn, pickRandom, randomInt) {
  const enemyTier = getEnemyBoardTier(turn);
  const baseSize = getEnemyBoardBaseSize(turn);
  const size = Math.min(
    BOARD_LIMIT,
    baseSize +
      (turn >= ENEMY_BOARD_RULES.extraSizeTurnThreshold
        ? randomInt(0, ENEMY_BOARD_RULES.extraSizeRollMax)
        : 0)
  );
  const board = [];

  for (let index = 0; index < size; index += 1) {
    const minionTier = pickTierByOdds(ENEMY_TIER_ODDS[enemyTier], pickRandom);
    const candidates = MINION_POOL.filter((minion) => !minion.token && minion.tier === minionTier);
    const fallback = MINION_POOL.filter((minion) => !minion.token && minion.tier <= enemyTier);
    const minion = createOwnedMinion(pickRandom(candidates.length ? candidates : fallback).id);
    board.push(minion);
  }
  return board;
}
