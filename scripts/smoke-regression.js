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

function testHighTierPoolAccess(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const preferHighestNumber = (candidates) =>
      candidates.reduce((best, value) => {
        const bestTier = typeof best === "number" ? best : best.tier;
        const valueTier = typeof value === "number" ? value : value.tier;
        return valueTier > bestTier ? value : best;
      }, candidates[0]);
    globalThis.__highTierSummary = {
      shopTier4: generateShop(4, preferHighestNumber).map((minion) => minion.tier),
      shopTier7: generateShop(7, preferHighestNumber).map((minion) => minion.tier),
      enemyTier7: generateEnemyBoard(20, preferHighestNumber, () => 0).map((minion) => minion.tier),
    };
  `);
  const summary = harness.run("__highTierSummary");
  assert(summary.shopTier4.every((tier) => tier === 4), "4 星卡池尚未接入商店。");
  assert(summary.shopTier7.every((tier) => tier === 7), "7 星卡池尚未接入商店。");
  assert(summary.enemyTier7.length > 0, "高回合敌方阵容未生成。");
  assert(summary.enemyTier7.every((tier) => tier === 7), "7 星卡池尚未接入敌方阵容。");
}

function testShopTierOdds(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const counts = {};
    for (let i = 0; i < 200; i += 1) {
      generateShop(7, pickRandom).forEach((minion) => {
        counts[minion.tier] = (counts[minion.tier] || 0) + 1;
      });
    }
    globalThis.__shopTierCounts = counts;
  `);
  const counts = harness.run("__shopTierCounts");
  assert(counts[4] > counts[7], "7 级商店里 7 星牌不应比 4 星牌更常见。");
  assert(counts[5] > counts[7], "7 级商店里 7 星牌应属于更稀有层。");
}

function testEconomyCurve(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const state = window.__AUTO_CHESS_TEST_API__.state;
    state.turn = 4;
    state.gold = 0;
    startNextTurnState(
      state,
      (tier) => generateShop(tier, pickRandom),
      (shop, tier) => refillShop(shop, tier, pickRandom),
      (turn) => generateEnemyBoard(turn, pickRandom, randomInt)
    );
    globalThis.__economySummary = {
      turn: state.turn,
      gold: state.gold,
      upgrade2: UPGRADE_COSTS[2],
      upgrade6: UPGRADE_COSTS[6],
    };
  `);
  const summary = harness.run("__economySummary");
  assert(summary.turn === 5, "经济曲线测试应推进到第 5 回合。");
  assert(summary.gold === 8, "第 5 回合金币应提升到 8。");
  assert(summary.upgrade2 === 6, "2 级升本费用应下调到 6。");
  assert(summary.upgrade6 === 10, "6 级升本费用应下调到 10。");
}

function testEnemyGrowthCurve(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    globalThis.__enemyCurveSummary = {
      tier3: getEnemyBoardTier(3),
      tier4: getEnemyBoardTier(4),
      size5: getEnemyBoardBaseSize(5) + ENEMY_BOARD_RULES.extraSizeRollMax,
    };
  `);
  const summary = harness.run("__enemyCurveSummary");
  assert(summary.tier3 === 1, "第 3 回合敌方不应过早进入 2 星池。");
  assert(summary.tier4 === 2, "第 4 回合敌方应开始进入 2 星池。");
  assert(summary.size5 <= 4, "第 5 回合敌方铺场不应过快突破中速节奏。");
}

