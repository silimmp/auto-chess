const BUY_COST = 3;
const REFRESH_COST = 1;
const BOARD_LIMIT = 7;
const HAND_LIMIT = 7;
const MAX_TAVERN_TIER = 7;
const PREP_SECONDS_EARLY = 15;
const PREP_SECONDS_NORMAL = 25;
const TIMER_TICK_MS = 250;
const POST_BATTLE_DELAY_MS = 1400;
const LONG_PRESS_MS = 140;
const DRAG_CANCEL_DISTANCE = 24;

const UPGRADE_COSTS = {
  1: 5,
  2: 7,
  3: 8,
  4: 9,
  5: 10,
  6: 11,
  7: null,
};

const MINION_POOL = [
  {
    id: "alley-cat",
    name: "巷口野猫",
    tier: 1,
    tribe: "野兽",
    attack: 1,
    health: 1,
    keywords: ["deathrattle"],
    deathrattle: { type: "summon", minionId: "tabby-cat", count: 1 },
    text: "亡语：召唤一个 1/1 小猫。",
  },
  {
    id: "tabby-cat",
    name: "小猫",
    tier: 1,
    tribe: "野兽",
    attack: 1,
    health: 1,
    keywords: [],
    token: true,
    text: "衍生物。",
  },
  {
    id: "murloc-scout",
    name: "恶魔斥候",
    tier: 1,
    tribe: "恶魔",
    attack: 2,
    health: 1,
    keywords: [],
    text: "朴素的前期战力。",
  },
  {
    id: "shield-bot",
    name: "护盾机器人",
    tier: 1,
    tribe: "机械",
    attack: 1,
    health: 2,
    keywords: ["divineShield"],
    text: "圣盾。",
  },
  {
    id: "taunt-guard",
    name: "人类守卫",
    tier: 1,
    tribe: "人类",
    attack: 2,
    health: 3,
    keywords: ["taunt"],
    text: "嘲讽。",
  },
  {
    id: "rat-pack",
    name: "亡灵鼠群",
    tier: 2,
    tribe: "亡灵",
    attack: 2,
    health: 2,
    keywords: ["deathrattle"],
    deathrattle: { type: "summon", minionId: "rat-token", countBy: "attack" },
    text: "亡语：召唤若干 1/1 老鼠。",
  },
  {
    id: "rat-token",
    name: "亡灵老鼠",
    tier: 1,
    tribe: "亡灵",
    attack: 1,
    health: 1,
    keywords: [],
    token: true,
    text: "衍生物。",
  },
  {
    id: "spawn-bot",
    name: "产线机器人",
    tier: 2,
    tribe: "机械",
    attack: 2,
    health: 1,
    keywords: ["deathrattle"],
    deathrattle: { type: "summon", minionId: "micro-bot", count: 2 },
    text: "亡语：召唤两个 1/1 微型机器人。",
  },
  {
    id: "micro-bot",
    name: "微型机器人",
    tier: 1,
    tribe: "机械",
    attack: 1,
    health: 1,
    keywords: [],
    token: true,
    text: "衍生物。",
  },
  {
    id: "stone-boar",
    name: "石牙野猪",
    tier: 2,
    tribe: "野兽",
    attack: 3,
    health: 3,
    keywords: [],
    text: "纯粹的身材牌。",
  },
  {
    id: "shell-tank",
    name: "甲壳坦克",
    tier: 2,
    tribe: "中立",
    attack: 3,
    health: 4,
    keywords: ["taunt"],
    text: "高血量嘲讽前排。",
  },
  {
    id: "retired-veteran",
    name: "退役老兵",
    tier: 2,
    tribe: "人类",
    attack: 4,
    health: 4,
    keywords: ["provoke"],
    text: "挑衅。",
  },
  {
    id: "assault-cannon",
    name: "进击火炮",
    tier: 3,
    tribe: "机械",
    attack: 3,
    health: 3,
    keywords: [],
    combatStart: { type: "deal-random-damage", amount: 2 },
    text: "战斗开始时，对一个敌方随从造成 2 点伤害。",
  },
  {
    id: "arena-champion",
    name: "兽人统领",
    tier: 3,
    tribe: "兽人",
    attack: 5,
    health: 4,
    keywords: [],
    text: "中期可靠的打手。",
  },
  {
    id: "holy-mech",
    name: "圣光巫师",
    tier: 3,
    tribe: "巫师",
    attack: 4,
    health: 3,
    keywords: ["divineShield"],
    text: "更凶的圣盾单位。",
  },
  {
    id: "dire-guardian",
    name: "人类守备官",
    tier: 3,
    tribe: "人类",
    attack: 4,
    health: 5,
    keywords: ["taunt"],
    text: "中期嘲讽墙。",
  },
];

