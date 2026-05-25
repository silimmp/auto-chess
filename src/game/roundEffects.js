function resolveBoardPhaseEffects(board, phase, pickRandomFn = pickRandom) {
  if (!Array.isArray(board) || !board.length) {
    return [];
  }

  const field = phase === "turnStart" ? "turnStart" : phase === "turnEnd" ? "turnEnd" : "";
  if (!field) {
    return [];
  }

  const summaries = [];
  board
    .filter((minion) => minion.health > 0 && minion[field])
    .forEach((minion) => {
      const summary = resolveBoardPhaseAbility(board, minion, field, pickRandomFn);
      if (summary) {
        summaries.push(summary);
      }
    });
  return summaries;
}

function resolveLobbyPhaseEffects(state, phase, generateEnemyBoard, pickRandomFn = pickRandom, randomIntFn = randomInt) {
  const summaries = [];
  summaries.push(...resolveBoardPhaseEffects(state.board, phase, pickRandomFn));

  state.lobby.players.forEach((player) => {
    if (!player.alive || player.isHuman) {
      return;
    }
    if (!player.board.length && typeof generateEnemyBoard === "function") {
      player.board = generateEnemyBoard(state.turn, pickRandomFn, randomIntFn);
    }
    summaries.push(...resolveBoardPhaseEffects(player.board, phase, pickRandomFn));
  });

  return summaries;
}

function resolveBoardPhaseAbility(board, source, field, pickRandomFn) {
  const ability = source[field];
  if (!ability) {
    return "";
  }

  const handlers = {
    "buff-adjacent": resolveBoardPhaseBuffAdjacent,
    "buff-random-friendly": resolveBoardPhaseBuffRandomFriendly,
    "buff-friendly-tribe": resolveBoardPhaseBuffFriendlyTribe,
    "gain-self-per-friendly": resolveBoardPhaseGainSelfPerFriendly,
    "forge-brand": resolveBoardPhaseForgeBrand,
    "forge-brand-random": resolveBoardPhaseForgeBrandRandom,
    "forge-brand-discover": resolveBoardPhaseForgeBrandDiscover,
  };
  const handler = handlers[ability.type];
  if (!handler) {
    return "";
  }
  return handler(board, source, ability, field, pickRandomFn);
}

function resolveBoardPhaseBuffAdjacent(board, source, ability, field) {
  const adjacent = getBoardAdjacentTargets(board, source, ability);
  if (!adjacent.length) {
    return "";
  }

  const attack = ability.attack ?? 0;
  const health = ability.health ?? 0;
  adjacent.forEach((minion) => {
    minion.attack += attack;
    minion.health += health;
  });
  return `${source.name}${getBoardPhaseLabel(field)}使相邻友军获得 +${attack}/+${health}`;
}

function resolveBoardPhaseBuffRandomFriendly(board, source, ability, field, pickRandomFn) {
  const candidates = getBoardFriendlyTargets(board, source, ability);
  if (!candidates.length) {
    return "";
  }

  const count = Math.min(ability.count ?? 1, candidates.length);
  const chosen = pickUniqueBoardMinions(candidates, count, pickRandomFn);
  const attack = ability.attack ?? 0;
  const health = ability.health ?? 0;
  chosen.forEach((minion) => {
    minion.attack += attack;
    minion.health += health;
  });
  return `${source.name}${getBoardPhaseLabel(field)}随机强化了 ${chosen.length} 个友军`;
}

function resolveBoardPhaseBuffFriendlyTribe(board, source, ability, field) {
  const friendlies = getBoardFriendlyTargets(board, source, ability);
  if (!friendlies.length) {
    return "";
  }

  const attack = ability.attack ?? 0;
  const health = ability.health ?? 0;
  friendlies.forEach((minion) => {
    minion.attack += attack;
    minion.health += health;
  });
  return `${source.name}${getBoardPhaseLabel(field)}强化了 ${friendlies.length} 个友军`;
}

function resolveBoardPhaseGainSelfPerFriendly(board, source, ability, field) {
  const friendlies = getBoardFriendlyTargets(board, source, ability);
  const count = friendlies.length;
  if (count <= 0) {
    return "";
  }

  const attack = (ability.attack ?? 0) * count;
  const health = (ability.health ?? 0) * count;
  source.attack += attack;
  source.health += health;
  return `${source.name}${getBoardPhaseLabel(field)}获得了 +${attack}/+${health}`;
}

