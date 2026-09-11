# 盘中异动监控系统 - 研发规范

## 应用概览

盘中异动监控系统是一款 A 股盘中实时监控 + AI 投研工具，覆盖"监控发现 → 研究分析 → 对比决策"完整链路。

## 设计规范

### 色彩系统（红涨绿跌专业金融质感）

```
--bg-primary: #0d1117          /* 主背景：深色专业 */
--bg-secondary: #161b22        /* 卡片背景 */
--bg-tertiary: #21262d         /* 悬浮/选中背景 */
--border-color: #30363d        /* 边框 */
--text-primary: #e6edf3        /* 主文字 */
--text-secondary: #8b949e      /* 次文字 */
--text-muted: #6e7681          /* 弱文字 */

--color-rise: #f85149          /* 涨：红色 */
--color-rise-light: #ff7b72    /* 涨浅色 */
--color-rise-bg: rgba(248,81,73,0.1)
--color-fall: #3fb950          /* 跌：绿色（中国股市红涨绿跌）*/
--color-fall-light: #56d364    /* 跌浅色 */
--color-fall-bg: rgba(63,185,80,0.1)
--color-flat: #8b949e          /* 平盘：灰色 */

--color-primary: #58a6ff       /* 主色：蓝 */
--color-warning: #d29922       /* 警示：黄 */
--color-danger: #f85149        /* 危险：红 */
--color-success: #3fb950       /* 成功：绿 */
```

### 排版层级

- 标题：text-xl font-semibold tracking-tight
- 子标题：text-base font-medium
- 正文：text-sm
- 辅助：text-xs text-muted-foreground
- 数字/价格：font-mono tabular-nums

### 布局间距

- 页面内边距：p-4 md:p-6
- 卡片间距：gap-4
- 卡片内边距：p-4
- 行间距：gap-2

### 响应式断点

- 移动端：< 768px（单列布局，侧边栏收起为底部 Tab）
- 平板：768px - 1024px（侧边栏收起，两列布局）
- 桌面：> 1024px（侧边栏展开，多列布局）

## 技术架构

### 前端模块划分

```
client/src/pages/
├── surge-board/       # M1 涨速榜
├── limit-up/          # M2 涨停个股
├── limit-broken/      # M3 炸板监控
├── stock-screener/    # M4 选股工具
├── stock-research/    # M5 个股研究
├── stock-compare/     # M6 多股对比
└── watchlist/         # 自选股管理
```

### 后端模块划分

```
server/modules/
├── market-data/       # 行情数据服务（模拟+真实源切换）
├── surge-board/       # M1 涨速榜
├── limit-up/          # M2 涨停个股
├── limit-broken/      # M3 炸板监控
├── stock-screener/    # M4 选股工具
├── stock-research/    # M5 个股研究
├── stock-compare/     # M6 多股对比
└── watchlist/         # 自选股/策略持久化
```

### 数据库表

- watchlist_stocks：自选股
- screen_strategies：选股策略
- alert_settings：预警设置
- report_history：报告历史

## 行情数据架构（已接入真实行情）

- 实现位置：`server/modules/market-data/real-market.provider.ts`（真实数据源）+ `market-data.service.ts`（调度、状态维护、对外 DTO）
- 数据源分工：

| 数据 | 来源 |
|------|------|
| 全市场股票列表 / 快照 / 涨速 | 东方财富 clist（`push2` 失败自动切 `push2delay`；单页上限 100 条，全 A 约 5900 只分页拉取） |
| 涨停池 / 炸板池（封单额、首末封板时间、连板数、炸板次数） | 东方财富 `push2ex` 涨停板行情 |
| 单只详情 / 概念板块 / 财务摘要 | 东方财富 `stock/get`、`slist`、数据中心 `RPT_LICO_FN_CPD` |
| 批量行情（备用） | 腾讯 `qt.gtimg.cn`、新浪 `hq.sinajs.cn`（GBK） |
| 日K线（研究 / 对比区间涨跌） | 新浪 `CN_MarketDataService.getKLineData` |
| 兜底 | 模拟引擎，仅在 `MARKET_DATA_SOURCE=mock` 或所有真实源都不可用时启用 |

- 切换与刷新配置：`MARKET_DATA_SOURCE=auto|eastmoney|tencent|sina|mock`、`REFRESH_INTERVAL_MS`（默认 5000）、`FULL_SNAPSHOT_INTERVAL_MS`（默认 60000）、`MAX_STOCKS`（默认 8000）
- 全市场列表在服务启动后**后台分页加载**（约 6 秒），不阻塞端口监听；涨停/炸板池先加载，保证页面开门即有数据
- 约束：数据源 URL、GBK 解码、字段映射统一收敛在 provider 内，业务代码禁止直接写死外部行情接口

### 股票池覆盖范围（硬性要求：不得遗漏任何交易所板块）

| 板块 | 号段 |
|------|------|
| 沪市主板 | 600 / 601 / 603 / 605 |
| 沪市科创板 | 688 / 689（存托凭证） |
| 深市主板 | 000 / 001 / 002 / 003 |
| 深市创业板 | 300 / 301 |
| 北交所 | 430 / 83x / 87x / 920 |

- 号段识别规则统一收敛在 `shared/a-share.ts`（`classifyAShareCode` / `getPriceLimit`），前后端共用，禁止在业务代码里硬编码前缀判断
- 任意合法 A 股代码都会**按需拉取真实行情**（搜索/自选/研究/对比均可用），不因不在已加载列表里而报「不存在」
- 涨跌幅限制优先采用交易所实际涨停价反推（兼容 ST、次新），缺失时按板块规则：主板 10%（ST 5%）、创业板/科创板 20%、北交所 30%
- 不纳入范围：900xxx / 200xxx（B 股）、400xxx / 88xxxx（新三板）、基金 ETF 等
- 覆盖度自检：`GET /api/market-data/market-coverage`，服务启动日志同样会打印各板块股票数量
