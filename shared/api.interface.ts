/* 前后端共享的类型写在这里 */

// 股票基本信息
export interface StockBase {
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'bj';
  board: 'main' | 'gem' | 'star' | 'bj';
  isST: boolean;
  isNew: boolean;
  limitUpPercent: number;
  limitDownPercent: number;
}

// 实时行情快照
export interface StockQuote {
  code: string;
  name: string;
  // 交易所与板块：覆盖沪市主板 / 深市主板 / 创业板 / 科创板 / 北交所
  market: 'sh' | 'sz' | 'bj';
  board: 'main' | 'gem' | 'star' | 'bj';
  isST: boolean;
  isNew: boolean;
  limitUpPercent: number;
  limitDownPercent: number;
  price: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  change: number;
  changePercent: number;
  volume: number;
  amount: number;
  turnover: number;
  limitUpPrice: number;
  limitDownPrice: number;
  bid1Price: number;
  bid1Volume: number;
  ask1Price: number;
  ask1Volume: number;
  marketCap: number;
  floatMarketCap: number;
  pe: number;
  pb: number;
  industry: string;
  concept: string[];
  isLimitUp: boolean;
  isLimitDown: boolean;
  isOneWordLimitUp: boolean;
  timestamp: number;
}

// 涨速榜条目
export interface SurgeItem {
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'bj';
  board: 'main' | 'gem' | 'star' | 'bj';
  price: number;
  surgePercent: number;
  changePercent: number;
  windowMinutes: number;
  referencePrice: number;
  amount: number;
  turnover: number;
  industry: string;
  isST: boolean;
  isOneWordLimitUp: boolean;
  rank: number;
}

// 涨停股条目
export interface LimitUpStock {
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'bj';
  board: 'main' | 'gem' | 'star' | 'bj';
  price: number;
  limitUpPrice: number;
  changePercent: number;
  firstSealTime: string;
  lastSealTime: string;
  openCount: number;
  consecutiveDays: number;
  sealAmount: number;
  sealFloatRatio: number;
  amount: number;
  turnover: number;
  reason: string[];
  industry: string;
  floatMarketCap: number;
  status: 'sealing' | 'broken' | 'resealed';
  sealStrength: 'strong' | 'medium' | 'weak';
  isST: boolean;
  timeline: SealEvent[];
  sealToAmountRatio: number;
  isLateSeal: boolean;
  sealReasonText: string;
}

export interface SealEvent {
  time: string;
  type: 'seal' | 'break' | 'reseal';
  price: number;
  sealAmount?: number;
}

// 炸板监控条目
export interface LimitBrokenStock {
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'bj';
  board: 'main' | 'gem' | 'star' | 'bj';
  price: number;
  limitUpPrice: number;
  changePercent: number;
  breakCount: number;
  currentStatus: 'sealing' | 'broken' | 'resealed';
  firstSealTime: string;
  firstBreakTime: string;
  lastBreakTime: string;
  sealAmountBeforeBreak: number;
  priceDiffFromLimit: number;
  amount: number;
  turnover: number;
  industry: string;
  isInWatchlist: boolean;
  timeline: SealEvent[];
}

// 涨停分组返回
export interface LimitUpGroupsResponse {
  normalStocks: LimitUpStock[];
  stStocks: LimitUpStock[];
  noLimitStocks: LimitUpStock[];
}

// 炸板板块统计
export interface LimitBrokenSectorStat {
  industry: string;
  brokenCount: number;
  sealCount: number;
  brokenRate: number;
  sealRate: number;
}

// 行情状态
export interface MarketStatus {
  status: 'trading' | 'midday_break' | 'closed' | 'pre_market';
  currentTime: string;
  nextSession: string;
  isDelayed: boolean;
  delaySeconds: number;
}

// 情绪指标
export interface MarketSentiment {
  limitUpCount: number;
  limitDownCount: number;
  brokenCount: number;
  brokenRate: number;
  sealRate: number;
  maxConsecutive: number;
  promotionRate: number;
  stLimitUpCount: number;
}

// 选股结果
export interface ScreenResult {
  code: string;
  name: string;
  market: 'sh' | 'sz' | 'bj';
  board: 'main' | 'gem' | 'star' | 'bj';
  price: number;
  changePercent: number;
  tier: 'core' | 'important' | 'watch' | 'pending';
  reasons: string[];
  sources: string[];
  industry: string;
  marketCap: number;
  pe: number;
  pb: number;
  roe: number;
}

// 个股研究
export interface StockResearch {
  code: string;
  name: string;
  overview: StockOverview;
  deepReport: DeepReport;
}

export interface StockOverview {
  companyInfo: {
    fullName: string;
    shortName: string;
    code: string;
    listingDate: string;
    exchange: string;
    industry: string;
    mainBusiness: string;
  };
  latestQuote: {
    price: number;
    changePercent: number;
    marketCap: number;
    floatMarketCap: number;
    pe: number;
    pb: number;
    turnover: number;
    amount: number;
  };
  coreFinancial: {
    revenue: number;
    revenueGrowth: number;
    netProfit: number;
    netProfitGrowth: number;
    roe: number;
    roa: number;
    grossMargin: number;
    netMargin: number;
    debtRatio: number;
  };
  valuation: {
    pe: number;
    pePercentile: number;
    pb: number;
    pbPercentile: number;
    ps: number;
    dividendYield: number;
  };
  riskTags: string[];
}

