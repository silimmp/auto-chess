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

  if (!skipZoneRenders) {
    renderBattleBoards(state, elements);
  }
  syncBattleOverlay(state, elements);
  syncButtons(state, elements);
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

  if (elements.lobbyRoster) {
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

  if (elements.lobbyRecent) {
    elements.lobbyRecent.innerHTML = "";
    const recent = state.lobby.roundSummaries.length ? state.lobby.roundSummaries : ["本轮战斗尚未开始。"];
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

function renderHand(state, touchSelection, elements, bindPrepCardInteractions) {
  elements.hand.innerHTML = "";
  elements.hand.dataset.handCount = String(state.hand.length);
  elements.hand.classList.toggle("is-empty", state.hand.length === 0);

  if (!state.hand.length) {
    elements.hand.appendChild(makeEmptyCard("手牌空空，买下的随从会先放在这里。"));
    return;
  }

  const actionsLocked = state.phase !== "prep" || state.hp <= 0;
  state.hand.forEach((minion, index) => {
    const card = buildHandCard(minion, { showActions: false });
    if (touchSelection?.active && touchSelection.sourceZone === "hand" && touchSelection.index === index) {
      card.classList.add("touch-selected");
    }
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
