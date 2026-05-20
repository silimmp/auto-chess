function startGameApp() {
  if (startGameApp.instance) {
    return startGameApp.instance;
  }

  let prepTimerId = null;
  let postBattleTimerId = null;
  let battleAnimationTimerId = null;
  let battleAnimationRunId = 0;
  let dragState = createDragState();

  const elements = createElements();
  const prepZones = createPrepZones(elements);
  const state = createInitialState(generateShop, generateEnemyBoard, pickRandom, randomInt);

  elements.refreshBtn?.addEventListener("click", refreshShop);
  elements.upgradeBtn?.addEventListener("click", upgradeTavern);
  elements.freezeBtn?.addEventListener("click", toggleFreezeShop);
  elements.battleBtn?.addEventListener("click", () => endTurnAndBattle("manual"));
  elements.resetBtn?.addEventListener("click", resetGame);

  window.addEventListener("pointermove", handleGlobalPointerMove);
  window.addEventListener("pointerup", handleGlobalPointerUp);
  window.addEventListener("pointercancel", cancelDragInteraction);
  window.addEventListener("blur", cancelDragInteraction);

  configureDragRuntime({
    actions: {
      buyMinion,
      moveBoardMinion,
      moveHandMinion,
      playMinion,
      sellMinionFromZone,
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
    elements,
    prepZones,
    render,
    resetGame,
    state,
  };
  window.__AUTO_CHESS_TEST_API__ = {
    cleanupDragState,
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
    stopBattlePlayback,
    stopPostBattleReturn,
    stopPrepTimer,
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

  function resetGame() {
    stopPrepTimer();
    stopPostBattleReturn();
    stopBattlePlayback();
    cleanupDragState();
    const freshState = createInitialState(generateShop, generateEnemyBoard, pickRandom, randomInt);
    Object.assign(state, freshState);
    startPrepPhase();
  }

  function render() {
    renderGame({
      state,
      dragState,
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
      renderStatusOnly();
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
