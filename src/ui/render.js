function renderGame({
  state,
  dragState,
  elements,
  cleanupDragState,
  bindPrepCardInteractions,
  getPhaseLabel,
  options = {},
}) {
  const { skipZoneRenders = false } = options;
  const isPrep = state.phase === "prep";
  if (!isPrep && dragState.status !== "idle") {
    cleanupDragState();
  }

  elements.turn.textContent = state.turn;
  elements.gold.textContent = state.gold;
  elements.hp.textContent = Math.max(0, state.hp);
  elements.tier.textContent = state.tavernTier;
  elements.phase.textContent = getPhaseLabel(state.phase);
  syncTimerDisplay(state, elements);
  elements.message.textContent = state.message;
  elements.battleView.classList.toggle("hidden", isPrep);

  if (!skipZoneRenders && !(isPrep && dragState.status !== "idle")) {
    renderShop(state, elements, bindPrepCardInteractions);
    renderHand(state, elements, bindPrepCardInteractions);
    renderPlayerBoard(state, elements, bindPrepCardInteractions);
  }

  if (!skipZoneRenders) {
    renderBattleBoards(state, elements);
  }
  syncButtons(state, elements);
}

function syncTimerDisplay(state, elements) {
  const isPrep = state.phase === "prep";
  elements.timer.textContent = isPrep ? `${state.timeLeft}s` : state.phase === "gameOver" ? "结束" : "战斗中";
  elements.timerCard.classList.toggle("urgent", isPrep && state.timeLeft <= 5);
}

function syncButtons(state, elements) {
  const isPrep = state.phase === "prep";
  const isGameOver = state.hp <= 0 || state.phase === "gameOver";
  const upgradeCost = UPGRADE_COSTS[state.tavernTier];

  elements.refreshBtn.disabled = !isPrep || isGameOver || state.gold < REFRESH_COST;
  elements.battleBtn.disabled = !isPrep || isGameOver;
  elements.freezeBtn.disabled = !isPrep || isGameOver || !state.shop.length;
  elements.upgradeBtn.disabled = !isPrep || isGameOver || upgradeCost === null || state.gold < upgradeCost;
  elements.upgradeBtn.textContent = upgradeCost === null ? "商店已满级" : `升级商店（${upgradeCost} 金）`;
  elements.refreshBtn.textContent = `刷新（${REFRESH_COST} 金）`;
  elements.freezeBtn.textContent = state.shopFrozen ? "已冻结" : "冻结";
  elements.freezeBtn.classList.toggle("frozen", state.shopFrozen);
}

function renderShop(state, elements, bindPrepCardInteractions) {
  elements.shop.innerHTML = "";

  if (!state.shop.length) {
    elements.shop.appendChild(makeEmptyCard("商店空了，试试刷新。"));
    return;
  }

  const actionsLocked = state.phase !== "prep" || state.hp <= 0;
  state.shop.forEach((minion, index) => {
    const card = buildMinionCard(minion, { showActions: false });
    bindPrepCardInteractions(card, "shop", index, actionsLocked);
    elements.shop.appendChild(card);
  });
}

function renderHand(state, elements, bindPrepCardInteractions) {
  elements.hand.innerHTML = "";

  if (!state.hand.length) {
    elements.hand.appendChild(makeEmptyCard("手牌空空，买下的随从会先放在这里。"));
    return;
  }

  const actionsLocked = state.phase !== "prep" || state.hp <= 0;
  state.hand.forEach((minion, index) => {
    const card = buildMinionCard(minion, { showActions: false });
    bindPrepCardInteractions(card, "hand", index, actionsLocked);
    elements.hand.appendChild(card);
  });
}

function renderPlayerBoard(state, elements, bindPrepCardInteractions) {
  elements.board.innerHTML = "";

  if (!state.board.length) {
    elements.board.appendChild(makeEmptyCard("战队还是空的，先招募一些随从。"));
    return;
  }

  const actionsLocked = state.phase !== "prep" || state.hp <= 0;
  state.board.forEach((minion, index) => {
    const card = buildMinionCard(minion, { showActions: false });
    bindPrepCardInteractions(card, "board", index, actionsLocked);
    elements.board.appendChild(card);
  });
}

function renderBattleBoards(state, elements) {
  const usingAnimation = state.phase === "battle" && state.battleAnimation.active;
  const playerSnapshot =
    state.phase === "prep"
      ? state.board
      : usingAnimation
        ? state.battleAnimation.playerBoard
        : state.lastBattle.playerSnapshot;
  const enemySnapshot =
    state.phase === "prep"
      ? state.enemyBoard
      : usingAnimation
        ? state.battleAnimation.enemyBoard
        : state.lastBattle.enemySnapshot;

  renderBattleLane(elements.battleEnemy, enemySnapshot, "战斗开始后，对手阵容会显示在这里。", state, elements);
  renderBattleLane(elements.battlePlayer, playerSnapshot, "你的战队会在战斗阶段显示在这里。", state, elements);
}

function renderBattleLane(container, minions, emptyText, state, elements) {
  if (!container) {
    return;
  }

  container.innerHTML = "";
  if (!minions.length) {
    container.appendChild(makeEmptyCard(emptyText));
    return;
  }

  minions.forEach((minion, index) => {
    const side = container === elements.battlePlayer ? "player" : "enemy";
    const card = buildMinionCard(minion, {
      battle: true,
      showActions: false,
      slotLabel: `位置 ${index + 1}`,
      battleVisual: getBattleVisualState(state, minion, side),
    });
    container.appendChild(card);
  });
}

function getBattleVisualState(state, minion, side) {
  const animation = state.battleAnimation;
  if (state.phase !== "battle" || !animation.active) {
    return null;
  }

  const isAttacker = animation.attackerId === minion.instanceId && animation.attackerSide === side;
  const isDefender = animation.defenderId === minion.instanceId && animation.defenderSide === side;

  return {
    isAttacker,
    isDefender,
    takingHit: animation.hitIds.includes(minion.instanceId),
    defeated: animation.defeatedIds.includes(minion.instanceId),
    chargeClass: isAttacker ? (side === "player" ? "charge-player" : "charge-enemy") : "",
    roleLabel: isAttacker ? "进攻" : isDefender ? "受击" : "",
    roleClass: isAttacker ? "attacker" : isDefender ? "defender" : "",
  };
}
