/**
 * 涨停页专用格式化工具
 * 通用格式化请使用 @client/src/utils/format
 */

// 百分比（无符号，2 位小数 + %）
export function formatPercentPlain(value: number): string {
  return `${value.toFixed(2)}%`;
}

// 市值：亿单位
export function formatMarketCap(value: number): string {
  return `${(value / 1e8).toFixed(2)}亿`;
}

// 封单强度文字
export function sealStrengthText(strength: 'strong' | 'medium' | 'weak'): string {
  const map: Record<string, string> = {
    strong: '强',
    medium: '中',
    weak: '弱',
  };
  return map[strength] ?? strength;
}

// 状态文字
export function statusText(status: 'sealing' | 'broken' | 'resealed'): string {
  const map: Record<string, string> = {
    sealing: '封板中',
    broken: '已炸板',
    resealed: '已回封',
  };
  return map[status] ?? status;
}

// 连板描述
export function consecutiveText(days: number): string {
  if (days <= 1) return '首板';
  return `${days}连板`;
}