const byId = new Map(MINION_POOL.map((minion) => [minion.id, minion]));

let nextInstanceId = 1;
let prepTimerId = null;
let postBattleTimerId = null;
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
      winner: "draw",
    },
    message: getPrepStartMessage(1),
  };

  initial.shop = generateShop(initial.tavernTier);
  initial.enemyBoard = generateEnemyBoard(initial.turn);
  return initial;
}

function createDragState() {
  return {
    status: "idle",
    pointerId: null,
    sourceZone: "",
    sourceIndex: -1,
    sourceElement: null,
    previewElement: null,
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
  elements.timer.textContent = isPrep ? `${state.timeLeft}s` : state.phase === "gameOver" ? "结束" : "战斗中";
  elements.timerCard.classList.toggle("urgent", isPrep && state.timeLeft <= 5);
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
  const playerSnapshot =
    state.phase === "prep" ? state.board : state.lastBattle.playerSnapshot;
  const enemySnapshot =
    state.phase === "prep" ? state.enemyBoard : state.lastBattle.enemySnapshot;

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
    const card = buildMinionCard(minion, {
      battle: true,
      showActions: false,
      slotLabel: `位置 ${index + 1}`,
    });
    container.appendChild(card);
  });
}

function buildMinionCard(minion, options = {}) {
  const { battle = false, showActions = true, slotLabel = "" } = options;
  const healthValue = Math.max(0, minion.health);
  const healthClass = healthValue <= 0 ? "zero" : healthValue <= 2 ? "low" : "";

  const card = document.createElement("article");
  card.className = `minion-card${minion.golden ? " golden" : ""}${battle ? " battle-card" : ""}`;

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
    ? `<div class="battle-card-top"><span class="battle-slot">${slotLabel}</span></div>`
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
        <div>
          <h3 class="minion-name">${minion.golden ? "金色" : ""}${minion.name}</h3>
          <div class="minion-meta">${minion.tribe}</div>
        </div>
        <div class="minion-header-side">
          ${infoToggle}
          <span class="tier-badge">T${minion.tier}</span>
        </div>
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

  const infoButton = card.querySelector(".card-info-toggle");
  infoButton?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    card.classList.toggle("info-open");
  });

  return card;
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
    sourceZone: zone,
    sourceIndex: index,
    sourceElement: card,
    startX: event.clientX,
    startY: event.clientY,
    pointerX: event.clientX,
    pointerY: event.clientY,
  };

  dragState.timerId = window.setTimeout(() => {
    activateDrag();
  }, LONG_PRESS_MS);
}

function handleGlobalPointerMove(event) {
  if (dragState.status === "idle" || event.pointerId !== dragState.pointerId) {
    return;
  }

  dragState.pointerX = event.clientX;
  dragState.pointerY = event.clientY;

  if (dragState.status === "pending") {
    const distance = Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY);
    if (distance > DRAG_CANCEL_DISTANCE) {
      cancelDragInteraction();
    }
    return;
  }

  event.preventDefault();
  updateDragPreviewPosition(event.clientX, event.clientY);
  updateDropTargetState(event.clientX, event.clientY);
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
  const dragRect = getActiveDragRect();
  if (!dragRect) {
    return "";
  }

  const handRatio = getOverlapRatio(dragRect, prepZones.hand?.getBoundingClientRect());
  const boardRatio = getOverlapRatio(dragRect, prepZones.board?.getBoundingClientRect());

  if (boardRatio >= 0.5 && boardRatio >= handRatio) {
    return "board";
  }
  if (handRatio >= 0.5) {
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
  if (state.phase !== "prep" || state.gold < REFRESH_COST || state.hp <= 0) {
    return;
  }

  state.gold -= REFRESH_COST;
  state.shop = generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.message = "酒馆老板换了一批货。";
  render();
}

