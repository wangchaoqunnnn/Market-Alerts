#!/usr/bin/env node
// FULLSTACK_PRECOMMIT_V1
'use strict';

const { spawnSync } = require('node:child_process');

const SEP = '  ' + '─'.repeat(36);

function npmAvailable() {
  // Windows git 钩子环境的 PATH 常缺 nodejs 目录，npm 不可用时跳过 lint，避免阻塞提交
  const probe = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], {
    stdio: 'ignore',
  });
  return !probe.error && probe.status === 0;
}

function failAndExit(step, body) {
  process.stderr.write('\n✗ pre-commit failed: ' + step + '\n');
  process.stderr.write(SEP + '\n');
  if (body && body.length > 0) {
    process.stderr.write(body.replace(/\s+$/, '') + '\n');
  }
  process.stderr.write(SEP + '\n');
  process.stderr.write('  bypass: git commit --no-verify\n');
  process.exit(1);
}

function runLint() {
  const cwd = process.cwd();
  if (!npmAvailable()) {
    process.stderr.write('⚠ npm 不在 PATH 中，本次跳过 lint（可用 git commit --no-verify 强制跳过）\n');
    process.exit(0);
  }
  // lint 本质是 node ./scripts/lint.js，直接用当前 node 执行，绕开 npm 的 PATH 依赖
  const res = spawnSync(process.execPath, [require('node:path').join(cwd, 'scripts', 'lint.js')], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  if (res.error) {
    failAndExit('lint', String(res.error.message || res.error));
  }
  if (res.status !== 0) {
    const stdout = res.stdout ? res.stdout.toString() : '';
    const stderr = res.stderr ? res.stderr.toString() : '';
    failAndExit('lint', stdout + '\n' + stderr);
  }
}

runLint();
