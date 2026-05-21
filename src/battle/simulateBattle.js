function simulateBattle(playerBoard, enemyBoard) {
  const player = playerBoard.map(cloneForBattle);
  const enemy = enemyBoard.map(cloneForBattle);
  const logs = [];
  const frames = [];

  resolveCombatStartEffects(player, enemy, logs, frames);

  let attackerSide = chooseStartingSide(player, enemy);
  markInitialAssaults(player);
  markInitialAssaults(enemy);
  resolvePendingAssaults(player, enemy, logs, frames, attackerSide, COMBAT_START_PROGRESS_LABEL);
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
    const progress = `第 ${exchange} 次交锋`;
    performAttackSequence(player, enemy, logs, frames, attackerSide, attacker.instanceId, progress);

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

function performAttackSequence(player, enemy, logs, frames, attackerSide, attackerId, progress) {
  const comboLimit = hasLivingKeywordUnit(attackerId, attackerSide, player, enemy, "combo") ? 2 : 1;
  let attackCount = 0;

  for (let comboIndex = 0; comboIndex < comboLimit; comboIndex += 1) {
    const attackers = attackerSide === "player" ? player : enemy;
    const defenders = attackerSide === "player" ? enemy : player;
    if (!defenders.length) {
      break;
    }

    const attacker = attackers.find((minion) => minion.instanceId === attackerId && minion.health > 0);
    if (!attacker || attacker.attack <= 0) {
      break;
    }

    if (comboIndex > 0) {
      pushBattleLogFrame(player, enemy, logs, frames, `${getSideLabel(attackerSide)} ${attacker.name} 发动连击，再次发起攻击。`, {
        attackerId: attacker.instanceId,
        attackerSide,
        cues: [{ targetId: attacker.instanceId, type: "keyword", label: "连击" }],
        progress,
        delay: BATTLE_ACTION_DELAY_MS,
      });
    }

    performSingleAttack(player, enemy, logs, frames, attackerSide, attacker, progress);
    attackCount += 1;
  }

  return attackCount;
}

function performSingleAttack(player, enemy, logs, frames, attackerSide, attacker, progress) {
  const defenders = attackerSide === "player" ? enemy : player;
  const defenderIndex = chooseTargetIndex(defenders);
  const defender = defenders[defenderIndex];
  const extraHits = getAttackExtraHits(defenders, defenderIndex, attacker);
  const defenderSide = attackerSide === "player" ? "enemy" : "player";
  const attackMessage = `${getSideLabel(attackerSide)} ${attacker.name} 攻击了 ${getOpposingSideLabel(attackerSide)} ${defender.name}。`;
  const battleContext = { player, enemy, logs, frames };

  pushBattleLogFrame(player, enemy, logs, frames, attackMessage, {
    attackerId: attacker.instanceId,
    defenderId: defender.instanceId,
    attackerSide,
    defenderSide,
    progress,
    delay: BATTLE_ACTION_DELAY_MS,
  });

  const attackerDamageOptions = {
    attackerId: defender.instanceId,
    defenderId: attacker.instanceId,
    attackerSide: defenderSide,
    defenderSide: attackerSide,
    progress,
  };
  const defenderDamageOptions = {
    attackerId: attacker.instanceId,
    defenderId: defender.instanceId,
    attackerSide,
    defenderSide,
    progress,
  };
  const attackerDamageNote = applyDamage(attacker, defender.attack, defender, battleContext, attackerDamageOptions);
  const defenderDamageNote = applyDamage(defender, attacker.attack, attacker, battleContext, defenderDamageOptions);
  pushBattleFrameOnly(player, enemy, frames, {
    attackerId: attacker.instanceId,
    defenderId: defender.instanceId,
    attackerSide,
    defenderSide,
    hitIds: [attacker.instanceId, defender.instanceId, ...extraHits.map((entry) => entry.target.instanceId)],
    progress,
    delay: BATTLE_HIT_DELAY_MS,
  });

  recordPostDamageEffects(attackerDamageNote, attacker, player, enemy, logs, frames, attackerDamageOptions);
  recordPostDamageEffects(defenderDamageNote, defender, player, enemy, logs, frames, defenderDamageOptions);

  if (extraHits.length) {
    const extraLabel = extraHits[0].label;
    const extraNames = extraHits.map((entry) => entry.target.name).join("、");
    const extraLog =
      extraLabel === "溅射"
        ? `${attacker.name} 的溅射波及了 ${extraNames}，各造成 1 点伤害。`
        : `${attacker.name} 的${extraLabel}波及了 ${extraNames}。`;
    pushBattleLogFrame(player, enemy, logs, frames, extraLog, {
      attackerId: attacker.instanceId,
      defenderId: extraHits[0].target.instanceId,
      attackerSide,
      defenderSide,
      hitIds: extraHits.map((entry) => entry.target.instanceId),
      progress,
      delay: BATTLE_HIT_DELAY_MS,
    });

    extraHits.forEach((entry) => {
      const splashNote = applyDamage(entry.target, entry.damage, attacker, battleContext, {
        attackerId: attacker.instanceId,
        defenderId: entry.target.instanceId,
        attackerSide,
        defenderSide,
        allowPoisonous: entry.allowPoisonous,
        progress,
      });
      recordPostDamageEffects(splashNote, entry.target, player, enemy, logs, frames, {
        attackerId: attacker.instanceId,
        defenderId: entry.target.instanceId,
        attackerSide,
        defenderSide,
        progress,
      });
    });
  }

  cleanupBattlefield(player, enemy, logs, frames, progress);
  resolvePendingAssaults(player, enemy, logs, frames, attackerSide, progress);
}

function applyDamage(target, amount, source = null, battleContext = null, options = {}) {
  if (target.health <= 0 || amount <= 0) {
    return "none";
  }

  if (battleContext && options.allowBarrier !== false) {
    const protector = getBarrierProtector(target, battleContext.player, battleContext.enemy);
    const redirected = protector ? Math.floor(amount / 2) : 0;
    if (protector && redirected > 0) {
      const defenderSide = getMinionSide(target, battleContext.player, battleContext.enemy);
      const protectorNote = applyDamage(protector, redirected, source, battleContext, {
        ...options,
        allowBarrier: false,
      });
      pushBattleLogFrame(
        battleContext.player,
        battleContext.enemy,
        battleContext.logs,
        battleContext.frames,
        `${getSideLabel(defenderSide)} ${protector.name} 以壁垒为 ${target.name} 分担了 ${redirected} 点伤害。`,
        {
          attackerId: options.attackerId ?? (source ? source.instanceId : null),
          defenderId: protector.instanceId,
          attackerSide: options.attackerSide ?? "",
          defenderSide,
          hitIds: [protector.instanceId],
          progress: options.progress,
          delay: BATTLE_HIT_DELAY_MS,
        }
      );
      recordPostDamageEffects(
        protectorNote,
        protector,
        battleContext.player,
        battleContext.enemy,
        battleContext.logs,
        battleContext.frames,
        {
          attackerId: options.attackerId ?? (source ? source.instanceId : null),
          defenderId: protector.instanceId,
          attackerSide: options.attackerSide ?? "",
          defenderSide,
          progress: options.progress,
        }
      );
      amount -= redirected;
    }
  }

  if (target.keywords.includes("divineShield")) {
    target.keywords = target.keywords.filter((keyword) => keyword !== "divineShield");
    return "shield";
  }

  if (options.allowPoisonous !== false && source && source.keywords.includes("poisonous")) {
    target.health = 0;
    return "poisoned";
  }

  target.health -= amount;
  return "damaged";
}

function getAttackExtraHits(board, defenderIndex, attacker) {
  const adjacentTargets = [board[defenderIndex - 1], board[defenderIndex + 1]].filter(
    (target) => target && target.health > 0
  );

  if (attacker.keywords.includes("sweep")) {
    return adjacentTargets.map((target) => ({
      target,
      label: "横扫",
      damage: attacker.attack,
      allowPoisonous: true,
    }));
  }

  if (attacker.keywords.includes("cleave")) {
    const chosen = adjacentTargets.length ? pickRandom(adjacentTargets) : null;
    return chosen
      ? [
          {
            target: chosen,
            label: "顺劈",
            damage: attacker.attack,
            allowPoisonous: true,
          },
        ]
      : [];
  }

  if (attacker.keywords.includes("splash")) {
    return adjacentTargets.map((target) => ({
      target,
      label: "溅射",
      damage: 1,
      allowPoisonous: false,
    }));
  }

  return [];
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

    index += resolveDeathrattle(board, opposingBoard, index, minion, player, enemy, side, logs, frames, progress);
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
  markPendingAssault(minion);
  pushBattleLogFrame(player, enemy, logs, frames, `${getSideLabel(side)} ${minion.name} 触发复生，再次回到了战场。`, {
    defeatedIds: [],
    hitIds: [minion.instanceId],
    cues: [{ targetId: minion.instanceId, type: "keyword", label: "复生" }],
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
    cues: [{ targetId: target.instanceId, type: "keyword", label: "圣盾破裂" }],
    delay: BATTLE_HIT_DELAY_MS,
  });
}

function getSideLabel(side) {
  return side === "player" ? "我方" : "敌方";
}

function getOpposingSideLabel(side) {
  return side === "player" ? "敌方" : "我方";
}

function getMinionSide(target, player, enemy) {
  return player.some((minion) => minion.instanceId === target.instanceId) ? "player" : "enemy";
}

function getBarrierProtector(target, player, enemy) {
  const board = getMinionSide(target, player, enemy) === "player" ? player : enemy;
  const index = board.findIndex((minion) => minion.instanceId === target.instanceId);
  if (index === -1) {
    return null;
  }

  return [board[index - 1], board[index + 1]].find(
    (minion) => minion && minion.health > 0 && minion.keywords.includes("barrier")
  ) || null;
}

function markInitialAssaults(board) {
  board.forEach((minion) => {
    if (minion.health > 0) {
      markPendingAssault(minion);
    }
  });
}

function markPendingAssault(minion) {
  if (minion.health > 0 && minion.keywords.includes("assault")) {
    minion.pendingAssault = true;
  }
}

function resolvePendingAssaults(player, enemy, logs, frames, preferredSide, progress) {
  while (true) {
    const next = findPendingAssault(player, enemy, preferredSide);
    if (!next) {
      return;
    }

    next.minion.pendingAssault = false;
    const opposingBoard = next.side === "player" ? enemy : player;
    if (next.minion.health <= 0 || next.minion.attack <= 0 || !opposingBoard.length) {
      continue;
    }

    pushBattleLogFrame(player, enemy, logs, frames, `${getSideLabel(next.side)} ${next.minion.name} 触发狂袭，立即发起攻击。`, {
      attackerId: next.minion.instanceId,
      attackerSide: next.side,
      cues: [{ targetId: next.minion.instanceId, type: "keyword", label: "狂袭" }],
      progress,
      delay: BATTLE_ACTION_DELAY_MS,
    });
    performAttackSequence(player, enemy, logs, frames, next.side, next.minion.instanceId, progress);
  }
}

function findPendingAssault(player, enemy, preferredSide) {
  const firstBoard = preferredSide === "enemy" ? enemy : player;
  const secondBoard = preferredSide === "enemy" ? player : enemy;
  const firstSide = preferredSide === "enemy" ? "enemy" : "player";
  const secondSide = preferredSide === "enemy" ? "player" : "enemy";
  const first = firstBoard.find((minion) => minion.pendingAssault && minion.health > 0);
  if (first) {
    return { minion: first, side: firstSide };
  }

  const second = secondBoard.find((minion) => minion.pendingAssault && minion.health > 0);
  if (second) {
    return { minion: second, side: secondSide };
  }

  return null;
}

function hasLivingKeywordUnit(attackerId, side, player, enemy, keyword) {
  const board = side === "player" ? player : enemy;
  return board.some(
    (minion) => minion.instanceId === attackerId && minion.health > 0 && minion.keywords.includes(keyword)
  );
}

function pickRandom(list) {
  return list[randomInt(0, list.length - 1)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
