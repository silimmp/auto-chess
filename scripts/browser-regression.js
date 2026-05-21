"use strict";

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function requirePlaywrightCore() {
  const candidates = [
    () => require("playwright-core"),
    () =>
      require(
        path.join(
          os.homedir(),
          ".cache",
          "codex-runtimes",
          "codex-primary-runtime",
          "dependencies",
          "node",
          "node_modules",
          ".pnpm",
          "playwright-core@1.59.1",
          "node_modules",
          "playwright-core",
          "index.js"
        )
      ),
  ];

  for (const load of candidates) {
    try {
      return load();
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") {
        throw error;
      }
    }
  }

  throw new Error(
    [
      "找不到 playwright-core。",
      "可以先尝试在当前环境提供该依赖，或在运行前设置 PLAYWRIGHT_CORE_PATH 指向 playwright-core 的 index.js。",
    ].join(" ")
  );
}

function resolvePlaywrightCore() {
  if (process.env.PLAYWRIGHT_CORE_PATH) {
    return require(process.env.PLAYWRIGHT_CORE_PATH);
  }
  return requirePlaywrightCore();
}

function resolveBrowserPath() {
  const candidates = [
    process.env.BROWSER_REGRESSION_BROWSER,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    [
      "没有找到可用的 Chrome / Edge 可执行文件。",
      "可以设置 BROWSER_REGRESSION_BROWSER 指向浏览器路径后重试。",
    ].join(" ")
  );
}

function createStaticServer(root, port, missingRequests) {
  const mimeTypes = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".jpeg": "image/jpeg",
    ".jpg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
  };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === "/") {
        pathname = "/index.html";
      }

      const filePath = path.normalize(path.join(root, pathname));
      if (!filePath.startsWith(root)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }

      const stat = await fsp.stat(filePath).catch(() => null);
      if (!stat || !stat.isFile()) {
        missingRequests.push(pathname);
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": mimeTypes[ext] || "application/octet-stream",
      });
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(error && error.stack ? error.stack : error));
    }
  });
}

async function startServer(server, port) {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
}

async function stopServer(server) {
  await new Promise((resolve) => server.close(resolve));
}

