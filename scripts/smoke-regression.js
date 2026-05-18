"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

class FakeClassList {
  constructor() {
    this.names = new Set();
  }

  add(...names) {
    names.forEach((name) => this.names.add(name));
  }

  remove(...names) {
    names.forEach((name) => this.names.delete(name));
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.names.has(name)) {
        this.names.delete(name);
        return false;
      }
      this.names.add(name);
      return true;
    }

    if (force) {
      this.names.add(name);
    } else {
      this.names.delete(name);
    }
    return force;
  }

  contains(name) {
    return this.names.has(name);
  }
}

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.style = {};
    this.classList = new FakeClassList();
    this.textContent = "";
    this.innerHTML = "";
    this.disabled = false;
    this.prepZone = null;
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  addEventListener() {}

  removeEventListener() {}

  closest(selector) {
    if (selector === ".prep-zone") {
      return this.prepZone;
    }
    if (selector === "button") {
      return null;
    }
    return null;
  }

  querySelectorAll() {
    return [];
  }

  getBoundingClientRect() {
    return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 };
  }

  setPointerCapture() {}

  releasePointerCapture() {}

  cloneNode() {
    return new FakeElement(this.tagName);
  }

  remove() {}
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeElements() {
  const create = () => new FakeElement("div");
  const elements = {
    "#turn-value": create(),
    "#gold-value": create(),
    "#hp-value": create(),
    "#tier-value": create(),
    "#phase-value": create(),
    "#timer-value": create(),
    "#timer-card": create(),
    "#message-value": create(),
    "#shop-board": create(),
    "#hand-board": create(),
    "#player-board": create(),
    ".prep-panel": create(),
    "#battle-view": create(),
    "#battle-enemy-board": create(),
    "#battle-player-board": create(),
    "#refresh-btn": create(),
    "#upgrade-btn": create(),
    "#freeze-btn": create(),
    "#battle-btn": create(),
    "#reset-btn": create(),
  };

  ["#shop-board", "#hand-board", "#player-board"].forEach((selector) => {
    elements[selector].prepZone = create();
  });

  return elements;
}

