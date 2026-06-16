/** @type {import('next').NextConfig} */
const noStoreHeaders = [
  {
    key: "Cache-Control",
    value: "no-store, no-cache, must-revalidate, proxy-revalidate"
  },
  {
    key: "Pragma",
    value: "no-cache"
  },
  {
    key: "Expires",
    value: "0"
  }
];

// 内容安全策略（CSP）：XSS 的关键纵深防线，尤其页面会用 react-markdown 渲染模型输出。
// 说明：
// - Next.js 注入的内联脚本需要 'unsafe-inline'（App Router 暂无法完全去除）；
// - 'unsafe-eval' 仅开发模式需要（HMR），生产不放开；
// - img-src 放开 https: 和 data:，以兼容图片模型返回的远程 URL 与 base64；
// - connect-src 'self' 覆盖同源 API；若前端直连第三方接口需自行追加白名单域名。
const isDev = process.env.NODE_ENV !== 'production';
const cspDirectives = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
];

const securityHeaders = [
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff',
  },
  {
    key: 'X-Frame-Options',
    value: 'DENY',
  },
  {
    key: 'X-XSS-Protection',
    value: '1; mode=block',
  },
  {
    key: 'Referrer-Policy',
    value: 'strict-origin-when-cross-origin',
  },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  },
  {
    key: 'Content-Security-Policy',
    value: cspDirectives.join('; '),
  },
];

const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  
  // 确保 Prisma 文件被包含
  experimental: {
    outputFileTracingRoot: process.cwd(),
    outputFileTracingExcludes: {
      '*': [
        // 排除不需要的，但保留 Prisma
      ],
    },
    outputFileTracingIncludes: {
      '*': [
        './prisma/**/*',
        './node_modules/.prisma/**/*',
        './node_modules/@prisma/**/*',
      ],
    },
  },
  
  async headers() {
    const headers = [
      {
        source: "/chat",
        headers: [...noStoreHeaders, ...securityHeaders]
      },
      {
        source: "/login",
        headers: [...noStoreHeaders, ...securityHeaders]
      },
      {
        source: "/register",
        headers: [...noStoreHeaders, ...securityHeaders]
      },
      {
        // 应用于所有其他路由的安全响应头
        source: '/:path*',
        headers: securityHeaders,
      },
    ];

    // HTTPS 环境下添加 HSTS 头（生产环境）
    if (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== 'false') {
      headers.push({
        source: '/:path*',
        headers: [
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      });
    }

    return headers;
  }
};

export default nextConfig;
