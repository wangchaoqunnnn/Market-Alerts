import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  BarChart3,
  Building2,
  Crown,
  Save,
  X,
  RotateCcw,
  Zap,
  Target,
  DollarSign,
  Activity,
} from 'lucide-react';
import type { ScreenConditions } from '@shared/api.interface';
import { Input } from '@client/src/components/ui/input';
import { Label } from '@client/src/components/ui/label';
import { Button } from '@client/src/components/ui/button';
import { Badge } from '@client/src/components/ui/badge';

interface SavedStrategy {
  id: string;
  name: string;
  description: string;
  conditions: ScreenConditions;
  createdAt: string;
}

interface FilterPanelProps {
  conditions: ScreenConditions;
  onConditionsChange: (conditions: ScreenConditions) => void;
  onScreen: () => void;
  isLoading: boolean;
  savedStrategies: SavedStrategy[];
  onLoadStrategy: (strategy: SavedStrategy) => void;
  onDeleteStrategy: (id: string) => void;
  onReset: () => void;
}

const INDUSTRIES = [
  '电子', '计算机', '医药生物', '电力设备', '新能源',
  '食品饮料', '白酒', '消费', '金融', '银行',
  '房地产', '建筑', '建材', '钢铁', '有色金属',
  '化工', '汽车', '机械设备', '军工', '传媒',
  '通信', '农业', '煤炭', '石油石化', '公用事业',
  '交通运输', '环保', '商贸零售', '社会服务', '纺织服装',
];

const CONCEPTS = [
  '人工智能', '机器人', '芯片', '半导体', '集成电路',
  '新能源汽车', '锂电池', '光伏', '储能', '风电',
  '氢能', '算力', '数据中心', '云计算', '大数据',
  '数字经济', '信创', '国产替代', '元宇宙', '虚拟现实',
  '消费电子', '苹果链', '华为链', '特斯拉链', '医药创新',
  '创新药', '医美', '军工科技', '卫星互联网', '低空经济',
];

const LEADER_PRESETS = [
  {
    name: '产业龙头',
    desc: '行业市占率领先企业',
    icon: <Crown size={16} />,
    color: 'text-rise',
    conditions: { peMax: 30, roeMin: 15, revenueGrowthMin: 10, marketCapMin: 500 },
  },
  {
    name: '业务龙头',
    desc: '主营业务增速领先',
    icon: <TrendingUp size={16} />,
    color: 'text-warning',
    conditions: { revenueGrowthMin: 30, profitGrowthMin: 30, roeMin: 12, turnoverMin: 3 },
  },
  {
    name: '市值龙头',
    desc: '千亿以上市值龙头',
    icon: <DollarSign size={16} />,
    color: 'text-primary',
    conditions: { marketCapMin: 1000, peMax: 50, roeMin: 10, dividendMin: 2 },
  },
  {
    name: '交易龙头',
    desc: '成交额与换手率领先',
    icon: <Activity size={16} />,
    color: 'text-rise',
    conditions: { amountMin: 10, turnoverMin: 5, changeMin: 3, marketCapMin: 100 },
  },
];

function FilterSection({
  title,
  icon,
  defaultOpen = true,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border-color last:border-b-0">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-bg-tertiary/30 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 text-text-primary font-medium text-sm">
          {icon}
          {title}
        </div>
        {open ? (
          <ChevronUp size={16} className="text-text-muted" />
        ) : (
          <ChevronDown size={16} className="text-text-muted" />
        )}
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  );
}

function NumberInputPair({
  label,
  unit,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
}: {
  label: string;
  unit?: string;
  minValue?: number;
  maxValue?: number;
  onMinChange: (v: number | undefined) => void;
  onMaxChange: (v: number | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-text-secondary text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          size={1}
          placeholder="最小"
          className="h-8 text-xs"
          value={minValue ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onMinChange(v === '' ? undefined : Number(v));
          }}
        />
        <span className="text-text-muted text-xs">—</span>
        <Input
          type="number"
          size={1}
          placeholder="最大"
          className="h-8 text-xs"
          value={maxValue ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onMaxChange(v === '' ? undefined : Number(v));
          }}
        />
        {unit && <span className="text-text-muted text-xs w-6">{unit}</span>}
      </div>
    </div>
  );
}

