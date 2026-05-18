function pushBattleLogFrame(player, enemy, logs, frames, message, options = {}) {
  logs.push(message);
  pushBattleFrameOnly(player, enemy, frames, { ...options, log: message });
}

function pushBattleFrameOnly(player, enemy, frames, options = {}) {
  frames.push(createBattleFrame(player, enemy, options));
}

function createBattleFrame(player, enemy, options = {}) {
  return {
    playerBoard: player.map(copyMinion),
    enemyBoard: enemy.map(copyMinion),
    attackerId: options.attackerId ?? null,
    defenderId: options.defenderId ?? null,
    attackerSide: options.attackerSide ?? "",
    defenderSide: options.defenderSide ?? "",
    hitIds: options.hitIds ? [...options.hitIds] : [],
    defeatedIds: options.defeatedIds ? [...options.defeatedIds] : [],
    log: options.log ?? "",
    progress: options.progress ?? "战斗中",
    delay: options.delay ?? BATTLE_ACTION_DELAY_MS,
  };
}
