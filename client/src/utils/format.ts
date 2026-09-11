/**
 * 数字格式化工具函数
 */

type CSSPropertiesLike = { [key: string]: string | number };

/** 价格：保留 2 位小数 */
export function formatPrice(value: number): string {
  return value.toFixed(2);
}

/** 百分比：保留 2 位小数 + % 号，自动带正负号 */
export function formatPercent(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/** 成交额：小于 1 亿显示 X.XX 万，大于等于 1 亿显示 X.XX 亿 */
export function formatAmount(value: number): string {
  if (value >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (value >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return value.toFixed(0);
}

/** 换手率：保留 2 位小数 + % */
export function formatTurnover(value: number): string {
  return `${value.toFixed(2)}%`;
}

/** 获取涨跌颜色 class：涨红跌绿平灰 */
export function getPriceColorClass(value: number): string {
  if (value > 0) return 'text-rise';
  if (value < 0) return 'text-fall';
  return 'text-flat';
}

/** 涨速背景强度：根据涨速百分比返回红色背景强度 */
export function getSurgeBgStyle(surgePercent: number): CSSPropertiesLike {
  const clamped = Math.min(Math.max(surgePercent, 0), 10);
  const intensity = clamped / 10; // 0 ~ 1
  const alpha = 0.08 + intensity * 0.25; // 0.08 ~ 0.33
  return {
    backgroundColor: `rgba(248, 81, 73, ${alpha})`,
  };
}

/** 市值：小于 1 亿显示 X.XX 万，大于等于 1 亿显示 X.XX 亿，大于等于 1 万亿显示 X.XX 万亿 */
export function formatMarketCap(value: number): string {
  if (value >= 1e12) {
    return `${(value / 1e12).toFixed(2)}万亿`;
  }
  if (value >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (value >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return value.toFixed(0);
}

/** 数值：较大数字简化显示（营收/净利润等），保留 2 位小数 */
export function formatValue(value: number): string {
  if (Math.abs(value) >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (Math.abs(value) >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return value.toFixed(2);
}

/** 比率/倍数：保留 2 位小数 */
export function formatRatio(value: number): string {
  return value.toFixed(2);
}
