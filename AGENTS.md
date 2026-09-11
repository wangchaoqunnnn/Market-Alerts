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

## 行情数据架构

- 主源：东方财富 push2 接口（后端代理）
- 备用：腾讯财经 / 新浪财经
- 兜底：模拟数据引擎（开发/演示用）
- 架构：MarketDataService 统一抽象，多源自动切换
- 刷新频率：1秒（交易时段）
