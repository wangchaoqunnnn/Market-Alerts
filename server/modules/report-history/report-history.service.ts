import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { reportHistory } from '@server/database/schema';
import { eq, desc, sql, count } from 'drizzle-orm';
import type {
  ReportHistory as ReportHistoryType,
  ReportType,
  ReportContent,
  CreateReportHistoryDto,
  ListResponse,
} from '@shared/api.interface';

@Injectable()
export class ReportHistoryService {
  private readonly logger = new Logger(ReportHistoryService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private isValidReportType(type: string): type is ReportType {
    return type === 'research' || type === 'compare';
  }

  async getReportList(
    userId: string,
    type?: string,
    page = 1,
    pageSize = 20,
  ): Promise<ListResponse<ReportHistoryType>> {
    const pageNum = Math.max(1, page);
    const pageSizeNum = Math.min(Math.max(1, pageSize), 100);
    const offset = (pageNum - 1) * pageSizeNum;

    const whereCondition = sql`(${reportHistory.createdBy}).user_id = ${userId}`;
    const typeCondition = type && this.isValidReportType(type)
      ? sql` AND ${reportHistory.reportType} = ${type}`
      : sql``;
    const fullWhere = sql`${whereCondition}${typeCondition}`;

    const [countResult, rows] = await Promise.all([
      this.db
        .select({ count: count() })
        .from(reportHistory)
        .where(fullWhere),
      this.db
        .select({
          id: reportHistory.id,
          reportType: reportHistory.reportType,
          title: reportHistory.title,
          stockCodes: reportHistory.stockCodes,
          content: reportHistory.content,
          createdAt: reportHistory.createdAt,
        })
        .from(reportHistory)
        .where(fullWhere)
        .orderBy(desc(reportHistory.createdAt))
        .limit(pageSizeNum)
        .offset(offset),
    ]);

    const total = Number(countResult[0]?.count ?? 0);

    return {
      items: rows.map((row) => ({
        id: row.id,
        reportType: row.reportType as ReportType,
        title: row.title,
        stockCodes: row.stockCodes ?? [],
        content: (row.content as ReportContent) ?? {},
        createdAt: row.createdAt.toISOString(),
      })),
      total,
      page: pageNum,
      pageSize: pageSizeNum,
    };
  }

  async getReportById(userId: string, id: string): Promise<ReportHistoryType> {
    const rows = await this.db
      .select({
        id: reportHistory.id,
        reportType: reportHistory.reportType,
        title: reportHistory.title,
        stockCodes: reportHistory.stockCodes,
        content: reportHistory.content,
        createdAt: reportHistory.createdAt,
      })
      .from(reportHistory)
      .where(
        sql`${reportHistory.id} = ${id}::uuid AND (${reportHistory.createdBy}).user_id = ${userId}`,
      );

    if (rows.length === 0) {
      throw new NotFoundException('报告不存在');
    }

    const row = rows[0];
    return {
      id: row.id,
      reportType: row.reportType as ReportType,
      title: row.title,
      stockCodes: row.stockCodes ?? [],
      content: (row.content as ReportContent) ?? {},
      createdAt: row.createdAt.toISOString(),
    };
  }

  async createReport(
    userId: string,
    dto: CreateReportHistoryDto,
  ): Promise<ReportHistoryType> {
    if (!dto.title?.trim()) {
      throw new BadRequestException('报告标题不能为空');
    }
    if (!dto.reportType || !this.isValidReportType(dto.reportType)) {
      throw new BadRequestException('报告类型无效');
    }
    if (!dto.content) {
      throw new BadRequestException('报告内容不能为空');
    }

    const result = await this.db
      .insert(reportHistory)
      .values({
        reportType: dto.reportType,
        title: dto.title.trim(),
        stockCodes: dto.stockCodes ?? [],
        content: dto.content as unknown as Record<string, unknown>,
        createdBy: userId,
      })
      .returning({
        id: reportHistory.id,
        reportType: reportHistory.reportType,
        title: reportHistory.title,
        stockCodes: reportHistory.stockCodes,
        content: reportHistory.content,
        createdAt: reportHistory.createdAt,
      });

    if (result.length === 0) {
      throw new BadRequestException('保存报告失败');
    }

    const row = result[0];
    return {
      id: row.id,
      reportType: row.reportType as ReportType,
      title: row.title,
      stockCodes: row.stockCodes ?? [],
      content: (row.content as ReportContent) ?? {},
      createdAt: row.createdAt.toISOString(),
    };
  }

  async deleteReport(userId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(reportHistory)
      .where(
        sql`${reportHistory.id} = ${id}::uuid AND (${reportHistory.createdBy}).user_id = ${userId}`,
      )
      .returning({ id: reportHistory.id });

    if (result.length === 0) {
      throw new NotFoundException('报告不存在');
    }
  }
}
