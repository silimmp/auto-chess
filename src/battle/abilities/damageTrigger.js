function resolveDamageTrigger(note, target, player, enemy, logs, frames, options = {}) {
  if (note !== "damaged" || target.health <= 0 || !target.damageTrigger) {
    return false;
  }

  const handlers = {
    "buff-friendly-tribe-when-damaged": resolveBuffFriendlyTribeWhenDamaged,
    "deal-random-damage-when-damaged": resolveDealRandomDamageWhenDamaged,
    "gain-stats-when-damaged": resolveGainStatsWhenDamaged,
  };
  const handler = handlers[target.damageTrigger.type];
  if (!handler) {
    return false;
  }

  return handler(target, player, enemy, logs, frames, options);
}

function resolveBuffFriendlyTribeWhenDamaged(target, player, enemy, logs, frames, options) {
  const { board } = getBattleSideContext(target, player, enemy);
  const tribe = target.damageTrigger.tribe || null;
  const includeSource = Boolean(target.damageTrigger.includeSource);
  const attack = target.damageTrigger.attack ?? 0;
  const health = target.damageTrigger.health ?? 0;
  const friendlies = board.filter((minion) => {
    if (minion.health <= 0) {
      return false;
    }
    if (!includeSource && minion.instanceId === target.instanceId) {
      return false;
    }
    if (tribe && minion.tribe !== tribe) {
      return false;
    }
    return true;
  });
  if (!friendlies.length) {
    return false;
  }

  friendlies.forEach((minion) => {
    minion.attack += attack;
    minion.health += health;
  });

  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${target.name} 受伤后激励了 ${friendlies.length} 个友军，赋予 +${attack}/+${health}。`,
    {
      ...options,
      actionType: "cue",
      hitIds: friendlies.map((minion) => minion.instanceId),
      delay: BATTLE_HIT_DELAY_MS,
    }
  );
  return true;
}

function resolveDealRandomDamageWhenDamaged(target, player, enemy, logs, frames, options) {
  const sideContext = getBattleSideContext(target, player, enemy);
  const opposingBoard = sideContext.side === "player" ? enemy : player;
  const livingTargets = opposingBoard.filter((minion) => minion.health > 0);
  if (!livingTargets.length) {
    return false;
  }

  const amount = target.damageTrigger.amount ?? 0;
  const victim = pickRandom(livingTargets);
  const defenderSide = sideContext.side === "player" ? "enemy" : "player";
  const battleContext = { player, enemy, logs, frames };
  pushBattleLogFrame(
    player,
    enemy,
    logs,
    frames,
    `${target.name} 受伤后反击了 ${victim.name}，造成 ${amount} 点伤害。`,
    {
      attackerId: target.instanceId,
      defenderId: victim.instanceId,
      attackerSide: sideContext.side,
      defenderSide,
      progress: options.progress,
      delay: BATTLE_ACTION_DELAY_MS,
    }
  );

  const note = applyDamage(victim, amount, target, battleContext, {
    attackerId: target.instanceId,
    defenderId: victim.instanceId,
    attackerSide: sideContext.side,
    defenderSide,
    progress: options.progress,
  });
  pushBattleFrameOnly(player, enemy, frames, {
    attackerId: target.instanceId,
    defenderId: victim.instanceId,
    attackerSide: sideContext.side,
    defenderSide,
    hitIds: [victim.instanceId],
    progress: options.progress,
    delay: BATTLE_HIT_DELAY_MS,
  });
  recordPostDamageEffects(note, victim, player, enemy, logs, frames, {
    attackerId: target.instanceId,
    defenderId: victim.instanceId,
    attackerSide: sideContext.side,
    defenderSide,
    progress: options.progress,
  });
  return true;
}

function resolveGainStatsWhenDamaged(target, player, enemy, logs, frames, options) {
  const attack = target.damageTrigger.attack ?? 0;
  const health = target.damageTrigger.health ?? 0;
  const triggerCount = target.damageTrigger.triggerCount ?? 0;
  const limit = target.damageTrigger.limit ?? null;
  if (limit !== null && triggerCount >= limit) {
    return false;
  }

  target.attack += attack;
  target.health += health;
  target.damageTrigger = {
    ...target.damageTrigger,
    triggerCount: triggerCount + 1,
  };

  pushBattleLogFrame(player, enemy, logs, frames, `${target.name} 受伤后激怒，获得了 +${attack}/+${health}。`, {
    ...options,
    actionType: "cue",
    hitIds: [target.instanceId],
    delay: BATTLE_HIT_DELAY_MS,
  });
  return true;
}

function getBattleSideContext(target, player, enemy) {
  if (player.some((minion) => minion.instanceId === target.instanceId)) {
    return { board: player, side: "player" };
  }
  return { board: enemy, side: "enemy" };
}
