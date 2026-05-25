function createBattleEffectsRuntime() {
  let app = null;
  let appReady = false;
  let initPromise = null;
  let host = null;
  let arena = null;
  let resizeObserver = null;
  let lastWidth = 0;
  let lastHeight = 0;
  let pendingEffects = [];
  let activeTickers = [];
  let activeFrameHandles = [];
  let activeFlashOverlays = new Map();
  let tickerResumeTimeoutId = null;
  let tickerPauseDepth = 0;
  let uiOverlayLayer = null;
  let shieldAuraLayer = null;
  let burstLayer = null;
  let shieldAuras = new Map();

  function recordBattleDebug(type, payload) {
    window.__AUTO_CHESS_BATTLE_DEBUG__?.record?.(type, payload);
  }

  function ensureReady() {
    if (!window.PIXI) {
      return false;
    }
    if (appReady) {
      return true;
    }
    if (initPromise) {
      return false;
    }

    host = document.querySelector("#battle-vfx-layer");
    arena = document.querySelector(".battle-arena");
    if (!host || !arena) {
      return false;
    }

    app = new window.PIXI.Application();
    initPromise = app
      .init({
        width: Math.max(1, Math.round(host.clientWidth)),
        height: Math.max(1, Math.round(host.clientHeight)),
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })
      .then(() => {
        host.innerHTML = "";
        host.appendChild(app.canvas);
        burstLayer = new window.PIXI.Container();
        uiOverlayLayer = new window.PIXI.Container();
        shieldAuraLayer = new window.PIXI.Container();
        app.stage.addChild(shieldAuraLayer);
        app.stage.addChild(burstLayer);
        app.stage.addChild(uiOverlayLayer);
        appReady = true;
        syncSize();
        flushPending();
      })
      .catch(() => {
        app = null;
        appReady = false;
      })
      .finally(() => {
        initPromise = null;
      });

    resizeObserver = new ResizeObserver(() => {
      syncSize();
    });
    resizeObserver.observe(host);
    return true;
  }

  function syncSize() {
    if (!app || !appReady || !app.renderer || !host) {
      return;
    }

    const width = Math.max(1, Math.round(host.clientWidth));
    const height = Math.max(1, Math.round(host.clientHeight));
    if (width === lastWidth && height === lastHeight) {
      return;
    }
    lastWidth = width;
    lastHeight = height;
    app.renderer.resize(width, height);
  }

  function getArenaPointFromCard(card, focus = "center") {
    if (!arena || !card) {
      return null;
    }

    const arenaRect = arena.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - arenaRect.left;
    const centerY = rect.top + rect.height / 2 - arenaRect.top;

    if (focus === "left") {
      return { x: rect.left - arenaRect.left + rect.width * 0.28, y: centerY };
    }
    if (focus === "right") {
      return { x: rect.left - arenaRect.left + rect.width * 0.72, y: centerY };
    }
    if (focus === "top") {
      return { x: centerX, y: rect.top - arenaRect.top + rect.height * 0.26 };
    }
    return { x: centerX, y: centerY };
  }

  function getCardMetrics(card) {
    if (!arena || !card) {
      return null;
    }

    const arenaRect = arena.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    return {
      rect,
      arenaRect,
      center: {
        x: rect.left + rect.width / 2 - arenaRect.left,
        y: rect.top + rect.height / 2 - arenaRect.top,
      },
    };
  }

  function getImpactPoint(attackerMetrics, defenderMetrics) {
    if (!attackerMetrics || !defenderMetrics) {
      return null;
    }

    const deltaX = defenderMetrics.center.x - attackerMetrics.center.x;
    const deltaY = defenderMetrics.center.y - attackerMetrics.center.y;
    const distance = Math.max(1, Math.hypot(deltaX, deltaY));
    const unitX = deltaX / distance;
    const unitY = deltaY / distance;
    const directionalOffsetX = Math.sign(unitX || 0) * (defenderMetrics.rect.width / 6);
    const directionalOffsetY = Math.sign(unitY || 0) * (defenderMetrics.rect.height / 6);
    return {
      x: defenderMetrics.center.x - directionalOffsetX,
      y: defenderMetrics.center.y - directionalOffsetY,
      unitX,
      unitY,
      distance,
    };
  }

  function getBattleCard(instanceId) {
    if (!instanceId) {
      return null;
    }
    return document.querySelector(`.battle-board .minion-card[data-instance-id="${instanceId}"]`);
  }

  function addFrameHandle(handle) {
    activeFrameHandles.push(handle);
  }

  function removeFrameHandle(handle) {
    activeFrameHandles = activeFrameHandles.filter((entry) => entry !== handle);
  }

  function cancelActiveFrameHandles() {
    activeFrameHandles.forEach((handle) => window.cancelAnimationFrame(handle));
    activeFrameHandles = [];
  }

  function pauseTickerBriefly(duration = 80) {
    if (!app?.ticker) {
      return;
    }

    tickerPauseDepth += 1;
    if (tickerPauseDepth === 1) {
      app.ticker.stop();
    }
    if (tickerResumeTimeoutId !== null) {
      window.clearTimeout(tickerResumeTimeoutId);
    }
    tickerResumeTimeoutId = window.setTimeout(() => {
      tickerResumeTimeoutId = null;
      tickerPauseDepth = 0;
      if (app?.ticker) {
        app.ticker.start();
      }
    }, duration);
  }

  function flashDefenderWhite(card, frameCount = 3) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => flashDefenderWhite(card, frameCount));
      return;
    }

    const instanceId = card?.dataset?.instanceId || `flash-${Date.now()}`;
    const previousOverlay = activeFlashOverlays.get(instanceId);
    if (previousOverlay) {
      previousOverlay.destroy({ children: true });
      activeFlashOverlays.delete(instanceId);
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const { rect, center } = metrics;
    const overlay = new window.PIXI.Graphics();
    overlay.x = center.x;
    overlay.y = center.y;
    overlay.roundRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height, 20);
    overlay.fill({ color: 0xffffff, alpha: 0.36 });
    burstLayer.addChild(overlay);
    activeFlashOverlays.set(instanceId, overlay);

    let remainingFrames = frameCount;
    const step = () => {
      if (overlay.destroyed) {
        activeFlashOverlays.delete(instanceId);
        return;
      }

      remainingFrames -= 1;
      if (remainingFrames <= 0) {
        overlay.destroy();
        activeFlashOverlays.delete(instanceId);
        return;
      }

      const handle = window.requestAnimationFrame(() => {
        removeFrameHandle(handle);
        step();
      });
      addFrameHandle(handle);
    };

    const handle = window.requestAnimationFrame(() => {
      removeFrameHandle(handle);
      step();
    });
    addFrameHandle(handle);
  }

  function playDamageNumber(card, text, tone = "primary") {
    if (!ensureReady() || !appReady || !uiOverlayLayer || !window.PIXI?.Text) {
      return;
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const config =
      tone === "splash"
        ? { fill: 0xfff4dc, stroke: 0xa64c1b, glow: 0xffa05d, fontSize: 22 }
        : tone === "secondary"
          ? { fill: 0xf4fbff, stroke: 0x2d679c, glow: 0x76cfff, fontSize: 24 }
          : { fill: 0xfffcf6, stroke: 0xa43722, glow: 0xff7e5a, fontSize: 28 };

    const label = new window.PIXI.Text({
      text,
      style: {
        fontFamily: '"Trebuchet MS", "Microsoft YaHei", sans-serif',
        fontSize: config.fontSize,
        fontWeight: "900",
        fill: config.fill,
        stroke: {
          color: config.stroke,
          width: 5,
          join: "round",
        },
        dropShadow: {
          alpha: 0.42,
          blur: 6,
          color: config.glow,
          distance: 0,
        },
      },
    });
    label.anchor.set(0.5);
    label.x = metrics.center.x;
    label.y = metrics.center.y - metrics.rect.height * 0.2;
    uiOverlayLayer.addChild(label);

    let elapsed = 0;
    const duration = 720;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || label.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const rise = 1 - Math.pow(1 - t, 2.6);
      label.y = metrics.center.y - metrics.rect.height * (0.2 + rise * 0.22);
      label.alpha = t < 0.12 ? t / 0.12 : 1 - Math.max(0, t - 0.58) / 0.42;
      label.scale.set(t < 0.18 ? 0.72 + (t / 0.18) * 0.38 : 1.1 - Math.max(0, t - 0.18) * 0.16);

      if (t >= 1) {
        removeTicker(ticker);
        label.destroy();
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function getCueTone(label = "") {
    if (label === "亡语" || label === "复生") {
      return "necromancy";
    }
    if (label === "护盾破裂" || label === "护盾") {
      return "shield";
    }
    if (label === "狂袭" || label === "连击") {
      return "attack";
    }
    return "neutral";
  }

  function getCueBadgeConfig(label) {
    const tone = getCueTone(label);
    if (tone === "shield") {
      return {
        background: 0x2e679d,
        border: 0xc6efff,
        text: 0xf9feff,
        glow: 0x7fccff,
      };
    }
    if (tone === "necromancy") {
      return {
        background: 0x54734b,
        border: 0xd5efc4,
        text: 0xfafbee,
        glow: 0xa2df8a,
      };
    }
    if (tone === "attack") {
      return {
        background: 0x93432d,
        border: 0xffcfb0,
        text: 0xfffbf4,
        glow: 0xff9866,
      };
    }
    return {
      background: 0x7d613d,
      border: 0xe7cfad,
      text: 0xfffbf2,
      glow: 0xe2bd87,
    };
  }

  function getRoleBadgeConfig(kind) {
    if (kind === "defender") {
      return {
        background: 0x2d5f8f,
        border: 0xbfe3ff,
        text: 0xf5fbff,
        glow: 0x80c5ff,
      };
    }
    if (kind === "caster") {
      return {
        background: 0x83612a,
        border: 0xf6ddb2,
        text: 0xfffbf2,
        glow: 0xf0c577,
      };
    }
    return {
      background: 0x914130,
      border: 0xffcfb3,
      text: 0xfffbf4,
      glow: 0xff9572,
    };
  }

  function createOverlayBadge(text, config) {
    const container = new window.PIXI.Container();
    const plate = new window.PIXI.Graphics();
    const accent = new window.PIXI.Graphics();
    const label = new window.PIXI.Text({
      text,
      style: {
        fontFamily: '"Trebuchet MS", "Microsoft YaHei", sans-serif',
        fontSize: config.fontSize ?? 13,
        fontWeight: "900",
        fill: config.text ?? 0xfffbf4,
        letterSpacing: config.letterSpacing ?? 1.4,
        stroke: {
          color: config.textStroke ?? 0x000000,
          width: config.textStrokeWidth ?? 3,
          join: "round",
        },
        dropShadow: {
          alpha: config.shadowAlpha ?? 0.34,
          blur: config.shadowBlur ?? 6,
          color: config.glow ?? 0xffffff,
          distance: 0,
        },
      },
    });
    label.anchor.set(0.5);

    const paddingX = config.paddingX ?? 12;
    const paddingY = config.paddingY ?? 5;
    const width = label.width + paddingX * 2;
    const height = label.height + paddingY * 2;
    const radius = Math.min(config.radius ?? height / 2, height / 2);

    plate.roundRect(-width / 2, -height / 2, width, height, radius);
    plate.fill({ color: config.background ?? 0x7d613d, alpha: config.backgroundAlpha ?? 0.94 });
    plate.stroke({ color: config.border ?? 0xffffff, alpha: config.borderAlpha ?? 0.8, width: config.borderWidth ?? 1.5 });

    accent.roundRect(-width / 2 + 1.5, -height / 2 + 1.5, width - 3, Math.max(4, height * 0.46), Math.max(4, radius - 2));
    accent.fill({ color: config.accent ?? 0xffffff, alpha: config.accentAlpha ?? 0.12 });

    container.addChild(plate);
    container.addChild(accent);
    container.addChild(label);
    return container;
  }

  function playOverlayBadge(card, text, config = {}) {
    if (!text || !ensureReady() || !appReady || !uiOverlayLayer || !window.PIXI?.Text) {
      return;
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const badge = createOverlayBadge(text, config);
    const baseLift = config.baseLift ?? 14;
    badge.x = metrics.center.x;
    badge.y = metrics.rect.top - metrics.arenaRect.top - baseLift;
    badge.alpha = 0;
    badge.scale.set(config.startScale ?? 0.84);
    uiOverlayLayer.addChild(badge);

    let elapsed = 0;
    const duration = Math.max(180, config.duration ?? 720);
    const riseDistance = config.riseDistance ?? 18;
    const fadeInEnd = Math.min(0.3, config.fadeInEnd ?? 0.12);
    const fadeOutStart = Math.max(fadeInEnd, Math.min(0.96, config.fadeOutStart ?? 0.66));
    const scaleInEnd = Math.min(0.4, config.scaleInEnd ?? 0.18);
    const peakScale = config.peakScale ?? 1.04;
    const endScale = config.endScale ?? 0.97;
    const startY = badge.y;
    const startScale = config.startScale ?? 0.84;

    const ticker = (tick) => {
      if (!appReady || !app?.stage || badge.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const rise = 1 - Math.pow(1 - t, 2.35);
      badge.y = startY - riseDistance * rise;

      const fadeIn = fadeInEnd <= 0 ? 1 : Math.min(1, t / fadeInEnd);
      const fadeOut = t <= fadeOutStart ? 1 : 1 - Math.min(1, (t - fadeOutStart) / (1 - fadeOutStart));
      badge.alpha = Math.max(0, Math.min(fadeIn, fadeOut));

      const scale =
        t <= scaleInEnd
          ? startScale + ((peakScale - startScale) * t) / Math.max(scaleInEnd, 0.001)
          : peakScale - (peakScale - endScale) * Math.min(1, (t - scaleInEnd) / Math.max(1 - scaleInEnd, 0.001));
      badge.scale.set(scale);

      if (t >= 1) {
        removeTicker(ticker);
        badge.destroy({ children: true });
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playCueBadge(card, label, options = {}) {
    if (!label || label === "开局效果") {
      return;
    }
    playOverlayBadge(card, label, {
      ...getCueBadgeConfig(label),
      fontSize: 13,
      paddingX: 12,
      paddingY: 5,
      baseLift: options.baseLift ?? 30,
      riseDistance: options.riseDistance ?? 16,
      duration: options.duration ?? 820,
      startScale: 0.82,
      peakScale: 1.06,
      endScale: 0.98,
      letterSpacing: 1.2,
    });
  }

  function playRoleBadge(card, label, kind, options = {}) {
    if (!label) {
      return;
    }
    playOverlayBadge(card, label, {
      ...getRoleBadgeConfig(kind),
      fontSize: 11,
      paddingX: 10,
      paddingY: 4,
      baseLift: options.baseLift ?? 12,
      riseDistance: options.riseDistance ?? 8,
      duration: options.duration ?? 460,
      startScale: 0.88,
      peakScale: 1.02,
      endScale: 0.98,
      letterSpacing: 1,
      accentAlpha: 0.1,
      shadowAlpha: 0.28,
    });
  }

  function playTargetGlow(card, tone = "primary") {
    if (!ensureReady() || !appReady || !uiOverlayLayer) {
      return;
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const { rect, center } = metrics;
    const glow = new window.PIXI.Graphics();
    glow.x = center.x;
    glow.y = center.y;
    uiOverlayLayer.addChild(glow);

    const color = tone === "secondary" ? 0x83d9ff : tone === "splash" ? 0xffae6b : 0xff8c6e;
    let elapsed = 0;
    const duration = 320;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || glow.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      glow.clear();
      glow.roundRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height, 22);
      glow.stroke({ color, alpha: 0.44 * (1 - easeOut), width: 4.6 - easeOut * 1.8 });
      glow.fill({ color, alpha: 0.06 + (1 - easeOut) * 0.06 });
      glow.scale.set(0.96 + easeOut * 0.08);

      if (t >= 1) {
        removeTicker(ticker);
        glow.destroy();
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playCardInnerJolt(card, vector = null, options = {}) {
    const main = card?.querySelector?.(".minion-main");
    if (!main) {
      return;
    }

    const shiftX = vector?.x ?? 0;
    const shiftY = vector?.y ?? 0;
    const duration = Math.max(80, options.duration ?? 180);
    const stretchX = options.stretchX ?? 0.018;
    const squashY = options.squashY ?? 0.028;
    const token = (main.__vfxJoltToken ?? 0) + 1;
    main.__vfxJoltToken = token;
    recordBattleDebug("battle-jolt-start", {
      instanceId: card?.dataset?.instanceId || null,
      side: card?.dataset?.side || "",
      x: Number(shiftX.toFixed(2)),
      y: Number(shiftY.toFixed(2)),
      duration,
      stretchX: Number(stretchX.toFixed(4)),
      squashY: Number(squashY.toFixed(4)),
    });

    const startTime = window.performance.now();
    const step = (now) => {
      if (main.__vfxJoltToken !== token || !main.isConnected) {
        recordBattleDebug("battle-jolt-cancel", {
          instanceId: card?.dataset?.instanceId || null,
          side: card?.dataset?.side || "",
          token,
          activeToken: main.__vfxJoltToken ?? null,
          connected: main.isConnected,
        });
        main.style.removeProperty("transform");
        return;
      }

      const t = Math.min(1, (now - startTime) / duration);
      const local = t < 0.58 ? t / 0.58 : (t - 0.58) / 0.42;
      const amount = t < 0.58 ? 1 - Math.pow(1 - local, 2.3) : Math.max(0, 1 - Math.pow(local, 1.3));
      const x = shiftX * amount;
      const y = shiftY * amount;
      const scaleX = 1 + stretchX * amount;
      const scaleY = 1 - squashY * amount;
      main.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) scaleX(${scaleX.toFixed(4)}) scaleY(${scaleY.toFixed(4)})`;

      if (t >= 1) {
        main.style.removeProperty("transform");
        recordBattleDebug("battle-jolt-end", {
          instanceId: card?.dataset?.instanceId || null,
          side: card?.dataset?.side || "",
          token,
        });
        return;
      }

      const handle = window.requestAnimationFrame((next) => {
        removeFrameHandle(handle);
        step(next);
      });
      addFrameHandle(handle);
    };

    const handle = window.requestAnimationFrame((next) => {
      removeFrameHandle(handle);
      step(next);
    });
    addFrameHandle(handle);
  }

  function getCardShiftVector(sourceCard, targetCard, distance = 8) {
    const sourceMetrics = getCardMetrics(sourceCard);
    const targetMetrics = getCardMetrics(targetCard);
    if (!sourceMetrics || !targetMetrics) {
      return { x: 0, y: 0 };
    }

    const deltaX = targetMetrics.center.x - sourceMetrics.center.x;
    const deltaY = targetMetrics.center.y - sourceMetrics.center.y;
    const length = Math.max(1, Math.hypot(deltaX, deltaY));
    return {
      x: (deltaX / length) * distance,
      y: (deltaY / length) * distance,
    };
  }

  function playAttackTrail(card, side = "player") {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playAttackTrail(card, side));
      return;
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const dashX = Number.parseFloat(card.style.getPropertyValue("--attack-dash-x") || "0");
    const dashY = Number.parseFloat(card.style.getPropertyValue("--attack-dash-y") || "0");
    const length = Math.max(18, Math.hypot(dashX, dashY));
    const angle = Math.atan2(dashY || (side === "player" ? -1 : 1), dashX || 0);
    recordBattleDebug("battle-trail", {
      instanceId: card?.dataset?.instanceId || null,
      side,
      dashX: Number(dashX.toFixed(2)),
      dashY: Number(dashY.toFixed(2)),
      length: Number(length.toFixed(2)),
      angle: Number(angle.toFixed(3)),
      className: card.className,
    });

    const container = new window.PIXI.Container();
    container.x = metrics.center.x - dashX * 0.12;
    container.y = metrics.center.y - dashY * 0.12;
    burstLayer.addChild(container);

    const smear = new window.PIXI.Graphics();
    const flare = new window.PIXI.Graphics();
    container.addChild(smear);
    container.addChild(flare);

    let elapsed = 0;
    const duration = 240;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || smear.destroyed || flare.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 2.6);
      const alpha = 0.42 * (1 - easeOut);
      const trailLength = length * (0.34 + easeOut * 0.22);
      const trailWidth = metrics.rect.width * (0.09 + (1 - easeOut) * 0.04);

      smear.clear();
      smear.rotation = angle + Math.PI / 2;
      smear.roundRect(-trailWidth / 2, -trailLength * 0.52, trailWidth, trailLength, trailWidth * 0.45);
      smear.fill({ color: side === "player" ? 0xff9e73 : 0x7fcfff, alpha });

      flare.clear();
      flare.x = Math.cos(angle) * 6;
      flare.y = Math.sin(angle) * 6;
      flare.circle(0, 0, metrics.rect.width * (0.08 + (1 - easeOut) * 0.03));
      flare.fill({ color: side === "player" ? 0xfff0e0 : 0xf4fbff, alpha: alpha * 0.9 });

      if (t >= 1) {
        removeTicker(ticker);
        container.destroy({ children: true });
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function shakeArena(directionX, directionY, duration = 110) {
    if (!arena) {
      return;
    }

    const amplitudeX = Math.max(-1, Math.min(1, directionX || 0)) * 8;
    const amplitudeY = Math.max(-1, Math.min(1, directionY || 0)) * 4;
    arena.style.setProperty("--battle-shake-x", `${amplitudeX.toFixed(2)}px`);
    arena.style.setProperty("--battle-shake-y", `${amplitudeY.toFixed(2)}px`);
    arena.classList.remove("impact-shaking");
    void arena.offsetWidth;
    arena.classList.add("impact-shaking");
    if (arena.__impactShakeTimeoutId) {
      window.clearTimeout(arena.__impactShakeTimeoutId);
    }
    arena.__impactShakeTimeoutId = window.setTimeout(() => {
      arena.classList.remove("impact-shaking");
      arena.style.removeProperty("--battle-shake-x");
      arena.style.removeProperty("--battle-shake-y");
      arena.__impactShakeTimeoutId = null;
    }, duration);
  }

  function sampleQuadratic(start, control, end, t) {
    const inverse = 1 - t;
    return {
      x: inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
      y: inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    };
  }

  function drawQuadraticStroke(graphics, start, control, end, progress, style) {
    if (progress <= 0) {
      return;
    }

    const steps = Math.max(8, Math.round(22 * progress));
    graphics.moveTo(start.x, start.y);
    for (let index = 1; index <= steps; index += 1) {
      const point = sampleQuadratic(start, control, end, (index / steps) * progress);
      graphics.lineTo(point.x, point.y);
    }
    graphics.stroke(style);
  }

  function playShieldBreak(card) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playShieldBreak(card));
      return;
    }

    const point = getArenaPointFromCard(card, "center");
    if (!point) {
      return;
    }
    const arenaRect = arena.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const burstWidth = rect.width + 18;
    const burstHeight = rect.height + 18;
    const impactBiasX =
      point.x < arenaRect.width / 2 ? burstWidth * 0.14 : point.x > arenaRect.width / 2 ? -burstWidth * 0.14 : 0;

    const container = new window.PIXI.Container();
    container.x = point.x;
    container.y = point.y;
    burstLayer.addChild(container);

    const ring = new window.PIXI.Graphics();
    const flash = new window.PIXI.Graphics();
    const shell = new window.PIXI.Graphics();
    const shards = [];

    flash.roundRect(-rect.width / 2, -rect.height / 2, rect.width, rect.height, 20);
    flash.fill({ color: 0xe9f8ff, alpha: 0.34 });
    container.addChild(flash);

    shell.roundRect(-burstWidth / 2, -burstHeight / 2, burstWidth, burstHeight, 24);
    shell.stroke({ color: 0xc8f0ff, alpha: 0.82, width: 2.4 });
    container.addChild(shell);

    ring.roundRect(-burstWidth / 2, -burstHeight / 2, burstWidth, burstHeight, 24);
    ring.stroke({ color: 0x7ed6ff, alpha: 0.96, width: 4 });
    container.addChild(ring);

    for (let index = 0; index < 8; index += 1) {
      const shard = new window.PIXI.Graphics();
      shard.roundRect(-2.2, -8, 4.4, 16, 2);
      shard.fill({ color: index % 2 === 0 ? 0xe9f9ff : 0x74c9ff, alpha: 0.92 });
      shard.rotation = (Math.PI * 2 * index) / 8;
      shard.x = Math.cos(shard.rotation) * (burstWidth * 0.32);
      shard.y = Math.sin(shard.rotation) * (burstHeight * 0.32);
      shards.push({
        display: shard,
        vx: Math.cos(shard.rotation) * (1.5 + index * 0.1),
        vy: Math.sin(shard.rotation) * (1.2 + index * 0.08),
      });
      container.addChild(shard);
    }

    let elapsed = 0;
    const duration = 520;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || ring.destroyed || flash.destroyed || shell.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);

      ring.scale.set(0.92 + easeOut * 0.82);
      ring.x = impactBiasX * (1 - easeOut * 0.75);
      ring.alpha = 0.96 * (1 - easeOut);
      ring.clear();
      ring.roundRect(-burstWidth / 2, -burstHeight / 2, burstWidth, burstHeight, 24);
      ring.stroke({ color: 0x7ed6ff, alpha: 0.96 * (1 - easeOut), width: 4 - easeOut * 1.9 });

      shell.scale.set(0.98 + easeOut * 0.3);
      shell.alpha = 0.72 * (1 - easeOut);

      flash.scale.set(0.96 + easeOut * 0.18);
      flash.alpha = 0.34 * (1 - easeOut);

      shards.forEach((shard) => {
        if (shard.display.destroyed) {
          return;
        }
        shard.display.x += shard.vx * tick.deltaTime;
        shard.display.y += shard.vy * tick.deltaTime;
        shard.display.alpha = 0.92 * (1 - easeOut);
        shard.display.scale.set(1 - easeOut * 0.35);
      });

      if (t >= 1) {
        removeTicker(ticker);
        if (!container.destroyed) {
          container.destroy({ children: true });
        }
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playPrimaryImpact(attackerCard, defenderCard, side) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playPrimaryImpact(attackerCard, defenderCard, side));
      return;
    }

    const attackerMetrics = getCardMetrics(attackerCard);
    const defenderMetrics = getCardMetrics(defenderCard);
    const impact = getImpactPoint(attackerMetrics, defenderMetrics);
    if (!attackerMetrics || !defenderMetrics || !impact) {
      return;
    }
    recordBattleDebug("battle-impact", {
      attackerId: attackerCard?.dataset?.instanceId || null,
      attackerSide: attackerCard?.dataset?.side || "",
      defenderId: defenderCard?.dataset?.instanceId || null,
      defenderSide: side || "",
      x: Number(impact.x.toFixed(2)),
      y: Number(impact.y.toFixed(2)),
      unitX: Number(impact.unitX.toFixed(3)),
      unitY: Number(impact.unitY.toFixed(3)),
      distance: Number(impact.distance.toFixed(2)),
    });
    const warmSide = side === "player";
    const container = new window.PIXI.Container();
    container.x = impact.x;
    container.y = impact.y;
    burstLayer.addChild(container);

    const shockRing = new window.PIXI.Graphics();
    const coreFlash = new window.PIXI.Graphics();
    const debris = [];
    container.addChild(shockRing);
    container.addChild(coreFlash);

    const spread = defenderMetrics.rect.width * 0.3;
    const sparkCount = 13;
    for (let index = 0; index < sparkCount; index += 1) {
      const shard = new window.PIXI.Graphics();
      shard.roundRect(-2.2, -10, 4.4, 20, 2.4);
      shard.fill({
        color: warmSide ? (index % 2 === 0 ? 0xfff4de : 0xff8a54) : index % 2 === 0 ? 0xf2fbff : 0x62c6ff,
        alpha: 0.98,
      });
      const arc = (index / (sparkCount - 1) - 0.5) * 1.2;
      const angle = Math.atan2(impact.unitY, impact.unitX) + arc;
      shard.rotation = angle + Math.PI / 2;
      shard.x = Math.cos(angle) * (6.5 + Math.abs(arc) * 12);
      shard.y = Math.sin(angle) * (6.5 + Math.abs(arc) * 12);
      debris.push({
        display: shard,
        vx: Math.cos(angle) * (2.7 + Math.abs(arc) * 3.7) + impact.unitX * 1.35,
        vy: Math.sin(angle) * (2.1 + Math.abs(arc) * 2.5) + impact.unitY * 1.05,
      });
      container.addChild(shard);
    }

    function renderImpactFrame(progress) {
      const eased = 1 - Math.pow(1 - progress, 3);

      shockRing.clear();
      shockRing.ellipse(0, 0, defenderMetrics.rect.width * (0.1 + eased * 0.13), defenderMetrics.rect.height * (0.075 + eased * 0.09));
      shockRing.stroke({
        color: warmSide ? 0xffc07c : 0x83d9ff,
        alpha: 0.98 * (1 - eased * 0.88),
        width: 4.2 - eased * 1.6,
      });

      coreFlash.clear();
      coreFlash.circle(0, 0, defenderMetrics.rect.width * (0.07 + (1 - Math.abs(eased - 0.16) * 2.8) * 0.045));
      coreFlash.fill({ color: warmSide ? 0xfff8f0 : 0xffffff, alpha: 0.5 + (1 - eased) * 0.3 });

      debris.forEach((entry) => {
        if (entry.display.destroyed) {
          return;
        }
        entry.display.alpha = 0.98 * (1 - eased * 0.9);
        entry.display.scale.set(1.04 - eased * 0.22, 1.04 - eased * 0.16);
      });
    }

    renderImpactFrame(0);
    pauseTickerBriefly(80);
    flashDefenderWhite(defenderCard, 4);
    shakeArena(impact.unitX, impact.unitY, 110);

    let elapsed = 0;
    const duration = 360;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || shockRing.destroyed || coreFlash.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      renderImpactFrame(t);

      debris.forEach((entry) => {
        if (entry.display.destroyed) {
          return;
        }
        entry.display.x += entry.vx * tick.deltaTime;
        entry.display.y += entry.vy * tick.deltaTime;
      });

      if (t >= 1) {
        removeTicker(ticker);
        if (!container.destroyed) {
          container.destroy({ children: true });
        }
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playReborn(card) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playReborn(card));
      return;
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const { rect, center } = metrics;
    const container = new window.PIXI.Container();
    container.x = center.x;
    container.y = center.y;
    burstLayer.addChild(container);

    const mist = new window.PIXI.Graphics();
    const wave = new window.PIXI.Graphics();
    const core = new window.PIXI.Graphics();
    const emberBursts = [];

    mist.ellipse(0, rect.height * 0.1, rect.width * 0.34, rect.height * 0.24);
    mist.fill({ color: 0x22072d, alpha: 0.52 });
    container.addChild(mist);
    container.addChild(wave);
    container.addChild(core);

    for (let index = 0; index < 14; index += 1) {
      const particle = new window.PIXI.Graphics();
      particle.circle(0, 0, index % 3 === 0 ? 3.2 : index % 2 === 0 ? 2.4 : 1.8);
      particle.fill({ color: index % 2 === 0 ? 0xd48cff : 0x7b39b8, alpha: 0.92 });
      const startAngle = (Math.PI * 2 * index) / 14 + (index % 2 === 0 ? 0.12 : -0.12);
      const startRadiusX = rect.width * (0.46 + (index % 4) * 0.05);
      const startRadiusY = rect.height * (0.54 + (index % 3) * 0.05);
      const startX = Math.cos(startAngle) * startRadiusX;
      const startY = Math.sin(startAngle) * startRadiusY;
      const endX = Math.cos(startAngle) * (6 + (index % 3) * 2);
      const endY = Math.sin(startAngle) * (8 + (index % 2) * 2) - rect.height * 0.06;
      particle.x = startX;
      particle.y = startY;
      emberBursts.push({
        display: particle,
        startX,
        startY,
        endX,
        endY,
      });
      container.addChild(particle);
    }

    let elapsed = 0;
    const duration = 900;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || mist.destroyed || wave.destroyed || core.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const gather = Math.min(1, t / 0.62);
      const gatherEase = 1 - Math.pow(1 - gather, 3);
      const release = t < 0.46 ? 0 : Math.min(1, (t - 0.46) / 0.54);
      const releaseEase = 1 - Math.pow(1 - release, 2.5);

      mist.scale.set(0.88 + gatherEase * 0.26);
      mist.alpha = 0.48 * (1 - t) + 0.08;

      wave.clear();
      wave.ellipse(0, rect.height * 0.04, rect.width * (0.16 + releaseEase * 0.36), rect.height * (0.12 + releaseEase * 0.24));
      wave.stroke({ color: 0xd594ff, alpha: 0.68 * (1 - releaseEase), width: 3 - releaseEase * 1.2 });

      core.clear();
      core.circle(0, -rect.height * 0.02, rect.width * (0.08 + releaseEase * 0.07));
      core.fill({ color: 0xf0c2ff, alpha: 0.16 + (1 - Math.abs(releaseEase - 0.42) * 1.8) * 0.24 });

      emberBursts.forEach((ember, index) => {
        if (ember.display.destroyed) {
          return;
        }
        ember.display.x = ember.startX + (ember.endX - ember.startX) * gatherEase;
        ember.display.y = ember.startY + (ember.endY - ember.startY) * gatherEase - releaseEase * (6 + index * 0.18);
        ember.display.scale.set(1 - gatherEase * 0.3 + releaseEase * 0.22);
        ember.display.alpha = 0.28 + (1 - Math.abs(gatherEase - 0.8) * 1.8) * 0.5 - releaseEase * 0.22;
      });

      if (t >= 1) {
        removeTicker(ticker);
        if (!container.destroyed) {
          container.destroy({ children: true });
        }
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playShieldGain(card) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playShieldGain(card));
      return;
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const { rect, center } = metrics;
    const container = new window.PIXI.Container();
    container.x = center.x;
    container.y = center.y;
    burstLayer.addChild(container);

    const shell = new window.PIXI.Graphics();
    const halo = new window.PIXI.Graphics();
    const flare = new window.PIXI.Graphics();
    container.addChild(halo);
    container.addChild(shell);
    container.addChild(flare);

    let elapsed = 0;
    const duration = 700;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || shell.destroyed || halo.destroyed || flare.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 2.6);

      halo.clear();
      halo.roundRect(-rect.width / 2 - 10, -rect.height / 2 - 10, rect.width + 20, rect.height + 20, 28);
      halo.fill({ color: 0x7bc9ff, alpha: 0.08 + (1 - easeOut) * 0.12 });
      halo.scale.set(0.86 + easeOut * 0.28);

      shell.clear();
      shell.roundRect(-rect.width / 2 - 8, -rect.height / 2 - 8, rect.width + 16, rect.height + 16, 26);
      shell.stroke({ color: 0xcff2ff, alpha: 0.88 * (1 - easeOut * 0.74), width: 3.8 - easeOut * 1.6 });
      shell.scale.set(0.9 + easeOut * 0.22);

      flare.clear();
      flare.circle(0, 0, rect.width * (0.08 + (1 - Math.abs(easeOut - 0.2) * 1.9) * 0.06));
      flare.fill({ color: 0xf4fbff, alpha: 0.18 + (1 - easeOut) * 0.24 });

      if (t >= 1) {
        removeTicker(ticker);
        container.destroy({ children: true });
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playDefeat(card) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playDefeat(card));
      return;
    }

    const metrics = getCardMetrics(card);
    if (!metrics) {
      return;
    }

    const { rect, center } = metrics;
    const container = new window.PIXI.Container();
    container.x = center.x;
    container.y = center.y;
    burstLayer.addChild(container);

    const glow = new window.PIXI.Graphics();
    const dust = [];
    container.addChild(glow);

    for (let index = 0; index < 10; index += 1) {
      const mote = new window.PIXI.Graphics();
      mote.circle(0, 0, index % 2 === 0 ? 2.8 : 1.9);
      mote.fill({ color: index % 2 === 0 ? 0xffefc8 : 0xe7b56e, alpha: 0.92 });
      const angle = (Math.PI * 2 * index) / 10 - Math.PI / 2;
      const startRadiusX = rect.width * (0.12 + (index % 3) * 0.05);
      const startRadiusY = rect.height * (0.08 + (index % 4) * 0.04);
      const vx = Math.cos(angle) * (0.6 + index * 0.08);
      const vy = Math.sin(angle) * (1.1 + index * 0.06) - 0.4;
      mote.x = Math.cos(angle) * startRadiusX;
      mote.y = Math.sin(angle) * startRadiusY;
      dust.push({ display: mote, vx, vy });
      container.addChild(mote);
    }

    let elapsed = 0;
    const duration = 620;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || glow.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 2.3);

      glow.clear();
      glow.circle(0, 0, rect.width * (0.16 + easeOut * 0.12));
      glow.fill({ color: 0xffefc8, alpha: 0.18 * (1 - easeOut) });

      dust.forEach((mote) => {
        if (mote.display.destroyed) {
          return;
        }
        mote.display.x += mote.vx * tick.deltaTime;
        mote.display.y += mote.vy * tick.deltaTime;
        mote.display.alpha = 0.92 * (1 - easeOut);
        mote.display.scale.set(1 - easeOut * 0.22);
      });

      if (t >= 1) {
        removeTicker(ticker);
        container.destroy({ children: true });
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playSweepSlash(sourceCard, defenderCard, targetCards) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playSweepSlash(sourceCard, defenderCard, targetCards));
      return;
    }

    const sourceMetrics = getCardMetrics(sourceCard);
    const defenderMetrics = getCardMetrics(defenderCard);
    const targets = targetCards.map((card) => getCardMetrics(card)).filter(Boolean);
    if (!sourceMetrics || !defenderMetrics || !targets.length) {
      return;
    }

    const container = new window.PIXI.Container();
    const slash = new window.PIXI.Graphics();
    const glow = new window.PIXI.Graphics();
    const targetBursts = targets.map((target, index) => {
      const burst = new window.PIXI.Graphics();
      burst.x = target.center.x;
      burst.y = target.center.y;
      container.addChild(burst);
      return { display: burst, metrics: target, offset: index * 0.16 };
    });

    container.addChild(glow);
    container.addChild(slash);
    burstLayer.addChild(container);

    let elapsed = 0;
    const duration = 420;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || slash.destroyed || glow.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);
      const start = sourceMetrics.center;
      const pivot = defenderMetrics.center;

      glow.clear();
      glow.circle(pivot.x, pivot.y, defenderMetrics.rect.width * (0.14 + easeOut * 0.08));
      glow.fill({ color: 0xffecb3, alpha: 0.12 * (1 - easeOut) });

      slash.clear();
      targets.forEach((target, index) => {
        const localProgress = Math.min(1, Math.max(0, (t - index * 0.11) / 0.72));
        if (localProgress <= 0) {
          return;
        }
        const direction = Math.sign(target.center.x - pivot.x) || (index % 2 === 0 ? -1 : 1);
        const control = {
          x: pivot.x + direction * (24 + Math.abs(target.center.x - pivot.x) * 0.24),
          y: pivot.y - 20 - Math.abs(target.center.y - pivot.y) * 0.18,
        };
        drawQuadraticStroke(
          slash,
          start,
          control,
          target.center,
          localProgress,
          {
            color: index === 0 ? 0xfff8ea : 0xffcf70,
            alpha: 0.92 * (1 - Math.max(0, localProgress - 0.68) / 0.32),
            width: index === 0 ? 5.4 : 3.6,
            cap: "round",
            join: "round",
          }
        );
      });

      targetBursts.forEach((burst) => {
        const localProgress = Math.min(1, Math.max(0, (t - burst.offset) / 0.58));
        burst.display.clear();
        if (localProgress <= 0) {
          return;
        }
        const burstEase = 1 - Math.pow(1 - localProgress, 2.2);
        burst.display.circle(0, 0, burst.metrics.rect.width * (0.08 + burstEase * 0.09));
        burst.display.fill({ color: 0xfff1cc, alpha: 0.16 + (1 - burstEase) * 0.32 });
      });

      if (t >= 1) {
        removeTicker(ticker);
        if (!container.destroyed) {
          container.destroy({ children: true });
        }
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function playSplashBurst(sourceCard, targetCards) {
    if (!ensureReady() || !appReady || !burstLayer) {
      pendingEffects.push(() => playSplashBurst(sourceCard, targetCards));
      return;
    }

    const sourceMetrics = getCardMetrics(sourceCard);
    const targets = targetCards.map((card) => getCardMetrics(card)).filter(Boolean);
    if (!sourceMetrics || !targets.length) {
      return;
    }

    const container = new window.PIXI.Container();
    const sourcePulse = new window.PIXI.Graphics();
    const droplets = [];
    const impacts = [];

    container.x = sourceMetrics.center.x;
    container.y = sourceMetrics.center.y;
    container.addChild(sourcePulse);
    burstLayer.addChild(container);

    targets.forEach((target, targetIndex) => {
      const endX = target.center.x - sourceMetrics.center.x;
      const endY = target.center.y - sourceMetrics.center.y;
      for (let index = 0; index < 4; index += 1) {
        const particle = new window.PIXI.Graphics();
        particle.circle(0, 0, index === 0 ? 3.2 : 2.1);
        particle.fill({ color: index % 2 === 0 ? 0xffc76a : 0xff8e55, alpha: 0.92 });
        container.addChild(particle);
        droplets.push({
          display: particle,
          delay: targetIndex * 0.08 + index * 0.03,
          startX: (index - 1.5) * 2.8,
          startY: -4 + (index % 2) * 5,
          endX,
          endY,
          arc: (targetIndex === 0 ? -1 : 1) * (10 + index * 2.5),
        });
      }

      const impact = new window.PIXI.Graphics();
      impact.x = endX;
      impact.y = endY;
      container.addChild(impact);
      impacts.push({ display: impact, delay: targetIndex * 0.08 + 0.2, width: target.rect.width });
    });

    let elapsed = 0;
    const duration = 460;
    const ticker = (tick) => {
      if (!appReady || !app?.stage || container.destroyed || sourcePulse.destroyed) {
        removeTicker(ticker);
        return;
      }

      elapsed += tick.deltaMS;
      const t = Math.min(1, elapsed / duration);
      const easeOut = 1 - Math.pow(1 - t, 3);

      sourcePulse.clear();
      sourcePulse.circle(0, 0, sourceMetrics.rect.width * (0.06 + easeOut * 0.08));
      sourcePulse.fill({ color: 0xffd39a, alpha: 0.28 * (1 - easeOut) });

      droplets.forEach((droplet) => {
        if (droplet.display.destroyed) {
          return;
        }
        const localProgress = Math.min(1, Math.max(0, (t - droplet.delay) / 0.42));
        if (localProgress <= 0) {
          droplet.display.alpha = 0;
          return;
        }
        const travel = 1 - Math.pow(1 - localProgress, 2.4);
        droplet.display.alpha = 0.92 * (1 - Math.max(0, localProgress - 0.72) / 0.28);
        droplet.display.x = droplet.startX + (droplet.endX - droplet.startX) * travel;
        droplet.display.y =
          droplet.startY + (droplet.endY - droplet.startY) * travel - Math.sin(localProgress * Math.PI) * droplet.arc;
        droplet.display.scale.set(1 - localProgress * 0.22);
      });

      impacts.forEach((impact) => {
        const localProgress = Math.min(1, Math.max(0, (t - impact.delay) / 0.24));
        impact.display.clear();
        if (localProgress <= 0) {
          return;
        }
        const burstEase = 1 - Math.pow(1 - localProgress, 2.2);
        impact.display.circle(0, 0, impact.width * (0.04 + burstEase * 0.07));
        impact.display.fill({ color: 0xffc28f, alpha: 0.26 * (1 - burstEase) });
      });

      if (t >= 1) {
        removeTicker(ticker);
        if (!container.destroyed) {
          container.destroy({ children: true });
        }
      }
    };

    activeTickers.push(ticker);
    app.ticker.add(ticker);
  }

  function removeTicker(ticker) {
    if (app?.ticker) {
      app.ticker.remove(ticker);
    }
    activeTickers = activeTickers.filter((entry) => entry !== ticker);
  }

  function flushPending() {
    if (!appReady || !app?.stage || !pendingEffects.length) {
      return;
    }
    const queue = pendingEffects.slice();
    pendingEffects = [];
    queue.forEach((effect) => effect());
  }

  return {
    syncShieldAuras() {
      if (!ensureReady() || !appReady || !shieldAuraLayer) {
        return;
      }

      const cards = [...document.querySelectorAll(".battle-board .minion-card.has-divine-shield[data-instance-id]")];
      const activeIds = new Set();
      cards.forEach((card) => {
        const id = card.dataset.instanceId;
        if (!id) {
          return;
        }
        activeIds.add(id);
        let aura = shieldAuras.get(id);
        if (!aura) {
          aura = createShieldAuraEntry();
          shieldAuras.set(id, aura);
          shieldAuraLayer.addChild(aura.container);
        }
        updateShieldAuraEntry(aura, card);
      });

      [...shieldAuras.keys()].forEach((id) => {
        if (activeIds.has(id)) {
          return;
        }
        const aura = shieldAuras.get(id);
        if (aura) {
          aura.container.destroy({ children: true });
        }
        shieldAuras.delete(id);
      });
    },
    playFrameEffects(frame) {
      recordBattleDebug("battle-effects-frame", {
        actionType: frame?.actionType || "",
        attackerId: frame?.attackerId ?? null,
        defenderId: frame?.defenderId ?? null,
        hitCount: Array.isArray(frame?.hitEffects) ? frame.hitEffects.length : 0,
        cueCount: Array.isArray(frame?.cues) ? frame.cues.length : 0,
      });
      const hitEffects = Array.isArray(frame?.hitEffects) ? frame.hitEffects : [];
      const cues = Array.isArray(frame?.cues) ? frame.cues : [];
      const hasRoleTargets = Boolean(frame?.attackerId) || Boolean(frame?.defenderId);
      const hasDefeatedTargets = Boolean(frame?.defeatedIds?.length);
      if (!hitEffects.length && !cues.length && !hasRoleTargets && !hasDefeatedTargets) {
        return;
      }

      const roleDuration = Math.max(320, Math.min((frame?.delay ?? 0) + 120, frame?.actionType === "combatStart" ? 780 : 620));
      const attackerCard = getBattleCard(frame?.attackerId);
      const defenderCard = getBattleCard(frame?.defenderId);
      const effectSourceCard = frame?.effectSourceId ? getBattleCard(frame.effectSourceId) : attackerCard;
      if (attackerCard) {
        playRoleBadge(
          attackerCard,
          frame?.actionType === "combatStart" ? "开局效果" : "进攻",
          frame?.actionType === "combatStart" ? "caster" : "attacker",
          { duration: roleDuration }
        );
      }
      if (defenderCard) {
        playRoleBadge(defenderCard, "受击", "defender", { duration: roleDuration });
      }

      const cueStackByTarget = new Map();
      cues.forEach((cue) => {
        if (!cue?.targetId || !cue.label || cue.label === "开局效果") {
          return;
        }
        const card = getBattleCard(cue.targetId);
        if (!card) {
          return;
        }
        const stackIndex = cueStackByTarget.get(cue.targetId) ?? 0;
        cueStackByTarget.set(cue.targetId, stackIndex + 1);
        playCueBadge(card, cue.label, {
          duration: Math.max(440, Math.min((frame?.delay ?? 0) + 220, 980)),
          baseLift: 30 + stackIndex * 18,
          riseDistance: 14 + stackIndex * 2,
        });
        if (cue.label === "护盾") {
          playShieldGain(card);
        }
      });

      if (!hitEffects.length) {
        if (attackerCard && frame?.actionType === "attack" && !frame?.hitIds?.length) {
          playAttackTrail(attackerCard, frame.attackerSide);
        }
        frame.defeatedIds?.forEach((instanceId) => {
          const defeatedCard = getBattleCard(instanceId);
          if (defeatedCard) {
            playDefeat(defeatedCard);
          }
        });
        return;
      }

      const primaryTargets = hitEffects.filter((effect) => effect.type === "primary");
      if (primaryTargets.length && frame.attackerId && frame.defenderId) {
        if (attackerCard && defenderCard) {
          playPrimaryImpact(attackerCard, defenderCard, frame.defenderSide);
        }
      }

      hitEffects.forEach((effect) => {
        const card = getBattleCard(effect.targetId);
        if (!card) {
          return;
        }
        if (effect.type === "primary" || effect.type === "secondary" || effect.type === "sweep" || effect.type === "splash") {
          const previousHealth = Number(card.dataset.lastHealth ?? "");
          const currentHealthNode = card.querySelector(".stat-pill.health");
          const currentHealth = currentHealthNode ? Number(currentHealthNode.textContent) : Number.NaN;
          const damageAmount =
            Number.isFinite(previousHealth) && Number.isFinite(currentHealth) && previousHealth > currentHealth
              ? previousHealth - currentHealth
              : 0;
          const tone = effect.type === "splash" ? "splash" : effect.type === "primary" ? "primary" : "secondary";
          playTargetGlow(card, tone);
          playCardInnerJolt(
            card,
            getCardShiftVector(effectSourceCard || attackerCard, card, effect.type === "primary" ? 8 : effect.type === "splash" ? 5 : 6),
            {
              duration: effect.type === "primary" ? 190 : 170,
              stretchX: effect.type === "primary" ? 0.02 : 0.016,
              squashY: effect.type === "primary" ? 0.032 : 0.024,
            }
          );
          if (damageAmount > 0) {
            playDamageNumber(card, `-${damageAmount}`, tone);
          }
        }
        if (effect.type === "shield-break") {
          playShieldBreak(card);
        }
        if (effect.type === "reborn") {
          playReborn(card);
        }
      });

      frame.defeatedIds?.forEach((instanceId) => {
        const defeatedCard = getBattleCard(instanceId);
        if (defeatedCard) {
          playDefeat(defeatedCard);
        }
      });

      const sweepTargets = hitEffects
        .filter((effect) => effect.type === "sweep")
        .map((effect) => getBattleCard(effect.targetId))
        .filter(Boolean);
      if (frame.attackKeyword === "sweep" && frame.effectSourceId === frame.attackerId && sweepTargets.length) {
        const sourceCard = getBattleCard(frame.attackerId);
        const defenderCard = getBattleCard(frame.defenderId);
        if (sourceCard && defenderCard) {
          playSweepSlash(sourceCard, defenderCard, sweepTargets);
        }
      }

      const splashTargets = hitEffects
        .filter((effect) => effect.type === "splash")
        .map((effect) => getBattleCard(effect.targetId))
        .filter(Boolean);
      if (frame.attackKeyword === "splash" && frame.effectSourceId && frame.effectSourceId !== frame.attackerId && splashTargets.length) {
        const sourceCard = getBattleCard(frame.effectSourceId);
        if (sourceCard) {
          playSplashBurst(sourceCard, splashTargets);
        }
      }
    },
    reset() {
      if (!appReady || !app?.stage) {
        return;
      }
      if (tickerResumeTimeoutId !== null) {
        window.clearTimeout(tickerResumeTimeoutId);
        tickerResumeTimeoutId = null;
      }
      tickerPauseDepth = 0;
      app.ticker.start();
      activeTickers.forEach((ticker) => {
        app.ticker.remove(ticker);
      });
      activeTickers = [];
      pendingEffects = [];
      cancelActiveFrameHandles();
      activeFlashOverlays.forEach((overlay) => overlay.destroy({ children: true }));
      activeFlashOverlays.clear();
      shieldAuras.forEach((aura) => aura.container.destroy({ children: true }));
      shieldAuras.clear();
      app.stage.removeChildren().forEach((child) => child.destroy?.({ children: true }));
      burstLayer = new window.PIXI.Container();
      uiOverlayLayer = new window.PIXI.Container();
      shieldAuraLayer = new window.PIXI.Container();
      app.stage.addChild(shieldAuraLayer);
      app.stage.addChild(burstLayer);
      app.stage.addChild(uiOverlayLayer);
    },
    sync() {
      ensureReady();
      syncSize();
      this.syncShieldAuras();
      document.querySelectorAll(".battle-board .minion-card[data-instance-id]").forEach((card) => {
        const healthNode = card.querySelector(".stat-pill.health");
        if (healthNode) {
          card.dataset.lastHealth = healthNode.textContent || "";
        }
      });
    },
  };

  function createShieldAuraEntry() {
    const container = new window.PIXI.Container();
    const ring = new window.PIXI.Graphics();
    const glow = new window.PIXI.Graphics();
    const particles = [];

    container.addChild(glow);
    container.addChild(ring);

    for (let index = 0; index < 6; index += 1) {
      const particle = new window.PIXI.Graphics();
      particle.circle(0, 0, index % 2 === 0 ? 2.4 : 1.8);
      particle.fill({ color: index % 2 === 0 ? 0xe7f8ff : 0x8fd6ff, alpha: 0.9 });
      container.addChild(particle);
      particles.push({
        display: particle,
        angle: (Math.PI * 2 * index) / 6,
        speed: 0.006 + index * 0.0007,
      });
    }

    return {
      container,
      glow,
      ring,
      particles,
      phase: Math.random() * Math.PI * 2,
    };
  }

  function updateShieldAuraEntry(aura, card) {
    const arenaRect = arena.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2 - arenaRect.left;
    const centerY = rect.top + rect.height / 2 - arenaRect.top;
    const width = rect.width + 18;
    const height = rect.height + 18;
    const time = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin(time * 0.0032 + aura.phase);
    const breathScale = 1 + pulse * 0.035;

    aura.container.x = centerX;
    aura.container.y = centerY;
    aura.container.scale.set(breathScale);

    aura.glow.clear();
    aura.glow.roundRect(-width / 2, -height / 2, width, height, 26);
    aura.glow.stroke({ color: 0x67c6ff, alpha: 0.18 + pulse * 0.12, width: 2.2 });
    aura.glow.fill({ color: 0x72cfff, alpha: 0.05 + pulse * 0.025 });

    aura.ring.clear();
    aura.ring.roundRect(-width / 2, -height / 2, width, height, 26);
    aura.ring.stroke({ color: 0xb7ecff, alpha: 0.24 + pulse * 0.18, width: 1.5 });

    const rx = width / 2;
    const ry = height / 2;
    aura.particles.forEach((particle, index) => {
      particle.angle += particle.speed * 16;
      const x = Math.cos(particle.angle) * rx;
      const y = Math.sin(particle.angle) * ry;
      particle.display.x = x;
      particle.display.y = y;
      particle.display.alpha = 0.45 + 0.4 * Math.sin(time * 0.004 + index);
    });
  }
}

window.__AUTO_CHESS_BATTLE_EFFECTS__ = createBattleEffectsRuntime();
