import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  Req,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type {
  ReportHistory as ReportHistoryType,
  CreateReportHistoryDto,
  ListResponse,
} from '@shared/api.interface';
import { ReportHistoryService } from './report-history.service';

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

@Controller('api/report-history')
export class ReportHistoryController {
  private readonly logger = new Logger(ReportHistoryController.name);

  constructor(private readonly reportHistoryService: ReportHistoryService) {}

  @Get('/')
  async getReportList(
    @Req() req: AuthRequest,
    @Query('type') type?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ): Promise<ListResponse<ReportHistoryType>> {
    try {
      const userId = getUserId(req);
      const pageNum = page ? parseInt(page, 10) : 1;
      const pageSizeNum = pageSize ? parseInt(pageSize, 10) : 20;
      return this.reportHistoryService.getReportList(userId, type, pageNum, pageSizeNum);
    } catch (error) {
      this.logger.error('获取报告历史列表失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取报告历史列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('/:id')
  async getReportById(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<ReportHistoryType> {
    try {
      const userId = getUserId(req);
      return this.reportHistoryService.getReportById(userId, id);
    } catch (error) {
      this.logger.error(`获取报告详情失败: ${id}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取报告详情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/')
  async createReport(
    @Req() req: AuthRequest,
    @Body() body: CreateReportHistoryDto,
  ): Promise<ReportHistoryType> {
    try {
      const userId = getUserId(req);
      return this.reportHistoryService.createReport(userId, body);
    } catch (error) {
      this.logger.error('保存报告失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('保存报告失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('/:id')
  async deleteReport(
    @Req() req: AuthRequest,
    @Param('id') id: string,
  ): Promise<{ success: boolean }> {
    try {
      const userId = getUserId(req);
      await this.reportHistoryService.deleteReport(userId, id);
      return { success: true };
    } catch (error) {
      this.logger.error(`删除报告失败: ${id}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('删除报告失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
