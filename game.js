import {
  BATTLE_INTRO_DELAY_MS,
  POST_BATTLE_DELAY_MS,
  POINTER_DRAG_START_DISTANCE,
  PREP_SECONDS_EARLY,
  PREP_SECONDS_NORMAL,
  TIMER_TICK_MS,
  TOUCH_DRAG_CANCEL_DISTANCE,
  TOUCH_LONG_PRESS_MS,
  UPGRADE_COSTS,
} from "./src/data/rules.js";
import { copyMinion } from "./src/data/minions.js";
import { simulateBattle } from "./src/battle/simulateBattle.js";
import {
  buyMinionState,
  getCenterInsertIndex,
  moveBoardMinionState,
  moveHandMinionState,
  playMinionState,
  refreshShopState,
  sellMinionFromZoneState,
  toggleFreezeShopState,
  upgradeTavernState,
} from "./src/game/roster.js";
import {
  generateEnemyBoard as generateEnemyBoardState,
  generateShop as generateShopState,
  refillShop as refillShopState,
  startNextTurnState,
} from "./src/game/shop.js";

let prepTimerId = null;
let postBattleTimerId = null;
let battleAnimationTimerId = null;
let battleAnimationRunId = 0;
let dragState = createDragState();

const state = createInitialState();

const elements = {
  turn: document.querySelector("#turn-value"),
  gold: document.querySelector("#gold-value"),
  hp: document.querySelector("#hp-value"),
  tier: document.querySelector("#tier-value"),
  phase: document.querySelector("#phase-value"),
  timer: document.querySelector("#timer-value"),
  timerCard: document.querySelector("#timer-card"),
  message: document.querySelector("#message-value"),
  shop: document.querySelector("#shop-board"),
  hand: document.querySelector("#hand-board"),
  board: document.querySelector("#player-board"),
  prepPanel: document.querySelector(".prep-panel"),
  battleView: document.querySelector("#battle-view"),
  battleEnemy: document.querySelector("#battle-enemy-board"),
  battlePlayer: document.querySelector("#battle-player-board"),
  refreshBtn: document.querySelector("#refresh-btn"),
  upgradeBtn: document.querySelector("#upgrade-btn"),
  freezeBtn: document.querySelector("#freeze-btn"),
  battleBtn: document.querySelector("#battle-btn"),
  resetBtn: document.querySelector("#reset-btn"),
};

const prepZones = {
  shop: elements.shop?.closest(".prep-zone") || null,
  hand: elements.hand?.closest(".prep-zone") || null,
  board: elements.board?.closest(".prep-zone") || null,
};

elements.refreshBtn?.addEventListener("click", refreshShop);
elements.upgradeBtn?.addEventListener("click", upgradeTavern);
elements.freezeBtn?.addEventListener("click", toggleFreezeShop);
elements.battleBtn?.addEventListener("click", () => endTurnAndBattle("manual"));
elements.resetBtn?.addEventListener("click", resetGame);

window.addEventListener("pointermove", handleGlobalPointerMove);
window.addEventListener("pointerup", handleGlobalPointerUp);
window.addEventListener("pointercancel", cancelDragInteraction);
window.addEventListener("blur", cancelDragInteraction);

startPrepPhase();

function createInitialState() {
  const initial = {
    turn: 1,
    hp: 30,
    gold: 3,
    tavernTier: 1,
    phase: "prep",
    timeLeft: getPrepDuration(1),
    prepEndsAt: null,
    shopFrozen: false,
    shop: [],
    hand: [],
    board: [],
    enemyBoard: [],
    lastBattle: {
      summary: "战斗尚未开始。",
      playerSnapshot: [],
      enemySnapshot: [],
      logs: [],
      winner: "draw",
    },
    battleAnimation: createBattleAnimationState(),
    message: getPrepStartMessage(1),
  };

  initial.shop = generateShopState(initial.tavernTier, pickRandom);
  initial.enemyBoard = generateEnemyBoardState(initial.turn, pickRandom, randomInt);
  return initial;
}

function createBattleAnimationState() {
  return {
    active: false,
    isAnimating: false,
    playerBoard: [],
    enemyBoard: [],
    attackerId: null,
    defenderId: null,
    attackerSide: "",
    defenderSide: "",
    hitIds: [],
    defeatedIds: [],
    progressLabel: "等待开战",
    logLines: [],
  };
}

