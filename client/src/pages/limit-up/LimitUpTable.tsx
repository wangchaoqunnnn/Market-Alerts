import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Filter,
  Search,
  Clock,
} from 'lucide-react';
import type { LimitUpStock } from '@shared/api.interface';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  formatTurnover,
} from '@client/src/utils/format';
import {
  sealStrengthText,
  statusText,
  consecutiveText,
} from './utils/format';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@client/src/components/ui/select';
import { Input } from '@client/src/components/ui/input';
import { Badge } from '@client/src/components/ui/badge';

interface LimitUpTableProps {
  stocks: LimitUpStock[];
  title: string;
  isST?: boolean;
  onSelectStock: (stock: LimitUpStock) => void;
}

function getSealRatioColorClass(ratio: number): string {
  if (ratio > 100) return 'text-rise font-semibold';
  if (ratio >= 10) return 'text-warning font-medium';
  return 'text-text-muted';
}

type SortKey =
  | 'consecutiveDays'
  | 'sealAmount'
  | 'changePercent'
  | 'amount'
  | 'firstSealTime'
  | 'openCount'
  | 'sealToAmountRatio';
type SortDir = 'asc' | 'desc';

type StatusFilter = 'all' | 'sealing' | 'broken' | 'resealed';
type BoardFilter = 'all' | 'first' | 'consecutive';

