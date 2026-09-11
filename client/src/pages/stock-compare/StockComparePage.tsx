import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  GitCompare,
  TrendingUp,
  DollarSign,
  BarChart3,
  FileText,
  Save,
} from 'lucide-react';
import StockSelector from './StockSelector';
import PriceCompareChart from './PriceCompareChart';
import CompareTable, { type RowDef } from './CompareTable';
import CompareReport from './CompareReport';
import { marketDataApi, reportHistory } from '@client/src/api';
import { formatAmount } from '@client/src/utils/format';
import type { StockCompare } from '@shared/api.interface';
import { logger } from '@client/src/api';

interface SelectedStock {
  code: string;
  name: string;
}

type TabKey = 'price' | 'financial' | 'valuation' | 'report';

const tabs: { key: TabKey; name: string; icon: React.ReactNode }[] = [
  { key: 'price', name: '行情与阶段涨跌', icon: <TrendingUp size={14} /> },
  { key: 'financial', name: '核心财务快照', icon: <DollarSign size={14} /> },
  { key: 'valuation', name: '估值', icon: <BarChart3 size={14} /> },
  { key: 'report', name: '对比报告', icon: <FileText size={14} /> },
];

const priceRows: RowDef[] = [
  { key: 'day1', label: '1日涨跌幅', isPercent: true },
  { key: 'day5', label: '5日涨跌幅', isPercent: true },
  { key: 'day20', label: '20日涨跌幅', isPercent: true },
  { key: 'day60', label: '60日涨跌幅', isPercent: true },
  { key: 'yearToDate', label: '年初至今', isPercent: true },
];

const financialRows: RowDef[] = [
  { key: 'revenue', label: '营业收入' },
  { key: 'netProfit', label: '净利润' },
  { key: 'roe', label: 'ROE', isPercent: true },
  { key: 'grossMargin', label: '毛利率', isPercent: true },
  { key: 'netMargin', label: '净利率', isPercent: true },
  { key: 'debtRatio', label: '资产负债率', isPercent: true, invertHighlight: true },
];

const valuationRows: RowDef[] = [
  { key: 'pe', label: 'PE(TTM)', unit: 'x', invertHighlight: true },
  { key: 'pb', label: 'PB(LF)', unit: 'x', invertHighlight: true },
  { key: 'ps', label: 'PS(TTM)', unit: 'x', invertHighlight: true },
  { key: 'dividendYield', label: '股息率', isPercent: true, invertHighlight: true },
];

