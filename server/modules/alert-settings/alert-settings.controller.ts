import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Req,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type {
  AlertSetting,
  UpdateAlertSettingDto,
} from '@shared/api.interface';
import { AlertSettingsService } from './alert-settings.service';

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

@Controller('api/alert-settings')
export class AlertSettingsController {
  private readonly logger = new Logger(AlertSettingsController.name);

  constructor(private readonly alertSettingsService: AlertSettingsService) {}

  @Get('/')
  async getAllSettings(@Req() req: AuthRequest): Promise<AlertSetting[]> {
    try {
      const userId = getUserId(req);
      return this.alertSettingsService.getAllSettings(userId);
    } catch (error) {
      this.logger.error('获取预警设置列表失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取预警设置列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/:type')
  async getSettingByType(
    @Req() req: AuthRequest,
    @Param('type') type: string,
  ): Promise<AlertSetting> {
    try {
      const userId = getUserId(req);
      return this.alertSettingsService.getSettingByType(userId, type);
    } catch (error) {
      this.logger.error(`获取预警设置失败: ${type}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取预警设置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Put('/:type')
  async upsertSetting(
    @Req() req: AuthRequest,
    @Param('type') type: string,
    @Body() body: UpdateAlertSettingDto,
  ): Promise<AlertSetting> {
    try {
      const userId = getUserId(req);
      return this.alertSettingsService.upsertSetting(userId, type, body);
    } catch (error) {
      this.logger.error(`更新预警设置失败: ${type}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('更新预警设置失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/:type/toggle')
  async toggleSetting(
    @Req() req: AuthRequest,
    @Param('type') type: string,
  ): Promise<AlertSetting> {
    try {
      const userId = getUserId(req);
      return this.alertSettingsService.toggleSetting(userId, type);
    } catch (error) {
      this.logger.error(`切换预警状态失败: ${type}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('切换预警状态失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
