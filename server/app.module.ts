import { APP_FILTER } from '@nestjs/core';
import { Module } from '@nestjs/common';
import { PlatformModule } from '@lark-apaas/fullstack-nestjs-core';

import { GlobalExceptionFilter } from './common/filters/exception.filter';
import { ViewModule } from './modules/view/view.module';
import { MarketDataModule } from './modules/market-data/market-data.module';
import { HealthModule } from './modules/health/health.module';
import { WatchlistModule } from './modules/watchlist/watchlist.module';
import { ScreenStrategiesModule } from './modules/screen-strategies/screen-strategies.module';
import { AlertSettingsModule } from './modules/alert-settings/alert-settings.module';
import { ReportHistoryModule } from './modules/report-history/report-history.module';

@Module({
  imports: [
    // 平台 Module，提供平台能力
    PlatformModule.forRoot(),
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
