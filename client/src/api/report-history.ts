import { axiosForBackend } from '@client/src/api';
import type {
  ReportHistory,
  ReportType,
  ListResponse,
} from '@shared/api.interface';

/**
 * 报告历史 API 模块
 * 包含研究/对比报告的历史记录增删查接口
 */

// 分页获取报告历史
export async function getReportHistory(params: {
  type?: ReportType;
  page?: number;
  pageSize?: number;
}): Promise<ListResponse<ReportHistory>> {
  const { data } = await axiosForBackend.get<ListResponse<ReportHistory>>(
    '/api/report-history',
    { params },
  );
  return data;
}

// 获取报告详情
export async function getReportHistoryDetail(id: string): Promise<ReportHistory> {
  const { data } = await axiosForBackend.get<ReportHistory>(
    `/api/report-history/${id}`,
  );
  return data;
}

// 保存报告到历史
export async function saveReportHistory(params: {
  reportType: ReportType;
  title: string;
  stockCodes?: string[];
  content: unknown;
}): Promise<ReportHistory> {
  const { data } = await axiosForBackend.post<ReportHistory>(
    '/api/report-history',
    params,
  );
  return data;
}

// 删除报告历史
export async function deleteReportHistory(id: string): Promise<{ success: boolean }> {
  const { data } = await axiosForBackend.delete<{ success: boolean }>(
    `/api/report-history/${id}`,
  );
  return data;
}
