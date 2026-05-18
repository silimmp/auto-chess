import { BOARD_LIMIT, BUY_COST, HAND_LIMIT } from "../data/rules.js";
import { createGoldenMinion, createOwnedMinion } from "../data/minions.js";

export function refreshShopState(state, generateShop) {
  if (state.phase !== "prep" || state.gold < 1 || state.hp <= 0) {
    return false;
  }

  state.gold -= 1;
  state.shop = generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.message = "酒馆老板换了一批货。";
  return true;
}

export function upgradeTavernState(state, upgradeCosts, generateShop) {
  const upgradeCost = upgradeCosts[state.tavernTier];
  if (state.phase !== "prep" || upgradeCost === null || state.gold < upgradeCost || state.hp <= 0) {
    return false;
  }

  state.gold -= upgradeCost;
  state.tavernTier += 1;
  state.shop = generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.message = `酒馆升级到 ${state.tavernTier} 级。`;
  return true;
}

export function toggleFreezeShopState(state) {
  if (state.phase !== "prep" || state.hp <= 0 || !state.shop.length) {
    return false;
  }

  state.shopFrozen = !state.shopFrozen;
  state.message = state.shopFrozen ? "本轮商店已冻结。" : "已取消冻结。";
  return true;
}

export function buyMinionState(state, shopIndex) {
  if (state.phase !== "prep") {
    return false;
  }

  const shopMinion = state.shop[shopIndex];
  if (!shopMinion) {
    return false;
  }
  if (state.gold < BUY_COST) {
    state.message = "金币不够，先忍一手。";
    return true;
  }
  if (state.hand.length >= HAND_LIMIT) {
    state.message = "手牌已满，先处理一下手牌。";
    return true;
  }

  state.gold -= BUY_COST;
  state.shop.splice(shopIndex, 1);
  const purchasedMinion = createOwnedMinion(shopMinion.id);
  state.hand.push(purchasedMinion);

  const merged = resolveTriples(state);
  state.message = buildRecruitMessage(`买下了 ${shopMinion.name}，已置入手牌`, merged);
  return true;
}

export function playMinionState(state, index, targetIndex = getCenterInsertIndex(state.board.length)) {
  if (state.phase !== "prep") {
    return false;
  }

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

export function moveHandMinionState(state, index, targetIndex) {
  if (state.phase !== "prep" || !state.hand[index]) {
    return false;
  }

  if (reorderList(state.hand, index, targetIndex)) {
    state.message = "手牌顺序已调整。";
    return true;
  }
  return false;
}

export function moveBoardMinionState(state, index, targetIndex) {
  if (state.phase !== "prep" || !state.board[index]) {
    return false;
  }

  if (reorderList(state.board, index, targetIndex)) {
    state.message = "站位已调整。";
    return true;
  }
  return false;
}

export function sellMinionFromZoneState(state, zone, index) {
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

export function getCenterInsertIndex(length) {
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
  const triple = findTripleEntries(state);
  if (!triple) {
    return [];
  }

  const base = triple[0].minion;
  removeOwnedEntries(state, triple);
  const golden = createGoldenMinion(base);

  state.hand.unshift(golden);
  return [golden];
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
