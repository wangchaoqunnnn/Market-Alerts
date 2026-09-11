/* 真实行情数据接入层
 *
 * 数据源（按优先级自动切换，任一环节失败自动降级，最终才回退模拟引擎）：
 *   1. 东方财富 push2 / push2delay —— 全市场列表、快照、涨速(f22)、单只详情、概念板块
 *      （push2 在部分网络环境会被重置连接，因此两个主机都要试：见 EASTMONEY_HOSTS）
 *   2. 东方财富 push2ex —— 涨停池 / 炸板池（真实封单额、首末封板时间、连板数、炸板次数）
 *   3. 腾讯财经 qt.gtimg.cn —— 批量行情（GBK，支持 sh/sz/bj 全部板块）
 *   4. 新浪财经 hq.sinajs.cn / quotes.sina.cn —— 批量行情与日K线（GBK）
 *   5. 东方财富数据中心 —— 财务摘要（营收/净利/ROE/毛利率/行业/市场）
 *
 * 实测要点（实现时不要改动）：
 *   - 东财 clist 单页最多 100 条（pz>100 也只会返回 100），全 A 约 5900 只需分页
 *   - 东财未带 fltt=2 时价格类字段为「×100 的整数」，本文件统一带 fltt=2&invt=2
 *   - 腾讯/新浪返回 GBK，必须按 gbk 解码
 *   - 涨停池价格字段是「×1000 的整数」（p=13880 → 13.88 元），需除以 1000
 */

import { classifyAShareCode, getPriceLimit, type Board, type Market } from '@shared/a-share';
import type { StockMeta, MockStock } from './mock-stocks';

/** 东财行情列表 fs 参数：深主板 + 创业板 + 沪主板 + 科创板 + 北交所 = 全部 A 股 */
const FS_ALL_A =
  'm:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048';

/** clist 单页真实上限 */
const EASTMONEY_PAGE_SIZE = 100;

/** clist 字段表（含义见文件末尾注释） */
const CLIST_FIELDS = [
  'f2', 'f3', 'f4', 'f5', 'f6', 'f8', 'f9', 'f10', 'f12', 'f13', 'f14',
  'f15', 'f16', 'f17', 'f18', 'f20', 'f21', 'f22', 'f23', 'f26', 'f100', 'f115',
].join(',');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export type DataSourceKind = 'eastmoney' | 'tencent' | 'sina' | 'mock';

/** 标准化后的真实行情条目 */
export interface RealQuote {
  code: string;
  name: string;
  market: Market;
  board: Board;
  isST: boolean;
  isNew: boolean;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 换手率（%） */
  turnover: number;
  marketCap: number;
  floatMarketCap: number;
  pe: number;
  pb: number;
  industry: string;
  /** 5 分钟涨速（%），东财 f22 */
  speed: number;
  limitUpPercent: number;
  limitDownPercent: number;
  /** 交易所公布的涨停价/跌停价（有则用于校正涨跌幅限制，兼容 ST/新股） */
  limitUpPrice?: number;
  limitDownPrice?: number;
  bid1Price?: number;
  bid1Volume?: number;
  ask1Price?: number;
  ask1Volume?: number;
  timestamp: number;
}

/** 涨停池/炸板池条目 */
export interface PoolItem {
  code: string;
  name: string;
  market: Market;
  board: Board;
  price: number;
  changePercent: number;
  amount: number;
  floatMarketCap: number;
  turnover: number;
  /** 连板数（涨停池 lbc；炸板池用 zttj.days） */
  consecutiveDays: number;
  /** 首次/最后封板时间 HH:mm:ss */
  firstSealTime: string;
  lastSealTime: string;
  /** 封单金额（元） */
  sealAmount: number;
  /** 炸板次数 */
  breakCount: number;
  industry: string;
  limitUpPrice: number;
}

export interface FinancialSnapshot {
  reportDate: string;
  revenue: number;
  revenueGrowth: number;
  netProfit: number;
  netProfitGrowth: number;
  roe: number;
  grossMargin: number;
  bps: number;
  eps: number;
  industry: string;
  marketLabel: string;
}

