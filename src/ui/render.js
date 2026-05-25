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
  syncActiveTribes(state, elements);
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
const battleCardNodeCache = new Map();

function getBattleDebugRuntime() {
  return window.__AUTO_CHESS_BATTLE_DEBUG__ || null;
}

function recordBattleDebug(type, payload) {
  getBattleDebugRuntime()?.record?.(type, payload);
}

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

function getBattleCardKey(minion, side, index) {
  if (minion.instanceId !== null && minion.instanceId !== undefined) {
    return `battle:${side}:${minion.instanceId}`;
  }
  return `battle:${side}:${minion.id || minion.name || "card"}:${index}`;
}

function getBattleCardSignature(minion) {
  return [
    minion.id || "",
    minion.name || "",
    minion.attack ?? "",
    minion.health ?? "",
    minion.golden ? 1 : 0,
    minion.tier ?? "",
    minion.tribe || "",
    Array.isArray(minion.keywords) ? minion.keywords.join(",") : "",
    minion.text || "",
  ].join("|");
}

function syncNodeText(target, source) {
  if (!target || !source) {
    return false;
  }
  if (target.textContent !== source.textContent) {
    target.textContent = source.textContent;
  }
  return true;
}

function syncNodeClass(target, source) {
  if (!target || !source) {
    return false;
  }
  if (target.className !== source.className) {
    target.className = source.className;
  }
  return true;
}

function syncNodeMarkup(target, source) {
  if (!target || !source) {
    return false;
  }
  if (target.innerHTML !== source.innerHTML) {
    target.innerHTML = source.innerHTML;
  }
  return true;
}

function patchBattleCardContent(node, fresh) {
  const targetTier = node.querySelector(".tier-badge");
  const freshTier = fresh.querySelector(".tier-badge");
  const targetName = node.querySelector(".minion-name");
  const freshName = fresh.querySelector(".minion-name");
  const targetKeywords = node.querySelector(".keyword-row");
  const freshKeywords = fresh.querySelector(".keyword-row");
  const targetMeta = node.querySelector(".minion-meta");
  const freshMeta = fresh.querySelector(".minion-meta");
  const targetAttack = node.querySelector(".stat-pill.attack");
  const freshAttack = fresh.querySelector(".stat-pill.attack");
  const targetHealth = node.querySelector(".stat-pill.health");
  const freshHealth = fresh.querySelector(".stat-pill.health");

  const complete =
    syncNodeText(targetTier, freshTier) &&
    syncNodeText(targetName, freshName) &&
    syncNodeMarkup(targetKeywords, freshKeywords) &&
    syncNodeText(targetMeta, freshMeta) &&
    syncNodeText(targetAttack, freshAttack) &&
    syncNodeText(targetHealth, freshHealth) &&
    syncNodeClass(targetHealth, freshHealth);

  if (!complete) {
    node.innerHTML = fresh.innerHTML;
    return false;
  }
  return true;
}

function syncBattleCardNode(node, minion, battleVisual) {
  const fresh = buildMinionCard(minion, {
    battle: true,
    showActions: false,
    battleVisual,
  });
  const nextSignature = getBattleCardSignature(minion);
  const previousClassName = node.className;
  const previousSignature = node.dataset.renderSignature || "";
  let patchedContent = false;

  if (node.dataset.renderSignature !== nextSignature) {
    patchedContent = patchBattleCardContent(node, fresh);
    node.dataset.renderSignature = nextSignature;
  }

  if (node.className !== fresh.className) {
    node.className = fresh.className;
  }

  ["data-instance-id", "data-side"].forEach((attr) => {
    const value = fresh.getAttribute(attr);
    if (value === null) {
      node.removeAttribute(attr);
    } else if (node.getAttribute(attr) !== value) {
      node.setAttribute(attr, value);
    }
  });

  recordBattleDebug("battle-card-sync", {
    instanceId: battleVisual?.instanceId ?? minion.instanceId ?? null,
    side: battleVisual?.side || "",
    reused: true,
    signatureChanged: previousSignature !== nextSignature,
    classChanged: previousClassName !== node.className,
    patchedContent,
    prevClassName: previousClassName,
    nextClassName: node.className,
    attack: minion.attack,
    health: minion.health,
  });
}

