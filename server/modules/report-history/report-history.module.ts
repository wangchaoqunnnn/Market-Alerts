import { Module } from '@nestjs/common';
import { ReportHistoryController } from './report-history.controller';
import { ReportHistoryService } from './report-history.service';

@Module({
  controllers: [ReportHistoryController],
  providers: [ReportHistoryService],
  exports: [ReportHistoryService],
})
export class ReportHistoryModule {}