function testBattleDamageCurve(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    globalThis.__battleDamageSummary = {
      singleTierOne: calculateBattleDamage([createOwnedMinion("taunt-guard")]),
      doubleTierSeven: calculateBattleDamage([createOwnedMinion("mythic-behemoth"), createOwnedMinion("doomfire-archon")]),
      fullBoardHighTier: calculateBattleDamage([
        createOwnedMinion("mythic-behemoth"),
        createOwnedMinion("doomfire-archon"),
        createOwnedMinion("eternal-necrolord"),
        createOwnedMinion("apocalypse-engine"),
      ]),
    };
  `);
  const summary = harness.run("__battleDamageSummary");
  assert(summary.singleTierOne === 1, "单个低星残阵应只造成 1 点伤害。");
  assert(summary.doubleTierSeven === 5, "两个 7 星残局的伤害应被压到更平滑的区间。");
  assert(summary.fullBoardHighTier === 11, "高星大残阵仍应造成显著伤害，但不应无限膨胀。");
}

function testCleaveAndPoisonous(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const attacker = createOwnedMinion("mythic-behemoth");
    const ally = createOwnedMinion("tavern-attendant");
    const allyTwo = createOwnedMinion("wandering-swordsman");
    const defenderA = createOwnedMinion("taunt-guard");
    const defenderB = createOwnedMinion("arena-champion");
    const result = simulateBattle([attacker, ally, allyTwo], [defenderA, defenderB]);
    globalThis.__cleavePoisonSummary = {
      logs: result.logs,
      remainingEnemy: result.remainingEnemy.map((minion) => minion.name),
    };
  `);
  const summary = harness.run("__cleavePoisonSummary");
  assert(summary.logs.some((line) => line.includes("顺劈波及")), "顺劈命中时应写入日志。");
  assert(summary.remainingEnemy.length === 0, "剧毒顺劈应能清空相邻两个目标。");
}

function testCombatStartDealAllDamage(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const result = simulateBattle(
      [createOwnedMinion("siege-colossus")],
      [createOwnedMinion("shield-bot"), createOwnedMinion("woodland-wolf")]
    );
    globalThis.__dealAllSummary = {
      logs: result.logs,
      remainingEnemy: result.remainingEnemy.map((minion) => ({
        name: minion.name,
        health: minion.health,
        keywords: [...minion.keywords],
      })),
    };
  `);
  const summary = harness.run("__dealAllSummary");
  assert(summary.logs.some((line) => line.includes("对所有敌方随从造成了 1 点伤害")), "群体开战伤害应写入日志。");
  assert(summary.logs.some((line) => line.includes("圣盾被打掉")), "群体开战伤害应能打掉圣盾。");
  assert(summary.remainingEnemy.every((minion) => minion.name !== "护盾机器人"), "群体开战伤害后圣盾单位应不再保留圣盾。");
}

function testBeastCombatStartBuff(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const alpha = createOwnedMinion("thunderhide-alpha");
    const ally = createOwnedMinion("stone-boar");
    const enemy = createOwnedMinion("tavern-attendant");
    const result = simulateBattle([alpha, ally], [enemy]);
    globalThis.__beastBuffSummary = {
      logs: result.logs,
      remainingPlayer: result.remainingPlayer.map((minion) => ({ name: minion.name, attack: minion.attack, health: minion.health })),
    };
  `);
  const summary = harness.run("__beastBuffSummary");
  const buffedAlpha = summary.remainingPlayer.find((minion) => minion.name === "雷鬃领主");
  assert(summary.logs.some((line) => line.includes("鼓舞了")), "野兽开战增幅应写入日志。");
  assert(summary.logs.some((line) => line.includes("赋予 +2/+1")), "野兽开战增幅日志应包含具体数值。");
  assert(buffedAlpha || summary.remainingPlayer.length >= 1, "野兽开战增幅后的战斗结果应正常结算。");
}

