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
  const summary = harness.run("({ turn: window.__AUTO_CHESS_TEST_API__.state.turn, gold: window.__AUTO_CHESS_TEST_API__.state.gold, phase: window.__AUTO_CHESS_TEST_API__.state.phase, shopLen: window.__AUTO_CHESS_TEST_API__.state.shop.length, enemyLen: window.__AUTO_CHESS_TEST_API__.state.enemyBoard.length, lobbyAlive: window.__AUTO_CHESS_TEST_API__.state.lobby.players.filter((player) => player.alive).length, currentOpponentName: window.__AUTO_CHESS_TEST_API__.state.currentOpponentName, message: window.__AUTO_CHESS_TEST_API__.state.message })");
  assert(summary.turn === 1, "初始回合应为 1。");
  assert(summary.gold === 3, "初始金币应为 3。");
  assert(summary.phase === "prep", "开局应处于准备阶段。");
  assert(summary.shopLen === 5, "开局商店应生成 5 张牌。");
  assert(summary.enemyLen >= 1, "开局应生成敌方阵容。");
  assert(summary.lobbyAlive === 8, "开局应存在 8 名存活大厅玩家。");
  assert(summary.currentOpponentName, "开局应存在当前对手。");
  assert(summary.message.includes("下一位对手"), "开局提示文案应说明当前大厅对手。");
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

function testSweepKeyword(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const attacker = createOwnedMinion("taunt-guard");
    attacker.name = "横扫测试兵";
    attacker.attack = 1;
    attacker.health = 6;
    attacker.keywords = ["sweep"];
    const left = createOwnedMinion("tabby-cat");
    const center = createOwnedMinion("retired-veteran");
    center.attack = 0;
    center.health = 1;
    const right = createOwnedMinion("tabby-cat");
    const player = [attacker];
    const enemy = [left, center, right];
    const logs = [];
    const frames = [];
    performSingleAttack(player, enemy, logs, frames, "player", attacker, "测试横扫");
    globalThis.__sweepKeywordSummary = {
      logs,
      remainingEnemy: enemy.map((minion) => minion.name),
    };
  `);
  const summary = harness.run("__sweepKeywordSummary");
  assert(summary.logs.some((line) => line.includes("横扫波及了")), "横扫命中相邻单位时应写入日志。");
  assert(summary.remainingEnemy.length === 0, "横扫应同时命中主目标两侧的相邻单位。");
}

function testComboKeyword(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const attacker = createOwnedMinion("arena-champion");
    attacker.name = "连击测试兵";
    attacker.attack = 2;
    attacker.health = 6;
    attacker.keywords = ["combo"];
    const enemyA = createOwnedMinion("tabby-cat");
    const enemyB = createOwnedMinion("tabby-cat");
    const player = [attacker];
    const enemy = [enemyA, enemyB];
    const logs = [];
    const frames = [];
    performAttackSequence(player, enemy, logs, frames, "player", attacker.instanceId, "测试连击");
    globalThis.__comboKeywordSummary = {
      logs,
      remainingEnemy: enemy.map((minion) => minion.name),
    };
  `);
  const summary = harness.run("__comboKeywordSummary");
  assert(summary.logs.some((line) => line.includes("发动连击")), "连击触发时应写入日志。");
  assert(summary.remainingEnemy.length === 0, "连击应让单位在同一轮中额外完成一次攻击。");
}

