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
  if (cardKind === "tripleReward") {
    return playTripleRewardCardFromHandState(state, index);
  }
  if (cardKind === "brandSpell") {
    return playBrandSpellCardFromHandState(state, index, target.targetIndex);
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

function playTripleRewardCardFromHandState(state, index) {
  const card = state.hand[index];
  if (!card || state.hp <= 0) {
    return false;
  }

  state.hand.splice(index, 1);
  state.discover = {
    source: "tripleReward",
    rewardTier: card.rewardTier,
    choices: createTripleRewardChoices(card.rewardTier, null, 4, state.activeTribes),
  };
  state.message = `打出了 ${card.name}，请选择一张 ${card.rewardTier} 星奖励随从。`;
  return true;
}

function playBrandSpellCardFromHandState(state, index, targetIndex = null) {
  const card = state.hand[index];
  if (!card || state.hp <= 0) {
    return false;
  }
  if (!state.board.length) {
    state.message = "场上还没有友方随从，暂时没有施法目标。";
    return true;
  }

  const normalizedIndex = normalizeSpellTargetIndex(targetIndex, state.board.length);
  const target = state.board[normalizedIndex];
  if (!target) {
    state.message = "请选择一个友方随从来承接这个物品牌。";
    return true;
  }

  applyBrandSpellEffect(target, card.effect);
  state.hand.splice(index, 1);
  resolveBrandCastTriggers(state, target, card);
  state.message = buildBrandSpellMessage(card, target);
  return true;
}

function chooseDiscoverRewardState(state, choiceIndex) {
  if (state.phase !== "prep" || !state.discover?.choices?.[choiceIndex]) {
    return false;
  }

  const chosen = copyDiscoverChoice(state.discover.choices[choiceIndex]);
  const discoverSource = state.discover.source;
  state.discover = null;

  if (state.hand.length >= HAND_LIMIT) {
    state.message = `你选择了 ${chosen.name}，但手牌已满，奖励随从未能加入手牌。`;
    return true;
  }

  state.hand.unshift(chosen);
  state.message =
    discoverSource === "brandDiscover"
      ? `你选择了 ${chosen.name}，物品牌已加入手牌。`
      : `你选择了 ${chosen.name}，奖励随从已加入手牌。`;
  return true;
}

function getHandCardKind(card) {
  return card?.cardKind || "minion";
}

function normalizeSpellTargetIndex(index, boardLength) {
  if (!Number.isFinite(index)) {
    return boardLength > 0 ? boardLength - 1 : -1;
  }
  return Math.max(0, Math.min(boardLength - 1, index));
}

function applyBrandSpellEffect(target, effect) {
  if (!target || !effect) {
    return;
  }

  target.attack += effect.attack ?? 0;
  target.health += effect.health ?? 0;
  (effect.addKeywords || []).forEach((keyword) => {
    if (!target.keywords.includes(keyword)) {
      target.keywords.push(keyword);
    }
  });
}

function buildBrandSpellMessage(card, target) {
  const attack = card.effect?.attack ?? 0;
  const health = card.effect?.health ?? 0;
  const statLabel =
    attack || health
      ? `使其获得 ${attack >= 0 ? `+${attack}` : attack}/${health >= 0 ? `+${health}` : health}`
      : "为其附加了额外效果";
  const keywords = (card.effect?.addKeywords || []).map(getKeywordLabel);
  const keywordLabel = keywords.length ? `，并赋予${keywords.join("、")}` : "";
  return `对 ${target.name} 使用了 ${card.name}，${statLabel}${keywordLabel}。`;
}

function resolveBrandCastTriggers(state, target, card) {
  if (!state?.board?.length) {
    return;
  }

  state.board
    .filter((minion) => minion.health > 0 && minion.brandCastTrigger)
    .forEach((minion) => {
      const ability = minion.brandCastTrigger;
      if (ability.type === "buff-self-when-brand-cast" || ability.type === "reduce-random-brand-cost-placeholder") {
        minion.attack += ability.attack ?? 0;
        minion.health += ability.health ?? 0;
        return;
      }

      if (ability.type === "buff-friendly-tribe-when-brand-cast") {
        state.board.forEach((friendly) => {
          if (friendly.health <= 0) {
            return;
          }
          if (!ability.includeSource && friendly.instanceId === minion.instanceId) {
            return;
          }
          if (ability.tribe && friendly.tribe !== ability.tribe) {
            return;
          }
          friendly.attack += ability.attack ?? 0;
          friendly.health += ability.health ?? 0;
        });
        return;
      }

      if (ability.type === "buff-random-friendly-when-brand-cast") {
        const candidates = state.board.filter((friendly) => friendly.health > 0);
        const count = Math.min(ability.count ?? 1, candidates.length);
        for (let index = 0; index < count; index += 1) {
          const chosen = candidates[index];
          chosen.attack += ability.attack ?? 0;
          chosen.health += ability.health ?? 0;
        }
      }
    });
}

function copyDiscoverChoice(choice) {
  if (choice?.cardKind === "brandSpell") {
    return createBrandCard(choice.id);
  }
  return copyMinion(choice);
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
    const rewardTier = Math.min(CONTENT_TIER_CAP, state.tavernTier + 1);
    const rewardCard = createTripleRewardCard(rewardTier);
    state.hand.unshift(golden);
    state.hand.unshift(rewardCard);
    merged.push({ golden, rewardCard });
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
  return `${baseMessage}，触发了 ${mergedMinions.length} 次三连合成，金色随从和三连奖励已进入手牌。`;
}
