import { Module } from '@nestjs/common';
import { ScreenStrategiesController } from './screen-strategies.controller';
import { ScreenStrategiesService } from './screen-strategies.service';

@Module({
  controllers: [ScreenStrategiesController],
  providers: [ScreenStrategiesService],
  exports: [ScreenStrategiesService],
})
export class ScreenStrategiesModule {}
