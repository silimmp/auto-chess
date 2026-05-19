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

function resolveCombatStartAbility(context) {
  const handlers = {
    "buff-friendly-tribe": resolveBuffFriendlyTribeCombatStart,
    "deal-random-damage": resolveDealRandomDamageCombatStart,
    "deal-random-damage-repeat": resolveDealRandomDamageRepeatCombatStart,
    "deal-all-damage": resolveDealAllDamageCombatStart,
    "grant-keyword-friendly-tribe": resolveGrantKeywordFriendlyTribeCombatStart,
  };
  const handler = handlers[context.source.combatStart.type];
  if (!handler) {
    return false;
  }
  return handler(context);
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
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      progress,
      delay: BATTLE_ACTION_DELAY_MS,
    });
    const note = applyDamage(target, amount);
    pushBattleFrameOnly(player, enemy, frames, {
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      hitIds: [target.instanceId],
      progress,
      delay: BATTLE_HIT_DELAY_MS,
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
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: friendlies.map((minion) => minion.instanceId),
      progress,
      delay: BATTLE_ACTION_DELAY_MS,
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
  pushBattleLogFrame(player, enemy, logs, frames, `${source.name} 在战斗开始时对所有敌方随从造成了 ${amount} 点伤害。`, {
    attackerId: source.instanceId,
    attackerSide: side,
    defenderSide,
    defenderId: livingTargets[0].instanceId,
    hitIds: livingTargets.map((minion) => minion.instanceId),
    progress,
    delay: BATTLE_ACTION_DELAY_MS,
  });

  livingTargets.forEach((target) => {
    const note = applyDamage(target, amount, source);
    recordPostDamageEffects(note, target, player, enemy, logs, frames, {
      attackerId: source.instanceId,
      defenderId: target.instanceId,
      attackerSide: side,
      defenderSide,
      progress,
    });
  });

  pushBattleFrameOnly(player, enemy, frames, {
    attackerId: source.instanceId,
    attackerSide: side,
    defenderSide,
    defenderId: livingTargets[0].instanceId,
    hitIds: livingTargets.map((minion) => minion.instanceId),
    progress,
    delay: BATTLE_HIT_DELAY_MS,
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
      attackerId: source.instanceId,
      attackerSide: side,
      hitIds: friendlies.map((minion) => minion.instanceId),
      progress,
      delay: BATTLE_ACTION_DELAY_MS,
    }
  );
  return true;
}

function getMatchingFriendlyCombatStartTargets(context) {
  const { source, side, player, enemy } = context;
  const includeSource = Boolean(source.combatStart.includeSource);
  const board = side === "player" ? player : enemy;
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
