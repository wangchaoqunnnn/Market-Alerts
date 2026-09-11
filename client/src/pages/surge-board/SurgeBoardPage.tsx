import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Zap,
  TrendingUp,
  Clock,
  Activity,
  Pause,
  Play,
  Building2,
  AlertTriangle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { marketDataApi } from '@client/src/api';
import { Badge } from '@client/src/components/ui/badge';
import { Switch } from '@client/src/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@client/src/components/ui/toggle-group';
import type { SurgeItem, SectorInfo, MarketStatus } from '@shared/api.interface';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  formatTurnover,
  getPriceColorClass,
  getSurgeBgStyle,
} from '@client/src/utils/format';

const WINDOW_OPTIONS = [1, 3, 5, 10] as const;
const THRESHOLD_OPTIONS = [0.5, 1, 2, 3, 5] as const;
const LIMIT_OPTIONS = [50, 100, 0] as const; // 0 = 全部

const SurgeBoardPage = () => {
  const navigate = useNavigate();

  // 控制状态
  const [windowMinutes, setWindowMinutes] = useState<number>(5);
  const [selectedThresholds, setSelectedThresholds] = useState<number[]>([]);
  const [selectedSector, setSelectedSector] = useState<string>('all');
  const [excludeST, setExcludeST] = useState<boolean>(true);
  const [onlyWatchlist, setOnlyWatchlist] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [limit, setLimit] = useState<number>(50);

  // 记录上一次数据用于闪烁动画
  const prevDataRef = useRef<Map<string, { surgePercent: number; price: number; changePercent: number }>>(new Map());
  const [flashKeys, setFlashKeys] = useState<Set<string>>(new Set());

  const threshold = selectedThresholds.length > 0 ? Math.max(...selectedThresholds) : undefined;
  const sectorParam = selectedSector && selectedSector !== 'all' ? selectedSector : undefined;
  const limitParam = limit === 0 ? undefined : limit;

  // 获取涨速榜数据
  const {
    data: surgeData = [],
    isLoading,
    isRefetching,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['surgeBoard', windowMinutes, threshold, sectorParam, excludeST, onlyWatchlist, limitParam],
    queryFn: () => marketDataApi.getSurgeBoard({
      windowMinutes,
      threshold,
      sector: sectorParam,
      excludeST,
      onlyWatchlist,
      limit: limitParam,
    }),
    refetchInterval: isPaused ? false : 1000,
    refetchIntervalInBackground: true,
    staleTime: 0,
  });

  // 获取市场状态
  const { data: marketStatus } = useQuery<MarketStatus>({
    queryKey: ['marketStatus'],
    queryFn: () => marketDataApi.getMarketStatus(),
    refetchInterval: 30000, // 每30秒刷新
    refetchIntervalInBackground: true,
    staleTime: 15000,
  });

  // 获取板块列表
  const { data: sectors = [] } = useQuery<SectorInfo[]>({
    queryKey: ['sectors'],
    queryFn: () => marketDataApi.getSectors(),
    staleTime: 60_000,
  });

  // 检测数据变化，触发闪烁动画
  useEffect(() => {
    if (!surgeData || surgeData.length === 0) return;

    const prev = prevDataRef.current;
    const changed = new Set<string>();

    for (const item of surgeData) {
      const key = item.code;
      const old = prev.get(key);
      if (old) {
        if (
          old.surgePercent !== item.surgePercent ||
          old.price !== item.price ||
          old.changePercent !== item.changePercent
        ) {
          changed.add(key);
        }
      }
    }

    if (changed.size > 0) {
      setFlashKeys(changed);
      const timer = setTimeout(() => setFlashKeys(new Set()), 500);
      return () => clearTimeout(timer);
    }
  }, [surgeData]);

  // 保存上一次数据
  useEffect(() => {
    if (surgeData && surgeData.length > 0) {
      prevDataRef.current = new Map(
        surgeData.map((item: SurgeItem) => [
          item.code,
          {
            surgePercent: item.surgePercent,
            price: item.price,
            changePercent: item.changePercent,
          },
        ]),
      );
    }
  }, [surgeData]);

  // 阈值筛选：取最高选中的阈值作为下限
  const minThreshold = useMemo(() => {
    if (selectedThresholds.length === 0) return -Infinity;
    return Math.max(...selectedThresholds);
  }, [selectedThresholds]);

  // 过滤后的数据
  const filteredData = useMemo(() => {
    let result: SurgeItem[] = [...surgeData];

    // 涨速阈值过滤
    if (selectedThresholds.length > 0) {
      result = result.filter((item: SurgeItem) => item.surgePercent >= minThreshold);
    }

    // 板块过滤
    if (selectedSector !== 'all') {
      result = result.filter((item: SurgeItem) => item.industry === selectedSector);
    }

    // 排除 ST
    if (excludeST) {
      result = result.filter((item: SurgeItem) => !item.isST);
    }

    // 仅看自选（占位：真实数据需结合自选股列表）
    if (onlyWatchlist) {
      // TODO: 结合 watchlist 数据过滤
      result = result.filter(() => false);
    }

    // 默认按涨速降序
    result.sort(
      (a: SurgeItem, b: SurgeItem) => b.surgePercent - a.surgePercent,
    );
    return result;
  }, [surgeData, selectedThresholds, minThreshold, selectedSector, excludeST, onlyWatchlist]);

  // 统计指标
  const stats = useMemo(() => {
    const countAbove1 = surgeData.filter(
      (item: SurgeItem) => item.surgePercent >= 1,
    ).length;
    const countAbove3 = surgeData.filter(
      (item: SurgeItem) => item.surgePercent >= 3,
    ).length;
    const oneWordCount = surgeData.filter(
      (item: SurgeItem) => item.isOneWordLimitUp,
    ).length;
    const stLimitUpCount = surgeData.filter(
      (item: SurgeItem) => item.isST && item.changePercent >= 4.9,
    ).length;

    return { countAbove1, countAbove3, oneWordCount, stLimitUpCount };
  }, [surgeData]);

  // 阈值切换（多选）
  const handleThresholdToggle = (value: string) => {
    const num = Number(value);
    setSelectedThresholds((prev) =>
      prev.includes(num) ? prev.filter((t) => t !== num) : [...prev, num],
    );
  };

  // 市场状态显示配置
  const statusConfig: Record<MarketStatus['status'], { label: string; color: string; dotColor: string }> = {
    trading: { label: '交易中', color: 'text-fall', dotColor: 'bg-fall' },
    midday_break: { label: '午间休市', color: 'text-warning', dotColor: 'bg-warning' },
    pre_market: { label: '盘前', color: 'text-text-muted', dotColor: 'bg-text-muted' },
    closed: { label: '休市', color: 'text-text-muted', dotColor: 'bg-text-muted' },
  };

  const currentStatus = marketStatus ? statusConfig[marketStatus.status] : statusConfig.closed;

  // 格式化更新时间
  const updateTimeStr = useMemo(() => {
    if (!dataUpdatedAt) return '--:--:--';
    const d = new Date(dataUpdatedAt);
    return d.toLocaleTimeString('zh-CN', { hour12: false });
  }, [dataUpdatedAt]);

  // 获取排名颜色
  const getRankColorClass = (rank: number): string => {
    if (rank === 1) return 'text-rise font-bold';
    if (rank === 2) return 'text-rise-light font-bold';
    if (rank === 3) return 'text-warning font-bold';
    return 'text-text-muted';
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 行情延迟警告 */}
      {marketStatus?.isDelayed && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 flex items-start gap-3">
          <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-warning">
              行情延迟 {marketStatus.delaySeconds} 秒
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              请检查网络连接，数据可能存在滞后
            </div>
          </div>
        </div>
      )}

      {/* 页面标题 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap size={22} className="text-rise" />
            <h1 className="text-xl font-semibold tracking-tight text-text-primary">
              涨速榜
            </h1>
            <span className="px-2 py-0.5 bg-rise-bg text-rise text-xs rounded font-medium">
              实时
            </span>
            {marketStatus && (
              <span className={`flex items-center gap-1.5 text-xs px-2 py-0.5 rounded bg-bg-tertiary ${currentStatus.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${currentStatus.dotColor} ${currentStatus.dotColor === 'bg-fall' ? 'animate-pulse' : ''}`} />
                {currentStatus.label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isRefetching && !isLoading && (
              <span className="flex items-center gap-1 text-xs text-rise">
                <Activity size={12} className="animate-pulse" />
                实时刷新中
              </span>
            )}
            {isPaused && (
              <span className="flex items-center gap-1 text-xs text-text-muted">
                <Pause size={12} />
                已暂停
              </span>
            )}
            <span className="text-xs text-text-muted">
              <Clock size={12} className="inline mr-1 -mt-0.5" />
              {updateTimeStr}
            </span>
          </div>
        </div>
        <p className="text-sm text-text-secondary">
          监控全市场股票{windowMinutes}分钟涨速排名，快速捕捉盘中异动起爆点
        </p>
      </div>

      {/* 顶部统计指标卡片 */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4"
        data-ai-section-type="card-stat"
      >
        {[
          {
            label: '涨速≥1%',
            value: stats.countAbove1,
            icon: <TrendingUp size={16} />,
            color: 'text-rise',
          },
          {
            label: '涨速≥3%',
            value: stats.countAbove3,
            icon: <Zap size={16} />,
            color: 'text-rise-light',
          },
          {
            label: '一字板',
            value: stats.oneWordCount,
            icon: <Activity size={16} />,
            color: 'text-warning',
          },
          {
            label: 'ST涨停',
            value: stats.stLimitUpCount,
            icon: <AlertTriangle size={16} />,
            color: 'text-rise',
          },
        ].map((item, index: number) => (
          <div
            key={index}
            className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4"
          >
            <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
              {item.icon}
              <span>{item.label}</span>
            </div>
            <div
              className={`text-xl md:text-2xl font-mono tabular-nums font-semibold ${item.color}`}
            >
              {item.value}
            </div>
          </div>
        ))}
      </div>

      {/* 顶部控制栏 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
        <div className="flex flex-wrap items-start gap-4 md:gap-6">
          {/* 窗口切换 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-muted">时间窗口</span>
            <ToggleGroup
              type="single"
              value={String(windowMinutes)}
              onValueChange={(val) => val && setWindowMinutes(Number(val))}
              variant="outline"
              size="sm"
            >
              {WINDOW_OPTIONS.map((w) => (
                <ToggleGroupItem key={w} value={String(w)}>
                  {w}分
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

           {/* 涨速阈值 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-muted">涨速阈值</span>
            <div className="flex gap-1">
              {THRESHOLD_OPTIONS.map((t) => {
                const isActive = selectedThresholds.includes(t);
                return (
                  <button
                    key={t}
                    onClick={() => handleThresholdToggle(String(t))}
                    className={`h-8 px-3 text-xs rounded-md border transition-colors ${
                      isActive
                        ? 'bg-rise-bg border-rise/50 text-rise font-medium'
                        : 'bg-transparent border-border-color text-text-secondary hover:border-rise/30 hover:text-rise'
                    }`}
                  >
                    ≥{t}%
                  </button>
                );
              })}
            </div>
          </div>

          {/* 数量切换 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-muted">显示数量</span>
            <div className="flex gap-1">
              {LIMIT_OPTIONS.map((l) => {
                const isActive = limit === l;
                return (
                  <button
                    key={l}
                    onClick={() => setLimit(l)}
                    className={`h-8 px-3 text-xs rounded-md border transition-colors ${
                      isActive
                        ? 'bg-primary/20 border-primary/50 text-primary font-medium'
                        : 'bg-transparent border-border-color text-text-secondary hover:border-primary/30 hover:text-primary'
                    }`}
                  >
                    {l === 0 ? '全部' : `前${l}`}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 板块过滤 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-muted">
              <Building2 size={12} className="inline mr-1 -mt-0.5" />
              行业板块
            </span>
            <Select value={selectedSector} onValueChange={setSelectedSector}>
              <SelectTrigger size="sm" className="w-36 md:w-44">
                <SelectValue placeholder="全部板块" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部板块</SelectItem>
                {sectors.map((sector: SectorInfo) => (
                  <SelectItem key={sector.code} value={sector.name}>
                    {sector.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 筛选开关 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-text-muted">筛选条件</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch
                  checked={onlyWatchlist}
                  onCheckedChange={setOnlyWatchlist}
                />
                <span className="text-sm text-text-secondary">仅看自选</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={excludeST} onCheckedChange={setExcludeST} />
                <span className="text-sm text-text-secondary">排除ST</span>
              </label>
            </div>
          </div>

          {/* 刷新控制 */}
          <div className="flex flex-col gap-1.5 ml-auto">
            <span className="text-xs text-text-muted">刷新控制</span>
            <button
              onClick={() => setIsPaused((p) => !p)}
              className="h-8 px-3 text-xs rounded-md border border-border-color text-text-secondary hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5"
            >
              {isPaused ? (
                <>
                  <Play size={12} />
                  恢复刷新
                </>
              ) : (
                <>
                  <Pause size={12} />
                  暂停刷新
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* 涨速榜单 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-text-secondary" />
            <span className="text-base font-medium text-text-primary">
              {windowMinutes}分钟涨速排名
            </span>
            <span className="text-xs text-text-muted">
              共 {filteredData.length} 只
            </span>
          </div>
        </div>

        {/* 表格 - 横向滚动 */}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-bg-tertiary/50">
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted w-14">
                  排名
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted w-32">
                  代码/名称
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted w-24">
                  最新价
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted w-28">
                  涨速
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted w-24">
                  涨跌幅
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted w-24">
                  成交额
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-text-muted w-20">
                  换手率
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-text-muted w-24">
                  所属行业
                </th>
                <th className="px-4 py-2 text-center text-xs font-medium text-text-muted w-20">
                  标记
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-color/50">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-text-muted text-sm"
                  >
                    加载中...
                  </td>
                </tr>
              ) : filteredData.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-16 text-center"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Zap
                        size={32}
                        className="text-text-muted opacity-40"
                      />
                      <p className="text-text-muted text-sm">
                        当前窗口暂无异动股票
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredData.map((item: SurgeItem, index: number) => {
                  const isFlashing = flashKeys.has(item.code);
                  return (
                    <tr
                      key={item.code}
                      className={`hover:bg-bg-tertiary/40 transition-colors cursor-pointer ${
                        isFlashing ? 'bg-rise-bg/30' : ''
                      }`}
                      onClick={() => navigate(`/research?code=${item.code}`)}
                    >
                      {/* 排名 */}
                      <td className="px-4 py-3">
                        <span
                          className={`font-mono text-sm ${getRankColorClass(index + 1)}`}
                        >
                          {index + 1}
                        </span>
                      </td>

                      {/* 代码 + 名称 */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col">
                          <span className="font-mono text-xs text-text-secondary">
                            {item.code}
                          </span>
                          <span className="text-sm text-text-primary truncate max-w-[120px]">
                            {item.name}
                          </span>
                        </div>
                      </td>

                      {/* 最新价 */}
                      <td
                        className={`px-4 py-3 text-right font-mono tabular-nums text-sm ${getPriceColorClass(
                          item.changePercent,
                        )}`}
                      >
                        {formatPrice(item.price)}
                      </td>

                      {/* 涨速（核心指标） */}
                      <td className="px-4 py-3 text-right">
                        <div
                          className="inline-block px-2 py-1 rounded-md min-w-[72px]"
                          style={getSurgeBgStyle(item.surgePercent)}
                        >
                          <span className="font-mono tabular-nums font-semibold text-rise text-base">
                            {formatPercent(item.surgePercent)}
                          </span>
                          <div className="text-[10px] text-text-muted">
                            /{item.windowMinutes}min
                          </div>
                        </div>
                      </td>

                      {/* 涨跌幅 */}
                      <td
                        className={`px-4 py-3 text-right font-mono tabular-nums text-sm ${getPriceColorClass(
                          item.changePercent,
                        )}`}
                      >
                        {formatPercent(item.changePercent)}
                      </td>

                      {/* 成交额 */}
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-text-secondary">
                        {formatAmount(item.amount)}
                      </td>

                      {/* 换手率 */}
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-sm text-text-secondary">
                        {formatTurnover(item.turnover)}
                      </td>

                      {/* 所属行业 */}
                      <td className="px-4 py-3">
                        <span className="text-xs text-text-secondary truncate block max-w-[100px]">
                          {item.industry}
                        </span>
                      </td>

                      {/* 标记列 */}
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-center gap-1">
                          {item.isST && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-warning/50 text-warning"
                            >
                              ST
                            </Badge>
                          )}
                          {item.isOneWordLimitUp && (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 border-rise/50 text-rise"
                            >
                              一字
                            </Badge>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 免责声明 */}
      <p className="text-center text-xs text-text-muted pt-2 pb-4">
        ⚠ 数据仅供参考，不构成任何投资建议
      </p>
    </div>
  );
};

export default SurgeBoardPage;