function NumberInputSingle({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit?: string;
  value?: number;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-text-secondary text-xs">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          size={1}
          placeholder="最小"
          className="h-8 text-xs"
          value={value ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === '' ? undefined : Number(v));
          }}
        />
        {unit && <span className="text-text-muted text-xs w-6">{unit}</span>}
      </div>
    </div>
  );
}

function MultiSelectChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (item: string) => {
    if (selected.includes(item)) {
      onChange(selected.filter((s) => s !== item));
    } else {
      onChange([...selected, item]);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-text-secondary text-xs">
        {label}{selected.length > 0 && <span className="text-primary ml-1">({selected.length})</span>}
      </Label>
      <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
        {options.map((opt) => {
          const isSelected = selected.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              className={`px-2 py-0.5 text-xs rounded border transition-colors ${
                isSelected
                  ? 'bg-primary/20 text-primary border-primary/50'
                  : 'bg-bg-tertiary/40 text-text-secondary border-border-color hover:border-primary/30 hover:text-text-primary'
              }`}
              onClick={() => toggle(opt)}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function FilterPanel({
  conditions,
  onConditionsChange,
  onScreen,
  isLoading,
  savedStrategies,
  onLoadStrategy,
  onDeleteStrategy,
  onReset,
}: FilterPanelProps) {
  const update = <K extends keyof ScreenConditions>(key: K, value: ScreenConditions[K]) => {
    onConditionsChange({ ...conditions, [key]: value });
  };

  const applyPreset = (presetConditions: ScreenConditions) => {
    onConditionsChange({ ...conditions, ...presetConditions });
    // Auto-execute screen after applying preset
    setTimeout(() => onScreen(), 50);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Filter sections */}
      <div className="flex-1 overflow-y-auto">
        {/* 基本面筛选 */}
        <FilterSection
          title="基本面筛选"
          icon={<BarChart3 size={16} className="text-primary" />}
          defaultOpen
        >
          <NumberInputPair
            label="PE（市盈率）"
            minValue={conditions.peMin}
            maxValue={conditions.peMax}
            onMinChange={(v) => update('peMin', v)}
            onMaxChange={(v) => update('peMax', v)}
          />
          <NumberInputPair
            label="PB（市净率）"
            minValue={conditions.pbMin}
            maxValue={conditions.pbMax}
            onMinChange={(v) => update('pbMin', v)}
            onMaxChange={(v) => update('pbMax', v)}
          />
          <NumberInputSingle
            label="ROE（净资产收益率）"
            unit="%"
            value={conditions.roeMin}
            onChange={(v) => update('roeMin', v)}
          />
          <NumberInputSingle
            label="营收增速"
            unit="%"
            value={conditions.revenueGrowthMin}
            onChange={(v) => update('revenueGrowthMin', v)}
          />
          <NumberInputSingle
            label="净利润增速"
            unit="%"
            value={conditions.profitGrowthMin}
            onChange={(v) => update('profitGrowthMin', v)}
          />
          <NumberInputSingle
            label="股息率"
            unit="%"
            value={conditions.dividendMin}
            onChange={(v) => update('dividendMin', v)}
          />
        </FilterSection>

        {/* 行情筛选 */}
        <FilterSection
          title="行情筛选"
          icon={<TrendingUp size={16} className="text-rise" />}
          defaultOpen
        >
          <NumberInputPair
            label="换手率"
            unit="%"
            minValue={conditions.turnoverMin}
            maxValue={conditions.turnoverMax}
            onMinChange={(v) => update('turnoverMin', v)}
            onMaxChange={(v) => update('turnoverMax', v)}
          />
          <NumberInputPair
            label="成交额"
            unit="亿"
            minValue={conditions.amountMin}
            maxValue={conditions.amountMax}
            onMinChange={(v) => update('amountMin', v)}
            onMaxChange={(v) => update('amountMax', v)}
          />
          <NumberInputPair
            label="涨跌幅"
            unit="%"
            minValue={conditions.changeMin}
            maxValue={conditions.changeMax}
            onMinChange={(v) => update('changeMin', v)}
            onMaxChange={(v) => update('changeMax', v)}
          />
          <NumberInputPair
            label="流通市值"
            unit="亿"
            minValue={conditions.marketCapMin}
            maxValue={conditions.marketCapMax}
            onMinChange={(v) => update('marketCapMin', v)}
            onMaxChange={(v) => update('marketCapMax', v)}
          />
        </FilterSection>

        {/* 行业/概念筛选 */}
        <FilterSection
          title="行业 / 概念"
          icon={<Building2 size={16} className="text-warning" />}
          defaultOpen={false}
        >
          <MultiSelectChips
            label="行业板块"
            options={INDUSTRIES}
            selected={conditions.industry ?? []}
            onChange={(v) => update('industry', v.length > 0 ? v : undefined)}
          />
          <MultiSelectChips
            label="概念题材"
            options={CONCEPTS}
            selected={conditions.concept ?? []}
            onChange={(v) => update('concept', v.length > 0 ? v : undefined)}
          />
        </FilterSection>

        {/* 龙头识别 */}
        <FilterSection
          title="龙头识别"
          icon={<Crown size={16} className="text-warning" />}
          defaultOpen={false}
        >
          <div className="grid grid-cols-2 gap-2">
            {LEADER_PRESETS.map((preset) => (
              <button
                key={preset.name}
                type="button"
                className="flex flex-col items-start gap-1 p-3 bg-bg-tertiary/40 border border-border-color rounded-lg hover:border-primary/40 hover:bg-bg-tertiary/60 transition-all text-left"
                onClick={() => applyPreset(preset.conditions)}
              >
                <div className={`${preset.color}`}>{preset.icon}</div>
                <div className="text-xs font-medium text-text-primary">{preset.name}</div>
                <div className="text-[10px] text-text-muted leading-tight">{preset.desc}</div>
              </button>
            ))}
          </div>
        </FilterSection>

        {/* 我的策略 */}
        <FilterSection
          title="我的策略"
          icon={<Save size={16} className="text-primary" />}
          defaultOpen={false}
        >
          {savedStrategies.length === 0 ? (
            <div className="text-xs text-text-muted text-center py-4">
              暂无保存的策略
              <div className="mt-1">筛选后点击"保存策略"即可收藏</div>
            </div>
          ) : (
            <div className="space-y-2">
              {savedStrategies.map((strategy) => (
                <div
                  key={strategy.id}
                  className="flex items-center justify-between p-2 bg-bg-tertiary/40 rounded-md hover:bg-bg-tertiary/60 transition-colors group"
                >
                  <button
                    type="button"
                    className="flex-1 text-left"
                    onClick={() => onLoadStrategy(strategy)}
                  >
                    <div className="text-xs font-medium text-text-primary truncate">
                      {strategy.name}
                    </div>
                    {strategy.description && (
                      <div className="text-[10px] text-text-muted truncate">
                        {strategy.description}
                      </div>
                    )}
                  </button>
                  <button
                    type="button"
                    className="opacity-0 group-hover:opacity-100 p-1 text-text-muted hover:text-rise transition-opacity"
                    onClick={() => onDeleteStrategy(strategy.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </FilterSection>
      </div>

      {/* Bottom action bar */}
      <div className="border-t border-border-color p-3 space-y-2 flex-shrink-0 bg-bg-secondary/80 backdrop-blur">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="flex-1"
            onClick={onReset}
          >
            <RotateCcw size={14} />
            重置
          </Button>
          <Button
            variant="default"
            size="sm"
            className="flex-1"
            onClick={onScreen}
            disabled={isLoading}
          >
            <Zap size={14} />
            {isLoading ? '筛选中...' : '开始选股'}
          </Button>
        </div>
      </div>
    </div>
  );
}
