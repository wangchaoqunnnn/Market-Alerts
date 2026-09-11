import { axiosForBackend } from '@client/src/api';
import type {
  ScreenStrategy,
  CreateScreenStrategyDto,
  UpdateScreenStrategyDto,
} from '@shared/api.interface';

/**
 * 选股策略 API 模块
 * 包含选股策略增删改查接口
 */

// 获取策略列表
export async function getScreenStrategies(): Promise<ScreenStrategy[]> {
  const { data } = await axiosForBackend.get<ScreenStrategy[]>('/api/screen-strategies');
  return data;
}

// 新建策略
export async function createScreenStrategy(
  params: CreateScreenStrategyDto,
): Promise<ScreenStrategy> {
  const { data } = await axiosForBackend.post<ScreenStrategy>(
    '/api/screen-strategies',
    params,
  );
  return data;
}

// 更新策略
export async function updateScreenStrategy(
  id: string,
  params: UpdateScreenStrategyDto,
): Promise<ScreenStrategy> {
  const { data } = await axiosForBackend.patch<ScreenStrategy>(
    `/api/screen-strategies/${id}`,
    params,
  );
  return data;
}

// 删除策略
export async function deleteScreenStrategy(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend.delete<{ success: boolean }>(
    `/api/screen-strategies/${id}`,
  );
  return data;
}