export interface DailyBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HostHealth {
  failures: number;
  blockedUntil: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toNumber(value: unknown, fallback: number = 0): number {
  const n: number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** HHMMSS → HH:mm:ss（东财封板时间格式） */
function formatHms(value: unknown): string {
  const raw: string = String(value ?? '').padStart(6, '0');
  if (!/^\d{6}$/.test(raw)) return '';
  return `${raw.slice(0, 2)}:${raw.slice(2, 4)}:${raw.slice(4, 6)}`;
}

/**
 * 真实行情数据源聚合器。
 * 内部维护各主机健康度：连续失败的东财主机在冷却期内不再尝试，避免每次刷新都卡住。
 */
export class RealMarketDataProvider {
  private hostHealth: Map<string, HostHealth> = new Map();

  private static readonly EASTMONEY_HOSTS: string[] = [
    'https://push2.eastmoney.com',
    'https://push2delay.eastmoney.com',
  ];

  private static readonly HOST_COOLDOWN_MS = 5 * 60 * 1000;

  /** 最近一次成功使用的东财主机（优先复用，减少无谓失败重试） */
  private preferredHost: string | null = null;

  private getHealthyHosts(): string[] {
    const now: number = Date.now();
    const healthy: string[] = RealMarketDataProvider.EASTMONEY_HOSTS.filter(
      (host: string): boolean => {
        const health = this.hostHealth.get(host);
        return !health || health.blockedUntil < now;
      },
    );
    if (this.preferredHost && healthy.includes(this.preferredHost)) {
      return [this.preferredHost, ...healthy.filter((h: string): boolean => h !== this.preferredHost)];
    }
    return healthy;
  }

  private markHostFailure(host: string): void {
    const health: HostHealth = this.hostHealth.get(host) ?? { failures: 0, blockedUntil: 0 };
    health.failures += 1;
    if (health.failures >= 2) {
      health.blockedUntil = Date.now() + RealMarketDataProvider.HOST_COOLDOWN_MS;
      health.failures = 0;
    }
    this.hostHealth.set(host, health);
  }

  private markHostSuccess(host: string): void {
    this.hostHealth.set(host, { failures: 0, blockedUntil: 0 });
    this.preferredHost = host;
  }

  /** 依次尝试可用的东财主机，返回首个成功的 JSON 响应 */
  private async fetchEastmoneyJson<T = unknown>(
    path: string,
    timeoutMs: number = 12000,
  ): Promise<T | null> {
    for (const host of this.getHealthyHosts()) {
      const text: string | null = await this.httpText(`${host}${path}`, { timeoutMs });
      if (!text) {
        this.markHostFailure(host);
        continue;
      }
      try {
        const parsed = JSON.parse(text) as T;
        this.markHostSuccess(host);
        return parsed;
      } catch {
        this.markHostFailure(host);
      }
    }
    return null;
  }

  /** 带超时、重试、GBK 解码的 HTTP 文本获取 */
  private async httpText(
    url: string,
    options: { headers?: Record<string, string>; encoding?: string; timeoutMs?: number; retries?: number } = {},
  ): Promise<string | null> {
    const { headers = {}, encoding = 'utf8', timeoutMs = 12000, retries = 1 } = options;
    for (let attempt: number = 0; attempt <= retries; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout((): void => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': UA, ...headers },
          signal: controller.signal,
        });
        if (!response.ok) {
          return null;
        }
        const buffer: Buffer = Buffer.from(await response.arrayBuffer());
        return this.decode(buffer, encoding);
      } catch {
        // 网络异常：退避后重试
      } finally {
        clearTimeout(timer);
      }
      if (attempt < retries) await sleep(200 * (attempt + 1));
    }
    return null;
  }

  /** GBK 解码（腾讯/新浪），运行时无 GBK 支持时退化为 utf8 以免整体失败 */
  private decode(buffer: Buffer, encoding: string): string {
    try {
      return new TextDecoder(encoding).decode(buffer);
    } catch {
      return buffer.toString('utf8');
    }
  }

