import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FileBarChart,
  Star,
  Download,
  Loader2,
  FileSearch,
  Save,
} from 'lucide-react';

import { marketDataApi, reportHistory } from '@client/src/api';
import { Button } from '@client/src/components/ui/button';
import { StockSearchInput } from './StockSearchInput';
import { StockOverviewCard } from './StockOverviewCard';
import { DeepReportSection } from './DeepReportSection';
import {
  generateResearchMarkdown,
  downloadMarkdown,
} from '@client/src/utils/report-export';

const WATCHLIST_KEY = 'stock-research-watchlist';

interface WatchlistItem {
  code: string;
  name: string;
  addedAt: number;
}

function getWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (raw) return JSON.parse(raw) as WatchlistItem[];
  } catch {
    /* ignore */
  }
  return [];
}

function setWatchlist(items: WatchlistItem[]): void {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(items));
}

const StockResearchPage = () => {
  const queryClient = useQueryClient();
  const [selectedCode, setSelectedCode] = useState<string>('');
  const [selectedName, setSelectedName] = useState<string>('');
  const [isInWatchlist, setIsInWatchlist] = useState<boolean>(false);

  // 加载研究数据
  const { data, isLoading, error } = useQuery({
    queryKey: ['stockResearch', selectedCode],
    queryFn: () => marketDataApi.getStockResearch(selectedCode),
    enabled: selectedCode.length > 0,
    staleTime: 60_000,
  });

  // 保存报告到历史
  const { mutate: saveReport, isPending: isSavingReport } = useMutation({
    mutationFn: () =>
      reportHistory.saveReportHistory({
        reportType: 'research',
        title: `${selectedName}速览`,
        stockCodes: selectedCode ? [selectedCode] : [],
        content: data?.deepReport as unknown as Record<string, unknown>,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-history'] });
      toast.success('报告已保存到历史');
    },
    onError: () => {
      toast.error('保存失败，请稍后重试');
    },
  });

  // 检查自选状态
  useEffect(() => {
    if (!selectedCode) return;
    const list = getWatchlist();
    setIsInWatchlist(list.some((item: WatchlistItem) => item.code === selectedCode));
  }, [selectedCode]);

  const handleSelect = (code: string, name: string) => {
    setSelectedCode(code);
    setSelectedName(name);
  };

  const handleToggleWatchlist = () => {
    if (!selectedCode) return;
    const list = getWatchlist();
    const exists = list.some((item: WatchlistItem) => item.code === selectedCode);
    if (exists) {
      setWatchlist(list.filter((item: WatchlistItem) => item.code !== selectedCode));
      setIsInWatchlist(false);
    } else {
      list.push({ code: selectedCode, name: selectedName, addedAt: Date.now() });
      setWatchlist(list);
      setIsInWatchlist(true);
    }
  };

  const handleExport = () => {
    if (!data) return;
    const md = generateResearchMarkdown(data);
    downloadMarkdown(md, `${data.name}-${data.code}-研究报告.md`);
  };

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <FileBarChart size={22} className="text-primary" />
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            个股研究
          </h1>
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded font-medium">
            AI 投研
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          AI 智能投研工具，一键生成个股深度研究报告，多维诊断与风险提示
        </p>
      </div>

      {/* 顶部搜索栏 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <StockSearchInput onSelect={handleSelect} />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="default"
              onClick={handleToggleWatchlist}
              disabled={!selectedCode}
              className={isInWatchlist ? 'text-warning border-warning/30 hover:bg-warning/10' : ''}
            >
              <Star
                size={16}
                className={isInWatchlist ? 'fill-warning text-warning' : ''}
              />
              {isInWatchlist ? '已加自选' : '添加自选'}
            </Button>
            <Button
              variant="outline"
              size="default"
              onClick={() => saveReport()}
              disabled={!data || isSavingReport}
            >
              <Save size={16} />
              保存到历史
            </Button>
            <Button
              variant="default"
              size="default"
              onClick={handleExport}
              disabled={!data}
            >
              <Download size={16} />
              导出报告
            </Button>
          </div>
        </div>
      </div>

      {/* 空态 */}
      {!selectedCode && (
        <div className="bg-bg-secondary border border-border-color rounded-lg p-12 flex flex-col items-center justify-center text-center">
          <div className="w-16 h-16 rounded-full bg-bg-tertiary flex items-center justify-center mb-4">
            <FileSearch size={32} className="text-text-muted" />
          </div>
          <h3 className="text-base font-medium text-text-primary mb-2">
            输入股票代码或名称开始研究
          </h3>
          <p className="text-sm text-text-muted max-w-md">
            支持代码/名称模糊搜索，AI 将自动生成包含商业模式、竞争优势、财务质量、估值框架、
            风险提示等六大维度的深度研究报告
          </p>
          <div className="flex items-center gap-2 mt-4">
            <span className="text-xs text-text-muted">热门搜索：</span>
            {[
              { code: '600519', name: '贵州茅台' },
              { code: '000157', name: '首钢集团' },
              { code: '000256', name: '老板数码' },
              { code: '688226', name: '上汽科技' },
            ].map((stock) => (
              <button
                key={stock.code}
                onClick={() => handleSelect(stock.code, stock.name)}
                className="text-xs text-primary hover:underline transition-colors"
              >
                {stock.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 加载态 */}
      {selectedCode && isLoading && (
        <div className="bg-bg-secondary border border-border-color rounded-lg p-12 flex flex-col items-center justify-center">
          <Loader2 size={32} className="text-primary animate-spin mb-3" />
          <p className="text-sm text-text-secondary">
            正在生成研究报告，请稍候...
          </p>
        </div>
      )}

      {/* 错误态 */}
      {selectedCode && error && !isLoading && (
        <div className="bg-bg-secondary border border-rise/30 rounded-lg p-8 flex flex-col items-center justify-center">
          <p className="text-sm text-rise mb-2">加载失败</p>
          <p className="text-xs text-text-muted">
            无法获取研究数据，请稍后重试
          </p>
        </div>
      )}

      {/* 数据展示 */}
      {selectedCode && data && !isLoading && (
        <>
          {/* 个股速览卡 */}
          <StockOverviewCard overview={data.overview} />

          {/* 深度报告区 */}
          <DeepReportSection report={data.deepReport} />
        </>
      )}

      {/* 免责声明 */}
      <p className="text-center text-xs text-text-muted pt-2 pb-4">
        ⚠ AI 研报仅供参考，不构成任何投资建议
      </p>
    </div>
  );
};

export default StockResearchPage;
