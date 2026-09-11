import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@client/src/components/ui/dialog';
import { Calendar, Clock, TrendingUp, Zap, AlertTriangle } from 'lucide-react';
import type { LimitUpStock, SealEvent } from '@shared/api.interface';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  formatTurnover,
} from '@client/src/utils/format';
import {
  formatMarketCap,
  sealStrengthText,
  statusText,
  consecutiveText,
} from './utils/format';

interface StockDetailDialogProps {
  stock: LimitUpStock | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// 生成连板日历（最近 10 天，模拟数据：最后 consecutiveDays 天为涨停）
function generateConsecutiveCalendar(days: number): { date: string; isLimitUp: boolean }[] {
  const result: { date: string; isLimitUp: boolean }[] = [];
  const today = new Date();
  for (let i = 9; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    // 跳过周末
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const isLimitUp = i < days;
    result.push({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      isLimitUp,
    });
    if (result.length >= 7) break;
  }
  // 如果不够7天，往前补
  while (result.length < 7) {
    const d = new Date(today);
    d.setDate(d.getDate() - 10 - (7 - result.length));
    result.unshift({
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      isLimitUp: false,
    });
  }
  return result;
}

const eventTypeConfig: Record<SealEvent['type'], { label: string; color: string; icon: React.ReactNode }> = {
  seal: {
    label: '首次封板',
    color: 'text-rise bg-rise/20 border-rise/40',
    icon: <TrendingUp size={14} />,
  },
  break: {
    label: '炸板',
    color: 'text-warning bg-warning/20 border-warning/40',
    icon: <AlertTriangle size={14} />,
  },
  reseal: {
    label: '回封',
    color: 'text-fall bg-fall/20 border-fall/40',
    icon: <Zap size={14} />,
  },
};

const StockDetailDialog = ({ stock, open, onOpenChange }: StockDetailDialogProps) => {
  if (!stock) return null;

  const calendar = generateConsecutiveCalendar(stock.consecutiveDays);

  const statusColor =
    stock.status === 'sealing'
      ? 'text-rise'
      : stock.status === 'broken'
      ? 'text-warning'
      : 'text-fall';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-bg-secondary border-border-color text-text-primary max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <DialogTitle className="text-xl font-bold">
                {stock.name}
              </DialogTitle>
              <span className="font-mono text-sm text-text-secondary">
                {stock.code}
              </span>
              {stock.isST && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
                  ST
                </span>
              )}
            </div>
            <div className={`text-2xl font-mono font-bold ${statusColor}`}>
              {formatPercent(stock.changePercent)}
            </div>
          </div>
          <DialogDescription className="flex items-center gap-3 text-xs text-text-muted">
            <span>最新价：{formatPrice(stock.price)}</span>
            <span>涨停价：{formatPrice(stock.limitUpPrice)}</span>
            <span className={statusColor}>{statusText(stock.status)}</span>
          </DialogDescription>
        </DialogHeader>

        {/* 基本信息网格 */}
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 py-2">
          <InfoItem label="连板" value={consecutiveText(stock.consecutiveDays)} valueClass="text-rise font-bold" />
          <InfoItem label="封单金额" value={formatAmount(stock.sealAmount)} />
          <InfoItem label="封单/流通" value={stock.sealFloatRatio.toFixed(2) + '%'} />
          <InfoItem label="封单强度" value={sealStrengthText(stock.sealStrength)} />
          <InfoItem label="成交额" value={formatAmount(stock.amount)} />
          <InfoItem label="换手率" value={formatTurnover(stock.turnover)} />
          <InfoItem label="流通市值" value={formatMarketCap(stock.floatMarketCap)} />
          <InfoItem label="开板次数" value={stock.openCount === 0 ? '--' : `${stock.openCount}次`} valueClass={stock.openCount > 0 ? 'text-warning' : ''} />
          <InfoItem label="首次封板" value={stock.firstSealTime} />
          <InfoItem label="最后封板" value={stock.lastSealTime} />
          <InfoItem label="所属行业" value={stock.industry} />
        </div>

        {/* 涨停原因 */}
        {stock.reason.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-text-primary">涨停原因</div>
            <div className="flex flex-wrap gap-1.5">
              {stock.reason.map((r, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-1 rounded-md bg-rise/10 border border-rise/30 text-rise"
                >
                  {r}
                </span>
              ))}
            </div>
            {stock.sealReasonText && (
              <div className="text-xs text-text-muted leading-relaxed">
                {stock.sealReasonText}
                <span className="ml-1 opacity-70">（仅供参考）</span>
              </div>
            )}
          </div>
        )}

        {/* 连板日历 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Calendar size={14} />
            <span>连板日历</span>
          </div>
          <div className="flex items-end gap-2">
            {calendar.map((day, i) => (
              <div key={i} className="flex flex-col items-center gap-1">
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-medium transition-all ${
                    day.isLimitUp
                      ? 'bg-rise text-white shadow-sm shadow-rise/30'
                      : 'bg-bg-tertiary text-text-muted border border-border-color'
                  }`}
                >
                  {day.isLimitUp ? '涨' : '—'}
                </div>
                <div className="text-[10px] text-text-muted">{day.date}</div>
              </div>
            ))}
          </div>
          <div className="text-xs text-text-muted">
            最近 {stock.consecutiveDays} 个交易日连续涨停
          </div>
        </div>

        {/* 封板时间线 */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
            <Clock size={14} />
            <span>封板时间线</span>
          </div>
          <div className="relative pl-4 space-y-3">
            {/* 竖线 */}
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border-color" />
            {stock.timeline.map((event, i) => {
              const cfg = eventTypeConfig[event.type];
              return (
                <div key={i} className="relative flex items-start gap-3">
                  {/* 圆点 */}
                  <div
                    className={`absolute -left-4 w-[15px] h-[15px] rounded-full border-2 ${cfg.color} bg-bg-secondary`}
                    style={{ top: '2px' }}
                  />
                  <div className={`flex-1 rounded-md border p-2 ${cfg.color}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-sm font-medium">
                        {cfg.icon}
                        <span>{cfg.label}</span>
                      </div>
                      <div className="font-mono text-xs text-text-muted">
                        {event.time}
                      </div>
                    </div>
                    <div className="text-xs text-text-secondary mt-1 flex items-center gap-3">
                      <span>价格：{formatPrice(event.price)}</span>
                      {event.sealAmount !== undefined && (
                        <span>封单：{formatAmount(event.sealAmount)}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {stock.timeline.length === 0 && (
              <div className="text-xs text-text-muted py-2">暂无封板记录</div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

function InfoItem({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`text-sm font-mono tabular-nums text-text-primary ${valueClass ?? ''}`}>
        {value}
      </div>
    </div>
  );
}

export default StockDetailDialog;
