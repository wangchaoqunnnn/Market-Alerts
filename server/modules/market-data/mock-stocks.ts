import type { StockBase } from '@shared/api.interface';
import {
  classifyAShareCode,
  getPriceLimit,
  normalizeStockCode,
  type Board,
  type Market,
} from '@shared/a-share';

export interface StockMeta extends StockBase {
  industry: string;
  concept: string[];
  basePrice: number;
  marketCap: number;
  floatMarketCap: number;
  pe: number;
  pb: number;
  totalShares: number;
  floatShares: number;
  roe: number;
  revenue: number;
  netProfit: number;
  grossMargin: number;
  consecutiveDays: number;
}

/** 兼容旧命名（模拟与真实行情共用同一结构） */
export type MockStock = StockMeta;

export const INDUSTRIES: string[] = [
  '银行', '保险', '证券', '地产', '医药', '白酒', '新能源', '半导体',
  '军工', '消费电子', '汽车', '化工', '钢铁', '煤炭', '有色', '建筑',
  '建材', '机械', '电力', '公用事业', '交通运输', '农业', '食品饮料',
  '纺织服装', '商业零售', '互联网', '软件', '传媒', '通信', '环保',
];

export const CONCEPTS: string[] = [
  '人工智能', 'AI大模型', '算力', '芯片', '国产替代', '信创', '数字经济',
  '元宇宙', '虚拟现实', '增强现实', '机器人', '工业4.0', '智能制造',
  '新能源汽车', '动力电池', '储能', '光伏', '风电', '氢能', '碳中和',
  '医药创新', '医疗器械', '生物制药', '医美', '中医药', '养老概念',
  '白酒', '消费升级', '新零售', '跨境电商', '直播电商', '网红经济',
  '军工', '航天', '卫星互联网', '北斗导航', '航母概念', '大飞机',
  '稀土', '锂矿', '钴镍', '小金属', '黄金概念',
  '5G', '6G', '物联网', '车联网', '自动驾驶', '智能驾驶',
  '东数西算', '数据中心', '云计算', '边缘计算', '区块链', '数字货币',
  '种业振兴', '粮食安全', '乡村振兴', '共同富裕',
  '国企改革', '央企改革', '并购重组', '股权转让', '举牌概念',
  '高送转', '业绩预增', '回购概念', '增持概念',
  '碳中和', '碳达峰', '绿色电力', '节能环保', '垃圾分类', '生物质能',
  '华为概念', '小米概念', '苹果概念', '特斯拉概念', '宁德时代概念',
  '新冠检测', '疫苗概念', '中药配方颗粒', '创新药', 'CXO',
  '游戏', '影视', '动漫', 'AIGC', 'ChatGPT概念',
];

const NAME_PREFIXES: string[] = [
  '华夏', '东方', '南方', '北方', '西部', '华东', '华中', '华南',
  '国泰', '国信', '国投', '国电', '国投', '中航', '中船', '中铁',
  '中建', '中化', '中粮', '中芯', '中科', '中兵', '中国',
  '万科', '保利', '招商', '华润', '中信', '光大', '平安',
  '三一', '双汇', '五粮', '茅台', '泸州', '山西', '陕西',
  '山东', '江苏', '浙江', '广东', '四川', '湖北', '湖南',
  '海康', '大华', '立讯', '蓝思', '歌尔', '兆易', '卓胜',
  '宁德', '比亚迪', '长城', '长安', '吉利', '上汽', '广汽',
  '恒瑞', '药明', '迈瑞', '爱尔', '通策', '智飞', '沃森',
  '隆基', '通威', '阳光', '晶澳', '天合', '晶科', '中环',
  '赣锋', '天齐', '华友', '洛阳', '紫金', '山东黄', '中金',
  '宝钢', '鞍钢', '武钢', '包钢', '首钢', '太钢', '马钢',
  '神华', '中煤', '兖州', '陕西煤', '山西焦', '平煤', '潞安',
  '万华', '恒力', '荣盛', '桐昆', '恒逸', '盛虹', '东方盛',
  '美的', '格力', '海尔', '九阳', '苏泊尔', '老板', '飞科',
  '伊利', '蒙牛', '光明', '三元', '燕塘', '天润', '皇氏',
  '海天', '千禾', '中炬', '恒顺', '涪陵', '安琪', '桃李',
];

