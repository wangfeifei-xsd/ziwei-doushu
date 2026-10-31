import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';

nextEnv.loadEnvConfig(fileURLToPath(new URL('../', import.meta.url)));

try {
  const jar = readFileSync(new URL('../apps/web/vendor/h2/h2-2.5.252.jar', import.meta.url));
  const digest = createHash('sha256').update(jar).digest('hex');
  if (digest !== '90b11dc413da82070ef15fc943282c1408e6ffd34fa68998335fea8603b5ff20') {
    throw new Error('随项目提供的 H2 驱动校验失败，请重新获取 vendor/h2/h2-2.5.252.jar。');
  }
  const result = spawnSync(process.env.JAVA_BIN || 'java', ['--list-modules'], { encoding: 'utf8', timeout: 10_000 });
  const version = result.stdout?.match(/^java\.base@(\d+)/m);
  if (result.status !== 0 || !version || Number(version[1]) < 17 || !/^jdk\.compiler@/m.test(result.stdout)) {
    throw new Error('H2 档案功能需要 Java 17+ JDK。请安装 JDK，并将 java 加入 PATH 或设置 JAVA_BIN。');
  }
  console.log('H2 驱动与 Java 运行环境检查通过。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
