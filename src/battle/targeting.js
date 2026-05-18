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
