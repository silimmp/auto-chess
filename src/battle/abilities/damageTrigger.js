function resolveDamageTrigger(note, target, player, enemy, logs, frames, options = {}) {
  if (note !== "damaged" || target.health <= 0 || !target.damageTrigger) {
    return false;
  }

  const handlers = {
    "gain-stats-when-damaged": resolveGainStatsWhenDamaged,
  };
  const handler = handlers[target.damageTrigger.type];
  if (!handler) {
    return false;
  }

  return handler(target, player, enemy, logs, frames, options);
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
    hitIds: [target.instanceId],
    delay: BATTLE_HIT_DELAY_MS,
  });
  return true;
}
