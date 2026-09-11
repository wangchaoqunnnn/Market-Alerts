import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type {
  StockQuote,
  SurgeItem,
  LimitUpStock,
  LimitBrokenStock,
  MarketSentiment,
  SectorInfo,
  StockResearch,
  StockCompare,
  ListResponse,
  ScreenResult,
  ScreenConditions,
  LimitUpGroupsResponse,
  LimitBrokenSectorStat,
  MarketStatus,
  MarketCoverage,
} from '@shared/api.interface.ts';
import { MarketDataService } from './market-data.service';

@Controller('api/market-data')
export class MarketDataController {
  private readonly logger = new Logger(MarketDataController.name);

  constructor(private readonly marketDataService: MarketDataService) {}

  @Get('quote/:code')
  async getQuote(@Param('code') code: string): Promise<StockQuote> {
    try {
      return await this.marketDataService.getQuote(code);
    } catch (error) {
      this.logger.error(`获取行情失败: ${code}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取行情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('quotes/batch')
  async getBatchQuotes(@Query('codes') codes?: string): Promise<StockQuote[]> {
    try {
      const codeList: string[] = codes ? codes.split(',').filter(Boolean) : [];
      return await this.marketDataService.getBatchQuotes(codeList);
    } catch (error) {
      this.logger.error('批量获取行情失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('批量获取行情失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('surge-board')
  getSurgeBoard(
    @Query('windowMinutes') windowMinutes?: string,
    @Query('threshold') threshold?: string,
    @Query('sector') sector?: string,
    @Query('excludeST') excludeST?: string,
    @Query('limit') limit?: string,
  ): SurgeItem[] {
    try {
      const wm: number = windowMinutes ? parseInt(windowMinutes, 10) : 5;
      const th: number = threshold ? parseFloat(threshold) : 0.5;
      const exST: boolean = excludeST !== 'false';
      const lm: number = limit ? parseInt(limit, 10) : 50;
      return this.marketDataService.getSurgeBoard(wm, th, sector, exST, lm);
    } catch (error) {
      this.logger.error('获取涨速榜失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取涨速榜失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('limit-up/groups')
  getLimitUpGroups(): LimitUpGroupsResponse {
    try {
      const stocks: LimitUpStock[] = this.marketDataService.getLimitUpStocks();
      return {
        normalStocks: stocks.filter((s: LimitUpStock): boolean => !s.isST),
        stStocks: stocks.filter((s: LimitUpStock): boolean => s.isST),
        noLimitStocks: [],
      };
    } catch (error) {
      this.logger.error('获取涨停分组失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取涨停分组失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('limit-up')
  getLimitUp(): LimitUpStock[] {
    try {
      return this.marketDataService.getLimitUpStocks();
    } catch (error) {
      this.logger.error('获取涨停股失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取涨停股失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('limit-broken/sector-stats')
  getLimitBrokenSectorStats(): LimitBrokenSectorStat[] {
    try {
      return this.marketDataService.getLimitBrokenSectorStats();
    } catch (error) {
      this.logger.error('获取炸板板块统计失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取炸板板块统计失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('limit-broken')
  getLimitBroken(): LimitBrokenStock[] {
    try {
      return this.marketDataService.getLimitBrokenStocks();
    } catch (error) {
      this.logger.error('获取炸板股失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取炸板股失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sentiment')
  getSentiment(): MarketSentiment {
    try {
      return this.marketDataService.getMarketSentiment();
    } catch (error) {
      this.logger.error('获取情绪指标失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取情绪指标失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('sectors')
  getSectors(): SectorInfo[] {
    try {
      return this.marketDataService.getSectors();
    } catch (error) {
      this.logger.error('获取板块列表失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取板块列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('research/:code')
  async getResearch(@Param('code') code: string): Promise<StockResearch> {
    try {
      return await this.marketDataService.getResearch(code);
    } catch (error) {
      this.logger.error(`获取个股研究失败: ${code}`, error instanceof Error ? error.stack : String(error));
      if (error instanceof HttpException) throw error;
      throw new HttpException('获取个股研究失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('compare')
  async getCompare(@Body() body: { codes: string[] }): Promise<StockCompare> {
    try {
      const codes: string[] = body?.codes ?? [];
      return await this.marketDataService.getCompare(codes);
    } catch (error) {
      this.logger.error('多股对比失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('多股对比失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('screen')
  screen(@Body() conditions: ScreenConditions): ListResponse<ScreenResult> {
    try {
      return this.marketDataService.screen(conditions ?? {});
    } catch (error) {
      this.logger.error('选股失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('选股失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('stocks/search')
  async searchStocks(@Query('keyword') keyword?: string): Promise<StockQuote[]> {
    try {
      return await this.marketDataService.searchStocks(keyword ?? '');
    } catch (error) {
      this.logger.error('搜索股票失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('搜索股票失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('market-status')
  getMarketStatus(): MarketStatus {
    try {
      return this.marketDataService.getMarketStatus();
    } catch (error) {
      this.logger.error('获取行情状态失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取行情状态失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Get('industries')
  getIndustries(): string[] {
    try {
      return this.marketDataService.getIndustries();
    } catch (error) {
      this.logger.error('获取行业列表失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取行业列表失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * 监控覆盖度：查看沪市主板/深市主板/创业板/科创板/北交所各板块股票数量，
   * 用于确认「所有交易所的股票都已纳入监控」。
   */
  @Get('market-coverage')
  getMarketCoverage(): MarketCoverage {
    try {
      return this.marketDataService.getMarketCoverage();
    } catch (error) {
      this.logger.error('获取监控覆盖度失败', error instanceof Error ? error.stack : String(error));
      throw new HttpException('获取监控覆盖度失败', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