function createDragState() {
  return {
    status: "idle",
    pointerId: null,
    sourceZone: "",
    sourceIndex: -1,
    sourceElement: null,
    previewElement: null,
    pointerType: "",
    startX: 0,
    startY: 0,
    pointerX: 0,
    pointerY: 0,
    offsetX: 0,
    offsetY: 0,
    timerId: null,
    currentZone: "",
    currentIndex: -1,
  };
}

function resetGame() {
  stopPrepTimer();
  stopPostBattleReturn();
  stopBattlePlayback();
  cleanupDragState();
  const freshState = createInitialState();
  Object.assign(state, freshState);
  startPrepPhase();
}

function render() {
  const isPrep = state.phase === "prep";
  if (!isPrep && dragState.status !== "idle") {
    cleanupDragState();
  }

  elements.turn.textContent = state.turn;
  elements.gold.textContent = state.gold;
  elements.hp.textContent = Math.max(0, state.hp);
  elements.tier.textContent = state.tavernTier;
  elements.phase.textContent = getPhaseLabel(state.phase);
  syncTimerDisplay();
  elements.message.textContent = state.message;
  elements.battleView.classList.toggle("hidden", isPrep);

  if (!(isPrep && dragState.status !== "idle")) {
    renderShop();
    renderHand();
    renderPlayerBoard();
  }

  renderBattleBoards();
  syncButtons();
}

function syncTimerDisplay() {
  const isPrep = state.phase === "prep";
  elements.timer.textContent = isPrep ? `${state.timeLeft}s` : state.phase === "gameOver" ? "结束" : "战斗中";
  elements.timerCard.classList.toggle("urgent", isPrep && state.timeLeft <= 5);
}

function syncButtons() {
  const isPrep = state.phase === "prep";
  const isGameOver = state.hp <= 0 || state.phase === "gameOver";
  const upgradeCost = UPGRADE_COSTS[state.tavernTier];

  elements.refreshBtn.disabled = !isPrep || isGameOver || state.gold < REFRESH_COST;
  elements.battleBtn.disabled = !isPrep || isGameOver;
  elements.freezeBtn.disabled = !isPrep || isGameOver || !state.shop.length;
  elements.upgradeBtn.disabled =
    !isPrep || isGameOver || upgradeCost === null || state.gold < upgradeCost;
  elements.upgradeBtn.textContent =
    upgradeCost === null ? "商店已满级" : `升级商店（${upgradeCost} 金）`;
  elements.refreshBtn.textContent = `刷新（${REFRESH_COST} 金）`;
  elements.freezeBtn.textContent = state.shopFrozen ? "已冻结" : "冻结";
  elements.freezeBtn.classList.toggle("frozen", state.shopFrozen);
}

function renderShop() {
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

function renderHand() {
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

function renderPlayerBoard() {
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

function renderBattleBoards() {
  const usingAnimation = state.phase === "battle" && state.battleAnimation.active;
  const playerSnapshot = state.phase === "prep"
    ? state.board
    : usingAnimation
      ? state.battleAnimation.playerBoard
      : state.lastBattle.playerSnapshot;
  const enemySnapshot = state.phase === "prep"
    ? state.enemyBoard
    : usingAnimation
      ? state.battleAnimation.enemyBoard
      : state.lastBattle.enemySnapshot;

  renderBattleLane(
    elements.battleEnemy,
    enemySnapshot,
    "战斗开始后，对手阵容会显示在这里。"
  );
  renderBattleLane(
    elements.battlePlayer,
    playerSnapshot,
    "你的战队会在战斗阶段显示在这里。"
  );
}

function renderBattleLane(container, minions, emptyText) {
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
      battleVisual: getBattleVisualState(minion, side),
    });
    container.appendChild(card);
  });
}

