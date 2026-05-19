function buildMinionCard(minion, options = {}) {
  const { battle = false, showActions = true, slotLabel = "", battleVisual = null } = options;
  const healthValue = Math.max(0, minion.health);
  const healthClass = healthValue <= 0 ? "zero" : healthValue <= 2 ? "low" : "";
  const battleStateClasses = battleVisual
    ? [
        battleVisual.isAttacker ? "attacking" : "",
        battleVisual.isDefender ? "defending" : "",
        battleVisual.chargeClass,
        battleVisual.takingHit ? "taking-hit" : "",
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
            : "keyword";
      return `<span class="${className}">${label}</span>`;
    })
    .join("");

  const battleTop = battle
    ? `
      <div class="battle-card-top">
        <span class="battle-slot">${slotLabel}</span>
        ${battleVisual?.roleLabel ? `<span class="battle-role ${battleVisual.roleClass}">${battleVisual.roleLabel}</span>` : ""}
      </div>
    `
    : "";

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
  return keyword;
}
