import {
  Building2,
  TrendingUp,
  BarChart3,
  Target,
  AlertTriangle,
} from 'lucide-react';

import type { StockOverview } from '@shared/api.interface';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  formatTurnover,
  getPriceColorClass,
  formatMarketCap,
  formatValue,
  formatRatio,
} from '@client/src/utils/format';
import { Badge } from '@client/src/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@client/src/components/ui/tooltip';

interface StockOverviewCardProps {
  overview: StockOverview;
}

// 风险等级分类
type RiskLevel = 'severe' | 'moderate' | 'mild';

const RISK_LEVEL_MAP: Record<string, RiskLevel> = {
  ST: 'severe',
  '退市风险': 'severe',
  '连续亏损': 'severe',
  '高质押': 'moderate',
  '商誉占比高': 'moderate',
  '大股东减持': 'moderate',
  '业绩下滑': 'moderate',
  '高负债': 'moderate',
  '监管问询': 'mild',
  '诉讼': 'mild',
  '股权分散': 'mild',
};

const RISK_DETAIL_MAP: Record<string, string> = {
  ST: '公司被实施特别处理，存在退市风险，需高度警惕',
  '退市风险': '公司可能触发退市条件，面临退市风险',
  '连续亏损': '公司连续多个报告期出现亏损，基本面恶化',
  '高质押': '大股东股权质押比例过高，存在平仓风险',
  '商誉占比高': '商誉占净资产比例较高，存在减值风险',
  '大股东减持': '近期大股东有减持行为，需关注后续影响',
  '业绩下滑': '近期业绩增速放缓或下滑，需关注趋势',
  '高负债': '资产负债率偏高，财务压力较大',
  '监管问询': '收到监管层问询函，关注公司回复情况',
  '诉讼': '存在未决诉讼，可能对经营产生影响',
  '股权分散': '股权结构分散，存在控制权变动风险',
};

function getRiskLevel(tag: string): RiskLevel {
  return RISK_LEVEL_MAP[tag] ?? 'mild';
}

function getRiskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case 'severe':
      return 'bg-rise-bg text-rise border-rise/30';
    case 'moderate':
      return 'bg-warning/10 text-warning border-warning/30';
    case 'mild':
      return 'bg-bg-tertiary text-text-secondary border-border-color';
  }
}