function testBarrierKeyword(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const attacker = createOwnedMinion("arena-champion");
    attacker.name = "壁垒对手";
    attacker.attack = 5;
    attacker.health = 8;
    const barrier = createOwnedMinion("taunt-guard");
    barrier.name = "壁垒守卫";
    barrier.attack = 0;
    barrier.health = 4;
    barrier.keywords = ["barrier"];
    const protectedMinion = createOwnedMinion("retired-veteran");
    protectedMinion.name = "被守护者";
    protectedMinion.attack = 0;
    protectedMinion.health = 4;
    protectedMinion.keywords = ["provoke"];
    const player = [attacker];
    const enemy = [barrier, protectedMinion];
    const logs = [];
    const frames = [];
    performSingleAttack(player, enemy, logs, frames, "player", attacker, "测试壁垒");
    globalThis.__barrierKeywordSummary = {
      logs,
      remainingEnemy: enemy.map((minion) => ({
        name: minion.name,
        health: minion.health,
      })),
    };
  `);
  const summary = harness.run("__barrierKeywordSummary");
  const barrier = summary.remainingEnemy.find((minion) => minion.name === "壁垒守卫");
  const protectedMinion = summary.remainingEnemy.find((minion) => minion.name === "被守护者");
  assert(summary.logs.some((line) => line.includes("以壁垒为 被守护者 分担了 2 点伤害")), "壁垒分担伤害时应写入日志。");
  assert(barrier && barrier.health === 2, "壁垒单位应代为承受一半伤害，向下取整。");
  assert(protectedMinion && protectedMinion.health === 1, "被保护目标应只承受剩余伤害。");
}

function testAssaultKeyword(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const rebornAttacker = createOwnedMinion("crypt-warden");
    rebornAttacker.name = "狂袭看守者";
    rebornAttacker.attack = 2;
    rebornAttacker.health = 1;
    rebornAttacker.keywords = ["reborn", "assault"];
    rebornAttacker.reborn = { used: false };
    const enemyFront = createOwnedMinion("tabby-cat");
    enemyFront.name = "前排目标";
    enemyFront.attack = 6;
    enemyFront.health = 4;
    enemyFront.keywords = ["provoke"];
    const enemyBack = createOwnedMinion("tabby-cat");
    enemyBack.attack = 0;
    const result = simulateBattle([rebornAttacker], [enemyFront, enemyBack]);
    globalThis.__assaultKeywordSummary = {
      logs: result.logs,
      remainingEnemy: result.remainingEnemy.map((minion) => minion.name),
    };
  `);
  const summary = harness.run("__assaultKeywordSummary");
  const assaultLogCount = summary.logs.filter((line) => line.includes("触发狂袭")).length;
  assert(assaultLogCount >= 2, "狂袭单位应在开战登场和复生后分别立即发起攻击。");
  assert(summary.logs.some((line) => line.includes("触发复生")), "狂袭复生用例应先成功触发复生。");
  assert(
    summary.logs.filter((line) => line.includes("攻击了 敌方 前排目标")).length >= 2,
    "复生后的狂袭应再次立刻攻击同一前排目标。"
  );
}

function testKeywordCardsInPool(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    globalThis.__keywordPoolSummary = {
      swordsman: createOwnedMinion("wandering-swordsman"),
      cleaver: createOwnedMinion("cleaver-warrior"),
      cannon: createOwnedMinion("assault-cannon"),
      warden: createOwnedMinion("crypt-warden"),
      bastion: createOwnedMinion("ironclad-bastion"),
    };
  `);
  const summary = harness.run("__keywordPoolSummary");
  assert(summary.swordsman.keywords.includes("combo"), "流浪剑士应已接入连击关键词。");
  assert(summary.swordsman.text.includes("连击"), "流浪剑士描述应显式写出连击。");
  assert(summary.cleaver.keywords.includes("sweep"), "裂斧战士应已接入横扫关键词。");
  assert(summary.cleaver.text.includes("横扫"), "裂斧战士描述应显式写出横扫。");
  assert(summary.cannon.keywords.includes("assault"), "进击火炮应已接入狂袭关键词。");
  assert(summary.cannon.text.includes("狂袭"), "进击火炮描述应显式写出狂袭。");
  assert(summary.warden.keywords.includes("reborn") && summary.warden.keywords.includes("assault"), "墓窟看守者应同时具备复生与狂袭。");
  assert(summary.warden.text.includes("复生、狂袭"), "墓窟看守者描述应同步体现复生与狂袭。");
  assert(summary.bastion.keywords.includes("barrier"), "铁甲壁垒应已接入壁垒关键词。");
  assert(summary.bastion.text.includes("壁垒"), "铁甲壁垒描述应显式写出壁垒。");
  assert(summary.bastion.combatStart && summary.bastion.combatStart.includeSource === false, "铁甲壁垒的圣盾光环不应再作用于自身。");
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
    const state = window.__AUTO_CHESS_TEST_API__.state;
    state.board = [createOwnedMinion("thunderhide-alpha"), createOwnedMinion("stone-boar")];
    resolveLobbyPhaseEffects(state, "turnEnd", null, pickRandom, randomInt);
    const result = simulateBattle(state.board, [createOwnedMinion("tavern-attendant")]);
    globalThis.__beastBuffSummary = {
      logs: result.logs,
      board: state.board.map((minion) => ({ name: minion.name, attack: minion.attack, health: minion.health })),
      remainingPlayer: result.remainingPlayer.map((minion) => ({ name: minion.name, attack: minion.attack, health: minion.health })),
    };
  `);
  const summary = harness.run("__beastBuffSummary");
  const buffedAlly = summary.board.find((minion) => minion.name === "石牙野猪");
  assert(buffedAlly && buffedAlly.attack === 5 && buffedAlly.health === 4, "雷鬃领主应在回合结束时先强化其他野兽。");
  assert(summary.remainingPlayer.length >= 1, "野兽回合结束增幅后的战斗结果应正常结算。");
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
    const state = window.__AUTO_CHESS_TEST_API__.state;
    state.board = [createOwnedMinion("dawnshield-captain"), createOwnedMinion("royal-lancer")];
    resolveLobbyPhaseEffects(state, "turnEnd", null, pickRandom, randomInt);
    const result = simulateBattle(state.board, [createOwnedMinion("tavern-attendant")]);
    globalThis.__humanFormationSummary = {
      logs: result.logs,
      board: state.board.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
        keywords: [...minion.keywords],
      })),
      remainingPlayer: result.remainingPlayer.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
        keywords: [...minion.keywords],
      })),
    };
  `);
  const summary = harness.run("__humanFormationSummary");
  const lancer = summary.board.find((minion) => minion.name === "王城枪兵");
  assert(lancer && lancer.attack === 4 && lancer.health === 5, "曙光盾卫队长应在回合结束时为人类提供 +1/+2。");
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

function testAdjacentCombatStartBuffs(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const result = simulateBattle(
      [createOwnedMinion("spawn-bot"), createOwnedMinion("iron-reaper"), createOwnedMinion("shield-bot")],
      []
    );
    globalThis.__adjacentBuffSummary = {
      logs: result.logs,
      remainingPlayer: result.remainingPlayer.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
      })),
    };
  `);
  const summary = harness.run("__adjacentBuffSummary");
  const spawnBot = summary.remainingPlayer.find((minion) => minion.name === "产线机器人");
  const shieldBot = summary.remainingPlayer.find((minion) => minion.name === "护盾机器人");
  assert(summary.logs.some((line) => line.includes("钢铁收割者") && line.includes("整顿阵形")), "相邻增益应写入战斗开始日志。");
  assert(spawnBot && spawnBot.attack === 3 && spawnBot.health === 2, "钢铁收割者应增益左侧相邻机械。");
  assert(shieldBot && shieldBot.attack === 2 && shieldBot.health === 3, "钢铁收割者应增益右侧相邻机械。");
}

