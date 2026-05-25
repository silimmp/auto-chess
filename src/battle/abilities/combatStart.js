function resolveCombatStartEffects(player, enemy, logs, frames) {
  runCombatStartAbilities(player, "player", enemy, player, enemy, logs, frames);
  runCombatStartAbilities(enemy, "enemy", player, player, enemy, logs, frames);
  cleanupBattlefield(player, enemy, logs, frames, COMBAT_START_PROGRESS_LABEL);
}

function runCombatStartAbilities(sources, side, targets, player, enemy, logs, frames) {
  sources
    .filter((minion) => minion.health > 0 && minion.combatStart)
    .forEach((minion) => applyCombatStartAbility(minion, side, targets, player, enemy, logs, frames));
}

function applyCombatStartAbility(source, side, targets, player, enemy, logs, frames) {
  if (!source.combatStart) {
    return false;
  }

  const context = {
    source,
    side,
    targets,
    player,
    enemy,
    logs,
    frames,
    progress: COMBAT_START_PROGRESS_LABEL,
  };

  return resolveCombatStartAbility(context);
}

function createCombatStartCue(source) {
  return [{ targetId: source.instanceId, type: "keyword", label: "开局效果" }];
}

function createCombatStartKeywordGrantCues(source, targets, keyword) {
  const cues = createCombatStartCue(source);
  if (keyword !== "divineShield") {
    return cues;
  }
  return [
    ...cues,
    ...targets.map((minion) => ({
      targetId: minion.instanceId,
      type: "keyword",
      label: "护盾",
      label: "护盾",
    })),
  ];
}

function resolveCombatStartAbility(context) {
  const handlers = {
    "buff-adjacent": resolveBuffAdjacentCombatStart,
    "buff-random-friendly": resolveBuffRandomFriendlyCombatStart,
    "buff-friendly-tribe": resolveBuffFriendlyTribeCombatStart,
    "deal-random-damage": resolveDealRandomDamageCombatStart,
    "deal-random-damage-repeat": resolveDealRandomDamageRepeatCombatStart,
    "deal-all-damage": resolveDealAllDamageCombatStart,
    "gain-self-per-friendly": resolveGainSelfPerFriendlyCombatStart,
    "grant-keyword-adjacent": resolveGrantKeywordAdjacentCombatStart,
    "grant-keyword-friendly-tribe": resolveGrantKeywordFriendlyTribeCombatStart,
  };
  const handler = handlers[context.source.combatStart.type];
  if (!handler) {
    return false;
  }
  return handler(context);
}

function resolveBuffAdjacentCombatStart(context) {
  const { source, side, player, enemy, logs, frames, progress } = context;
  const adjacent = getAdjacentFriendlyCombatStartTargets(context);
  if (!adjacent.length) {
    return false;
  }

  const attack = source.combatStart.attack ?? 0;
  const health = source.combatStart.health ?? 0;
  adjacent.forEach((minion) => {
    minion.attack += attack;
    minion.health += health;
  });

  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${source.name} 在战斗开始时整顿阵形，使相邻友军获得了 +${attack}/+${health}。`,
    {
      actionType: "combatStart",
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: adjacent.map((minion) => minion.instanceId),
      cues: createCombatStartCue(source),
      progress,
      delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
    }
  );
  return true;
}

function resolveBuffRandomFriendlyCombatStart(context) {
  const { source, side, player, enemy, logs, frames, progress } = context;
  const candidates = getMatchingFriendlyCombatStartTargets(context);
  if (!candidates.length) {
    return false;
  }

  const count = Math.min(source.combatStart.count ?? 1, candidates.length);
  const chosen = pickUniqueMinions(candidates, count);
  const attack = source.combatStart.attack ?? 0;
  const health = source.combatStart.health ?? 0;
  chosen.forEach((minion) => {
    minion.attack += attack;
    minion.health += health;
  });

  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${source.name} 在战斗开始时挑选了 ${chosen.length} 个友军，赋予 +${attack}/+${health}。`,
    {
      actionType: "combatStart",
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: chosen.map((minion) => minion.instanceId),
      cues: createCombatStartCue(source),
      progress,
      delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
    }
  );
  return true;
}

