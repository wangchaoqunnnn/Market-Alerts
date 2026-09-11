import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
// configureApp() 内部执行 app.useLogger(app.get(AppLogger))，
// 而 AppLogger 由 @lark-apaas/nestjs-logger 的 LoggerModule（@Global）提供；
// 缺少该模块时 Nest 启动会直接抛 "Nest could not find AppLogger element"。
// 日志目录取 LOG_DIR，默认 "logs"（容器内即 /app/logs，需可写）。
import { LoggerModule } from '@lark-apaas/nestjs-logger';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { DatabaseModule } from './database/database.module';
import { ViewModule } from './modules/view/view.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { HealthModule } from './modules/health/health.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { ScreenStrategiesModule } from './modules/screen-strategies/screen-strategies.module';
import { AlertSettingsModule } from './modules/alert-settings/alert-settings.module';
import { ReportHistoryModule } from './modules/report-history/report-history.module';

@Module({
  imports: [
    // 日志模块（必须最先注册：configureApp 依赖它提供的 AppLogger）
    LoggerModule,
    // 独立部署数据库模块：提供 DRIZZLE_DATABASE 连接 + 自动建表
    DatabaseModule,
    // ====== @route-section: business-modules START ======
    // Place all business modules here.Do NOT add fallback modules here.
    MarketDataModule,
    HealthModule,
    WatchlistModule,
    ScreenStrategiesModule,
    AlertSettingsModule,
    ReportHistoryModule,
    // ====== @route-section: business-modules END ======

    // ⚠️ @route-order: last
    // ViewModule is the fallback route module, must be registered last.
    ViewModule,
  ],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
