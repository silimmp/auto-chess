function buildDeathrattleSummons(board, minion) {
  if (!minion.deathrattle || minion.deathrattle.type !== "summon") {
    return [];
  }

  const availableSlots = BOARD_LIMIT - (board.length - 1);
  if (availableSlots <= 0) {
    return [];
  }

  let count = minion.deathrattle.count || 0;
  if (minion.deathrattle.countBy === "attack") {
    count = Math.max(1, minion.attack);
  }
  if (minion.golden) {
    count *= 2;
  }

  const summonCount = Math.min(availableSlots, count);
  const summons = [];
  for (let index = 0; index < summonCount; index += 1) {
    summons.push(createOwnedMinion(minion.deathrattle.minionId));
  }
  return summons;
}

function resolveDeathrattle(board, opposingBoard, index, minion, player, enemy, side, logs, frames, progress) {
  if (!minion.deathrattle) {
    board.splice(index, 1);
    pushBattleFrameOnly(player, enemy, frames, {
      progress,
      delay: BATTLE_CLEANUP_DELAY_MS,
    });
    return 0;
  }

  const handlers = {
    "buff-friendly-tribe": resolveBuffFriendlyTribeDeathrattle,
    "deal-random-damage": resolveDealRandomDamageDeathrattle,
    summon: resolveSummonDeathrattle,
  };
  const handler = handlers[minion.deathrattle.type];
  if (!handler) {
    board.splice(index, 1);
    pushBattleFrameOnly(player, enemy, frames, {
      progress,
      delay: BATTLE_CLEANUP_DELAY_MS,
    });
    return 0;
  }

  return handler(board, opposingBoard, index, minion, player, enemy, side, logs, frames, progress);
}

function resolveSummonDeathrattle(board, opposingBoard, index, minion, player, enemy, side, logs, frames, progress) {
  const summons = buildDeathrattleSummons(board, minion);
  summons.forEach((summon) => {
    markPendingAssault(summon);
  });
  board.splice(index, 1, ...summons);
  pushBattleFrameOnly(player, enemy, frames, {
    progress,
    delay: BATTLE_CLEANUP_DELAY_MS,
  });

  if (summons.length) {
    pushBattleLogFrame(player, enemy, logs, frames, `${getSideLabel(side)} ${minion.name} 的亡语生效，召唤了 ${summons.length} 个单位。`, {
      progress,
      delay: BATTLE_CLEANUP_DELAY_MS,
    });
  }
  return summons.length;
}

function resolveBuffFriendlyTribeDeathrattle(board, opposingBoard, index, minion, player, enemy, side, logs, frames, progress) {
  board.splice(index, 1);
  const attack = minion.deathrattle.attack ?? 0;
  const health = minion.deathrattle.health ?? 0;
  const tribe = minion.deathrattle.tribe || null;
  const friendlies = board.filter((friendly) => friendly.health > 0 && (!tribe || friendly.tribe === tribe));
  friendlies.forEach((friendly) => {
    friendly.attack += attack;
    friendly.health += health;
  });

  pushBattleFrameOnly(player, enemy, frames, {
    progress,
    delay: BATTLE_CLEANUP_DELAY_MS,
  });
  if (friendlies.length) {
    pushBattleLogFrame(
      player,
      enemy,
      logs,
      frames,
      `${getSideLabel(side)} ${minion.name} 的亡语鼓舞了 ${friendlies.length} 个友军，赋予 +${attack}/+${health}。`,
      {
        hitIds: friendlies.map((friendly) => friendly.instanceId),
        progress,
        delay: BATTLE_CLEANUP_DELAY_MS,
      }
    );
  }
  return 0;
}

function resolveDealRandomDamageDeathrattle(board, opposingBoard, index, minion, player, enemy, side, logs, frames, progress) {
  board.splice(index, 1);
  const shots = minion.deathrattle.shots ?? 1;
  const amount = minion.deathrattle.amount ?? 0;
  const attackerSide = side;
  const defenderSide = side === "player" ? "enemy" : "player";
  const battleContext = { player, enemy, logs, frames };

  pushBattleFrameOnly(player, enemy, frames, {
    progress,
    delay: BATTLE_CLEANUP_DELAY_MS,
  });

  for (let shot = 0; shot < shots; shot += 1) {
    const livingTargets = opposingBoard.filter((target) => target.health > 0);
    if (!livingTargets.length) {
      break;
    }
    const target = pickRandom(livingTargets);
    const label =
      shots > 1
        ? `${getSideLabel(side)} ${minion.name} 的亡语第 ${shot + 1} 次命中 ${target.name}，造成 ${amount} 点伤害。`
        : `${getSideLabel(side)} ${minion.name} 的亡语命中 ${target.name}，造成 ${amount} 点伤害。`;
    pushBattleLogFrame(player, enemy, logs, frames, label, {
      attackerId: minion.instanceId,
      defenderId: target.instanceId,
      attackerSide,
      defenderSide,
      progress,
      delay: BATTLE_ACTION_DELAY_MS,
    });
    const note = applyDamage(target, amount, minion, battleContext, {
      attackerId: minion.instanceId,
      defenderId: target.instanceId,
      attackerSide,
      defenderSide,
      progress,
    });
    pushBattleFrameOnly(player, enemy, frames, {
      attackerId: minion.instanceId,
      defenderId: target.instanceId,
      attackerSide,
      defenderSide,
      hitIds: [target.instanceId],
      progress,
      delay: BATTLE_HIT_DELAY_MS,
    });
    recordPostDamageEffects(note, target, player, enemy, logs, frames, {
      attackerId: minion.instanceId,
      defenderId: target.instanceId,
      attackerSide,
      defenderSide,
      progress,
    });
  }
  return 0;
}