function testTurnStartBuffs(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const state = window.__AUTO_CHESS_TEST_API__.state;
    state.turn = 1;
    state.board = [createOwnedMinion("alley-cat"), createOwnedMinion("stone-boar"), createOwnedMinion("woodland-wolf")];
    startNextTurnState(
      state,
      (tier) => generateShop(tier, pickRandom),
      (shop, tier) => refillShop(shop, tier, pickRandom),
      (turn) => generateEnemyBoard(turn, pickRandom, randomInt),
      pickRandom,
      randomInt
    );
    globalThis.__turnStartSummary = state.board.map((minion) => ({
      name: minion.name,
      attack: minion.attack,
      health: minion.health,
    }));
  `);
  const summary = harness.run("__turnStartSummary");
  const cat = summary.find((minion) => minion.name === "巷口野猫");
  const boar = summary.find((minion) => minion.name === "石牙野猪");
  const wolf = summary.find((minion) => minion.name === "林地幼狼");
  assert(cat && cat.attack === 2 && cat.health === 2, "回合开始时，石牙野猪应强化左侧相邻野兽。");
  assert(boar && boar.attack === 3 && boar.health === 3, "回合开始时，来源随从自身不应被相邻增益影响。");
  assert(wolf && wolf.attack === 3 && wolf.health === 2, "回合开始时，石牙野猪应强化右侧相邻野兽。");
}

function testReactiveDamageTrigger(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const result = simulateBattle(
      [createOwnedMinion("molten-brute")],
      [createOwnedMinion("tavern-attendant"), createOwnedMinion("tabby-cat")]
    );
    globalThis.__reactiveDamageSummary = {
      logs: result.logs,
      remainingEnemy: result.remainingEnemy.map((minion) => ({
        name: minion.name,
        health: minion.health,
      })),
    };
  `);
  const summary = harness.run("__reactiveDamageSummary");
  assert(summary.logs.some((line) => line.includes("熔火狂徒") && line.includes("受伤后反击")), "受伤反击应写入日志。");
  assert(
    summary.remainingEnemy.length <= 1 || summary.remainingEnemy.some((minion) => minion.health <= 2),
    "受伤反击后应击伤或击杀一个敌方单位。"
  );
}

