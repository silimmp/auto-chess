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
