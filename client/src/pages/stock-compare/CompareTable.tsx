import { formatPercent, getPriceColorClass } from '@client/src/utils/format';

interface CompareTableProps {
  rows: RowDef[];
  stocks: { code: string; name: string }[];
  getValue: (code: string, rowKey: string) => number | undefined;
  formatValue?: (value: number, rowKey: string) => string;
  highlightMode: 'higher' | 'lower';
  note?: string;
}

export interface RowDef {
  key: string;
  label: string;
  unit?: string;
  isPercent?: boolean;
  invertHighlight?: boolean; // 对该行反转高亮逻辑（如负债率越低越好）
}

const CompareTable = ({
  rows,
  stocks,
  getValue,
  formatValue,
  highlightMode,
  note,
}: CompareTableProps) => {
  // 计算每行的最优值
  const bestOfRow = (row: RowDef): number | null => {
    const values = stocks
      .map((s) => getValue(s.code, row.key))
      .filter((v): v is number => typeof v === 'number' && isFinite(v));
    if (values.length === 0) return null;

    const shouldInvert = row.invertHighlight ?? false;
    const mode = shouldInvert
      ? highlightMode === 'higher'
        ? 'lower'
        : 'higher'
      : highlightMode;

    return mode === 'higher' ? Math.max(...values) : Math.min(...values);
  };

  const renderCell = (stockCode: string, row: RowDef) => {
    const val = getValue(stockCode, row.key);
    if (val === undefined || val === null || !isFinite(val)) {
      return <span className="text-text-muted">--</span>;
    }

    const best = bestOfRow(row);
    const isBest = best !== null && val === best;

    let display: string;
    if (formatValue) {
      display = formatValue(val, row.key);
    } else if (row.isPercent) {
      display = formatPercent(val);
    } else {
      display = val.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
    }

    const colorClass = row.isPercent ? getPriceColorClass(val) : 'text-text-primary';

    return (
      <span
        className={`font-mono tabular-nums ${colorClass} ${
          isBest ? 'font-semibold' : ''
        }`}
      >
        {display}
        {row.unit && !row.isPercent && (
          <span className="text-text-muted font-normal ml-0.5">{row.unit}</span>
        )}
      </span>
    );
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr className="bg-bg-tertiary/50">
            <th className="px-4 py-3 text-left text-xs font-medium text-text-muted border-b border-border-color w-36">
              指标
            </th>
            {stocks.map((s) => (
              <th
                key={s.code}
                className="px-4 py-3 text-center border-b border-l border-border-color"
              >
                <div className="text-sm font-semibold text-text-primary">{s.name}</div>
                <div className="text-[10px] text-text-muted font-mono">{s.code}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={row.key}
              className={idx % 2 === 0 ? 'bg-bg-secondary' : 'bg-bg-tertiary/20'}
            >
              <td className="px-4 py-2.5 text-xs text-text-secondary border-b border-border-color/50">
                {row.label}
              </td>
              {stocks.map((s) => (
                <td
                  key={s.code}
                  className="px-4 py-2.5 text-center border-b border-l border-border-color/50"
                >
                  {renderCell(s.code, row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {note && (
        <div className="mt-2 text-[11px] text-text-muted px-4">{note}</div>
      )}
    </div>
  );
};

export default CompareTable;
