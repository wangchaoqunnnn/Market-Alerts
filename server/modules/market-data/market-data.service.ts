import { Injectable, Logger, OnModuleInit, NotFoundException } from '@nestjs/common';
import type {
  StockQuote,
  SurgeItem,
  LimitUpStock,
  LimitBrokenStock,
  MarketSentiment,
  SectorInfo,
  StockResearch,
  StockOverview,
  DeepReport,
  ReportSection,
  EvidenceItem,
  StockCompare,
  ScreenResult,
  ScreenConditions,
  SealEvent,
  ListResponse,
  LimitBrokenSectorStat,
  MarketStatus,
  MarketCoverage,
  BoardCoverage,
} from '@shared/api.interface.ts';
import {
  BOARD_ORDER,
  MARKET_LABELS,
  boardFullLabel,
  classifyAShareCode,
  getPriceLimit,
  normalizeStockCode,
  type Board,
  type Market,
} from '@shared/a-share';
import {
  generateMockStocks,
  buildMockStockForCode,
  INDUSTRIES,
  type MockStock,
  type StockMeta,
} from './mock-stocks';
import {
  RealMarketDataProvider,
  type DataSourceKind,
  type PoolItem,
  type RealQuote,
} from './real-market.provider';

interface RuntimeQuote {
  stock: MockStock;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  bid1Price: number;
  bid1Volume: number;
  ask1Price: number;
  ask1Volume: number;
  isLimitUp: boolean;
  isLimitDown: boolean;
  isOneWordLimitUp: boolean;
  firstSealTime: number | null;
  lastSealTime: number | null;
  firstBreakTime: number | null;
  lastBreakTime: number | null;
  openCount: number;
  sealAmount: number;
  status: 'normal' | 'sealing' | 'broken' | 'resealed';
  timeline: SealEvent[];
  priceHistory: { time: number; price: number }[];
  lastMinuteSnap: { time: number; price: number }[];
  timestamp: number;
  momentumPhase: 'none' | 'surging' | 'plunging';
  momentumRemaining: number;
  /** 东财 5 分钟涨速（真实数据源）：本地分钟样本不足时用于涨速榜兜底 */
  realSpeed: number;
  /** 真实行情提供的换手率（%） */
  realTurnover: number;
  /** 真实行情提供的总市值/流通市值（元） */
  realMarketCap: number;
  realFloatMarketCap: number;
  /** 最近一次由真实行情刷新的时间戳（0 表示纯模拟数据） */
  lastRealUpdate: number;
}

const PRICE_PRECISION: number = 2;
const MINUTE_MS: number = 60 * 1000;
const HISTORY_MINUTES: number = 10;
/** 按需纳入监控的股票数上限（真实 A 股约 5400 只，留足余量并防止异常请求撑爆内存） */
const MAX_UNIVERSE_SIZE: number = 8000;

function roundPrice(value: number): number {
  return Math.round(value * Math.pow(10, PRICE_PRECISION)) / Math.pow(10, PRICE_PRECISION);
}

