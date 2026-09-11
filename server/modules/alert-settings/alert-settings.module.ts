import { Module } from '@nestjs/common';
import { AlertSettingsController } from './alert-settings.controller';
import { AlertSettingsService } from './alert-settings.service';

@Module({
  controllers: [AlertSettingsController],
  providers: [AlertSettingsService],
  exports: [AlertSettingsService],
})
export class AlertSettingsModule {}
