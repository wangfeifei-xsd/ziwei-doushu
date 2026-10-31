/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['lunar-javascript'],
  output: 'standalone',
  outputFileTracingIncludes: {
    '/api/profiles': ['./vendor/h2/**/*', './server/h2/**/*'],
    '/api/profiles/*': ['./vendor/h2/**/*', './server/h2/**/*'],
  },
  outputFileTracingExcludes: {
    '/*': ['./data/**/*', './.runtime/**/*', './**/*.mv.db', './**/*.lock.db', './**/*.trace.db'],
  },
};

module.exports = nextConfig;