function resolveDealRandomDamageCombatStart(context) {
  return resolveRepeatedRandomDamageCombatStart(context, context.source.combatStart.shots ?? 1);
}

function resolveDealRandomDamageRepeatCombatStart(context) {
  return resolveRepeatedRandomDamageCombatStart(context, context.source.combatStart.shots ?? 1);
}

function resolveRepeatedRandomDamageCombatStart(context, shots) {
  const { source, side, targets, player, enemy, logs, frames, progress } = context;
  const amount = source.combatStart.amount ?? 0;
  const defenderSide = side === "player" ? "enemy" : "player";
  const battleContext = { player, enemy, logs, frames };
  let triggered = false;

  for (let shot = 0; shot < shots; shot += 1) {
    const livingTargets = targets.filter((minion) => minion.health > 0);
    if (!livingTargets.length) {
      break;
    }

    const target = pickRandom(livingTargets);
    const message =
      shots > 1
        ? `${source.name} 在战斗开始时第 ${shot + 1} 次射击命中 ${target.name}，造成 ${amount} 点伤害。`
        : `${source.name} 在战斗开始时命中 ${target.name}，造成 ${amount} 点伤害。`;
    pushBattleLogFrame(player, enemy, logs, frames, message, {
      actionType: "combatStart",
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      cues: createCombatStartCue(source),
      progress,
      delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
    });
    const note = applyDamage(target, amount, null, battleContext, {
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      progress,
    });
    pushBattleFrameOnly(player, enemy, frames, {
      actionType: "combatStart",
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      hitIds: [target.instanceId],
      progress,
      delay: BATTLE_COMBAT_START_HIT_DELAY_MS,
    });
    recordPostDamageEffects(note, target, player, enemy, logs, frames, {
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      progress,
    });
    triggered = true;
  }

  return triggered;
}

function resolveBuffFriendlyTribeCombatStart(context) {
  const { source, side, player, enemy, logs, frames, progress } = context;
  const friendlies = getMatchingFriendlyCombatStartTargets(context);
  if (!friendlies.length) {
    return false;
  }

  const attack = source.combatStart.attack ?? 0;
  const health = source.combatStart.health ?? 0;
  friendlies.forEach((minion) => {
    minion.attack += attack;
    minion.health += health;
  });

  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${source.name} 在战斗开始时鼓舞了 ${friendlies.length} 个${source.combatStart.tribe}友军，赋予 +${attack}/+${health}。`,
    {
      actionType: "combatStart",
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: friendlies.map((minion) => minion.instanceId),
      cues: createCombatStartCue(source),
      progress,
      delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
    }
  );
  return true;
}

function resolveGainSelfPerFriendlyCombatStart(context) {
  const { source, side, player, enemy, logs, frames, progress } = context;
  const friendlies = getMatchingFriendlyCombatStartTargets(context);
  const count = friendlies.length;
  if (count <= 0) {
    return false;
  }

  const attack = (source.combatStart.attack ?? 0) * count;
  const health = (source.combatStart.health ?? 0) * count;
  source.attack += attack;
  source.health += health;

  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${source.name} 在战斗开始时从 ${count} 个友军身上获得战意，得到 +${attack}/+${health}。`,
    {
      actionType: "combatStart",
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: [source.instanceId],
      cues: createCombatStartCue(source),
      progress,
      delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
    }
  );
  return true;
}