const StockComparePage = () => {
  const [stocks, setStocks] = useState<SelectedStock[]>([
    { code: '', name: '' },
    { code: '', name: '' },
  ]);
  const [activeTab, setActiveTab] = useState<TabKey>('price');
  const [compareData, setCompareData] = useState<StockCompare | null>(null);
  const [loading, setLoading] = useState(false);
  const queryClient = useQueryClient();

  // 保存对比报告到历史
  const { mutate: saveReport, isPending: isSavingReport } = useMutation({
    mutationFn: () => {
      const codes = validStocks.map((s) => s.code);
      return reportHistory.saveReportHistory({
        reportType: 'compare',
        title: `对比${codes.length}只股票`,
        stockCodes: codes,
        content: compareData as unknown as Record<string, unknown>,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['report-history'] });
      toast.success('对比报告已保存到历史');
    },
    onError: () => {
      toast.error('保存失败，请稍后重试');
    },
  });

  const validStocks = stocks.filter((s) => s.code);

  const handleCompare = async () => {
    const codes = stocks.filter((s) => s.code).map((s) => s.code);
    if (codes.length < 2) return;

    setLoading(true);
    try {
      const data = await marketDataApi.compareStocks(codes);
      setCompareData(data);
    } catch (err) {
      logger.error('compare stocks error', { error: err });
      setCompareData(null);
    } finally {
      setLoading(false);
    }
  };

  const stockName = (code: string): string => {
    const found = stocks.find((s) => s.code === code);
    if (found?.name) return found.name;
    // Try from chart series
    if (compareData?.priceChartData?.series) {
      const s = compareData.priceChartData.series.find((item) => item.code === code);
      if (s?.name) return s.name;
    }
    return code;
  };

  const stockListForTable = (): { code: string; name: string }[] => {
    if (!compareData) return [];
    return compareData.stocks.map((code) => ({
      code,
      name: stockName(code),
    }));
  };

  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <GitCompare size={22} className="text-primary" />
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            多股对比
          </h1>
          <span className="px-2 py-0.5 bg-primary/10 text-primary text-xs rounded font-medium">
            横向对比
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          多只股票横向对比分析，行情、财务、估值一目了然，辅助投资决策
        </p>
      </div>

      {/* 股票选择区 */}
      <StockSelector
        stocks={stocks}
        onChange={setStocks}
        onCompare={handleCompare}
        loading={loading}
      />

      {/* 走势对比图 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-text-primary">走势对比</div>
            <button
              onClick={() => saveReport()}
              disabled={!compareData || isSavingReport}
              className="flex items-center gap-1 px-2 py-1 text-xs text-text-secondary hover:text-text-primary hover:bg-bg-tertiary rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save size={12} />
              保存到历史
            </button>
          </div>
          <div className="text-[11px] text-text-muted">基准日归一化为 0%</div>
        </div>
        {loading ? (
          <div className="h-[400px] flex items-center justify-center">
            <div className="text-text-muted text-sm">加载中...</div>
          </div>
        ) : compareData && compareData.priceChartData?.series?.length > 0 ? (
          <PriceCompareChart
            dates={compareData.priceChartData.dates}
            series={compareData.priceChartData.series}
          />
        ) : (
          <div className="h-[400px] flex items-center justify-center text-text-muted text-sm">
            选择股票后点击「开始对比」查看走势对比
          </div>
        )}
      </div>

      {/* 对比维度 Tabs */}
      <div className="flex gap-1 bg-bg-secondary border border-border-color rounded-lg p-1 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs rounded-md transition-colors whitespace-nowrap ${
              activeTab === tab.key
                ? 'bg-bg-tertiary text-text-primary font-medium'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.icon}
            {tab.name}
          </button>
        ))}
      </div>

      {/* Tab 内容 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
        {loading ? (
          <div className="p-8 flex items-center justify-center">
            <div className="text-text-muted text-sm">数据加载中...</div>
          </div>
        ) : !compareData ? (
          <div className="p-12 flex flex-col items-center justify-center text-text-muted">
            <GitCompare size={36} className="mb-3 opacity-40" />
            <p className="text-sm">选择 2-5 只股票，点击「开始对比」查看多维度分析</p>
          </div>
        ) : (
          <>
            {activeTab === 'price' && (
              <CompareTable
                rows={priceRows}
                stocks={stockListForTable()}
                getValue={(code, key) => {
                  const perf = compareData.pricePerformance?.[code];
                  if (!perf) return undefined;
                  return perf[key as keyof typeof perf] as number | undefined;
                }}
                highlightMode="higher"
                note={`数据截止日期：${todayStr} | 行情数据基于最近收盘价，阶段涨跌幅为复权后计算`}
              />
            )}

            {activeTab === 'financial' && (
              <CompareTable
                rows={financialRows}
                stocks={stockListForTable()}
                getValue={(code, key) => {
                  const fin = compareData.financialSnapshot?.[code];
                  if (!fin) return undefined;
                  return fin[key as keyof typeof fin] as number | undefined;
                }}
                formatValue={(value, rowKey) => {
                  if (rowKey === 'revenue' || rowKey === 'netProfit') {
                    return formatAmount(value);
                  }
                  if (
                    rowKey === 'roe' ||
                    rowKey === 'grossMargin' ||
                    rowKey === 'netMargin' ||
                    rowKey === 'debtRatio'
                  ) {
                    return `${value.toFixed(2)}%`;
                  }
                  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
                }}
                highlightMode="higher"
                note={`数据截止日期：${todayStr} | 财务数据基于最新定期报告，币种为人民币`}
              />
            )}

            {activeTab === 'valuation' && (
              <CompareTable
                rows={valuationRows}
                stocks={stockListForTable()}
                getValue={(code, key) => {
                  const val = compareData.valuation?.[code];
                  if (!val) return undefined;
                  return val[key as keyof typeof val] as number | undefined;
                }}
                formatValue={(value, rowKey) => {
                  if (rowKey === 'dividendYield') {
                    return `${value.toFixed(2)}%`;
                  }
                  return value.toFixed(2);
                }}
                highlightMode="lower"
                note={`数据截止日期：${todayStr} | 估值数据基于最新收盘价，PE=TTM，PB=LF`}
              />
            )}

            {activeTab === 'report' && (
              <div className="p-4">
                <CompareReport
                  data={compareData}
                  stockNames={stockListForTable()}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* 免责声明 */}
      <p className="text-center text-xs text-text-muted pt-2 pb-4">
        ⚠ 对比结果仅供参考，不构成任何投资建议
      </p>
    </div>
  );
};

export default StockComparePage;