  // ==========================================================
  // 1. 全市场股票列表 + 快照（东方财富 clist，失败回退新浪列表）
  // ==========================================================
  async fetchAllStocks(maxStocks: number, log?: (msg: string) => void): Promise<RealQuote[]> {
    const byEastmoney: RealQuote[] = await this.fetchAllStocksFromEastmoney(maxStocks, log);
    if (byEastmoney.length) return byEastmoney;
    log?.('东财列表不可用，改用新浪全市场列表...');
    return this.fetchAllStocksFromSina(maxStocks, log);
  }

  private async fetchAllStocksFromEastmoney(
    maxStocks: number,
    log?: (msg: string) => void,
  ): Promise<RealQuote[]> {
    const first = await this.fetchEastmoneyJson<{ data?: { total: number; diff: unknown[] } }>(
      `/api/qt/clist/get?pn=1&pz=${EASTMONEY_PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(FS_ALL_A)}&fields=${CLIST_FIELDS}`,
      15000,
    );
    const total: number = toNumber(first?.data?.total, 0);
    if (!first?.data?.diff?.length) return [];

    const quotes: RealQuote[] = [];
    this.pushClistRows(quotes, first.data.diff as Record<string, unknown>[]);
    const pages: number = Math.min(Math.ceil(total / EASTMONEY_PAGE_SIZE), Math.ceil(maxStocks / EASTMONEY_PAGE_SIZE));
    log?.(`东财全 A 股共 ${total} 只，开始分页拉取（每页 ${EASTMONEY_PAGE_SIZE} 条，共 ${pages} 页）...`);

    for (let pn: number = 2; pn <= pages; pn += 1) {
      const page = await this.fetchEastmoneyJson<{ data?: { diff: unknown[] } }>(
        `/api/qt/clist/get?pn=${pn}&pz=${EASTMONEY_PAGE_SIZE}&po=1&np=1&fltt=2&invt=2&fid=f3&fs=${encodeURIComponent(FS_ALL_A)}&fields=${CLIST_FIELDS}`,
        12000,
      );
      if (page?.data?.diff?.length) {
        this.pushClistRows(quotes, page.data.diff as Record<string, unknown>[]);
      }
      if (pn % 10 === 0) log?.(`  已拉取 ${quotes.length} 只...`);
      await sleep(60);
    }
    return quotes;
  }

  private pushClistRows(target: RealQuote[], rows: Record<string, unknown>[]): void {
    for (const row of rows) {
      const quote: RealQuote | null = this.mapClistRow(row);
      if (quote) target.push(quote);
    }
  }

  private mapClistRow(row: Record<string, unknown>): RealQuote | null {
    const code: string = String(row.f12 ?? '');
    const classified: { market: Market; board: Board } | null = classifyAShareCode(code);
    if (!classified) return null;

    const name: string = String(row.f14 ?? '').trim();
    const isST: boolean = /^(?:\*?ST|S\*ST|SST)/i.test(name) || name.includes('ST');
    const prevClose: number = toNumber(row.f18);
    const price: number = toNumber(row.f2, prevClose);
    const limit = getPriceLimit(classified.board, isST);
    const listedAt: number = toNumber(row.f26);
    const isNew: boolean = listedAt > 0 && this.isRecentlyListed(listedAt);

    return {
      code,
      name,
      market: classified.market,
      board: classified.board,
      isST,
      isNew,
      price,
      prevClose,
      open: toNumber(row.f17, prevClose),
      high: toNumber(row.f15, price),
      low: toNumber(row.f16, price),
      volume: toNumber(row.f5),
      amount: toNumber(row.f6),
      turnover: toNumber(row.f8),
      marketCap: toNumber(row.f20),
      floatMarketCap: toNumber(row.f21),
      pe: toNumber(row.f9) || toNumber(row.f115),
      pb: toNumber(row.f23),
      industry: String(row.f100 ?? '').trim() || '未分类',
      speed: toNumber(row.f22),
      limitUpPercent: limit.limitUpPercent,
      limitDownPercent: limit.limitDownPercent,
      limitUpPrice: prevClose > 0 ? round2(prevClose * (1 + limit.limitUpPercent)) : undefined,
      limitDownPrice: prevClose > 0 ? round2(prevClose * (1 - limit.limitDownPercent)) : undefined,
      timestamp: Date.now(),
    };
  }

