import { FileText, ShieldCheck, AlertCircle } from 'lucide-react';

import type { DeepReport, ReportSection, EvidenceItem } from '@shared/api.interface';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@client/src/components/ui/tabs';
import { Badge } from '@client/src/components/ui/badge';

interface DeepReportSectionProps {
  report: DeepReport;
}

const TAB_KEYS = [
  'businessModel',
  'competitiveAdvantage',
  'financialQuality',
  'valuationFramework',
  'bearCase',
  'falsificationSignals',
] as const;

const TAB_LABELS: Record<(typeof TAB_KEYS)[number], string> = {
  businessModel: '商业模式',
  competitiveAdvantage: '竞争优势',
  financialQuality: '财务质量',
  valuationFramework: '估值框架',
  bearCase: '最强反方',
  falsificationSignals: '证伪信号',
};

const EVIDENCE_LEVEL_MAP: Record<
  EvidenceItem['level'],
  { label: string; className: string }
> = {
  primary: {
    label: '一手',
    className: 'bg-primary/15 text-primary border-primary/30',
  },
  structured: {
    label: '结构化',
    className: 'bg-fall/15 text-fall border-fall/30',
  },
  secondary: {
    label: '二手',
    className: 'bg-bg-tertiary text-text-muted border-border-color',
  },
};

interface EvidenceListProps {
  evidence: EvidenceItem[];
}

const EvidenceList = ({ evidence }: EvidenceListProps) => {
  if (evidence.length === 0) return null;

  return (
    <div className="mt-5">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={14} className="text-text-secondary" />
        <span className="text-sm font-medium text-text-primary">
          证据支撑
        </span>
        <span className="text-xs text-text-muted">({evidence.length})</span>
      </div>
      <div className="space-y-2">
        {evidence.map((item: EvidenceItem, index: number) => {
          const levelInfo = EVIDENCE_LEVEL_MAP[item.level];
          return (
            <div
              key={index}
              className="bg-bg-tertiary/40 border border-border-color/50 rounded-md p-3 hover:bg-bg-tertiary/60 transition-colors"
            >
              <div className="flex items-start gap-2">
                <Badge
                  className={`shrink-0 border ${levelInfo.className}`}
                  variant="outline"
                >
                  {levelInfo.label}
                </Badge>
                <p className="text-sm text-text-primary leading-relaxed flex-1">
                  {item.content}
                </p>
              </div>
              <div className="flex items-center gap-3 mt-2 ml-0 text-xs text-text-muted">
                <span>来源：{item.source}</span>
                <span>日期：{item.date}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

interface ReportContentProps {
  section: ReportSection;
}

const ReportContent = ({ section }: ReportContentProps) => {
  const paragraphs = section.content
    .split('\n')
    .filter((p: string) => p.trim().length > 0);

  return (
    <div className="py-2">
      <h3 className="text-lg font-semibold text-text-primary mb-3">
        {section.title}
      </h3>
      <div className="space-y-3">
        {paragraphs.map((p: string, idx: number) => (
          <p
            key={idx}
            className="text-sm text-text-secondary leading-relaxed"
          >
            {p}
          </p>
        ))}
      </div>
      <EvidenceList evidence={section.evidence} />
    </div>
  );
};

const DeepReportSection = ({ report }: DeepReportSectionProps) => {
  return (
    <div className="bg-bg-secondary border border-border-color rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 md:px-6 pt-4 md:pt-5 pb-2">
        <FileText size={16} className="text-text-secondary" />
        <span className="text-base font-medium text-text-primary">
          深度研究报告
        </span>
        <AlertCircle size={14} className="text-text-muted ml-auto" />
        <span className="text-xs text-text-muted">
          AI 生成，仅供参考
        </span>
      </div>

      <Tabs defaultValue="businessModel" className="w-full">
        <div className="px-4 md:px-6 overflow-x-auto">
          <TabsList className="w-fit min-w-full mb-2 bg-transparent p-0 h-auto gap-1">
            {TAB_KEYS.map((key) => (
              <TabsTrigger
                key={key}
                value={key}
                className="data-[state=active]:bg-bg-tertiary data-[state=active]:text-primary data-[state=active]:border-primary/30 px-3 py-1.5 text-sm border border-transparent rounded-md whitespace-nowrap"
              >
                {TAB_LABELS[key]}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <div className="px-4 md:px-6 pb-5 border-t border-border-color pt-4">
          {TAB_KEYS.map((key) => (
            <TabsContent key={key} value={key}>
              <ReportContent section={report[key]} />
            </TabsContent>
          ))}
        </div>
      </Tabs>
    </div>
  );
};

export { DeepReportSection };