const LimitUpTable = ({
  stocks,
  title,
  isST = false,
  onSelectStock,
}: LimitUpTableProps) => {
  const [sortKey, setSortKey] = useState<SortKey>('consecutiveDays');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [boardFilter, setBoardFilter] = useState<BoardFilter>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState<string>('');

  const industries = useMemo(() => {
    const set = new Set<string>();
    for (const s of stocks) set.add(s.industry);
    return Array.from(set).sort();
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    let result = [...stocks];

    if (statusFilter !== 'all') {
      result = result.filter((s) => s.status === statusFilter);
    }
    if (boardFilter === 'first') {
      result = result.filter((s) => s.consecutiveDays <= 1);
    } else if (boardFilter === 'consecutive') {
      result = result.filter((s) => s.consecutiveDays >= 2);
    }
    if (industryFilter !== 'all') {
      result = result.filter((s) => s.industry === industryFilter);
    }
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        (s) =>
          s.code.includes(q) ||
          s.name.toLowerCase().includes(q),
      );
    }

    result.sort((a, b) => {
      let av: number | string = 0;
      let bv: number | string = 0;
      switch (sortKey) {
        case 'consecutiveDays':
          av = a.consecutiveDays;
          bv = b.consecutiveDays;
          if (av === bv) {
            av = a.sealAmount;
            bv = b.sealAmount;
          }
          break;
        case 'sealAmount':
          av = a.sealAmount;
          bv = b.sealAmount;
          break;
        case 'changePercent':
          av = a.changePercent;
          bv = b.changePercent;
          break;
        case 'amount':
          av = a.amount;
          bv = b.amount;
          break;
        case 'firstSealTime':
          av = a.firstSealTime;
          bv = b.firstSealTime;
          break;
        case 'openCount':
          av = a.openCount;
          bv = b.openCount;
          break;
        case 'sealToAmountRatio':
          av = a.sealToAmountRatio;
          bv = b.sealToAmountRatio;
          break;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [stocks, statusFilter, boardFilter, industryFilter, searchText, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ active, dir }: { active: boolean; dir: SortDir }) => {
    if (!active) return <ArrowUpDown size={12} className="text-text-muted" />;
    return dir === 'asc' ? (
      <ArrowUp size={12} className="text-rise" />
    ) : (
      <ArrowDown size={12} className="text-rise" />
    );
  };

  return (
    <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
      {/* 头部 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 px-4 py-3 border-b border-border-color">
        <div className="flex items-center gap-2">
          <span className="text-base font-medium text-text-primary">{title}</span>
          <Badge variant="secondary" className="text-xs">
            {filteredStocks.length} 只
          </Badge>
          {isST && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
              风险提示：ST 股票存在退市风险，请谨慎投资
            </span>
          )}
        </div>

        {/* 筛选器 */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-32 md:w-40">
            <Search
              size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <Input
              placeholder="搜索代码/名称"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-8 h-8 text-xs bg-bg-tertiary border-border-color"
            />
          </div>

          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-8 w-24 text-xs bg-bg-tertiary border-border-color">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent className="bg-bg-secondary border-border-color text-text-primary">
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="sealing">封板中</SelectItem>
              <SelectItem value="broken">炸板</SelectItem>
              <SelectItem value="resealed">已回封</SelectItem>
            </SelectContent>
          </Select>

          <Select value={boardFilter} onValueChange={(v) => setBoardFilter(v as BoardFilter)}>
            <SelectTrigger className="h-8 w-24 text-xs bg-bg-tertiary border-border-color">
              <SelectValue placeholder="连板" />
            </SelectTrigger>
            <SelectContent className="bg-bg-secondary border-border-color text-text-primary">
              <SelectItem value="all">全部</SelectItem>
              <SelectItem value="first">只看首板</SelectItem>
              <SelectItem value="consecutive">只看连板</SelectItem>
            </SelectContent>
          </Select>

          <Select value={industryFilter} onValueChange={setIndustryFilter}>
            <SelectTrigger className="h-8 w-28 text-xs bg-bg-tertiary border-border-color">
              <SelectValue placeholder="行业" />
            </SelectTrigger>
            <SelectContent className="bg-bg-secondary border-border-color text-text-primary max-h-60">
              <SelectItem value="all">全部行业</SelectItem>
              {industries.map((ind) => (
                <SelectItem key={ind} value={ind}>
                  {ind}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Filter size={14} className="text-text-muted hidden md:block" />
        </div>
      </div>

      {/* 表格 - 桌面端 */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-bg-tertiary/50 text-xs text-text-muted font-medium">
              <th className="px-3 py-2 text-left w-16">
                <button
                  className="flex items-center gap-1 hover:text-text-primary"
                  onClick={() => handleSort('consecutiveDays')}
                >
                  连板
                  <SortIcon active={sortKey === 'consecutiveDays'} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 text-left w-32">代码/名称</th>
              <th className="px-3 py-2 text-right w-24">价/涨停价</th>
              <th className="px-3 py-2 text-right w-20">
                <button
                  className="flex items-center gap-1 ml-auto hover:text-text-primary"
                  onClick={() => handleSort('changePercent')}
                >
                  <SortIcon active={sortKey === 'changePercent'} dir={sortDir} />
                  涨幅
                </button>
              </th>
              <th className="px-3 py-2 text-right w-20">
                <button
                  className="flex items-center gap-1 ml-auto hover:text-text-primary"
                  onClick={() => handleSort('firstSealTime')}
                >
                  首封时间
                  <SortIcon active={sortKey === 'firstSealTime'} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 text-right w-20">末封时间</th>
              <th className="px-3 py-2 text-right w-16">
                <button
                  className="flex items-center gap-1 ml-auto hover:text-text-primary"
                  onClick={() => handleSort('openCount')}
                >
                  开板
                  <SortIcon active={sortKey === 'openCount'} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 text-right w-24">
                <button
                  className="flex items-center gap-1 ml-auto hover:text-text-primary"
                  onClick={() => handleSort('sealAmount')}
                >
                  封单额
                  <SortIcon active={sortKey === 'sealAmount'} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 text-center w-16">强度</th>
              <th className="px-3 py-2 text-right w-20">封流比</th>
              <th className="px-3 py-2 text-right w-20">
                <button
                  className="flex items-center gap-1 ml-auto hover:text-text-primary"
                  onClick={() => handleSort('sealToAmountRatio')}
                >
                  封成比
                  <SortIcon active={sortKey === 'sealToAmountRatio'} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 text-right w-20">
                <button
                  className="flex items-center gap-1 ml-auto hover:text-text-primary"
                  onClick={() => handleSort('amount')}
                >
                  成交额
                  <SortIcon active={sortKey === 'amount'} dir={sortDir} />
                </button>
              </th>
              <th className="px-3 py-2 text-right w-16">换手</th>
              <th className="px-3 py-2 text-left w-40">涨停原因</th>
              <th className="px-3 py-2 text-left w-20">行业</th>
              <th className="px-3 py-2 text-center w-16">状态</th>
            </tr>
          </thead>
          <tbody>
            {filteredStocks.length === 0 ? (
              <tr>
                <td colSpan={16} className="px-4 py-12 text-center text-text-muted">
                  暂无符合条件的涨停股
                </td>
              </tr>
            ) : (
              filteredStocks.map((stock) => (
                <tr
                  key={stock.code}
                  className="border-t border-border-color/50 hover:bg-bg-tertiary/40 transition-colors cursor-pointer"
                  onClick={() => onSelectStock(stock)}
                >
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${
                        stock.consecutiveDays >= 5
                          ? 'bg-rise text-white'
                          : stock.consecutiveDays >= 3
                          ? 'bg-rise/80 text-white'
                          : stock.consecutiveDays >= 2
                          ? 'bg-warning/20 text-warning'
                          : 'bg-bg-tertiary text-text-secondary'
                      }`}
                    >
                      {consecutiveText(stock.consecutiveDays)}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <div className="flex items-center gap-1">
                        <span className="text-text-primary font-medium">{stock.name}</span>
                        {stock.isLateSeal && (
                          <span className="flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-warning/20 text-warning">
                            <Clock size={10} />
                            尾盘
                          </span>
                        )}
                      </div>
                      <span className="text-text-muted text-xs font-mono">{stock.code}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    <div className="text-rise font-medium">{formatPrice(stock.price)}</div>
                    <div className="text-text-muted text-xs">{formatPrice(stock.limitUpPrice)}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-rise font-semibold">
                    {formatPercent(stock.changePercent)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary text-xs">
                    {stock.firstSealTime}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary text-xs">
                    {stock.lastSealTime}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                    {stock.openCount === 0 ? (
                      <span className="text-text-muted">--</span>
                    ) : (
                      <span className="text-warning font-medium">{stock.openCount}次</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-rise-light">
                    {formatAmount(stock.sealAmount)}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        stock.sealStrength === 'strong'
                          ? 'bg-rise/20 text-rise border border-rise/40'
                          : stock.sealStrength === 'medium'
                          ? 'bg-warning/20 text-warning border border-warning/40'
                          : 'bg-bg-tertiary text-text-muted border border-border-color'
                      }`}
                    >
                      {sealStrengthText(stock.sealStrength)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                    {stock.sealFloatRatio.toFixed(2)}%
                  </td>
                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${getSealRatioColorClass(stock.sealToAmountRatio)}`}>
                    {stock.sealToAmountRatio.toFixed(2)}%
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-primary">
                    {formatAmount(stock.amount)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono tabular-nums text-text-secondary">
                    {formatTurnover(stock.turnover)}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1 max-w-[160px]">
                      {stock.reason.slice(0, 2).map((r, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 rounded bg-rise/10 text-rise border border-rise/30"
                        >
                          {r}
                        </span>
                      ))}
                      {stock.reason.length > 2 && (
                        <span className="text-[10px] text-text-muted">
                          +{stock.reason.length - 2}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-text-secondary text-xs">
                    {stock.industry}
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        stock.status === 'sealing'
                          ? 'bg-rise/20 text-rise'
                          : stock.status === 'broken'
                          ? 'bg-warning/20 text-warning'
                          : 'bg-fall/20 text-fall'
                      }`}
                    >
                      {statusText(stock.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 表格 - 移动端卡片式 */}
      <div className="md:hidden divide-y divide-border-color/50">
        {filteredStocks.length === 0 ? (
          <div className="px-4 py-12 text-center text-text-muted text-sm">
            暂无符合条件的涨停股
          </div>
        ) : (
          filteredStocks.map((stock) => (
            <div
              key={stock.code}
              className="px-4 py-3 hover:bg-bg-tertiary/40 transition-colors cursor-pointer"
              onClick={() => onSelectStock(stock)}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-text-primary font-medium text-sm">
                    {stock.name}
                  </span>
                  {stock.isLateSeal && (
                    <span className="flex items-center gap-0.5 text-[10px] px-1 py-0.5 rounded bg-warning/20 text-warning">
                      <Clock size={10} />
                      尾盘板
                    </span>
                  )}
                  <span className="text-text-muted text-xs font-mono">
                    {stock.code}
                  </span>
                </div>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                    stock.consecutiveDays >= 3
                      ? 'bg-rise text-white'
                      : stock.consecutiveDays >= 2
                      ? 'bg-warning/20 text-warning'
                      : 'bg-bg-tertiary text-text-secondary'
                  }`}
                >
                  {consecutiveText(stock.consecutiveDays)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-3 font-mono tabular-nums">
                  <span className="text-rise font-medium">
                    {formatPrice(stock.price)}
                  </span>
                  <span className="text-rise font-semibold">
                    {formatPercent(stock.changePercent)}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono tabular-nums text-text-muted">
                  <span>封单 {formatAmount(stock.sealAmount)}</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                      stock.status === 'sealing'
                        ? 'bg-rise/20 text-rise'
                        : stock.status === 'broken'
                        ? 'bg-warning/20 text-warning'
                        : 'bg-fall/20 text-fall'
                    }`}
                  >
                    {statusText(stock.status)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5 text-xs text-text-muted">
                <span>{stock.industry}</span>
                <span>·</span>
                <span>首封 {stock.firstSealTime}</span>
                {stock.openCount > 0 && (
                  <>
                    <span>·</span>
                    <span className="text-warning">{stock.openCount}次炸板</span>
                  </>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default LimitUpTable;