function testMechGrantDivineShield(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const bastion = createOwnedMinion("ironclad-bastion");
    const ally = createOwnedMinion("spawn-bot");
    const enemy = createOwnedMinion("arena-champion");
    const result = simulateBattle([bastion, ally], [enemy]);
    globalThis.__mechShieldSummary = {
      logs: result.logs,
      remainingPlayer: result.remainingPlayer.map((minion) => ({ name: minion.name, keywords: [...minion.keywords] })),
    };
  `);
  const summary = harness.run("__mechShieldSummary");
  const ally = summary.remainingPlayer.find((minion) => minion.name === "产线机器人");
  assert(summary.logs.some((line) => line.includes("施加了圣盾")), "机械授予圣盾应写入日志。");
  assert(ally && ally.keywords.includes("divineShield"), "机械友军应获得圣盾。");
}

function testDemonStackedBoardDamage(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const magus = createOwnedMinion("hellfire-magus");
    const archon = createOwnedMinion("doomfire-archon");
    const result = simulateBattle(
      [magus, archon],
      [createOwnedMinion("woodland-wolf"), createOwnedMinion("murloc-scout"), createOwnedMinion("shield-bot")]
    );
    globalThis.__demonDamageSummary = {
      logs: result.logs,
      remainingEnemy: result.remainingEnemy.map((minion) => ({ name: minion.name, health: minion.health, keywords: [...minion.keywords] })),
    };
  `);
  const summary = harness.run("__demonDamageSummary");
  assert(summary.logs.filter((line) => line.includes("对所有敌方随从造成了")).length >= 2, "恶魔体系的群体开战伤害应可叠加触发。");
  assert(summary.remainingEnemy.every((minion) => minion.name !== "恶魔斥候"), "叠加群伤后低血单位应被优先清掉。");
}

function testRebornRevivesMinion(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const result = simulateBattle(
      [createOwnedMinion("crypt-warden")],
      [createOwnedMinion("arena-champion")]
    );
    globalThis.__rebornSummary = {
      logs: result.logs,
      remainingPlayer: result.remainingPlayer.map((minion) => ({
        name: minion.name,
        health: minion.health,
        keywords: [...minion.keywords],
        deathrattle: minion.deathrattle,
      })),
    };
  `);
  const summary = harness.run("__rebornSummary");
  const reborned = summary.remainingPlayer.find((minion) => minion.name === "墓窟看守者");
  assert(summary.logs.some((line) => line.includes("触发复生")), "复生触发时应写入日志。");
  assert(reborned && reborned.health === 1, "复生后的单位应以 1 点生命回到战场。");
  assert(reborned && reborned.deathrattle && reborned.deathrattle.type === "summon", "复生不应清掉单位原有亡语。");
}

function testUndeadGrantReborn(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const summoner = createOwnedMinion("grave-summoner");
    const ally = createOwnedMinion("soul-devourer");
    const enemyA = createOwnedMinion("arena-champion");
    const enemyB = createOwnedMinion("arena-champion");
    const result = simulateBattle([summoner, ally], [enemyA, enemyB]);
    globalThis.__undeadGrantRebornSummary = {
      logs: result.logs,
    };
  `);
  const summary = harness.run("__undeadGrantRebornSummary");
  assert(summary.logs.some((line) => line.includes("施加了复生")), "冥府唤骨师应能给其他亡灵施加复生。");
}

function testNecrolordBuffsUndead(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const lord = createOwnedMinion("eternal-necrolord");
    const ally = createOwnedMinion("bone-fighter");
    const result = simulateBattle([lord, ally], [createOwnedMinion("tavern-attendant")]);
    globalThis.__necrolordSummary = {
      logs: result.logs,
      remainingPlayer: result.remainingPlayer.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
      })),
    };
  `);
  const summary = harness.run("__necrolordSummary");
  const ally = summary.remainingPlayer.find((minion) => minion.name === "白骨短兵");
  assert(
    summary.logs.some((line) => line.includes("永夜尸王") && line.includes("亡灵友军") && line.includes("+2/+1")),
    "永夜尸王应写出亡灵群体增幅日志。"
  );
  assert(ally && ally.attack >= 4, "永夜尸王应提升其他亡灵的攻击力。");
}

function testOrcDamageTriggers(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const brute = createOwnedMinion("bloodfury-brute");
    const enemy = createOwnedMinion("taunt-guard");
    const result = simulateBattle([brute], [enemy]);
    globalThis.__orcDamageTriggerSummary = {
      logs: result.logs,
      remainingPlayer: result.remainingPlayer.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
      })),
    };
  `);
  const summary = harness.run("__orcDamageTriggerSummary");
  const brute = summary.remainingPlayer.find((minion) => minion.name === "血怒蛮王");
  assert(summary.logs.some((line) => line.includes("受伤后激怒")), "兽人受伤成长应写入日志。");
  assert(brute && brute.attack >= 8, "兽人前排受伤后应提升攻击力。");
}

