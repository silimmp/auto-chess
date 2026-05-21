function buildMinionCard(minion, options = {}) {
  const { battle = false, showActions = true, battleVisual = null } = options;
  const healthValue = Math.max(0, minion.health);
  const healthClass = healthValue <= 0 ? "zero" : healthValue <= 2 ? "low" : "";
  const battleStateClasses = battleVisual
    ? [
        battleVisual.isAttacker ? "attacking" : "",
        battleVisual.isDefender ? "defending" : "",
        battleVisual.chargeClass,
        battleVisual.trailClass,
        battleVisual.takingHit ? "taking-hit" : "",
        battleVisual.impactClass,
        battleVisual.vanishClass,
        battleVisual.reviveClass,
        battleVisual.defeated ? "defeated" : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const card = document.createElement("article");
  card.className = `minion-card${minion.golden ? " golden" : ""}${battle ? " battle-card" : ""}${battleStateClasses ? ` ${battleStateClasses}` : ""}`;

  const keywords = minion.keywords
    .map((keyword) => {
      const label = getKeywordLabel(keyword);
      const className =
        keyword === "taunt" || keyword === "provoke"
          ? "keyword taunt"
          : keyword === "divineShield"
            ? "keyword shield"
            : keyword === "poisonous"
              ? "keyword shield"
              : keyword === "cleave"
                ? "keyword taunt"
                : keyword === "splash"
                  ? "keyword shield"
                : keyword === "sweep" || keyword === "combo" || keyword === "assault"
                  ? "keyword taunt"
                  : keyword === "barrier"
                    ? "keyword shield"
                    : "keyword";
      return `<span class="${className}">${label}</span>`;
    })
    .join("");

  const battleTop = battle
    ? `
      <div class="battle-card-top">
        ${typeof battleVisual?.slotIndex === "number" ? `<span class="battle-slot">站位 ${battleVisual.slotIndex + 1}</span>` : ""}
        ${battleVisual?.roleLabel ? `<span class="battle-role ${battleVisual.roleClass}">${battleVisual.roleLabel}</span>` : ""}
      </div>
    `
    : "";
  const battleCue = battleVisual?.cueLabel ? `<div class="battle-float-cue ${battleVisual.cueTone}">${battleVisual.cueLabel}</div>` : "";

  const infoToggle = !battle ? '<button type="button" class="card-info-toggle" aria-label="查看描述">i</button>' : "";
  const descriptionBlock = battle ? `<p class="minion-text">${minion.text || "没有额外效果。"}</p>` : "";
  const infoOverlay = !battle
    ? `
      <div class="minion-info-overlay">
        <div class="minion-info-label">随从描述</div>
        <h4 class="minion-info-name">${minion.name}</h4>
        <p class="minion-info-text">${minion.text || "没有额外效果。"}</p>
      </div>
    `
    : "";

  card.innerHTML = `
    ${battleCue}
    <div class="minion-main">
      ${battleTop}
      <div class="minion-header">
        <span class="tier-badge">★${minion.tier}</span>
        <div class="minion-title-block">
          <h3 class="minion-name">${minion.golden ? "金色" : ""}${minion.name}</h3>
        </div>
        ${infoToggle}
      </div>
      ${descriptionBlock}
      <div class="keyword-row">${keywords}</div>
      ${infoOverlay}
    </div>
    <div class="minion-footer">
      <div class="minion-meta">${minion.tribe}</div>
      <div class="stats-row">
        <span class="stat-pill attack">${minion.attack}</span>
        <span class="stat-pill health ${healthClass}">${healthValue}</span>
      </div>
      ${showActions ? '<div class="card-actions"></div>' : ""}
    </div>
  `;

  return card;
}

function buildHandCard(card, options = {}) {
  if (card?.cardKind === "tripleReward") {
    return buildTripleRewardCard(card, options);
  }
  return buildMinionCard(card, options);
}

function buildTripleRewardCard(card, options = {}) {
  const { showActions = true } = options;
  const rewardTier = Math.min(CONTENT_TIER_CAP, card.rewardTier ?? CONTENT_TIER_CAP);
  const reward = document.createElement("article");
  reward.className = "minion-card reward-card";
  reward.innerHTML = `
    <div class="minion-main">
      <div class="minion-header">
        <span class="tier-badge reward-badge">奖励</span>
        <div class="minion-title-block">
          <h3 class="minion-name">${card.name || "三连奖励"}</h3>
        </div>
      </div>
      <p class="reward-text">${card.text || "打出：获得一张奖励随从。"}</p>
      <div class="keyword-row">
        <span class="keyword reward-keyword">法术</span>
      </div>
    </div>
    <div class="minion-footer">
      <div class="minion-meta">当前可得 ${rewardTier} 星随从</div>
      <div class="reward-cta">拖到战场领取奖励</div>
      ${showActions ? '<div class="card-actions"></div>' : ""}
    </div>
  `;
  return reward;
}

function makeEmptyCard(text) {
  const card = document.createElement("div");
  card.className = "empty-card";
  card.textContent = text;
  return card;
}

function getKeywordLabel(keyword) {
  if (keyword === "taunt") {
    return "嘲讽";
  }
  if (keyword === "provoke") {
    return "挑衅";
  }
  if (keyword === "divineShield") {
    return "圣盾";
  }
  if (keyword === "deathrattle") {
    return "亡语";
  }
  if (keyword === "reborn") {
    return "复生";
  }
  if (keyword === "poisonous") {
    return "剧毒";
  }
  if (keyword === "cleave") {
    return "顺劈";
  }
  if (keyword === "splash") {
    return "溅射";
  }
  if (keyword === "sweep") {
    return "横扫";
  }
  if (keyword === "combo") {
    return "连击";
  }
  if (keyword === "barrier") {
    return "壁垒";
  }
  if (keyword === "assault") {
    return "狂袭";
  }
  return keyword;
}
