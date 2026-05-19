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

async function prepareLayoutCard(page) {
  await page.evaluate(() => {
    const api = window.__AUTO_CHESS_TEST_API__;
    api.stopPrepTimer();
    api.stopPostBattleReturn();
    api.stopBattlePlayback();
    api.cleanupDragState();
    api.state.phase = "prep";
    api.state.turn = 1;
    api.state.timeLeft = 15;
    api.state.hp = 30;
    api.state.gold = 3;
    api.state.shopFrozen = false;
    api.state.hand = [];
    api.state.board = [];
    api.state.enemyBoard = [];
    api.state.shop = [api.createOwnedMinion("holy-mech")];
    api.state.message = "layout regression";
    api.render();
  });
}

function roundBox(box) {
  return {
    height: Number(box.height.toFixed(2)),
    width: Number(box.width.toFixed(2)),
    x: Number(box.x.toFixed(2)),
    y: Number(box.y.toFixed(2)),
  };
}

async function main() {
  const port = Number(process.env.VISUAL_LAYOUT_PORT || 8146);
  const projectRoot = path.resolve(__dirname, "..");
  const browserPath = resolveBrowserPath();
  const { chromium } = resolvePlaywrightCore();
  const screenshotDir = path.join(projectRoot, "artifacts");
  const screenshotPath = path.join(screenshotDir, "visual-layout-card.png");
  const missingRequests = [];
  const server = createStaticServer(projectRoot, port, missingRequests);

  await fsp.mkdir(screenshotDir, { recursive: true });
  await startServer(server, port);

  const browser = await chromium.launch({
    executablePath: browserPath,
    headless: true,
  });

  try {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 900 },
    });
    await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: "load" });
    await prepareLayoutCard(page);

    const card = page.locator("#shop-board .minion-card").nth(0);
    const meta = card.locator(".minion-meta");
    const stats = card.locator(".stats-row");
    const attack = card.locator(".stat-pill.attack");
    const health = card.locator(".stat-pill.health");

    const cardBox = await card.boundingBox();
    const metaBox = await meta.boundingBox();
    const statsBox = await stats.boundingBox();
    const attackBox = await attack.boundingBox();
    const healthBox = await health.boundingBox();

    assert(cardBox, "布局校验缺少卡片容器。");
    assert(metaBox, "布局校验缺少种族文本。");
    assert(statsBox, "布局校验缺少属性区。");
    assert(attackBox, "布局校验缺少攻击属性。");
    assert(healthBox, "布局校验缺少生命属性。");

    const cardBottom = cardBox.y + cardBox.height;
    const cardCenterX = cardBox.x + cardBox.width / 2;
    const metaBottom = metaBox.y + metaBox.height;
    const metaCenterX = metaBox.x + metaBox.width / 2;
    const statsBottom = statsBox.y + statsBox.height;
    const attackCenterX = attackBox.x + attackBox.width / 2;
    const healthCenterX = healthBox.x + healthBox.width / 2;

    const metrics = {
      cardBox: roundBox(cardBox),
      metaBox: roundBox(metaBox),
      statsBox: roundBox(statsBox),
      attackBox: roundBox(attackBox),
      healthBox: roundBox(healthBox),
      gapMetaToStats: Number((statsBox.y - metaBottom).toFixed(2)),
      gapMetaToCardBottom: Number((cardBottom - metaBottom).toFixed(2)),
      gapStatsToCardBottom: Number((cardBottom - statsBottom).toFixed(2)),
      metaCenterOffsetX: Number((metaCenterX - cardCenterX).toFixed(2)),
      attackInsetFromLeft: Number((attackBox.x - cardBox.x).toFixed(2)),
      healthInsetFromRight: Number((cardBox.x + cardBox.width - (healthBox.x + healthBox.width)).toFixed(2)),
      screenshotPath,
    };

    assert(Math.abs(metrics.metaCenterOffsetX) <= 2, "种族文字没有水平居中。");
    assert(metrics.gapMetaToStats >= 0 && metrics.gapMetaToStats <= 6, "种族和属性值之间的垂直距离超出预期。");
    assert(metrics.gapMetaToCardBottom >= 26 && metrics.gapMetaToCardBottom <= 40, "种族距离卡片下边线的空间超出预期。");
    assert(metrics.gapStatsToCardBottom >= 10 && metrics.gapStatsToCardBottom <= 20, "属性值距离卡片下边线的空间超出预期。");
    assert(attackCenterX < cardCenterX - 18, "攻击值没有落在卡片左下区域。");
    assert(healthCenterX > cardCenterX + 18, "生命值没有落在卡片右下区域。");
    assert(Math.abs(metrics.attackInsetFromLeft - metrics.healthInsetFromRight) <= 2, "左右属性值没有保持近似对称。");

    await card.screenshot({ path: screenshotPath });

    const filteredMissing = [...new Set(missingRequests)].filter((requestPath) => requestPath !== "/favicon.ico");
    assert(filteredMissing.length === 0, `发现未处理的静态资源请求：${filteredMissing.join(", ")}`);

    console.log("PASS visual-layout");
    console.log(
      JSON.stringify(
        {
          browserPath,
          ignoredMissingRequests: [...new Set(missingRequests)].filter(
            (requestPath) => requestPath === "/favicon.ico"
          ),
          metrics,
          port,
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
    await stopServer(server);
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
