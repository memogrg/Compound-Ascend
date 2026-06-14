import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildSecurityHeaders } from "./src/lib/security/headers";

/**
 * Compound Ascend — configuración Next.js
 * Las cabeceras de seguridad se construyen por ambiente en lib/security/headers.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // typedRoutes se habilitará cuando el set de rutas se estabilice (las rutas de
  // navegación con anclas #seccion son strings dinámicos en F0).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

// withSentryConfig sube source maps solo si hay SENTRY_AUTH_TOKEN (CI/Vercel);
// sin él, no falla el build — solo omite la subida. silent en CI.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
  widenClientFileUpload: true,
});
