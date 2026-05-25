function startGameApp() {
  if (startGameApp.instance) {
    return startGameApp.instance;
  }

  let prepTimerId = null;
  let postBattleTimerId = null;
  let battleAnimationTimerId = null;
  let battleAnimationRunId = 0;
  let appScaleSyncFrame = 0;
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
  elements.battleDebugCaptureBtn?.addEventListener("click", captureBattleDebugContext);

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
    if (!root) {
      return;
    }
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
    const lobbyListBlock = document.querySelector(".lobby-list-block");
    const shopToolbar = document.querySelector(".shop-toolbar");
    const topActions = document.querySelector(".top-actions");
    if (
      !frame ||
      !shell ||
      !prepPanel ||
      !handZone ||
      !handBoard ||
      !shopZone ||
      !shopBoard ||
      !boardZone ||
      !hudColumn ||
      !lobbyListBlock ||
      !shopToolbar
    ) {
      return;
    }

    function clampAxis(value, minimum = 0.72) {
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
      const lobbyListRect = lobbyListBlock.getBoundingClientRect();
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
      const handCardVisibleHeight = handCardRect
        ? Math.max(0, Math.min(handRect.bottom, handCardRect.bottom) - Math.max(handRect.top, handCardRect.top))
        : 0;
      const minimumHandCardVisibleHeight = handCardRect ? Math.min(96, handCardRect.height * 0.58) : 0;
      const handComfortShortfall = Math.max(0, minimumHandCardVisibleHeight - handCardVisibleHeight);
      const minimumLobbyVisibleHeight = 132;
      const lobbyComfortShortfall = Math.max(0, minimumLobbyVisibleHeight - lobbyListRect.height);

      return {
        contentHeight,
        contentWidth,
        frameHeight: frameRect.height,
        frameWidth: frameRect.width,
        handComfortShortfall,
        heightOverflow: Math.max(0, contentHeight - frameRect.height),
        hudOverflowY,
        lobbyComfortShortfall,
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

    if (
      metrics.heightOverflow > 0 ||
      metrics.overlapY > 0 ||
      metrics.hudOverflowY > 0 ||
      metrics.handComfortShortfall > 0 ||
      metrics.lobbyComfortShortfall > 0
    ) {
      const heightPressure =
        (metrics.heightOverflow +
          metrics.overlapY +
          metrics.hudOverflowY +
          metrics.handComfortShortfall * 1.15 +
          metrics.lobbyComfortShortfall * 1.45) /
        Math.max(1, metrics.frameHeight);
      axisY = clampAxis(1 - heightPressure * 1.65, 0.68);
      root.style.setProperty("--layout-axis-y", String(axisY));
      metrics = collectLayoutMetrics();
    }

    const widthScale = metrics.frameWidth / Math.max(1, metrics.contentWidth);
    const heightScale = metrics.frameHeight / Math.max(1, metrics.contentHeight);
    const scale = Math.min(1, widthScale, heightScale);
    root.style.setProperty("--app-scale", String(Math.max(0.1, scale)));
  }

  function scheduleAppScaleSync() {
    if (appScaleSyncFrame !== 0) {
      return;
    }
    appScaleSyncFrame = window.requestAnimationFrame(() => {
      appScaleSyncFrame = 0;
      syncAppScale();
    });
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
    if (state.phase === "prep" || state.discover) {
      scheduleAppScaleSync();
    }
    window.__AUTO_CHESS_BATTLE_EFFECTS__?.sync?.();
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
    if (refreshShopState(state, (tier, activeTribes) => generateShop(tier, pickRandom, activeTribes))) {
      render();
    }
  }

  function upgradeTavern() {
    if (upgradeTavernState(state, UPGRADE_COSTS, (tier, activeTribes) => generateShop(tier, pickRandom, activeTribes))) {
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

    const cardKind = getHandCardKind(state.hand[index]);
    touchSelection.active = true;
    touchSelection.sourceZone = "hand";
    touchSelection.index = index;
    state.message =
      cardKind === "brandSpell"
        ? `已选中 ${state.hand[index].name}，点一下友方随从即可施放，或长按继续拖拽。`
        : `已选中 ${state.hand[index].name}，点一下战场即可上场，或长按继续拖拽。`;
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

    const selectedCard = state.hand[touchSelection.index];
    const cardKind = getHandCardKind(selectedCard);
    const targetIndex =
      cardKind === "brandSpell" ? getBoardTapTargetIndex(event) : getBoardTapInsertIndex(event.clientX);
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

  function getBoardTapTargetIndex(event) {
    const targetCard = event.target.closest(".minion-card");
    if (targetCard && targetCard.dataset.index) {
      return Number(targetCard.dataset.index);
    }
    return getNearestBoardIndex(event.clientX);
  }

  function getNearestBoardIndex(clientX) {
    const cards = [...elements.board.querySelectorAll(".minion-card")];
    if (!cards.length) {
      return -1;
    }

    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;
    cards.forEach((card, index) => {
      const rect = card.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      const distance = Math.abs(clientX - center);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
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
    window.__AUTO_CHESS_BATTLE_DEBUG__?.startBattleBuffer?.({
      runId,
      playerStartIds: result.startingPlayer.map((minion) => minion.instanceId ?? minion.id ?? null),
      enemyStartIds: result.startingEnemy.map((minion) => minion.instanceId ?? minion.id ?? null),
      frameCount: result.frames.length,
    });
    setBattleDebugStatus("按钮会抓取最近一段战斗上下文。");
    state.battleAnimation = {
      active: true,
      isAnimating: true,
      playerBoard: result.startingPlayer.map(copyMinion),
      enemyBoard: result.startingEnemy.map(copyMinion),
      previousPlayerBoard: result.startingPlayer.map(copyMinion),
      previousEnemyBoard: result.startingEnemy.map(copyMinion),
      actionType: "",
      attackKeyword: "",
      attackerId: null,
      defenderId: null,
      effectSourceId: null,
      attackerSide: "",
      defenderSide: "",
      focusAttackerId: null,
      focusDefenderId: null,
      focusAttackerSide: "",
      focusDefenderSide: "",
      hitIds: [],
      hitEffects: [],
      defeatedIds: [],
      cues: [],
      progressLabel: "战斗开始",
      logLines: [],
    };
    render();
    window.__AUTO_CHESS_BATTLE_EFFECTS__?.reset?.();

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
    window.__AUTO_CHESS_BATTLE_DEBUG__?.record?.("battle-run-stop", {
      runId: battleAnimationRunId,
    });
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
      window.__AUTO_CHESS_BATTLE_DEBUG__?.record?.("battle-frame", {
        runId,
        actionType: frame.actionType || "attack",
        progress: frame.progress || "",
        delay: frame.delay ?? 0,
        attackKeyword: frame.attackKeyword || "",
        attackerId: frame.attackerId ?? null,
        attackerSide: frame.attackerSide || "",
        defenderId: frame.defenderId ?? null,
        defenderSide: frame.defenderSide || "",
        effectSourceId: frame.effectSourceId ?? null,
        hitIds: Array.isArray(frame.hitIds) ? [...frame.hitIds] : [],
        hitEffects: Array.isArray(frame.hitEffects)
          ? frame.hitEffects.map((effect) => ({
              targetId: effect.targetId ?? null,
              type: effect.type || "",
            }))
          : [],
        defeatedIds: Array.isArray(frame.defeatedIds) ? [...frame.defeatedIds] : [],
        cues: Array.isArray(frame.cues)
          ? frame.cues.map((cue) => ({
              targetId: cue.targetId ?? null,
              label: cue.label || "",
            }))
          : [],
      });
      let nextFocusAttackerId = state.battleAnimation.focusAttackerId ?? null;
      let nextFocusDefenderId = state.battleAnimation.focusDefenderId ?? null;
      let nextFocusAttackerSide = state.battleAnimation.focusAttackerSide || "";
      let nextFocusDefenderSide = state.battleAnimation.focusDefenderSide || "";
      const isFocusFrame =
        (frame.actionType === "attack" || frame.actionType === "combatStart") &&
        (frame.attackerId !== null || frame.defenderId !== null);
      if (isFocusFrame) {
        nextFocusAttackerId = frame.attackerId ?? null;
        nextFocusDefenderId = frame.defenderId ?? null;
        nextFocusAttackerSide = frame.attackerSide || "";
        nextFocusDefenderSide = frame.defenderSide || "";
      }
      state.battleAnimation.previousPlayerBoard = state.battleAnimation.playerBoard.map(copyMinion);
      state.battleAnimation.previousEnemyBoard = state.battleAnimation.enemyBoard.map(copyMinion);
      state.battleAnimation.playerBoard = frame.playerBoard.map(copyMinion);
      state.battleAnimation.enemyBoard = frame.enemyBoard.map(copyMinion);
      state.battleAnimation.actionType = frame.actionType || "attack";
      state.battleAnimation.attackKeyword = frame.attackKeyword || "";
      state.battleAnimation.attackerId = frame.attackerId;
      state.battleAnimation.defenderId = frame.defenderId;
      state.battleAnimation.effectSourceId = frame.effectSourceId ?? null;
      state.battleAnimation.attackerSide = frame.attackerSide;
      state.battleAnimation.defenderSide = frame.defenderSide;
      state.battleAnimation.focusAttackerId = nextFocusAttackerId;
      state.battleAnimation.focusDefenderId = nextFocusDefenderId;
      state.battleAnimation.focusAttackerSide = nextFocusAttackerSide;
      state.battleAnimation.focusDefenderSide = nextFocusDefenderSide;
      state.battleAnimation.hitIds = [...frame.hitIds];
      state.battleAnimation.hitEffects = frame.hitEffects ? frame.hitEffects.map((effect) => ({ ...effect })) : [];
      state.battleAnimation.defeatedIds = [...frame.defeatedIds];
      state.battleAnimation.cues = frame.cues ? frame.cues.map((cue) => ({ ...cue })) : [];
      state.battleAnimation.progressLabel = frame.progress;
      if (frame.log) {
        state.battleAnimation.logLines = [...state.battleAnimation.logLines, frame.log];
      }
      render();
      window.__AUTO_CHESS_BATTLE_EFFECTS__?.playFrameEffects?.(frame);
      await waitBattleDelay(frame.delay);
      if (runId !== battleAnimationRunId) {
        return;
      }
    }

    state.hp = getLobbyPlayerById(state.lobby, "player")?.hp ?? state.hp;
    window.__AUTO_CHESS_BATTLE_DEBUG__?.record?.("battle-run-finish", {
      runId,
      playerRemainingIds: result.remainingPlayer.map((minion) => minion.instanceId ?? minion.id ?? null),
      enemyRemainingIds: result.remainingEnemy.map((minion) => minion.instanceId ?? minion.id ?? null),
      damage,
    });

    state.battleAnimation = {
      ...state.battleAnimation,
      active: true,
      isAnimating: false,
      playerBoard: result.remainingPlayer.map(copyMinion),
      enemyBoard: result.remainingEnemy.map(copyMinion),
      previousPlayerBoard: result.remainingPlayer.map(copyMinion),
      previousEnemyBoard: result.remainingEnemy.map(copyMinion),
      actionType: "",
      attackKeyword: "",
      attackerId: null,
      defenderId: null,
      effectSourceId: null,
      attackerSide: "",
      defenderSide: "",
      focusAttackerId: null,
      focusDefenderId: null,
      focusAttackerSide: "",
      focusDefenderSide: "",
      hitIds: [],
      hitEffects: [],
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

  function setBattleDebugStatus(text, tone = "idle") {
    if (!elements.battleDebugStatus) {
      return;
    }
    elements.battleDebugStatus.textContent = text;
    elements.battleDebugStatus.dataset.tone = tone;
  }

  function summarizeBattleBoard(board) {
    return (Array.isArray(board) ? board : []).map((minion) => ({
      id: minion.instanceId ?? minion.id ?? null,
      name: minion.name,
      attack: minion.attack,
      health: minion.health,
      keywords: Array.isArray(minion.keywords) ? [...minion.keywords] : [],
    }));
  }

  function buildBattleDebugSnapshot() {
    return {
      turn: state.turn,
      phase: state.phase,
      message: state.message,
      opponent: state.currentOpponentName,
      battleAnimation: {
        active: state.battleAnimation.active,
        isAnimating: state.battleAnimation.isAnimating,
        actionType: state.battleAnimation.actionType,
        attackKeyword: state.battleAnimation.attackKeyword,
        attackerId: state.battleAnimation.attackerId,
        attackerSide: state.battleAnimation.attackerSide,
        defenderId: state.battleAnimation.defenderId,
        defenderSide: state.battleAnimation.defenderSide,
        focusAttackerId: state.battleAnimation.focusAttackerId,
        focusAttackerSide: state.battleAnimation.focusAttackerSide,
        focusDefenderId: state.battleAnimation.focusDefenderId,
        focusDefenderSide: state.battleAnimation.focusDefenderSide,
        effectSourceId: state.battleAnimation.effectSourceId,
        hitIds: [...state.battleAnimation.hitIds],
        defeatedIds: [...state.battleAnimation.defeatedIds],
        progressLabel: state.battleAnimation.progressLabel,
        logLines: [...state.battleAnimation.logLines.slice(-8)],
      },
      playerBoard: summarizeBattleBoard(state.battleAnimation.playerBoard),
      enemyBoard: summarizeBattleBoard(state.battleAnimation.enemyBoard),
      overlay: {
        progress: elements.battleProgressLabel?.textContent || "",
        summary: elements.battleSummaryText?.textContent || "",
      },
    };
  }

  async function captureBattleDebugContext() {
    const runtime = window.__AUTO_CHESS_BATTLE_DEBUG__;
    if (!runtime) {
      setBattleDebugStatus("抓取器不可用。", "error");
      return;
    }

    const snapshot = buildBattleDebugSnapshot();
    const entries = runtime.getEntries().slice(-180);
    const text = runtime.formatCapture({
      kind: "battle-jitter-capture",
      snapshot,
      entries,
    });
    window.__AUTO_CHESS_BATTLE_DEBUG_LAST_CAPTURE__ = text;
    const safeTurn = String(state.turn || "x");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `battle-jitter-turn-${safeTurn}-${stamp}.json`;

    try {
      const copied = await runtime.copyText(text);
      if (copied) {
        setBattleDebugStatus(`已抓取 ${entries.length} 条并复制到剪贴板。`, "success");
      } else {
        runtime.downloadText?.(text, filename);
        setBattleDebugStatus(`已抓取 ${entries.length} 条；已自动下载 ${filename}。`, "warn");
      }
    } catch {
      runtime.downloadText?.(text, filename);
      setBattleDebugStatus(`已抓取 ${entries.length} 条；复制失败，已自动下载 ${filename}。`, "warn");
    }
  }

  function startNextTurn() {
    startNextTurnState(
      state,
      (tier, activeTribes) => generateShop(tier, pickRandom, activeTribes),
      (shop, tier, activeTribes) => refillShop(shop, tier, pickRandom, activeTribes),
      (turn, nextPickRandom, nextRandomInt, activeTribes) => generateEnemyBoard(turn, nextPickRandom, nextRandomInt, activeTribes),
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