function resolveBoardPhaseForgeBrand(board, source, ability, field) {
  if (!ability.brandId || typeof createBrandCard !== "function") {
    return "";
  }
  const ownerState = getBoardOwnerState(board);
  if (!ownerState || !Array.isArray(ownerState.hand)) {
    return "";
  }
  if (ownerState.hand.length >= HAND_LIMIT) {
    return `${source.name}${getBoardPhaseLabel(field)}尝试打造品牌，但手牌已满。`;
  }

  const brandCard = createBrandCard(ability.brandId);
  if (!brandCard) {
    return "";
  }
  ownerState.hand.push(brandCard);
  return `${source.name}${getBoardPhaseLabel(field)}打造了 ${brandCard.name}`;
}

function resolveBoardPhaseForgeBrandRandom(board, source, ability, field, pickRandomFn) {
  const brandIds = Array.isArray(ability.brandIds) ? ability.brandIds.filter(Boolean) : [];
  if (!brandIds.length || typeof createBrandCard !== "function") {
    return "";
  }
  const ownerState = getBoardOwnerState(board);
  if (!ownerState || !Array.isArray(ownerState.hand)) {
    return "";
  }
  if (ownerState.hand.length >= HAND_LIMIT) {
    return `${source.name}${getBoardPhaseLabel(field)}尝试打造品牌，但手牌已满。`;
  }

  const brandId = pickRandomFn(brandIds);
  const brandCard = createBrandCard(brandId);
  if (!brandCard) {
    return "";
  }
  ownerState.hand.push(brandCard);
  return `${source.name}${getBoardPhaseLabel(field)}随机打造了 ${brandCard.name}`;
}

function resolveBoardPhaseForgeBrandDiscover(board, source, ability, field) {
  const brandIds = Array.isArray(ability.brandIds) ? ability.brandIds.filter(Boolean) : [];
  if (!brandIds.length || typeof createBrandCard !== "function") {
    return "";
  }
  const ownerState = getBoardOwnerState(board);
  if (!ownerState) {
    return "";
  }

  ownerState.discover = {
    source: "brandDiscover",
    title: "选择一张物品牌",
    subtitle: "从这些高级物品牌中选择一张加入手牌。",
    choices: brandIds.map((brandId) => createBrandCard(brandId)).filter(Boolean),
  };
  return `${source.name}${getBoardPhaseLabel(field)}开启了高级物品牌发现`;
}

function getBoardFriendlyTargets(board, source, ability) {
  const includeSource = Boolean(ability.includeSource);
  return board.filter((minion) => {
    if (minion.health <= 0) {
      return false;
    }
    if (!includeSource && minion.instanceId === source.instanceId) {
      return false;
    }
    if (ability.tribe && minion.tribe !== ability.tribe) {
      return false;
    }
    return true;
  });
}

function getBoardAdjacentTargets(board, source, ability) {
  const index = board.findIndex((minion) => minion.instanceId === source.instanceId);
  if (index === -1) {
    return [];
  }

  return [board[index - 1], board[index + 1]].filter((minion) => {
    if (!minion || minion.health <= 0) {
      return false;
    }
    if (ability.tribe && minion.tribe !== ability.tribe) {
      return false;
    }
    return true;
  });
}

function pickUniqueBoardMinions(candidates, count, pickRandomFn) {
  const pool = [...candidates];
  const chosen = [];
  while (pool.length && chosen.length < count) {
    const minion = pickRandomFn(pool);
    chosen.push(minion);
    pool.splice(pool.indexOf(minion), 1);
  }
  return chosen;
}

function getBoardPhaseLabel(field) {
  return field === "turnStart" ? " 在回合开始时 " : " 在回合结束时 ";
}

function getBoardOwnerState(board) {
  if (!window?.__AUTO_CHESS_TEST_API__?.state) {
    return null;
  }
  const state = window.__AUTO_CHESS_TEST_API__.state;
  if (state.board === board) {
    return state;
  }
  const player = state.lobby?.players?.find((entry) => entry.board === board);
  return player || null;
}
