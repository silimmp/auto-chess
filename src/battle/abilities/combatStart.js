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
    "deal-random-damage": resolveDealRandomDamageCombatStart,
  };
  const handler = handlers[context.source.combatStart.type];
  if (!handler) {
    return false;
  }
  return handler(context);
}

function resolveDealRandomDamageCombatStart(context) {
  const { source, side, targets, player, enemy, logs, frames, progress } = context;
  const livingTargets = targets.filter((minion) => minion.health > 0);
  if (!livingTargets.length) {
    return false;
  }

  const target = pickRandom(livingTargets);
  const amount = source.combatStart.amount ?? 0;
  const message = `${source.name} 在战斗开始时命中 ${target.name}，造成 ${amount} 点伤害。`;
  const defenderSide = side === "player" ? "enemy" : "player";
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
  recordShieldBreak(note, target, player, enemy, logs, frames, {
    attackerId: source.instanceId,
    defenderId: target.instanceId,
    attackerSide: side,
    defenderSide,
    progress,
  });
  return true;
}
