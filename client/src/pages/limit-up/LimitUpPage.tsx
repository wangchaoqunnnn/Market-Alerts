import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, RefreshCw, AlertTriangle, Clock } from 'lucide-react';
import { marketDataApi } from '@client/src/api';
import type { LimitUpStock } from '@shared/api.interface';
import { logger } from '@client/src/api';
import SentimentCards from './SentimentCards';
import ConsecutiveLadder from './ConsecutiveLadder';
import LimitUpTable from './LimitUpTable';
import StockDetailDialog from './StockDetailDialog';
import { Badge } from '@client/src/components/ui/badge';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
} from '@client/src/components/ui/empty';
import {
  formatPrice,
  formatPercent,
} from '@client/src/utils/format';

const REFRESH_INTERVAL = 1000;

const LimitUpPage = () => {
  const [selectedStock, setSelectedStock] = useState<LimitUpStock | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data: groups, isLoading: groupsLoading, error: groupsError } = useQuery({
    queryKey: ['limit-up-groups'],
    queryFn: () => marketDataApi.getLimitUpGroups(),
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: 500,
  });

  const { data: sentiment, isLoading: sentimentLoading } = useQuery({
    queryKey: ['market-sentiment'],
    queryFn: () => marketDataApi.getSentiment(),
    refetchInterval: REFRESH_INTERVAL,
    refetchIntervalInBackground: true,
    staleTime: 500,
  });

  const handleSelectStock = (stock: LimitUpStock) => {
    setSelectedStock(stock);
    setDetailOpen(true);
  };

  const normalStocks = groups?.normalStocks ?? [];
  const stStocks = groups?.stStocks ?? [];

  const isLoading = groupsLoading || sentimentLoading;
  const hasError = !!groupsError;

  useEffect(() => {
    if (groupsError) {
      logger.error('涨停数据加载失败', String(groupsError));
    }
  }, [groupsError]);

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* 页面标题 */}
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <TrendingUp size={22} className="text-rise" />
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">
            涨停个股
          </h1>
          <span className="px-2 py-0.5 bg-rise-bg text-rise text-xs rounded font-medium">
            实时追踪
          </span>
          {!isLoading && (
            <span className="flex items-center gap-1 text-xs text-text-muted ml-1">
              <RefreshCw size={12} className="animate-spin" />
              每秒刷新
            </span>
          )}
        </div>
        <p className="text-sm text-text-secondary">
          实时监控全市场涨停个股，追踪封单金额、连板高度与板块分布
        </p>
      </div>

      {/* 情绪指标卡片 */}
      <SentimentCards sentiment={sentiment} />

      {/* 连板梯队 */}
      <ConsecutiveLadder stocks={normalStocks} onSelectStock={handleSelectStock} />

      {/* ST 涨停分组 - 卡片式布局 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border-color">
          <AlertTriangle size={16} className="text-warning" />
          <span className="text-base font-medium text-text-primary">ST 涨停</span>
          <Badge
            variant="outline"
            className="text-warning border-warning/50"
          >
            {stStocks.length} 只
          </Badge>
        </div>
        <div className="p-4">
          {stStocks.length === 0 ? (
            <div className="text-center py-6 text-text-muted text-sm">
              暂无 ST 涨停
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {stStocks.map((stock) => (
                <div
                  key={stock.code}
                  className="border border-warning/40 rounded-lg p-3 bg-warning/5 hover:bg-warning/10 transition-colors cursor-pointer"
                  onClick={() => handleSelectStock(stock)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium">
                        ST
                      </span>
                      <span className="text-sm font-medium text-text-primary truncate max-w-[120px]">
                        {stock.name}
                      </span>
                    </div>
                    {stock.isLateSeal && (
                      <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                        <Clock size={10} />
                        尾盘板
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-lg font-mono font-bold text-rise">
                      {formatPrice(stock.price)}
                    </span>
                    <span className="text-xs font-mono text-rise">
                      {formatPercent(stock.changePercent)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-text-muted">
                    <span>首封 {stock.firstSealTime}</span>
                    <span>{stock.consecutiveDays > 1 ? `${stock.consecutiveDays}连板` : '首板'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 错误提示 */}
      {hasError && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-warning flex-shrink-0 mt-0.5" />
          <div>
            <div className="text-sm font-medium text-warning">数据加载异常</div>
            <div className="text-xs text-text-muted mt-1">
              行情服务暂时不可用，请稍后重试。错误信息：{String(groupsError)}
            </div>
          </div>
        </div>
      )}

      {/* 涨停全景表格 */}
      {!isLoading && normalStocks.length === 0 && !hasError ? (
        <Empty className="bg-bg-secondary border-border-color">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <TrendingUp size={24} />
            </EmptyMedia>
            <EmptyTitle>暂无涨停个股</EmptyTitle>
          </EmptyHeader>
          <EmptyContent>
            <EmptyDescription>
              当前时段暂无涨停股票，请在交易时段内查看
            </EmptyDescription>
          </EmptyContent>
        </Empty>
      ) : (
        <LimitUpTable
          stocks={normalStocks}
          title="涨停全景"
          onSelectStock={handleSelectStock}
        />
      )}

      {/* 免责声明 */}
      <p className="text-center text-xs text-text-muted pt-2 pb-4">
        ⚠ 数据仅供参考，不构成任何投资建议
      </p>

      {/* 详情弹窗 */}
      <StockDetailDialog
        stock={selectedStock}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
};

export default LimitUpPage;
