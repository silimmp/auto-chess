import {
  BATTLE_ACTION_DELAY_MS,
  BATTLE_CLEANUP_DELAY_MS,
  BATTLE_HIT_DELAY_MS,
  BOARD_LIMIT,
  COMBAT_START_PROGRESS_LABEL,
} from "../data/rules.js";
import { cloneForBattle, copyMinion, createOwnedMinion } from "../data/minions.js";

export function simulateBattle(playerBoard, enemyBoard) {
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

    const attackerDamageNote = applyDamage(attacker, defender.attack);
    const defenderDamageNote = applyDamage(defender, attacker.attack);
    pushBattleFrameOnly(player, enemy, frames, {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      attackerSide,
      defenderSide,
      hitIds: [attacker.instanceId, defender.instanceId],
      progress,
      delay: BATTLE_HIT_DELAY_MS,
    });

    recordShieldBreak(attackerDamageNote, attacker, player, enemy, logs, frames, {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      attackerSide,
      defenderSide,
      progress,
    });
    recordShieldBreak(defenderDamageNote, defender, player, enemy, logs, frames, {
      attackerId: attacker.instanceId,
      defenderId: defender.instanceId,
      attackerSide,
      defenderSide,
      progress,
    });

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

function resolveCombatStartEffects(player, enemy, logs, frames) {
  runCombatStartAbilities(player, "player", enemy, player, enemy, logs, frames);
  runCombatStartAbilities(enemy, "enemy", player, player, enemy, logs, frames);
  cleanupBattlefield(player, enemy, logs, frames, COMBAT_START_PROGRESS_LABEL);
}

function runCombatStartAbilities(sources, side, targets, player, enemy, logs, frames) {
  sources
    .filter((minion) => minion.combatStart)
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

function chooseStartingSide(player, enemy) {
  if (player.length > enemy.length) {
    return "player";
  }
  if (enemy.length > player.length) {
    return "enemy";
  }
  return Math.random() < 0.5 ? "player" : "enemy";
}

function findNextAttackerIndex(board, pointer) {
  if (!board.length) {
    return -1;
  }

  for (let offset = 0; offset < board.length; offset += 1) {
    const index = (pointer + offset) % board.length;
    const minion = board[index];
    if (minion.health > 0 && minion.attack > 0) {
      return index;
    }
  }
  return -1;
}

function chooseTargetIndex(board) {
  const provokeIndex = board.findIndex((minion) => minion.keywords.includes("provoke"));
  if (provokeIndex !== -1) {
    return provokeIndex;
  }

  const tauntIndex = board.findIndex((minion) => minion.keywords.includes("taunt"));
  if (tauntIndex !== -1) {
    return tauntIndex;
  }

  return 0;
}

function applyDamage(target, amount) {
  if (target.health <= 0 || amount <= 0) {
    return "none";
  }

  if (target.keywords.includes("divineShield")) {
    target.keywords = target.keywords.filter((keyword) => keyword !== "divineShield");
    return "shield";
  }

  target.health -= amount;
  return "damaged";
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

function pushBattleLogFrame(player, enemy, logs, frames, message, options = {}) {
  logs.push(message);
  pushBattleFrameOnly(player, enemy, frames, { ...options, log: message });
}

function pushBattleFrameOnly(player, enemy, frames, options = {}) {
  frames.push(createBattleFrame(player, enemy, options));
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