  /** f26 上市日期形如 20240115 → 判断是否次新（60 个自然日内） */
  private isRecentlyListed(listedAt: number): boolean {
    const text: string = String(Math.trunc(listedAt));
    if (text.length !== 8) return false;
    const year: number = Number(text.slice(0, 4));
    const month: number = Number(text.slice(4, 6));
    const day: number = Number(text.slice(6, 8));
    if (!year || !month || !day) return false;
    const listed: number = new Date(year, month - 1, day).getTime();
    return Date.now() - listed < 60 * 24 * 3600 * 1000;
  }

  /** 备用列表源：新浪全市场（node=hs_a 实测已包含北交所） */
  private async fetchAllStocksFromSina(
    maxStocks: number,
    log?: (msg: string) => void,
  ): Promise<RealQuote[]> {
    const countText: string | null = await this.httpText(
      'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeStockCount?node=hs_a',
      { headers: { Referer: 'https://finance.sina.com.cn' } },
    );
    const total: number = toNumber((countText ?? '').replace(/[^0-9]/g, ''), 0);
    const pageSize: number = 100;
    const pages: number = Math.min(Math.ceil(total / pageSize), Math.ceil(maxStocks / pageSize));
    log?.(`新浪全市场共 ${total} 只，分页拉取 ${pages} 页...`);

    const quotes: RealQuote[] = [];
    for (let page: number = 1; page <= pages; page += 1) {
      const text: string | null = await this.httpText(
        `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=${pageSize}&sort=symbol&asc=1&node=hs_a`,
        { headers: { Referer: 'https://finance.sina.com.cn' } },
      );
      if (!text) break;
      try {
        const rows = JSON.parse(text) as Record<string, string>[];
        for (const row of rows) {
          const mapped: RealQuote | null = this.mapSinaRow(row);
          if (mapped) quotes.push(mapped);
        }
      } catch {
        break;
      }
      if (page % 10 === 0) log?.(`  已拉取 ${quotes.length} 只...`);
    }
    return quotes;
  }

  private mapSinaRow(row: Record<string, string>): RealQuote | null {
    const code: string = String(row.code ?? '').trim();
    const classified: { market: Market; board: Board } | null = classifyAShareCode(code);
    if (!classified) return null;
    const name: string = String(row.name ?? '').trim();
    const isST: boolean = name.includes('ST');
    const prevClose: number = toNumber(row.settlement);
    const price: number = toNumber(row.trade, prevClose);
    const limit = getPriceLimit(classified.board, isST);
    return {
      code,
      name,
      market: classified.market,
      board: classified.board,
      isST,
      isNew: false,
      price,
      prevClose,
      open: toNumber(row.open, prevClose),
      high: toNumber(row.high, price),
      low: toNumber(row.low, price),
      volume: toNumber(row.volume) / 100,
      amount: toNumber(row.amount),
      turnover: toNumber(row.turnoverratio),
      marketCap: toNumber(row.mktcap) * 10000,
      floatMarketCap: toNumber(row.nmc) * 10000,
      pe: toNumber(row.per),
      pb: toNumber(row.pb),
      industry: '未分类',
      speed: 0,
      limitUpPercent: limit.limitUpPercent,
      limitDownPercent: limit.limitDownPercent,
      timestamp: Date.now(),
    };
  }

  // ==========================================================
  // 2. 指定代码的批量行情（自选股/研究按需）—— 新浪优先，腾讯兜底
  // ==========================================================
  async fetchQuotes(codes: string[]): Promise<RealQuote[]> {
    const unique: string[] = Array.from(new Set(codes.filter(Boolean)));
    if (!unique.length) return [];

    const fromSina: RealQuote[] = await this.fetchQuotesFromSina(unique);
    const covered: Set<string> = new Set(fromSina.map((q: RealQuote): string => q.code));
    const missing: string[] = unique.filter((code: string): boolean => !covered.has(code));
    if (!missing.length) return fromSina;

    const fromTencent: RealQuote[] = await this.fetchQuotesFromTencent(missing);
    return [...fromSina, ...fromTencent];
  }

  private static secidFor(code: string, market: Market): string {
    return `${market === 'sh' ? 1 : 0}.${code}`;
  }

  private sinaSymbol(code: string, market: Market): string {
    return `${market}${code}`;
  }

