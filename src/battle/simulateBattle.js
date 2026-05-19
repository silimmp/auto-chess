function simulateBattle(playerBoard, enemyBoard) {
  const player = playerBoard.map(cloneForBattle);
  const enemy = enemyBoard.map(cloneForBattle);
  const logs = [];
  const frames = [];

  resolveCombatStartEffects(player, enemy, logs, frames);

  let attackerSide = chooseStartingSide(player, enemy);
  let playerPointer = 0;
  let enemyPointer = 0;
  let turns = 0;
  let exchange = 1;

  while (player.length > 0 && enemy.length > 0 && turns < 40) {
    const attackers = attackerSide === "player" ? player : enemy;
    const defenders = attackerSide === "player" ? enemy : player;
    const pointer = attackerSide === "player" ? playerPointer : enemyPointer;
    const attackerIndex = findNextAttackerIndex(attackers, pointer);
    if (attackerIndex === -1) {
      attackerSide = attackerSide === "player" ? "enemy" : "player";
      turns += 1;
      continue;
    }

    if (attackerSide === "player") {
      playerPointer = attackerIndex + 1;
    } else {
      enemyPointer = attackerIndex + 1;
    }

    const attacker = attackers[attackerIndex];
    const defenderIndex = chooseTargetIndex(defenders);
    const defender = defenders[defenderIndex];
    const cleaveTarget = getCleaveTarget(defenders, defenderIndex, attacker);
    const progress = `第 ${exchange} 次交锋`;
    const attackMessage = `${getSideLabel(attackerSide)} ${attacker.name} 攻击了 ${getOpposingSideLabel(attackerSide)} ${defender.name}。`;
    const defenderSide = attackerSide === "player" ? "enemy" : "player";

    pushBattleLogFrame(player, enemy, logs, frames, attackMessage, {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      attackerSide,
      defenderSide,
      progress,
      delay: BATTLE_ACTION_DELAY_MS,
    });

    const attackerDamageNote = applyDamage(attacker, defender.attack, defender);
    const defenderDamageNote = applyDamage(defender, attacker.attack, attacker);
    const hitIds = [attacker.instanceId, defender.instanceId];
    if (cleaveTarget) {
      hitIds.push(cleaveTarget.instanceId);
    }
    pushBattleFrameOnly(player, enemy, frames, {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      attackerSide,
      defenderSide,
      hitIds,
      progress,
      delay: BATTLE_HIT_DELAY_MS,
    });

    recordPostDamageEffects(attackerDamageNote, attacker, player, enemy, logs, frames, {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      attackerSide,
      defenderSide,
      progress,
    });
    recordPostDamageEffects(defenderDamageNote, defender, player, enemy, logs, frames, {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      attackerSide,
      defenderSide,
      progress,
    });
    if (cleaveTarget) {
      const cleaveNote = applyDamage(cleaveTarget, attacker.attack, attacker);
      pushBattleLogFrame(
        player,
        enemy,
        logs,
        frames,
        `${attacker.name} 的顺劈波及了 ${cleaveTarget.name}。`,
        {
          attackerId: attacker.instanceId,
          defenderId: cleaveTarget.instanceId,
          attackerSide,
          defenderSide,
          hitIds: [cleaveTarget.instanceId],
          progress,
          delay: BATTLE_HIT_DELAY_MS,
        }
      );
      recordPostDamageEffects(cleaveNote, cleaveTarget, player, enemy, logs, frames, {
        attackerId: attacker.instanceId,
        defenderId: cleaveTarget.instanceId,
        attackerSide,
        defenderSide,
        progress,
      });
    }

    cleanupBattlefield(player, enemy, logs, frames, progress);

    attackerSide = attackerSide === "player" ? "enemy" : "player";
    turns += 1;
    exchange += 1;
  }

  let winner = "draw";
  if (player.length > 0 && enemy.length === 0) {
    winner = "player";
  } else if (enemy.length > 0 && player.length === 0) {
    winner = "enemy";
  }

  const summary =
    winner === "player" ? "战斗结束，我方获胜。" : winner === "enemy" ? "战斗结束，敌方获胜。" : "战斗结束，双方平局。";

  return {
    winner,
    summary,
    logs,
    frames,
    startingPlayer: playerBoard.map(copyMinion),
    startingEnemy: enemyBoard.map(copyMinion),
    remainingPlayer: player.map(copyMinion),
    remainingEnemy: enemy.map(copyMinion),
  };
}

