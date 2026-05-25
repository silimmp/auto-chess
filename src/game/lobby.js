const LOBBY_PLAYER_COUNT = 8;
const LOBBY_GHOST_LABEL = "幽灵";
const LOBBY_NAME_PREFIXES = ["赤", "青", "白", "黑", "金", "银", "炎", "霜", "岚", "夜", "星", "雷"];
const LOBBY_NAME_TITLES = ["旅团", "战团", "卫队", "猎手", "行者", "先驱", "守望", "尖兵", "铁卫", "游骑", "锋刃", "巡狩"];

function createLobbyPlayer(id, name, isHuman = false) {
  return {
    id,
    name,
    isHuman,
    hp: 30,
    tavernTier: 1,
    board: [],
    hand: [],
    alive: true,
    lastOpponentId: null,
    eliminatedAt: null,
  };
}

function createInitialLobby(generateEnemyBoard, pickRandom, randomInt, activeTribes = null) {
  const players = [createLobbyPlayer("player", "你", true)];
  const aiNames = createLobbyAiNames(pickRandom, randomInt, LOBBY_PLAYER_COUNT - 1);
  for (let index = 1; index < LOBBY_PLAYER_COUNT; index += 1) {
    const ai = createLobbyPlayer(`ai-${index}`, aiNames[index - 1]);
    ai.board = generateEnemyBoard(1, pickRandom, randomInt, activeTribes);
    players.push(ai);
  }

  const pairings = createPairings(players, 1);
  const currentOpponentId = findOpponentIdForPlayer(pairings, "player");
  return {
    players,
    pairings,
    currentOpponentId,
    placementOrder: [],
    roundSummaries: [],
    ghostBoard: [],
    nextPairingPreview: currentOpponentId,
  };
}

function getAliveLobbyPlayers(players) {
  return players.filter((player) => player.alive);
}

function getLobbyPlayerById(lobby, id) {
  return lobby.players.find((player) => player.id === id) || null;
}

function findOpponentIdForPlayer(pairings, playerId) {
  for (const pairing of pairings) {
    if (pairing.a === playerId) {
      return pairing.b;
    }
    if (pairing.b === playerId) {
      return pairing.a;
    }
  }
  return null;
}

function createPairings(players, turn) {
  const alive = getAliveLobbyPlayers(players);
  const ordered = [...alive].sort((left, right) => {
    const leftValue = Number(left.id.replace(/\D/g, "")) || 0;
    const rightValue = Number(right.id.replace(/\D/g, "")) || 0;
    return leftValue - rightValue;
  });
  const rotation = ordered.length ? (turn - 1) % ordered.length : 0;
  const rotated = ordered.slice(rotation).concat(ordered.slice(0, rotation));
  const pairings = [];

  for (let index = 0; index < rotated.length; index += 2) {
    const first = rotated[index];
    const second = rotated[index + 1];
    if (!first) {
      continue;
    }
    pairings.push({
      a: first.id,
      b: second ? second.id : "ghost",
    });
  }

  return pairings;
}

function resolveLobbyRound(lobby, state, simulateBattleFn, generateEnemyBoard, pickRandom, randomInt) {
  const roundSummaries = [];
  const eliminated = [];
  let playerBattle = null;
  let latestGhostBoard = lobby.ghostBoard || [];

  lobby.pairings.forEach((pairing) => {
    const playerA = getLobbyPlayerById(lobby, pairing.a);
    const playerB = pairing.b === "ghost" ? null : getLobbyPlayerById(lobby, pairing.b);
    if (!playerA || !playerA.alive) {
      return;
    }

    const boardA = playerA.id === "player" ? state.board : playerA.board;
    const boardB =
      pairing.b === "ghost"
        ? latestGhostBoard
        : playerB?.id === "player"
          ? state.board
          : playerB?.board || [];
    const result = simulateBattleFn(boardA, boardB);
    const damageToA = result.winner === "enemy" ? calculateBattleDamage(result.remainingEnemy) : 0;
    const damageToB = result.winner === "player" ? calculateBattleDamage(result.remainingPlayer) : 0;

    if (playerA.id === "player" || pairing.b === "player") {
      playerBattle = {
        opponentId: playerA.id === "player" ? pairing.b : pairing.a,
        result: playerA.id === "player" ? result : normalizeBattleResultForSecondPlayer(result),
        damageToPlayer: playerA.id === "player" ? damageToA : damageToB,
      };
    }

    applyLobbyDamage(playerA, damageToA, eliminated, lobby.placementOrder, state.turn);
    if (playerB) {
      applyLobbyDamage(playerB, damageToB, eliminated, lobby.placementOrder, state.turn);
    }

    if (playerA.id !== "player") {
      playerA.board = playerA.alive ? generateEnemyBoard(state.turn + 1, pickRandom, randomInt) : [];
    }
    if (playerB && playerB.id !== "player") {
      playerB.board = playerB.alive ? generateEnemyBoard(state.turn + 1, pickRandom, randomInt) : [];
    }

    playerA.lastOpponentId = pairing.b;
    if (playerB) {
      playerB.lastOpponentId = pairing.a;
    }

    if (result.remainingPlayer.length) {
      latestGhostBoard = result.remainingPlayer.map(copyMinion);
    } else if (result.remainingEnemy.length) {
      latestGhostBoard = result.remainingEnemy.map(copyMinion);
    }

    roundSummaries.push(buildRoundSummary(pairing, playerA, playerB, result, damageToA, damageToB));
  });

  lobby.roundSummaries = roundSummaries;
  lobby.ghostBoard = latestGhostBoard.map(copyMinion);
  return { eliminated, playerBattle };
}