export interface DeepReport {
  businessModel: ReportSection;
  competitiveAdvantage: ReportSection;
  financialQuality: ReportSection;
  valuationFramework: ReportSection;
  bearCase: ReportSection;
  falsificationSignals: ReportSection;
}

export interface ReportSection {
  title: string;
  content: string;
  evidence: EvidenceItem[];
}

export interface EvidenceItem {
  content: string;
  level: 'primary' | 'structured' | 'secondary';
  source: string;
  date: string;
}

// 多股对比
export interface StockCompare {
  stocks: string[];
  pricePerformance: {
    [code: string]: {
      day1: number;
      day5: number;
      day20: number;
      day60: number;
      yearToDate: number;
    };
  };
  financialSnapshot: {
    [code: string]: {
      revenue: number;
      netProfit: number;
      roe: number;
      grossMargin: number;
      netMargin: number;
      debtRatio: number;
    };
  };
  valuation: {
    [code: string]: {
      pe: number;
      pb: number;
      ps: number;
      dividendYield: number;
    };
  };
  priceChartData: {
    dates: string[];
    series: { code: string; name: string; data: number[] }[];
  };
  diffExplanation: string;
}

// 板块信息
export interface SectorInfo {
  code: string;
  name: string;
  changePercent: number;
  leaderStock: string;
  amount: number;
}

// 列表响应
export interface ListResponse<T> {
  items: T[];
  total: number;
  page?: number;
  pageSize?: number;
}

// ===== 监控覆盖度（确认沪市主板/深市主板/创业板/科创板/北交所均无遗漏）=====
export interface BoardCoverage {
  market: 'sh' | 'sz' | 'bj';
  board: 'main' | 'gem' | 'star' | 'bj';
  label: string;
  count: number;
  sampleCodes: string[];
}

export interface MarketCoverage {
  total: number;
  updatedAt: number;
  boards: BoardCoverage[];
}

// 自选股
export interface WatchlistStock {
  id: string;
  stockCode: string;
  stockName: string;
  notes: string;
  tags: string[];
  createdAt: string;
}

// 选股策略
export interface ScreenStrategy {
  id: string;
  name: string;
  description: string;
  conditions: ScreenConditions;
  isPublic: boolean;
  createdAt: string;
}

export interface ScreenConditions {
  industry?: string[];
  concept?: string[];
  peMin?: number;
  peMax?: number;
  pbMin?: number;
  pbMax?: number;
  roeMin?: number;
  revenueGrowthMin?: number;
  profitGrowthMin?: number;
  turnoverMin?: number;
  turnoverMax?: number;
  amountMin?: number;
  amountMax?: number;
  changeMin?: number;
  changeMax?: number;
  marketCapMin?: number;
  marketCapMax?: number;
  dividendMin?: number;
}

// 选股策略创建/更新 DTO
export interface CreateScreenStrategyDto {
  name: string;
  description?: string;
  conditions: ScreenConditions;
  isPublic?: boolean;
}

export interface UpdateScreenStrategyDto {
  name?: string;
  description?: string;
  conditions?: ScreenConditions;
  isPublic?: boolean;
}

// 预警设置
export type AlertType = 'surge' | 'limit_up_broken' | 'price';

export interface SurgeAlertConfig {
  soundEnabled: boolean;
  popupEnabled: boolean;
  surgeThreshold: number;
}

export interface LimitUpBrokenAlertConfig {
  soundEnabled: boolean;
  popupEnabled: boolean;
  watchlistOnly: boolean;
}

export interface PriceAlertConfig {
  soundEnabled: boolean;
  popupEnabled: boolean;
  alerts: PriceAlertItem[];
}

export interface PriceAlertItem {
  stockCode: string;
  stockName: string;
  above?: number;
  below?: number;
}

export type AlertConfig = SurgeAlertConfig | LimitUpBrokenAlertConfig | PriceAlertConfig;

export interface AlertSetting {
  id?: string;
  alertType: AlertType;
  enabled: boolean;
  config: AlertConfig;
  createdAt?: string;
}

export interface UpdateAlertSettingDto {
  config: AlertConfig;
  enabled?: boolean;
}

// 报告历史
export type ReportType = 'research' | 'compare';

export interface ReportHistorySection {
  title: string;
  content: string;
  evidenceLevel: string;
  source?: string;
  date?: string;
}

export interface ReportContent {
  summary?: string;
  sections?: ReportHistorySection[];
}

export interface ReportHistory {
  id: string;
  reportType: ReportType;
  title: string;
  stockCodes: string[];
  content: ReportContent;
  createdAt: string;
}

export interface CreateReportHistoryDto {
  reportType: ReportType;
  title: string;
  stockCodes?: string[];
  content: ReportContent;
}
