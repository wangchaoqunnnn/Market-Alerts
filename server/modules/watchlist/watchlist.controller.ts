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
import type { WatchlistStock } from '@shared/api.interface';
import { WatchlistService } from './watchlist.service';

const DEMO_USER_ID = 'demo_user_001';

function getUserId(req: AuthRequest): string {
  return req.userContext?.userId || DEMO_USER_ID;
}

interface CreateWatchlistBody {
  stockCode: string;
  stockName: string;
  notes?: string;
  tags?: string[];
}

interface UpdateWatchlistBody {
  notes?: string;
  tags?: string[];
}

interface BatchAddBody {
  stocks: { stockCode: string; stockName: string }[];
}

interface UserContext {
  userId: string;
}

interface AuthRequest {
  userContext: UserContext;
}

@Controller('api/watchlist')
export class WatchlistController {
  private readonly logger = new Logger(WatchlistController.name);

  constructor(private readonly watchlistService: WatchlistService) {}

  @Get('/')
  async getWatchlist(@Req() req: AuthRequest): Promise<WatchlistStock[]> {
    try {
      const userId = getUserId(req);
      return this.watchlistService.getWatchlist(userId);
    } catch (error) {
      this.logger.error('获取自选股列表失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取自选股列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/')
  async addStock(
    @Req() req: AuthRequest,
    @Body() body: CreateWatchlistBody,
  ): Promise<WatchlistStock> {
    try {
      const userId = getUserId(req);
      return this.watchlistService.addStock(userId, body);
    } catch (error) {
      this.logger.error('添加自选股失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('添加自选股失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Delete('/:id')
  async removeStock(@Req() req: AuthRequest, @Param('id') id: string): Promise<{ success: boolean }> {
    try {
      const userId = getUserId(req);
      await this.watchlistService.removeStock(userId, id);
      return { success: true };
    } catch (error) {
      this.logger.error(`删除自选股失败: ${id}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('删除自选股失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Patch('/:id')
  async updateStock(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: UpdateWatchlistBody,
  ): Promise<WatchlistStock> {
    try {
      const userId = getUserId(req);
      return this.watchlistService.updateStock(userId, id, body);
    } catch (error) {
      this.logger.error(`更新自选股失败: ${id}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('更新自选股失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('/batch')
  async batchAdd(
    @Req() req: AuthRequest,
    @Body() body: BatchAddBody,
  ): Promise<WatchlistStock[]> {
    try {
      const userId = getUserId(req);
      return this.watchlistService.batchAdd(userId, body);
    } catch (error) {
      this.logger.error('批量添加自选股失败', error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('批量添加自选股失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
