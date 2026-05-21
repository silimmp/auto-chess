function refreshShopState(state, generateShop) {
  if (state.phase !== "prep" || state.gold < 1 || state.hp <= 0) {
    return false;
  }

  state.gold -= 1;
  state.shop = generateShop(state.tavernTier);
  state.shopFrozen = false;
  state.message = "酒馆老板换了一批货。";
  return true;
}

function createTripleRewardCard(rewardTier) {
  return {
    cardKind: "tripleReward",
    name: "三连奖励",
    rewardTier,
    text: `打出：从四张 ${rewardTier} 星随从中选择一张。`,
  };
}

function createTripleRewardChoices(rewardTier, pickRandomFn = null, count = 4) {
  const effectiveTier = Math.max(1, Math.min(CONTENT_TIER_CAP, rewardTier));
  const candidates = MINION_POOL.filter((minion) => !minion.token && minion.tier === effectiveTier);
  const fallback = MINION_POOL.filter((minion) => !minion.token && minion.tier <= effectiveTier);
  const source = (candidates.length ? candidates : fallback).slice();
  const choices = [];

  while (source.length && choices.length < count) {
    const picked = typeof pickRandomFn === "function" ? pickRandomFn(source) : source[0];
    choices.push(createOwnedMinion(picked.id));
    source.splice(source.findIndex((minion) => minion.id === picked.id), 1);
  }

  while (choices.length < count && choices.length > 0) {
    choices.push(copyMinion(choices[choices.length % Math.max(1, choices.length)]));
  }

  return choices;
}

function toggleFreezeShopState(state) {
  if (state.phase !== "prep" || state.hp <= 0 || !state.shop.length) {
    return false;
  }

  state.shopFrozen = !state.shopFrozen;
  state.message = state.shopFrozen ? "本轮商店已冻结。" : "已取消冻结。";
  return true;
}

function buyMinionState(state, shopIndex) {
  return buyMinionToZoneState(state, shopIndex, "hand");
}

function buyMinionToZoneState(state, shopIndex, targetZone = "hand", targetIndex = null) {
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
  targetZone = "hand";
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

function generateShop(maxTier, pickRandom) {
  const effectiveTier = Math.min(maxTier, CONTENT_TIER_CAP);
  return Array.from({ length: SHOP_SLOTS }, () => cloneTemplate(pickShopMinion(effectiveTier, pickRandom)));
}

function refillShop(currentShop, maxTier, pickRandom) {
  const filledShop = currentShop.map(cloneTemplate);
  const missing = Math.max(0, SHOP_SLOTS - filledShop.length);
  if (missing === 0) {
    return filledShop;
  }
  return [...filledShop, ...generateShop(maxTier, pickRandom).slice(0, missing)];
}

function pickShopMinion(effectiveTier, pickRandom) {
  const tier = pickTierByOdds(SHOP_TIER_ODDS[effectiveTier], pickRandom);
  const candidates = MINION_POOL.filter((minion) => !minion.token && minion.tier === tier);
  if (candidates.length) {
    return pickRandom(candidates);
  }
  const fallback = MINION_POOL.filter((minion) => !minion.token && minion.tier <= effectiveTier);
  return pickRandom(fallback);
}

function pickTierByOdds(odds, pickRandom) {
  const entries = Object.entries(odds);
  const bag = [];
  entries.forEach(([tier, weight]) => {
    const count = Math.max(1, Math.round(weight * 100));
    for (let index = 0; index < count; index += 1) {
      bag.push(Number(tier));
    }
  });
  return pickRandom(bag);
}
