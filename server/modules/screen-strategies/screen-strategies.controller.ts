import {
  Controller,
  Get,
  Post,
  Delete,
  Patch,
  Param,
  Body,
  Req,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type {
  ScreenStrategy,
  CreateScreenStrategyDto,
  UpdateScreenStrategyDto,
} from '@shared/api.interface';
import { ScreenStrategiesService } from './screen-strategies.service';

const DEMO_USER_ID = 'demo_user_001';

function getUserId(req: AuthRequest): string {
  return req.userContext?.userId || DEMO_USER_ID;
}

interface UserContext {
  userId: string;
}

interface AuthRequest {
  userContext: UserContext;
}

@Controller('api/screen-strategies')
export class ScreenStrategiesController {
  private readonly logger = new Logger(ScreenStrategiesController.name);

  constructor(private readonly screenStrategiesService: ScreenStrategiesService) {}

  @Get('/')
  async getStrategies(@Req() req: AuthRequest): Promise<ScreenStrategy[]> {
    try {
      const userId = getUserId(req);
      return this.screenStrategiesService.getStrategies(userId);
    } catch (error) {
      this.logger.error('获取策略列表失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取策略列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/')
  async createStrategy(
    @Req() req: AuthRequest,
    @Body() body: CreateScreenStrategyDto,
  ): Promise<ScreenStrategy> {
    try {
      const userId = getUserId(req);
      return this.screenStrategiesService.createStrategy(userId, body);
    } catch (error) {
      this.logger.error('创建策略失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('创建策略失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch('/:id')
  async updateStrategy(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateScreenStrategyDto,
  ): Promise<ScreenStrategy> {
    try {
      const userId = getUserId(req);
      return this.screenStrategiesService.updateStrategy(userId, id, body);
    } catch (error) {
      this.logger.error(`更新策略失败: ${id}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('更新策略失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('/:id')
  async deleteStrategy(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    try {
      const userId = getUserId(req);
      await this.screenStrategiesService.deleteStrategy(userId, id);
      return { success: true };
    } catch (error) {
      this.logger.error(`删除策略失败: ${id}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('删除策略失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
