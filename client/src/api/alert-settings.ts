import { axiosForBackend } from '@client/src/api';
import type {
  AlertSetting,
  AlertType,
  UpdateAlertSettingDto,
} from '@shared/api.interface';

/**
 * 预警设置 API 模块
 * 包含各类预警配置的读取与更新接口
 */

// 获取全部预警设置
export async function getAlertSettings(): Promise<AlertSetting[]> {
  const { data } = await axiosForBackend.get<AlertSetting[]>('/api/alert-settings');
  return data;
}

// 获取单条预警设置
export async function getAlertSetting(type: AlertType): Promise<AlertSetting> {
  const { data } = await axiosForBackend.get<AlertSetting>(
    `/api/alert-settings/${type}`,
  );
  return data;
}

// upsert 预警设置
export async function upsertAlertSetting(
  type: AlertType,
  params: UpdateAlertSettingDto,
): Promise<AlertSetting> {
  const { data } = await axiosForBackend.put<AlertSetting>(
    `/api/alert-settings/${type}`,
    params,
  );
  return data;
}

// 切换启用状态
export async function toggleAlertSetting(type: AlertType): Promise<AlertSetting> {
  const { data } = await axiosForBackend.post<AlertSetting>(
    `/api/alert-settings/${type}/toggle`,
  );
  return data;
}
