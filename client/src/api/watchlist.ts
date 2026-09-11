import { axiosForBackend } from '@client/src/api';
import type { WatchlistStock } from '@shared/api.interface';

/**
 * 自选股 API 模块
 * 包含自选股增删改查、分组管理、异动提醒等接口
 */

// 获取自选股列表
export async function getWatchlist(): Promise<WatchlistStock[]> {
  const { data } = await axiosForBackend.get<WatchlistStock[]>('/api/watchlist/');
  return data;
}

// 添加自选股
export async function addWatchlistItem(params: {
  stockCode: string;
  stockName: string;
  notes?: string;
  tags?: string[];
}): Promise<WatchlistStock> {
  const { data } = await axiosForBackend.post<WatchlistStock>('/api/watchlist/', params);
  return data;
}

// 删除自选股
export async function removeWatchlistItem(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend.delete<{ success: boolean }>(`/api/watchlist/${id}`);
  return data;
}

// 更新自选股备注/标签
export async function updateWatchlistItem(
  id: string,
  params: { notes?: string; tags?: string[] },
): Promise<WatchlistStock> {
  const { data } = await axiosForBackend.patch<WatchlistStock>(`/api/watchlist/${id}`, params);
  return data;
}

// 批量添加自选股
export async function batchAddWatchlist(
  stocks: { stockCode: string; stockName: string }[],
): Promise<WatchlistStock[]> {
  const { data } = await axiosForBackend.post<WatchlistStock[]>('/api/watchlist/batch', { stocks });
  return data;
}