function applyDamage(target, amount, source = null) {
  if (target.health <= 0 || amount <= 0) {
    return "none";
  }

  if (target.keywords.includes("divineShield")) {
    target.keywords = target.keywords.filter((keyword) => keyword !== "divineShield");
    return "shield";
  }

  if (source && source.keywords.includes("poisonous")) {
    target.health = 0;
    return "poisoned";
  }

  target.health -= amount;
  return "damaged";
}

function getCleaveTarget(board, defenderIndex, attacker) {
  if (!attacker.keywords.includes("cleave")) {
    return null;
  }
  if (defenderIndex + 1 >= board.length) {
    return null;
  }
  const target = board[defenderIndex + 1];
  return target && target.health > 0 ? target : null;
}

function cleanupBattlefield(player, enemy, logs, frames, progress) {
  removeDefeatedMinions(player, enemy, player, enemy, "player", logs, frames, progress);
  removeDefeatedMinions(enemy, player, player, enemy, "enemy", logs, frames, progress);
}

function removeDefeatedMinions(board, opposingBoard, player, enemy, side, logs, frames, progress) {
  for (let index = 0; index < board.length; ) {
    const minion = board[index];
    if (minion.health > 0) {
      index += 1;
      continue;
    }

    const sideLabel = getSideLabel(side);
    const deathMessage = `${sideLabel} ${minion.name} 阵亡。`;
    pushBattleLogFrame(player, enemy, logs, frames, deathMessage, {
      defeatedIds: [minion.instanceId],
      progress,
      delay: BATTLE_CLEANUP_DELAY_MS,
    });

    if (tryResolveReborn(board, index, minion, player, enemy, side, logs, frames, progress)) {
      index += 1;
      continue;
    }

    const summons = buildDeathrattleSummons(board, minion);
    board.splice(index, 1, ...summons);
    pushBattleFrameOnly(player, enemy, frames, {
      progress,
      delay: BATTLE_CLEANUP_DELAY_MS,
    });

    if (summons.length) {
      const summonMessage = `${sideLabel} ${minion.name} 的亡语生效，召唤了 ${summons.length} 个单位。`;
      pushBattleLogFrame(player, enemy, logs, frames, summonMessage, {
        progress,
        delay: BATTLE_CLEANUP_DELAY_MS,
      });
    }

    index += summons.length;
  }
}

function tryResolveReborn(board, index, minion, player, enemy, side, logs, frames, progress) {
  if (!minion.keywords.includes("reborn") || minion.reborn?.used) {
    return false;
  }

  minion.health = 1;
  minion.reborn = { ...(minion.reborn || {}), used: true };
  minion.keywords = minion.keywords.filter((keyword) => keyword !== "reborn");
  board.splice(index, 1, minion);
  pushBattleLogFrame(player, enemy, logs, frames, `${getSideLabel(side)} ${minion.name} 触发复生，再次回到了战场。`, {
    defeatedIds: [],
    hitIds: [minion.instanceId],
    progress,
    delay: BATTLE_CLEANUP_DELAY_MS,
  });
  return true;
}

function pushBattleLogFrame(player, enemy, logs, frames, message, options = {}) {
  logs.push(message);
  pushBattleFrameOnly(player, enemy, frames, { ...options, log: message });
}

function pushBattleFrameOnly(player, enemy, frames, options = {}) {
  frames.push(createBattleFrame(player, enemy, options));
}

function recordPostDamageEffects(note, target, player, enemy, logs, frames, options = {}) {
  recordShieldBreak(note, target, player, enemy, logs, frames, options);
  resolveDamageTrigger(note, target, player, enemy, logs, frames, options);
}

function recordShieldBreak(note, target, player, enemy, logs, frames, options = {}) {
  if (note !== "shield") {
    return;
  }

  pushBattleLogFrame(player, enemy, logs, frames, `${target.name} 的圣盾被打掉了。`, {
    ...options,
    hitIds: [target.instanceId],
    delay: BATTLE_HIT_DELAY_MS,
  });
}

function getSideLabel(side) {
  return side === "player" ? "我方" : "敌方";
}

function getOpposingSideLabel(side) {
  return side === "player" ? "敌方" : "我方";
}

function pickRandom(list) {
  return list[randomInt(0, list.length - 1)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
