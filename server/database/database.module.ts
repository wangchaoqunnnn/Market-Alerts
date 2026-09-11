import { Global, Inject, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { DRIZZLE_DATABASE, type PostgresJsDatabase } from '@lark-apaas/fullstack-nestjs-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import * as schema from './schema';

/**
 * 独立部署数据库模块
 *
 * 模板原使用平台 DataPaas（SUDA_DATABASE_URL + user_profile 复合类型），
 * 独立部署时改为直连自带 PostgreSQL：标准类型建表 + postgres-js 驱动。
 * 业务代码仅注入 DRIZZLE_DATABASE，无需感知连接细节。
 */

/** 建表 SQL（标准 PostgreSQL 类型，启动时自动执行，幂等） */
const CREATE_TABLE_SQL: string[] = [
  `CREATE TABLE IF NOT EXISTS watchlist_stocks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    stock_code varchar(20) NOT NULL,
    stock_name varchar(100) NOT NULL,
    notes text,
    tags varchar(255)[] DEFAULT '{}',
    _created_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _created_by text,
    _updated_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _updated_by text
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_watchlist_stocks_user_code
    ON watchlist_stocks (_created_by, stock_code);`,
  `CREATE TABLE IF NOT EXISTS alert_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type varchar(50) NOT NULL,
    enabled boolean DEFAULT true,
    config jsonb NOT NULL DEFAULT '{}',
    _created_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _created_by text,
    _updated_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _updated_by text
  );`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_settings_user_type
    ON alert_settings (_created_by, alert_type);`,
  `CREATE TABLE IF NOT EXISTS report_history (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    report_type varchar(50) NOT NULL,
    title varchar(255) NOT NULL,
    stock_codes varchar(50)[] DEFAULT '{}',
    content jsonb NOT NULL DEFAULT '{}',
    _created_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _created_by text,
    _updated_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _updated_by text
  );`,
  `CREATE TABLE IF NOT EXISTS screen_strategies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(100) NOT NULL,
    description text,
    conditions jsonb NOT NULL DEFAULT '{}',
    is_public boolean DEFAULT false,
    _created_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _created_by text,
    _updated_at timestamptz(3) DEFAULT CURRENT_TIMESTAMP,
    _updated_by text
  );`,
];

@Global()
@Module({
  providers: [
    {
      provide: DRIZZLE_DATABASE,
      useFactory: () => {
        const connectionString = process.env.DATABASE_URL;
        if (!connectionString) {
          throw new Error('缺少 DATABASE_URL 环境变量（PostgreSQL 连接串），请检查 .env 配置');
        }
        const client = postgres(connectionString, { max: 10 });
        return drizzle(client, { schema });
      },
    },
  ],
  exports: [DRIZZLE_DATABASE],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: PostgresJsDatabase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    for (const stmt of CREATE_TABLE_SQL) {
      await this.db.execute(sql.raw(stmt));
    }
    this.logger.log('数据库表结构初始化完成（watchlist/alert_settings/report_history/screen_strategies）');
  }
}
