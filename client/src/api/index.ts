import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';

export * as surgeApi from './surge';
export * as limitUpApi from './limit-up';
export * as limitBrokenApi from './limit-broken';
export * as screenerApi from './stock-screener';
export * as researchApi from './stock-research';
export * as compareApi from './stock-compare';
export * as watchlistApi from './watchlist';
export * as marketDataApi from './market-data';
export * as screenStrategies from './screen-strategies';
export * as alertSettings from './alert-settings';
export * as reportHistory from './report-history';

/**
 * 通用 API 请求工具
 * 使用 axiosForBackend 实例发起请求，自动携带租户/鉴权信息
 */
export { axiosForBackend, logger };
