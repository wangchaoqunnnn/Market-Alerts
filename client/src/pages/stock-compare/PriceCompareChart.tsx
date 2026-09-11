import ReactECharts from 'echarts-for-react';
import type { EChartsOption } from 'echarts';
import type { TopLevelFormatterParams } from 'echarts/types/dist/shared';

interface ChartSeries {
  code: string;
  name: string;
  data: number[];
}

interface PriceCompareChartProps {
  dates: string[];
  series: ChartSeries[];
}

const CHART_COLORS = ['#f85149', '#3fb950', '#58a6ff', '#d29922', '#a371f7'];

const PriceCompareChart = ({ dates, series }: PriceCompareChartProps) => {
  // Normalize each series to percentage change from first day (base 0%)
  const normalizedSeries = series.map((s) => {
    const base = s.data[0] ?? 1;
    return {
      ...s,
      data: s.data.map((v) => ((v - base) / base) * 100),
    };
  });

  const option: EChartsOption = {
    backgroundColor: 'transparent',
    textStyle: {
      color: '#8b949e',
    },
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(22, 27, 34, 0.95)',
      borderColor: '#30363d',
      textStyle: {
        color: '#e6edf3',
        fontSize: 12,
      },
      formatter: (params: TopLevelFormatterParams) => {
        const list = Array.isArray(params) ? params : [params];
        if (list.length === 0) return '';
        const date = list[0].name;
        const lines = list.map((p) => {
          const val = Number(p.value);
          const color = p.color;
          const sign = val > 0 ? '+' : '';
          return `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px;"></span>${p.seriesName}: <b>${sign}${val.toFixed(2)}%</b>`;
        });
        return `<div style="font-size:12px;"><div style="margin-bottom:4px;color:#8b949e;">${date}</div>${lines.join('<br/>')}</div>`;
      },
    },
    legend: {
      type: 'scroll',
      bottom: 0,
      textStyle: {
        color: '#8b949e',
        fontSize: 12,
      },
      itemWidth: 16,
      itemHeight: 8,
    },
    grid: {
      left: '3%',
      right: '4%',
      bottom: '18%',
      top: '8%',
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: dates,
      axisLine: {
        lineStyle: {
          color: '#30363d',
        },
      },
      axisLabel: {
        color: '#8b949e',
        fontSize: 11,
      },
      axisTick: {
        show: false,
      },
      boundaryGap: false,
    },
    yAxis: {
      type: 'value',
      axisLine: {
        show: false,
      },
      axisLabel: {
        color: '#8b949e',
        fontSize: 11,
        formatter: (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)}%`,
      },
      splitLine: {
        lineStyle: {
          color: '#21262d',
          type: 'dashed',
        },
      },
    },
    dataZoom: [
      {
        type: 'inside',
        start: 0,
        end: 100,
      },
    ],
    series: normalizedSeries.map((s, i) => ({
      name: s.name,
      type: 'line',
      data: s.data,
      smooth: true,
      symbol: 'none',
      lineStyle: {
        width: 2,
        color: CHART_COLORS[i % CHART_COLORS.length],
      },
      itemStyle: {
        color: CHART_COLORS[i % CHART_COLORS.length],
      },
    })),
  };

  return (
    <ReactECharts
      option={option}
      className="h-[400px] w-full"
      opts={{ renderer: 'canvas' }}
    />
  );
};

export default PriceCompareChart;
