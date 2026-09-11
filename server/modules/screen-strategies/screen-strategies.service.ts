import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { screenStrategies } from '@server/database/schema';
import { eq, desc, sql } from 'drizzle-orm';
import type {
  ScreenStrategy,
  ScreenConditions,
  CreateScreenStrategyDto,
  UpdateScreenStrategyDto,
} from '@shared/api.interface';

@Injectable()
export class ScreenStrategiesService {
  private readonly logger = new Logger(ScreenStrategiesService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async getStrategies(userId: string): Promise<ScreenStrategy[]> {
    const rows = await this.db
      .select({
        id: screenStrategies.id,
        name: screenStrategies.name,
        description: screenStrategies.description,
        conditions: screenStrategies.conditions,
        isPublic: screenStrategies.isPublic,
        createdAt: screenStrategies.createdAt,
      })
      .from(screenStrategies)
      .where(sql`${screenStrategies.createdBy} = ${userId}`)
      .orderBy(desc(screenStrategies.createdAt));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      conditions: (row.conditions as ScreenConditions) ?? {},
      isPublic: row.isPublic ?? false,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async createStrategy(
    userId: string,
    dto: CreateScreenStrategyDto,
  ): Promise<ScreenStrategy> {
    if (!dto.name?.trim()) {
      throw new BadRequestException('策略名称不能为空');
    }

    const result = await this.db
      .insert(screenStrategies)
      .values({
        name: dto.name.trim(),
        description: dto.description?.trim() ?? '',
        conditions: dto.conditions as Record<string, unknown>,
        isPublic: dto.isPublic ?? false,
        createdBy: userId,
      })
      .returning({
        id: screenStrategies.id,
        name: screenStrategies.name,
        description: screenStrategies.description,
        conditions: screenStrategies.conditions,
        isPublic: screenStrategies.isPublic,
        createdAt: screenStrategies.createdAt,
      });

    if (result.length === 0) {
      throw new BadRequestException('创建策略失败');
    }

    const row = result[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      conditions: (row.conditions as ScreenConditions) ?? {},
      isPublic: row.isPublic ?? false,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async updateStrategy(
    userId: string,
    id: string,
    dto: UpdateScreenStrategyDto,
  ): Promise<ScreenStrategy> {
    const patch: Partial<typeof screenStrategies.$inferInsert> = {};
    if (dto.name !== undefined) {
      if (!dto.name.trim()) {
        throw new BadRequestException('策略名称不能为空');
      }
      patch.name = dto.name.trim();
    }
    if (dto.description !== undefined) {
      patch.description = dto.description.trim();
    }
    if (dto.conditions !== undefined) {
      patch.conditions = dto.conditions as Record<string, unknown>;
    }
    if (dto.isPublic !== undefined) {
      patch.isPublic = dto.isPublic;
    }

    if (Object.keys(patch).length === 0) {
      throw new BadRequestException('未提供可更新字段');
    }

    patch.updatedAt = new Date();
    patch.updatedBy = userId;

    const result = await this.db
      .update(screenStrategies)
      .set(patch)
      .where(
        sql`${screenStrategies.id} = ${id}::uuid AND ${screenStrategies.createdBy} = ${userId}`,
      )
      .returning({
        id: screenStrategies.id,
        name: screenStrategies.name,
        description: screenStrategies.description,
        conditions: screenStrategies.conditions,
        isPublic: screenStrategies.isPublic,
        createdAt: screenStrategies.createdAt,
      });

    if (result.length === 0) {
      throw new NotFoundException('策略不存在');
    }

    const row = result[0];
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? '',
      conditions: (row.conditions as ScreenConditions) ?? {},
      isPublic: row.isPublic ?? false,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteStrategy(userId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(screenStrategies)
      .where(
        sql`${screenStrategies.id} = ${id}::uuid AND ${screenStrategies.createdBy} = ${userId}`,
      )
      .returning({ id: screenStrategies.id });

    if (result.length === 0) {
      throw new NotFoundException('策略不存在');
    }
  }
}
