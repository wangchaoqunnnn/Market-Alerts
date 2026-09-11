import { Inject, Injectable, Logger, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { watchlistStocks } from '@server/database/schema';
import { eq, sql } from 'drizzle-orm';
import type { WatchlistStock } from '@shared/api.interface';

function extractPostgresErrorCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current && typeof current === 'object'; depth += 1) {
    const { code, cause } = current as { code?: unknown; cause?: unknown };
    if (typeof code === 'string') return code;
    current = cause;
  }
  return undefined;
}

interface CreateWatchlistDto {
  stockCode: string;
  stockName: string;
  notes?: string;
  tags?: string[];
}

interface UpdateWatchlistDto {
  notes?: string;
  tags?: string[];
}

interface BatchCreateDto {
  stocks: { stockCode: string; stockName: string }[];
}

@Injectable()
export class WatchlistService {
  private readonly logger = new Logger(WatchlistService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getWatchlist(userId: string): Promise<WatchlistStock[]> {
    const rows = await this.db
      .select({
        id: watchlistStocks.id,
        stockCode: watchlistStocks.stockCode,
        stockName: watchlistStocks.stockName,
        notes: watchlistStocks.notes,
        tags: watchlistStocks.tags,
        createdAt: watchlistStocks.createdAt,
      })
      .from(watchlistStocks)
      .where(sql`(${watchlistStocks.createdBy}).user_id = ${userId}`)
      .orderBy(watchlistStocks.createdAt);

    return rows.map((row) => ({
      id: row.id,
      stockCode: row.stockCode,
      stockName: row.stockName,
      notes: row.notes ?? '',
      tags: row.tags ?? [],
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async addStock(userId: string, dto: CreateWatchlistDto): Promise<WatchlistStock> {
    if (!dto.stockCode?.trim()) {
      throw new BadRequestException('股票代码不能为空');
    }
    if (!dto.stockName?.trim()) {
      throw new BadRequestException('股票名称不能为空');
    }

    try {
      const result = await this.db
        .insert(watchlistStocks)
        .values({
          stockCode: dto.stockCode.trim(),
          stockName: dto.stockName.trim(),
          notes: dto.notes?.trim() ?? '',
          tags: dto.tags ?? [],
          createdBy: userId,
        })
        .returning({
          id: watchlistStocks.id,
          stockCode: watchlistStocks.stockCode,
          stockName: watchlistStocks.stockName,
          notes: watchlistStocks.notes,
          tags: watchlistStocks.tags,
          createdAt: watchlistStocks.createdAt,
        });

      if (result.length === 0) {
        throw new BadRequestException('添加自选股失败');
      }

      const row = result[0];
      return {
        id: row.id,
        stockCode: row.stockCode,
        stockName: row.stockName,
        notes: row.notes ?? '',
        tags: row.tags ?? [],
        createdAt: row.createdAt.toISOString(),
      };
    } catch (error: unknown) {
      const code = extractPostgresErrorCode(error);
      if (code === '23505') {
        throw new ConflictException('该股票已在自选股列表中');
      }
      this.logger.error('添加自选股失败', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }

  async removeStock(userId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(watchlistStocks)
      .where(
        sql`${watchlistStocks.id} = ${id}::uuid AND (${watchlistStocks.createdBy}).user_id = ${userId}`,
      )
      .returning({ id: watchlistStocks.id });

    if (result.length === 0) {
      throw new NotFoundException('自选股记录不存在');
    }
  }

  async updateStock(userId: string, id: string, dto: UpdateWatchlistDto): Promise<WatchlistStock> {
    const patch: Partial<typeof watchlistStocks.$inferInsert> = {};
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (dto.tags !== undefined) patch.tags = dto.tags;

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();
    patch.updatedBy = userId;

    const result = await this.db
      .update(watchlistStocks)
      .set(patch)
      .where(
        sql`${watchlistStocks.id} = ${id}::uuid AND (${watchlistStocks.createdBy}).user_id = ${userId}`,
      )
      .returning({
        id: watchlistStocks.id,
        stockCode: watchlistStocks.stockCode,
        stockName: watchlistStocks.stockName,
        notes: watchlistStocks.notes,
        tags: watchlistStocks.tags,
        createdAt: watchlistStocks.createdAt,
      });

    if (result.length === 0) {
      throw new NotFoundException('自选股记录不存在');
    }

    const row = result[0];
    return {
      id: row.id,
      stockCode: row.stockCode,
      stockName: row.stockName,
      notes: row.notes ?? '',
      tags: row.tags ?? [],
      createdAt: row.createdAt.toISOString(),
    };
  }

  async batchAdd(userId: string, dto: BatchCreateDto): Promise<WatchlistStock[]> {
    if (!dto.stocks || dto.stocks.length === 0) {
      throw new BadRequestException('股票列表不能为空');
    }

    const values = dto.stocks
      .filter((s) => s.stockCode?.trim() && s.stockName?.trim())
      .map((s) => ({
        stockCode: s.stockCode.trim(),
        stockName: s.stockName.trim(),
        notes: '',
        tags: [] as string[],
        createdBy: userId,
      }));

    if (values.length === 0) {
      throw new BadRequestException('有效的股票数据为空');
    }

    try {
      const result = await this.db
        .insert(watchlistStocks)
        .values(values)
        .onConflictDoNothing()
        .returning({
          id: watchlistStocks.id,
          stockCode: watchlistStocks.stockCode,
          stockName: watchlistStocks.stockName,
          notes: watchlistStocks.notes,
          tags: watchlistStocks.tags,
          createdAt: watchlistStocks.createdAt,
        });

      return result.map((row) => ({
        id: row.id,
        stockCode: row.stockCode,
        stockName: row.stockName,
        notes: row.notes ?? '',
        tags: row.tags ?? [],
        createdAt: row.createdAt.toISOString(),
      }));
    } catch (error: unknown) {
      this.logger.error('批量添加自选股失败', error instanceof Error ? error.stack : String(error));
      throw error;
    }
  }
}