const NAME_SUFFIXES: string[] = [
  '科技', '电子', '信息', '智能', '数字', '网络', '软件', '通信',
  '股份', '集团', '控股', '实业', '发展', '建设', '工程',
  '医药', '医疗', '生物', '健康', '制药', '器械',
  '能源', '电力', '环保', '新能', '光伏', '风电',
  '汽车', '重工', '机械', '装备', '制造', '工业',
  '银行', '证券', '保险', '信托', '金融', '投资',
  '地产', '置业', '房产', '建设', '建材', '钢铁',
  '化工', '材料', '矿业', '有色', '煤炭', '石油',
  '消费', '食品', '饮料', '酒业', '乳业', '农业',
  '传媒', '文化', '旅游', '教育', '服务', '物流',
  '航空', '航天', '船舶', '兵器', '防务', '军工',
];

function seededRandom(seed: number): () => number {
  let s: number = seed;
  return (): number => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function pickRandom<T>(arr: T[], rand: () => number): T {
  return arr[Math.floor(rand() * arr.length)];
}

function pickMultiple<T>(arr: T[], count: number, rand: () => number): T[] {
  const result: T[] = [];
  const used: Set<number> = new Set();
  let attempts: number = 0;
  while (result.length < count && attempts < count * 10) {
    const idx: number = Math.floor(rand() * arr.length);
    if (!used.has(idx)) {
      used.add(idx);
      result.push(arr[idx]);
    }
    attempts += 1;
  }
  return result;
}

function generateStockName(industry: string, rand: () => number): string {
  const prefix: string = pickRandom(NAME_PREFIXES, rand);
  const industrySuffixMap: Record<string, string[]> = {
    '银行': ['银行'],
    '保险': ['保险', '人寿', '财险'],
    '证券': ['证券', '券商', '投顾'],
    '地产': ['地产', '置业', '房产', '集团'],
    '医药': ['医药', '药业', '制药', '生物'],
    '白酒': ['酒业', '老窖', '茅台', '贡酒'],
    '新能源': ['新能', '能源', '科技', '股份'],
    '半导体': ['科技', '电子', '芯片', '微电'],
    '军工': ['军工', '防务', '航天', '航空'],
    '消费电子': ['电子', '科技', '智能', '数码'],
    '汽车': ['汽车', '车业', '动力', '股份'],
    '化工': ['化工', '化学', '材料', '股份'],
    '钢铁': ['钢铁', '特钢', '不锈', '股份'],
    '煤炭': ['煤业', '煤炭', '能源', '股份'],
    '有色': ['有色', '金属', '矿业', '股份'],
    '建筑': ['建筑', '建设', '工程', '股份'],
    '建材': ['建材', '材料', '股份', '集团'],
    '机械': ['机械', '重工', '装备', '股份'],
    '电力': ['电力', '能源', '发电', '股份'],
    '公用事业': ['公用', '环保', '水务', '燃气'],
    '交通运输': ['交通', '运输', '物流', '航空'],
    '农业': ['农业', '种业', '农牧', '股份'],
    '食品饮料': ['食品', '饮料', '乳业', '股份'],
    '纺织服装': ['纺织', '服装', '服饰', '股份'],
    '商业零售': ['商业', '零售', '百货', '股份'],
    '互联网': ['科技', '网络', '信息', '互联'],
    '软件': ['软件', '信息', '科技', '数字'],
    '传媒': ['传媒', '文化', '影视', '娱乐'],
    '通信': ['通信', '信息', '科技', '网络'],
    '环保': ['环保', '环境', '节能', '股份'],
  };
  const suffixes: string[] = industrySuffixMap[industry] ?? NAME_SUFFIXES;
  const suffix: string = pickRandom(suffixes, rand);
  return prefix + suffix;
}

/** 板块配额：覆盖沪市主板 / 深市主板 / 创业板 / 科创板 / 北交所全部号段 */
export interface BoardPlan {
  market: Market;
  board: Board;
  /** 号段池：按真实市场占比重复排列，轮转分配，保证每个号段都有股票 */
  prefixPool: string[];
  /** 相对权重（近似真实 A 股市场结构：主板约 58%、创业板 25%、科创板 11%、北交所 6%） */
  weight: number;
  /** 每个行业至少生成的股票数，保证冷门行业也不会漏掉某个板块 */
  minPerIndustry: number;
}

export const BOARD_PLANS: BoardPlan[] = [
  {
    market: 'sh',
    board: 'main',
    // 沪市主板：600 / 601 / 603 / 605
    prefixPool: ['600', '600', '600', '600', '601', '601', '603', '603', '603', '605'],
    weight: 0.3,
    minPerIndustry: 3,
  },
  {
    market: 'sz',
    board: 'main',
    // 深市主板：000 / 001 / 002（原中小板）/ 003
    prefixPool: ['000', '000', '000', '001', '002', '002', '002', '002', '003'],
    weight: 0.28,
    minPerIndustry: 3,
  },
  {
    market: 'sz',
    board: 'gem',
    // 深市创业板：300 / 301
    prefixPool: ['300', '300', '300', '300', '301'],
    weight: 0.25,
    minPerIndustry: 2,
  },
  {
    market: 'sh',
    board: 'star',
    // 沪市科创板：688 / 689（存托凭证）
    prefixPool: ['688', '688', '688', '688', '689'],
    weight: 0.11,
    minPerIndustry: 1,
  },
  {
    market: 'bj',
    board: 'bj',
    // 北交所：430 / 830 / 870 / 920
    prefixPool: ['430', '430', '830', '830', '830', '830', '870', '870', '870', '920'],
    weight: 0.06,
    minPerIndustry: 1,
  },
];

/** 目标股票池规模（按板块权重分配；仅影响模拟行情规模） */
export const TARGET_UNIVERSE_SIZE: number = 620;

/** 保留代码：由固定标的占用，生成器跳过（600519 贵州茅台） */
const RESERVED_CODES: Set<string> = new Set(['600519']);

/** 代码 → 确定性随机数：同一只股票每次得到的名称/价格等完全一致 */
export function seededRandomForCode(code: string): () => number {
  let hash: number = 0;
  for (let i: number = 0; i < code.length; i += 1) {
    hash = (hash * 31 + code.charCodeAt(i)) % 2147483647;
  }
  return seededRandom(hash === 0 ? 20240909 : hash);
}

export interface MockStockSeed {
  code: string;
  market: Market;
  board: Board;
  industry: string;
  rand: () => number;
  /** 传入时用于名称去重（批量生成时复用同一集合） */
  takenNames?: Set<string>;
}

/** 构造单只股票的全部字段：批量生成与「按需纳入监控」共用同一套逻辑 */
export function buildMockStock(seed: MockStockSeed): MockStock {
  const { code, market, board, industry, rand } = seed;

  let name: string = generateStockName(industry, rand);
  if (seed.takenNames) {
    let attempts: number = 0;
    while (seed.takenNames.has(name) && attempts < 20) {
      name = generateStockName(industry, rand);
      attempts += 1;
    }
    if (seed.takenNames.has(name)) {
      name = name + Math.floor(rand() * 100);
    }
    seed.takenNames.add(name);
  }

  const isST: boolean = rand() < 0.05;
  const isNew: boolean = rand() < 0.03;

  // 涨跌幅限制按板块规则计算：主板 10%（ST 5%）、创业板/科创板 20%、北交所 30%
  const { limitUpPercent, limitDownPercent } = getPriceLimit(board, isST);

  const basePrice: number = 2 + Math.pow(rand(), 1.8) * 498;
  const totalShares: number = (1 + rand() * 500) * 1e8;
  const floatRatio: number = 0.3 + rand() * 0.6;
  const floatShares: number = totalShares * floatRatio;
  const marketCap: number = totalShares * basePrice;
  const floatMarketCap: number = floatShares * basePrice;
  const pe: number = isST ? -5 + rand() * 30 : 5 + Math.pow(rand(), 1.5) * 150;
  const pb: number = 0.5 + rand() * 10;
  const roe: number = -5 + rand() * 30;
  const revenue: number = (1 + rand() * 2000) * 1e8;
  const netProfit: number = revenue * (roe / 100);
  const grossMargin: number = 0.1 + rand() * 0.7;

  const conceptCount: number = 2 + Math.floor(rand() * 4);
  const concept: string[] = pickMultiple(CONCEPTS, conceptCount, rand);
  concept.push(industry);

  const consecutiveDays: number = rand() < 0.1
    ? 1 + Math.floor(rand() * 5)
    : (rand() < 0.02 ? Math.floor(rand() * 10) : 0);

  return {
    code,
    name: isST ? 'ST' + name.slice(0, Math.min(4, name.length)) : name,
    market,
    board,
    isST,
    isNew,
    limitUpPercent,
    limitDownPercent,
    industry,
    concept,
    basePrice,
    marketCap,
    floatMarketCap,
    pe,
    pb,
    totalShares,
    floatShares,
    roe,
    revenue,
    netProfit,
    grossMargin,
    consecutiveDays,
  };
}

/**
 * 按真实 A 股代码号段即时构造股票。
 * 用途：用户搜索/自选/研究任意沪深主板、创业板、科创板、北交所代码时都能纳入监控，
 * 不会因为代码不在预置股票池里而被判定为「不存在」。
 * 非 A 股代码（B 股、新三板、基金等）抛错，由调用方转换为 404。
 */
export function buildMockStockForCode(codeInput: string): MockStock {
  const info: { market: Market; board: Board } | null = classifyAShareCode(codeInput);
  const code: string | null = normalizeStockCode(codeInput);
  if (!info || !code) {
    throw new Error(`不是有效的 A 股代码：${codeInput}`);
  }
  const rand: () => number = seededRandomForCode(code);
  const industry: string = pickRandom(INDUSTRIES, rand);
  return buildMockStock({ code, market: info.market, board: info.board, industry, rand });
}

/** 演示用真实标的：贵州茅台（沪市主板） */
function buildBlueChipStock(): MockStock {
  return {
    code: '600519',
    name: '贵州茅台',
    market: 'sh',
    board: 'main',
    isST: false,
    isNew: false,
    limitUpPercent: 0.1,
    limitDownPercent: 0.1,
    industry: '白酒',
    concept: ['白酒', '消费升级', '国酒', '高送转', '业绩预增'],
    basePrice: 1680,
    marketCap: 2.1e12,
    floatMarketCap: 2.1e12,
    pe: 28,
    pb: 9,
    totalShares: 12.56e8,
    floatShares: 12.56e8,
    roe: 32,
    revenue: 1265e8,
    netProfit: 627e8,
    grossMargin: 0.91,
    consecutiveDays: 0,
  };
}

export function generateMockStocks(): MockStock[] {
  const rand: () => number = seededRandom(20240909);
  const stocks: MockStock[] = [];
  const usedCodes: Set<string> = new Set();
  const usedNames: Set<string> = new Set();

  /**
   * 生成并登记一只股票（板块 → 号段 的分配在下方主循环里完成）
   * 字段构造统一走 buildMockStock，保证批量池与「按需纳入」两只路径完全一致
   */
  function addStock(
    code: string,
    market: Market,
    board: Board,
    industry: string,
  ): MockStock {
    if (usedCodes.has(code)) {
      throw new Error(`代码重复：${code}`);
    }
    const stock: MockStock = buildMockStock({
      code,
      market,
      board,
      industry,
      rand,
      takenNames: usedNames,
    });
    usedCodes.add(code);
    stocks.push(stock);
    return stock;
  }

  // 主循环：按行业 × 板块（沪市主板/深市主板/创业板/科创板/北交所）分配股票，
  // 每个板块内再按号段池轮转，保证 600/601/603/605、000/001/002/003、
  // 300/301、688/689、430/830/870/920 等号段全部有覆盖，不会遗漏任何交易所板块。
  const planCursors: Map<string, number> = new Map();
  const codeCursors: Map<string, number> = new Map();

  const nextCode = (prefix: string): string => {
    let seq: number = (codeCursors.get(prefix) ?? 0) + 1;
    let candidate: string = prefix + String(seq).padStart(3, '0');
    while (RESERVED_CODES.has(candidate) || usedCodes.has(candidate)) {
      seq += 1;
      if (seq > 999) {
        throw new Error(`号段 ${prefix} 已分配完，请调整 TARGET_UNIVERSE_SIZE`);
      }
      candidate = prefix + String(seq).padStart(3, '0');
    }
    codeCursors.set(prefix, seq);
    return candidate;
  };

  for (const industry of INDUSTRIES) {
    for (const plan of BOARD_PLANS) {
      const planKey: string = `${plan.market}:${plan.board}`;
      const weighted: number = Math.round(
        (TARGET_UNIVERSE_SIZE * plan.weight) / INDUSTRIES.length,
      );
      const count: number = Math.max(plan.minPerIndustry, weighted + Math.floor(rand() * 2));

      for (let i: number = 0; i < count; i += 1) {
        const cursor: number = planCursors.get(planKey) ?? 0;
        planCursors.set(planKey, cursor + 1);
        const prefix: string = plan.prefixPool[cursor % plan.prefixPool.length];
        addStock(nextCode(prefix), plan.market, plan.board, industry);
      }
    }
  }

  // 固定标的：贵州茅台（600519 已在 RESERVED_CODES 中预留）
  const blueChip: MockStock = addStock('600519', 'sh', 'main', '白酒');
  Object.assign(blueChip, buildBlueChipStock());

  return stocks;
}