function buildBattleLaneNodes(minions, side, state) {
  return minions.map((minion, index) => {
    const key = getBattleCardKey(minion, side, index);
    const battleVisual = getBattleVisualState(state, minion, side, index);
    let node = battleCardNodeCache.get(key);

    if (!node) {
      node = buildMinionCard(minion, {
        battle: true,
        showActions: false,
        battleVisual,
      });
      node.dataset.renderSignature = getBattleCardSignature(minion);
      battleCardNodeCache.set(key, node);
      recordBattleDebug("battle-card-sync", {
        instanceId: battleVisual?.instanceId ?? minion.instanceId ?? null,
        side,
        reused: false,
        created: true,
        className: node.className,
        attack: minion.attack,
        health: minion.health,
        slotIndex: index,
      });
      return node;
    }

    syncBattleCardNode(node, minion, battleVisual);
    return node;
  });
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

function syncActiveTribes(state, elements) {
  if (!elements.activeTribesList) {
    return;
  }

  const ordered = [...(state.activeTribes || [])]
    .filter((tribe) => tribe !== ALWAYS_AVAILABLE_TRIBE)
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN"));
  const signature = ordered.join("|");
  if (elements.activeTribesList.dataset.signature === signature) {
    return;
  }

  elements.activeTribesList.dataset.signature = signature;
  elements.activeTribesList.innerHTML = "";
  ordered.forEach((tribe) => {
    const chip = document.createElement("span");
    chip.className = "active-tribe-chip";
    chip.textContent = tribe;
    elements.activeTribesList.appendChild(chip);
  });
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
  syncBattleAttackIndicator(state, elements);
}

function syncBattleOverlay(state, elements) {
  if (elements.battleView) {
    elements.battleView.dataset.focusSide = getBattleFocusSide(state);
    elements.battleView.dataset.battleState = getBattleOverlayState(state);
    elements.battleView.dataset.actionType = state.phase === "battle" && state.battleAnimation.active ? state.battleAnimation.actionType || "" : "";
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
    elements.discoverTitle.textContent = discover.title || "选择一张奖励随从";
  }
  if (elements.discoverSubtitle) {
    elements.discoverSubtitle.textContent =
      discover.subtitle || `从四张 ${discover.rewardTier} 星随从中挑选一张加入手牌。`;
  }

  discover.choices.forEach((card, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "discover-choice";
    button.appendChild(card?.cardKind === "brandSpell" ? buildHandCard(card, { showActions: false }) : buildMinionCard(card, { showActions: false }));
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

  if (!minions.length) {
    reconcilePrepZone(container, [makeEmptyCard(emptyText)]);
    return;
  }

  const side = container === elements.battlePlayer ? "player" : "enemy";
  recordBattleDebug("battle-lane-render", {
    side,
    size: minions.length,
    ids: minions.map((minion) => minion.instanceId ?? minion.id ?? null),
  });
  reconcilePrepZone(container, buildBattleLaneNodes(minions, side, state));
}

function getBattleVisualState(state, minion, side, slotIndex) {
  const animation = state.battleAnimation;
  if (state.phase !== "battle" || !animation.active) {
    return {
      slotIndex,
      isAttacker: false,
      isDefender: false,
      defeated: minion.health <= 0,
      chargeClass: "",
      idleClass: "",
      damagePop: 0,
      instanceId: minion.instanceId,
      side,
    };
  }

  const previousBoard = Array.isArray(side === "player" ? animation.previousPlayerBoard : animation.previousEnemyBoard)
    ? side === "player"
      ? animation.previousPlayerBoard
      : animation.previousEnemyBoard
    : [];
  const previousMinion = previousBoard.find((entry) => entry.instanceId === minion.instanceId) || null;
  const activeAttacker = animation.attackerId === minion.instanceId && animation.attackerSide === side;
  const activeDefender = animation.defenderId === minion.instanceId && animation.defenderSide === side;
  const focusedAttacker =
    animation.focusAttackerId === minion.instanceId && animation.focusAttackerSide === side;
  const focusedDefender =
    animation.focusDefenderId === minion.instanceId && animation.focusDefenderSide === side;
  const isAttacker = activeAttacker || focusedAttacker;
  const isDefender = activeDefender || focusedDefender;
  const cue = animation.cues.find((entry) => entry.targetId === minion.instanceId) || null;
  const wasDefeated = animation.defeatedIds.includes(minion.instanceId);
  const isCombatStartAction = animation.actionType === "combatStart";
  const isCueAction = animation.actionType === "cue";
  const isCaster = isCombatStartAction && activeAttacker;
  const isCueTarget = Boolean(cue);
  const actionFocused =
    Boolean(animation.focusAttackerId) ||
    Boolean(animation.focusDefenderId) ||
    Boolean(animation.hitIds?.length) ||
    isCombatStartAction ||
    isCueTarget;
  const isInvolved = isAttacker || isDefender || animation.hitIds.includes(minion.instanceId) || isCueTarget;

  return {
    slotIndex,
    isAttacker,
    isDefender,
    defeated: wasDefeated,
    chargeClass:
      activeAttacker && !isCombatStartAction && !isCueAction ? (animation.hitIds.length ? "charge-return" : "charge-advance") : "",
    idleClass: actionFocused && !isInvolved ? "battle-idle" : "",
    damagePop: previousMinion && previousMinion.health > minion.health ? Math.max(1, previousMinion.health - minion.health) : 0,
    castClass: isCaster ? "casting" : "",
    instanceId: minion.instanceId,
    side,
  };
}

function syncBattleAttackIndicator(state, elements) {
  const battleView = elements.battleView;
  if (!battleView) {
    return;
  }

  resetBattleMotionStyles(battleView);

  const animation = state.battleAnimation;
  const shouldShow =
    state.phase === "battle" &&
    animation.active &&
    animation.actionType !== "combatStart" &&
    Boolean(animation.attackerId) &&
    Boolean(animation.defenderId);

  if (!shouldShow) {
    return;
  }

  const attackerCard = battleView.querySelector(`.battle-board .minion-card[data-instance-id="${animation.attackerId}"][data-side="${animation.attackerSide}"]`);
  const defenderCard = battleView.querySelector(`.battle-board .minion-card[data-instance-id="${animation.defenderId}"][data-side="${animation.defenderSide}"]`);
  const arena = battleView.querySelector(".battle-arena");
  if (!attackerCard || !defenderCard || !arena) {
    return;
  }

  const arenaRect = arena.getBoundingClientRect();
  const attackerRect = attackerCard.getBoundingClientRect();
  const defenderRect = defenderCard.getBoundingClientRect();
  const attackerCenterX = attackerRect.left + attackerRect.width / 2 - arenaRect.left;
  const attackerCenterY = attackerRect.top + attackerRect.height / 2 - arenaRect.top;
  const defenderCenterX = defenderRect.left + defenderRect.width / 2 - arenaRect.left;
  const defenderCenterY = defenderRect.top + defenderRect.height / 2 - arenaRect.top;

  const motion = getBattleDashMotion(
    {
      x: attackerCenterX,
      y: attackerCenterY,
      width: attackerRect.width,
      height: attackerRect.height,
    },
    {
      x: defenderCenterX,
      y: defenderCenterY,
      width: defenderRect.width,
      height: defenderRect.height,
    }
  );
  attackerCard.style.setProperty("--attack-dash-x", `${motion.dashX}px`);
  attackerCard.style.setProperty("--attack-dash-y", `${motion.dashY}px`);
  defenderCard.style.setProperty("--impact-shift-x", `${motion.impactX}px`);
  defenderCard.style.setProperty("--impact-shift-y", `${motion.impactY}px`);

  recordBattleDebug("battle-motion-sync", {
    attackerId: animation.attackerId,
    attackerSide: animation.attackerSide,
    defenderId: animation.defenderId,
    defenderSide: animation.defenderSide,
    actionType: animation.actionType || "",
    attackerClassName: attackerCard.className,
    defenderClassName: defenderCard.className,
    dashX: Number(motion.dashX.toFixed(2)),
    dashY: Number(motion.dashY.toFixed(2)),
    impactX: Number(motion.impactX.toFixed(2)),
    impactY: Number(motion.impactY.toFixed(2)),
    attackerRect: {
      x: Number(attackerRect.left.toFixed(2)),
      y: Number(attackerRect.top.toFixed(2)),
      width: Number(attackerRect.width.toFixed(2)),
      height: Number(attackerRect.height.toFixed(2)),
    },
    defenderRect: {
      x: Number(defenderRect.left.toFixed(2)),
      y: Number(defenderRect.top.toFixed(2)),
      width: Number(defenderRect.width.toFixed(2)),
      height: Number(defenderRect.height.toFixed(2)),
    },
  });
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function resetBattleMotionStyles(battleView) {
  battleView.querySelectorAll(".battle-board .minion-card").forEach((card) => {
    card.style.removeProperty("--attack-dash-x");
    card.style.removeProperty("--attack-dash-y");
    card.style.removeProperty("--impact-shift-x");
    card.style.removeProperty("--impact-shift-y");
  });
}

function getBattleDashMotion(attacker, defender) {
  const deltaX = defender.x - attacker.x;
  const deltaY = defender.y - attacker.y;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const overlapDepth = Math.min(attacker.height, defender.height) * 0.42;
  const collisionCenterDistance = (attacker.height + defender.height) / 2 - overlapDepth;
  const travelDistance = clampNumber(distance - collisionCenterDistance, 32, distance * 0.84);
  const unitX = deltaX / distance;
  const unitY = deltaY / distance;
  const dashX = unitX * travelDistance;
  const dashY = unitY * travelDistance;
  const impactDistance = Math.min(10, Math.max(4, travelDistance * 0.05));
  return {
    dashX,
    dashY,
    impactX: unitX * impactDistance,
    impactY: unitY * impactDistance,
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
