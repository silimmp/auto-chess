function renderGame({
  state,
  dragState,
  touchSelection,
  elements,
  cleanupDragState,
  bindPrepCardInteractions,
  getPhaseLabel,
  options = {},
}) {
  const { skipZoneRenders = false } = options;
  const isPrep = state.phase === "prep";
  const shouldRenderBattleBoards = !skipZoneRenders && state.phase === "battle";
  if (!isPrep && dragState.status !== "idle") {
    cleanupDragState();
  }

  elements.turn.textContent = state.turn;
  elements.gold.textContent = state.gold;
  elements.hp.textContent = Math.max(0, state.hp);
  elements.tier.textContent = state.tavernTier;
  elements.phase.textContent = getPhaseLabel(state.phase);
  if (elements.shopOdds) {
    elements.shopOdds.textContent = formatTierOdds(SHOP_TIER_ODDS[state.tavernTier]);
  }
  syncTimerDisplay(state, elements);
  if (elements.message) {
    elements.message.textContent = state.message;
  }
  syncLobbyPanel(state, elements);
  renderDiscover(state, elements);
  elements.battleView.classList.toggle("hidden", isPrep);
  syncTouchSelectionState(state, touchSelection, elements);

  if (!skipZoneRenders && !(isPrep && dragState.status !== "idle")) {
    renderShop(state, elements, bindPrepCardInteractions);
    renderHand(state, touchSelection, elements, bindPrepCardInteractions);
    renderPlayerBoard(state, elements, bindPrepCardInteractions);
  }

  if (shouldRenderBattleBoards) {
    renderBattleBoards(state, elements);
  }
  syncBattleOverlay(state, elements);
  syncButtons(state, elements);
}

const prepCardNodeCache = new Map();

function getPrepCardKey(card, zone, index) {
  if (zone === "shop") {
    return `shop:${index}:${card.id}:${card.tier}`;
  }
  if (card.instanceId !== null && card.instanceId !== undefined) {
    return `unit:${card.instanceId}`;
  }
  return `${zone}:${card.cardKind || "minion"}:${card.id || card.name || "card"}:${card.rewardTier ?? ""}:${index}`;
}

function getPrepCardSignature(card) {
  return [
    card.cardKind || "minion",
    card.id || "",
    card.name || "",
    card.attack ?? "",
    card.health ?? "",
    card.golden ? 1 : 0,
    card.rewardTier ?? "",
    card.tribe || "",
    Array.isArray(card.keywords) ? card.keywords.join(",") : "",
    card.text || "",
  ].join("|");
}

function getPrepCardVariant(card, zone) {
  if (card?.cardKind === "tripleReward") {
    return zone === "hand" ? "reward-hand" : "reward";
  }
  return "minion";
}

function syncPrepCardNode(node, zone, index, selected, bindPrepCardInteractions, actionsLocked) {
  node.classList.toggle("touch-selected", selected);
  bindPrepCardInteractions(node, zone, index, actionsLocked);
}

function buildPrepCardNode(card, zone) {
  if (zone === "hand") {
    return buildHandCard(card, { showActions: false });
  }
  return buildMinionCard(card, { showActions: false });
}

function reconcilePrepZone(container, desiredNodes) {
  if (!container) {
    return;
  }

  let current = container.firstChild;
  desiredNodes.forEach((node) => {
    if (node === current) {
      current = current.nextSibling;
      return;
    }
    container.insertBefore(node, current);
  });

  while (current) {
    const next = current.nextSibling;
    container.removeChild(current);
    current = next;
  }
}

function buildPrepZoneNodes(cards, zone, bindPrepCardInteractions, actionsLocked, selectedIndex = -1) {
  return cards.map((card, index) => {
    const key = getPrepCardKey(card, zone, index);
    const signature = getPrepCardSignature(card);
    const variant = getPrepCardVariant(card, zone);
    let node = prepCardNodeCache.get(key);

    if (!node || node.dataset.renderSignature !== signature || node.dataset.renderVariant !== variant) {
      node = buildPrepCardNode(card, zone);
      node.dataset.renderKey = key;
      node.dataset.renderSignature = signature;
      node.dataset.renderVariant = variant;
      prepCardNodeCache.set(key, node);
    }

    syncPrepCardNode(node, zone, index, index === selectedIndex, bindPrepCardInteractions, actionsLocked);
    return node;
  });
}