function upgradeTavern() {
  const upgradeCost = UPGRADE_COSTS[state.tavernTier];
  if (state.phase !== "prep" || upgradeCost === null || state.gold < upgradeCost || state.hp <= 0) {
    return;
  }

  state.gold -= upgradeCost;
  state.tavernTier += 1;
  state.shop = generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.message = `酒馆升级到 ${state.tavernTier} 级。`;
  render();
}

function toggleFreezeShop() {
  if (state.phase !== "prep" || state.hp <= 0 || !state.shop.length) {
    return;
  }

  state.shopFrozen = !state.shopFrozen;
  state.message = state.shopFrozen ? "本轮商店已冻结。" : "已取消冻结。";
  render();
}

function buyMinion(shopIndex) {
  if (state.phase !== "prep") {
    return;
  }

  const shopMinion = state.shop[shopIndex];
  if (!shopMinion) {
    return;
  }
  if (state.gold < BUY_COST) {
    state.message = "金币不够，先忍一手。";
    render();
    return;
  }
  if (state.hand.length >= HAND_LIMIT) {
    state.message = "手牌已满，先处理一下手牌。";
    render();
    return;
  }

  state.gold -= BUY_COST;
  state.shop.splice(shopIndex, 1);
  const purchasedMinion = createOwnedMinion(shopMinion.id);
  state.hand.push(purchasedMinion);

  const merged = resolveTriples();
  state.message = buildRecruitMessage(`买下了 ${shopMinion.name}，已置入手牌`, merged);
  render();
}

function playMinion(index, targetIndex = getCenterInsertIndex(state.board.length)) {
  if (state.phase !== "prep") {
    return;
  }

  const minion = state.hand[index];
  if (!minion || state.hp <= 0) {
    return;
  }
  if (state.board.length >= BOARD_LIMIT) {
    state.message = "战队已满，先腾一个位置。";
    render();
    return;
  }

  state.hand.splice(index, 1);
  const insertIndex = normalizeInsertIndex(targetIndex, state.board.length);
  state.board.splice(insertIndex, 0, minion);

  const merged = resolveTriples();
  state.message = buildRecruitMessage(`派出了 ${minion.name}`, merged);
  render();
}

function moveHandMinion(index, targetIndex) {
  if (state.phase !== "prep") {
    return;
  }
  if (!state.hand[index]) {
    return;
  }

  if (reorderList(state.hand, index, targetIndex)) {
    state.message = "手牌顺序已调整。";
    render();
  }
}

function moveBoardMinion(index, targetIndex) {
  if (state.phase !== "prep") {
    return;
  }
  if (!state.board[index]) {
    return;
  }

  if (reorderList(state.board, index, targetIndex)) {
    state.message = "站位已调整。";
    render();
  }
}

function sellMinionFromZone(zone, index) {
  if (state.phase !== "prep") {
    return;
  }

  const list = zone === "hand" ? state.hand : zone === "board" ? state.board : null;
  const minion = list?.[index];
  if (!list || !minion || state.hp <= 0) {
    return;
  }

  list.splice(index, 1);
  state.gold = Math.min(10, state.gold + 1);
  state.message = `卖掉了 ${minion.name}，回收 1 金。`;
  render();
}

function reorderList(list, fromIndex, targetIndex) {
  if (fromIndex < 0 || fromIndex >= list.length) {
    return false;
  }

  const normalizedTarget = normalizeInsertIndex(targetIndex, list.length - 1);
  const [item] = list.splice(fromIndex, 1);
  const insertIndex = normalizeInsertIndex(normalizedTarget, list.length);

  if (insertIndex === fromIndex) {
    list.splice(fromIndex, 0, item);
    return false;
  }

  list.splice(insertIndex, 0, item);
  return true;
}

function normalizeInsertIndex(index, length) {
  if (!Number.isFinite(index)) {
    return length;
  }
  return Math.max(0, Math.min(length, index));
}

function getCenterInsertIndex(length) {
  if (length <= 1) {
    return length;
  }
  return Math.ceil(length / 2);
}

