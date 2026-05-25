# 酒馆自走棋原型

这是一个不依赖框架的单机网页原型，目标不是复刻完整炉石战棋，而是先把最小可玩循环搭起来：

- 商店刷新
- 买入随从
- 上阵与站位调整
- 准备阶段限时倒计时
- 隐藏对手阵容
- 自动战斗
- 战斗画面切换
- 护盾、嘲讽、亡语
- 简化版三连合成

最近的迭代记录见 [CHANGELOG.md](C:/baidu/自走棋/CHANGELOG.md:1)。

## 公开给别人玩

这个项目现在是纯前端静态网页，不需要单独后端，可以直接部署到 GitHub Pages。

如果你的 GitHub 用户名是 `your-name`，仓库名是 `auto-chess`，上线后的地址通常会是：

`https://your-name.github.io/auto-chess/`

仓库里已经包含 GitHub Pages 自动部署工作流 [.github/workflows/deploy-pages.yml](C:/baidu/自走棋/.github/workflows/deploy-pages.yml:1)，正常情况下只要推到 `main` 分支就会自动发布。

### GitHub Pages 发布步骤

1. 在 GitHub 上新建一个仓库。
2. 把当前项目推到这个仓库的 `main` 分支。
3. 打开仓库页面的 `Settings -> Pages`。
4. 在 `Build and deployment` 里把 `Source` 设为 `GitHub Actions`。
5. 等待仓库里的 `Deploy GitHub Pages` 工作流跑完。
6. 发布成功后，访问 GitHub Pages 给你的公开地址。

如果你还没有把本地仓库推到 GitHub，可以参考下面这组命令，把 `your-name` 和 `auto-chess` 替换成你自己的：

```powershell
git remote add origin https://github.com/your-name/auto-chess.git
git branch -M main
git push -u origin main
```

说明：

- 这个项目当前使用的是相对路径资源引用，适合直接挂在 GitHub Pages 的项目路径下。
- 现有工作流只会发布运行游戏真正需要的文件：`index.html`、`styles.css`、`src/`。
- `scripts/`、`artifacts/` 这些开发和回归文件不会被部署到线上。

## 怎么运行

最简单的方法：

1. 直接用浏览器打开 `index.html`

如果你更想本地起服务，也可以在当前目录执行：

```powershell
python -m http.server 8080
```

然后访问 `http://localhost:8080`

如果你想快速做一次核心回归，可以执行：

```powershell
npm run smoke
```

如果你想做一轮真实页面交互回归，可以执行：

```powershell
npm run browser:regression
```

如果你想专门检查卡牌排版位置，可以执行：

```powershell
npm run visual:layout
```

说明：这个脚本会临时起一个本地静态服务，并调用本机已安装的 Chrome 或 Edge 做无头页面检查。
如果当前环境里找不到 `playwright-core` 或浏览器可执行文件，可以通过环境变量覆盖：

```powershell
$env:PLAYWRIGHT_CORE_PATH = '你的 playwright-core\\index.js'
$env:BROWSER_REGRESSION_BROWSER = '你的浏览器.exe'
npm run browser:regression
```

如果你想把两套回归连续跑完，可以执行：

```powershell
npm run regression
```

`npm run visual:layout` 会额外输出一组卡牌布局测量值，并生成截图到 [artifacts/visual-layout-card.png](C:/baidu/自走棋/artifacts/visual-layout-card.png:1)，方便直接核对种族和左右属性的位置。

## 当前规则说明

- 初始 30 血
- 第 1 回合 3 金，第 5 回合开始金币增长会更快，并在第 7 回合达到 10 金
- 第 1、2、3 回合准备时间为 15 秒，第 4 回合开始每回合额外增加 10 秒，最大 60 秒
- 买随从 3 金，刷新商店 1 金，卖随从返 1 金，升级商店费用会在每个新回合自动递减 1
- 酒馆最高 7 级
- 开局会进入一局 8 人异步大厅，你与 7 名 AI 对手共同推进
- 每回合只会正面交战 1 名对手，另外几桌会在后台同步结算
- 对手被击败后会按残局伤害掉血，血量归零即出局，最后存活者为第 1 名
- 准备阶段不会显示对手阵容
- 倒计时结束后会自动切到战斗画面，也可以手动提前开打
- 战斗阶段为自动结算，随从按站位顺序轮流攻击
- 战斗失败后的掉血会同时参考敌方残存单位数量和星级，但比“纯星级总和”更平滑

说明：当前 1 到 7 星卡池都已经接入，并且高星内容带有独立机制与更低出现率。
说明：关键词系统当前支持嘲讽、挑衅、护盾、亡语、复生、剧毒、顺劈，以及新接入的横扫、连击、壁垒、狂袭。
说明：野兽偏开战增幅与顺劈剧毒，机械偏护盾、壁垒与开战炮击，恶魔偏群体压血，亡灵偏复生、狂袭与亡语铺场。
说明：人类现在更偏阵线与纪律加成，兽人偏受伤成长与横扫，精灵偏开战多段点杀，中立则补充连击与通用成长。

## 后续最值得加的内容

1. 英雄和英雄技能
2. 更多种族和羁绊加成
3. 手牌整理 / 更丰富的商店经营反馈
4. 更接近炉石战棋的攻击与亡语结算
5. 动画、音效和更完整的 UI 反馈