function createHarness(projectRoot) {
  const elements = makeElements();
  const document = {
    querySelector(selector) {
      return elements[selector] || null;
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    body: new FakeElement("body"),
  };

  const timers = new Map();
  let nextTimerId = 1;
  const windowObject = {
    document,
    console,
    Math,
    Date,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Promise,
    Set,
    Map,
    addEventListener() {},
    setInterval(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay, repeat: true });
      return id;
    },
    clearInterval(id) {
      timers.delete(id);
    },
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay, repeat: false });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
  };
  windowObject.window = windowObject;

  const context = vm.createContext(windowObject);
  const html = fs.readFileSync(path.join(projectRoot, "index.html"), "utf8");
  const scriptPaths = [...html.matchAll(/<script\s+src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert(scriptPaths.length > 0, "index.html 没有找到脚本标签。");

  for (const relativePath of scriptPaths) {
    const normalizedPath = relativePath.replace(/^\.\//, "").replaceAll("/", path.sep);
    const code = fs.readFileSync(path.join(projectRoot, normalizedPath), "utf8");
    vm.runInContext(code, context, { filename: normalizedPath });
  }

  return {
    context,
    run(expression) {
      return vm.runInContext(expression, context);
    },
  };
}

function testBoot(projectRoot) {
  const harness = createHarness(projectRoot);
  const summary = harness.run("({ turn: window.__AUTO_CHESS_TEST_API__.state.turn, gold: window.__AUTO_CHESS_TEST_API__.state.gold, phase: window.__AUTO_CHESS_TEST_API__.state.phase, shopLen: window.__AUTO_CHESS_TEST_API__.state.shop.length, enemyLen: window.__AUTO_CHESS_TEST_API__.state.enemyBoard.length, message: window.__AUTO_CHESS_TEST_API__.state.message })");
  assert(summary.turn === 1, "初始回合应为 1。");
  assert(summary.gold === 3, "初始金币应为 3。");
  assert(summary.phase === "prep", "开局应处于准备阶段。");
  assert(summary.shopLen === 5, "开局商店应生成 5 张牌。");
  assert(summary.enemyLen >= 1, "开局应生成敌方阵容。");
  assert(summary.message.includes("第 1 回合"), "开局提示文案异常。");
}

function testBuyPlayAndFreeze(projectRoot) {
  const harness = createHarness(projectRoot);
  const firstShopId = harness.run("window.__AUTO_CHESS_TEST_API__.state.shop[0].id");
  harness.run("toggleFreezeShopState(window.__AUTO_CHESS_TEST_API__.state)");
  harness.run("startNextTurnState(window.__AUTO_CHESS_TEST_API__.state, (tier) => generateShop(tier, pickRandom), (shop, tier) => refillShop(shop, tier, pickRandom), (turn) => generateEnemyBoard(turn, pickRandom, randomInt))");
  const frozenState = harness.run("({ turn: window.__AUTO_CHESS_TEST_API__.state.turn, shopLen: window.__AUTO_CHESS_TEST_API__.state.shop.length, frozen: window.__AUTO_CHESS_TEST_API__.state.shopFrozen, firstId: window.__AUTO_CHESS_TEST_API__.state.shop[0].id })");
  assert(frozenState.turn === 2, "下一回合未正常开始。");
  assert(frozenState.shopLen === 5, "冻结后商店补货数量异常。");
  assert(frozenState.frozen === false, "进入下一回合后冻结状态应被清空。");
  assert(frozenState.firstId === firstShopId, "冻结商店后原有卡牌未保留。");

  harness.run("buyMinionState(window.__AUTO_CHESS_TEST_API__.state, 0)");
  const afterBuy = harness.run("({ gold: window.__AUTO_CHESS_TEST_API__.state.gold, handLen: window.__AUTO_CHESS_TEST_API__.state.hand.length, shopLen: window.__AUTO_CHESS_TEST_API__.state.shop.length })");
  assert(afterBuy.gold === 1, "第二回合买牌后金币应为 1。");
  assert(afterBuy.handLen === 1, "买牌后手牌数量异常。");
  assert(afterBuy.shopLen === 4, "买牌后商店数量异常。");

  harness.run("playMinionState(window.__AUTO_CHESS_TEST_API__.state, 0, 0)");
  const afterPlay = harness.run("({ handLen: window.__AUTO_CHESS_TEST_API__.state.hand.length, boardLen: window.__AUTO_CHESS_TEST_API__.state.board.length })");
  assert(afterPlay.handLen === 0, "上阵后手牌未减少。");
  assert(afterPlay.boardLen === 1, "上阵后战场数量异常。");
}

function testMultipleTriples(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    window.__AUTO_CHESS_TEST_API__.state.hand = [];
    window.__AUTO_CHESS_TEST_API__.state.board = [];
    for (let i = 0; i < 6; i += 1) {
      window.__AUTO_CHESS_TEST_API__.state.hand.push(createOwnedMinion("taunt-guard"));
    }
    resolveTriples(window.__AUTO_CHESS_TEST_API__.state);
  `);
  const summary = harness.run("({ handLen: window.__AUTO_CHESS_TEST_API__.state.hand.length, boardLen: window.__AUTO_CHESS_TEST_API__.state.board.length, goldenCount: window.__AUTO_CHESS_TEST_API__.state.hand.filter((minion) => minion.golden).length })");
  assert(summary.handLen === 2, "六张同名随从应合成两张金色。");
  assert(summary.boardLen === 0, "该用例不应影响战场。");
  assert(summary.goldenCount === 2, "连续三连未全部结算。");
}

function testCombatStartDeadMinion(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const playerCannon = createOwnedMinion("assault-cannon");
    const enemyCannon = createOwnedMinion("assault-cannon");
    enemyCannon.health = 2;
    const result = simulateBattle([playerCannon], [enemyCannon]);
    globalThis.__combatStartResult = {
      enemyTriggeredByName: result.logs.filter((line) => line.includes("进击火炮 在战斗开始时")).length,
    };
  `);
  const result = harness.run("__combatStartResult");
  assert(result.enemyTriggeredByName === 1, "已被开战效果击杀的单位不应继续触发开战效果。");
}

function testDeathrattleSummonCap(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const board = [];
    for (let i = 0; i < 7; i += 1) {
      board.push(createOwnedMinion(i === 3 ? "rat-pack" : "taunt-guard"));
    }
    board[3].health = 0;
    const summons = buildDeathrattleSummons(board, board[3]);
    globalThis.__summonCount = summons.length;
  `);
  const summonCount = harness.run("__summonCount");
  assert(summonCount === 1, "亡语召唤数量不应突破战场上限。");
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const tests = [
    ["boot", testBoot],
    ["buy-play-freeze", testBuyPlayAndFreeze],
    ["multiple-triples", testMultipleTriples],
    ["combat-start-dead-minion", testCombatStartDeadMinion],
    ["deathrattle-cap", testDeathrattleSummonCap],
  ];

  tests.forEach(([name, test]) => {
    test(projectRoot);
    console.log(`PASS ${name}`);
  });
}

main();