function resolveTriples() {
  const triple = findTripleEntries();
  if (!triple) {
    return [];
  }

  const base = triple[0].minion;
  removeOwnedEntries(triple);
  const golden = {
    ...copyMinion(base),
    attack: base.attack * 2,
    health: base.health * 2,
    golden: true,
    instanceId: nextInstanceId++,
  };

  state.hand.unshift(golden);
  return [golden];
}

function findTripleEntries() {
  const bucket = new Map();
  const entries = [
    ...state.hand.map((minion, index) => ({ zone: "hand", index, minion })),
    ...state.board.map((minion, index) => ({ zone: "board", index, minion })),
  ];

  entries.forEach((entry) => {
    if (entry.minion.golden) {
      return;
    }
    const list = bucket.get(entry.minion.id) || [];
    list.push(entry);
    bucket.set(entry.minion.id, list);
  });

  for (const list of bucket.values()) {
    if (list.length >= 3) {
      return list.slice(0, 3);
    }
  }
  return null;
}

function removeOwnedEntries(entries) {
  const byZone = new Map();
  entries.forEach((entry) => {
    const list = byZone.get(entry.zone) || [];
    list.push(entry.index);
    byZone.set(entry.zone, list);
  });

  byZone.forEach((indexes, zone) => {
    const target = zone === "hand" ? state.hand : state.board;
    indexes
      .slice()
      .sort((a, b) => b - a)
      .forEach((index) => {
        target.splice(index, 1);
      });
  });
}

function buildRecruitMessage(baseMessage, mergedMinions) {
  if (!mergedMinions.length) {
    return `${baseMessage}。`;
  }
  return `${baseMessage}，触发了 ${mergedMinions.length} 次三连合成，金色随从已进入手牌。`;
}

