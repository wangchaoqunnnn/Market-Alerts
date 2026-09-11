import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Star,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Plus,
  Check,
  Download,
  Save,
  Filter,
  BarChart3,
} from 'lucide-react';
import type { ScreenResult } from '@shared/api.interface';
import {
  formatPrice,
  formatPercent,
  getPriceColorClass,
} from '@client/src/utils/format';
import { Badge } from '@client/src/components/ui/badge';
import { Button } from '@client/src/components/ui/button';
import {
  Tabs,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyMedia,
} from '@client/src/components/ui/empty';
import { Spinner } from '@client/src/components/ui/spinner';

type TierFilter = 'all' | 'core' | 'important' | 'watch' | 'pending';
type SortField = 'changePercent' | 'marketCap' | 'pe' | 'roe';
type SortOrder = 'asc' | 'desc';

interface ResultTableProps {
  results: ScreenResult[];
  total: number;
  isLoading: boolean;
  hasSearched: boolean;
  tierFilter: TierFilter;
  onTierFilterChange: (tier: TierFilter) => void;
  sortField: SortField;
  sortOrder: SortOrder;
  onSortChange: (field: SortField, order: SortOrder) => void;
  onSaveStrategy: () => void;
  onExportCsv: () => void;
  watchlist: string[];
  onToggleWatchlist: (code: string, name: string) => void;
}

const TIER_LABELS: Record<TierFilter, string> = {
  all: '全部',
  core: '核心候选',
  important: '重要参与者',
  watch: '观察名单',
  pending: '待验证',
};

