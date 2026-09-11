import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Filter, SlidersHorizontal, Zap } from 'lucide-react';
import { marketDataApi, screenStrategies } from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@client/src/components/ui/sheet';
import { FilterPanel } from './FilterPanel';
import { ResultTable } from './ResultTable';
import { SaveStrategyDialog } from './SaveStrategyDialog';
import type {
  ScreenConditions,
  ScreenResult,
  ListResponse,
  ScreenStrategy,
} from '@shared/api.interface';
import { logger } from '@lark-apaas/client-toolkit/logger';

type TierFilter = 'all' | 'core' | 'important' | 'watch' | 'pending';
type SortField = 'changePercent' | 'marketCap' | 'pe' | 'roe';
type SortOrder = 'asc' | 'desc';

const STORAGE_KEY_WATCHLIST = 'stock_screener_watchlist';
const STORAGE_KEY_STRATEGIES_FALLBACK = 'stock_screener_strategies_fallback';

const DEFAULT_CONDITIONS: ScreenConditions = {};

// 从 localStorage 加载策略（降级用）
function loadFallbackStrategies(): ScreenStrategy[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STRATEGIES_FALLBACK);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

// 保存策略到 localStorage（降级用）
function saveFallbackStrategies(strategies: ScreenStrategy[]) {
  try {
    localStorage.setItem(STORAGE_KEY_STRATEGIES_FALLBACK, JSON.stringify(strategies));
  } catch {
    // ignore
  }
}

function loadWatchlist(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WATCHLIST);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return [];
}

function saveWatchlist(codes: string[]) {
  try {
    localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(codes));
  } catch {
    // ignore
  }
}

