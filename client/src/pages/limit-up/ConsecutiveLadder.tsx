import { useState } from 'react';
import { ChevronDown, ChevronUp, Layers, Clock } from 'lucide-react';
import type { LimitUpStock } from '@shared/api.interface';

interface ConsecutiveLadderProps {
  stocks: LimitUpStock[];
  onSelectStock: (stock: LimitUpStock) => void;
}

interface TierGroup {
  label: string;
  minDays: number;
  maxDays: number;
  color: string;
}

const tiers: TierGroup[] = [
  { label: '5板及以上', minDays: 5, maxDays: 999, color: 'text-rise' },
  { label: '4板', minDays: 4, maxDays: 4, color: 'text-rise' },
  { label: '3板', minDays: 3, maxDays: 3, color: 'text-rise-light' },
  { label: '2板', minDays: 2, maxDays: 2, color: 'text-warning' },
  { label: '首板', minDays: 1, maxDays: 1, color: 'text-text-secondary' },
];

function groupByTier(stocks: LimitUpStock[]): Map<string, LimitUpStock[]> {
  const groups = new Map<string, LimitUpStock[]>();
  for (const tier of tiers) {
    groups.set(tier.label, []);
  }
  for (const stock of stocks) {
    for (const tier of tiers) {
      if (stock.consecutiveDays >= tier.minDays && stock.consecutiveDays <= tier.maxDays) {
        const list = groups.get(tier.label) ?? [];
        list.push(stock);
        groups.set(tier.label, list);
        break;
      }
    }
  }
  return groups;
}

const PREVIEW_COUNT = 6;

const ConsecutiveLadder = ({ stocks, onSelectStock }: ConsecutiveLadderProps) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const groups = groupByTier(stocks);

  const toggleTier = (label: string) => {
    setExpanded((prev) => ({ ...prev, [label]: !prev[label] }));
  };

  return (
    <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border-color">
        <Layers size={16} className="text-rise" />
        <span className="text-base font-medium text-text-primary">连板梯队</span>
        <span className="text-xs text-text-muted">
          共 {stocks.length} 只涨停
        </span>
      </div>

      <div className="flex flex-col gap-0">
        {tiers.map((tier) => {
          const list = groups.get(tier.label) ?? [];
          const isExpanded = expanded[tier.label];
          const displayList = isExpanded ? list : list.slice(0, PREVIEW_COUNT);

          return (
            <div
              key={tier.label}
              className="border-b border-border-color/60 last:border-b-0"
            >
              <div className="flex items-stretch">
                {/* 连板标签 */}
                <div className="flex-shrink-0 w-20 md:w-24 flex flex-col items-center justify-center py-3 border-r border-border-color/60 bg-bg-tertiary/30">
                  <div className={`text-lg md:text-xl font-bold font-mono ${tier.color}`}>
                    {tier.label.replace('板及以上', '+').replace('首板', '1')}
                  </div>
                  <div className="text-[10px] text-text-muted mt-0.5">
                    {list.length} 只
                  </div>
                </div>

                {/* 股票名称横向滚动 */}
                <div className="flex-1 min-w-0 px-3 py-2">
                  <div className="flex flex-wrap gap-1.5">
                    {displayList.length === 0 ? (
                      <div className="text-xs text-text-muted py-2">暂无</div>
                    ) : (
                      displayList.map((stock) => (
                         <button
                           key={stock.code}
                           onClick={() => onSelectStock(stock)}
                           className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                             stock.status === 'broken'
                               ? 'border-warning/30 bg-warning/10 text-warning hover:bg-warning/20'
                               : stock.status === 'resealed'
                               ? 'border-fall/30 bg-fall/10 text-fall hover:bg-fall/20'
                               : 'border-rise/30 bg-rise/10 text-rise hover:bg-rise/20'
                           }`}
                         >
                           <span className="font-medium">{stock.name}</span>
                           {stock.isLateSeal && (
                             <span className="ml-1 inline-flex items-center gap-0.5 opacity-90">
                               <Clock size={10} />
                             </span>
                           )}
                           {stock.openCount > 0 && (
                             <span className="ml-1 opacity-70">
                               {stock.openCount}炸
                             </span>
                           )}
                         </button>
                      ))
                    )}
                  </div>
                </div>

                {/* 展开按钮 */}
                {list.length > PREVIEW_COUNT && (
                  <div className="flex-shrink-0 flex items-center pr-3">
                    <button
                      onClick={() => toggleTier(tier.label)}
                      className="flex items-center gap-0.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
                    >
                      {isExpanded ? (
                        <>
                          收起
                          <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          查看全部
                          <ChevronDown size={14} />
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ConsecutiveLadder;
