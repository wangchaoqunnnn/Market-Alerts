import type { StockBase } from '@shared/api.interface';

export interface MockStock extends StockBase {
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

export function generateMockStocks(): MockStock[] {
  const rand: () => number = seededRandom(20240909);
  const stocks: MockStock[] = [];
  const usedCodes: Set<string> = new Set();
  const usedNames: Set<string> = new Set();

  function addStock(
    code: string,
    market: 'sh' | 'sz' | 'bj',
    board: 'main' | 'gem' | 'star' | 'bj',
    industry: string,
  ): void {
    if (usedCodes.has(code)) return;

    let name: string = generateStockName(industry, rand);
    let attempts: number = 0;
    while (usedNames.has(name) && attempts < 20) {
      name = generateStockName(industry, rand);
      attempts += 1;
    }
    if (usedNames.has(name)) {
      name = name + Math.floor(rand() * 100);
    }
    usedNames.add(name);
    usedCodes.add(code);

    const isST: boolean = rand() < 0.05;
    const isNew: boolean = rand() < 0.03;

    let limitUpPercent: number = 0.1;
    let limitDownPercent: number = 0.1;
    if (board === 'gem' || board === 'star') {
      limitUpPercent = 0.2;
      limitDownPercent = 0.2;
    } else if (board === 'bj') {
      limitUpPercent = 0.3;
      limitDownPercent = 0.3;
    }
    if (isST) {
      limitUpPercent = 0.05;
      limitDownPercent = 0.05;
    }

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

    stocks.push({
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
    });
  }

  let idx: number = 0;
  for (const industry of INDUSTRIES) {
    const perIndustry: number = 6 + Math.floor(rand() * 4);

    for (let i: number = 0; i < perIndustry; i += 1) {
      idx += 1;
      const codeNum: number = 600000 + idx;
      addStock(String(codeNum).padStart(6, '0'), 'sh', 'main', industry);
    }

    for (let i: number = 0; i < perIndustry; i += 1) {
      idx += 1;
      const codeNum: number = idx < 500 ? 100 + idx : 300000 + idx - 500;
      if (codeNum < 1000) {
        addStock('000' + String(codeNum).padStart(3, '0'), 'sz', 'main', industry);
      } else {
        addStock(String(codeNum).padStart(6, '0'), 'sz', 'gem', industry);
      }
    }

    if (idx % 3 === 0) {
      const starCode: string = '688' + String(100 + idx).padStart(3, '0');
      addStock(starCode, 'sh', 'star', industry);
    }

    if (idx % 5 === 0) {
      const bjCode: string = '8' + String(30000 + idx).padStart(5, '0');
      addStock(bjCode, 'bj', 'bj', industry);
    }
  }

  if (!usedCodes.has('600519')) {
    const maotaiIdx: number = stocks.findIndex((s: MockStock) => s.code === '600001');
    if (maotaiIdx >= 0) {
      stocks[maotaiIdx] = {
        ...stocks[maotaiIdx],
        code: '600519',
        name: '贵州茅台',
        industry: '白酒',
        basePrice: 1680,
        marketCap: 2.1e12,
        floatMarketCap: 2.1e12,
        pe: 28,
        pb: 9,
        roe: 32,
        totalShares: 12.56e8,
        floatShares: 12.56e8,
        revenue: 1265e8,
        netProfit: 627e8,
        grossMargin: 0.91,
        concept: ['白酒', '消费升级', '国酒', '高送转', '业绩预增'],
        isST: false,
        isNew: false,
        market: 'sh',
        board: 'main',
        limitUpPercent: 0.1,
        limitDownPercent: 0.1,
        consecutiveDays: 0,
      };
      usedCodes.add('600519');
    }
  }

  return stocks;
}
