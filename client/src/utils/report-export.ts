import type { StockResearch, DeepReport } from '@shared/api.interface';
import {
  formatPrice,
  formatPercent,
  formatAmount,
  formatTurnover,
  formatMarketCap,
  formatValue,
  formatRatio,
} from './format';

/**
 * 生成个股研究 Markdown 报告
 */
export function generateResearchMarkdown(data: StockResearch): string {
  const { code, name, overview, deepReport } = data;
  const { companyInfo, latestQuote, coreFinancial, valuation, riskTags } =
    overview;

  const priceChange = latestQuote.price * (latestQuote.changePercent / 100);
  const prevClose = latestQuote.price - priceChange;

  const lines: string[] = [];

  lines.push(`# ${name} (${code}) 深度研究报告`);
  lines.push('');
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`> 风险提示：本报告由 AI 自动生成，仅供参考，不构成任何投资建议`);
  lines.push('');

  // 一、公司概况
  lines.push('## 一、公司概况');
  lines.push('');
  lines.push(`- **公司全称**：${companyInfo.fullName}`);
  lines.push(`- **股票简称**：${companyInfo.shortName}`);
  lines.push(`- **股票代码**：${companyInfo.code}`);
  lines.push(`- **上市日期**：${companyInfo.listingDate}`);
  lines.push(`- **交易所**：${companyInfo.exchange}`);
  lines.push(`- **所属行业**：${companyInfo.industry}`);
  lines.push('');
  lines.push('**主营业务**：');
  lines.push(companyInfo.mainBusiness);
  lines.push('');

  // 二、最新行情
  lines.push('## 二、最新行情');
  lines.push('');
  lines.push(
    `**当前价**：${formatPrice(latestQuote.price)} 元（${formatPercent(latestQuote.changePercent)}，${priceChange > 0 ? '+' : ''}${formatPrice(priceChange)} 元）`,
  );
  lines.push('');
  lines.push('| 指标 | 数值 |');
  lines.push('|------|------|');
  lines.push(`| 总市值 | ${formatMarketCap(latestQuote.marketCap)} |`);
  lines.push(`| 流通市值 | ${formatMarketCap(latestQuote.floatMarketCap)} |`);
  lines.push(`| PE (TTM) | ${formatRatio(latestQuote.pe)} |`);
  lines.push(`| PB | ${formatRatio(latestQuote.pb)} |`);
  lines.push(`| 换手率 | ${formatTurnover(latestQuote.turnover)} |`);
  lines.push(`| 成交额 | ${formatAmount(latestQuote.amount)} |`);
  lines.push(`| 昨收 | ${formatPrice(prevClose)} 元 |`);
  lines.push('');

  // 三、核心财务
  lines.push('## 三、核心财务');
  lines.push('');
  lines.push('| 指标 | 数值 | 同比增速 |');
  lines.push('|------|------|----------|');
  lines.push(
    `| 营业收入 | ${formatValue(coreFinancial.revenue)} | ${formatPercent(coreFinancial.revenueGrowth)} |`,
  );
  lines.push(
    `| 净利润 | ${formatValue(coreFinancial.netProfit)} | ${formatPercent(coreFinancial.netProfitGrowth)} |`,
  );
  lines.push('');
  lines.push('**盈利能力**：');
  lines.push(`- ROE（净资产收益率）：${formatRatio(coreFinancial.roe)}%`);
  lines.push(`- ROA（总资产收益率）：${formatRatio(coreFinancial.roa)}%`);
  lines.push(`- 毛利率：${formatRatio(coreFinancial.grossMargin)}%`);
  lines.push(`- 净利率：${formatRatio(coreFinancial.netMargin)}%`);
  lines.push(`- 资产负债率：${formatRatio(coreFinancial.debtRatio)}%`);
  lines.push('');

  // 四、估值分析
  lines.push('## 四、估值分析');
  lines.push('');
  lines.push('| 指标 | 当前值 | 历史分位 |');
  lines.push('|------|--------|----------|');
  lines.push(
    `| PE (TTM) | ${formatRatio(valuation.pe)} | ${valuation.pePercentile.toFixed(2)}% |`,
  );
  lines.push(
    `| PB (LF) | ${formatRatio(valuation.pb)} | ${valuation.pbPercentile.toFixed(2)}% |`,
  );
  lines.push(`| PS (TTM) | ${formatRatio(valuation.ps)} | - |`);
  lines.push(`| 股息率 | ${formatRatio(valuation.dividendYield)}% | - |`);
  lines.push('');

  // 五、风险提示
  if (riskTags.length > 0) {
    lines.push('## 五、风险提示');
    lines.push('');
    riskTags.forEach((tag: string) => {
      lines.push(`- ⚠️ ${tag}`);
    });
    lines.push('');
  }

  // 六、深度研究
  lines.push('## 六、深度研究');
  lines.push('');

  const sections: { key: keyof DeepReport; title: string }[] = [
    { key: 'businessModel', title: '6.1 商业模式' },
    { key: 'competitiveAdvantage', title: '6.2 竞争优势' },
    { key: 'financialQuality', title: '6.3 财务质量' },
    { key: 'valuationFramework', title: '6.4 估值框架' },
    { key: 'bearCase', title: '6.5 最强反方' },
    { key: 'falsificationSignals', title: '6.6 证伪信号' },
  ];

  sections.forEach(({ key, title }) => {
    const section = deepReport[key];
    lines.push(`### ${title}`);
    lines.push('');
    lines.push(`**${section.title}**`);
    lines.push('');
    section.content
      .split('\n')
      .filter((p: string) => p.trim().length > 0)
      .forEach((p: string) => {
        lines.push(p);
        lines.push('');
      });

    if (section.evidence.length > 0) {
      lines.push('**证据支撑**：');
      lines.push('');
      const levelMap: Record<string, string> = {
        primary: '一手',
        structured: '结构化',
        secondary: '二手',
      };
      section.evidence.forEach((ev, idx: number) => {
        lines.push(
          `${idx + 1}. [${levelMap[ev.level]}] ${ev.content}（来源：${ev.source}，日期：${ev.date}）`,
        );
      });
      lines.push('');
    }
  });

  lines.push('---');
  lines.push('');
  lines.push('*免责声明：本报告由 AI 自动生成，内容仅供参考，不构成任何投资建议。投资有风险，入市需谨慎。*');
  lines.push('');

  return lines.join('\n');
}

/**
 * 下载 Markdown 报告
 */
export function downloadMarkdown(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.md') ? filename : `${filename}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