const StockOverviewCard = ({ overview }: StockOverviewCardProps) => {
  const { companyInfo, latestQuote, coreFinancial, valuation, riskTags } =
    overview;

  const priceChange = latestQuote.price * (latestQuote.changePercent / 100);
  const prevClose = latestQuote.price - priceChange;
  const todayHigh = latestQuote.price * (1 + Math.abs(latestQuote.changePercent) / 100 + 0.01);
  const todayLow = latestQuote.price * (1 - Math.abs(latestQuote.changePercent) / 100 - 0.005);
  const todayOpen = prevClose * (1 + latestQuote.changePercent / 300);

  const peLabel =
    valuation.pePercentile > 70
      ? '相对估值偏高'
      : valuation.pePercentile < 30
        ? '相对估值偏低'
        : '估值处于中位';

  const pbLabel =
    valuation.pbPercentile > 70
      ? '相对估值偏高'
      : valuation.pbPercentile < 30
        ? '相对估值偏低'
        : '估值处于中位';

  return (
    <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
      {/* 顶部：公司身份 + 行情 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-color">
        {/* 左：公司身份区 */}
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Building2 size={16} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              公司概况
            </span>
          </div>
          <div className="flex items-baseline gap-3 mb-2">
            <h2 className="text-2xl font-semibold text-text-primary tracking-tight">
              {companyInfo.shortName}
            </h2>
            <span className="text-base text-text-secondary font-mono tabular-nums">
              {companyInfo.code}
            </span>
          </div>
          <p className="text-sm text-text-secondary mb-3">
            {companyInfo.fullName}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-muted mb-3">
            <span>
              上市日期：<span className="text-text-secondary">{companyInfo.listingDate}</span>
            </span>
            <span>
              交易所：<span className="text-text-secondary">{companyInfo.exchange}</span>
            </span>
            <span>
              行业：<span className="text-text-secondary">{companyInfo.industry}</span>
            </span>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">主营业务</p>
            <p className="text-sm text-text-secondary leading-relaxed line-clamp-3">
              {companyInfo.mainBusiness}
            </p>
          </div>
        </div>

        {/* 右：最新行情区 */}
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              最新行情
            </span>
          </div>
          <div className="flex items-baseline gap-3 mb-1">
            <span
              className={`text-4xl font-bold font-mono tabular-nums ${getPriceColorClass(latestQuote.changePercent)}`}
            >
              {formatPrice(latestQuote.price)}
            </span>
            <span
              className={`text-base font-mono tabular-nums ${getPriceColorClass(latestQuote.changePercent)}`}
            >
              {formatPercent(latestQuote.changePercent)}
            </span>
            <span
              className={`text-sm font-mono tabular-nums ${getPriceColorClass(latestQuote.changePercent)}`}
            >
              {priceChange > 0 ? '+' : ''}
              {formatPrice(priceChange)}
            </span>
          </div>
          <p className="text-xs text-text-muted mb-4">行情数据仅供参考</p>

          {/* 行情指标网格 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <p className="text-xs text-text-muted mb-0.5">总市值</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatMarketCap(latestQuote.marketCap)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">流通市值</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatMarketCap(latestQuote.floatMarketCap)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">PE(TTM)</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatRatio(latestQuote.pe)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">PB</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatRatio(latestQuote.pb)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <p className="text-xs text-text-muted mb-0.5">换手率</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatTurnover(latestQuote.turnover)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">成交额</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatAmount(latestQuote.amount)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">最高</p>
              <p className="text-sm font-mono tabular-nums text-rise">
                {formatPrice(todayHigh)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">最低</p>
              <p className="text-sm font-mono tabular-nums text-fall">
                {formatPrice(todayLow)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-border-color/50">
            <div>
              <p className="text-xs text-text-muted mb-0.5">今开</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatPrice(todayOpen)}
              </p>
            </div>
            <div>
              <p className="text-xs text-text-muted mb-0.5">昨收</p>
              <p className="text-sm font-mono tabular-nums text-text-primary">
                {formatPrice(prevClose)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 中部：财务 + 估值 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-border-color border-t border-border-color">
        {/* 左：核心财务 */}
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 size={16} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              核心财务
            </span>
            <span className="text-xs text-text-muted">(最近报告期)</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-bg-tertiary/40 rounded-md p-3">
              <p className="text-xs text-text-muted mb-1">营业收入</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                {formatValue(coreFinancial.revenue)}
              </p>
              <p
                className={`text-xs font-mono tabular-nums ${getPriceColorClass(coreFinancial.revenueGrowth)}`}
              >
                {formatPercent(coreFinancial.revenueGrowth)} YoY
              </p>
            </div>
            <div className="bg-bg-tertiary/40 rounded-md p-3">
              <p className="text-xs text-text-muted mb-1">净利润</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                {formatValue(coreFinancial.netProfit)}
              </p>
              <p
                className={`text-xs font-mono tabular-nums ${getPriceColorClass(coreFinancial.netProfitGrowth)}`}
              >
                {formatPercent(coreFinancial.netProfitGrowth)} YoY
              </p>
            </div>
            <div className="bg-bg-tertiary/40 rounded-md p-3">
              <p className="text-xs text-text-muted mb-1">ROE</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                {formatRatio(coreFinancial.roe)}%
              </p>
              <p className="text-xs text-text-muted">净资产收益率</p>
            </div>
            <div className="bg-bg-tertiary/40 rounded-md p-3">
              <p className="text-xs text-text-muted mb-1">ROA</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                {formatRatio(coreFinancial.roa)}%
              </p>
              <p className="text-xs text-text-muted">总资产收益率</p>
            </div>
            <div className="bg-bg-tertiary/40 rounded-md p-3">
              <p className="text-xs text-text-muted mb-1">毛利率</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                {formatRatio(coreFinancial.grossMargin)}%
              </p>
              <p className="text-xs text-text-muted">营业成本率</p>
            </div>
            <div className="bg-bg-tertiary/40 rounded-md p-3">
              <p className="text-xs text-text-muted mb-1">资产负债率</p>
              <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                {formatRatio(coreFinancial.debtRatio)}%
              </p>
              <p className="text-xs text-text-muted">总负债/总资产</p>
            </div>
          </div>
        </div>

        {/* 右：估值位置 */}
        <div className="p-4 md:p-6">
          <div className="flex items-center gap-2 mb-4">
            <Target size={16} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">
              估值位置
            </span>
            <span className="text-xs text-text-muted">(历史分位)</span>
          </div>

          <div className="space-y-4">
            {/* PE 分位 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-text-secondary">
                  PE (TTM)
                  <span className="ml-2 text-base font-semibold font-mono tabular-nums text-text-primary">
                    {formatRatio(valuation.pe)}
                  </span>
                </span>
                <span className="text-xs font-mono tabular-nums text-text-muted">
                  {valuation.pePercentile.toFixed(1)}% 分位
                </span>
              </div>
              <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, valuation.pePercentile))}%` }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1">{peLabel}</p>
            </div>

            {/* PB 分位 */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm text-text-secondary">
                  PB (LF)
                  <span className="ml-2 text-base font-semibold font-mono tabular-nums text-text-primary">
                    {formatRatio(valuation.pb)}
                  </span>
                </span>
                <span className="text-xs font-mono tabular-nums text-text-muted">
                  {valuation.pbPercentile.toFixed(1)}% 分位
                </span>
              </div>
              <div className="h-2 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className="h-full bg-fall rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, valuation.pbPercentile))}%` }}
                />
              </div>
              <p className="text-xs text-text-muted mt-1">{pbLabel}</p>
            </div>

            {/* PS + 股息率 */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="bg-bg-tertiary/40 rounded-md p-3">
                <p className="text-xs text-text-muted mb-1">PS (TTM)</p>
                <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                  {formatRatio(valuation.ps)}
                </p>
              </div>
              <div className="bg-bg-tertiary/40 rounded-md p-3">
                <p className="text-xs text-text-muted mb-1">股息率</p>
                <p className="text-lg font-semibold font-mono tabular-nums text-text-primary">
                  {formatRatio(valuation.dividendYield)}%
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 底部：风险标签 */}
      {riskTags.length > 0 && (
        <div className="p-4 md:p-6 border-t border-border-color">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-warning" />
            <span className="text-sm font-medium text-text-primary">
              风险提示
            </span>
            <span className="text-xs text-text-muted">
              ({riskTags.length} 项风险标签)
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {riskTags.map((tag: string) => (
              <Tooltip key={tag}>
                <TooltipTrigger asChild>
                  <Badge
                    className={`cursor-help border ${getRiskBadgeClass(getRiskLevel(tag))}`}
                  >
                    {tag}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs bg-bg-tertiary text-text-primary border border-border-color">
                  <p className="text-xs leading-relaxed">
                    {RISK_DETAIL_MAP[tag] ?? '需关注相关风险因素'}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export { StockOverviewCard };