function resolveDealAllDamageCombatStart(context) {
  const { source, side, targets, player, enemy, logs, frames, progress } = context;
  const livingTargets = targets.filter((minion) => minion.health > 0);
  if (!livingTargets.length) {
    return false;
  }

  const amount = source.combatStart.amount ?? 0;
  const defenderSide = side === "player" ? "enemy" : "player";
  const battleContext = { player, enemy, logs, frames };
  pushBattleLogFrame(player, enemy, logs, frames, `${source.name} 在战斗开始时对所有敌方随从造成了 ${amount} 点伤害。`, {
    actionType: "combatStart",
    attackerId: source.instanceId,
    attackerSide: side,
    defenderSide,
    defenderId: livingTargets[0].instanceId,
    hitIds: livingTargets.map((minion) => minion.instanceId),
    cues: createCombatStartCue(source),
    progress,
    delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
  });

  livingTargets.forEach((target) => {
    const note = applyDamage(target, amount, source, battleContext, {
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      progress,
    });
    recordPostDamageEffects(note, target, player, enemy, logs, frames, {
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      progress,
    });
  });

  pushBattleFrameOnly(player, enemy, frames, {
    actionType: "combatStart",
    attackerId: source.instanceId,
    attackerSide: side,
    defenderSide,
    defenderId: livingTargets[0].instanceId,
    hitIds: livingTargets.map((minion) => minion.instanceId),
    progress,
    delay: BATTLE_COMBAT_START_HIT_DELAY_MS,
  });
  return true;
}

function resolveGrantKeywordFriendlyTribeCombatStart(context) {
  const { source, side, player, enemy, logs, frames, progress } = context;
  const keyword = source.combatStart.keyword;
  const friendlies = getMatchingFriendlyCombatStartTargets(context).filter(
    (minion) => !minion.keywords.includes(keyword)
  );
  if (!friendlies.length) {
    return false;
  }

  friendlies.forEach((minion) => {
    minion.keywords.push(keyword);
  });

  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${source.name} 在战斗开始时为 ${friendlies.length} 个${source.combatStart.tribe}友军施加了${getKeywordLabel(keyword)}。`,
    {
      actionType: "combatStart",
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: friendlies.map((minion) => minion.instanceId),
      cues: createCombatStartCue(source),
      progress,
      delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
    }
  );
  return true;
}

function resolveGrantKeywordAdjacentCombatStart(context) {
  const { source, side, player, enemy, logs, frames, progress } = context;
  const keyword = source.combatStart.keyword;
  const adjacent = getAdjacentFriendlyCombatStartTargets(context).filter(
    (minion) => !minion.keywords.includes(keyword)
  );
  if (!adjacent.length) {
    return false;
  }

  adjacent.forEach((minion) => {
    minion.keywords.push(keyword);
  });

  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${source.name} 在战斗开始时为相邻友军施加了${getKeywordLabel(keyword)}。`,
    {
      actionType: "combatStart",
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: adjacent.map((minion) => minion.instanceId),
      cues: createCombatStartKeywordGrantCues(source, adjacent, keyword),
      progress,
      delay: BATTLE_COMBAT_START_ACTION_DELAY_MS,
    }
  );
  return true;
}

function getMatchingFriendlyCombatStartTargets(context) {
  const { source, side, player, enemy } = context;
  const includeSource = Boolean(source.combatStart.includeSource);
  const board = getCombatStartSourceBoard(context);
  return board.filter((minion) => {
    if (minion.health <= 0) {
      return false;
    }
    if (!includeSource && minion.instanceId === source.instanceId) {
      return false;
    }
    if (source.combatStart.tribe && minion.tribe !== source.combatStart.tribe) {
      return false;
    }
    return true;
  });
}

function getAdjacentFriendlyCombatStartTargets(context) {
  const board = getCombatStartSourceBoard(context);
  const index = board.findIndex((minion) => minion.instanceId === context.source.instanceId);
  if (index === -1) {
    return [];
  }

  return [board[index - 1], board[index + 1]].filter((minion) => {
    if (!minion || minion.health <= 0) {
      return false;
    }
    if (context.source.combatStart.tribe && minion.tribe !== context.source.combatStart.tribe) {
      return false;
    }
    return true;
  });
}

function getCombatStartSourceBoard(context) {
  return context.side === "player" ? context.player : context.enemy;
}

function pickUniqueMinions(candidates, count) {
  const pool = [...candidates];
  const chosen = [];
  while (pool.length && chosen.length < count) {
    const minion = pickRandom(pool);
    chosen.push(minion);
    pool.splice(pool.indexOf(minion), 1);
  }
  return chosen;
}
