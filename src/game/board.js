function playCardFromHandState(state, index, target = {}) {
  if (state.phase !== "prep") {
    return false;
  }

  const card = state.hand[index];
  if (!card || state.hp <= 0) {
    return false;
  }
  const cardKind = getHandCardKind(card);
  if (cardKind === "minion") {
    return playMinionCardFromHandState(state, index, target.targetIndex);
  }
  state.message = `这张牌暂时还不能直接打出。`;
  return true;
}

function playMinionState(state, index, targetIndex = getCenterInsertIndex(state.board.length)) {
  return playCardFromHandState(state, index, { targetIndex });
}

function playMinionCardFromHandState(state, index, targetIndex = getCenterInsertIndex(state.board.length)) {
  const minion = state.hand[index];
  if (!minion || state.hp <= 0) {
    return false;
  }
  if (state.board.length >= BOARD_LIMIT) {
    state.message = "战队已满，先腾一个位置。";
    return true;
  }

  state.hand.splice(index, 1);
  const insertIndex = normalizeInsertIndex(targetIndex, state.board.length);
  state.board.splice(insertIndex, 0, minion);

  const merged = resolveTriples(state);
  state.message = buildRecruitMessage(`派出了 ${minion.name}`, merged);
  return true;
}

function getHandCardKind(card) {
  return card?.cardKind || "minion";
}

function moveHandMinionState(state, index, targetIndex) {
  if (state.phase !== "prep" || !state.hand[index]) {
    return false;
  }

  if (reorderList(state.hand, index, targetIndex)) {
    state.message = "手牌顺序已调整。";
    return true;
  }
  return false;
}

function moveBoardMinionState(state, index, targetIndex) {
  if (state.phase !== "prep" || !state.board[index]) {
    return false;
  }

  if (reorderList(state.board, index, targetIndex)) {
    state.message = "站位已调整。";
    return true;
  }
  return false;
}

function sellMinionFromZoneState(state, zone, index) {
  if (state.phase !== "prep") {
    return false;
  }

  const list = zone === "hand" ? state.hand : zone === "board" ? state.board : null;
  const minion = list?.[index];
  if (!list || !minion || state.hp <= 0) {
    return false;
  }

  list.splice(index, 1);
  state.gold = Math.min(10, state.gold + 1);
  state.message = `卖掉了 ${minion.name}，回收 1 金。`;
  return true;
}

function getCenterInsertIndex(length) {
  if (length <= 1) {
    return length;
  }
  return Math.ceil(length / 2);
}

function reorderList(list, fromIndex, targetIndex) {
  if (fromIndex < 0 || fromIndex >= list.length) {
    return false;
  }

  const normalizedTarget = normalizeInsertIndex(targetIndex, list.length - 1);
  const [item] = list.splice(fromIndex, 1);
  const insertIndex = normalizeInsertIndex(normalizedTarget, list.length);

  if (insertIndex === fromIndex) {
    list.splice(fromIndex, 0, item);
    return false;
  }

  list.splice(insertIndex, 0, item);
  return true;
}

function normalizeInsertIndex(index, length) {
  if (!Number.isFinite(index)) {
    return length;
  }
  return Math.max(0, Math.min(length, index));
}

function resolveTriples(state) {
  const merged = [];

  for (;;) {
    const triple = findTripleEntries(state);
    if (!triple) {
      return merged;
    }

    const base = triple[0].minion;
    removeOwnedEntries(state, triple);
    const golden = createGoldenMinion(base);
    state.hand.unshift(golden);
    merged.push(golden);
  }
}

function findTripleEntries(state) {
  const bucket = new Map();
  const entries = [
    ...state.hand.map((minion, index) => ({ zone: "hand", index, minion })),
    ...state.board.map((minion, index) => ({ zone: "board", index, minion })),
  ];

  entries.forEach((entry) => {
    if (entry.minion.golden) {
      return;
    }
    const list = bucket.get(entry.minion.id) || [];
    list.push(entry);
    bucket.set(entry.minion.id, list);
  });

  for (const list of bucket.values()) {
    if (list.length >= 3) {
      return list.slice(0, 3);
    }
  }
  return null;
}

function removeOwnedEntries(state, entries) {
  const byZone = new Map();
  entries.forEach((entry) => {
    const list = byZone.get(entry.zone) || [];
    list.push(entry.index);
    byZone.set(entry.zone, list);
  });

  byZone.forEach((indexes, zone) => {
    const target = zone === "hand" ? state.hand : state.board;
    indexes
      .slice()
      .sort((a, b) => b - a)
      .forEach((index) => {
        target.splice(index, 1);
      });
  });
}

function buildRecruitMessage(baseMessage, mergedMinions) {
  if (!mergedMinions.length) {
    return `${baseMessage}。`;
  }
  return `${baseMessage}，触发了 ${mergedMinions.length} 次三连合成，金色随从已进入手牌。`;
}