function startPrepPhase() {
  stopPrepTimer();
  stopPostBattleReturn();
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
    render();
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
  state.timeLeft = 0;

  const intro = trigger === "timer" ? "准备时间结束，自动进入战斗。" : "你提前结束了准备阶段。";
  const result = simulateBattle(state.board, state.enemyBoard);

  if (result.winner === "player") {
    state.message = "这回合打赢了。";
  } else if (result.winner === "enemy") {
    const damage = Math.max(1, result.remainingEnemy.reduce((sum, minion) => sum + minion.tier, 0));
    state.hp -= damage;
    state.message = `这回合没打过，掉了 ${damage} 点血。`;
  } else {
    state.message = "这回合打平了。";
  }

  state.lastBattle = {
    summary: `${intro}${result.summary}`,
    playerSnapshot: state.board.map(copyMinion),
    enemySnapshot: state.enemyBoard.map(copyMinion),
    winner: result.winner,
  };

  if (state.hp <= 0) {
    state.phase = "gameOver";
    state.message = "酒馆之旅结束了，点击重新开始可以再来一局。";
  } else {
    state.phase = "battle";
    stopPostBattleReturn();
    postBattleTimerId = window.setTimeout(() => {
      postBattleTimerId = null;
      continueToNextTurn();
    }, POST_BATTLE_DELAY_MS);
  }

  render();
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

function startNextTurn() {
  state.turn += 1;
  state.gold = Math.min(10, state.turn + 2);
  state.shop = state.shopFrozen ? refillShop(state.shop, state.tavernTier) : generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.enemyBoard = generateEnemyBoard(state.turn);
}

function generateShop(maxTier) {
  const effectiveTier = Math.min(maxTier, 3);
  const candidates = MINION_POOL.filter((minion) => !minion.token && minion.tier <= effectiveTier);
  return Array.from({ length: 5 }, () => cloneTemplate(pickRandom(candidates)));
}

function refillShop(currentShop, maxTier) {
  const filledShop = currentShop.map(cloneTemplate);
  const missing = Math.max(0, 5 - filledShop.length);
  if (missing === 0) {
    return filledShop;
  }
  return [...filledShop, ...generateShop(maxTier).slice(0, missing)];
}

function generateEnemyBoard(turn) {
  const enemyTier = Math.min(Math.min(MAX_TAVERN_TIER, 3), 1 + Math.floor((turn - 1) / 2));
  const baseSize = Math.min(BOARD_LIMIT, 1 + Math.floor((turn - 1) / 2));
  const size = Math.min(BOARD_LIMIT, baseSize + (turn >= 3 ? randomInt(0, 1) : 0));
  const candidates = MINION_POOL.filter((minion) => !minion.token && minion.tier <= enemyTier);
  const board = [];

  for (let index = 0; index < size; index += 1) {
    const minion = createOwnedMinion(pickRandom(candidates).id);
    board.push(minion);
  }
  return board;
}

function simulateBattle(playerBoard, enemyBoard) {
  const player = playerBoard.map(cloneForBattle);
  const enemy = enemyBoard.map(cloneForBattle);
  const logs = [];

  resolveCombatStartEffects(player, enemy, logs);

  let attackerSide = chooseStartingSide(player, enemy);
  let playerPointer = 0;
  let enemyPointer = 0;
  let turns = 0;

  while (player.length > 0 && enemy.length > 0 && turns < 40) {
    const attackers = attackerSide === "player" ? player : enemy;
    const defenders = attackerSide === "player" ? enemy : player;
    const pointer = attackerSide === "player" ? playerPointer : enemyPointer;
    const attackerIndex = findNextAttackerIndex(attackers, pointer);
    if (attackerIndex === -1) {
      attackerSide = attackerSide === "player" ? "enemy" : "player";
      turns += 1;
      continue;
    }

    if (attackerSide === "player") {
      playerPointer = attackerIndex + 1;
    } else {
      enemyPointer = attackerIndex + 1;
    }

    const attacker = attackers[attackerIndex];
    const defenderIndex = chooseTargetIndex(defenders);
    const defender = defenders[defenderIndex];

    logs.push(`${getSideLabel(attackerSide)} ${attacker.name} 攻击了 ${getOpposingSideLabel(attackerSide)} ${defender.name}。`);

    const attackerDamageNote = applyDamage(attacker, defender.attack);
    const defenderDamageNote = applyDamage(defender, attacker.attack);

    if (attackerDamageNote === "shield") {
      logs.push(`${attacker.name} 的圣盾被打掉了。`);
    }
    if (defenderDamageNote === "shield") {
      logs.push(`${defender.name} 的圣盾被打掉了。`);
    }

    cleanupBoard(player, "我方", logs);
    cleanupBoard(enemy, "敌方", logs);

    attackerSide = attackerSide === "player" ? "enemy" : "player";
    turns += 1;
  }

  let winner = "draw";
  if (player.length > 0 && enemy.length === 0) {
    winner = "player";
  } else if (enemy.length > 0 && player.length === 0) {
    winner = "enemy";
  }

  const summary =
    winner === "player" ? "战斗结束，我方获胜。" : winner === "enemy" ? "战斗结束，敌方获胜。" : "战斗结束，双方平局。";

  return {
    winner,
    summary,
    logs,
    remainingPlayer: player.map(copyMinion),
    remainingEnemy: enemy.map(copyMinion),
  };
}

function resolveCombatStartEffects(player, enemy, logs) {
  const playerEntries = player.filter((minion) => minion.combatStart);
  const enemyEntries = enemy.filter((minion) => minion.combatStart);

  playerEntries.forEach((minion) => applyCombatStartAbility(minion, enemy, logs));
  enemyEntries.forEach((minion) => applyCombatStartAbility(minion, player, logs));

  cleanupBoard(player, "我方", logs);
  cleanupBoard(enemy, "敌方", logs);
}

function applyCombatStartAbility(source, targets, logs) {
  if (!source.combatStart || source.combatStart.type !== "deal-random-damage") {
    return;
  }

  const livingTargets = targets.filter((minion) => minion.health > 0);
  if (!livingTargets.length) {
    return;
  }

  const target = pickRandom(livingTargets);
  const amount = source.combatStart.amount ?? 0;
  logs.push(`${source.name} 在战斗开始时命中 ${target.name}，造成 ${amount} 点伤害。`);
  const note = applyDamage(target, amount);
  if (note === "shield") {
    logs.push(`${target.name} 的圣盾被打掉了。`);
  }
}

function chooseStartingSide(player, enemy) {
  if (player.length > enemy.length) {
    return "player";
  }
  if (enemy.length > player.length) {
    return "enemy";
  }
  return Math.random() < 0.5 ? "player" : "enemy";
}

function findNextAttackerIndex(board, pointer) {
  if (!board.length) {
    return -1;
  }

  for (let offset = 0; offset < board.length; offset += 1) {
    const index = (pointer + offset) % board.length;
    const minion = board[index];
    if (minion.health > 0 && minion.attack > 0) {
      return index;
    }
  }
  return -1;
}

function chooseTargetIndex(board) {
  const provokeIndex = board.findIndex((minion) => minion.keywords.includes("provoke"));
  if (provokeIndex !== -1) {
    return provokeIndex;
  }

  const tauntIndex = board.findIndex((minion) => minion.keywords.includes("taunt"));
  if (tauntIndex !== -1) {
    return tauntIndex;
  }

  return 0;
}

function applyDamage(target, amount) {
  if (target.health <= 0 || amount <= 0) {
    return "none";
  }

  if (target.keywords.includes("divineShield")) {
    target.keywords = target.keywords.filter((keyword) => keyword !== "divineShield");
    return "shield";
  }

  target.health -= amount;
  return "damaged";
}

function cleanupBoard(board, sideLabel, logs) {
  for (let index = 0; index < board.length; ) {
    const minion = board[index];
    if (minion.health > 0) {
      index += 1;
      continue;
    }

    const summons = buildDeathrattleSummons(board, minion);
    board.splice(index, 1, ...summons);
    logs.push(`${sideLabel} ${minion.name} 阵亡。`);
    if (summons.length) {
      logs.push(`${sideLabel} ${minion.name} 的亡语生效，召唤了 ${summons.length} 个单位。`);
    }
    index += summons.length;
  }
}

function buildDeathrattleSummons(board, minion) {
  if (!minion.deathrattle || minion.deathrattle.type !== "summon") {
    return [];
  }

  const availableSlots = BOARD_LIMIT - (board.length - 1);
  if (availableSlots <= 0) {
    return [];
  }

  let count = minion.deathrattle.count || 0;
  if (minion.deathrattle.countBy === "attack") {
    count = Math.max(1, minion.attack);
  }
  if (minion.golden) {
    count *= 2;
  }

  const summonCount = Math.min(availableSlots, count);
  const summons = [];
  for (let index = 0; index < summonCount; index += 1) {
    summons.push(createOwnedMinion(minion.deathrattle.minionId));
  }
  return summons;
}

function cloneForBattle(minion) {
  return {
    ...copyMinion(minion),
    keywords: [...minion.keywords],
    deathrattle: minion.deathrattle ? { ...minion.deathrattle } : null,
    combatStart: minion.combatStart ? { ...minion.combatStart } : null,
  };
}

function createOwnedMinion(id) {
  const template = byId.get(id);
  return {
    ...cloneTemplate(template),
    instanceId: nextInstanceId++,
    golden: false,
  };
}

function cloneTemplate(minion) {
  return {
    id: minion.id,
    name: minion.name,
    tier: minion.tier,
    tribe: minion.tribe,
    attack: minion.attack,
    health: minion.health,
    keywords: [...minion.keywords],
    deathrattle: minion.deathrattle ? { ...minion.deathrattle } : null,
    combatStart: minion.combatStart ? { ...minion.combatStart } : null,
    text: minion.text,
    token: Boolean(minion.token),
  };
}

function copyMinion(minion) {
  return {
    id: minion.id,
    name: minion.name,
    tier: minion.tier,
    tribe: minion.tribe,
    attack: minion.attack,
    health: minion.health,
    keywords: [...minion.keywords],
    deathrattle: minion.deathrattle ? { ...minion.deathrattle } : null,
    combatStart: minion.combatStart ? { ...minion.combatStart } : null,
    text: minion.text,
    token: Boolean(minion.token),
    golden: Boolean(minion.golden),
    instanceId: minion.instanceId ?? null,
  };
}

function getSideLabel(side) {
  return side === "player" ? "我方" : "敌方";
}

function getOpposingSideLabel(side) {
  return side === "player" ? "敌方" : "我方";
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