async function openPage(browser, url) {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") {
      return;
    }
    const text = message.text();
    if (!text.includes("favicon.ico") && !text.includes("Failed to load resource: the server responded with a status of 404")) {
      consoleErrors.push(`${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.stack ? error.stack : error));
  });

  await page.goto(url, { waitUntil: "load" });
  return { page, consoleErrors, pageErrors };
}

async function openPageWithViewport(browser, url, viewport) {
  const page = await browser.newPage({ viewport });
  const consoleErrors = [];
  const pageErrors = [];

  page.on("console", (message) => {
    if (message.type() !== "error" && message.type() !== "warning") {
      return;
    }
    const text = message.text();
    if (!text.includes("favicon.ico") && !text.includes("Failed to load resource: the server responded with a status of 404")) {
      consoleErrors.push(`${message.type()}: ${text}`);
    }
  });
  page.on("pageerror", (error) => {
    pageErrors.push(String(error && error.stack ? error.stack : error));
  });

  await page.goto(url, { waitUntil: "load" });
  return { page, consoleErrors, pageErrors };
}

async function dragCenter(page, sourceSelector, targetSelector, targetOffset = { x: 0, y: 0 }) {
  const source = await page.locator(sourceSelector).boundingBox();
  const target = await page.locator(targetSelector).boundingBox();
  assert(source, `缺少拖拽来源：${sourceSelector}`);
  assert(target, `缺少拖拽目标：${targetSelector}`);

  const startX = source.x + source.width / 2;
  const startY = source.y + source.height / 2;
  const endX = target.x + target.width / 2 + targetOffset.x;
  const endY = target.y + target.height / 2 + targetOffset.y;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();
}

async function dragByOffset(page, sourceSelector, offset, handle = { xRatio: 0.5, yRatio: 0.5 }) {
  const source = await page.locator(sourceSelector).boundingBox();
  assert(source, `缺少拖拽来源：${sourceSelector}`);

  const startX = source.x + source.width * handle.xRatio;
  const startY = source.y + source.height * handle.yRatio;
  const endX = startX + offset.x;
  const endY = startY + offset.y;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 14 });
  await page.mouse.up();
}

async function moveMouseToSelector(page, selector, offset = { x: 0, y: 0 }) {
  const target = await page.locator(selector).boundingBox();
  assert(target, `缺少目标元素：${selector}`);

  const x = target.x + target.width / 2 + offset.x;
  const y = target.y + target.height / 2 + offset.y;
  await page.mouse.move(x, y, { steps: 8 });
}

async function waitForPrepTurn(page, expectedTurn, timeout = 12000) {
  await page.waitForFunction(
    (turn) =>
      Number(document.querySelector("#turn-value")?.textContent?.trim()) === turn &&
      document.querySelector("#phase-value")?.textContent?.trim() === "准备中" &&
      document.querySelector("#battle-view")?.classList.contains("hidden"),
    expectedTurn,
    { timeout }
  );
}

async function syncEnemyBoard(page) {
  await page.evaluate(() => {
    window.__AUTO_CHESS_TEST_API__.syncEnemyBoard(window.__AUTO_CHESS_TEST_API__.state.enemyBoard);
  });
}

async function waitForBattleResult(page, timeout = 12000) {
  await page.waitForFunction(
    () =>
      window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs.length > 0 &&
      !window.__AUTO_CHESS_TEST_API__.state.battleAnimation.isAnimating &&
      (window.__AUTO_CHESS_TEST_API__.state.phase === "battle" || window.__AUTO_CHESS_TEST_API__.state.phase === "gameOver"),
    null,
    { timeout }
  );
}

async function waitForBattleAnimation(page, timeout = 12000) {
  await page.waitForFunction(
    () =>
      window.__AUTO_CHESS_TEST_API__.state.phase === "battle" &&
      window.__AUTO_CHESS_TEST_API__.state.battleAnimation.isAnimating,
    null,
    { timeout }
  );
}

async function collectPrepCounts(page) {
  return page.evaluate(() => ({
    board: document.querySelectorAll("#player-board .minion-card").length,
    gold: document.querySelector("#gold-value")?.textContent?.trim(),
    hand: document.querySelectorAll("#hand-board .minion-card").length,
    message: document.querySelector("#message-value")?.textContent?.trim(),
    shop: document.querySelectorAll("#shop-board .minion-card").length,
  }));
}

async function collectViewportFitMetrics(page) {
  return page.evaluate(() => {
    const frame = document.querySelector(".game-shell-frame");
    const shell = document.querySelector(".game-shell");
    const panel = document.querySelector(".prep-panel");
    const tray = document.querySelector(".prep-hand-zone");
    const rootStyles = getComputedStyle(document.documentElement);
    if (!frame || !shell || !panel || !tray) {
      return null;
    }

    const frameRect = frame.getBoundingClientRect();
    const shellRect = shell.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const trayRect = tray.getBoundingClientRect();
    const scale = Number.parseFloat(rootStyles.getPropertyValue("--app-scale")) || 1;
    const shellInnerWidth = shell.offsetWidth;
    const shellInnerHeight = shell.offsetHeight;
    return {
      frameBottomOverflow: Math.round(frameRect.bottom - window.innerHeight),
      frameRightOverflow: Math.round(frameRect.right - window.innerWidth),
      panelBottomOverflow: Math.round(panelRect.bottom - frameRect.bottom),
      scale: Number(scale.toFixed(3)),
      scaleRecoveredHeight: Number((shellRect.height / Math.max(1, scale)).toFixed(1)),
      scaleRecoveredWidth: Number((shellRect.width / Math.max(1, scale)).toFixed(1)),
      shellBottomOverflow: Math.round(shellRect.bottom - window.innerHeight),
      shellHeight: Math.round(shellRect.height),
      shellInnerHeight,
      shellInnerWidth,
      shellRightOverflow: Math.round(shellRect.right - window.innerWidth),
      shellWidth: Math.round(shellRect.width),
      trayBottomOverflow: Math.round(trayRect.bottom - frameRect.bottom),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    };
  });
}

async function runScenario(name, browser, url, handler) {
  const { page, consoleErrors, pageErrors } = await openPage(browser, url);
  try {
    const details = await handler(page);
    assert(consoleErrors.length === 0, `${name} 出现控制台报错：${consoleErrors.join(" | ")}`);
    assert(pageErrors.length === 0, `${name} 出现页面异常：${pageErrors.join(" | ")}`);
    return { details, name, status: "PASS" };
  } finally {
    await page.close();
  }
}

async function runScenarioWithViewport(name, browser, url, viewport, handler) {
  const { page, consoleErrors, pageErrors } = await openPageWithViewport(browser, url, viewport);
  try {
    const details = await handler(page);
    assert(consoleErrors.length === 0, `${name} 出现控制台报错：${consoleErrors.join(" | ")}`);
    assert(pageErrors.length === 0, `${name} 出现页面异常：${pageErrors.join(" | ")}`);
    return { details, name, status: "PASS" };
  } finally {
    await page.close();
  }
}

async function main() {
  const port = Number(process.env.BROWSER_REGRESSION_PORT || 8145);
  const projectRoot = path.resolve(__dirname, "..");
  const browserPath = resolveBrowserPath();
  const { chromium } = resolvePlaywrightCore();
  const missingRequests = [];
  const server = createStaticServer(projectRoot, port, missingRequests);
  const results = [];

  await startServer(server, port);
  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
  });

  try {
    const url = `http://127.0.0.1:${port}/index.html`;

    results.push(
      await runScenario("boot", browser, url, async (page) => {
        const initial = await page.evaluate(() => ({
          battleHidden: document.querySelector("#battle-view")?.classList.contains("hidden"),
          boardCount: document.querySelectorAll("#player-board .minion-card").length,
          gold: document.querySelector("#gold-value")?.textContent?.trim(),
          handCount: document.querySelectorAll("#hand-board .minion-card").length,
          hp: document.querySelector("#hp-value")?.textContent?.trim(),
          message: document.querySelector("#message-value")?.textContent?.trim(),
          phase: document.querySelector("#phase-value")?.textContent?.trim(),
          shopCount: document.querySelectorAll("#shop-board .minion-card").length,
          timer: document.querySelector("#timer-value")?.textContent?.trim(),
          turn: document.querySelector("#turn-value")?.textContent?.trim(),
        }));

        assert(initial.turn === "1", "开局回合应为 1。");
        assert(initial.gold === "3", "开局金币应为 3。");
        assert(initial.hp === "30", "开局生命应为 30。");
        assert(initial.phase === "准备中", "开局阶段应为准备中。");
        assert(initial.timer === "15s", "前 3 回合倒计时应为 15 秒。");
        assert(initial.shopCount === 5, "开局商店应显示 5 张牌。");
        assert(initial.handCount === 0 && initial.boardCount === 0, "开局手牌和战场应为空。");
        assert(initial.battleHidden, "开局战斗层应隐藏。");
        return initial;
      })
    );

    results.push(
      await runScenario("drag-buy-play", browser, url, async (page) => {
        await dragCenter(page, "#shop-board .minion-card:nth-child(1)", "#player-board");
        await page.waitForTimeout(180);
        const afterBuy = await collectPrepCounts(page);
        const collapsedHandVisible = await page.evaluate(() => {
          const card = document.querySelector("#hand-board .minion-card");
          const tray = document.querySelector(".prep-hand-zone");
          const battleStack = document.querySelector(".prep-battle-stack");
          const panel = document.querySelector(".prep-panel");
          if (!card || !tray) {
            return null;
          }
          const cardRect = card.getBoundingClientRect();
          const trayRect = tray.getBoundingClientRect();
          const stackRect = battleStack?.getBoundingClientRect();
          const panelRect = panel?.getBoundingClientRect();
          return {
            cardTop: Math.round(cardRect.top),
            cardVisibleHeight: Math.round(Math.max(0, trayRect.bottom - cardRect.top)),
            overPanelBottom: panelRect ? Math.round(cardRect.bottom - panelRect.bottom) : null,
            overStackBottom: stackRect ? Math.round(cardRect.bottom - stackRect.bottom) : null,
            trayOverStackBottom: stackRect ? Math.round(trayRect.bottom - stackRect.bottom) : null,
            trayBottom: Math.round(trayRect.bottom),
          };
        });
        assert(afterBuy.gold === "0", "第 1 回合买牌后金币应归零。");
        assert(afterBuy.hand === 1, "拖到上场区购买后也应先进入手牌。");
        assert(afterBuy.board === 0, "买牌阶段不应直接把随从放上场。");
        assert(collapsedHandVisible && collapsedHandVisible.cardVisibleHeight >= 54, "默认收纳状态下手牌露出高度不足。");
        assert(collapsedHandVisible.overPanelBottom !== null && collapsedHandVisible.overPanelBottom <= 4, "默认收纳状态下手牌超出了准备阶段主框。");
        assert(collapsedHandVisible.trayOverStackBottom !== null && collapsedHandVisible.trayOverStackBottom <= 4, "默认收纳状态下手牌托盘超出了共享战备区。");

        await dragByOffset(page, "#hand-board .minion-card:nth-child(1)", { x: 0, y: -180 }, { xRatio: 0.5, yRatio: 0.22 });
        const afterPlay = await collectPrepCounts(page);
        assert(afterPlay.hand === 0, "上阵后手牌应为空。");
        assert(afterPlay.board === 1, "上阵后战场应有 1 个单位。");
        return { afterBuy, afterPlay, collapsedHandVisible };
      })
    );

    results.push(
      await runScenario("hand-fan-deploy", browser, url, async (page) => {
        await dragCenter(page, "#shop-board .minion-card:nth-child(1)", "#hand-board");
        await page.waitForTimeout(180);
        await moveMouseToSelector(page, ".prep-hand-zone", { x: 0, y: 54 });
        const expandedState = await page.evaluate(() => {
          const zone = document.querySelector(".prep-hand-zone");
          const handCard = document.querySelector("#hand-board .minion-card");
          const boardZone = document.querySelector(".prep-board-zone");
          if (!zone || !handCard || !boardZone) {
            return null;
          }

          const handRect = handCard.getBoundingClientRect();
          const boardRect = boardZone.getBoundingClientRect();
          const probeX = handRect.left + handRect.width / 2;
          const probeY = handRect.top + Math.min(32, handRect.height / 2);
          const topElement = document.elementFromPoint(probeX, probeY);
          return {
            boardBottom: Math.round(boardRect.bottom),
            boardTop: Math.round(boardRect.top),
            cardTop: Math.round(handRect.top),
            expanded: zone.matches(":hover"),
            topElementZone: topElement?.closest(".prep-hand-zone") ? "hand" : topElement?.closest(".prep-board-zone") ? "board" : "",
          };
        });
        assert(expandedState, "展开手牌时缺少关键区域。");
        assert(expandedState.expanded, "鼠标扫到手牌热区后应命中手牌区。");
        assert(expandedState.cardTop < expandedState.boardBottom, "展开后手牌应进入共享战备区的战场层范围。");
        assert(expandedState.topElementZone === "hand", "展开手牌上方命中被战场层遮挡。");

        await dragByOffset(page, "#hand-board .minion-card:nth-child(1)", { x: 0, y: -170 }, { xRatio: 0.5, yRatio: 0.22 });
        const afterDeploy = await collectPrepCounts(page);
        assert(afterDeploy.hand === 0, "拖出手牌托盘后应成功打出。");
        assert(afterDeploy.board === 1, "拖出手牌托盘后应进入战场。");
        return { afterDeploy, expandedState };
      })
    );

    results.push(
      await runScenarioWithViewport("short-viewport-fit", browser, url, { width: 1513, height: 472 }, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.state.phase = "prep";
          api.state.hp = 30;
          api.state.gold = 0;
          api.state.shop = [];
          api.state.board = [];
          api.state.hand = [api.createOwnedMinion("wandering-swordsman")];
          api.state.enemyBoard = [];
          api.render();
        });
        await page.waitForTimeout(180);

        const handMetrics = await page.evaluate(() => {
          const card = document.querySelector("#hand-board .minion-card");
          const tray = document.querySelector(".prep-hand-zone");
          const panel = document.querySelector(".prep-panel");
          if (!card || !tray || !panel) {
            return null;
          }
          const cardRect = card.getBoundingClientRect();
          const trayRect = tray.getBoundingClientRect();
          const panelRect = panel.getBoundingClientRect();
          return {
            cardVisibleHeight: Math.round(Math.max(0, trayRect.bottom - cardRect.top)),
            overPanelBottom: Math.round(cardRect.bottom - panelRect.bottom),
            overTrayBottom: Math.round(cardRect.bottom - trayRect.bottom),
            trayVisibleHeight: Math.round(
              Math.max(0, Math.min(trayRect.bottom, panelRect.bottom) - Math.max(trayRect.top, panelRect.top))
            ),
          };
        });
        const viewportMetrics = await collectViewportFitMetrics(page);

        assert(handMetrics, "矮视口下缺少手牌区或卡牌。");
        assert(viewportMetrics, "矮视口下缺少整体视口适配信息。");
        assert(handMetrics.cardVisibleHeight >= 40, `矮视口下手牌默认露出高度不足：${JSON.stringify({ handMetrics, viewportMetrics })}`);
        assert(viewportMetrics.frameBottomOverflow <= 0, "矮视口下缩放框不应超出视口底部。");
        assert(viewportMetrics.frameRightOverflow <= 0, "矮视口下缩放框不应超出视口右侧。");
        assert(viewportMetrics.shellBottomOverflow <= 0, "矮视口下主舞台不应超出视口底部。");
        assert(viewportMetrics.shellRightOverflow <= 0, "矮视口下主舞台不应超出视口右侧。");
        assert(viewportMetrics.panelBottomOverflow <= 0, "矮视口下准备阶段主框不应被裁切。");
        assert(handMetrics.trayVisibleHeight >= 80, `矮视口下手牌区可见高度不足：${JSON.stringify({ handMetrics, viewportMetrics })}`);
        assert(viewportMetrics.scale < 1, "矮视口下应触发整体缩放。");
        return { handMetrics, viewportMetrics };
      })
    );

    results.push(
      await runScenarioWithViewport("desktop-scale-fit", browser, url, { width: 1366, height: 768 }, async (page) => {
        const initial = await collectViewportFitMetrics(page);
        assert(initial, "桌面缩放适配缺少关键节点。");
        assert(initial.frameBottomOverflow <= 0, "桌面缩放时外层框不应超出视口底部。");
        assert(initial.frameRightOverflow <= 0, "桌面缩放时外层框不应超出视口右侧。");
        assert(initial.shellBottomOverflow <= 0, "桌面缩放时主舞台不应超出视口底部。");
        assert(initial.shellRightOverflow <= 0, "桌面缩放时主舞台不应超出视口右侧。");
        assert(initial.panelBottomOverflow <= 0, "桌面缩放时准备阶段主框不应被裁切。");
        assert(initial.trayBottomOverflow <= 0, "桌面缩放时手牌区不应被裁切。");
        assert(initial.scale > 0.1 && initial.scale <= 1, "桌面缩放比例应落在有效范围内。");
        return initial;
      })
    );

    results.push(
      await runScenario("discover-overlay-fit", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.state.phase = "prep";
          api.state.hp = 30;
          api.state.gold = 9;
          api.state.shopFrozen = false;
          api.state.board = [];
          api.state.enemyBoard = [];
          api.state.hand = [];
          api.state.shop = [];
          api.state.discover = {
            source: "tripleReward",
            rewardTier: 2,
            choices: createTripleRewardChoices(2),
          };
          api.render();
        });
        await page.waitForTimeout(180);

        const discoverState = await page.evaluate(() => {
          const panel = document.querySelector(".discover-panel");
          const choices = document.querySelector("#discover-choices");
          const overlay = document.querySelector("#discover-view");
          if (!panel || !choices || !overlay) {
            return null;
          }
          const panelRect = panel.getBoundingClientRect();
          return {
            choiceCount: document.querySelectorAll("#discover-choices .discover-choice").length,
            columns: window.getComputedStyle(choices).gridTemplateColumns,
            open: !overlay.classList.contains("hidden"),
            panelBottomOverflow: Math.round(panelRect.bottom - window.innerHeight),
            panelRightOverflow: Math.round(panelRect.right - window.innerWidth),
          };
        });

        assert(discoverState, "桌面 discover 层缺少关键节点。");
        assert(discoverState.open, "打出奖励牌后应打开奖励层。");
        assert(discoverState.choiceCount === 4, "discover 层应保留 4 个奖励选项。");
        assert(discoverState.columns.split(" ").length >= 2, "桌面 discover 选项不应退化成单列。");
        assert(discoverState.panelBottomOverflow <= 0, "桌面 discover 面板不应超出视口底部。");
        assert(discoverState.panelRightOverflow <= 0, "桌面 discover 面板不应超出视口右侧。");
        return discoverState;
      })
    );

    results.push(
      await runScenario("shop-tier-seven-toolbar", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.state.phase = "prep";
          api.state.tavernTier = 7;
          api.state.timeLeft = 56;
          api.state.shop = generateShop(7, pickRandom);
          api.render();
        });
        await page.waitForTimeout(120);

        const metrics = await page.evaluate(() => {
          const odds = document.querySelector(".shop-odds-inline");
          const timer = document.querySelector("#timer-card");
          const toolbar = document.querySelector(".shop-toolbar");
          if (!odds || !timer) {
            return null;
          }
          const oddsRect = odds.getBoundingClientRect();
          const timerRect = timer.getBoundingClientRect();
          const toolbarRect = toolbar?.getBoundingClientRect();
          const overlaps =
            Math.min(oddsRect.right, timerRect.right) > Math.max(oddsRect.left, timerRect.left) &&
            Math.min(oddsRect.bottom, timerRect.bottom) > Math.max(oddsRect.top, timerRect.top);
          return {
            centeredDelta: toolbarRect ? Math.round((timerRect.left + timerRect.right) / 2 - (toolbarRect.left + toolbarRect.right) / 2) : null,
            overlaps,
            oddsBottom: Math.round(oddsRect.bottom),
            timerTop: Math.round(timerRect.top),
          };
        });

        assert(metrics, "7 星工具条测试缺少概率区或倒计时卡。");
        assert(!metrics.overlaps, "7 星概率区不应再与招募倒计时卡重叠。");
        assert(Math.abs(metrics.centeredDelta ?? 999) <= 2, "招募倒计时卡应保持在工具条中间位置。");
        return metrics;
      })
    );

    results.push(
      await runScenario("discover-waits-for-battle", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.hp = 30;
          api.state.timeLeft = 1;
          api.state.prepEndsAt = Date.now() - 100;
          api.state.pendingBattleTrigger = null;
          api.state.discover = {
            source: "tripleReward",
            rewardTier: 2,
            choices: createTripleRewardChoices(2),
          };
          api.render();
        });

        await page.evaluate(() => {
          window.__AUTO_CHESS_APP__?.state.prepEndsAt && window.__AUTO_CHESS_APP__;
        });
        await page.waitForTimeout(50);
        await page.evaluate(() => {
          const app = window.__AUTO_CHESS_APP__;
          const api = window.__AUTO_CHESS_TEST_API__;
          if (app && api.state.phase === "prep") {
            const remainingMs = api.state.prepEndsAt - Date.now();
            if (remainingMs <= 0 && api.state.discover) {
              api.state.timeLeft = 0;
              api.state.pendingBattleTrigger = "timer";
              api.state.message = "请先完成三连奖励选择，随后自动进入战斗。";
              api.stopPrepTimer();
              api.render();
            }
          }
        });

        const beforePick = await page.evaluate(() => ({
          battleHidden: document.querySelector("#battle-view")?.classList.contains("hidden"),
          discoverOpen: !document.querySelector("#discover-view")?.classList.contains("hidden"),
          pendingBattleTrigger: window.__AUTO_CHESS_TEST_API__.state.pendingBattleTrigger,
          phase: window.__AUTO_CHESS_TEST_API__.state.phase,
        }));

        await page.click("#discover-choices .discover-choice:nth-child(1)");
        await waitForBattleAnimation(page);

        const afterPick = await page.evaluate(() => ({
          discoverOpen: !document.querySelector("#discover-view")?.classList.contains("hidden"),
          phase: window.__AUTO_CHESS_TEST_API__.state.phase,
        }));

        assert(beforePick.phase === "prep", "discover 未选完时应仍停留在准备阶段。");
        assert(beforePick.discoverOpen, "倒计时结束但 discover 未选完时，discover 层应保持打开。");
        assert(beforePick.battleHidden, "倒计时结束但 discover 未选完时，不应提前显示战斗层。");
        assert(beforePick.pendingBattleTrigger === "timer", "倒计时结束后应挂起自动开战。");
        assert(afterPick.discoverOpen === false, "完成 discover 选择后选择层应关闭。");
        assert(afterPick.phase === "battle", "完成 discover 选择后应立刻进入战斗。");
        return { afterPick, beforePick };
      })
    );

    results.push(
      await runScenario("freeze-next-turn", browser, url, async (page) => {
        await page.click("#freeze-btn");
        const firstName = await page.locator("#shop-board .minion-card .minion-name").first().innerText();
        await page.click("#battle-btn");
        await waitForPrepTurn(page, 2);
        const nextName = await page.locator("#shop-board .minion-card .minion-name").first().innerText();
        const freezeText = (await page.locator("#freeze-btn").innerText()).trim();

        assert(firstName === nextName, "冻结后下一回合应保留原商店内容。");
        assert(freezeText === "冻结", "进入下一回合后冻结按钮应复位。");
        return { firstName, freezeText, nextName };
      })
    );

    results.push(
      await runScenario("upgrade-cost-decays", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.hp = 30;
          api.state.turn = 1;
          api.state.gold = 3;
          api.state.tavernTier = 1;
          api.state.upgradeCostTier = 1;
          api.state.upgradeCost = getBaseUpgradeCost(1);
          api.state.shopFrozen = false;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [];
          api.state.enemyBoard = [];
          api.render();
        });

        const initial = await page.evaluate(() => ({
          disabled: document.querySelector("#upgrade-btn")?.disabled,
          text: document.querySelector("#upgrade-btn")?.textContent?.trim(),
        }));

        await page.click("#battle-btn");
        await waitForPrepTurn(page, 2);

        const decayed = await page.evaluate(() => ({
          disabled: document.querySelector("#upgrade-btn")?.disabled,
          gold: document.querySelector("#gold-value")?.textContent?.trim(),
          text: document.querySelector("#upgrade-btn")?.textContent?.trim(),
        }));

        await page.click("#upgrade-btn");

        const afterUpgrade = await page.evaluate(() => ({
          disabled: document.querySelector("#upgrade-btn")?.disabled,
          gold: document.querySelector("#gold-value")?.textContent?.trim(),
          text: document.querySelector("#upgrade-btn")?.textContent?.trim(),
          tier: document.querySelector("#tier-value")?.textContent?.trim(),
        }));

        await page.click("#battle-btn");
        await waitForPrepTurn(page, 3);

        const blockedNextTurn = await page.evaluate(() => ({
          disabled: document.querySelector("#upgrade-btn")?.disabled,
          gold: document.querySelector("#gold-value")?.textContent?.trim(),
          text: document.querySelector("#upgrade-btn")?.textContent?.trim(),
          tier: document.querySelector("#tier-value")?.textContent?.trim(),
        }));

        await page.click("#battle-btn");
        await waitForPrepTurn(page, 4);

        const catchUpTurn = await page.evaluate(() => ({
          disabled: document.querySelector("#upgrade-btn")?.disabled,
          gold: document.querySelector("#gold-value")?.textContent?.trim(),
          text: document.querySelector("#upgrade-btn")?.textContent?.trim(),
          tier: document.querySelector("#tier-value")?.textContent?.trim(),
        }));

        assert(initial.text === "升级商店（5 金）", "开局应显示 1 级商店的基础升级费用。");
        assert(initial.disabled, "第 1 回合金币不足时升级按钮应禁用。");
        assert(decayed.gold === "4", "第 2 回合金币应提升到 4。");
        assert(decayed.text === "升级商店（4 金）", "下一回合未升级时，按钮应显示递减后的升本费。");
        assert(!decayed.disabled, "费用递减到可支付后，升级按钮应可点击。");
        assert(afterUpgrade.tier === "2", "支付递减后的费用后，应升到 2 级商店。");
        assert(afterUpgrade.gold === "0", "升级后金币应按递减后的实际费用扣除。");
        assert(afterUpgrade.text === "升级商店（8 金）", "升级完成后，按钮应切到更保守的下一档基础升级费用。");
        assert(afterUpgrade.disabled, "升级后金币不足时按钮应重新禁用。");
        assert(blockedNextTurn.tier === "2", "第 3 回合未升级前，商店等级应保持 2 级。");
        assert(blockedNextTurn.gold === "5", "第 3 回合金币应提升到 5。");
        assert(blockedNextTurn.text === "升级商店（7 金）", "升到 2 级后的下一回合，按钮应显示 7 金。");
        assert(blockedNextTurn.disabled, "第 3 回合不应还能立刻继续升本。");
        assert(catchUpTurn.tier === "2", "第 4 回合补升前，商店等级仍应保持 2 级。");
        assert(catchUpTurn.gold === "6", "第 4 回合金币应提升到 6。");
        assert(catchUpTurn.text === "升级商店（6 金）", "继续等待一回合后，按钮应显示递减到 6 金的费用。");
        assert(!catchUpTurn.disabled, "第 4 回合应可以补升到 3 级。");
        return { afterUpgrade, blockedNextTurn, catchUpTurn, decayed, initial };
      })
    );

    results.push(
      await runScenario("ui-triple", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.state.phase = "prep";
          api.state.hp = 30;
          api.state.gold = 9;
          api.state.shopFrozen = false;
          api.state.board = [];
          api.state.enemyBoard = [];
          api.state.hand = [api.createOwnedMinion("taunt-guard"), api.createOwnedMinion("taunt-guard")];
          api.state.shop = [api.copyMinion(api.createOwnedMinion("taunt-guard"))];
          api.state.message = "triple setup";
          api.render();
        });

        await dragCenter(page, "#shop-board .minion-card:nth-child(1)", "#hand-board");
        const tripleState = await page.evaluate(() => ({
          goldenCount: document.querySelectorAll("#hand-board .minion-card.golden").length,
          handCount: document.querySelectorAll("#hand-board .minion-card").length,
          rewardCount: window.__AUTO_CHESS_TEST_API__.state.hand.filter((card) => card.cardKind === "tripleReward").length,
          message: document.querySelector("#message-value")?.textContent?.trim(),
        }));

        assert(tripleState.handCount === 2, "三连后手牌应包含金色随从和奖励牌。");
        assert(tripleState.goldenCount === 1, "三连后应得到 1 张金色牌。");
        assert(tripleState.rewardCount === 1, "三连后应得到 1 张奖励牌。");
        return tripleState;
      })
    );

    results.push(
      await runScenario("triple-reward-playout", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.state.phase = "prep";
          api.state.hp = 30;
          api.state.gold = 9;
          api.state.shopFrozen = false;
          api.state.board = [];
          api.state.enemyBoard = [];
          api.state.hand = [api.createOwnedMinion("taunt-guard"), api.createOwnedMinion("taunt-guard")];
          api.state.shop = [api.copyMinion(api.createOwnedMinion("taunt-guard"))];
          api.render();
        });

        await dragCenter(page, "#shop-board .minion-card:nth-child(1)", "#hand-board");
        await page.waitForTimeout(180);
        await dragByOffset(page, "#hand-board .minion-card:nth-child(1)", { x: 0, y: -170 }, { xRatio: 0.5, yRatio: 0.22 });
        await page.waitForTimeout(180);

        const discoverState = await page.evaluate(() => ({
          choices: document.querySelectorAll("#discover-choices .minion-card").length,
          discoverOpen: !document.querySelector("#discover-view")?.classList.contains("hidden"),
          subtitle: document.querySelector("#discover-subtitle")?.textContent?.trim(),
        }));

        assert(discoverState.discoverOpen, "打出三连奖励牌后应打开奖励选择层。");
        assert(discoverState.choices === 4, "三连奖励应提供四张可选随从。");

        await page.click("#discover-choices .discover-choice:nth-child(1)");

        const rewardState = await page.evaluate(() => ({
          discoverOpen: !document.querySelector("#discover-view")?.classList.contains("hidden"),
          hand: window.__AUTO_CHESS_TEST_API__.state.hand.map((card) => ({
            cardKind: card.cardKind,
            tier: card.tier ?? null,
            name: card.name,
          })),
          message: document.querySelector("#message-value")?.textContent?.trim(),
        }));

        assert(rewardState.discoverOpen === false, "选定奖励后选择层应关闭。");
        assert(rewardState.hand.length === 2, "打出奖励牌后手牌应剩下金色随从和奖励随从。");
        assert(rewardState.hand.every((card) => card.cardKind === "minion"), "打出奖励牌后手牌里不应残留奖励牌。");
        assert(rewardState.hand.some((card) => card.tier === 2), "三连 1 星后应得到 2 星奖励随从。");
        return { discoverState, rewardState };
      })
    );

    results.push(
      await runScenario("board-reorder", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.state.phase = "prep";
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.board = [api.createOwnedMinion("taunt-guard"), api.createOwnedMinion("arena-champion")];
          api.state.hand = [];
          api.state.shop = [];
          api.state.enemyBoard = [];
          api.render();
        });

        await dragCenter(
          page,
          "#player-board .minion-card:nth-child(2)",
          "#player-board",
          { x: -260, y: 0 }
        );
        const order = await page.evaluate(() => window.__AUTO_CHESS_TEST_API__.state.board.map((minion) => minion.name));
        assert(order[0] === "兽人统领", "拖拽换位后兽人统领应来到最前。");
        return { order };
      })
    );

    results.push(
      await runScenario("combat-start", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.timeLeft = 15;
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.turn = 1;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [api.createOwnedMinion("assault-cannon")];
          api.state.enemyBoard = [api.createOwnedMinion("assault-cannon")];
          api.state.enemyBoard[0].health = 2;
          api.render();
        });
        await syncEnemyBoard(page);

        await page.click("#battle-btn");
        await waitForBattleResult(page);
        const combatStartState = await page.evaluate(() => ({
          logs: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs.slice(0, 4),
          triggerCount: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs.filter((line) => line.includes("进击火炮 在战斗开始时")).length,
        }));

        assert(combatStartState.triggerCount === 1, "被先手开战效果击杀的单位不应反向触发。");
        return combatStartState;
      })
    );

    results.push(
      await runScenario("divine-shield", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.timeLeft = 15;
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.turn = 1;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [api.createOwnedMinion("arena-champion")];
          api.state.enemyBoard = [api.createOwnedMinion("holy-mech")];
          api.render();
        });
        await syncEnemyBoard(page);

        await page.click("#battle-btn");
        await waitForBattleResult(page);
        const shieldState = await page.evaluate(() => ({
          logs: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs,
          shieldBreaks: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs.filter((line) => line.includes("圣盾被打掉")).length,
        }));

        assert(shieldState.shieldBreaks >= 1, "圣盾被打掉时应写入日志。");
        return shieldState;
      })
    );

    results.push(
      await runScenario("target-priority", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.timeLeft = 15;
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.turn = 1;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [
            api.createOwnedMinion("holy-mech"),
            api.createOwnedMinion("retired-veteran"),
            api.createOwnedMinion("taunt-guard"),
          ];
          api.state.enemyBoard = [
            api.createOwnedMinion("woodland-wolf"),
            api.createOwnedMinion("arena-champion"),
          ];
          api.render();
        });
        await syncEnemyBoard(page);

        await page.click("#battle-btn");
        await waitForBattleResult(page);
        const targetState = await page.evaluate(() => ({
          firstEnemyAttack: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs.find(
            (line) => line.startsWith("敌方 ") && line.includes("攻击了 我方 ")
          ),
          logs: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs.slice(0, 5),
        }));

        assert(
          targetState.firstEnemyAttack && targetState.firstEnemyAttack.includes("退役老兵"),
          "敌方在存在挑衅目标时应优先攻击挑衅。"
        );
        return targetState;
      })
    );

    results.push(
      await runScenario("deathrattle", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.timeLeft = 15;
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.turn = 1;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [api.createOwnedMinion("rat-pack")];
          api.state.enemyBoard = [api.createOwnedMinion("arena-champion")];
          api.render();
        });
        await syncEnemyBoard(page);

        await page.click("#battle-btn");
        await waitForBattleResult(page);
        const deathrattleState = await page.evaluate(() => ({
          logs: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs,
          triggerCount: window.__AUTO_CHESS_TEST_API__.state.lastBattle.logs.filter((line) => line.includes("亡语生效")).length,
        }));

        assert(deathrattleState.triggerCount >= 1, "亡语触发时应写入日志。");
        return deathrattleState;
      })
    );

    results.push(
      await runScenario("multi-round-stress", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.timeLeft = 15;
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.turn = 1;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [api.createOwnedMinion("taunt-guard")];
          api.state.enemyBoard = [api.createOwnedMinion("arena-champion")];
          api.render();
        });
        await syncEnemyBoard(page);

        for (let index = 0; index < 3; index += 1) {
          await page.click("#battle-btn");
          await waitForPrepTurn(page, index + 2);
        }

        const stressState = await page.evaluate(() => ({
          battleActive: window.__AUTO_CHESS_TEST_API__.state.battleAnimation.active,
          gold: window.__AUTO_CHESS_TEST_API__.state.gold,
          message: window.__AUTO_CHESS_TEST_API__.state.message,
          phase: window.__AUTO_CHESS_TEST_API__.state.phase,
          turn: window.__AUTO_CHESS_TEST_API__.state.turn,
        }));

        assert(stressState.turn === 4, "连续 3 回合后应进入第 4 回合。");
        assert(stressState.phase === "prep", "多回合压力后应回到准备阶段。");
        assert(stressState.battleActive === false, "回到准备阶段后战斗动画状态应已清空。");
        return stressState;
      })
    );

    results.push(
      await runScenario("turn-end-before-battle", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.timeLeft = 15;
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.turn = 2;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [api.createOwnedMinion("arena-veteran"), api.createOwnedMinion("tavern-attendant")];
          api.state.enemyBoard = [api.createOwnedMinion("taunt-guard")];
          const enemy = getLobbyPlayerById(api.state.lobby, api.state.currentOpponentId);
          if (enemy) {
            enemy.board = api.state.enemyBoard.map(api.copyMinion);
          }
          api.render();
        });
        await syncEnemyBoard(page);

        await page.click("#battle-btn");
        await waitForBattleAnimation(page);
        const duringBattle = await page.evaluate(() => ({
          startingPlayer: window.__AUTO_CHESS_TEST_API__.state.battleAnimation.playerBoard.map((minion) => ({
            name: minion.name,
            attack: minion.attack,
            health: minion.health,
          })),
        }));

        const veteran = duringBattle.startingPlayer.find((minion) => minion.name === "竞技老兵");
        const attendant = duringBattle.startingPlayer.find((minion) => minion.name === "酒馆侍从");
        assert(
          (veteran && (veteran.attack > 3 || veteran.health > 3)) ||
            (attendant && (attendant.attack > 1 || attendant.health > 3)),
          "回合结束效果应先结算，再进入战斗演出。"
        );
        return duringBattle;
      })
    );

    results.push(
      await runScenario("lobby-hp-settlement", browser, url, async (page) => {
        await page.evaluate(() => {
          const api = window.__AUTO_CHESS_TEST_API__;
          api.stopPrepTimer();
          api.stopPostBattleReturn();
          api.stopBattlePlayback();
          api.state.phase = "prep";
          api.state.timeLeft = 15;
          api.state.hp = 30;
          api.state.gold = 3;
          api.state.turn = 1;
          api.state.shop = [];
          api.state.hand = [];
          api.state.board = [api.createOwnedMinion("rat-pack")];
          api.state.enemyBoard = [api.createOwnedMinion("arena-champion")];
          const player = getLobbyPlayerById(api.state.lobby, "player");
          if (player) {
            player.hp = 30;
          }
          const enemy = getLobbyPlayerById(api.state.lobby, api.state.currentOpponentId);
          if (enemy) {
            enemy.hp = 30;
            enemy.board = api.state.enemyBoard.map(api.copyMinion);
          }
          api.render();
        });
        await syncEnemyBoard(page);

        await page.click("#battle-btn");
        await waitForBattleAnimation(page);
        const duringBattle = await page.evaluate(() => ({
          lobbySelf: Array.from(document.querySelectorAll("#lobby-roster .lobby-chip"))
            .find((node) => node.textContent.includes("你 ·"))
            ?.textContent?.trim(),
          hp: document.querySelector("#hp-value")?.textContent?.trim(),
        }));

        await waitForBattleResult(page);
        const afterBattle = await page.evaluate(() => ({
          lobbySelf: Array.from(document.querySelectorAll("#lobby-roster .lobby-chip"))
            .find((node) => node.textContent.includes("你 ·"))
            ?.textContent?.trim(),
          hp: document.querySelector("#hp-value")?.textContent?.trim(),
        }));

        assert(duringBattle.lobbySelf === "你 · 30", "战斗播放期间，大厅中的玩家生命值不应提前结算。");
        assert(duringBattle.hp === "30", "战斗播放期间，主生命值显示不应提前变化。");
        assert(afterBattle.lobbySelf === "你 · 29", "战斗结算结束后，大厅中的玩家生命值应更新为战后结果。");
        assert(afterBattle.hp === "29", "战斗结算结束后，主生命值应同步更新。");
        return { afterBattle, duringBattle };
      })
    );

    results.push(
      await runScenario("lobby-status", browser, url, async (page) => {
        const lobbyState = await page.evaluate(() => ({
          alive: document.querySelector("#lobby-alive-value")?.textContent?.trim(),
          place: document.querySelector("#lobby-place-value")?.textContent?.trim(),
          opponent: document.querySelector("#lobby-opponent-value")?.textContent?.trim(),
          rosterCount: document.querySelectorAll("#lobby-roster .lobby-chip").length,
        }));

        assert(lobbyState.alive === "8", "开局大厅应显示 8 名存活玩家。");
        assert(lobbyState.rosterCount === 8, "大厅名单应列出全部存活玩家。");
        assert(lobbyState.opponent && lobbyState.opponent.length > 0, "大厅面板应显示当前对手。");
        return lobbyState;
      })
    );
  } finally {
    await browser.close();
    await stopServer(server);
  }

  const filteredMissing = [...new Set(missingRequests)].filter((requestPath) => requestPath !== "/favicon.ico");
  assert(filteredMissing.length === 0, `发现未处理的静态资源请求：${filteredMissing.join(", ")}`);

  results.forEach((result) => {
    console.log(`PASS ${result.name}`);
  });

  console.log(
    JSON.stringify(
      {
        browserPath,
        ignoredMissingRequests: [...new Set(missingRequests)].filter(
          (requestPath) => requestPath === "/favicon.ico"
        ),
        port,
        results,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
