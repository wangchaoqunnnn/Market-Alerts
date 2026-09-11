import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { configureApp } from '@lark-apaas/fullstack-nestjs-core';
import { join } from 'path';
import { __express as hbsExpressEngine } from 'hbs';

import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: process.env.NODE_ENV !== 'development',
  });
  await configureApp(app, { 
    disableSwagger: true,
  });
  const logger = new Logger('Bootstrap');
  const host = process.env.SERVER_HOST || 'localhost';
  const port = Number(process.env.SERVER_PORT || '3000');

  // 注册视图引擎, 渲染 client 目录下的 html 文件
  app.setBaseViewsDir(join(process.cwd(), 'dist/client'));
  app.setViewEngine('html');
  app.engine('html', hbsExpressEngine);

  // 同源直出前端构建产物（/assets/*.js、/*.css、routes.json 等）。
  // 说明：核心包 configureApp() 的 publicAssetsMiddleware 有意跳过 assets/ 前缀
  // （平台部署时 hashed 产物由 CDN 提供）；自建部署没有 CDN，若不在此补一层静态服务，
  // 浏览器请求 /assets/xxx.js 会落到 ViewController 拿到 HTML，导致页面白屏。
  // 必须放在 configureApp() 之后：先由核心中间件处理 api/static 等前缀，再回落到静态文件。
  // index: false 保证 GET / 仍然走 ViewController 的 HBS 渲染（需要注入 __platform__）。
  app.useStaticAssets(join(process.cwd(), 'dist/client'), { index: false });

  await app.listen(port, host);
  logger.log(`Server running on ${host}:${port}`);
  logger.log(`API endpoints ready at http://${host}:${port}/api`);
}

bootstrap();
