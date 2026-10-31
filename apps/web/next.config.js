const path = require('node:path');
const repoRoot = path.resolve(__dirname, '../..');
require('@next/env').loadEnvConfig(repoRoot);
process.env.ZIWEI_REPO_ROOT = repoRoot;
process.env.ZIWEI_WEB_ROOT = __dirname;
process.env.H2_DATA_DIR = path.resolve(repoRoot, process.env.H2_DATA_DIR || 'data');
process.env.AI_CONFIG_DIR = path.resolve(repoRoot, process.env.AI_CONFIG_DIR || process.env.H2_DATA_DIR);
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lunar-javascript', '@ziwei/domain', '@ziwei/content', '@ziwei/runtime', '@ziwei/ui', '@ziwei/features'],
  outputFileTracingRoot: repoRoot,
  experimental: { cpus: 4 },
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/profiles': ['./vendor/h2/**/*', './server/h2/**/*'],
    '/api/profiles/*': ['./vendor/h2/**/*', './server/h2/**/*'],
  },
  outputFileTracingExcludes: {
    '/*': ['../../data/**/*', '../../.runtime/**/*', './data/**/*', './.runtime/**/*', './**/*.mv.db', './**/*.lock.db', './**/*.trace.db'],
  },
};

module.exports = nextConfig;