function normalizeBattleResultForSecondPlayer(result) {
  return {
    ...result,
    winner:
      result.winner === "player"
        ? "enemy"
        : result.winner === "enemy"
          ? "player"
          : result.winner,
    startingPlayer: result.startingEnemy.map(copyMinion),
    startingEnemy: result.startingPlayer.map(copyMinion),
    remainingPlayer: result.remainingEnemy.map(copyMinion),
    remainingEnemy: result.remainingPlayer.map(copyMinion),
    frames: result.frames.map((frame) => ({
      ...frame,
      playerBoard: frame.enemyBoard.map(copyMinion),
      enemyBoard: frame.playerBoard.map(copyMinion),
      attackerSide:
        frame.attackerSide === "player"
          ? "enemy"
          : frame.attackerSide === "enemy"
            ? "player"
            : frame.attackerSide,
      defenderSide:
        frame.defenderSide === "player"
          ? "enemy"
          : frame.defenderSide === "enemy"
            ? "player"
            : frame.defenderSide,
    })),
    logs: result.logs.map(flipBattleLogSides),
    summary: flipBattleLogSides(result.summary),
  };
}

function flipBattleLogSides(text) {
  return text.replaceAll("我方", "__PLAYER_SIDE__").replaceAll("敌方", "我方").replaceAll("__PLAYER_SIDE__", "敌方");
}

function applyLobbyDamage(player, damage, eliminated, placementOrder, turn) {
  if (!player.alive || damage <= 0) {
    return;
  }

  player.hp = Math.max(0, player.hp - damage);
  if (player.hp > 0) {
    return;
  }

  player.alive = false;
  player.eliminatedAt = turn;
  placementOrder.push(player.id);
  eliminated.push(player.id);
}

function buildRoundSummary(pairing, playerA, playerB, result, damageToA, damageToB) {
  const aName = playerA.name;
  const bName = pairing.b === "ghost" ? LOBBY_GHOST_LABEL : playerB?.name || LOBBY_GHOST_LABEL;
  if (result.winner === "player") {
    return `${aName} 击败了 ${bName}，造成 ${damageToB} 点伤害。`;
  }
  if (result.winner === "enemy") {
    return `${bName} 击败了 ${aName}，造成 ${damageToA} 点伤害。`;
  }
  return `${aName} 与 ${bName} 战平。`;
}

function getPlayerPlacement(lobby) {
  const alive = getAliveLobbyPlayers(lobby.players);
  const player = getLobbyPlayerById(lobby, "player");
  if (!player) {
    return LOBBY_PLAYER_COUNT;
  }
  if (player.alive) {
    return alive.length;
  }
  return lobby.placementOrder.length + 1;
}

function isLobbyFinished(lobby) {
  return getAliveLobbyPlayers(lobby.players).length <= 1;
}

function createLobbySnapshot(lobby) {
  return {
    players: lobby.players.map((player) => ({
      id: player.id,
      name: player.name,
      isHuman: player.isHuman,
      hp: player.hp,
      alive: player.alive,
    })),
    placementOrder: [...lobby.placementOrder],
  };
}

function createLobbyAiNames(pickRandom, randomInt, count) {
  const names = [];
  const used = new Set();

  while (names.length < count) {
    const baseName = `${pickRandom(LOBBY_NAME_PREFIXES)}${pickRandom(LOBBY_NAME_TITLES)}`;
    const suffix = randomInt(1, 9);
    const candidate = used.has(baseName) ? `${baseName}${suffix}` : baseName;
    if (used.has(candidate)) {
      continue;
    }
    used.add(candidate);
    names.push(candidate);
  }

  return names;
}