function syncTouchSelectionState(state, touchSelection, elements) {
  const selectionActive =
    state.phase === "prep" &&
    Boolean(touchSelection?.active) &&
    touchSelection.sourceZone === "hand" &&
    touchSelection.index >= 0;
  document.body.classList.toggle("touch-selection-active", selectionActive);
  const sharedZone = elements.shop?.closest(".prep-shared-zone");
  sharedZone?.classList.toggle("touch-target-ready", selectionActive);
  sharedZone?.classList.toggle("touch-selection-ready", selectionActive);
  elements.board?.closest(".prep-board-zone")?.classList.toggle("touch-target-ready", selectionActive);
  elements.hand?.closest(".prep-hand-zone")?.classList.toggle("touch-selection-ready", selectionActive);
}

function syncLobbyPanel(state, elements) {
  if (!elements.lobbyAlive || !state.lobby) {
    return;
  }

  const lobbyView = state.pendingLobbySnapshot || state.lobby;
  const alivePlayers = getAliveLobbyPlayers(lobbyView.players);
  elements.lobbyAlive.textContent = alivePlayers.length;
  elements.lobbyPlace.textContent = `${getPlayerPlacement(lobbyView)}`;
  elements.lobbyOpponent.textContent = state.currentOpponentName || LOBBY_GHOST_LABEL;
  const rosterSignature = alivePlayers
    .slice()
    .sort((left, right) => right.hp - left.hp)
    .map((player) => `${player.id}:${player.hp}:${player.alive ? 1 : 0}`)
    .join("|");
  const recent = state.lobby.roundSummaries.length ? state.lobby.roundSummaries : ["本轮战斗尚未开始。"];
  const recentSignature = recent.slice(0, 3).join("|");

  if (elements.lobbyRoster && elements.lobbyRoster.dataset.signature !== rosterSignature) {
    elements.lobbyRoster.dataset.signature = rosterSignature;
    elements.lobbyRoster.innerHTML = "";
    alivePlayers
      .slice()
      .sort((left, right) => right.hp - left.hp)
      .forEach((player) => {
        const chip = document.createElement("div");
        chip.className = `lobby-chip${player.isHuman ? " self" : ""}`;
        chip.textContent = `${player.name} · ${player.hp}`;
        chip.title = `${player.name} · ${player.hp}`;
        elements.lobbyRoster.appendChild(chip);
      });
  }

  if (elements.lobbyRecent && elements.lobbyRecent.dataset.signature !== recentSignature) {
    elements.lobbyRecent.dataset.signature = recentSignature;
    elements.lobbyRecent.innerHTML = "";
    recent.slice(0, 3).forEach((line) => {
      const item = document.createElement("div");
      item.className = "lobby-recent-item";
      item.textContent = line;
      elements.lobbyRecent.appendChild(item);
    });
  }
}

function syncTimerDisplay(state, elements) {
  const isPrep = state.phase === "prep";
  elements.timer.textContent = isPrep ? `${state.timeLeft}s` : state.phase === "gameOver" ? "结束" : "战斗中";
  elements.timerCard.classList.toggle("urgent", isPrep && state.timeLeft <= 5);
}

