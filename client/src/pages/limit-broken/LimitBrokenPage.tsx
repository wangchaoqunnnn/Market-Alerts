import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Skull,
  ShieldCheck,
  RotateCcw,
  Clock,
  Zap,
  Star,
  StarOff,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Volume2,
  VolumeX,
  Filter,
  ArrowUpDown,
  Search,
  BarChart3,
  X,
} from 'lucide-react';

import type {
  LimitBrokenStock,
  LimitBrokenSectorStat,
  MarketSentiment,
  SealEvent,
} from '@shared/api.interface';
import { marketDataApi, alertSettings } from '@client/src/api';
import { Switch } from '@client/src/components/ui/switch';
import SealTimeline from './SealTimeline';
import './limit-broken.css';

// --- 工具函数 ---

function formatAmount(amount: number): string {
  if (amount >= 1e8) return `${(amount / 1e8).toFixed(2)}亿`;
  if (amount >= 1e4) return `${(amount / 1e4).toFixed(2)}万`;
  return amount.toFixed(2);
}

function formatPct(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// --- localStorage 自选股 ---

const WATCHLIST_KEY = 'limit_broken_watchlist';

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveWatchlist(codes: string[]): void {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(codes));
  } catch {
    /* ignore */
  }
}

// --- 状态文本/颜色映射 ---

const STATUS_MAP: Record<
  LimitBrokenStock['currentStatus'],
  { label: string; color: string; bg: string }
> = {
  sealing: { label: '封板中', color: 'text-fall', bg: 'bg-fall/10' },
  broken: { label: '炸板中', color: 'text-rise', bg: 'bg-rise/10' },
  resealed: { label: '已回封', color: 'text-warning', bg: 'bg-warning/10' },
};

type StatusFilter = 'all' | 'broken' | 'resealed' | 'sealing';
type BreakCountFilter = 'all' | '1' | '2' | '3+';
type SortKey =
  | 'breakCount'
  | 'lastBreakTime'
  | 'priceDiffFromLimit'
  | 'amount';

