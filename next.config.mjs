/** @type {import('next').NextConfig} */
const frameAncestors = ["'self'", process.env.FRAME_ANCESTORS].filter(Boolean).join(' ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: `frame-ancestors ${frameAncestors};` },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
];

const nextConfig = {
  reactStrictMode: true,
  // aceita o host de preview do ambiente (porta-*.dominio)
  allowedDevOrigins: ['*.e2b.app', 'localhost', '127.0.0.1'],
  outputFileTracingExcludes: {
    '*': [
      './services/**',
      './data/raw/**',
      './data/db/**',
      './db/**',
      './colab/**',
      './**/.git/**',
    ],
  },
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/services/**',
          '**/data/raw/**',
          '**/data/db/**',
          '**/db/**',
          '**/colab/**',
          '**/.git/**',
          '**/node_modules/**',
        ],
      };
    }
    return config;
  },
  async headers() {
    return [
      {
        source: '/((?!data/).*)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          ...securityHeaders,
        ],
      },
      {
        source: '/data/:path*',
        has: [
          { type: 'query', key: 'v' }
        ],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          ...securityHeaders,
        ],
      },
      {
        source: '/data/:path*',
        missing: [
          { type: 'query', key: 'v' }
        ],
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          ...securityHeaders,
        ],
      },
      {
        source: '/data/meta.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache' },
          ...securityHeaders,
        ],
      }
    ];
  },
};

export default nextConfig;
