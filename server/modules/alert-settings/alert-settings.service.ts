import {
  Inject,
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { alertSettings } from '@server/database/schema';
import { eq, sql } from 'drizzle-orm';
import type {
  AlertSetting,
  AlertType,
  AlertConfig,
  SurgeAlertConfig,
  LimitUpBrokenAlertConfig,
  PriceAlertConfig,
  UpdateAlertSettingDto,
} from '@shared/api.interface';

const DEFAULT_CONFIGS: Record<AlertType, AlertConfig> = {
  surge: {
    soundEnabled: true,
    popupEnabled: true,
    surgeThreshold: 1,
  } as SurgeAlertConfig,
  limit_up_broken: {
    soundEnabled: true,
    popupEnabled: true,
    watchlistOnly: false,
  } as LimitUpBrokenAlertConfig,
  price: {
    soundEnabled: true,
    popupEnabled: true,
    alerts: [],
  } as PriceAlertConfig,
};

const VALID_TYPES: AlertType[] = ['surge', 'limit_up_broken', 'price'];

@Injectable()
export class AlertSettingsService {
  private readonly logger = new Logger(AlertSettingsService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  private isValidAlertType(type: string): type is AlertType {
    return VALID_TYPES.includes(type as AlertType);
  }

  async getAllSettings(userId: string): Promise<AlertSetting[]> {
    const rows = await this.db
      .select({
        id: alertSettings.id,
        alertType: alertSettings.alertType,
        enabled: alertSettings.enabled,
        config: alertSettings.config,
        createdAt: alertSettings.createdAt,
      })
      .from(alertSettings)
      .where(sql`${alertSettings.createdBy} = ${userId}`);

    const existingMap = new Map<string, typeof rows[0]>();
    for (const row of rows) {
      existingMap.set(row.alertType, row);
    }

    const result: AlertSetting[] = [];
    for (const type of VALID_TYPES) {
      const row = existingMap.get(type);
      if (row) {
        result.push({
          id: row.id,
          alertType: row.alertType as AlertType,
          enabled: row.enabled ?? true,
          config: (row.config as AlertConfig) ?? DEFAULT_CONFIGS[type],
          createdAt: row.createdAt.toISOString(),
        });
      } else {
        result.push({
          alertType: type,
          enabled: true,
          config: DEFAULT_CONFIGS[type],
        });
      }
    }

    return result;
  }

  async getSettingByType(userId: string, type: string): Promise<AlertSetting> {
    if (!this.isValidAlertType(type)) {
      throw new BadRequestException(`无效的预警类型: ${type}`);
    }

    const rows = await this.db
      .select({
        id: alertSettings.id,
        alertType: alertSettings.alertType,
        enabled: alertSettings.enabled,
        config: alertSettings.config,
        createdAt: alertSettings.createdAt,
      })
      .from(alertSettings)
      .where(
        sql`${alertSettings.createdBy} = ${userId} AND ${alertSettings.alertType} = ${type}`,
      );

    if (rows.length === 0) {
      return {
        alertType: type,
        enabled: true,
        config: DEFAULT_CONFIGS[type],
      };
    }

    const row = rows[0];
    return {
      id: row.id,
      alertType: row.alertType as AlertType,
      enabled: row.enabled ?? true,
      config: (row.config as AlertConfig) ?? DEFAULT_CONFIGS[type],
      createdAt: row.createdAt.toISOString(),
    };
  }

  async upsertSetting(
    userId: string,
    type: string,
    dto: UpdateAlertSettingDto,
  ): Promise<AlertSetting> {
    if (!this.isValidAlertType(type)) {
      throw new BadRequestException(`无效的预警类型: ${type}`);
    }

    if (!dto.config) {
      throw new BadRequestException('配置不能为空');
    }

    const existingRows = await this.db
      .select({ id: alertSettings.id })
      .from(alertSettings)
      .where(
        sql`${alertSettings.createdBy} = ${userId} AND ${alertSettings.alertType} = ${type}`,
      );

    let resultRow: {
      id: string;
      alertType: string;
      enabled: boolean | null;
      config: unknown;
      createdAt: Date;
    } | null = null;

    if (existingRows.length > 0) {
      const existingId = existingRows[0].id;
      const patch: Partial<typeof alertSettings.$inferInsert> = {
        config: dto.config as unknown as Record<string, unknown>,
        updatedAt: new Date(),
        updatedBy: userId,
      };
      if (dto.enabled !== undefined) {
        patch.enabled = dto.enabled;
      }

      const result = await this.db
        .update(alertSettings)
        .set(patch)
        .where(eq(alertSettings.id, existingId))
        .returning({
          id: alertSettings.id,
          alertType: alertSettings.alertType,
          enabled: alertSettings.enabled,
          config: alertSettings.config,
          createdAt: alertSettings.createdAt,
        });

      resultRow = result[0] ?? null;
    } else {
      const result = await this.db
        .insert(alertSettings)
        .values({
          alertType: type,
          enabled: dto.enabled ?? true,
          config: dto.config as unknown as Record<string, unknown>,
          createdBy: userId,
        })
        .returning({
          id: alertSettings.id,
          alertType: alertSettings.alertType,
          enabled: alertSettings.enabled,
          config: alertSettings.config,
          createdAt: alertSettings.createdAt,
        });

      resultRow = result[0] ?? null;
    }

    if (!resultRow) {
      throw new BadRequestException('保存预警设置失败');
    }

    return {
      id: resultRow.id,
      alertType: resultRow.alertType as AlertType,
      enabled: resultRow.enabled ?? true,
      config: (resultRow.config as AlertConfig) ?? DEFAULT_CONFIGS[type],
      createdAt: resultRow.createdAt.toISOString(),
    };
  }

  async toggleSetting(userId: string, type: string): Promise<AlertSetting> {
    if (!this.isValidAlertType(type)) {
      throw new BadRequestException(`无效的预警类型: ${type}`);
    }

    const rows = await this.db
      .select({
        id: alertSettings.id,
        alertType: alertSettings.alertType,
        enabled: alertSettings.enabled,
        config: alertSettings.config,
        createdAt: alertSettings.createdAt,
      })
      .from(alertSettings)
      .where(
        sql`${alertSettings.createdBy} = ${userId} AND ${alertSettings.alertType} = ${type}`,
      );

    if (rows.length === 0) {
      throw new NotFoundException('预警设置不存在');
    }

    const current = rows[0];
    const newEnabled = !(current.enabled ?? true);

    const result = await this.db
      .update(alertSettings)
      .set({
        enabled: newEnabled,
        updatedAt: new Date(),
        updatedBy: userId,
      })
      .where(eq(alertSettings.id, current.id))
      .returning({
        id: alertSettings.id,
        alertType: alertSettings.alertType,
        enabled: alertSettings.enabled,
        config: alertSettings.config,
        createdAt: alertSettings.createdAt,
      });

    if (result.length === 0) {
      throw new BadRequestException('切换预警状态失败');
    }

    const row = result[0];
    return {
      id: row.id,
      alertType: row.alertType as AlertType,
      enabled: row.enabled ?? true,
      config: (row.config as AlertConfig) ?? DEFAULT_CONFIGS[type],
      createdAt: row.createdAt.toISOString(),
    };
  }
}
