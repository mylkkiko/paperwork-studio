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
  // One address for everything: the browser calls relative /api/* on the site's own origin and Next.js proxies it to
  // the backend. BACKEND_URL is the backend as seen from the Next.js server (internal), never the public address.
  async rewrites() {
    const backend = (process.env.BACKEND_URL ?? 'http://localhost:4000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${backend}/api/:path*` }];
  },
};

export default withNextIntl(nextConfig);