  private async fetchQuotesFromSina(codes: string[]): Promise<RealQuote[]> {
    const result: RealQuote[] = [];
    const chunkSize: number = 300;
    for (let i: number = 0; i < codes.length; i += chunkSize) {
      const chunk: string[] = codes.slice(i, i + chunkSize);
      const symbols: string[] = chunk
        .map((code: string): string | null => {
          const info = classifyAShareCode(code);
          return info ? this.sinaSymbol(code, info.market) : null;
        })
        .filter((s: string | null): s is string => Boolean(s));
      if (!symbols.length) continue;
      const text: string | null = await this.httpText(
        `https://hq.sinajs.cn/list=${symbols.join(',')}`,
        { headers: { Referer: 'https://finance.sina.com.cn' }, encoding: 'gbk' },
      );
      if (!text) continue;
      for (const line of text.split('\n')) {
        const mapped: RealQuote | null = this.parseSinaQuoteLine(line);
        if (mapped) result.push(mapped);
      }
      await sleep(50);
    }
    return result;
  }

  /** hq_str_sh600519="名称,今开,昨收,现价,最高,最低,买一,卖一,成交量(股),成交额(元),...,日期,时间" */
  private parseSinaQuoteLine(line: string): RealQuote | null {
    const match = line.match(/hq_str_(\w{2})(\d{6})="([^"]*)"/);
    if (!match) return null;
    const market: Market = match[1] as Market;
    const code: string = match[2];
    const parts: string[] = match[3].split(',');
    if (parts.length < 32 || !parts[0]) return null;
    const classified = classifyAShareCode(code);
    if (!classified) return null;

    const name: string = parts[0].trim();
    const isST: boolean = name.includes('ST');
    const prevClose: number = toNumber(parts[2]);
    const price: number = toNumber(parts[3], prevClose);
    const limit = getPriceLimit(classified.board, isST);
    const timeText: string = `${parts[30] ?? ''} ${parts[31] ?? ''}`.trim();
    const timestamp: number = Date.parse(timeText.replace(/-/g, '/')) || Date.now();

