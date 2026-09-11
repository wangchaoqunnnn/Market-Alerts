import { Download, FileText, Lightbulb } from 'lucide-react';
import { formatPercent, formatAmount } from '@client/src/utils/format';
import type { StockCompare } from '@shared/api.interface';

interface CompareReportProps {
  data: StockCompare;
  stockNames: { code: string; name: string }[];
}

const CompareReport = ({ data, stockNames }: CompareReportProps) => {
  const nameMap = new Map(stockNames.map((s) => [s.code, s.name]));

  const stockName = (code: string): string => nameMap.get(code) || code;

  // 提炼核心差异点
  const diffPoints = buildDiffPoints(data, stockName);

  const handleExport = () => {
    const report = buildReportText(data, stockName, diffPoints);
    const blob = new Blob([report], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `多股对比报告_${data.stocks.join('_')}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* 标题栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={18} className="text-primary" />
          <h3 className="text-base font-semibold text-text-primary">多股对比分析报告</h3>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-bg-tertiary text-text-primary border border-border-color rounded-md hover:border-primary/50 hover:text-primary transition-colors"
        >
          <Download size={14} />
          导出报告
        </button>
      </div>

      {/* 差异解释 */}
      <div className="bg-bg-tertiary/30 border border-border-color rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Lightbulb size={16} className="text-warning" />
          <span className="text-sm font-medium text-text-primary">差异解读</span>
        </div>
        <p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
          {data.diffExplanation || '暂无差异解释数据'}
        </p>
      </div>

      {/* 核心差异点 */}
      <div className="bg-bg-secondary border border-border-color rounded-lg p-4">
        <div className="text-sm font-medium text-text-primary mb-3">核心差异点</div>
        <ul className="space-y-2">
          {diffPoints.map((point, idx) => (
            <li key={idx} className="flex gap-2 text-sm">
              <span className="text-primary shrink-0 mt-0.5">{idx + 1}.</span>
              <span className="text-text-secondary leading-relaxed">{point}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* 数据口径说明 */}
      <div className="bg-bg-tertiary/20 border border-dashed border-border-color rounded-lg p-4">
        <div className="text-xs font-medium text-text-primary mb-2">数据口径说明</div>
        <ul className="space-y-1 text-[11px] text-text-muted">
          <li>• 数据口径统一为最新财报/交易日，币种均为人民币</li>
          <li>• 行情数据基于最近一个交易日收盘价计算</li>
          <li>• 财务数据基于最新定期报告（年报/中报/季报）</li>
          <li>• 估值数据基于最新收盘价，PE 为 TTM，PB 为 LF</li>
          <li>• 阶段涨跌幅为复权后价格计算，已考虑分红拆股因素</li>
          <li>• 对比结果仅供参考，不构成任何投资建议</li>
        </ul>
      </div>
    </div>
  );
};

function buildDiffPoints(
  data: StockCompare,
  stockName: (code: string) => string,
): string[] {
  const points: string[] = [];
  const codes = data.stocks;

  if (codes.length < 2) return points;

  // 1. 年初至今收益差异
  const ytdEntries = codes
    .map((c) => ({ code: c, val: data.pricePerformance?.[c]?.yearToDate }))
    .filter((e) => e.val !== undefined) as { code: string; val: number }[];
  if (ytdEntries.length >= 2) {
    ytdEntries.sort((a, b) => b.val - a.val);
    const best = ytdEntries[0];
    const worst = ytdEntries[ytdEntries.length - 1];
    const diff = best.val - worst.val;
    points.push(
      `年初至今收益方面，${stockName(best.code)}（${formatPercent(best.val)}）领先，${stockName(worst.code)}（${formatPercent(worst.val)}）相对落后，两者相差 ${formatPercent(diff)}。`,
    );
  }

  // 2. ROE 差异
  const roeEntries = codes
    .map((c) => ({ code: c, val: data.financialSnapshot?.[c]?.roe }))
    .filter((e) => e.val !== undefined) as { code: string; val: number }[];
  if (roeEntries.length >= 2) {
    roeEntries.sort((a, b) => b.val - a.val);
    points.push(
      `盈利能力方面，${stockName(roeEntries[0].code)} ROE 最高（${roeEntries[0].val.toFixed(2)}%），股东回报能力最强。`,
    );
  }

  // 3. PE 估值差异
  const peEntries = codes
    .map((c) => ({ code: c, val: data.valuation?.[c]?.pe }))
    .filter((e) => e.val !== undefined && e.val > 0) as { code: string; val: number }[];
  if (peEntries.length >= 2) {
    peEntries.sort((a, b) => a.val - b.val);
    points.push(
      `估值水平上，${stockName(peEntries[0].code)} PE 最低（${peEntries[0].val.toFixed(2)}倍），从价值投资角度相对更具估值优势。`,
    );
  }

  // 4. 资产负债率差异
  const debtEntries = codes
    .map((c) => ({ code: c, val: data.financialSnapshot?.[c]?.debtRatio }))
    .filter((e) => e.val !== undefined) as { code: string; val: number }[];
  if (debtEntries.length >= 2) {
    debtEntries.sort((a, b) => a.val - b.val);
    points.push(
      `财务稳健性方面，${stockName(debtEntries[0].code)}资产负债率最低（${debtEntries[0].val.toFixed(2)}%），财务杠杆相对保守。`,
    );
  }

  // 5. 营收规模
  const revenueEntries = codes
    .map((c) => ({ code: c, val: data.financialSnapshot?.[c]?.revenue }))
    .filter((e) => e.val !== undefined) as { code: string; val: number }[];
  if (revenueEntries.length >= 2) {
    revenueEntries.sort((a, b) => b.val - a.val);
    points.push(
      `营收规模方面，${stockName(revenueEntries[0].code)}以 ${formatAmount(revenueEntries[0].val)} 领先，行业地位相对突出。`,
    );
  }

  return points;
}

function buildReportText(
  data: StockCompare,
  stockName: (code: string) => string,
  diffPoints: string[],
): string {
  const codes = data.stocks;
  const lines: string[] = [];

  lines.push('# 多股对比分析报告');
  lines.push('');
  lines.push(`> 对比标的：${codes.map((c) => `${stockName(c)}（${c}）`).join('、')}`);
  lines.push(`> 生成时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push('');

  lines.push('## 一、差异解读');
  lines.push('');
  lines.push(data.diffExplanation || '暂无差异解释');
  lines.push('');

  lines.push('## 二、核心差异点');
  lines.push('');
  diffPoints.forEach((p, i) => {
    lines.push(`${i + 1}. ${p}`);
  });
  lines.push('');

  lines.push('## 三、行情与阶段涨跌');
  lines.push('');
  lines.push('| 指标 | ' + codes.map((c) => stockName(c)).join(' | ') + ' |');
  lines.push('| --- | ' + codes.map(() => ' --- ').join(' | ') + ' |');
  const perfRows = [
    { key: 'day1', label: '1日' },
    { key: 'day5', label: '5日' },
    { key: 'day20', label: '20日' },
    { key: 'day60', label: '60日' },
    { key: 'yearToDate', label: '年初至今' },
  ];
  perfRows.forEach((row) => {
    const vals = codes.map((c) => {
      const v = data.pricePerformance?.[c]?.[row.key as keyof typeof data.pricePerformance[string]];
      return v !== undefined ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}%` : '--';
    });
    lines.push(`| ${row.label} | ${vals.join(' | ')} |`);
  });
  lines.push('');

  lines.push('## 四、核心财务快照');
  lines.push('');
  lines.push('| 指标 | ' + codes.map((c) => stockName(c)).join(' | ') + ' |');
  lines.push('| --- | ' + codes.map(() => ' --- ').join(' | ') + ' |');
  const finRows = [
    { key: 'revenue', label: '营业收入' },
    { key: 'netProfit', label: '净利润' },
    { key: 'roe', label: 'ROE', suffix: '%' },
    { key: 'grossMargin', label: '毛利率', suffix: '%' },
    { key: 'netMargin', label: '净利率', suffix: '%' },
    { key: 'debtRatio', label: '资产负债率', suffix: '%' },
  ];
  finRows.forEach((row) => {
    const vals = codes.map((c) => {
      const v = data.financialSnapshot?.[c]?.[row.key as keyof typeof data.financialSnapshot[string]];
      if (v === undefined) return '--';
      if (row.key === 'revenue' || row.key === 'netProfit') return formatAmount(v);
      return `${v.toFixed(2)}${row.suffix || ''}`;
    });
    lines.push(`| ${row.label} | ${vals.join(' | ')} |`);
  });
  lines.push('');

  lines.push('## 五、估值水平');
  lines.push('');
  lines.push('| 指标 | ' + codes.map((c) => stockName(c)).join(' | ') + ' |');
  lines.push('| --- | ' + codes.map(() => ' --- ').join(' | ') + ' |');
  const valRows = [
    { key: 'pe', label: 'PE(TTM)', suffix: 'x' },
    { key: 'pb', label: 'PB(LF)', suffix: 'x' },
    { key: 'ps', label: 'PS(TTM)', suffix: 'x' },
    { key: 'dividendYield', label: '股息率', suffix: '%' },
  ];
  valRows.forEach((row) => {
    const vals = codes.map((c) => {
      const v = data.valuation?.[c]?.[row.key as keyof typeof data.valuation[string]];
      if (v === undefined) return '--';
      return `${v.toFixed(2)}${row.suffix}`;
    });
    lines.push(`| ${row.label} | ${vals.join(' | ')} |`);
  });
  lines.push('');

  lines.push('## 六、数据口径说明');
  lines.push('');
  lines.push('- 数据口径统一为最新财报/交易日，币种均为人民币');
  lines.push('- 行情数据基于最近一个交易日收盘价计算');
  lines.push('- 财务数据基于最新定期报告（年报/中报/季报）');
  lines.push('- 估值数据基于最新收盘价，PE 为 TTM，PB 为 LF');
  lines.push('- 阶段涨跌幅为复权后价格计算，已考虑分红拆股因素');
  lines.push('');
  lines.push('---');
  lines.push('*本报告由系统自动生成，仅供参考，不构成任何投资建议。股市有风险，入市需谨慎。*');
  lines.push('');

  return lines.join('\n');
}

export default CompareReport;