const TIER_COLORS: Record<string, { text: string; bg: string; border: string }> = {
  core: { text: 'text-rise', bg: 'bg-rise/10', border: 'border-rise/30' },
  important: { text: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/30' },
  watch: { text: 'text-primary', bg: 'bg-primary/10', border: 'border-primary/30' },
  pending: { text: 'text-text-muted', bg: 'bg-bg-tertiary/50', border: 'border-border-color' },
};

function formatMarketCap(value: number): string {
  if (value >= 1e8) {
    return `${(value / 1e8).toFixed(2)}亿`;
  }
  if (value >= 1e4) {
    return `${(value / 1e4).toFixed(2)}万`;
  }
  return value.toFixed(0);
}

function TierBadge({ tier }: { tier: ScreenResult['tier'] }) {
  const colors = TIER_COLORS[tier];
  const label = TIER_LABELS[tier as TierFilter];
  return (
    <Badge
      variant="outline"
      className={`${colors.text} ${colors.bg} ${colors.border} border`}
    >
      {label}
    </Badge>
  );
}

function ResultRow({
  item,
  isInWatchlist,
  onToggleWatchlist,
  onClick,
}: {
  item: ScreenResult;
  isInWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClick: () => void;
}) {
  const priceColor = getPriceColorClass(item.changePercent);
  const tierColors = TIER_COLORS[item.tier];

  return (
    <div
      className="hidden md:grid grid-cols-12 gap-3 items-center px-4 py-3 border-b border-border-color hover:bg-bg-tertiary/30 transition-colors cursor-pointer"
      onClick={onClick}
    >
      {/* 代码名称 */}
      <div className="col-span-2 flex flex-col">
        <div className="flex items-center gap-2">
          <span className="text-text-primary font-medium text-sm">{item.name}</span>
          <span className="text-text-muted text-xs font-mono">{item.code}</span>
        </div>
        <div className="text-xs text-text-muted mt-0.5">{item.industry}</div>
      </div>

      {/* 价格涨跌幅 */}
      <div className="col-span-1 flex flex-col items-end">
        <span className={`font-mono tabular-nums text-sm font-medium ${priceColor}`}>
          {formatPrice(item.price)}
        </span>
        <span className={`font-mono tabular-nums text-xs ${priceColor}`}>
          {formatPercent(item.changePercent)}
        </span>
      </div>

      {/* 分层徽章 */}
      <div className="col-span-1 flex justify-center">
        <TierBadge tier={item.tier} />
      </div>

      {/* 入选理由 */}
      <div className="col-span-3 flex flex-wrap gap-1">
        {item.reasons.slice(0, 3).map((reason, idx) => (
          <span
            key={idx}
            className={`text-[11px] px-1.5 py-0.5 rounded ${tierColors.bg} ${tierColors.text} border ${tierColors.border}`}
          >
            {reason}
          </span>
        ))}
      </div>

      {/* 来源 */}
      <div className="col-span-1 flex flex-wrap gap-1">
        {item.sources.slice(0, 2).map((src, idx) => (
          <span key={idx} className="text-[10px] text-text-muted bg-bg-tertiary/50 px-1.5 py-0.5 rounded">
            {src}
          </span>
        ))}
      </div>

      {/* 关键指标 */}
      <div className="col-span-2 grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
        <div className="flex justify-between">
          <span className="text-text-muted">市值</span>
          <span className="font-mono tabular-nums text-text-secondary">{formatMarketCap(item.marketCap)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">PE</span>
          <span className="font-mono tabular-nums text-text-secondary">{item.pe.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">PB</span>
          <span className="font-mono tabular-nums text-text-secondary">{item.pb.toFixed(2)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-text-muted">ROE</span>
          <span className="font-mono tabular-nums text-text-secondary">{item.roe.toFixed(1)}%</span>
        </div>
      </div>

      {/* 自选按钮 */}
      <div className="col-span-2 flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist();
          }}
          className={isInWatchlist ? 'text-warning border-warning/40 hover:border-warning' : ''}
        >
          {isInWatchlist ? (
            <>
              <Star size={14} className="fill-warning text-warning" />
              已添加
            </>
          ) : (
            <>
              <Plus size={14} />
              加自选
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function ResultCard({
  item,
  isInWatchlist,
  onToggleWatchlist,
  onClick,
}: {
  item: ScreenResult;
  isInWatchlist: boolean;
  onToggleWatchlist: () => void;
  onClick: () => void;
}) {
  const priceColor = getPriceColorClass(item.changePercent);
  const tierColors = TIER_COLORS[item.tier];

  return (
    <div
      className="md:hidden bg-bg-secondary border border-border-color rounded-lg p-3 space-y-2"
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-text-primary font-medium">{item.name}</span>
            <span className="text-text-muted text-xs font-mono">{item.code}</span>
          </div>
          <div className="text-xs text-text-muted mt-0.5">{item.industry}</div>
        </div>
        <TierBadge tier={item.tier} />
      </div>

      <div className="flex items-baseline gap-2">
        <span className={`font-mono tabular-nums text-lg font-semibold ${priceColor}`}>
          {formatPrice(item.price)}
        </span>
        <span className={`font-mono tabular-nums text-sm ${priceColor}`}>
          {formatPercent(item.changePercent)}
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        {item.reasons.slice(0, 3).map((reason, idx) => (
          <span
            key={idx}
            className={`text-[11px] px-1.5 py-0.5 rounded ${tierColors.bg} ${tierColors.text} border ${tierColors.border}`}
          >
            {reason}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-1 text-xs pt-1 border-t border-border-color">
        <div className="flex flex-col items-center">
          <span className="text-text-muted text-[10px]">市值</span>
          <span className="font-mono tabular-nums text-text-primary">{formatMarketCap(item.marketCap)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-text-muted text-[10px]">PE</span>
          <span className="font-mono tabular-nums text-text-primary">{item.pe.toFixed(1)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-text-muted text-[10px]">PB</span>
          <span className="font-mono tabular-nums text-text-primary">{item.pb.toFixed(2)}</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-text-muted text-[10px]">ROE</span>
          <span className="font-mono tabular-nums text-text-primary">{item.roe.toFixed(1)}%</span>
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-1">
          {item.sources.slice(0, 2).map((src, idx) => (
            <span key={idx} className="text-[10px] text-text-muted bg-bg-tertiary/50 px-1.5 py-0.5 rounded">
              {src}
            </span>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onToggleWatchlist();
          }}
          className={isInWatchlist ? 'text-warning border-warning/40' : ''}
        >
          {isInWatchlist ? (
            <Star size={14} className="fill-warning text-warning" />
          ) : (
            <Plus size={14} />
          )}
          {isInWatchlist ? '已加' : '加自选'}
        </Button>
      </div>
    </div>
  );
}

export function ResultTable({
  results,
  total,
  isLoading,
  hasSearched,
  tierFilter,
  onTierFilterChange,
  sortField,
  sortOrder,
  onSortChange,
  onSaveStrategy,
  onExportCsv,
  watchlist,
  onToggleWatchlist,
}: ResultTableProps) {
  const navigate = useNavigate();

  const filteredResults = tierFilter === 'all'
    ? results
    : results.filter((r) => r.tier === tierFilter);

  const sortedResults = [...filteredResults].sort((a, b) => {
    const valA = a[sortField];
    const valB = b[sortField];
    return sortOrder === 'asc' ? valA - valB : valB - valA;
  });

  const tierCounts = {
    all: results.length,
    core: results.filter((r) => r.tier === 'core').length,
    important: results.filter((r) => r.tier === 'important').length,
    watch: results.filter((r) => r.tier === 'watch').length,
    pending: results.filter((r) => r.tier === 'pending').length,
  };

  const handleSortFieldChange = (field: string) => {
    const newField = field as SortField;
    if (newField === sortField) {
      onSortChange(sortField, sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      onSortChange(newField, 'desc');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top action bar */}
      <div className="flex-shrink-0 border-b border-border-color bg-bg-secondary/50 backdrop-blur">
        <div className="flex flex-col gap-3 px-4 py-3">
          {/* Row 1: count + actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 size={16} className="text-text-secondary" />
              <span className="text-sm text-text-primary">
                共筛选出 <span className="font-mono font-semibold text-primary">{total}</span> 只股票
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onExportCsv} disabled={results.length === 0}>
                <Download size={14} />
                <span className="hidden sm:inline">导出CSV</span>
              </Button>
              <Button variant="outline" size="sm" onClick={onSaveStrategy} disabled={!hasSearched}>
                <Save size={14} />
                <span className="hidden sm:inline">保存策略</span>
              </Button>
            </div>
          </div>

          {/* Row 2: tier tabs + sort */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <Tabs
              value={tierFilter}
              onValueChange={(v) => onTierFilterChange(v as TierFilter)}
              className="w-full sm:w-auto"
            >
              <TabsList className="w-full sm:w-auto overflow-x-auto flex-nowrap">
                {(Object.keys(TIER_LABELS) as TierFilter[]).map((tier) => (
                  <TabsTrigger key={tier} value={tier} className="text-xs whitespace-nowrap">
                    {TIER_LABELS[tier]}
                    <span className="ml-1 text-[10px] text-text-muted font-mono">
                      ({tierCounts[tier]})
                    </span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <Select value={sortField} onValueChange={handleSortFieldChange}>
              <SelectTrigger size="sm" className="w-full sm:w-40">
                <SelectValue placeholder="排序方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="changePercent">
                  <span className="flex items-center gap-1.5">
                    {sortField === 'changePercent' && (sortOrder === 'desc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    按涨幅
                  </span>
                </SelectItem>
                <SelectItem value="marketCap">
                  <span className="flex items-center gap-1.5">
                    {sortField === 'marketCap' && (sortOrder === 'desc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    按市值
                  </span>
                </SelectItem>
                <SelectItem value="pe">
                  <span className="flex items-center gap-1.5">
                    {sortField === 'pe' && (sortOrder === 'desc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    按PE
                  </span>
                </SelectItem>
                <SelectItem value="roe">
                  <span className="flex items-center gap-1.5">
                    {sortField === 'roe' && (sortOrder === 'desc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                    按ROE
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table header (desktop only) */}
      <div className="hidden md:grid grid-cols-12 gap-3 px-4 py-2 border-b border-border-color bg-bg-tertiary/30 flex-shrink-0">
        <div className="col-span-2 text-xs font-medium text-text-secondary">代码 / 名称 / 行业</div>
        <div className="col-span-1 text-xs font-medium text-text-secondary text-right">价格 / 涨跌</div>
        <div className="col-span-1 text-xs font-medium text-text-secondary text-center">分层</div>
        <div className="col-span-3 text-xs font-medium text-text-secondary">入选理由</div>
        <div className="col-span-1 text-xs font-medium text-text-secondary">来源</div>
        <div className="col-span-2 text-xs font-medium text-text-secondary">关键指标</div>
        <div className="col-span-2 text-xs font-medium text-text-secondary text-right">操作</div>
      </div>

      {/* Results body */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <Spinner className="text-primary w-8 h-8" />
            <div className="text-sm text-text-secondary">正在筛选股票，请稍候...</div>
          </div>
        ) : !hasSearched ? (
          <Empty className="border-0 py-16">
            <EmptyMedia variant="icon" className="bg-bg-tertiary text-text-muted">
              <Filter size={24} />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>开始选股</EmptyTitle>
              <EmptyDescription>
                请在左侧设置筛选条件，点击"开始选股"按钮
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : sortedResults.length === 0 ? (
          <Empty className="border-0 py-16">
            <EmptyMedia variant="icon" className="bg-bg-tertiary text-text-muted">
              <BarChart3 size={24} />
            </EmptyMedia>
            <EmptyHeader>
              <EmptyTitle>未找到符合条件的股票</EmptyTitle>
              <EmptyDescription>
                试试放宽筛选条件，或者切换到其他分层标签
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="md:block space-y-2 md:space-y-0 p-2 md:p-0">
            {/* Desktop: table rows */}
            <div className="hidden md:block">
              {sortedResults.map((item) => (
                <ResultRow
                  key={item.code}
                  item={item}
                  isInWatchlist={watchlist.includes(item.code)}
                  onToggleWatchlist={() => onToggleWatchlist(item.code, item.name)}
                  onClick={() => navigate(`/research/${item.code}`)}
                />
              ))}
            </div>
            {/* Mobile: cards */}
            <div className="md:hidden space-y-2">
              {sortedResults.map((item) => (
                <ResultCard
                  key={item.code}
                  item={item}
                  isInWatchlist={watchlist.includes(item.code)}
                  onToggleWatchlist={() => onToggleWatchlist(item.code, item.name)}
                  onClick={() => navigate(`/research/${item.code}`)}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