function syncButtons(state, elements) {
  const isPrep = state.phase === "prep";
  const isGameOver = state.hp <= 0 || state.phase === "gameOver";
  const actionsLocked = Boolean(state.discover);
  const upgradeCost = getCurrentUpgradeCost(state);

  elements.refreshBtn.disabled = !isPrep || isGameOver || actionsLocked || state.gold < REFRESH_COST;
  elements.battleBtn.disabled = !isPrep || isGameOver || actionsLocked;
  elements.freezeBtn.disabled = !isPrep || isGameOver || actionsLocked || !state.shop.length;
  elements.upgradeBtn.disabled = !isPrep || isGameOver || actionsLocked || upgradeCost === null || state.gold < upgradeCost;
  elements.upgradeBtn.textContent = upgradeCost === null ? "商店已满级" : `升级商店（${upgradeCost} 金）`;
  elements.refreshBtn.textContent = `刷新（${REFRESH_COST} 金）`;
  elements.freezeBtn.textContent = state.shopFrozen ? "已冻结" : "冻结";
  elements.freezeBtn.classList.toggle("frozen", state.shopFrozen);
}

function formatTierOdds(odds) {
  return Object.entries(odds)
    .map(([tier, weight]) => `${tier} 星 ${Math.round(weight * 100)}%`)
    .join(" · ");
}

function renderShop(state, elements, bindPrepCardInteractions) {
  const actionsLocked = state.phase !== "prep" || state.hp <= 0;
  if (!state.shop.length) {
    reconcilePrepZone(elements.shop, [makeEmptyCard("商店空了，试试刷新。")]);
    return;
  }

  reconcilePrepZone(elements.shop, buildPrepZoneNodes(state.shop, "shop", bindPrepCardInteractions, actionsLocked));
}

function renderHand(state, touchSelection, elements, bindPrepCardInteractions) {
  elements.hand.dataset.handCount = String(state.hand.length);
  elements.hand.classList.toggle("is-empty", state.hand.length === 0);
  const actionsLocked = state.phase !== "prep" || state.hp <= 0;
  const selectedIndex =
    touchSelection?.active && touchSelection.sourceZone === "hand" && touchSelection.index >= 0 ? touchSelection.index : -1;
  if (!state.hand.length) {
    reconcilePrepZone(elements.hand, [makeEmptyCard("手牌空空，买下的随从会先放在这里。")]);
    return;
  }

  reconcilePrepZone(elements.hand, buildPrepZoneNodes(state.hand, "hand", bindPrepCardInteractions, actionsLocked, selectedIndex));
}

function renderPlayerBoard(state, elements, bindPrepCardInteractions) {
  const actionsLocked = state.phase !== "prep" || state.hp <= 0;
  if (!state.board.length) {
    reconcilePrepZone(elements.board, [makeEmptyCard("战队还是空的，先招募一些随从。")]);
    return;
  }

  reconcilePrepZone(elements.board, buildPrepZoneNodes(state.board, "board", bindPrepCardInteractions, actionsLocked));
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

function syncBattleOverlay(state, elements) {
  if (elements.battleView) {
    elements.battleView.dataset.focusSide = getBattleFocusSide(state);
    elements.battleView.dataset.battleState = getBattleOverlayState(state);
  }

  if (elements.battleTurnPill) {
    elements.battleTurnPill.textContent = `第 ${state.turn} 回合`;
  }

  if (elements.battleEnemyName) {
    elements.battleEnemyName.textContent = state.currentOpponentName || LOBBY_GHOST_LABEL;
  }
  if (elements.battlePlayerName) {
    elements.battlePlayerName.textContent = "你";
  }

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

  if (elements.battlePlayerCount) {
    elements.battlePlayerCount.textContent = `剩余 ${countLivingMinions(playerSnapshot)} 名随从`;
  }
  if (elements.battleEnemyCount) {
    elements.battleEnemyCount.textContent = `剩余 ${countLivingMinions(enemySnapshot)} 名随从`;
  }

  const progress = usingAnimation
    ? state.battleAnimation.progressLabel
    : state.phase === "battle"
      ? state.lastBattle.summary || "战斗结束"
      : "等待开战";
  const summary = usingAnimation
    ? getLatestBattleLogLine(state.battleAnimation.logLines) || state.message
    : state.phase === "battle"
      ? state.lastBattle.summary || state.message
      : "战斗即将开始。";

  if (elements.battleProgressLabel) {
    elements.battleProgressLabel.textContent = progress;
  }
  if (elements.battleSummaryText) {
    elements.battleSummaryText.textContent = summary;
  }

}

function renderDiscover(state, elements) {
  if (!elements.discoverView || !elements.discoverChoices) {
    return;
  }

  const discover = state.discover;
  elements.discoverView.classList.toggle("hidden", !discover);
  if (!discover) {
    elements.discoverChoices.innerHTML = "";
    elements.discoverChoices.__discoverRef = null;
    return;
  }

  if (elements.discoverChoices.__discoverRef === discover) {
    return;
  }
  elements.discoverChoices.__discoverRef = discover;
  elements.discoverChoices.innerHTML = "";

  if (elements.discoverTitle) {
    elements.discoverTitle.textContent = "选择一张奖励随从";
  }
  if (elements.discoverSubtitle) {
    elements.discoverSubtitle.textContent = `从四张 ${discover.rewardTier} 星随从中挑选一张加入手牌。`;
  }

  discover.choices.forEach((minion, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "discover-choice";
    button.appendChild(buildMinionCard(minion, { showActions: false }));
    button.addEventListener("click", () => {
      window.__AUTO_CHESS_APP__?.chooseDiscoverReward?.(index);
    });
    elements.discoverChoices.appendChild(button);
  });
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
      battleVisual: getBattleVisualState(state, minion, side, index),
    });
    container.appendChild(card);
  });
}

