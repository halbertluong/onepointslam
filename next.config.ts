import type { NextConfig } from "next";

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://js.stripe.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self'",
      "frame-src https://js.stripe.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.stripe.com https://api.resend.com",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  // The link-preview cards read the display font off disk at render time.
  // File tracing doesn't always follow a runtime readFile, and a missed font
  // would silently downgrade every shared card to the fallback face.
  outputFileTracingIncludes: {
    '/t/[slug]/[tournament]/opengraph-image': ['src/assets/**/*.ttf'],
    '/t/[slug]/[tournament]/register/opengraph-image': ['src/assets/**/*.ttf'],
  },

  async headers() {
    return [
      {
        source: '/(.*)',
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
