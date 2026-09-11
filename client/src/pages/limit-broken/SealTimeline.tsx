import { Lock, Unlock, RotateCcw } from 'lucide-react';
import type { SealEvent } from '@shared/api.interface';

interface SealTimelineProps {
  events: SealEvent[];
  limitUpPrice: number;
}

const EVENT_CONFIG: Record<
  SealEvent['type'],
  { label: string; icon: typeof Lock; color: string; dotColor: string }
> = {
  seal: {
    label: '首次封板',
    icon: Lock,
    color: 'text-fall',
    dotColor: 'bg-fall',
  },
  reseal: {
    label: '回封成功',
    icon: RotateCcw,
    color: 'text-fall',
    dotColor: 'bg-fall',
  },
  break: {
    label: '炸板开板',
    icon: Unlock,
    color: 'text-rise',
    dotColor: 'bg-rise',
  },
};

function formatAmount(amount: number): string {
  if (amount >= 1e8) return `${(amount / 1e8).toFixed(2)}亿`;
  if (amount >= 1e4) return `${(amount / 1e4).toFixed(2)}万`;
  return amount.toFixed(2);
}

const SealTimeline = ({ events, limitUpPrice }: SealTimelineProps) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-center py-4 text-text-muted text-xs">
        暂无时间线数据
      </div>
    );
  }

  return (
    <div className="relative pl-6">
      {/* 竖线 */}
      <div className="absolute left-[7px] top-1 bottom-1 w-px bg-border-color" />

      <div className="flex flex-col gap-4">
        {events.map((event: SealEvent, index: number) => {
          const config = EVENT_CONFIG[event.type];
          const Icon = config.icon;
          const isLast = index === events.length - 1;

          return (
            <div key={`${event.time}-${index}`} className="relative flex gap-3">
              {/* 节点圆点 */}
              <div
                className={`absolute -left-6 top-0.5 w-4 h-4 rounded-full ${config.dotColor} border-2 border-bg-secondary flex items-center justify-center z-10`}
              >
                <Icon size={10} className="text-bg-secondary" />
              </div>

              {/* 内容 */}
              <div className="flex-1 flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`text-xs font-medium ${config.color}`}
                  >
                    {event.type === 'seal' && index > 0
                      ? '回封'
                      : config.label}
                  </span>
                  <span className="font-mono tabular-nums text-text-muted text-xs">
                    {event.time}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <div className="flex items-center gap-1">
                    <span className="text-text-muted">价格:</span>
                    <span
                      className={`font-mono tabular-nums ${
                        event.price >= limitUpPrice ? 'text-rise' : 'text-text-primary'
                      }`}
                    >
                      {event.price.toFixed(2)}
                    </span>
                  </div>
                  {event.sealAmount !== undefined && (
                    <div className="flex items-center gap-1">
                      <span className="text-text-muted">封单:</span>
                      <span className="font-mono tabular-nums text-text-secondary">
                        {formatAmount(event.sealAmount)}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {isLast && (
                <div className="absolute -left-6 bottom-0 w-4 flex justify-center">
                  <div className="w-0.5 h-full bg-bg-secondary" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SealTimeline;
