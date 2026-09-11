import { axiosForBackend } from '@client/src/api';
import type {
  LimitUpStock,
  LimitBrokenStock,
  MarketSentiment,
  SurgeItem,
  SectorInfo,
  StockResearch,
  StockCompare,
  ScreenResult,
  ScreenConditions,
  ListResponse,
  StockQuote,
  StockBase,
  LimitUpGroupsResponse,
  LimitBrokenSectorStat,
  MarketStatus,
} from '@shared/api.interface';

/**
 * 行情数据 API 模块
 * 包含实时行情、涨停监控、炸板监控、市场情绪等基础行情接口
 */

// 获取涨停股列表
export async function getLimitUpList(): Promise<LimitUpStock[]> {
  const { data } = await axiosForBackend.get<LimitUpStock[]>(
    '/api/market-data/limit-up',
  );
  return data;
}

// 获取炸板监控列表
export async function getLimitBrokenList(): Promise<LimitBrokenStock[]> {
  const { data } = await axiosForBackend.get<LimitBrokenStock[]>(
    '/api/market-data/limit-broken',
  );
  return data;
}

// 获取市场情绪指标
export async function getSentiment(): Promise<MarketSentiment> {
  const { data } = await axiosForBackend.get<MarketSentiment>(
    '/api/market-data/sentiment',
  );
  return data;
}

// 获取涨速榜
export async function getSurgeBoard(params: {
  windowMinutes?: number;
  threshold?: number;
  sector?: string;
  onlyWatchlist?: boolean;
  excludeST?: boolean;
  limit?: number;
}): Promise<SurgeItem[]> {
  const { data } = await axiosForBackend.get<SurgeItem[]>(
    '/api/market-data/surge-board',
    { params },
  );
  return data;
}

// 获取板块列表
export async function getSectors(): Promise<SectorInfo[]> {
  const { data } = await axiosForBackend.get<SectorInfo[]>(
    '/api/market-data/sectors',
  );
  return data;
}

// 获取个股研究
export async function getStockResearch(code: string): Promise<StockResearch> {
  const { data } = await axiosForBackend.get<StockResearch>(
    `/api/market-data/research/${code}`,
  );
  return data;
}

// 多股对比
export async function compareStocks(codes: string[]): Promise<StockCompare> {
  const { data } = await axiosForBackend.post<StockCompare>(
    '/api/market-data/compare',
    { codes },
  );
  return data;
}

// 条件选股
export async function screenStocks(conditions: ScreenConditions): Promise<ListResponse<ScreenResult>> {
  const { data } = await axiosForBackend.post<ListResponse<ScreenResult>>(
    '/api/market-data/screen',
    conditions,
  );
  return data;
}

// 搜索股票
export async function searchStocks(keyword: string): Promise<StockBase[]> {
  const { data } = await axiosForBackend.get<StockBase[]>(
    '/api/market-data/stocks/search',
    { params: { keyword } },
  );
  return data;
}

// 批量获取行情
export async function getBatchQuotes(codes: string): Promise<StockQuote[]> {
  const { data } = await axiosForBackend.get<StockQuote[]>(
    '/api/market-data/quotes/batch',
    { params: { codes } },
  );
  return data;
}

// 获取涨停股分组（普通/ST/不限涨跌幅）
export async function getLimitUpGroups(): Promise<LimitUpGroupsResponse> {
  const { data } = await axiosForBackend.get<LimitUpGroupsResponse>(
    '/api/market-data/limit-up/groups',
  );
  return data;
}

// 获取炸板板块统计
export async function getLimitBrokenSectorStats(): Promise<LimitBrokenSectorStat[]> {
  const { data } = await axiosForBackend.get<LimitBrokenSectorStat[]>(
    '/api/market-data/limit-broken/sector-stats',
  );
  return data;
}

// 获取市场状态
export async function getMarketStatus(): Promise<MarketStatus> {
  const { data } = await axiosForBackend.get<MarketStatus>(
    '/api/market-data/market-status',
  );
  return data;
}