const LimitBrokenPage = () => {
  // --- 数据 ---
  const { data: stockList = [], isLoading: listLoading } = useQuery({
    queryKey: ['market-data', 'limit-broken'],
    queryFn: marketDataApi.getLimitBrokenList,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
  });

  const { data: sentiment, isLoading: sentimentLoading } = useQuery({
    queryKey: ['market-data', 'sentiment'],
    queryFn: marketDataApi.getSentiment,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
  });

  // 行业炸板率统计
  const { data: sectorStats = [] } = useQuery({
    queryKey: ['market-data', 'limit-broken', 'sector-stats'],
    queryFn: marketDataApi.getLimitBrokenSectorStats,
    refetchInterval: 5000,
    refetchIntervalInBackground: true,
    staleTime: 3000,
  });

  const queryClient = useQueryClient();

  // --- 本地状态 ---
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist());
  const [watchlistOnly, setWatchlistOnly] = useState<boolean>(false);
  // 降级模式：API 不可用时用 localStorage
  const [alertFallback, setAlertFallback] = useState<boolean>(false);
  const [localAlertEnabled, setLocalAlertEnabled] = useState<boolean>(true);
  const [localSoundEnabled, setLocalSoundEnabled] = useState<boolean>(false);

  // 从后端加载炸板预警设置
  const { data: alertSetting } = useQuery({
    queryKey: ['alert-settings', 'limit_up_broken'],
    queryFn: () => alertSettings.getAlertSetting('limit_up_broken'),
    staleTime: 60_000,
    retry: 1,
  });

  // API 失败时降级
  useEffect(() => {
    if (!alertSetting && alertFallback === false) {
      // 初次加载失败暂不处理，等 query 自己重试
    }
  }, [alertSetting, alertFallback]);

  // 切换预警开关 mutation
  const { mutate: toggleAlert } = useMutation({
    mutationFn: () => alertSettings.toggleAlertSetting('limit_up_broken'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-settings', 'limit_up_broken'] });
    },
    onError: () => {
      setAlertFallback(true);
      toast.warning('预警服务暂不可用，设置仅本地生效');
    },
  });

  // 更新预警配置 mutation
  const { mutate: updateAlertConfig } = useMutation({
    mutationFn: (config: { soundEnabled: boolean; popupEnabled: boolean; watchlistOnly: boolean }) =>
      alertSettings.upsertAlertSetting('limit_up_broken', { config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alert-settings', 'limit_up_broken'] });
    },
    onError: () => {
      setAlertFallback(true);
      toast.warning('预警服务暂不可用，设置仅本地生效');
    },
  });

  // 从 API 或本地状态派生预警配置
  const alertEnabled: boolean = alertFallback
    ? localAlertEnabled
    : alertSetting?.enabled ?? true;
  const soundEnabled: boolean = alertFallback
    ? localSoundEnabled
    : (alertSetting?.config as { soundEnabled?: boolean })?.soundEnabled ?? false;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [breakCountFilter, setBreakCountFilter] =
    useState<BreakCountFilter>('all');
  const [sortKey, setSortKey] = useState<SortKey>('breakCount');
  const [sortDesc, setSortDesc] = useState<boolean>(true);
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  const [flashCodes, setFlashCodes] = useState<Set<string>>(new Set());
  const [prevCodes, setPrevCodes] = useState<Set<string>>(new Set());
  const [prevStatusMap, setPrevStatusMap] = useState<
    Map<string, LimitBrokenStock['currentStatus']>
  >(new Map());
  const [alertedCodes, setAlertedCodes] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState<string>('');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');

  // --- 自选股操作 ---
  const toggleWatchlist = useCallback((code: string) => {
    setWatchlist((prev: string[]) => {
      const next = prev.includes(code)
        ? prev.filter((c: string) => c !== code)
        : [...prev, code];
      saveWatchlist(next);
      return next;
    });
  }, []);

  // --- 回封成功数（从列表计算）---
  const resealedCount = useMemo(
    () => stockList.filter((s: LimitBrokenStock) => s.currentStatus === 'resealed').length,
    [stockList],
  );

  // --- 自选股炸板数 ---
  const watchlistBrokenCount = useMemo(
    () => stockList.filter((s: LimitBrokenStock) => watchlist.includes(s.code)).length,
    [stockList, watchlist],
  );

  // --- 新炸板检测 & 预警 ---
  useEffect(() => {
    if (stockList.length === 0) return;

    const currentStatusMap = new Map<
      string,
      LimitBrokenStock['currentStatus']
    >();
    stockList.forEach((s: LimitBrokenStock) => {
      currentStatusMap.set(s.code, s.currentStatus);
    });

    const newFlash = new Set<string>();
    const newAlerts: LimitBrokenStock[] = [];

    // 检测新出现的炸板股（首次出现在列表中）
    stockList.forEach((s: LimitBrokenStock) => {
      if (!prevCodes.has(s.code) && prevCodes.size > 0) {
        newFlash.add(s.code);
      }
      // 检测状态从 sealing 变为 broken
      const prevStatus = prevStatusMap.get(s.code);
      if (
        prevStatus === 'sealing' &&
        s.currentStatus === 'broken' &&
        !alertedCodes.has(s.code)
      ) {
        newFlash.add(s.code);
        if (alertEnabled && watchlist.includes(s.code)) {
          newAlerts.push(s);
        }
      }
    });

    // 触发闪烁
    if (newFlash.size > 0) {
      setFlashCodes(newFlash);
      const timer = setTimeout(() => setFlashCodes(new Set()), 1500);
      return () => clearTimeout(timer);
    }

    // 触发预警 toast
    newAlerts.forEach((stock: LimitBrokenStock) => {
      toast(`⚠️ 自选股炸板预警：${stock.name}`, {
        description: `代码 ${stock.code} 已炸板，当前涨幅 ${formatPct(stock.changePercent)}，距涨停 ${stock.priceDiffFromLimit.toFixed(2)}%`,
        action: {
          label: '查看',
          onClick: () => setExpandedCode(stock.code),
        },
      });
      if (soundEnabled) {
        // 简单的 beep 提示（Web Audio）
        try {
          const ctx = new (window.AudioContext ||
            (window as unknown as { webkitAudioContext: typeof AudioContext })
              .webkitAudioContext)();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = 880;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
          osc.start(ctx.currentTime);
          osc.stop(ctx.currentTime + 0.3);
        } catch {
          /* ignore */
        }
      }
    });

    if (newAlerts.length > 0) {
      setAlertedCodes((prev: Set<string>) => {
        const next = new Set(prev);
        newAlerts.forEach((s: LimitBrokenStock) => next.add(s.code));
        return next;
      });
    }

    setPrevCodes(new Set(stockList.map((s: LimitBrokenStock) => s.code)));
    setPrevStatusMap(currentStatusMap);
  }, [stockList, alertEnabled, watchlist, soundEnabled, alertedCodes, prevCodes, prevStatusMap]);

  // --- 筛选 & 排序 ---
  const filteredList = useMemo(() => {
    let list = [...stockList];

    // 搜索
    if (searchText.trim()) {
      const kw = searchText.trim().toLowerCase();
      list = list.filter(
        (s: LimitBrokenStock) =>
          s.code.includes(kw) || s.name.toLowerCase().includes(kw),
      );
    }

    // 行业筛选
    if (selectedIndustry !== 'all') {
      list = list.filter((s: LimitBrokenStock) => s.industry === selectedIndustry);
    }

    // 状态筛选
    if (statusFilter !== 'all') {
      list = list.filter(
        (s: LimitBrokenStock) => s.currentStatus === statusFilter,
      );
    }

    // 炸板次数筛选
    if (breakCountFilter === '1') {
      list = list.filter((s: LimitBrokenStock) => s.breakCount === 1);
    } else if (breakCountFilter === '2') {
      list = list.filter((s: LimitBrokenStock) => s.breakCount === 2);
    } else if (breakCountFilter === '3+') {
      list = list.filter((s: LimitBrokenStock) => s.breakCount >= 3);
    }

    // 仅看自选
    if (watchlistOnly) {
      list = list.filter((s: LimitBrokenStock) => watchlist.includes(s.code));
    }

    // 排序
    list.sort((a: LimitBrokenStock, b: LimitBrokenStock) => {
      let cmp = 0;
      switch (sortKey) {
        case 'breakCount':
          cmp = b.breakCount - a.breakCount;
          break;
        case 'lastBreakTime':
          cmp = b.lastBreakTime.localeCompare(a.lastBreakTime);
          break;
        case 'priceDiffFromLimit':
          // 距涨停价差幅（负得越多=跌得越多），按绝对值降序
          cmp = Math.abs(b.priceDiffFromLimit) - Math.abs(a.priceDiffFromLimit);
          break;
        case 'amount':
          cmp = b.amount - a.amount;
          break;
      }
      // 默认二级排序：炸板次数降序
      if (cmp === 0) cmp = b.breakCount - a.breakCount;
      return sortDesc ? cmp : -cmp;
    });

    return list;
  }, [
    stockList,
    statusFilter,
    breakCountFilter,
    watchlistOnly,
    watchlist,
    sortKey,
    sortDesc,
    searchText,
    selectedIndustry,
  ]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDesc(!sortDesc);
    } else {
      setSortKey(key);
      setSortDesc(true);
    }
  };

  const toggleExpand = (code: string) => {
    setExpandedCode((prev: string | null) => (prev === code ? null : code));
  };

  // --- 渲染 ---
  const loading = listLoading || sentimentLoading;
  const sentimentData: MarketSentiment = sentiment ?? {
    limitUpCount: 0,
    limitDownCount: 0,
    brokenCount: 0,
    brokenRate: 0,
    sealRate: 0,
    maxConsecutive: 0,
    promotionRate: 0,
    stLimitUpCount: 0,
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <AlertTriangle size={22} className="text-warning" />
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            炸板监控
          </h1>
          <span className="px-2 py-0.5 bg-warning/10 text-warning text-xs rounded font-medium">
            风险预警
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          实时监控涨停后开板个股，跟踪开板时间、回落幅度与资金出逃情况
        </p>
      </div>

      {/* 情绪指标卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4" data-ai-section-type="card-stat">
        {/* 炸板家数 */}
        <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
            <Skull size={16} />
            <span>炸板家数</span>
          </div>
          <div className="text-xl md:text-2xl font-mono tabular-nums font-semibold text-warning">
            {sentimentData.brokenCount}
          </div>
        </div>

        {/* 炸板率 */}
        <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
            <Zap size={16} />
            <span>炸板率</span>
          </div>
          <div className="text-xl md:text-2xl font-mono tabular-nums font-semibold text-warning">
            {sentimentData.brokenRate.toFixed(1)}%
          </div>
        </div>

        {/* 封板率 */}
        <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
            <ShieldCheck size={16} />
            <span>封板率</span>
          </div>
          <div className="text-xl md:text-2xl font-mono tabular-nums font-semibold text-fall">
            {sentimentData.sealRate.toFixed(1)}%
          </div>
        </div>

        {/* 回封成功数 */}
        <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
          <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
            <RotateCcw size={16} />
            <span>回封成功</span>
          </div>
          <div className="text-xl md:text-2xl font-mono tabular-nums font-semibold text-fall">
            {resealedCount}
          </div>
        </div>
      </div>

      {/* 行业炸板率排行 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-color">
          <BarChart3 size={16} className="text-rise" />
          <span className="text-base font-medium text-text-primary">
            行业炸板率排行
          </span>
          <span className="text-xs text-text-muted">
            前10名
          </span>
          {selectedIndustry !== 'all' && (
            <button
              onClick={() => setSelectedIndustry('all')}
              className="ml-auto flex items-center gap-1 text-xs px-2 py-1 rounded bg-rise/10 text-rise border border-rise/30 hover:bg-rise/20 transition-colors"
            >
              <X size={12} />
              清除筛选 ({selectedIndustry})
            </button>
          )}
        </div>
        <div className="p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {sectorStats
              .slice()
              .sort((a: LimitBrokenSectorStat, b: LimitBrokenSectorStat) => b.brokenRate - a.brokenRate)
              .slice(0, 10)
              .map((sector: LimitBrokenSectorStat) => {
                const isActive = selectedIndustry === sector.industry;
                return (
                  <button
                    key={sector.industry}
                    onClick={() => setSelectedIndustry(isActive ? 'all' : sector.industry)}
                    className={`text-left p-3 rounded-lg border transition-all ${isActive
                      ? 'border-rise/60 bg-rise/10 ring-1 ring-rise/30'
                      : 'border-border-color bg-bg-tertiary/30 hover:border-rise/40 hover:bg-rise/5'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-text-primary truncate max-w-[100px]">
                        {sector.industry}
                      </span>
                      <span className="text-xs font-mono font-bold text-rise">
                        {sector.brokenRate.toFixed(1)}%
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-text-muted mb-2">
                      <span>炸 <span className="text-rise font-mono">{sector.brokenCount}</span></span>
                      <span className="text-border-color">/</span>
                      <span>封 <span className="text-fall font-mono">{sector.sealCount}</span></span>
                    </div>
                    <div className="w-full h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                      <div
                        className="h-full bg-rise rounded-full transition-all"
                        style={{ width: `${Math.min(sector.brokenRate, 100)}%` }}
                      />
                    </div>
                  </button>
                );
              })}
            {sectorStats.length === 0 && (
              <div className="col-span-full text-center py-6 text-text-muted text-sm">
                暂无行业数据
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 预警设置栏 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Switch
                  checked={alertEnabled}
                  onCheckedChange={(checked) => {
                    if (alertFallback) {
                      setLocalAlertEnabled(checked);
                    } else {
                      toggleAlert();
                    }
                  }}
                />
                <span className="text-sm text-text-primary">
                  自选股炸板时弹窗提醒
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={soundEnabled}
                  onCheckedChange={(checked) => {
                    if (alertFallback) {
                      setLocalSoundEnabled(checked);
                    } else {
                      const config = {
                        soundEnabled: checked,
                        popupEnabled: alertEnabled,
                        watchlistOnly: true,
                      };
                      updateAlertConfig(config);
                    }
                  }}
                  disabled={!alertEnabled}
                />
                {soundEnabled ? (
                  <Volume2 size={14} className="text-text-secondary" />
                ) : (
                  <VolumeX size={14} className="text-text-muted" />
                )}
                <span className="text-xs text-text-muted">声音提醒</span>
              </div>
            </div>
            <div className="text-xs text-text-muted">
              当前监控 <span className="text-text-secondary font-mono">{watchlist.length}</span>{' '}
              只自选股，其中{' '}
              <span className="text-warning font-mono">{watchlistBrokenCount}</span>{' '}
              只曾炸板
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-text-muted">
            <RefreshCw size={12} className="animate-spin-slow" />
            <span>实时刷新中</span>
          </div>
        </div>
      </div>

      {/* 筛选排序栏 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {/* 状态筛选 */}
            <div className="flex items-center gap-1">
              <Filter size={14} className="text-text-muted" />
              <span className="text-xs text-text-muted mr-1">状态:</span>
              {(['all', 'broken', 'resealed', 'sealing'] as StatusFilter[]).map(
                (val: StatusFilter) => (
                  <button
                    key={val}
                    onClick={() => setStatusFilter(val)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      statusFilter === val
                        ? 'bg-primary/20 text-primary'
                        : 'text-text-secondary hover:bg-bg-tertiary'
                    }`}
                  >
                    {val === 'all'
                      ? '全部'
                      : val === 'broken'
                        ? '炸板中'
                        : val === 'resealed'
                          ? '已回封'
                          : '封板中'}
                  </button>
                ),
              )}
            </div>

            <span className="text-border-color mx-1 hidden md:block">|</span>

            {/* 炸板次数筛选 */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-muted mr-1">次数:</span>
              {(['all', '1', '2', '3+'] as BreakCountFilter[]).map(
                (val: BreakCountFilter) => (
                  <button
                    key={val}
                    onClick={() => setBreakCountFilter(val)}
                    className={`px-2 py-1 text-xs rounded transition-colors ${
                      breakCountFilter === val
                        ? 'bg-primary/20 text-primary'
                        : 'text-text-secondary hover:bg-bg-tertiary'
                    }`}
                  >
                    {val === 'all' ? '全部' : val}
                  </button>
                ),
              )}
            </div>

            <span className="text-border-color mx-1 hidden md:block">|</span>

            {/* 仅看自选 */}
            <div className="flex items-center gap-2">
              <Switch
                checked={watchlistOnly}
                onCheckedChange={setWatchlistOnly}
                className="h-4 w-7"
              />
              <span className="text-xs text-text-secondary">仅看自选</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="搜索代码/名称"
                className="pl-7 pr-3 py-1.5 text-xs bg-bg-tertiary border border-border-color rounded text-text-primary placeholder:text-text-muted focus:outline-none focus:border-primary w-36 md:w-48"
              />
            </div>
            <div className="flex items-center gap-1">
              <ArrowUpDown size={14} className="text-text-muted" />
              <span className="text-xs text-text-muted mr-1">排序:</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="bg-bg-tertiary border border-border-color rounded text-xs text-text-primary px-2 py-1.5 focus:outline-none focus:border-primary"
              >
                <option value="breakCount">炸板次数</option>
                <option value="lastBreakTime">最新炸板时间</option>
                <option value="priceDiffFromLimit">距涨停价差幅</option>
                <option value="amount">成交额</option>
              </select>
              <button
                onClick={() => setSortDesc(!sortDesc)}
                className="p-1.5 text-text-secondary hover:bg-bg-tertiary rounded transition-colors"
                title={sortDesc ? '降序' : '升序'}
              >
                {sortDesc ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 炸板监控列表 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-color">
          <div className="flex items-center gap-2">
            <Skull size={16} className="text-warning" />
            <span className="text-base font-medium text-text-primary">
              今日炸板明细
            </span>
            <span className="text-xs text-text-muted font-mono">
              {filteredList.length} 只
            </span>
          </div>
          <div className="flex items-center gap-1 text-xs text-text-muted">
            <Clock size={12} />
            <span>
              按
              {sortKey === 'breakCount'
                ? '炸板次数'
                : sortKey === 'lastBreakTime'
                  ? '最新炸板时间'
                  : sortKey === 'priceDiffFromLimit'
                    ? '距涨停价差幅'
                    : '成交额'}
              排序
            </span>
          </div>
        </div>

        {/* 表格 - 横向滚动 */}
        <div className="overflow-x-auto">
          <div className="min-w-[1200px]">
            {/* 表头 */}
            <div className="grid grid-cols-table-header px-4 py-2 bg-bg-tertiary/50 text-xs text-text-muted font-medium">
              <div>代码/名称</div>
              <div className="text-right">最新/涨停</div>
              <div className="text-right">距涨停</div>
              <div className="text-right">涨跌幅</div>
              <div className="text-center">炸板次数</div>
              <div className="text-center">状态</div>
              <div className="text-center">首次封板</div>
              <div className="text-center">首次炸板</div>
              <div className="text-center">最后炸板</div>
              <div className="text-right">炸板前封单</div>
              <div className="text-right">成交额</div>
              <div className="text-right">换手率</div>
              <div className="text-center">行业</div>
            </div>

            {/* 数据行 */}
            <div className="divide-y divide-border-color/50">
              {loading && filteredList.length === 0 && (
                <div className="px-4 py-12 text-center text-text-muted text-sm">
                  加载中...
                </div>
              )}

              {!loading && filteredList.length === 0 && (
                <div className="px-4 py-12 text-center">
                  <div className="text-text-muted text-sm mb-1">暂无炸板数据</div>
                  <div className="text-xs text-text-muted/60">
                    {searchText ? '未找到匹配的股票' : '当前筛选条件下无数据'}
                  </div>
                </div>
              )}

              {filteredList.map((stock: LimitBrokenStock) => {
                const status = STATUS_MAP[stock.currentStatus];
                const isExpanded = expandedCode === stock.code;
                const isFlashing = flashCodes.has(stock.code);
                const inWatchlist = watchlist.includes(stock.code);

                // 炸板次数徽章颜色
                const breakBadgeColor =
                  stock.breakCount >= 3
                    ? 'bg-rise text-white'
                    : stock.breakCount === 2
                      ? 'bg-rise/80 text-white'
                      : 'bg-warning/80 text-white';

                return (
                  <div key={stock.code}>
                    <div
                      className={`grid grid-cols-table-header px-4 py-3 items-center text-sm cursor-pointer transition-all hover:bg-bg-tertiary/40 ${
                        isFlashing ? 'animate-flash-red' : ''
                      }`}
                      onClick={() => toggleExpand(stock.code)}
                    >
                      {/* 代码 + 名称 */}
                      <div className="flex flex-col">
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleWatchlist(stock.code);
                            }}
                            className="text-text-muted hover:text-warning transition-colors"
                          >
                            {inWatchlist ? (
                              <Star size={14} className="fill-warning text-warning" />
                            ) : (
                              <StarOff size={14} />
                            )}
                          </button>
                          <span className="text-rise font-medium truncate">
                            {stock.name}
                          </span>
                        </div>
                        <div className="font-mono text-text-secondary text-xs ml-[22px]">
                          {stock.code}
                        </div>
                      </div>

                      {/* 最新价 / 涨停价 */}
                      <div className="text-right">
                        <div className="font-mono tabular-nums text-text-primary">
                          {stock.price.toFixed(2)}
                        </div>
                        <div className="font-mono tabular-nums text-text-muted text-xs">
                          {stock.limitUpPrice.toFixed(2)}
                        </div>
                      </div>

                      {/* 距涨停价差幅 */}
                      <div
                        className={`text-right font-mono tabular-nums font-medium ${
                          stock.priceDiffFromLimit < 0
                            ? 'text-rise'
                            : 'text-warning'
                        }`}
                      >
                        {stock.priceDiffFromLimit > 0
                          ? '+'
                          : ''}
                        {stock.priceDiffFromLimit.toFixed(2)}%
                      </div>

                      {/* 涨跌幅 */}
                      <div
                        className={`text-right font-mono tabular-nums font-medium ${
                          stock.changePercent > 0
                            ? 'text-rise'
                            : stock.changePercent < 0
                              ? 'text-fall'
                              : 'text-flat'
                        }`}
                      >
                        {formatPct(stock.changePercent)}
                      </div>

                      {/* 炸板次数 */}
                      <div className="text-center">
                        <span
                          className={`inline-flex items-center justify-center min-w-[28px] h-6 px-1.5 rounded-full font-mono font-bold text-xs ${breakBadgeColor}`}
                        >
                          {stock.breakCount}
                        </span>
                      </div>

                      {/* 当前状态 */}
                      <div className="text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${status.color} ${status.bg}`}
                        >
                          {status.label}
                        </span>
                      </div>

                      {/* 首次封板时间 */}
                      <div className="text-center font-mono tabular-nums text-text-secondary text-xs">
                        {stock.firstSealTime || '-'}
                      </div>

                      {/* 首次炸板时间 */}
                      <div className="text-center font-mono tabular-nums text-rise text-xs">
                        {stock.firstBreakTime || '-'}
                      </div>

                      {/* 最后炸板时间 */}
                      <div className="text-center font-mono tabular-nums text-rise text-xs">
                        {stock.lastBreakTime || '-'}
                      </div>

                      {/* 炸板前封单 */}
                      <div className="text-right font-mono tabular-nums text-text-secondary text-xs">
                        {formatAmount(stock.sealAmountBeforeBreak)}
                      </div>

                      {/* 成交额 */}
                      <div className="text-right font-mono tabular-nums text-text-primary">
                        {formatAmount(stock.amount)}
                      </div>

                      {/* 换手率 */}
                      <div className="text-right font-mono tabular-nums text-text-secondary">
                        {stock.turnover.toFixed(2)}%
                      </div>

                      {/* 行业 */}
                      <div className="text-center">
                        <span className="text-xs px-1.5 py-0.5 bg-bg-tertiary text-text-secondary rounded">
                          {stock.industry}
                        </span>
                      </div>
                    </div>

                    {/* 展开 - 时间线 */}
                    {isExpanded && (
                      <div className="bg-bg-tertiary/30 px-4 py-4 border-t border-border-color/50">
                        <div className="flex items-center gap-2 mb-3">
                          <Clock size={14} className="text-text-muted" />
                          <span className="text-sm font-medium text-text-primary">
                            封板时间线 — {stock.name} ({stock.code})
                          </span>
                        </div>
                        <SealTimeline
                          events={stock.timeline}
                          limitUpPrice={stock.limitUpPrice}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* 风险提示卡片 */}
      <div className="bg-warning/5 border border-warning/30 rounded-lg p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle
            size={18}
            className="text-warning shrink-0 mt-0.5"
          />
          <div>
            <p className="text-sm font-medium text-warning mb-1">炸板风险提示</p>
            <p className="text-xs text-text-secondary leading-relaxed">
              涨停开板可能预示资金分歧加大，追高需谨慎。请结合封单变化、成交量、板块效应等多维度综合判断，避免高位接盘。
            </p>
          </div>
        </div>
      </div>

      {/* 免责声明 */}
      <p className="text-center text-xs text-text-muted pt-2 pb-4">
        ⚠ 数据仅供参考，不构成任何投资建议
      </p>
    </div>
  );
};

export default LimitBrokenPage;