function testDeathrattleBuffsFriendlies(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const player = [createOwnedMinion("woodland-wolf"), createOwnedMinion("stone-boar")];
    const enemy = [];
    const logs = [];
    const frames = [];
    player[0].health = 0;
    resolveDeathrattle(player, enemy, 0, player[0], player, enemy, "player", logs, frames, "测试");
    globalThis.__deathrattleBuffSummary = {
      logs,
      remainingPlayer: player.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
      })),
    };
  `);
  const summary = harness.run("__deathrattleBuffSummary");
  const boar = summary.remainingPlayer.find((minion) => minion.name === "石牙野猪");
  assert(summary.logs.some((line) => line.includes("林地幼狼") && line.includes("亡语鼓舞")), "亡语增益应写入日志。");
  assert(boar && boar.attack === 4 && boar.health === 3, "林地幼狼亡语后，其他野兽应获得攻击增益。");
}

function testTurnEndBuffsBeforeBattle(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const state = window.__AUTO_CHESS_TEST_API__.state;
    state.turn = 2;
    state.board = [createOwnedMinion("arena-veteran"), createOwnedMinion("tavern-attendant")];
    resolveLobbyPhaseEffects(state, "turnEnd", null, pickRandom, randomInt);
    const result = simulateBattle(state.board, []);
    globalThis.__turnEndSummary = {
      board: state.board.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
      })),
      startingPlayer: result.startingPlayer.map((minion) => ({
        name: minion.name,
        attack: minion.attack,
        health: minion.health,
      })),
    };
  `);
  const summary = harness.run("__turnEndSummary");
  assert(
    summary.board.some((minion) => (minion.name === "竞技老兵" || minion.name === "酒馆侍从") && (minion.attack > (minion.name === "竞技老兵" ? 3 : 1) || minion.health > (minion.name === "竞技老兵" ? 3 : 3))),
    "回合结束时应先结算竞技老兵的增益。"
  );
  assert(
    JSON.stringify(summary.board) === JSON.stringify(summary.startingPlayer),
    "回合结束增益后的面板属性应直接进入战斗起始快照。"
  );
}

function testLobbyBattlePerspective(projectRoot) {
  const harness = createHarness(projectRoot);
  harness.run(`
    const state = window.__AUTO_CHESS_TEST_API__.state;
    state.turn = 2;
    state.board = [createOwnedMinion("taunt-guard")];
    state.enemyBoard = [createOwnedMinion("arena-champion")];
    const enemy = getLobbyPlayerById(state.lobby, state.currentOpponentId);
    if (enemy) {
      enemy.board = state.enemyBoard.map(copyMinion);
    }
    state.lobby.pairings = [{ a: "ai-1", b: "player" }];
    const round = resolveLobbyRound(state.lobby, state, simulateBattle, generateEnemyBoard, pickRandom, randomInt);
    globalThis.__lobbyPerspectiveSummary = {
      playerBattle: {
        startingPlayer: round.playerBattle.result.startingPlayer.map((minion) => minion.name),
        startingEnemy: round.playerBattle.result.startingEnemy.map((minion) => minion.name),
        logs: round.playerBattle.result.logs,
      },
    };
  `);
  const summary = harness.run("__lobbyPerspectiveSummary");
  assert(summary.playerBattle.startingPlayer[0] === "人类守卫", "玩家处于配对后手时，我方战斗快照仍应显示真实上场的玩家随从。");
  assert(summary.playerBattle.startingEnemy[0] === "兽人统领", "玩家处于配对后手时，敌方战斗快照应显示真实对手随从。");
  assert(summary.playerBattle.logs.some((line) => line.includes("我方 人类守卫") || line.includes("敌方 兽人统领")), "战斗日志应以玩家视角记录双方。");
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
    ["keyword-sweep", testSweepKeyword],
    ["keyword-combo", testComboKeyword],
    ["keyword-barrier", testBarrierKeyword],
    ["keyword-assault", testAssaultKeyword],
    ["keyword-cards-in-pool", testKeywordCardsInPool],
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
    ["adjacent-combat-start-buffs", testAdjacentCombatStartBuffs],
    ["turn-start-buffs", testTurnStartBuffs],
    ["reactive-damage-trigger", testReactiveDamageTrigger],
    ["deathrattle-buffs-friendlies", testDeathrattleBuffsFriendlies],
    ["turn-end-buffs-before-battle", testTurnEndBuffsBeforeBattle],
    ["lobby-battle-perspective", testLobbyBattlePerspective],
  ];

  tests.forEach(([name, test]) => {
    test(projectRoot);
    console.log(`PASS ${name}`);
  });
}

main();