function buildMinionCard(minion, options = {}) {
  const { battle = false, showActions = true, slotLabel = "", battleVisual = null } = options;
  const healthValue = Math.max(0, minion.health);
  const healthClass = healthValue <= 0 ? "zero" : healthValue <= 2 ? "low" : "";
  const battleStateClasses = battleVisual
    ? [
        battleVisual.isAttacker ? "attacking" : "",
        battleVisual.isDefender ? "defending" : "",
        battleVisual.chargeClass,
        battleVisual.takingHit ? "taking-hit" : "",
        battleVisual.defeated ? "defeated" : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const card = document.createElement("article");
  card.className = `minion-card${minion.golden ? " golden" : ""}${battle ? " battle-card" : ""}${battleStateClasses ? ` ${battleStateClasses}` : ""}`;

  const keywords = minion.keywords
    .map((keyword) => {
      const label = getKeywordLabel(keyword);
      const className =
        keyword === "taunt" || keyword === "provoke"
          ? "keyword taunt"
          : keyword === "divineShield"
            ? "keyword shield"
            : "keyword";
      return `<span class="${className}">${label}</span>`;
    })
    .join("");

  const battleTop = battle
    ? `
      <div class="battle-card-top">
        <span class="battle-slot">${slotLabel}</span>
        ${battleVisual?.roleLabel ? `<span class="battle-role ${battleVisual.roleClass}">${battleVisual.roleLabel}</span>` : ""}
      </div>
    `
    : "";

  const infoToggle = !battle ? '<button type="button" class="card-info-toggle" aria-label="查看描述">i</button>' : "";
  const descriptionBlock = battle ? `<p class="minion-text">${minion.text || "没有额外效果。"}</p>` : "";
  const infoOverlay = !battle
    ? `
      <div class="minion-info-overlay">
        <div class="minion-info-label">随从描述</div>
        <h4 class="minion-info-name">${minion.name}</h4>
        <p class="minion-info-text">${minion.text || "没有额外效果。"}</p>
      </div>
    `
    : "";

  card.innerHTML = `
    <div class="minion-main">
      ${battleTop}
      <div class="minion-header">
        <span class="tier-badge">★${minion.tier}</span>
        <div class="minion-title-block">
          <h3 class="minion-name">${minion.golden ? "金色" : ""}${minion.name}</h3>
          <div class="minion-meta">${minion.tribe}</div>
        </div>
        ${infoToggle}
      </div>
      ${descriptionBlock}
      <div class="keyword-row">${keywords}</div>
      ${infoOverlay}
    </div>
    <div>
      <div class="stats-row">
        <div class="stats">
          <span class="stat-pill attack">${minion.attack}</span>
          <span class="stat-pill health ${healthClass}">${healthValue}</span>
        </div>
      </div>
      ${showActions ? '<div class="card-actions"></div>' : ""}
    </div>
  `;

  return card;
}

function getBattleVisualState(minion, side) {
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

function makeMiniButton(label, onClick, disabled, variant = "alt") {
  const button = document.createElement("button");
  button.className = `mini-btn${variant ? ` ${variant}` : ""}`;
  button.textContent = label;
  button.disabled = disabled;
  button.addEventListener("click", onClick);
  return button;
}

function makeEmptyCard(text) {
  const card = document.createElement("div");
  card.className = "empty-card";
  card.textContent = text;
  return card;
}

function getKeywordLabel(keyword) {
  if (keyword === "taunt") {
    return "嘲讽";
  }
  if (keyword === "provoke") {
    return "挑衅";
  }
  if (keyword === "divineShield") {
    return "圣盾";
  }
  if (keyword === "deathrattle") {
    return "亡语";
  }
  return keyword;
}

function bindPrepCardInteractions(card, zone, index, disabled) {
  card.dataset.zone = zone;
  card.dataset.index = String(index);
  if (disabled) {
    return;
  }

  card.classList.add("draggable-card");
  card.addEventListener("pointerdown", (event) => {
    beginCardDragPress(event, zone, index, card);
  });
}

function beginCardDragPress(event, zone, index, card) {
  if (event.button !== 0 || state.phase !== "prep" || state.hp <= 0) {
    return;
  }
  if (event.target.closest("button")) {
    return;
  }

  cancelDragInteraction();
  event.preventDefault();

  try {
    card.setPointerCapture(event.pointerId);
  } catch (error) {
    // Ignore capture failures on unsupported browsers.
  }

  dragState = {
    ...createDragState(),
    status: "pending",
    pointerId: event.pointerId,
    pointerType: event.pointerType || "mouse",
    sourceZone: zone,
    sourceIndex: index,
    sourceElement: card,
    startX: event.clientX,
    startY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
  };

  if (requiresLongPressDrag(dragState.pointerType)) {
    dragState.timerId = window.setTimeout(() => {
      activateDrag();
    }, TOUCH_LONG_PRESS_MS);
  }
}

function handleGlobalPointerMove(event) {
  if (dragState.status === "idle" || event.pointerId !== dragState.pointerId) {
    return;
  }

  dragState.pointerX = event.clientX;
  dragState.pointerY = event.clientY;

  if (dragState.status === "pending") {
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (!requiresLongPressDrag(dragState.pointerType) && distance >= POINTER_DRAG_START_DISTANCE) {
      activateDrag();
      if (dragState.status !== "active") {
        return;
      }
    } else if (requiresLongPressDrag(dragState.pointerType) && distance > TOUCH_DRAG_CANCEL_DISTANCE) {
      cancelDragInteraction();
      return;
    } else {
      return;
    }
  }

  event.preventDefault();
  updateDragPreviewPosition(event.clientX, event.clientY);
  updateDropTargetState(event.clientX, event.clientY);
}

function requiresLongPressDrag(pointerType) {
  return pointerType === "touch";
}

function handleGlobalPointerUp(event) {
  if (dragState.status === "idle" || event.pointerId !== dragState.pointerId) {
    return;
  }

  const shouldDrop = dragState.status === "active";
  const payload = shouldDrop
    ? {
        sourceZone: dragState.sourceZone,
        sourceIndex: dragState.sourceIndex,
        targetZone: dragState.currentZone,
        targetIndex: dragState.currentIndex,
      }
    : null;

  cleanupDragState();
  if (shouldDrop && payload) {
    applyCardDrop(payload);
  }
}

function activateDrag() {
  if (dragState.status !== "pending" || !dragState.sourceElement?.isConnected) {
    cleanupDragState();
    return;
  }

  const rect = dragState.sourceElement.getBoundingClientRect();
  const preview = dragState.sourceElement.cloneNode(true);
  preview.classList.add("drag-preview");
  preview.style.width = `${rect.width}px`;
  preview.style.height = `${rect.height}px`;
  preview.style.left = `${rect.left}px`;
  preview.style.top = `${rect.top}px`;
  document.body.appendChild(preview);

  dragState.status = "active";
  dragState.previewElement = preview;
  dragState.offsetX = dragState.startX - rect.left;
  dragState.offsetY = dragState.startY - rect.top;
  dragState.sourceElement.classList.add("drag-source");
  document.body.classList.add("dragging-card");

  updateDragPreviewPosition(dragState.pointerX, dragState.pointerY);
  updateDropTargetState(dragState.pointerX, dragState.pointerY);
}

function updateDragPreviewPosition(clientX, clientY) {
  if (!dragState.previewElement) {
    return;
  }

  dragState.previewElement.style.left = `${clientX - dragState.offsetX}px`;
  dragState.previewElement.style.top = `${clientY - dragState.offsetY}px`;
}

function updateDropTargetState(clientX, clientY) {
  const hoveredZone = getPriorityDropZone(clientX, clientY);
  const zone = isValidDropZone(dragState.sourceZone, hoveredZone) ? hoveredZone : "";
  const index = zone === "hand" || zone === "board" ? getDropIndex(zone, clientX) : -1;

  dragState.currentZone = zone;
  dragState.currentIndex = index;

  Object.entries(prepZones).forEach(([key, element]) => {
    element?.classList.toggle("drop-target", key === zone);
  });
  elements.prepPanel?.classList.toggle("sell-armed", zone === "sell");
}

function getShopPurchaseZone() {
  const pointerZone = getDropZoneAtPoint(dragState.pointerX, dragState.pointerY);
  if (pointerZone === "hand" || pointerZone === "board") {
    return pointerZone;
  }

  const dragRect = getActiveDragRect();
  if (!dragRect) {
    return "";
  }

  const handRatio = getOverlapRatio(dragRect, prepZones.hand?.getBoundingClientRect());
  const boardRatio = getOverlapRatio(dragRect, prepZones.board?.getBoundingClientRect());

  if (boardRatio >= 0.28 && boardRatio >= handRatio) {
    return "board";
  }
  if (handRatio >= 0.28) {
    return "hand";
  }
  return "";
}

function getActiveDragRect() {
  if (dragState.previewElement) {
    return dragState.previewElement.getBoundingClientRect();
  }
  if (dragState.sourceElement?.isConnected) {
    return dragState.sourceElement.getBoundingClientRect();
  }
  return null;
}

function getOverlapRatio(sourceRect, targetRect) {
  if (!sourceRect || !targetRect) {
    return 0;
  }

  const overlapWidth = Math.max(
    0,
    Math.min(sourceRect.right, targetRect.right) - Math.max(sourceRect.left, targetRect.left)
  );
  const overlapHeight = Math.max(
    0,
    Math.min(sourceRect.bottom, targetRect.bottom) - Math.max(sourceRect.top, targetRect.top)
  );

  if (overlapWidth === 0 || overlapHeight === 0) {
    return 0;
  }

  const overlapArea = overlapWidth * overlapHeight;
  const sourceArea = sourceRect.width * sourceRect.height;
  return sourceArea > 0 ? overlapArea / sourceArea : 0;
}

function getPriorityDropZone(clientX, clientY) {
  if (dragState.sourceZone !== "shop" && isSellDropActive()) {
    return "sell";
  }

  return dragState.sourceZone === "shop" ? getShopPurchaseZone() : getDropZoneAtPoint(clientX, clientY);
}

function isSellDropActive() {
  const dragRect = getActiveDragRect();
  const prepPanelRect = elements.prepPanel?.getBoundingClientRect();
  if (!dragRect || !prepPanelRect) {
    return false;
  }

  return dragRect.top < prepPanelRect.top;
}

function isValidDropZone(sourceZone, targetZone) {
  if (!targetZone) {
    return false;
  }
  if (sourceZone === "shop") {
    return targetZone === "hand" || targetZone === "board";
  }
  if (sourceZone === "hand") {
    return targetZone === "hand" || targetZone === "board" || targetZone === "sell";
  }
  if (sourceZone === "board") {
    return targetZone === "board" || targetZone === "sell";
  }
  return false;
}

function getDropZoneAtPoint(clientX, clientY) {
  for (const [zone, element] of Object.entries(prepZones)) {
    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom) {
      return zone;
    }
  }
  return "";
}

function getDropIndex(zone, clientX) {
  const container = getZoneElement(zone);
  if (!container) {
    return -1;
  }

  const cards = [...container.querySelectorAll(".minion-card:not(.drag-source)")];
  for (let index = 0; index < cards.length; index += 1) {
    const rect = cards[index].getBoundingClientRect();
    if (clientX < rect.left + rect.width / 2) {
      return index;
    }
  }
  return cards.length;
}

function getZoneElement(zone) {
  if (zone === "shop") {
    return elements.shop;
  }
  if (zone === "hand") {
    return elements.hand;
  }
  if (zone === "board") {
    return elements.board;
  }
  return null;
}

function applyCardDrop({ sourceZone, sourceIndex, targetZone, targetIndex }) {
  if (!targetZone) {
    return;
  }

  if (sourceZone === "shop") {
    if (targetZone === "hand" || targetZone === "board") {
      buyMinion(sourceIndex);
    }
    return;
  }

  if (sourceZone === "hand") {
    if (targetZone === "sell") {
      sellMinionFromZone("hand", sourceIndex);
      return;
    }
    if (targetZone === "board") {
      playMinion(sourceIndex, targetIndex);
      return;
    }
    if (targetZone === "hand") {
      moveHandMinion(sourceIndex, targetIndex);
    }
    return;
  }

  if (sourceZone === "board") {
    if (targetZone === "sell") {
      sellMinionFromZone("board", sourceIndex);
      return;
    }
    if (targetZone === "board") {
      moveBoardMinion(sourceIndex, targetIndex);
    }
  }
}

function cleanupDragState() {
  if (dragState.timerId) {
    window.clearTimeout(dragState.timerId);
  }

  if (dragState.pointerId !== null) {
    try {
      dragState.sourceElement?.releasePointerCapture?.(dragState.pointerId);
    } catch (error) {
      // Ignore release failures.
    }
  }

  dragState.sourceElement?.classList.remove("drag-source");
  dragState.previewElement?.remove();
  Object.values(prepZones).forEach((element) => element?.classList.remove("drop-target"));
  elements.prepPanel?.classList.remove("sell-armed");
  document.body.classList.remove("dragging-card");
  dragState = createDragState();
}

function cancelDragInteraction() {
  if (dragState.status === "idle") {
    return;
  }
  cleanupDragState();
}

function refreshShop() {
  if (refreshShopState(state, (tier) => generateShopState(tier, pickRandom))) {
    render();
  }
}

function upgradeTavern() {
  if (upgradeTavernState(state, UPGRADE_COSTS, (tier) => generateShopState(tier, pickRandom))) {
    render();
  }
}

function toggleFreezeShop() {
  if (toggleFreezeShopState(state)) {
    render();
  }
}

function buyMinion(shopIndex) {
  if (buyMinionState(state, shopIndex)) {
    render();
  }
}

function playMinion(index, targetIndex = getCenterInsertIndex(state.board.length)) {
  if (playMinionState(state, index, targetIndex)) {
    render();
  }
}

function moveHandMinion(index, targetIndex) {
  if (moveHandMinionState(state, index, targetIndex)) {
    render();
  }
}

function moveBoardMinion(index, targetIndex) {
  if (moveBoardMinionState(state, index, targetIndex)) {
    render();
  }
}

function sellMinionFromZone(zone, index) {
  if (sellMinionFromZoneState(state, zone, index)) {
    render();
  }
}

function startPrepPhase() {
  stopPrepTimer();
  stopPostBattleReturn();
  stopBattlePlayback();
  state.phase = "prep";
  state.timeLeft = getPrepDuration(state.turn);
  state.prepEndsAt = Date.now() + state.timeLeft * 1000;
  prepTimerId = window.setInterval(updatePrepCountdown, TIMER_TICK_MS);
  render();
}

function stopPrepTimer() {
  if (prepTimerId !== null) {
    window.clearInterval(prepTimerId);
    prepTimerId = null;
  }
}

function updatePrepCountdown() {
  if (state.phase !== "prep") {
    stopPrepTimer();
    return;
  }

  const remainingMs = state.prepEndsAt - Date.now();
  const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  if (remainingSeconds !== state.timeLeft) {
    state.timeLeft = remainingSeconds;
    syncTimerDisplay();
  }
  if (remainingMs <= 0) {
    endTurnAndBattle("timer");
  }
}

function endTurnAndBattle(trigger = "manual") {
  if (state.phase !== "prep" || state.hp <= 0) {
    return;
  }

  stopPrepTimer();
  stopPostBattleReturn();
  stopBattlePlayback();
  state.timeLeft = 0;

  const intro = trigger === "timer" ? "准备时间结束，自动进入战斗。" : "你提前结束了准备阶段。";
  const result = simulateBattle(state.board, state.enemyBoard);
  const damage = result.winner === "enemy"
    ? Math.max(1, result.remainingEnemy.reduce((sum, minion) => sum + minion.tier, 0))
    : 0;
  const roundMessage =
    result.winner === "player"
      ? "这回合打赢了。"
      : result.winner === "enemy"
        ? `这回合没打过，掉了 ${damage} 点血。`
        : "这回合打平了。";

  state.phase = "battle";
  state.lastBattle = {
    summary: intro,
    playerSnapshot: state.board.map(copyMinion),
    enemySnapshot: state.enemyBoard.map(copyMinion),
    logs: [],
    winner: result.winner,
  };
  state.message = "战斗开始，正在结算中。";
  beginBattlePlayback(result, intro, roundMessage, damage);
}

function beginBattlePlayback(result, intro, roundMessage, damage) {
  const runId = ++battleAnimationRunId;
  state.battleAnimation = {
    active: true,
    isAnimating: true,
    playerBoard: result.startingPlayer.map(copyMinion),
    enemyBoard: result.startingEnemy.map(copyMinion),
    attackerId: null,
    defenderId: null,
    attackerSide: "",
    defenderSide: "",
    hitIds: [],
    defeatedIds: [],
    progressLabel: "战斗开始",
    logLines: [],
  };
  render();

  void playBattleFrames(runId, result, intro, roundMessage, damage);
}

function continueToNextTurn() {
  if (state.phase !== "battle" || state.hp <= 0) {
    return;
  }

  startNextTurn();
  state.message = getPrepStartMessage(state.turn);
  startPrepPhase();
}

function stopPostBattleReturn() {
  if (postBattleTimerId !== null) {
    window.clearTimeout(postBattleTimerId);
    postBattleTimerId = null;
  }
}

function stopBattlePlayback() {
  battleAnimationRunId += 1;
  if (battleAnimationTimerId !== null) {
    window.clearTimeout(battleAnimationTimerId);
    battleAnimationTimerId = null;
  }
  state.battleAnimation = createBattleAnimationState();
}

function waitBattleDelay(ms) {
  return new Promise((resolve) => {
    battleAnimationTimerId = window.setTimeout(() => {
      battleAnimationTimerId = null;
      resolve();
    }, ms);
  });
}

async function playBattleFrames(runId, result, intro, roundMessage, damage) {
  await waitBattleDelay(BATTLE_INTRO_DELAY_MS);
  if (runId !== battleAnimationRunId) {
    return;
  }

  for (const frame of result.frames) {
    state.battleAnimation.playerBoard = frame.playerBoard.map(copyMinion);
    state.battleAnimation.enemyBoard = frame.enemyBoard.map(copyMinion);
    state.battleAnimation.attackerId = frame.attackerId;
    state.battleAnimation.defenderId = frame.defenderId;
    state.battleAnimation.attackerSide = frame.attackerSide;
    state.battleAnimation.defenderSide = frame.defenderSide;
    state.battleAnimation.hitIds = [...frame.hitIds];
    state.battleAnimation.defeatedIds = [...frame.defeatedIds];
    state.battleAnimation.progressLabel = frame.progress;
    if (frame.log) {
      state.battleAnimation.logLines = [...state.battleAnimation.logLines, frame.log];
    }
    render();
    await waitBattleDelay(frame.delay);
    if (runId !== battleAnimationRunId) {
      return;
    }
  }

  if (damage > 0) {
    state.hp -= damage;
  }

  state.battleAnimation = {
    ...state.battleAnimation,
    active: true,
    isAnimating: false,
    playerBoard: result.remainingPlayer.map(copyMinion),
    enemyBoard: result.remainingEnemy.map(copyMinion),
    attackerId: null,
    defenderId: null,
    attackerSide: "",
    defenderSide: "",
    hitIds: [],
    defeatedIds: [],
    progressLabel: result.summary,
  };
  state.lastBattle = {
    summary: `${intro}${result.summary}`,
    playerSnapshot: result.startingPlayer.map(copyMinion),
    enemySnapshot: result.startingEnemy.map(copyMinion),
    logs: [...result.logs],
    winner: result.winner,
  };

  if (state.hp <= 0) {
    state.phase = "gameOver";
    state.message = "酒馆之旅结束了，点击重新开始可以再来一局。";
  } else {
    state.phase = "battle";
    state.message = roundMessage;
    stopPostBattleReturn();
    postBattleTimerId = window.setTimeout(() => {
      postBattleTimerId = null;
      continueToNextTurn();
    }, POST_BATTLE_DELAY_MS);
  }

  render();
}

function startNextTurn() {
  startNextTurnState(
    state,
    (tier) => generateShopState(tier, pickRandom),
    (shop, tier) => refillShopState(shop, tier, pickRandom),
    (turn) => generateEnemyBoardState(turn, pickRandom, randomInt)
  );
}

function getPrepDuration(turn) {
  return turn <= 3 ? PREP_SECONDS_EARLY : PREP_SECONDS_NORMAL;
}

function getPrepStartMessage(turn) {
  return `第 ${turn} 回合准备阶段开始，${getPrepDuration(turn)} 秒后自动战斗。`;
}

function getPhaseLabel(phase) {
  if (phase === "prep") {
    return "准备中";
  }
  if (phase === "battle") {
    return "战斗中";
  }
  return "已结束";
}

function pickRandom(list) {
  return list[randomInt(0, list.length - 1)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