function formatTime(ts: number): string {
  const d: Date = new Date(ts);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

@Injectable()
export class MarketDataService implements OnModuleInit {
  private readonly logger = new Logger(MarketDataService.name);
  private quotes: Map<string, RuntimeQuote> = new Map();
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private startTime: number = 0;

  // ===== 真实行情相关状态 =====
  private readonly provider: RealMarketDataProvider = new RealMarketDataProvider();
  /** 当前生效的数据源：eastmoney / tencent / sina / mock */
  private dataSource: DataSourceKind = 'mock';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private refreshing: boolean = false;
  private universeLoading: boolean = false;
  private lastFullSnapshotAt: number = 0;
  private universeLoaded: boolean = false;
  /** 已按需加载的真实财务/概念数据缓存 */
  private enrichmentCache: Map<string, { roe: number; revenue: number; netProfit: number; grossMargin: number; concepts: string[]; bars: { date: string; close: number }[] }> = new Map();

  /** 行情刷新间隔（真实数据源，默认 5 秒；模拟数据源为 1 秒） */
  private get refreshIntervalMs(): number {
    const value: number = Number(process.env.REFRESH_INTERVAL_MS);
    return Number.isFinite(value) && value >= 1000 ? value : 5000;
  }

  /** 全市场快照刷新间隔（默认 60 秒，避免频繁分页拉取 60 页） */
  private get fullSnapshotIntervalMs(): number {
    const value: number = Number(process.env.FULL_SNAPSHOT_INTERVAL_MS);
    return Number.isFinite(value) && value >= 10000 ? value : 60000;
  }

  /** 股票池上限（默认 8000，真实全 A 约 5900 只） */
  private get universeLimit(): number {
    const value: number = Number(process.env.MAX_STOCKS);
    return Number.isFinite(value) && value >= 100 ? value : MAX_UNIVERSE_SIZE;
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('初始化行情数据服务...');
    this.startTime = Date.now();

    const preferred: string = (process.env.MARKET_DATA_SOURCE ?? 'auto').toLowerCase();
    if (preferred !== 'mock') {
      const ready: boolean = await this.initRealData(preferred);
      if (ready) return;
      this.logger.warn('真实行情源全部不可用，回退到模拟数据引擎（仅用于演示）');
    }
    this.initMockData();
  }

  // ==========================================================
  // 真实行情：初始化（先拉涨停/炸板池让页面立刻有数据，全市场列表后台加载）
  // ==========================================================
  private async initRealData(preferred: string): Promise<boolean> {
    const source: DataSourceKind = this.resolveSource(preferred);
    this.dataSource = source;
    this.logger.log(`行情数据源：${source}（真实行情）`);

    // 先拉涨停/炸板池：一是让页面立刻有数据，二是用它快速判断数据源是否可用
    const poolsReady: boolean = await this.refreshPools();
    if (!poolsReady) {
      const probe: RealQuote[] = await this.provider.fetchQuotes(['600519']);
      if (!probe.length) {
        return false;
      }
      this.logger.warn('涨停/炸板池暂不可用（可能休市），全市场行情源正常，继续以真实行情运行');
      for (const quote of probe) this.applyRealQuote(quote);
    }

    // 全市场约 5900 只、东财每页上限 100 条，后台分页加载，不阻塞服务启动
    void this.loadUniverse();
    this.startRealRefresh();
    return true;
  }

  /** 加载（或刷新）全市场真实行情快照 */
  private async loadUniverse(): Promise<void> {
    if (this.universeLoading) return;
    this.universeLoading = true;
    try {
      const universe: RealQuote[] = await this.provider.fetchAllStocks(this.universeLimit, (msg: string): void => {
        this.logger.log(msg);
      });
      if (!universe.length) {
        this.logger.error('全市场行情列表拉取失败，稍后自动重试');
        return;
      }
      for (const quote of universe) {
        this.applyRealQuote(quote);
      }
      this.universeLoaded = true;
      this.lastFullSnapshotAt = Date.now();
      this.logger.log(`真实行情已就绪，共 ${this.quotes.size} 只股票`);
      this.logMarketCoverage();
    } finally {
      this.universeLoading = false;
    }
  }

  private resolveSource(preferred: string): DataSourceKind {
    if (preferred === 'tencent') return 'tencent';
    if (preferred === 'sina') return 'sina';
    if (preferred === 'eastmoney') return 'eastmoney';
    // auto / 其它值：以东财为主源（内部会自动在 push2 与 push2delay 间切换）
    return 'eastmoney';
  }

  private startRealRefresh(): void {
    if (this.refreshTimer) return;
    this.refreshTimer = setInterval((): void => {
      void this.refreshRealData();
    }, this.refreshIntervalMs);
    this.logger.log(`行情刷新已启动，间隔 ${this.refreshIntervalMs}ms（全市场快照每 ${this.fullSnapshotIntervalMs}ms）`);
  }

  private async refreshRealData(): Promise<void> {
    if (this.refreshing) return;
    this.refreshing = true;
    try {
      await this.refreshPools();
      if (Date.now() - this.lastFullSnapshotAt >= this.fullSnapshotIntervalMs) {
        await this.loadUniverse();
      }
      this.recordMinuteSnap(Date.now());
    } catch (error) {
      this.logger.warn(`行情刷新失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.refreshing = false;
    }
  }

  /** 刷新涨停池 / 炸板池（真实封单额、首末封板时间、连板数、炸板次数） */
  private async refreshPools(): Promise<boolean> {
    const [limitUpPool, brokenPool] = await Promise.all([
      this.provider.fetchLimitUpPool(),
      this.provider.fetchBrokenPool(),
    ]);
    if (!limitUpPool.length && !brokenPool.length) return false;

    // 池子是全量快照，先清空再重建，避免旧的涨停状态残留
    const now: number = Date.now();
    for (const q of this.quotes.values()) {
      q.isLimitUp = false;
      q.status = 'normal';
      q.openCount = 0;
      q.stock.consecutiveDays = 0;
    }

    for (const item of limitUpPool) {
      this.applyLimitUpPoolItem(item, now);
    }
    for (const item of brokenPool) {
      this.applyBrokenPoolItem(item, now);
    }
    this.refreshPoolUniverse(limitUpPool, brokenPool);
    return true;
  }

  /** 涨停池里可能有尚未进入股票池的股票（列表尚未加载完或已剔除），按需补入 */
  private refreshPoolUniverse(limitUpPool: PoolItem[], brokenPool: PoolItem[]): void {
    for (const item of [...limitUpPool, ...brokenPool]) {
      if (this.quotes.has(item.code)) continue;
      const meta: StockMeta = {
        code: item.code,
        name: item.name,
        market: item.market,
        board: item.board,
        isST: item.name.includes('ST'),
        isNew: false,
        limitUpPercent: getPriceLimit(item.board, item.name.includes('ST')).limitUpPercent,
        limitDownPercent: getPriceLimit(item.board, item.name.includes('ST')).limitDownPercent,
        industry: item.industry,
        concept: [item.industry],
        basePrice: item.price,
        marketCap: item.floatMarketCap,
        floatMarketCap: item.floatMarketCap,
        pe: 0,
        pb: 0,
        totalShares: 0,
        floatShares: 0,
        roe: 0,
        revenue: 0,
        netProfit: 0,
        grossMargin: 0,
        consecutiveDays: item.consecutiveDays,
      };
      const quote: RuntimeQuote = this.createQuote(meta, Date.now());
      quote.isLimitUp = true;
      this.quotes.set(item.code, quote);
    }
  }

  private applyLimitUpPoolItem(item: PoolItem, now: number): void {
    const q: RuntimeQuote | undefined = this.quotes.get(item.code);
    if (!q) return;
    q.isLimitUp = true;
    q.isLimitDown = false;
    q.status = item.breakCount > 0 ? 'resealed' : 'sealing';
    q.price = item.price || q.price;
    q.high = Math.max(q.high, item.price);
    q.sealAmount = item.sealAmount;
    q.openCount = item.breakCount;
    q.stock.consecutiveDays = item.consecutiveDays;
    q.stock.industry = item.industry || q.stock.industry;
    q.firstSealTime = this.timeToday(item.firstSealTime, now) ?? q.firstSealTime;
    q.lastSealTime = this.timeToday(item.lastSealTime || item.firstSealTime, now) ?? q.lastSealTime;
    q.timeline = this.buildPoolTimeline(item, q);
    q.timestamp = now;
  }

  private applyBrokenPoolItem(item: PoolItem, now: number): void {
    const q: RuntimeQuote | undefined = this.quotes.get(item.code);
    if (!q) return;
    q.isLimitUp = false;
    q.status = 'broken';
    q.openCount = item.breakCount;
    q.price = item.price || q.price;
    q.stock.consecutiveDays = item.consecutiveDays;
    q.stock.industry = item.industry || q.stock.industry;
    q.firstSealTime = this.timeToday(item.firstSealTime, now) ?? q.firstSealTime;
    q.lastBreakTime = now;
    q.timeline = this.buildPoolTimeline(item, q);
    q.timestamp = now;
  }

  private buildPoolTimeline(item: PoolItem, q: RuntimeQuote): SealEvent[] {
    const timeline: SealEvent[] = [];
    if (item.firstSealTime) {
      timeline.push({ time: item.firstSealTime, type: 'seal', price: item.limitUpPrice || q.price, sealAmount: item.sealAmount });
    }
    for (let i: number = 0; i < item.breakCount; i += 1) {
      timeline.push({ time: item.lastSealTime || item.firstSealTime, type: 'break', price: q.price });
    }
    if (item.lastSealTime && item.breakCount > 0) {
      timeline.push({ time: item.lastSealTime, type: 'reseal', price: item.limitUpPrice || q.price, sealAmount: item.sealAmount });
    }
    return timeline;
  }

  /** "09:25:00" → 当天时间戳 */
  private timeToday(hms: string, now: number): number | null {
    const match = /^(\d{2}):(\d{2}):(\d{2})$/.exec(hms ?? '');
    if (!match) return null;
    const base: Date = new Date(now);
    base.setHours(Number(match[1]), Number(match[2]), Number(match[3]), 0);
    return base.getTime();
  }

  /** 用真实行情覆盖运行时行情（价格、市值、涨跌幅限制、涨跌停状态等） */
  private applyRealQuote(quote: RealQuote): RuntimeQuote {
    let q: RuntimeQuote | undefined = this.quotes.get(quote.code);
    if (!q) {
      q = this.createQuote(RealMarketDataProvider.toStockMeta(quote), Date.now());
      this.quotes.set(quote.code, q);
    }

    const meta: StockMeta = q.stock;
    meta.name = quote.name || meta.name;
    meta.market = quote.market;
    meta.board = quote.board;
    meta.isST = quote.isST;
    meta.isNew = quote.isNew;
    meta.limitUpPercent = quote.limitUpPercent;
    meta.limitDownPercent = quote.limitDownPercent;
    if (quote.industry && quote.industry !== '未分类') {
      meta.industry = quote.industry;
      if (!meta.concept.includes(quote.industry)) meta.concept = [quote.industry, ...meta.concept];
    }
    if (quote.marketCap > 0) meta.marketCap = quote.marketCap;
    if (quote.floatMarketCap > 0) meta.floatMarketCap = quote.floatMarketCap;
    if (quote.price > 0 && meta.totalShares > 0) meta.totalShares = quote.marketCap / quote.price;
    if (quote.price > 0 && meta.floatShares > 0) meta.floatShares = quote.floatMarketCap / quote.price;
    if (quote.pe) meta.pe = quote.pe;
    if (quote.pb) meta.pb = quote.pb;

    q.price = quote.price || q.price;
    q.prevClose = quote.prevClose || q.prevClose;
    q.open = quote.open || q.open;
    q.high = quote.high || q.high;
    q.low = quote.low || q.low;
    q.volume = quote.volume;
    q.amount = quote.amount;
    if (quote.bid1Price) q.bid1Price = quote.bid1Price;
    if (quote.ask1Price) q.ask1Price = quote.ask1Price;
    q.timestamp = quote.timestamp || Date.now();
    q.lastRealUpdate = q.timestamp;
    q.realSpeed = quote.speed;
    q.realTurnover = quote.turnover;
    if (quote.marketCap > 0) q.realMarketCap = quote.marketCap;
    if (quote.floatMarketCap > 0) q.realFloatMarketCap = quote.floatMarketCap;

    // 涨跌停判定（用交易所实际涨跌幅）；prevClose 为 0 时（停牌/无数据）不判定，避免误标涨停
    if (q.prevClose > 0) {
      const limitUpPrice: number = roundPrice(q.prevClose * (1 + meta.limitUpPercent));
      const limitDownPrice: number = roundPrice(q.prevClose * (1 - meta.limitDownPercent));
      if (!q.isLimitUp && q.price >= limitUpPrice - 0.001) {
        q.isLimitUp = true;
        q.status = 'sealing';
        if (q.firstSealTime === null) q.firstSealTime = q.timestamp;
        if (q.lastSealTime === null) q.lastSealTime = q.timestamp;
        q.isOneWordLimitUp = q.open >= limitUpPrice - 0.001;
      } else if (!q.isLimitUp) {
        q.isLimitUp = false;
        if (q.status !== 'broken') q.status = 'normal';
      }
      q.isLimitDown = q.price <= limitDownPrice + 0.001;
    }

    const minute: number = Math.floor(q.timestamp / MINUTE_MS);
    const lastSnap: { time: number; price: number } | undefined = q.priceHistory[q.priceHistory.length - 1];
    if (!lastSnap || Math.floor(lastSnap.time / MINUTE_MS) !== minute) {
      q.priceHistory.push({ time: q.timestamp, price: q.price });
      if (q.priceHistory.length > 240) q.priceHistory.shift();
    }
    return q;
  }

  private logMarketCoverage(): void {
    const coverage: MarketCoverage = this.getMarketCoverage();
    for (const item of coverage.boards) {
      this.logger.log(`  ${item.label}：${item.count} 只（示例 ${item.sampleCodes.slice(0, 3).join('、')}）`);
    }
  }

  // ==========================================================
  // 模拟行情（兜底，仅当真实源全部不可用或显式配置 mock 时使用）
  // ==========================================================
  private initMockData(): void {
    const stocks: MockStock[] = generateMockStocks();
    const now: number = Date.now();

    for (const stock of stocks) {
      this.quotes.set(stock.code, this.createQuote(stock, now));
    }

    this.seedInitialLimitUps();
    this.startMockTick();
    this.logger.warn(`已启用模拟数据引擎（非真实行情），共 ${this.quotes.size} 只股票`);
    this.logMarketCoverage();
  }

  private startMockTick(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval((): void => {
      this.tick();
    }, 1000);
  }

  /** 由静态股票信息创建运行时行情（批量初始化与「按需纳入监控」共用） */
  private createQuote(stock: MockStock, now: number = Date.now()): RuntimeQuote {
    const prevClose: number = roundPrice(stock.basePrice * (1 + (Math.random() - 0.5) * 0.02));
    const open: number = roundPrice(prevClose * (1 + (Math.random() - 0.5) * 0.015));
    const price: number = open;

    return {
      stock,
      price,
      prevClose,
      open,
      high: Math.max(open, price),
      low: Math.min(open, price),
      volume: Math.floor(Math.random() * 10000),
      amount: Math.floor(Math.random() * 1e7),
      bid1Price: roundPrice(price - 0.01),
      bid1Volume: Math.floor(Math.random() * 500),
      ask1Price: roundPrice(price + 0.01),
      ask1Volume: Math.floor(Math.random() * 500),
      isLimitUp: false,
      isLimitDown: false,
      isOneWordLimitUp: false,
      firstSealTime: null,
      lastSealTime: null,
      firstBreakTime: null,
      lastBreakTime: null,
      openCount: 0,
      sealAmount: 0,
      status: 'normal',
      timeline: [],
      priceHistory: [{ time: now, price }],
      lastMinuteSnap: [],
      timestamp: now,
      momentumPhase: 'none',
      momentumRemaining: 0,
      realSpeed: 0,
      realTurnover: 0,
      realMarketCap: 0,
      realFloatMarketCap: 0,
      lastRealUpdate: 0,
    };
  }

  private seedInitialLimitUps(): void {
    const allStocks: RuntimeQuote[] = Array.from(this.quotes.values());
    const candidates: RuntimeQuote[] = allStocks.filter(
      (q: RuntimeQuote): boolean => q.stock.consecutiveDays > 0,
    );
    const numSeeds: number = Math.min(15, Math.max(5, Math.floor(allStocks.length * 0.03)));
    const shuffled: RuntimeQuote[] = [...candidates].sort((): number => Math.random() - 0.5);

    for (let i: number = 0; i < Math.min(numSeeds, shuffled.length); i += 1) {
      const q: RuntimeQuote = shuffled[i];
      const limitUpPrice: number = roundPrice(q.prevClose * (1 + q.stock.limitUpPercent));
      q.price = limitUpPrice;
      q.high = limitUpPrice;
      q.isLimitUp = true;
      q.isOneWordLimitUp = q.open >= limitUpPrice - 0.001;
      q.status = 'sealing';
      q.sealAmount = q.stock.floatMarketCap * (0.005 + Math.random() * 0.03);
      q.firstSealTime = this.startTime - Math.floor(Math.random() * 30 * MINUTE_MS);
      q.lastSealTime = q.firstSealTime;
      q.timeline.push({
        time: formatTime(q.firstSealTime),
        type: 'seal',
        price: limitUpPrice,
        sealAmount: q.sealAmount,
      });
    }
  }

  private startTick(): void {
    this.tickInterval = setInterval((): void => {
      this.tick();
    }, 1000);
  }

  private tick(): void {
    const now: number = Date.now();

    for (const quote of this.quotes.values()) {
      this.updateQuote(quote, now);
    }

    this.recordMinuteSnap(now);
  }

  private updateQuote(q: RuntimeQuote, now: number): void {
    const stock: MockStock = q.stock;
    const limitUpPrice: number = roundPrice(q.prevClose * (1 + stock.limitUpPercent));
    const limitDownPrice: number = roundPrice(q.prevClose * (1 - stock.limitDownPercent));

    // 动量调整
    if (q.momentumRemaining <= 0) {
      if (Math.random() < 0.02) {
        q.momentumPhase = Math.random() < 0.5 ? 'surging' : 'plunging';
        q.momentumRemaining = 5 + Math.floor(Math.random() * 15);
      }
    } else {
      q.momentumRemaining -= 1;
      if (q.momentumRemaining <= 0) {
        q.momentumPhase = 'none';
      }
    }

    let changeRate: number = 0;

    if (q.isLimitUp && q.status === 'sealing') {
      // 涨停中：判断是否炸板
      const breakProb: number = 0.005 + (1 - q.sealAmount / q.stock.floatMarketCap) * 0.05;
      if (Math.random() < Math.min(breakProb, 0.03)) {
        this.triggerBreak(q, now, limitUpPrice);
        changeRate = -stock.limitUpPercent * 0.3 * Math.random();
      } else {
        // 封单波动
        q.sealAmount *= 0.99 + Math.random() * 0.02;
        q.price = limitUpPrice;
        q.bid1Price = limitUpPrice;
        q.bid1Volume = Math.floor(q.sealAmount / limitUpPrice / 100);
        q.ask1Price = limitUpPrice;
        q.ask1Volume = 0;
      }
    } else if (q.isLimitDown) {
      // 跌停：暂时不打开
      q.price = limitDownPrice;
      q.bid1Price = limitDownPrice;
      q.bid1Volume = 0;
      q.ask1Price = limitDownPrice;
    } else {
      // 正常波动
      const baseVolatility: number = 0.003;
      let volatility: number = baseVolatility;

      if (q.momentumPhase === 'surging') {
        volatility = baseVolatility * 2;
        changeRate = volatility * (0.5 + Math.random() * 0.5);
      } else if (q.momentumPhase === 'plunging') {
        volatility = baseVolatility * 2;
        changeRate = -volatility * (0.5 + Math.random() * 0.5);
      } else {
        changeRate = (Math.random() - 0.5) * volatility;
      }

      // 连板股有上冲动量
      if (stock.consecutiveDays > 0 && Math.random() < 0.05) {
        changeRate += stock.limitUpPercent * 0.1;
      }

      let newPrice: number = q.price * (1 + changeRate);
      newPrice = Math.min(newPrice, limitUpPrice);
      newPrice = Math.max(newPrice, limitDownPrice);
      newPrice = roundPrice(newPrice);
      q.price = newPrice;

      if (newPrice >= q.high) q.high = newPrice;
      if (newPrice <= q.low) q.low = newPrice;

      q.bid1Price = roundPrice(newPrice - 0.01);
      q.bid1Volume = Math.floor(Math.random() * 500 + 50);
      q.ask1Price = roundPrice(newPrice + 0.01);
      q.ask1Volume = Math.floor(Math.random() * 500 + 50);

      // 判断是否涨停
      if (newPrice >= limitUpPrice - 0.001 && q.status !== 'sealing' && q.status !== 'resealed') {
        this.triggerSeal(q, now, limitUpPrice);
      }

      // 判断是否跌停
      if (newPrice <= limitDownPrice + 0.001) {
        q.isLimitDown = true;
      }
    }

    // 更新成交量额
    const volumeDelta: number = Math.floor(100 + Math.random() * 5000);
    q.volume += volumeDelta;
    q.amount += volumeDelta * 100 * q.price;
    q.timestamp = now;

    // 价格历史
    q.priceHistory.push({ time: now, price: q.price });
    if (q.priceHistory.length > 120) {
      q.priceHistory.shift();
    }
  }

  private triggerSeal(q: RuntimeQuote, now: number, limitUpPrice: number): void {
    const sealProb: number = q.stock.consecutiveDays > 0 ? 0.7 : 0.3;
    if (Math.random() > sealProb) return;

    q.isLimitUp = true;
    q.status = q.openCount > 0 ? 'resealed' : 'sealing';
    q.sealAmount = q.stock.floatMarketCap * (0.003 + Math.random() * 0.025);
    q.price = limitUpPrice;
    q.high = limitUpPrice;
    q.bid1Price = limitUpPrice;
    q.bid1Volume = Math.floor(q.sealAmount / limitUpPrice / 100);
    q.ask1Volume = 0;
    q.lastSealTime = now;

    if (q.firstSealTime === null) {
      q.firstSealTime = now;
    }

    const eventType: 'seal' | 'reseal' = q.openCount > 0 ? 'reseal' : 'seal';
    q.timeline.push({
      time: formatTime(now),
      type: eventType,
      price: limitUpPrice,
      sealAmount: q.sealAmount,
    });

    // 一字板判定
    q.isOneWordLimitUp = q.open >= limitUpPrice - 0.001 && q.low >= limitUpPrice - 0.001;

    // 回封后状态更新
    if (q.openCount > 0) {
      q.status = 'resealed';
    }
  }

  private triggerBreak(q: RuntimeQuote, now: number, limitUpPrice: number): void {
    if (!q.isLimitUp) return;

    q.isLimitUp = false;
    q.openCount += 1;
    q.status = 'broken';
    q.lastBreakTime = now;

    if (q.firstBreakTime === null) {
      q.firstBreakTime = now;
    }

    q.price = roundPrice(limitUpPrice * (1 - 0.01 - Math.random() * 0.02));
    q.sealAmount = 0;
    q.bid1Volume = Math.floor(Math.random() * 300);

    q.timeline.push({
      time: formatTime(now),
      type: 'break',
      price: q.price,
    });
  }

  private recordMinuteSnap(now: number): void {
    const currentMinute: number = Math.floor(now / MINUTE_MS);

    for (const q of this.quotes.values()) {
      const lastSnap: { time: number; price: number } | undefined = q.lastMinuteSnap[q.lastMinuteSnap.length - 1];
      const lastMinute: number = lastSnap ? Math.floor(lastSnap.time / MINUTE_MS) : -1;

      if (currentMinute !== lastMinute) {
        q.lastMinuteSnap.push({ time: now, price: q.price });
        if (q.lastMinuteSnap.length > HISTORY_MINUTES + 1) {
          q.lastMinuteSnap.shift();
        }
      }
    }
  }

  private toStockQuote(q: RuntimeQuote): StockQuote {
    const stock: MockStock = q.stock;
    const change: number = roundPrice(q.price - q.prevClose);
    // 停牌/无昨收数据（prevClose=0）时不做涨跌幅计算，避免 NaN
    const changePercent: number = q.prevClose > 0 ? roundPrice((change / q.prevClose) * 100) : 0;
    const limitUpPrice: number = roundPrice(q.prevClose * (1 + stock.limitUpPercent));
    const limitDownPrice: number = roundPrice(q.prevClose * (1 - stock.limitDownPercent));
    // 换手率/PE/PB 优先用行情源提供的真实值，取不到时才按股本推算
    const derivedTurnover: number = stock.floatShares > 0
      ? roundPrice((q.volume * 100 / stock.floatShares) * 100)
      : 0;
    const turnover: number = q.realTurnover > 0 ? roundPrice(q.realTurnover) : derivedTurnover;
    const derivedPe: number = stock.netProfit > 0
      ? roundPrice((q.price * stock.totalShares) / stock.netProfit)
      : 0;
    const derivedPb: number = stock.basePrice > 0 && stock.pb > 0
      ? roundPrice((q.price / stock.basePrice) * stock.pb)
      : 0;

    return {
      code: stock.code,
      name: stock.name,
      // 板块/交易所信息必须回传：前端按此显示 沪市主板/深市主板/创业板/科创板/北交所
      market: stock.market,
      board: stock.board,
      isST: stock.isST,
      isNew: stock.isNew,
      limitUpPercent: stock.limitUpPercent,
      limitDownPercent: stock.limitDownPercent,
      price: q.price,
      prevClose: q.prevClose,
      open: q.open,
      high: q.high,
      low: q.low,
      change,
      changePercent,
      volume: q.volume,
      amount: Math.floor(q.amount),
      turnover,
      limitUpPrice,
      limitDownPrice,
      bid1Price: q.bid1Price,
      bid1Volume: q.bid1Volume,
      ask1Price: q.ask1Price,
      ask1Volume: q.ask1Volume,
      marketCap: Math.floor(q.realMarketCap > 0 ? q.realMarketCap : q.price * stock.totalShares),
      floatMarketCap: Math.floor(q.realFloatMarketCap > 0 ? q.realFloatMarketCap : q.price * stock.floatShares),
      pe: stock.pe > 0 ? roundPrice(stock.pe) : derivedPe,
      pb: stock.pb > 0 ? roundPrice(stock.pb) : derivedPb,
      industry: stock.industry,
      concept: [...stock.concept],
      isLimitUp: q.isLimitUp,
      isLimitDown: q.isLimitDown,
      isOneWordLimitUp: q.isOneWordLimitUp,
      timestamp: q.timestamp,
    };
  }

  /**
   * 取行情：优先用已加载的真实行情；不在池内时按需向真实数据源请求，
   * 只要代码属于沪深主板/创业板/科创板/北交所任一板块就纳入监控（不遗漏任何 A 股）。
   * 显式配置 MARKET_DATA_SOURCE=mock 时退化为本地生成。
   */
  private async ensureQuoteAsync(codeInput: string): Promise<RuntimeQuote> {
    const code: string | null = normalizeStockCode(codeInput);
    if (!code) {
      throw new NotFoundException(`股票代码不合法：${codeInput}`);
    }

    const cached: RuntimeQuote | undefined = this.quotes.get(code);
    if (cached && (this.dataSource === 'mock' || Date.now() - cached.lastRealUpdate < this.fullSnapshotIntervalMs)) {
      return cached;
    }
    if (!classifyAShareCode(code)) {
      throw new NotFoundException(`股票 ${code} 不是交易所 A 股（仅支持沪深主板/创业板/科创板/北交所）`);
    }

    if (this.dataSource === 'mock') {
      if (this.quotes.size >= this.universeLimit) {
        throw new NotFoundException(`监控股票数已达上限 ${this.universeLimit}，无法再纳入 ${code}`);
      }
      const stock: MockStock = buildMockStockForCode(code);
      const quote: RuntimeQuote = this.createQuote(stock);
      this.quotes.set(stock.code, quote);
      return quote;
    }

    // 真实行情模式：单只详情 → 批量行情 → 失败即视为不存在
    const detail: RealQuote | null = await this.provider.fetchStockDetail(code);
    if (detail) return this.applyRealQuote(detail);
    const [fallback] = await this.provider.fetchQuotes([code]);
    if (fallback) return this.applyRealQuote(fallback);
    throw new NotFoundException(`未获取到 ${code} 的真实行情（代码不存在或行情源暂不可用）`);
  }

  /** 换手率：优先使用行情源真实值，缺失时按流通股本推算 */
  private quoteTurnover(q: RuntimeQuote): number {
    if (q.realTurnover > 0) return roundPrice(q.realTurnover);
    return q.stock.floatShares > 0
      ? roundPrice((q.volume * 100 / q.stock.floatShares) * 100)
      : 0;
  }

  /** 流通市值：优先使用行情源真实值 */
  private quoteFloatMarketCap(q: RuntimeQuote): number {
    return Math.floor(q.realFloatMarketCap > 0 ? q.realFloatMarketCap : q.price * q.stock.floatShares);
  }

  /** 总市值：优先使用行情源真实值 */
  private quoteMarketCap(q: RuntimeQuote): number {
    return Math.floor(q.realMarketCap > 0 ? q.realMarketCap : q.price * q.stock.totalShares);
  }

  async getQuote(code: string): Promise<StockQuote> {
    return this.toStockQuote(await this.ensureQuoteAsync(code));
  }

  async getBatchQuotes(codes: string[]): Promise<StockQuote[]> {
    const result: StockQuote[] = [];
    for (const code of codes) {
      try {
        result.push(this.toStockQuote(await this.ensureQuoteAsync(code)));
      } catch {
        // 非法代码或行情源无该标的时跳过，不影响其它股票
      }
    }
    return result;
  }

  /** 按需加载真实财务/概念/日K并写入缓存（个股研究、多股对比使用） */
  private async enrichReal(code: string): Promise<void> {
    if (this.dataSource === 'mock' || this.enrichmentCache.has(code)) return;
    const q: RuntimeQuote | undefined = this.quotes.get(code);
    if (!q) return;

    const [financials, concepts, bars] = await Promise.all([
      this.provider.fetchFinancials(code),
      this.provider.fetchConcepts(code),
      this.provider.fetchDailyBars(code, 250),
    ]);

    const entry = {
      roe: financials?.roe ?? 0,
      revenue: financials?.revenue ?? 0,
      netProfit: financials?.netProfit ?? 0,
      grossMargin: financials?.grossMargin ?? 0,
      concepts: concepts,
      bars: bars.map((bar): { date: string; close: number } => ({ date: bar.date, close: bar.close })),
    };
    this.enrichmentCache.set(code, entry);

    // 真实财务与概念回填到运行时元信息，选股/研究/对比都随即可用
    if (entry.revenue > 0) q.stock.revenue = entry.revenue;
    if (entry.netProfit !== 0) q.stock.netProfit = entry.netProfit;
    if (entry.roe !== 0) q.stock.roe = entry.roe;
    if (entry.grossMargin > 0) q.stock.grossMargin = entry.grossMargin / 100;
    if (financials?.industry && financials.industry !== q.stock.industry) {
      q.stock.industry = financials.industry;
    }
    if (entry.concepts.length) {
      q.stock.concept = Array.from(new Set([...entry.concepts, q.stock.industry])).slice(0, 12);
    }
  }

  /** 监控覆盖度：各交易所板块的股票数量与示例代码 */
  getMarketCoverage(): MarketCoverage {
    const groups: Map<string, { market: Market; board: Board; codes: string[] }> = new Map();

    for (const q of this.quotes.values()) {
      const key: string = `${q.stock.market}:${q.stock.board}`;
      const group = groups.get(key);
      if (group) {
        group.codes.push(q.stock.code);
      } else {
        groups.set(key, { market: q.stock.market, board: q.stock.board, codes: [q.stock.code] });
      }
    }

    const boards: BoardCoverage[] = [];
    for (const group of groups.values()) {
      group.codes.sort();
      boards.push({
        market: group.market,
        board: group.board,
        label: boardFullLabel(group.market, group.board),
        count: group.codes.length,
        sampleCodes: group.codes.slice(0, 8),
      });
    }

    // 固定顺序：沪市主板 → 深市主板 → 创业板 → 科创板 → 北交所
    boards.sort((a: BoardCoverage, b: BoardCoverage): number => {
      if (a.board !== b.board) {
        return BOARD_ORDER.indexOf(a.board) - BOARD_ORDER.indexOf(b.board);
      }
      return a.market === 'sh' ? -1 : 1;
    });

    return {
      total: this.quotes.size,
      updatedAt: Date.now(),
      boards,
    };
  }

  getSurgeBoard(
    windowMinutes: number = 5,
    threshold: number = 0.5,
    sector?: string,
    excludeST: boolean = true,
    limit: number = 50,
  ): SurgeItem[] {
    const items: SurgeItem[] = [];

    for (const q of this.quotes.values()) {
      if (excludeST && q.stock.isST) continue;
      if (sector && q.stock.industry !== sector) continue;

      // 优先用服务自身累计的分钟样本（与所选窗口一致）；
      // 刚启动样本不足时回落到行情源提供的 5 分钟涨速（东财 f22），保证涨速榜开箱即有数据。
      const snaps: { time: number; price: number }[] = q.lastMinuteSnap;
      let surgePercent: number = 0;
      let window: number = windowMinutes;
      let refPrice: number = 0;

      if (snaps.length >= windowMinutes + 1) {
        const refIdx: number = snaps.length - windowMinutes - 1;
        refPrice = snaps[refIdx]?.price ?? q.price;
        if (refPrice <= 0) continue;
        surgePercent = roundPrice(((q.price - refPrice) / refPrice) * 100 / windowMinutes * 100) / 100;
      } else if (q.realSpeed !== 0) {
        surgePercent = roundPrice(q.realSpeed);
        window = 5;
        refPrice = q.prevClose;
      } else {
        continue;
      }

      if (surgePercent < threshold) continue;

      const change: number = q.price - q.prevClose;
      const changePercent: number = roundPrice((change / q.prevClose) * 100);

      items.push({
        code: q.stock.code,
        name: q.stock.name,
        market: q.stock.market,
        board: q.stock.board,
        price: q.price,
        surgePercent,
        changePercent,
        windowMinutes: window,
        referencePrice: refPrice,
        amount: Math.floor(q.amount),
        turnover: this.quoteTurnover(q),
        industry: q.stock.industry,
        isST: q.stock.isST,
        isOneWordLimitUp: q.isOneWordLimitUp,
        rank: 0,
      });
    }

    items.sort((a: SurgeItem, b: SurgeItem): number => b.surgePercent - a.surgePercent);
    const topItems: SurgeItem[] = items.slice(0, limit);
    topItems.forEach((item: SurgeItem, idx: number): void => {
      item.rank = idx + 1;
    });

    return topItems;
  }

  getLimitUpStocks(): LimitUpStock[] {
    const result: LimitUpStock[] = [];

    for (const q of this.quotes.values()) {
      if (!q.isLimitUp && q.status !== 'sealing' && q.status !== 'resealed') continue;

      const limitUpPrice: number = roundPrice(q.prevClose * (1 + q.stock.limitUpPercent));
      const changePercent: number = roundPrice(((q.price - q.prevClose) / q.prevClose) * 100);
      const sealFloatRatio: number = roundPrice((q.sealAmount / q.stock.floatMarketCap) * 100);

      let sealStrength: 'strong' | 'medium' | 'weak' = 'weak';
      if (sealFloatRatio >= 2) sealStrength = 'strong';
      else if (sealFloatRatio >= 0.5) sealStrength = 'medium';

      const status: 'sealing' | 'broken' | 'resealed' =
        q.status === 'resealed' ? 'resealed' : 'sealing';

      const reason: string[] = this.generateLimitUpReasons(q);
      const amount: number = Math.floor(q.amount);
      const sealToAmountRatio: number = amount > 0
        ? roundPrice((q.sealAmount / amount) * 100)
        : 0;

      const isLateSeal: boolean = q.lastSealTime !== null
        ? this.isLateSealTime(q.lastSealTime)
        : false;

      const sealReasonText: string = this.generateSealReasonText(reason);

      result.push({
        code: q.stock.code,
        name: q.stock.name,
        market: q.stock.market,
        board: q.stock.board,
        price: q.price,
        limitUpPrice,
        changePercent,
        firstSealTime: q.firstSealTime ? formatTime(q.firstSealTime) : '',
        lastSealTime: q.lastSealTime ? formatTime(q.lastSealTime) : '',
        openCount: q.openCount,
        consecutiveDays: q.stock.consecutiveDays,
        sealAmount: Math.floor(q.sealAmount),
        sealFloatRatio,
        amount,
        turnover: this.quoteTurnover(q),
        reason,
        industry: q.stock.industry,
        floatMarketCap: this.quoteFloatMarketCap(q),
        status,
        sealStrength,
        isST: q.stock.isST,
        timeline: [...q.timeline],
        sealToAmountRatio,
        isLateSeal,
        sealReasonText,
      });
    }

    result.sort((a: LimitUpStock, b: LimitUpStock): number => {
      if (a.consecutiveDays !== b.consecutiveDays) return b.consecutiveDays - a.consecutiveDays;
      return b.sealFloatRatio - a.sealFloatRatio;
    });

    return result;
  }

  private isLateSealTime(ts: number): boolean {
    const d: Date = new Date(ts);
    const minutes: number = d.getHours() * 60 + d.getMinutes();
    return minutes >= 890;
  }

  private generateSealReasonText(reasons: string[]): string {
    if (reasons.length === 0) return '受题材驱动，今日涨停。';
    if (reasons.length === 1) return `受${reasons[0]}题材驱动，今日涨停。`;
    const text: string = `受${reasons[0]}和${reasons[1]}题材驱动，今日涨停。`;
    if (text.length > 50) {
      const short1: string = reasons[0].slice(0, 6);
      const short2: string = reasons[1].slice(0, 6);
      return `受${short1}和${short2}题材驱动，今日涨停。`;
    }
    return text;
  }

  private generateLimitUpReasons(q: RuntimeQuote): string[] {
    const reasons: string[] = [];
    const concepts: string[] = q.stock.concept;

    if (concepts.some((c: string): boolean => c.includes('AI') || c.includes('人工智能') || c.includes('大模型'))) {
      reasons.push('AI概念');
    }
    if (concepts.some((c: string): boolean => c.includes('新能源') || c.includes('光伏') || c.includes('储能'))) {
      reasons.push('新能源');
    }
    if (concepts.some((c: string): boolean => c.includes('芯片') || c.includes('半导体') || c.includes('国产替代'))) {
      reasons.push('国产芯片');
    }
    if (concepts.some((c: string): boolean => c.includes('机器人') || c.includes('智能制造'))) {
      reasons.push('机器人概念');
    }
    if (q.stock.consecutiveDays >= 3) {
      reasons.push('连板龙头');
    }
    if (q.isOneWordLimitUp) {
      reasons.push('一字涨停');
    }
    if (reasons.length === 0) {
      reasons.push(concepts[0] ?? '题材驱动');
    }

    return reasons.slice(0, 3);
  }

  getLimitBrokenStocks(): LimitBrokenStock[] {
    const result: LimitBrokenStock[] = [];

    for (const q of this.quotes.values()) {
      if (q.openCount === 0 && q.status !== 'broken') continue;
      if (q.status === 'sealing' && q.openCount === 0) continue;

      const limitUpPrice: number = roundPrice(q.prevClose * (1 + q.stock.limitUpPercent));
      const changePercent: number = roundPrice(((q.price - q.prevClose) / q.prevClose) * 100);
      const priceDiffFromLimit: number = roundPrice(((q.price - limitUpPrice) / limitUpPrice) * 100);

      let currentStatus: 'sealing' | 'broken' | 'resealed' = 'broken';
      if (q.status === 'sealing') currentStatus = 'sealing';
      if (q.status === 'resealed') currentStatus = 'resealed';

      result.push({
        code: q.stock.code,
        name: q.stock.name,
        market: q.stock.market,
        board: q.stock.board,
        price: q.price,
        limitUpPrice,
        changePercent,
        breakCount: q.openCount,
        currentStatus,
        firstSealTime: q.firstSealTime ? formatTime(q.firstSealTime) : '',
        firstBreakTime: q.firstBreakTime ? formatTime(q.firstBreakTime) : '',
        lastBreakTime: q.lastBreakTime ? formatTime(q.lastBreakTime) : '',
        sealAmountBeforeBreak: Math.floor(q.sealAmount),
        priceDiffFromLimit,
        amount: Math.floor(q.amount),
        turnover: this.quoteTurnover(q),
        industry: q.stock.industry,
        isInWatchlist: false,
        timeline: [...q.timeline],
      });
    }

    result.sort((a: LimitBrokenStock, b: LimitBrokenStock): number => b.breakCount - a.breakCount);
    return result;
  }

  getMarketSentiment(): MarketSentiment {
    let limitUpCount: number = 0;
    let limitDownCount: number = 0;
    let stLimitUpCount: number = 0;
    let maxConsecutive: number = 0;
    let sealTotal: number = 0;
    let brokenTotal: number = 0;

    for (const q of this.quotes.values()) {
      if (q.isLimitUp || q.status === 'sealing' || q.status === 'resealed') {
        limitUpCount += 1;
        sealTotal += 1;
        if (q.stock.isST) stLimitUpCount += 1;
        if (q.stock.consecutiveDays > maxConsecutive) {
          maxConsecutive = q.stock.consecutiveDays;
        }
      }
      if (q.isLimitDown) {
        limitDownCount += 1;
      }
      if (q.status === 'broken') {
        brokenTotal += 1;
      }
    }

    const totalAttempts: number = sealTotal + brokenTotal;
    const brokenRate: number = totalAttempts > 0 ? roundPrice((brokenTotal / totalAttempts) * 100) : 0;
    const sealRate: number = totalAttempts > 0 ? roundPrice((sealTotal / totalAttempts) * 100) : 100;
    // 真实行情下用「连板股（≥2 连板）占涨停家数比例」近似晋级率；模拟数据保持演示值
    let promotionRate: number = roundPrice(60 + Math.random() * 20);
    if (this.dataSource !== 'mock') {
      let multiBoard: number = 0;
      for (const q of this.quotes.values()) {
        if (q.stock.consecutiveDays >= 2) multiBoard += 1;
      }
      promotionRate = limitUpCount > 0 ? roundPrice((multiBoard / limitUpCount) * 100) : 0;
    }

    return {
      limitUpCount,
      limitDownCount,
      brokenCount: brokenTotal,
      brokenRate,
      sealRate,
      maxConsecutive,
      promotionRate,
      stLimitUpCount,
    };
  }

  getSectors(): SectorInfo[] {
    const sectorMap: Map<string, { changeSum: number; count: number; amount: number; leader: string; leaderChange: number }> = new Map();

    for (const q of this.quotes.values()) {
      const industry: string = q.stock.industry;
      const changePercent: number = (q.price - q.prevClose) / q.prevClose * 100;

      if (!sectorMap.has(industry)) {
        sectorMap.set(industry, {
          changeSum: 0,
          count: 0,
          amount: 0,
          leader: q.stock.name,
          leaderChange: -Infinity,
        });
      }

      const sector = sectorMap.get(industry)!;
      sector.changeSum += changePercent;
      sector.count += 1;
      sector.amount += q.amount;

      if (changePercent > sector.leaderChange) {
        sector.leaderChange = changePercent;
        sector.leader = q.stock.name;
      }
    }

    const result: SectorInfo[] = [];
    let idx: number = 0;
    for (const [name, data] of sectorMap.entries()) {
      idx += 1;
      result.push({
        code: 'SEC' + String(idx).padStart(3, '0'),
        name,
        changePercent: roundPrice(data.changeSum / data.count),
        leaderStock: data.leader,
        amount: Math.floor(data.amount),
      });
    }

    result.sort((a: SectorInfo, b: SectorInfo): number => b.changePercent - a.changePercent);
    return result;
  }

  async getResearch(code: string): Promise<StockResearch> {
    const q: RuntimeQuote = await this.ensureQuoteAsync(code);
    await this.enrichReal(q.stock.code);

    const stock: MockStock = q.stock;
    const quote: StockQuote = this.toStockQuote(q);
    const nowIso: string = new Date().toISOString().slice(0, 10);

    const overview: StockOverview = {
      companyInfo: {
        fullName: stock.name + '股份有限公司',
        shortName: stock.name,
        code: stock.code,
        listingDate: '2015-06-15',
        exchange: MARKET_LABELS[stock.market],
        industry: stock.industry,
        mainBusiness: `${stock.industry}相关产品的研发、生产与销售，核心产品覆盖${stock.concept.slice(0, 2).join('、')}等领域。`,
      },
      latestQuote: {
        price: quote.price,
        changePercent: quote.changePercent,
        marketCap: quote.marketCap,
        floatMarketCap: quote.floatMarketCap,
        pe: quote.pe,
        pb: quote.pb,
        turnover: quote.turnover,
        amount: quote.amount,
      },
      coreFinancial: {
        revenue: Math.floor(stock.revenue),
        revenueGrowth: roundPrice(5 + Math.random() * 25),
        netProfit: Math.floor(stock.netProfit),
        netProfitGrowth: roundPrice(-5 + Math.random() * 40),
        roe: stock.roe,
        roa: roundPrice(stock.roe * 0.4),
        grossMargin: roundPrice(stock.grossMargin * 100),
        netMargin: roundPrice((stock.netProfit / stock.revenue) * 100),
        debtRatio: roundPrice(20 + Math.random() * 40),
      },
      valuation: {
        pe: quote.pe,
        pePercentile: roundPrice(20 + Math.random() * 60),
        pb: quote.pb,
        pbPercentile: roundPrice(20 + Math.random() * 60),
        ps: roundPrice(quote.marketCap / stock.revenue),
        dividendYield: roundPrice(0.5 + Math.random() * 3),
      },
      riskTags: this.generateRiskTags(stock),
    };

    const deepReport: DeepReport = this.generateDeepReport(stock, nowIso);

    return {
      code: stock.code,
      name: stock.name,
      overview,
      deepReport,
    };
  }

  private generateRiskTags(stock: MockStock): string[] {
    const tags: string[] = [];
    if (stock.isST) tags.push('ST风险');
    if (stock.pe < 0) tags.push('亏损');
    if (stock.pb < 1) tags.push('破净');
    if (stock.consecutiveDays > 3) tags.push('高位连板');
    if (tags.length === 0) tags.push('暂无显著风险');
    return tags;
  }

  private generateDeepReport(stock: MockStock, date: string): DeepReport {
    const industry: string = stock.industry;
    const concepts: string = stock.concept.slice(0, 3).join('、');

    const makeSection = (title: string, content: string, n: number = 3): ReportSection => {
      const evidence: EvidenceItem[] = [];
      for (let i: number = 0; i < n; i += 1) {
        evidence.push({
          content: `${stock.name}在${industry}领域的第${i + 1}项关键证据：${concepts}方向业务布局持续推进，市场份额稳步提升。`,
          level: i === 0 ? 'primary' : i === 1 ? 'structured' : 'secondary',
          source: i === 0 ? '公司年报' : i === 1 ? '行业研报' : '公开信息整理',
          date,
        });
      }
      return { title, content, evidence };
    };

    return {
      businessModel: makeSection(
        '商业模式分析',
        `${stock.name}作为${industry}行业的核心参与者，采用"研发驱动+渠道深耕"的双轮驱动模式。公司在${concepts}等领域构建了完整的产品矩阵，客户覆盖行业头部企业，护城河体现在技术积累、客户粘性和规模效应三重维度。`,
      ),
      competitiveAdvantage: makeSection(
        '竞争优势拆解',
        `公司核心竞争壁垒在于：1) 技术壁垒：${industry}领域核心专利数量行业领先；2) 客户壁垒：与下游核心客户深度绑定，替换成本高；3) 规模壁垒：产能规模行业第一，单位成本具备显著优势。综合毛利率${roundPrice(stock.grossMargin * 100)}%，高于行业平均水平。`,
      ),
      financialQuality: makeSection(
        '财务质量评估',
        `公司ROE约${stock.roe.toFixed(1)}%，处于行业中上水平。营收增速稳健，净利润率具备提升空间。资产负债率适中，现金流状况良好。需关注应收账款周转和存货减值风险。`,
      ),
      valuationFramework: makeSection(
        '估值框架分析',
        `当前PE(TTM)约${stock.pe.toFixed(1)}倍，处于历史${roundPrice(20 + Math.random() * 60)}%分位。对比${industry}行业可比公司，估值水平合理。若考虑${concepts}业务的成长性，PEG估值视角下具备一定安全边际。`,
      ),
      bearCase: makeSection(
        '空头逻辑',
        `潜在风险点：1) 行业景气度下行导致需求不及预期；2) ${concepts}相关技术路线变更带来的迭代风险；3) 原材料价格波动挤压利润率；4) 核心技术人员流失风险。需持续跟踪行业数据和公司经营动态。`,
      ),
      falsificationSignals: makeSection(
        '证伪信号',
        `关键证伪指标：1) 连续两个季度营收增速低于行业平均；2) 毛利率持续下滑且无合理解释；3) 应收账款异常增长超过营收增速；4) 大股东持续减持。以上任一信号出现，均需重新评估投资逻辑。`,
      ),
    };
  }

  async getCompare(codes: string[]): Promise<StockCompare> {
    const validQuotes: RuntimeQuote[] = [];
    for (const code of codes) {
      try {
        validQuotes.push(await this.ensureQuoteAsync(code));
      } catch {
        // 无效代码跳过
      }
    }
    if (this.dataSource !== 'mock') {
      await Promise.all(validQuotes.map((q: RuntimeQuote): Promise<void> => this.enrichReal(q.stock.code)));
    }

    const pricePerformance: StockCompare['pricePerformance'] = {};
    const financialSnapshot: StockCompare['financialSnapshot'] = {};
    const valuation: StockCompare['valuation'] = {};
    const series: { code: string; name: string; data: number[]; dates: string[] }[] = [];

    const days: number = 60;
    const fallbackDates: string[] = [];
    const baseDate: Date = new Date();
    for (let i: number = days - 1; i >= 0; i -= 1) {
      fallbackDates.push(new Date(baseDate.getTime() - i * 24 * 3600 * 1000).toISOString().slice(0, 10));
    }

    for (const q of validQuotes) {
      const stock: MockStock = q.stock;
      const changePercent: number = q.prevClose > 0 ? ((q.price - q.prevClose) / q.prevClose) * 100 : 0;
      const bars: { date: string; close: number }[] = this.enrichmentCache.get(stock.code)?.bars ?? [];

      pricePerformance[stock.code] = this.buildPerformance(changePercent, bars);

      financialSnapshot[stock.code] = {
        revenue: Math.floor(stock.revenue),
        netProfit: Math.floor(stock.netProfit),
        roe: stock.roe,
        grossMargin: roundPrice(stock.grossMargin * 100),
        netMargin: stock.revenue > 0 ? roundPrice((stock.netProfit / stock.revenue) * 100) : 0,
        // 资产负债率需要财报负债字段，当前数据源未提供，置 0 表示未知（不再编造）
        debtRatio: 0,
      };

      valuation[stock.code] = {
        pe: roundPrice(stock.pe),
        pb: roundPrice(stock.pb),
        ps: stock.revenue > 0 && stock.totalShares > 0
          ? roundPrice((q.price * stock.totalShares) / stock.revenue)
          : 0,
        dividendYield: 0,
      };

      // 价格走势：使用真实日K；取不到时不编造走势，用当前价铺平
      const priceData: number[] = bars.length ? bars.map((bar): number => bar.close) : [];
      if (!priceData.length) {
        for (let i: number = 0; i < days; i += 1) priceData.push(q.price);
      }
      priceData[priceData.length - 1] = q.price;
      series.push({
        code: stock.code,
        name: stock.name,
        data: priceData,
        dates: bars.length ? bars.map((bar): string => bar.date) : fallbackDates.slice(-priceData.length),
      });
    }

    // 各序列按尾部对齐，避免图表日期轴与数据错位
    const minLength: number = series.length
      ? Math.min(...series.map((item): number => item.data.length))
      : days;
    const chartDates: string[] = series.length
      ? series[0].dates.slice(-minLength)
      : fallbackDates;
    const chartSeries = series.map((item): { code: string; name: string; data: number[] } => ({
      code: item.code,
      name: item.name,
      data: item.data.slice(-minLength),
    }));

    const diffExplanation: string = validQuotes.length >= 2
      ? `${validQuotes[0].stock.name}在${validQuotes[0].stock.industry}领域偏重于${validQuotes[0].stock.concept[0]}，而${validQuotes[1].stock.name}则在${validQuotes[1].stock.concept[0]}方向布局更深。两者在业务结构、盈利质量、估值水平上存在显著差异，建议根据投资风格匹配选择。`
      : '请选择至少两只股票进行对比分析。';

    return {
      stocks: validQuotes.map((q: RuntimeQuote): string => q.stock.code),
      pricePerformance,
      financialSnapshot,
      valuation,
      priceChartData: { dates: chartDates, series: chartSeries },
      diffExplanation,
    };
  }

  /** 用真实日K计算区间涨跌幅（1/5/20/60 日与年初至今）；无K线数据时仅返回当日涨跌幅 */
  private buildPerformance(
    changePercent: number,
    bars: { date: string; close: number }[],
  ): { day1: number; day5: number; day20: number; day60: number; yearToDate: number } {
    const last: number = bars.length ? bars[bars.length - 1].close : 0;
    if (!bars.length || last <= 0) {
      return {
        day1: roundPrice(changePercent),
        day5: 0,
        day20: 0,
        day60: 0,
        yearToDate: 0,
      };
    }

    const changeFrom = (offset: number): number => {
      const index: number = bars.length - 1 - offset;
      if (index < 0) return 0;
      const reference: number = bars[index].close;
      return reference > 0 ? roundPrice(((last - reference) / reference) * 100) : 0;
    };

    // 年初至今：以今年第一个交易日之前最后一个收盘价为基准
    const currentYear: string = String(new Date().getFullYear());
    const firstThisYear: number = bars.findIndex((bar): boolean => bar.date.startsWith(currentYear));
    let yearToDate: number = 0;
    if (firstThisYear > 0) {
      const reference: number = bars[firstThisYear - 1].close;
      if (reference > 0) yearToDate = roundPrice(((last - reference) / reference) * 100);
    } else if (firstThisYear === 0) {
      const reference: number = bars[0].close;
      if (reference > 0) yearToDate = 0;
    } else {
      const reference: number = bars[0].close;
      if (reference > 0) yearToDate = roundPrice(((last - reference) / reference) * 100);
    }

    return {
      day1: changeFrom(1),
      day5: changeFrom(5),
      day20: changeFrom(20),
      day60: changeFrom(60),
      yearToDate,
    };
  }

  screen(conditions: ScreenConditions): ListResponse<ScreenResult> {
    const results: ScreenResult[] = [];

    for (const q of this.quotes.values()) {
      const stock: MockStock = q.stock;
      const changePercent: number = roundPrice(((q.price - q.prevClose) / q.prevClose) * 100);
      const turnover: number = this.quoteTurnover(q);
      const pe: number = stock.pe > 0 ? roundPrice(stock.pe) : roundPrice(q.price * stock.totalShares / (stock.netProfit || 1));
      const marketCap: number = this.quoteMarketCap(q);

      if (conditions.industry && conditions.industry.length > 0
        && !conditions.industry.includes(stock.industry)) continue;
      if (conditions.concept && conditions.concept.length > 0
        && !conditions.concept.some((c: string): boolean => stock.concept.includes(c))) continue;
      if (conditions.peMin !== undefined && pe < conditions.peMin) continue;
      if (conditions.peMax !== undefined && pe > conditions.peMax) continue;
      if (conditions.pbMin !== undefined && stock.pb < conditions.pbMin) continue;
      if (conditions.pbMax !== undefined && stock.pb > conditions.pbMax) continue;
      if (conditions.roeMin !== undefined && stock.roe < conditions.roeMin) continue;
      if (conditions.turnoverMin !== undefined && turnover < conditions.turnoverMin) continue;
      if (conditions.turnoverMax !== undefined && turnover > conditions.turnoverMax) continue;
      if (conditions.amountMin !== undefined && q.amount < conditions.amountMin) continue;
      if (conditions.amountMax !== undefined && q.amount > conditions.amountMax) continue;
      if (conditions.changeMin !== undefined && changePercent < conditions.changeMin) continue;
      if (conditions.changeMax !== undefined && changePercent > conditions.changeMax) continue;
      if (conditions.marketCapMin !== undefined && marketCap < conditions.marketCapMin) continue;
      if (conditions.marketCapMax !== undefined && marketCap > conditions.marketCapMax) continue;

      const reasons: string[] = [];
      if (changePercent > 5) reasons.push('短期强势上涨');
      if (turnover > 5) reasons.push('高换手资金关注');
      if (pe > 0 && pe < 20) reasons.push('低估值');
      if (stock.roe > 15) reasons.push('高ROE');
      if (stock.consecutiveDays > 0) reasons.push('连板强势');
      if (reasons.length === 0) reasons.push('符合筛选条件');

      let tier: 'core' | 'important' | 'watch' | 'pending' = 'watch';
      if (reasons.length >= 3 && changePercent > 3) tier = 'core';
      else if (reasons.length >= 2) tier = 'important';
      else if (reasons.length === 1) tier = 'pending';

      results.push({
        code: stock.code,
        name: stock.name,
        market: stock.market,
        board: stock.board,
        price: q.price,
        changePercent,
        tier,
        reasons,
        sources: stock.concept.slice(0, 2),
        industry: stock.industry,
        marketCap,
        pe,
        pb: stock.pb,
        roe: stock.roe,
      });
    }

    results.sort((a: ScreenResult, b: ScreenResult): number => b.changePercent - a.changePercent);

    return {
      items: results.slice(0, 100),
      total: results.length,
      page: 1,
      pageSize: 100,
    };
  }

  async searchStocks(keyword: string): Promise<StockQuote[]> {
    const kw: string = keyword.toLowerCase().trim();
    if (!kw) return [];

    const results: StockQuote[] = [];
    const seen: Set<string> = new Set();

    // 完整 A 股代码（沪市主板/深市主板/创业板/科创板/北交所任意号段）直接命中真实行情，
    // 不在已加载列表里的代码也会按需拉取，避免「搜索不到 → 无法加入自选」的遗漏。
    const exactCode: string | null = normalizeStockCode(kw);
    if (exactCode && classifyAShareCode(exactCode)) {
      try {
        const exact: RuntimeQuote = await this.ensureQuoteAsync(exactCode);
        results.push(this.toStockQuote(exact));
        seen.add(exact.stock.code);
      } catch {
        // 行情源无该标的时忽略，继续按关键字模糊匹配
      }
    }

    for (const q of this.quotes.values()) {
      if (results.length >= 20) break;
      if (seen.has(q.stock.code)) continue;
      if (q.stock.code.includes(kw) || q.stock.name.toLowerCase().includes(kw)) {
        results.push(this.toStockQuote(q));
        seen.add(q.stock.code);
      }
    }
    return results;
  }

  getIndustries(): string[] {
    return [...INDUSTRIES];
  }

  getLimitBrokenSectorStats(): LimitBrokenSectorStat[] {
    const sectorMap: Map<string, { sealCount: number; brokenCount: number }> = new Map();

    for (const q of this.quotes.values()) {
      const industry: string = q.stock.industry;
      const hasSealed: boolean = q.firstSealTime !== null
        || q.status === 'sealing'
        || q.status === 'resealed'
        || q.status === 'broken';

      if (!hasSealed) continue;

      if (!sectorMap.has(industry)) {
        sectorMap.set(industry, { sealCount: 0, brokenCount: 0 });
      }
      const sector = sectorMap.get(industry)!;
      sector.sealCount += 1;

      const isBroken: boolean = q.status === 'broken' || q.openCount > 0;
      if (isBroken) {
        sector.brokenCount += 1;
      }
    }

    const result: LimitBrokenSectorStat[] = [];
    for (const [industry, data] of sectorMap.entries()) {
      const sealCount: number = data.sealCount;
      const brokenCount: number = data.brokenCount;
      const brokenRate: number = sealCount > 0
        ? roundPrice((brokenCount / sealCount) * 100)
        : 0;
      const sealRate: number = sealCount > 0
        ? roundPrice(((sealCount - brokenCount) / sealCount) * 100)
        : 100;

      result.push({
        industry,
        brokenCount,
        sealCount,
        brokenRate,
        sealRate,
      });
    }

    result.sort((a: LimitBrokenSectorStat, b: LimitBrokenSectorStat): number =>
      b.brokenCount - a.brokenCount,
    );

    return result;
  }

  getMarketStatus(): MarketStatus {
    const now: Date = new Date();
    const hours: number = now.getHours();
    const minutes: number = now.getMinutes();
    const totalMinutes: number = hours * 60 + minutes;

    let status: MarketStatus['status'] = 'closed';
    let nextSession: string = '09:30';

    if (totalMinutes >= 570 && totalMinutes < 690) {
      // 09:30 - 11:30 上午交易
      status = 'trading';
      nextSession = totalMinutes < 690 ? '11:30' : '13:00';
    } else if (totalMinutes >= 690 && totalMinutes < 780) {
      // 11:30 - 13:00 午间休市
      status = 'midday_break';
      nextSession = '13:00';
    } else if (totalMinutes >= 780 && totalMinutes < 900) {
      // 13:00 - 15:00 下午交易
      status = 'trading';
      nextSession = totalMinutes < 900 ? '15:00' : '明日09:30';
    } else if (totalMinutes >= 540 && totalMinutes < 570) {
      // 09:00 - 09:30 盘前
      status = 'pre_market';
      nextSession = '09:30';
    } else if (totalMinutes >= 900) {
      // 收盘后
      status = 'closed';
      nextSession = '明日09:30';
    } else {
      // 早于09:00
      status = 'closed';
      nextSession = '09:30';
    }

    const pad = (n: number): string => String(n).padStart(2, '0');
    const currentTime: string = `${pad(hours)}:${pad(minutes)}:${pad(now.getSeconds())}`;

    const isDelayed: boolean = Math.random() < 0.01;
    const delaySeconds: number = isDelayed
      ? Math.floor(2 + Math.random() * 4)
      : 0;

    return {
      status,
      currentTime,
      nextSession,
      isDelayed,
      delaySeconds,
    };
  }
}
