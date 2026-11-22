import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  // Small self-contained server for the Docker image.
  output: 'standalone',
  reactStrictMode: true,
  // @swc/helpers is pinned via package.json "overrides" (Next 15.5 and next-intl ask for different versions).
  // The standalone file tracer copies only its cjs/ folder, but esm/ files are required at runtime too.
  outputFileTracingIncludes: { '/*': ['./node_modules/@swc/helpers/**/*'] },
};

export default withNextIntl(nextConfig);