const StockScreenerPage = () => {
  const queryClient = useQueryClient();

  // Filter conditions
  const [conditions, setConditions] = useState<ScreenConditions>(DEFAULT_CONDITIONS);
  const [hasSearched, setHasSearched] = useState(false);
  const [results, setResults] = useState<ScreenResult[]>([]);
  const [total, setTotal] = useState(0);

  // UI state
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sortField, setSortField] = useState<SortField>('changePercent');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [mobileFilterOpen, setMobileFilterOpen] = useState(false);
  // 是否使用降级模式（localStorage）
  const [useFallback, setUseFallback] = useState<boolean>(false);
  // 降级模式下的本地策略列表
  const [fallbackStrategies, setFallbackStrategies] = useState<ScreenStrategy[]>(() =>
    loadFallbackStrategies(),
  );

  // Watchlist (localStorage mock)
  const [watchlist, setWatchlist] = useState<string[]>(() => loadWatchlist());

  // 从后端加载策略列表
  const { data: apiStrategies = [], error: strategiesError, isSuccess: strategiesLoaded } = useQuery({
    queryKey: ['screen-strategies'],
    queryFn: () => screenStrategies.getScreenStrategies(),
    staleTime: 30_000,
    retry: 1,
    placeholderData: loadFallbackStrategies(),
  });

  // API 失败时降级到 localStorage
  useEffect(() => {
    if (strategiesError) {
      setUseFallback(true);
      toast.warning('策略服务暂不可用，使用本地保存');
    }
  }, [strategiesError]);

  // API 成功时关闭降级模式
  useEffect(() => {
    if (strategiesLoaded) {
      setUseFallback(false);
    }
  }, [strategiesLoaded]);

  // 当前使用的策略列表（API 或降级）
  const savedStrategies: ScreenStrategy[] = useFallback
    ? fallbackStrategies
    : apiStrategies;

  // 保存策略 mutation
  const { mutate: saveStrategyMutation, isPending: isSaving } = useMutation({
    mutationFn: (params: { name: string; description: string }) =>
      screenStrategies.createScreenStrategy({
        name: params.name,
        description: params.description,
        conditions: { ...conditions },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screen-strategies'] });
      toast.success('策略保存成功');
      setSaveDialogOpen(false);
    },
    onError: (err) => {
      // 失败则降级到 localStorage
      logger.warn('保存策略失败，降级到本地', String(err));
      setUseFallback(true);
    },
  });

  // 删除策略 mutation
  const { mutate: deleteStrategyMutation } = useMutation({
    mutationFn: (id: string) => screenStrategies.deleteScreenStrategy(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['screen-strategies'] });
      toast.success('策略已删除');
    },
    onError: (err) => {
      logger.warn('删除策略失败', String(err));
    },
  });

  // Screen mutation (POST request)
  const { mutate: executeScreen, isPending: isLoading } = useMutation({
    mutationFn: (cond: ScreenConditions) =>
      marketDataApi.screenStocks(cond) as Promise<ListResponse<ScreenResult>>,
    onSuccess: (data) => {
      setResults(data.items ?? []);
      setTotal(data.total ?? 0);
      setHasSearched(true);
    },
  });

  const handleScreen = useCallback(() => {
    executeScreen(conditions);
  }, [conditions, executeScreen]);

  const handleReset = useCallback(() => {
    setConditions(DEFAULT_CONDITIONS);
  }, []);

  const handleLoadStrategy = useCallback((strategy: ScreenStrategy) => {
    setConditions(strategy.conditions);
    setMobileFilterOpen(false);
    // Auto-screen after loading
    setTimeout(() => executeScreen(strategy.conditions), 50);
  }, [executeScreen]);

  const handleDeleteStrategy = useCallback((id: string) => {
    if (useFallback) {
      setFallbackStrategies((prev) => {
        const next = prev.filter((s) => s.id !== id);
        saveFallbackStrategies(next);
        return next;
      });
      return;
    }
    deleteStrategyMutation(id);
  }, [useFallback, deleteStrategyMutation]);

  const handleSaveStrategy = useCallback((name: string, description: string) => {
    if (useFallback) {
      const newStrategy: ScreenStrategy = {
        id: `strategy_${Date.now()}`,
        name,
        description,
        conditions: { ...conditions },
        isPublic: false,
        createdAt: new Date().toISOString(),
      };
      setFallbackStrategies((prev) => {
        const next = [newStrategy, ...prev];
        saveFallbackStrategies(next);
        return next;
      });
      setSaveDialogOpen(false);
      toast.success('策略已保存到本地');
      return;
    }
    saveStrategyMutation({ name, description });
  }, [conditions, useFallback, saveStrategyMutation]);

  const handleToggleWatchlist = useCallback((code: string, _name: string) => {
    setWatchlist((prev) => {
      const next = prev.includes(code)
        ? prev.filter((c) => c !== code)
        : [...prev, code];
      saveWatchlist(next);
      return next;
    });
  }, []);

  const handleExportCsv = useCallback(() => {
    if (results.length === 0) return;

    const headers = [
      '代码', '名称', '价格', '涨跌幅', '分层',
      '入选理由', '来源', '行业', '市值(亿)', 'PE', 'PB', 'ROE(%)',
    ];

    const tierMap: Record<string, string> = {
      core: '核心候选',
      important: '重要参与者',
      watch: '观察名单',
      pending: '待验证',
    };

    const rows = results.map((item) => [
      item.code,
      item.name,
      item.price.toFixed(2),
      `${item.changePercent > 0 ? '+' : ''}${item.changePercent.toFixed(2)}%`,
      tierMap[item.tier] ?? item.tier,
      item.reasons.join('; '),
      item.sources.join('; '),
      item.industry,
      (item.marketCap / 1e8).toFixed(2),
      item.pe.toFixed(2),
      item.pb.toFixed(2),
      item.roe.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => {
          const s = String(cell);
          return s.includes(',') || s.includes('"') || s.includes('\n')
            ? `"${s.replace(/"/g, '""')}"`
            : s;
        }).join(','),
      ),
    ].join('\n');

    // Add BOM for Excel UTF-8 compatibility
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `选股结果_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [results]);

  const handleSortChange = useCallback((field: SortField, order: SortOrder) => {
    setSortField(field);
    setSortOrder(order);
  }, []);

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Page header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-border-color bg-bg-primary">
        <div className="flex items-center gap-2">
          <Filter size={20} className="text-primary" />
          <h1 className="text-lg font-semibold tracking-tight text-text-primary">选股工具</h1>
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded font-medium">
            多维筛选
          </span>
        </div>
        {/* Mobile filter button */}
        <Sheet open={mobileFilterOpen} onOpenChange={setMobileFilterOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" size="sm" className="lg:hidden">
              <SlidersHorizontal size={16} />
              筛选条件
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-80 p-0 bg-bg-primary border-border-color">
            <SheetHeader className="border-b border-border-color px-4 py-3">
              <SheetTitle className="text-text-primary flex items-center gap-2">
                <Filter size={18} className="text-primary" />
                筛选条件
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-hidden">
              <FilterPanel
                conditions={conditions}
                onConditionsChange={setConditions}
                onScreen={() => {
                  setMobileFilterOpen(false);
                  handleScreen();
                }}
                isLoading={isLoading}
                savedStrategies={savedStrategies}
                onLoadStrategy={handleLoadStrategy}
                onDeleteStrategy={handleDeleteStrategy}
                onReset={handleReset}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-72 xl:w-80 border-r border-border-color bg-bg-secondary flex-shrink-0 overflow-hidden">
          <FilterPanel
            conditions={conditions}
            onConditionsChange={setConditions}
            onScreen={handleScreen}
            isLoading={isLoading}
            savedStrategies={savedStrategies}
            onLoadStrategy={handleLoadStrategy}
            onDeleteStrategy={handleDeleteStrategy}
            onReset={handleReset}
          />
        </aside>

        {/* Result area */}
        <main className="flex-1 overflow-hidden bg-bg-primary">
          <ResultTable
            results={results}
            total={total}
            isLoading={isLoading}
            hasSearched={hasSearched}
            tierFilter={tierFilter}
            onTierFilterChange={setTierFilter}
            sortField={sortField}
            sortOrder={sortOrder}
            onSortChange={handleSortChange}
            onSaveStrategy={() => setSaveDialogOpen(true)}
            onExportCsv={handleExportCsv}
            watchlist={watchlist}
            onToggleWatchlist={handleToggleWatchlist}
          />
        </main>
      </div>

      {/* Disclaimer */}
      <div className="flex-shrink-0 text-center text-xs text-text-muted py-2 border-t border-border-color bg-bg-primary">
        ⚠ 选股结果仅供参考，不构成任何投资建议
      </div>

      {/* Save strategy dialog */}
      <SaveStrategyDialog
        open={saveDialogOpen}
        onOpenChange={setSaveDialogOpen}
        onSave={handleSaveStrategy}
      />
    </div>
  );
};

export default StockScreenerPage;
