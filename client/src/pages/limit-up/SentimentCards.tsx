import { TrendingUp, AlertTriangle, Zap, Trophy, Target, AlertCircle } from 'lucide-react';
import type { MarketSentiment } from '@shared/api.interface';
import { useFlashOnChange } from './hooks/useFlashOnChange';


interface SentimentCardsProps {
  sentiment: MarketSentiment | undefined;
}

interface CardConfig {
  label: string;
  valueKey: keyof MarketSentiment;
  icon: React.ReactNode;
  valueColor: string;
  bgAccent?: string;
  format: (v: number) => string;
  subtitle: string;
}

const cards: CardConfig[] = [
  {
    label: '涨停家数',
    valueKey: 'limitUpCount',
    icon: <TrendingUp size={16} />,
    valueColor: 'text-rise',
    bgAccent: 'from-rise/10 to-transparent',
    format: (v: number) => String(v),
    subtitle: '含 ST 涨停',
  },
  {
    label: '炸板家数',
    valueKey: 'brokenCount',
    icon: <AlertTriangle size={16} />,
    valueColor: 'text-warning',
    format: (v: number) => String(v),
    subtitle: '盘中曾打开涨停',
  },
  {
    label: '炸板率',
    valueKey: 'brokenRate',
    icon: <Zap size={16} />,
    valueColor: 'text-warning',
    format: (v: number) => `${v.toFixed(1)}%`,
    subtitle: '炸板 / 涨停尝试',
  },
  {
    label: '连板高度',
    valueKey: 'maxConsecutive',
    icon: <Trophy size={16} />,
    valueColor: 'text-rise',
    bgAccent: 'from-rise/20 to-transparent',
    format: (v: number) => `${v}板`,
    subtitle: '今日最高连板',
  },
  {
    label: '晋级率',
    valueKey: 'promotionRate',
    icon: <Target size={16} />,
    valueColor: 'text-fall',
    format: (v: number) => `${v.toFixed(1)}%`,
    subtitle: '连板晋级成功率',
  },
  {
    label: 'ST 涨停',
    valueKey: 'stLimitUpCount',
    icon: <AlertCircle size={16} />,
    valueColor: 'text-warning',
    format: (v: number) => String(v),
    subtitle: 'ST 股涨停数量',
  },
];

function SentimentCard({ config, value }: { config: CardConfig; value: number }) {
  const flash = useFlashOnChange(value);
  const display = config.format(value);

  return (
    <div
      className={`relative overflow-hidden bg-bg-secondary border border-border-color rounded-lg p-3 md:p-4 transition-all ${
        flash ? 'ring-1 ring-rise/40' : ''
      }`}
    >
      {config.bgAccent && (
        <div
          className={`absolute inset-0 bg-gradient-to-br ${config.bgAccent} pointer-events-none opacity-60`}
        />
      )}
      <div className="relative">
        <div className="flex items-center gap-1.5 text-text-muted text-xs mb-1">
          {config.icon}
          <span>{config.label}</span>
        </div>
        <div
          className={`text-2xl md:text-3xl font-mono tabular-nums font-bold ${
            config.valueColor
          } transition-all duration-300 ${flash ? 'scale-105' : ''}`}
        >
          {display}
        </div>
        <div className="text-xs text-text-muted mt-1">{config.subtitle}</div>
      </div>
    </div>
  );
}

const SentimentCards = ({ sentiment }: SentimentCardsProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
      {cards.map((card) => (
        <SentimentCard
          key={card.valueKey}
          config={card}
          value={sentiment?.[card.valueKey] ?? 0}
        />
      ))}
    </div>
  );
};

export default SentimentCards;
