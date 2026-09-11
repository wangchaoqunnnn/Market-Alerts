/* A 股「交易所 + 板块」识别规则（前后端共用）
 *
 * 覆盖范围（要求：主板、创业板、科创板、北交所等所有交易所股票，不得遗漏）：
 *   沪市主板   600xxx / 601xxx / 603xxx / 605xxx
 *   沪市科创板 688xxx / 689xxx（689 为存托凭证 CDR，如 689009）
 *   深市主板   000xxx / 001xxx / 002xxx（原中小板已并入主板）/ 003xxx
 *   深市创业板 300xxx / 301xxx
 *   北交所     430xxx / 83xxxx / 87xxxx / 920xxx（920 为 2024 年启用的新号段）
 *
 * 不属于交易所 A 股范围（识别为 null，不纳入监控）：
 *   900xxx（沪市 B 股）、200xxx（深市 B 股）
 *   400xxx / 88xxxx（全国股转系统 新三板，非交易所上市）
 *   基金 / ETF / 可转债等（11xxxx、12xxxx、5xxxxx、1xxxxx 等）
 */

export type Market = 'sh' | 'sz' | 'bj';
export type Board = 'main' | 'gem' | 'star' | 'bj';

/** 板块展示名（简称） */
export const BOARD_LABELS: Record<Board, string> = {
  main: '主板',
  gem: '创业板',
  star: '科创板',
  bj: '北交所',
};

/** 交易所全称 */
export const MARKET_LABELS: Record<Market, string> = {
  sh: '上海证券交易所',
  sz: '深圳证券交易所',
  bj: '北京证券交易所',
};

/** 板块展示顺序（主板 → 创业板 → 科创板 → 北交所） */
export const BOARD_ORDER: Board[] = ['main', 'gem', 'star', 'bj'];

interface CodeRange {
  market: Market;
  board: Board;
  start: number;
  end: number;
}

/** 号段表：闭区间，按 6 位数字代码判断 */
const A_SHARE_CODE_RANGES: CodeRange[] = [
  { market: 'sh', board: 'main', start: 600000, end: 600999 },
  { market: 'sh', board: 'main', start: 601000, end: 601999 },
  { market: 'sh', board: 'main', start: 603000, end: 603999 },
  { market: 'sh', board: 'main', start: 605000, end: 605999 },
  { market: 'sh', board: 'star', start: 688000, end: 688999 },
  { market: 'sh', board: 'star', start: 689000, end: 689999 },
  // 深市主板：000xxx / 001xxx / 002xxx / 003xxx
  { market: 'sz', board: 'main', start: 0, end: 3999 },
  { market: 'sz', board: 'gem', start: 300000, end: 301999 },
  { market: 'bj', board: 'bj', start: 430000, end: 439999 },
  { market: 'bj', board: 'bj', start: 830000, end: 839999 },
  { market: 'bj', board: 'bj', start: 870000, end: 879999 },
  { market: 'bj', board: 'bj', start: 920000, end: 929999 },
];

/**
 * 统一代码格式：支持 '600519'、'sh600519'、'600519.SH'、'SZ.000001' 等写法，返回 6 位数字代码。
 * 非法输入返回 null。
 */
export function normalizeStockCode(input: string): string | null {
  if (input === undefined || input === null) return null;
  let raw: string = String(input).trim().toUpperCase();
  if (!raw) return null;
  raw = raw.replace(/^(SH|SZ|BJ)[.\-\s]?/, '').replace(/[.\-\s](SH|SZ|BJ)$/, '');
  if (!/^\d{6}$/.test(raw)) return null;
  return raw;
}

/** 判断是否为交易所 A 股代码，并返回所属交易所与板块 */
export function classifyAShareCode(input: string): { market: Market; board: Board } | null {
  const code: string | null = normalizeStockCode(input);
  if (!code) return null;
  const num: number = Number(code);
  for (const range of A_SHARE_CODE_RANGES) {
    if (num >= range.start && num <= range.end) {
      return { market: range.market, board: range.board };
    }
  }
  return null;
}

/** 是否为交易所 A 股代码（含沪深主板、创业板、科创板、北交所） */
export function isAShareCode(input: string): boolean {
  return classifyAShareCode(input) !== null;
}

export interface PriceLimit {
  limitUpPercent: number;
  limitDownPercent: number;
}

/**
 * 各板块涨跌幅限制（现行规则）：
 *   沪深主板 10%（ST 5%）
 *   创业板 / 科创板 20%（ST 亦为 20%）
 *   北交所 30%
 */
export function getPriceLimit(board: Board, isST: boolean = false): PriceLimit {
  if (board === 'bj') return { limitUpPercent: 0.3, limitDownPercent: 0.3 };
  if (board === 'gem' || board === 'star') return { limitUpPercent: 0.2, limitDownPercent: 0.2 };
  const pct: number = isST ? 0.05 : 0.1;
  return { limitUpPercent: pct, limitDownPercent: pct };
}

/** 板块简称（兼容 undefined/未知值，默认按主板展示） */
export function boardLabel(board?: string): string {
  if (board === 'gem') return BOARD_LABELS.gem;
  if (board === 'star') return BOARD_LABELS.star;
  if (board === 'bj') return BOARD_LABELS.bj;
  return BOARD_LABELS.main;
}

/** 带交易所的板块全称：沪市主板 / 深市主板 / 创业板 / 科创板 / 北交所 */
export function boardFullLabel(market?: string, board?: string): string {
  if (board === 'gem') return BOARD_LABELS.gem;
  if (board === 'star') return BOARD_LABELS.star;
  if (board === 'bj') return BOARD_LABELS.bj;
  if (market === 'sh') return '沪市主板';
  if (market === 'sz') return '深市主板';
  return BOARD_LABELS.main;
}
