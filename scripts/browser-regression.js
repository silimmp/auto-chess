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

async function dragByOffset(page, sourceSelector, offset) {
  const source = await page.locator(sourceSelector).boundingBox();
  assert(source, `缺少拖拽来源：${sourceSelector}`);

  const startX = source.x + source.width / 2;
  const startY = source.y + source.height / 2;
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
        await dragCenter(page, "#shop-board .minion-card:nth-child(1)", "#hand-board");
        const afterBuy = await collectPrepCounts(page);
        assert(afterBuy.gold === "0", "第 1 回合买牌后金币应归零。");
        assert(afterBuy.hand === 1, "拖拽购买后应进入手牌。");

        await dragCenter(page, "#hand-board .minion-card:nth-child(1)", "#player-board");
        const afterPlay = await collectPrepCounts(page);
        assert(afterPlay.hand === 0, "上阵后手牌应为空。");
        assert(afterPlay.board === 1, "上阵后战场应有 1 个单位。");
        return { afterBuy, afterPlay };
      })
    );

    results.push(
      await runScenario("hand-fan-deploy", browser, url, async (page) => {
        await dragCenter(page, "#shop-board .minion-card:nth-child(1)", "#hand-board");
        await moveMouseToSelector(page, ".prep-hand-zone", { x: 0, y: 54 });
        const expanded = await page.locator(".prep-hand-zone").evaluate((element) => element.matches(":hover"));
        assert(expanded, "鼠标扫到手牌热区后应命中手牌区。");

        await dragByOffset(page, "#hand-board .minion-card:nth-child(1)", { x: 0, y: -170 });
        const afterDeploy = await collectPrepCounts(page);
        assert(afterDeploy.hand === 0, "拖出手牌托盘后应成功打出。");
        assert(afterDeploy.board === 1, "拖出手牌托盘后应进入战场。");
        return { afterDeploy, expanded };
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
          message: document.querySelector("#message-value")?.textContent?.trim(),
        }));

        assert(tripleState.handCount === 1, "三连后手牌应只剩 1 张牌。");
        assert(tripleState.goldenCount === 1, "三连后应得到 1 张金色牌。");
        return tripleState;
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
