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
} from '@shared/api.interface.ts';
import { generateMockStocks, INDUSTRIES, type MockStock } from './mock-stocks';

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
}

const PRICE_PRECISION: number = 2;
const MINUTE_MS: number = 60 * 1000;
const HISTORY_MINUTES: number = 10;

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

  onModuleInit(): void {
    this.logger.log('初始化行情数据服务...');
    this.initStocks();
    this.startTick();
    this.logger.log(`行情服务已启动，共 ${this.quotes.size} 只股票`);
  }

  private initStocks(): void {
    const stocks: MockStock[] = generateMockStocks();
    const now: number = Date.now();
    this.startTime = now;

    for (const stock of stocks) {
      const prevClose: number = roundPrice(stock.basePrice * (1 + (Math.random() - 0.5) * 0.02));
      const open: number = roundPrice(prevClose * (1 + (Math.random() - 0.5) * 0.015));
      const price: number = open;
      const limitUpPrice: number = roundPrice(prevClose * (1 + stock.limitUpPercent));
      const limitDownPrice: number = roundPrice(prevClose * (1 - stock.limitDownPercent));

      const quote: RuntimeQuote = {
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
      };

      this.quotes.set(stock.code, quote);
    }

    this.seedInitialLimitUps();
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
    const changePercent: number = roundPrice((change / q.prevClose) * 100);
    const limitUpPrice: number = roundPrice(q.prevClose * (1 + stock.limitUpPercent));
    const limitDownPrice: number = roundPrice(q.prevClose * (1 - stock.limitDownPercent));
    const turnover: number = roundPrice((q.volume * 100 / stock.floatShares) * 100);

    return {
      code: stock.code,
      name: stock.name,
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
      marketCap: Math.floor(q.price * stock.totalShares),
      floatMarketCap: Math.floor(q.price * stock.floatShares),
      pe: roundPrice(q.price * stock.totalShares / (stock.netProfit || 1)),
      pb: roundPrice(q.price * stock.totalShares / (stock.totalShares * stock.basePrice / stock.pb)),
      industry: stock.industry,
      concept: [...stock.concept],
      isLimitUp: q.isLimitUp,
      isLimitDown: q.isLimitDown,
      isOneWordLimitUp: q.isOneWordLimitUp,
      timestamp: q.timestamp,
    };
  }

  getQuote(code: string): StockQuote {
    const q: RuntimeQuote | undefined = this.quotes.get(code);
    if (!q) {
      throw new NotFoundException(`股票 ${code} 不存在`);
    }
    return this.toStockQuote(q);
  }

  getBatchQuotes(codes: string[]): StockQuote[] {
    const result: StockQuote[] = [];
    for (const code of codes) {
      const q: RuntimeQuote | undefined = this.quotes.get(code);
      if (q) {
        result.push(this.toStockQuote(q));
      }
    }
    return result;
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

      const snaps: { time: number; price: number }[] = q.lastMinuteSnap;
      if (snaps.length < windowMinutes + 1) continue;

      const refIdx: number = snaps.length - windowMinutes - 1;
      const refPrice: number = snaps[refIdx]?.price ?? q.price;
      if (refPrice <= 0) continue;

      const surgePercent: number = roundPrice(((q.price - refPrice) / refPrice) * 100 / windowMinutes * 100) / 100;

      if (surgePercent < threshold) continue;

      const change: number = q.price - q.prevClose;
      const changePercent: number = roundPrice((change / q.prevClose) * 100);

      items.push({
        code: q.stock.code,
        name: q.stock.name,
        price: q.price,
        surgePercent,
        changePercent,
        windowMinutes,
        referencePrice: refPrice,
        amount: Math.floor(q.amount),
        turnover: roundPrice((q.volume * 100 / q.stock.floatShares) * 100),
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
        turnover: roundPrice((q.volume * 100 / q.stock.floatShares) * 100),
        reason,
        industry: q.stock.industry,
        floatMarketCap: Math.floor(q.price * q.stock.floatShares),
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
        turnover: roundPrice((q.volume * 100 / q.stock.floatShares) * 100),
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
    const promotionRate: number = roundPrice(60 + Math.random() * 20);

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

  getResearch(code: string): StockResearch {
    const q: RuntimeQuote | undefined = this.quotes.get(code);
    if (!q) {
      throw new NotFoundException(`股票 ${code} 不存在`);
    }

    const stock: MockStock = q.stock;
    const quote: StockQuote = this.toStockQuote(q);
    const nowIso: string = new Date().toISOString().slice(0, 10);

    const overview: StockOverview = {
      companyInfo: {
        fullName: stock.name + '股份有限公司',
        shortName: stock.name,
        code: stock.code,
        listingDate: '2015-06-15',
        exchange: stock.market === 'sh' ? '上海证券交易所' : stock.market === 'sz' ? '深圳证券交易所' : '北京证券交易所',
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

  getCompare(codes: string[]): StockCompare {
    const validQuotes: RuntimeQuote[] = codes
      .map((code: string): RuntimeQuote | undefined => this.quotes.get(code))
      .filter((q): q is RuntimeQuote => q !== undefined);

    const pricePerformance: StockCompare['pricePerformance'] = {};
    const financialSnapshot: StockCompare['financialSnapshot'] = {};
    const valuation: StockCompare['valuation'] = {};
    const series: { code: string; name: string; data: number[] }[] = [];
    const dates: string[] = [];

    const days: number = 60;
    const baseDate: Date = new Date();
    for (let i: number = days - 1; i >= 0; i -= 1) {
      const d: Date = new Date(baseDate.getTime() - i * 24 * 3600 * 1000);
      dates.push(d.toISOString().slice(0, 10));
    }

    for (const q of validQuotes) {
      const stock: MockStock = q.stock;
      const changePercent: number = (q.price - q.prevClose) / q.prevClose * 100;

      pricePerformance[stock.code] = {
        day1: roundPrice(changePercent),
        day5: roundPrice(changePercent * 2.5 + (Math.random() - 0.5) * 5),
        day20: roundPrice(changePercent * 4 + (Math.random() - 0.5) * 15),
        day60: roundPrice(changePercent * 6 + (Math.random() - 0.5) * 30),
        yearToDate: roundPrice(changePercent * 8 + (Math.random() - 0.5) * 40),
      };

      financialSnapshot[stock.code] = {
        revenue: Math.floor(stock.revenue),
        netProfit: Math.floor(stock.netProfit),
        roe: stock.roe,
        grossMargin: roundPrice(stock.grossMargin * 100),
        netMargin: roundPrice((stock.netProfit / stock.revenue) * 100),
        debtRatio: roundPrice(20 + Math.random() * 40),
      };

      valuation[stock.code] = {
        pe: roundPrice(q.price * stock.totalShares / (stock.netProfit || 1)),
        pb: stock.pb,
        ps: roundPrice(q.price * stock.totalShares / stock.revenue),
        dividendYield: roundPrice(0.5 + Math.random() * 3),
      };

      // 价格走势数据
      const priceData: number[] = [];
      let basePrice: number = q.price * (1 + (Math.random() - 0.5) * 0.2);
      for (let i: number = 0; i < days; i += 1) {
        basePrice *= 1 + (Math.random() - 0.48) * 0.03;
        priceData.push(roundPrice(basePrice));
      }
      // 最后一天对齐到当前价
      priceData[days - 1] = q.price;

      series.push({ code: stock.code, name: stock.name, data: priceData });
    }

    const diffExplanation: string = validQuotes.length >= 2
      ? `${validQuotes[0].stock.name}在${validQuotes[0].stock.industry}领域偏重于${validQuotes[0].stock.concept[0]}，而${validQuotes[1].stock.name}则在${validQuotes[1].stock.concept[0]}方向布局更深。两者在业务结构、盈利质量、估值水平上存在显著差异，建议根据投资风格匹配选择。`
      : '请选择至少两只股票进行对比分析。';

    return {
      stocks: validQuotes.map((q: RuntimeQuote): string => q.stock.code),
      pricePerformance,
      financialSnapshot,
      valuation,
      priceChartData: { dates, series },
      diffExplanation,
    };
  }

  screen(conditions: ScreenConditions): ListResponse<ScreenResult> {
    const results: ScreenResult[] = [];

    for (const q of this.quotes.values()) {
      const stock: MockStock = q.stock;
      const changePercent: number = roundPrice(((q.price - q.prevClose) / q.prevClose) * 100);
      const turnover: number = roundPrice((q.volume * 100 / stock.floatShares) * 100);
      const pe: number = roundPrice(q.price * stock.totalShares / (stock.netProfit || 1));
      const marketCap: number = Math.floor(q.price * stock.totalShares);

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

  searchStocks(keyword: string): StockQuote[] {
    const kw: string = keyword.toLowerCase().trim();
    if (!kw) return [];

    const results: StockQuote[] = [];
    for (const q of this.quotes.values()) {
      if (q.stock.code.includes(kw) || q.stock.name.toLowerCase().includes(kw)) {
        results.push(this.toStockQuote(q));
        if (results.length >= 20) break;
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
