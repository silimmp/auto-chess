function createElements() {
  return {
    turn: document.querySelector("#turn-value"),
    gold: document.querySelector("#gold-value"),
    hp: document.querySelector("#hp-value"),
    tier: document.querySelector("#tier-value"),
    phase: document.querySelector("#phase-value"),
    timer: document.querySelector("#timer-value"),
    timerCard: document.querySelector("#timer-card"),
    message: document.querySelector("#message-value"),
    shop: document.querySelector("#shop-board"),
    shopOdds: document.querySelector("#shop-odds-value"),
    hand: document.querySelector("#hand-board"),
    board: document.querySelector("#player-board"),
    prepPanel: document.querySelector(".prep-panel"),
    discoverView: document.querySelector("#discover-view"),
    discoverTitle: document.querySelector("#discover-title"),
    discoverSubtitle: document.querySelector("#discover-subtitle"),
    discoverChoices: document.querySelector("#discover-choices"),
    battleView: document.querySelector("#battle-view"),
    battleEnemy: document.querySelector("#battle-enemy-board"),
    battlePlayer: document.querySelector("#battle-player-board"),
    battleEnemyName: document.querySelector("#battle-enemy-name"),
    battleEnemyCount: document.querySelector("#battle-enemy-count"),
    battlePlayerName: document.querySelector("#battle-player-name"),
    battlePlayerCount: document.querySelector("#battle-player-count"),
    battleTurnPill: document.querySelector("#battle-turn-pill"),
    battleProgressLabel: document.querySelector("#battle-progress-label"),
    battleSummaryText: document.querySelector("#battle-summary-text"),
    lobbyAlive: document.querySelector("#lobby-alive-value"),
    lobbyPlace: document.querySelector("#lobby-place-value"),
    lobbyOpponent: document.querySelector("#lobby-opponent-value"),
    lobbyRoster: document.querySelector("#lobby-roster"),
    lobbyRecent: document.querySelector("#lobby-recent"),
    refreshBtn: document.querySelector("#refresh-btn"),
    upgradeBtn: document.querySelector("#upgrade-btn"),
    freezeBtn: document.querySelector("#freeze-btn"),
    battleBtn: document.querySelector("#battle-btn"),
    resetBtn: document.querySelector("#reset-btn"),
  };
}

function createPrepZones(elements) {
  return {
    shared: elements.shop?.closest(".prep-shared-zone") || null,
    shop: elements.shop?.closest(".prep-shop-zone") || null,
    hand: elements.hand?.closest(".prep-hand-zone") || null,
    board: elements.board?.closest(".prep-board-zone") || null,
  };
}

function createInitialState(generateShop, generateEnemyBoard, pickRandom, randomInt) {
  const lobby = createInitialLobby(generateEnemyBoard, pickRandom, randomInt);
  const currentOpponent = getLobbyPlayerById(lobby, lobby.currentOpponentId);
  const initial = {
    turn: 1,
    hp: 30,
    gold: getTurnGold(1),
    tavernTier: 1,
    upgradeCost: getBaseUpgradeCost(1),
    upgradeCostTier: 1,
    phase: "prep",
    timeLeft: getPrepDuration(1),
    prepEndsAt: null,
    shopFrozen: false,
    shop: [],
    hand: [],
    board: [],
    discover: null,
    pendingBattleTrigger: null,
    enemyBoard: currentOpponent ? currentOpponent.board.map(copyMinion) : [],
    currentOpponentId: lobby.currentOpponentId,
    currentOpponentName: currentOpponent ? currentOpponent.name : LOBBY_GHOST_LABEL,
    lobby,
    pendingLobbySnapshot: null,
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

  initial.shop = generateShop(initial.tavernTier, pickRandom);
  resolveLobbyPhaseEffects(initial, "turnStart", generateEnemyBoard, pickRandom, randomInt);
  initial.enemyBoard = currentOpponent ? currentOpponent.board.map(copyMinion) : [];
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
    cues: [],
    progressLabel: "等待开战",
    logLines: [],
  };
}

function getPrepDuration(turn) {
  if (turn <= 3) {
    return PREP_SECONDS_EARLY;
  }
  return Math.min(PREP_SECONDS_CAP, PREP_SECONDS_EARLY + (turn - 3) * PREP_SECONDS_STEP);
}

function getPrepStartMessage(turn) {
  return `第 ${turn} 回合准备阶段开始，${getPrepDuration(turn)} 秒后自动战斗。`;
}

function getLobbyStatusMessage(state) {
  return `第 ${state.turn} 回合准备阶段开始，下一位对手是 ${state.currentOpponentName}。`;
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