function testHumanFormationBuffs(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const captain = createOwnedMinion("dawnshield-captain");
    const lancer = createOwnedMinion("royal-lancer");
    const result = simulateBattle([captain, lancer], [createOwnedMinion("tavern-attendant")]);
    globalThis.__humanFormationSummary = {
      logs: result.logs,
      remainingPlayer: result.remainingPlayer.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
        keywords: [...minion.keywords],
      })),
    };
  `);
  const summary = harness.run("__humanFormationSummary");
  const lancer = summary.remainingPlayer.find((minion) => minion.name === "王城枪兵");
  assert(summary.logs.some((line) => line.includes("人类友军") && line.includes("+1/+2")), "人类阵线增幅应写入日志。");
  assert(lancer && lancer.health >= 5, "人类友军应获得曙光盾卫队长的体质增幅。");
}

function testElfRepeatedShots(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const watcher = createOwnedMinion("astral-waywatcher");
    const result = simulateBattle(
      [watcher],
      [createOwnedMinion("woodland-wolf"), createOwnedMinion("murloc-scout"), createOwnedMinion("tavern-attendant")]
    );
    globalThis.__elfShotSummary = {
      logs: result.logs,
      remainingEnemy: result.remainingEnemy.map((minion) => minion.name),
    };
  `);
  const summary = harness.run("__elfShotSummary");
  assert(summary.logs.filter((line) => line.includes("第 1 次射击") || line.includes("第 2 次射击") || line.includes("第 3 次射击")).length >= 3, "精灵多段点杀应逐次写入日志。");
  assert(summary.remainingEnemy.length <= 1, "高星精灵多段点杀后应显著削减敌方阵容。");
}

function main() {
  const projectRoot = path.resolve(__dirname, "..");
  const tests = [
    ["boot", testBoot],
    ["buy-play-freeze", testBuyPlayAndFreeze],
    ["multiple-triples", testMultipleTriples],
    ["combat-start-dead-minion", testCombatStartDeadMinion],
    ["deathrattle-cap", testDeathrattleSummonCap],
    ["high-tier-pool-access", testHighTierPoolAccess],
    ["shop-tier-odds", testShopTierOdds],
    ["economy-curve", testEconomyCurve],
    ["enemy-growth-curve", testEnemyGrowthCurve],
    ["battle-damage-curve", testBattleDamageCurve],
    ["cleave-poisonous", testCleaveAndPoisonous],
    ["combat-start-deal-all", testCombatStartDealAllDamage],
    ["beast-combat-start-buff", testBeastCombatStartBuff],
    ["mech-grant-divine-shield", testMechGrantDivineShield],
    ["demon-stacked-board-damage", testDemonStackedBoardDamage],
    ["reborn-revives-minion", testRebornRevivesMinion],
    ["undead-grant-reborn", testUndeadGrantReborn],
    ["necrolord-buffs-undead", testNecrolordBuffsUndead],
    ["orc-damage-triggers", testOrcDamageTriggers],
    ["human-formation-buffs", testHumanFormationBuffs],
    ["elf-repeated-shots", testElfRepeatedShots],
  ];

  tests.forEach(([name, test]) => {
    test(projectRoot);
    console.log(`PASS ${name}`);
  });
}

main();