function getBattleVisualState(state, minion, side, slotIndex) {
  const animation = state.battleAnimation;
  if (state.phase !== "battle" || !animation.active) {
    return {
      slotIndex,
      isAttacker: false,
      isDefender: false,
      takingHit: false,
      defeated: minion.health <= 0,
      chargeClass: "",
      trailClass: "",
      impactClass: "",
      roleLabel: "",
      roleClass: "",
    };
  }

  const isAttacker = animation.attackerId === minion.instanceId && animation.attackerSide === side;
  const isDefender = animation.defenderId === minion.instanceId && animation.defenderSide === side;
  const cue = animation.cues.find((entry) => entry.targetId === minion.instanceId) || null;
  const wasDefeated = animation.defeatedIds.includes(minion.instanceId);

  return {
    slotIndex,
    isAttacker,
    isDefender,
    takingHit: animation.hitIds.includes(minion.instanceId),
    defeated: wasDefeated,
    chargeClass: isAttacker ? (side === "player" ? "charge-player" : "charge-enemy") : "",
    trailClass: isAttacker ? (side === "player" ? "trail-player" : "trail-enemy") : "",
    impactClass: animation.hitIds.includes(minion.instanceId) ? (side === "player" ? "impact-player" : "impact-enemy") : "",
    vanishClass: wasDefeated ? "vanishing" : "",
    reviveClass: cue?.label === "复生" ? "reviving" : "",
    cueLabel: cue?.label || "",
    cueTone: getBattleCueTone(cue?.label),
    roleLabel: isAttacker ? "进攻" : isDefender ? "受击" : "",
    roleClass: isAttacker ? "attacker" : isDefender ? "defender" : "",
  };
}

function countLivingMinions(minions) {
  return minions.filter((minion) => minion.health > 0).length;
}

function getLatestBattleLogLine(lines) {
  return lines.length ? lines[lines.length - 1] : "";
}

function getBattleFocusSide(state) {
  if (state.phase !== "battle" || !state.battleAnimation.active) {
    return "neutral";
  }
  return state.battleAnimation.attackerSide || "neutral";
}

function getBattleOverlayState(state) {
  if (state.phase !== "battle") {
    return "idle";
  }
  return state.battleAnimation.isAnimating ? "animating" : "resolved";
}

function getBattleCueTone(label) {
  if (label === "亡语" || label === "复生") {
    return "necromancy";
  }
  if (label === "圣盾破裂") {
    return "shield";
  }
  if (label === "狂袭" || label === "连击") {
    return "attack";
  }
  return "neutral";
}