    return {
      code,
      name,
      market: classified.market,
      board: classified.board,
      isST,
      isNew: false,
      price,
      prevClose,
      open: toNumber(parts[1], prevClose),
      high: toNumber(parts[4], price),
      low: toNumber(parts[5], price),
      volume: toNumber(parts[8]) / 100,
      amount: toNumber(parts[9]),
      turnover: 0,
      marketCap: 0,
      floatMarketCap: 0,
      pe: 0,
      pb: 0,
      industry: '',
      speed: 0,
      bid1Price: toNumber(parts[6]),
      ask1Price: toNumber(parts[7]),
      limitUpPercent: limit.limitUpPercent,
      limitDownPercent: limit.limitDownPercent,
      limitUpPrice: prevClose > 0 ? round2(prevClose * (1 + limit.limitUpPercent)) : undefined,
      limitDownPrice: prevClose > 0 ? round2(prevClose * (1 - limit.limitDownPercent)) : undefined,
      timestamp,
    };
  }

  private async fetchQuotesFromTencent(codes: string[]): Promise<RealQuote[]> {
    const result: RealQuote[] = [];
    const chunkSize: number = 60;
    for (let i: number = 0; i < codes.length; i += chunkSize) {
      const chunk: string[] = codes.slice(i, i + chunkSize);
      const symbols: string[] = chunk
        .map((code: string): string | null => {
          const info = classifyAShareCode(code);
          return info ? this.sinaSymbol(code, info.market) : null;
        })
        .filter((s: string | null): s is string => Boolean(s));
      if (!symbols.length) continue;
      const text: string | null = await this.httpText(`https://qt.gtimg.cn/q=${symbols.join(',')}`, {
        encoding: 'gbk',
      });
      if (!text) continue;
      for (const line of text.split('\n')) {
        const mapped: RealQuote | null = this.parseTencentQuoteLine(line);
        if (mapped) result.push(mapped);
      }
      await sleep(50);
    }
    return result;
  }

  /** v_sh600519="1~名称~代码~现价~昨收~今开~成交量(手)~...~涨停价~跌停价~量比~..." */
  private parseTencentQuoteLine(line: string): RealQuote | null {
    const match = line.match(/v_(\w{2})(\d{6})="([^"]*)"/);
    if (!match) return null;
    const market: Market = match[1] as Market;
    const code: string = match[2];
    const parts: string[] = match[3].split('~');
    if (parts.length < 50 || !parts[1]) return null;
    const classified = classifyAShareCode(code);
    if (!classified) return null;

    const name: string = parts[1].trim();
    const isST: boolean = name.includes('ST');
    const prevClose: number = toNumber(parts[4]);
    const price: number = toNumber(parts[3], prevClose);
    const limitUpPrice: number = toNumber(parts[47]);
    const limitDownPrice: number = toNumber(parts[48]);
    const rules = getPriceLimit(classified.board, isST);
    // 交易所实际涨跌幅优先（兼容 ST、次新等特殊限制）
    const limitUpPercent: number =
      limitUpPrice > 0 && prevClose > 0 ? round2((limitUpPrice - prevClose) / prevClose) : rules.limitUpPercent;
    const limitDownPercent: number =
      limitDownPrice > 0 && prevClose > 0 ? round2((prevClose - limitDownPrice) / prevClose) : rules.limitDownPercent;
    const stamp: string = String(parts[30] ?? '');
    const timestamp: number =
      stamp.length === 14
        ? Date.parse(
            `${stamp.slice(0, 4)}/${stamp.slice(4, 6)}/${stamp.slice(6, 8)} ${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}`,
          ) || Date.now()
        : Date.now();

    return {
      code,
      name,
      market: classified.market,
      board: classified.board,
      isST,
      isNew: false,
      price,
      prevClose,
      open: toNumber(parts[5], prevClose),
      high: toNumber(parts[33], price),
      low: toNumber(parts[34], price),
      volume: toNumber(parts[6]),
      amount: toNumber(parts[37]) * 10000,
      turnover: toNumber(parts[38]),
      marketCap: toNumber(parts[45]) * 1e8,
      floatMarketCap: toNumber(parts[44]) * 1e8,
      pe: toNumber(parts[39]),
      pb: toNumber(parts[46]),
      industry: '',
      speed: 0,
      bid1Price: toNumber(parts[9]),
      bid1Volume: toNumber(parts[10]),
      ask1Price: toNumber(parts[19]),
      ask1Volume: toNumber(parts[20]),
      limitUpPercent,
      limitDownPercent,
      limitUpPrice: limitUpPrice || undefined,
      limitDownPrice: limitDownPrice || undefined,
      timestamp,
    };
  }

  // ==========================================================
  // 3. 涨停池 / 炸板池（东财 push2ex，真实封单与封板时间）
  // ==========================================================
  async fetchLimitUpPool(): Promise<PoolItem[]> {
    return this.fetchPool('getTopicZTPool');
  }

  async fetchBrokenPool(): Promise<PoolItem[]> {
    return this.fetchPool('getTopicZBPool');
  }

  private async fetchPool(endpoint: string): Promise<PoolItem[]> {
    const base = 'https://push2ex.eastmoney.com';
    for (let back: number = 0; back <= 7; back += 1) {
      const date: Date = new Date(Date.now() - back * 24 * 3600 * 1000);
      const day: string = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
      const text: string | null = await this.httpText(
        `${base}/${endpoint}?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=300&sort=fbt%3Aasc&date=${day}`,
      );
      if (!text) return [];
      try {
        const parsed = JSON.parse(text) as {
          data?: { pool?: Record<string, unknown>[] | null; tc?: number; qdate?: number };
        };
        const pool = parsed.data?.pool;
        if (pool && pool.length) {
          return pool
            .map((row: Record<string, unknown>): PoolItem | null => this.mapPoolRow(row, endpoint))
            .filter((item: PoolItem | null): item is PoolItem => item !== null);
        }
        // 该日无数据（非交易日/未开盘）时继续往前找
      } catch {
        return [];
      }
      await sleep(80);
    }
    return [];
  }

  private mapPoolRow(row: Record<string, unknown>, endpoint: string): PoolItem | null {
    const code: string = String(row.c ?? '');
    const classified = classifyAShareCode(code);
    if (!classified) return null;
    const isZb: boolean = endpoint === 'getTopicZBPool';
    const zttj = (row.zttj ?? {}) as { days?: number; ct?: number };
    return {
      code,
      name: String(row.n ?? '').trim(),
      market: classified.market,
      board: classified.board,
      price: toNumber(row.p) / 1000,
      changePercent: round2(toNumber(row.zdp)),
      amount: toNumber(row.amount),
      floatMarketCap: toNumber(row.ltsz),
      turnover: round2(toNumber(row.hs)),
      consecutiveDays: isZb ? toNumber(zttj.days, 1) : toNumber(row.lbc, 1),
      firstSealTime: formatHms(row.fbt),
      lastSealTime: formatHms(row.lbt ?? row.fbt),
      sealAmount: toNumber(row.fund),
      breakCount: toNumber(row.zbc),
      industry: String(row.hybk ?? '').trim() || '未分类',
      limitUpPrice: toNumber(row.ztp) / 1000,
    };
  }

  // ==========================================================
  // 4. 单只详情 / 概念板块 / 日K线 / 财务摘要（按需调用）
  // ==========================================================
  async fetchStockDetail(code: string): Promise<RealQuote | null> {
    const classified = classifyAShareCode(code);
    if (!classified) return null;
    const secid: string = RealMarketDataProvider.secidFor(code, classified.market);
    const parsed = await this.fetchEastmoneyJson<{
      data?: Record<string, unknown>;
    }>(`/api/qt/stock/get?secid=${secid}&fltt=2&invt=2&fields=f43,f44,f45,f46,f47,f48,f51,f52,f57,f58,f60,f107,f116,f117,f127,f162,f167,f168,f169,f170,f171`, 10000);
    const data = parsed?.data;
    if (!data) {
      const fallback: RealQuote[] = await this.fetchQuotes([code]);
      return fallback[0] ?? null;
    }

    const name: string = String(data.f58 ?? '').trim();
    const isST: boolean = name.includes('ST');
    const prevClose: number = toNumber(data.f60);
    const price: number = toNumber(data.f43, prevClose);
    const limitUpPrice: number = toNumber(data.f51);
    const limitDownPrice: number = toNumber(data.f52);
    const rules = getPriceLimit(classified.board, isST);

    return {
      code,
      name,
      market: classified.market,
      board: classified.board,
      isST,
      isNew: false,
      price,
      prevClose,
      open: toNumber(data.f46, prevClose),
      high: toNumber(data.f44, price),
      low: toNumber(data.f45, price),
      volume: toNumber(data.f47),
      amount: toNumber(data.f48),
      turnover: toNumber(data.f168),
      marketCap: toNumber(data.f116),
      floatMarketCap: toNumber(data.f117),
      pe: toNumber(data.f162),
      pb: toNumber(data.f167),
      industry: String(data.f127 ?? '').trim() || '未分类',
      speed: 0,
      limitUpPercent:
        limitUpPrice > 0 && prevClose > 0 ? round2((limitUpPrice - prevClose) / prevClose) : rules.limitUpPercent,
      limitDownPercent:
        limitDownPrice > 0 && prevClose > 0 ? round2((prevClose - limitDownPrice) / prevClose) : rules.limitDownPercent,
      limitUpPrice: limitUpPrice || undefined,
      limitDownPrice: limitDownPrice || undefined,
      timestamp: Date.now(),
    };
  }

  /** 所属概念/板块（东财 slist，返回如 白酒Ⅱ/茅指数/上证50_） */
  async fetchConcepts(code: string): Promise<string[]> {
    const classified = classifyAShareCode(code);
    if (!classified) return [];
    const secid: string = RealMarketDataProvider.secidFor(code, classified.market);
    const parsed = await this.fetchEastmoneyJson<{
      data?: { diff?: Record<string, { f14?: string }> | { f14?: string }[] };
    }>(`/api/qt/slist/get?spt=3&fltt=2&invt=2&fields=f12,f13,f14,f3&secid=${secid}&pn=1&pz=30&po=1&fid=f3`, 8000);
    const diff = parsed?.data?.diff;
    if (!diff) return [];
    const rows: { f14?: string }[] = Array.isArray(diff) ? diff : Object.values(diff);
    return rows
      .map((row): string => String(row.f14 ?? '').trim())
      .filter((name: string): boolean => Boolean(name))
      .slice(0, 10);
  }

  /** 日K线（新浪，实测可用；用于个股研究/多股对比的历史表现） */
  async fetchDailyBars(code: string, days: number = 60): Promise<DailyBar[]> {
    const classified = classifyAShareCode(code);
    if (!classified) return [];
    const symbol: string = this.sinaSymbol(code, classified.market);
    const text: string | null = await this.httpText(
      `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${days}`,
      { timeoutMs: 10000 },
    );
    if (!text) return [];
    try {
      const rows = JSON.parse(text) as Record<string, string>[];
      return rows.map((row: Record<string, string>): DailyBar => ({
        date: String(row.day ?? ''),
        open: toNumber(row.open),
        high: toNumber(row.high),
        low: toNumber(row.low),
        close: toNumber(row.close),
        volume: toNumber(row.volume),
      }));
    } catch {
      return [];
    }
  }

  /** 最新财报摘要（东财数据中心，实测可用） */
  async fetchFinancials(code: string): Promise<FinancialSnapshot | null> {
    const text: string | null = await this.httpText(
      `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=ALL&filter=${encodeURIComponent(`(SECURITY_CODE="${code}")`)}&pageNumber=1&pageSize=1&sortColumns=REPORTDATE&sortTypes=-1`,
      { timeoutMs: 10000 },
    );
    if (!text) return null;
    try {
      const parsed = JSON.parse(text) as { result?: { data?: Record<string, unknown>[] } };
      const row = parsed.result?.data?.[0];
      if (!row) return null;
      return {
        reportDate: String(row.REPORTDATE ?? '').slice(0, 10),
        revenue: toNumber(row.TOTAL_OPERATE_INCOME),
        revenueGrowth: round2(toNumber(row.YSTZ)),
        netProfit: toNumber(row.PARENT_NETPROFIT),
        netProfitGrowth: round2(toNumber(row.SJLTZ)),
        roe: round2(toNumber(row.WEIGHTAVG_ROE)),
        grossMargin: round2(toNumber(row.XSMLL)),
        bps: toNumber(row.BPS),
        eps: toNumber(row.BASIC_EPS),
        industry: String(row.PUBLISHNAME ?? '').trim(),
        marketLabel: String(row.TRADE_MARKET ?? '').trim(),
      };
    } catch {
      return null;
    }
  }

  /** 把真实行情映射为服务内部使用的股票元信息 */
  static toStockMeta(quote: RealQuote): StockMeta {
    const totalShares: number = quote.price > 0 ? quote.marketCap / quote.price : 0;
    const floatShares: number = quote.price > 0 ? quote.floatMarketCap / quote.price : 0;
    const meta: StockMeta = {
      code: quote.code,
      name: quote.name,
      market: quote.market,
      board: quote.board,
      isST: quote.isST,
      isNew: quote.isNew,
      limitUpPercent: quote.limitUpPercent,
      limitDownPercent: quote.limitDownPercent,
      industry: quote.industry,
      concept: quote.industry && quote.industry !== '未分类' ? [quote.industry] : [],
      basePrice: quote.prevClose || quote.price,
      marketCap: quote.marketCap,
      floatMarketCap: quote.floatMarketCap,
      pe: quote.pe,
      pb: quote.pb,
      totalShares,
      floatShares,
      roe: 0,
      revenue: 0,
      netProfit: 0,
      grossMargin: 0,
      consecutiveDays: 0,
    };
    return meta;
  }
}

/** MockStock 与真实元信息同构（保留别名便于兼容旧引用） */
export type RealStockMeta = MockStock;

/* clist 字段含义速查：
 * f2 最新价  f3 涨跌幅  f4 涨跌额  f5 成交量(手)  f6 成交额  f8 换手率
 * f9 市盈率(动)  f10 量比  f12 代码  f13 市场(1沪/0深北)  f14 名称
 * f15 最高  f16 最低  f17 今开  f18 昨收
 * f20 总市值  f21 流通市值  f22 涨速(5分钟%)  f23 市净率  f26 上市日期
 * f100 所属行业  f115 市盈率(TTM)
 */
