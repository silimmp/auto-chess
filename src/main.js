function startGameApp() {
  if (startGameApp.instance) {
    return startGameApp.instance;
  }

  let prepTimerId = null;
  let postBattleTimerId = null;
  let battleAnimationTimerId = null;
  let battleAnimationRunId = 0;
  let dragState = createDragState();
  let touchSelection = {
    active: false,
    sourceZone: "",
    index: -1,
  };

  const elements = createElements();
  const prepZones = createPrepZones(elements);
  const state = createInitialState(generateShop, generateEnemyBoard, pickRandom, randomInt);

  syncAppScale();

  elements.refreshBtn?.addEventListener("click", refreshShop);
  elements.upgradeBtn?.addEventListener("click", upgradeTavern);
  elements.freezeBtn?.addEventListener("click", toggleFreezeShop);
  elements.battleBtn?.addEventListener("click", () => endTurnAndBattle("manual"));
  elements.resetBtn?.addEventListener("click", resetGame);
  elements.board?.addEventListener("click", handleBoardTapDeploy);
  elements.hand?.addEventListener("click", handleHandZoneTap);

  window.addEventListener("pointermove", handleGlobalPointerMove);
  window.addEventListener("pointerup", handleGlobalPointerUp);
  window.addEventListener("pointercancel", cancelDragInteraction);
  window.addEventListener("blur", cancelDragInteraction);
  window.addEventListener("resize", syncAppScale);

  configureDragRuntime({
    actions: {
      buyMinion,
      buyMinionToZone,
      chooseDiscoverReward,
      clearTouchSelection,
      moveBoardMinion,
      moveHandMinion,
      playCardFromHand,
      sellMinionFromZone,
      toggleHandSelection,
    },
    dragState,
    elements,
    prepZones,
    setDragState(nextState) {
      dragState = nextState;
      this.dragState = dragState;
    },
    state,
  });

  startPrepPhase();

  const app = {
    chooseDiscoverReward,
    elements,
    prepZones,
    render,
    resetGame,
    state,
    touchSelection,
  };
  window.__AUTO_CHESS_TEST_API__ = {
    cleanupDragState,
    clearTouchSelection,
    copyMinion,
    createOwnedMinion,
    syncEnemyBoard(board) {
      state.enemyBoard = board.map(copyMinion);
      const enemy = getLobbyPlayerById(state.lobby, state.currentOpponentId);
      if (enemy) {
        enemy.board = state.enemyBoard.map(copyMinion);
      } else {
        state.lobby.ghostBoard = state.enemyBoard.map(copyMinion);
      }
    },
    render,
    resetGame,
    resolveTriples,
    simulateBattle,
    startNextTurn,
    startPrepPhase,
    state,
    toggleHandSelection,
    chooseDiscoverReward,
    stopBattlePlayback,
    stopPostBattleReturn,
    stopPrepTimer,
    touchSelection,
  };
  startGameApp.instance = app;
  return app;

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

  function syncAppScale() {
    const root = document.documentElement;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const safeHorizontal = 24;
    const safeVertical = 24;
    const shellWidth = Math.max(1, viewportWidth - safeHorizontal);
    const shellHeight = Math.max(1, viewportHeight - safeVertical);
    root.style.setProperty("--app-shell-width", `${shellWidth}px`);
    root.style.setProperty("--app-shell-height", `${shellHeight}px`);
    root.style.setProperty("--layout-axis-x", "1");
    root.style.setProperty("--layout-axis-y", "1");
    root.style.setProperty("--app-scale", "1");

    const frame = document.querySelector(".game-shell-frame");
    const shell = document.querySelector(".game-shell");
    const prepPanel = document.querySelector(".prep-panel");
    const handZone = document.querySelector(".prep-hand-zone");
    const handBoard = document.querySelector("#hand-board");
    const handCard = document.querySelector("#hand-board .minion-card");
    const shopZone = document.querySelector(".prep-shop-zone");
    const shopBoard = document.querySelector("#shop-board");
    const boardZone = document.querySelector(".prep-board-zone");
    const hudColumn = document.querySelector(".hud-column");
    const shopToolbar = document.querySelector(".shop-toolbar");
    const topActions = document.querySelector(".top-actions");
    if (!frame || !shell || !prepPanel || !handZone || !handBoard || !shopZone || !shopBoard || !boardZone || !hudColumn || !shopToolbar) {
      return;
    }

    function clampAxis(value, minimum = 0.78) {
      return Math.max(minimum, Math.min(1, value));
    }

    function collectLayoutMetrics() {
      const frameRect = frame.getBoundingClientRect();
      const shellRect = shell.getBoundingClientRect();
      const prepRect = prepPanel.getBoundingClientRect();
      const sharedZone = document.querySelector(".prep-shared-zone");
      const sharedRect = sharedZone?.getBoundingClientRect() || null;
      const handRect = handZone.getBoundingClientRect();
      const boardRect = boardZone.getBoundingClientRect();
      const shopRect = shopZone.getBoundingClientRect();
      const shopBoardRect = shopBoard.getBoundingClientRect();
      const handBoardRect = handBoard.getBoundingClientRect();
      const handCardRect = handCard?.getBoundingClientRect() || null;
      const hudRect = hudColumn.getBoundingClientRect();
      const toolbarRect = shopToolbar.getBoundingClientRect();
      const topActionsRect = topActions?.getBoundingClientRect() || null;

      const contentWidth = Math.max(
        shellRect.width,
        prepRect.right - shellRect.left,
        handRect.right - shellRect.left,
        handBoardRect.right - shellRect.left,
        shopBoardRect.right - shellRect.left,
        handCardRect ? handCardRect.right - shellRect.left : 0
      );
      const contentHeight = Math.max(
        shellRect.height,
        prepRect.bottom - shellRect.top,
        sharedRect ? sharedRect.bottom - shellRect.top : 0,
        handRect.bottom - shellRect.top,
        boardRect.bottom - shellRect.top,
        handBoardRect.bottom - shellRect.top,
        shopRect.bottom - shellRect.top,
        shopBoardRect.bottom - shellRect.top,
        handCardRect ? handCardRect.bottom - shellRect.top : 0
      );

      const overlapY = Math.max(
        0,
        shopRect.bottom - boardRect.top,
        boardRect.bottom - handRect.top,
        handCardRect ? handCardRect.top < boardRect.top ? boardRect.top - handCardRect.top : 0 : 0
      );
      const hudOverflowY = Math.max(0, hudRect.bottom - frameRect.bottom);
      const toolbarOverflowX = topActionsRect ? Math.max(0, topActionsRect.right - prepRect.right) : 0;

      return {
        contentHeight,
        contentWidth,
        frameHeight: frameRect.height,
        frameWidth: frameRect.width,
        heightOverflow: Math.max(0, contentHeight - frameRect.height),
        hudOverflowY,
        overlapY,
        shellHeight: shellRect.height,
        shellWidth: shellRect.width,
        toolbarOverflowX,
        widthOverflow: Math.max(0, contentWidth - frameRect.width),
      };
    }

    let metrics = collectLayoutMetrics();
    let axisX = 1;
    let axisY = 1;

    if (metrics.widthOverflow > 0 || metrics.toolbarOverflowX > 0) {
      const widthPressure = (metrics.widthOverflow + metrics.toolbarOverflowX) / Math.max(1, metrics.frameWidth);
      axisX = clampAxis(1 - widthPressure * 1.35, 0.8);
      root.style.setProperty("--layout-axis-x", String(axisX));
      metrics = collectLayoutMetrics();
    }

    if (metrics.heightOverflow > 0 || metrics.overlapY > 0 || metrics.hudOverflowY > 0) {
      const heightPressure = (metrics.heightOverflow + metrics.overlapY + metrics.hudOverflowY) / Math.max(1, metrics.frameHeight);
      axisY = clampAxis(1 - heightPressure * 1.5, 0.74);
      root.style.setProperty("--layout-axis-y", String(axisY));
      metrics = collectLayoutMetrics();
    }

    const widthScale = metrics.frameWidth / Math.max(1, metrics.contentWidth);
    const heightScale = metrics.frameHeight / Math.max(1, metrics.contentHeight);
    const scale = Math.min(1, widthScale, heightScale);
    root.style.setProperty("--app-scale", String(Math.max(0.1, scale)));
  }

  function resetGame() {
    stopPrepTimer();
    stopPostBattleReturn();
    stopBattlePlayback();
    cleanupDragState();
    clearTouchSelection(false);
    const freshState = createInitialState(generateShop, generateEnemyBoard, pickRandom, randomInt);
    Object.assign(state, freshState);
    startPrepPhase();
  }

  function render() {
    renderGame({
      state,
      dragState,
      touchSelection,
      elements,
      cleanupDragState,
      bindPrepCardInteractions,
      getPhaseLabel,
    });
  }

  function renderStatusOnly() {
    renderGame({
      state,
      dragState,
      touchSelection,
      elements,
      cleanupDragState,
      bindPrepCardInteractions,
      getPhaseLabel,
      options: {
        skipZoneRenders: true,
      },
    });
  }

  function refreshShop() {
    if (refreshShopState(state, (tier) => generateShop(tier, pickRandom))) {
      render();
    }
  }

  function upgradeTavern() {
    if (upgradeTavernState(state, UPGRADE_COSTS, (tier) => generateShop(tier, pickRandom))) {
      render();
    }
  }

  function toggleFreezeShop() {
    if (toggleFreezeShopState(state)) {
      clearTouchSelection(false);
      render();
    }
  }

  function buyMinion(shopIndex) {
    if (buyMinionState(state, shopIndex)) {
      clearTouchSelection(false);
      render();
    }
  }

  function buyMinionToZone(shopIndex, targetZone = "hand", targetIndex = null) {
    if (buyMinionToZoneState(state, shopIndex, targetZone, targetIndex)) {
      clearTouchSelection(false);
      render();
    }
  }

  function chooseDiscoverReward(choiceIndex) {
    if (chooseDiscoverRewardState(state, choiceIndex)) {
      clearTouchSelection(false);
      const pendingBattleTrigger = state.pendingBattleTrigger;
      state.pendingBattleTrigger = null;
      if (pendingBattleTrigger) {
        endTurnAndBattle(pendingBattleTrigger);
        return;
      }
      render();
    }
  }

  function playCardFromHand(index, targetIndex = getCenterInsertIndex(state.board.length)) {
    if (playCardFromHandState(state, index, { targetIndex })) {
      clearTouchSelection(false);
      render();
    }
  }

  function playMinion(index, targetIndex = getCenterInsertIndex(state.board.length)) {
    if (playCardFromHandState(state, index, { targetIndex })) {
      render();
    }
  }

  function moveHandMinion(index, targetIndex) {
    if (moveHandMinionState(state, index, targetIndex)) {
      clearTouchSelection(false);
      render();
    }
  }

  function moveBoardMinion(index, targetIndex) {
    if (moveBoardMinionState(state, index, targetIndex)) {
      clearTouchSelection(false);
      render();
    }
  }

  function sellMinionFromZone(zone, index) {
    if (sellMinionFromZoneState(state, zone, index)) {
      clearTouchSelection(false);
      render();
    }
  }

  function toggleHandSelection(index) {
    if (state.phase !== "prep" || state.hp <= 0 || state.discover || !requiresTouchLayout()) {
      return false;
    }
    if (!state.hand[index]) {
      return false;
    }

    const shouldClear = touchSelection.active && touchSelection.sourceZone === "hand" && touchSelection.index === index;
    if (shouldClear) {
      clearTouchSelection();
      return true;
    }

    touchSelection.active = true;
    touchSelection.sourceZone = "hand";
    touchSelection.index = index;
    state.message = `已选中 ${state.hand[index].name}，点一下战场即可上场，或长按继续拖拽。`;
    render();
    return true;
  }

  function clearTouchSelection(shouldRender = true) {
    const wasActive = touchSelection.active;
    touchSelection.active = false;
    touchSelection.sourceZone = "";
    touchSelection.index = -1;
    if (wasActive && shouldRender) {
      render();
    }
    return wasActive;
  }

  function requiresTouchLayout() {
    return window.matchMedia("(pointer: coarse)").matches || window.matchMedia("(max-width: 760px)").matches;
  }

  function handleBoardTapDeploy(event) {
    if (!touchSelection.active || touchSelection.sourceZone !== "hand" || !requiresTouchLayout()) {
      return;
    }
    if (event.target.closest("button")) {
      return;
    }

    const targetIndex = getBoardTapInsertIndex(event.clientX);
    playCardFromHand(touchSelection.index, targetIndex);
  }

  function handleHandZoneTap(event) {
    if (!touchSelection.active || !requiresTouchLayout()) {
      return;
    }
    const card = event.target.closest(".minion-card");
    if (card) {
      return;
    }
    clearTouchSelection();
  }

  function getBoardTapInsertIndex(clientX) {
    const cards = [...elements.board.querySelectorAll(".minion-card")];
    for (let index = 0; index < cards.length; index += 1) {
      const rect = cards[index].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) {
        return index;
      }
    }
    return cards.length;
  }

  function startPrepPhase() {
    stopPrepTimer();
    stopPostBattleReturn();
    stopBattlePlayback();
    clearTouchSelection(false);
    state.pendingBattleTrigger = null;
    state.phase = "prep";
    state.timeLeft = getPrepDuration(state.turn);
    state.prepEndsAt = Date.now() + state.timeLeft * 1000;
    prepTimerId = window.setInterval(updatePrepCountdown, TIMER_TICK_MS);
    if (state.message === getPrepStartMessage(state.turn)) {
      state.message = getLobbyStatusMessage(state);
    }
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
      // Keep drag motion uninterrupted; the timer label catches up on the next non-drag frame.
      if (dragState.status !== "active") {
        renderStatusOnly();
      }
    }
    if (remainingMs <= 0) {
      if (state.discover) {
        state.timeLeft = 0;
        state.pendingBattleTrigger = "timer";
        state.message = "请先完成三连奖励选择，随后自动进入战斗。";
        stopPrepTimer();
        render();
        return;
      }
      endTurnAndBattle("timer");
    }
  }

  function endTurnAndBattle(trigger = "manual") {
    if (state.phase !== "prep" || state.hp <= 0) {
      return;
    }

    clearTouchSelection(false);
    stopPrepTimer();
    stopPostBattleReturn();
    stopBattlePlayback();
    state.timeLeft = 0;
    state.pendingLobbySnapshot = createLobbySnapshot(state.lobby);
    resolveLobbyPhaseEffects(state, "turnEnd", null, pickRandom, randomInt);
    const currentOpponent =
      state.currentOpponentId === "ghost" ? null : getLobbyPlayerById(state.lobby, state.currentOpponentId);
    state.enemyBoard = currentOpponent ? currentOpponent.board.map(copyMinion) : state.lobby.ghostBoard.map(copyMinion);

    const intro = trigger === "timer" ? "准备时间结束，自动进入战斗。" : "你提前结束了准备阶段。";
    const lobbyRound = resolveLobbyRound(
      state.lobby,
      state,
      simulateBattle,
      generateEnemyBoard,
      pickRandom,
      randomInt
    );
    const playerBattle =
      lobbyRound.playerBattle ||
      {
        opponentId: state.currentOpponentId,
        result: simulateBattle(state.board, state.enemyBoard),
        damageToPlayer: 0,
      };
    const opponent =
      playerBattle.opponentId === "ghost" ? null : getLobbyPlayerById(state.lobby, playerBattle.opponentId);
    const result = playerBattle.result;
    const damage = playerBattle.damageToPlayer;
    const roundMessage =
      result.winner === "player"
        ? `这回合打赢了${opponent ? ` ${opponent.name}` : LOBBY_GHOST_LABEL}。`
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
    beginBattlePlayback(result, intro, roundMessage, damage, lobbyRound);
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
      cues: [],
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
    state.pendingLobbySnapshot = null;
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

  async function playBattleFrames(runId, result, intro, roundMessage, damage, lobbyRound) {
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
      state.battleAnimation.cues = frame.cues ? frame.cues.map((cue) => ({ ...cue })) : [];
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

    state.hp = getLobbyPlayerById(state.lobby, "player")?.hp ?? state.hp;

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
      cues: [],
      progressLabel: result.summary,
    };
    state.lastBattle = {
      summary: `${intro}${result.summary}`,
      playerSnapshot: result.startingPlayer.map(copyMinion),
      enemySnapshot: result.startingEnemy.map(copyMinion),
      logs: [...result.logs],
      winner: result.winner,
    };
    state.pendingLobbySnapshot = null;

    if (state.hp <= 0) {
      state.phase = "gameOver";
      state.message = `你被淘汰了，本局排名第 ${getPlayerPlacement(state.lobby)}。点击重新开始可以再来一局。`;
    } else if (isLobbyFinished(state.lobby)) {
      state.phase = "gameOver";
      state.message = "你拿到了第 1 名，这局吃鸡了。点击重新开始可以再来一局。";
    } else {
      state.phase = "battle";
      const recentSummary = state.lobby.roundSummaries.slice(0, 2).join(" ");
      state.message = recentSummary ? `${roundMessage} ${recentSummary}` : roundMessage;
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
      (tier) => generateShop(tier, pickRandom),
      (shop, tier) => refillShop(shop, tier, pickRandom),
      (turn) => generateEnemyBoard(turn, pickRandom, randomInt),
      pickRandom,
      randomInt
    );
  }

  function pickRandom(list) {
    return list[randomInt(0, list.length - 1)];
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}

if (!window.__AUTO_CHESS_APP_STARTED) {
  window.__AUTO_CHESS_APP_STARTED = true;
  window.__AUTO_CHESS_APP__ = startGameApp();
}
