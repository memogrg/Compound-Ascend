import type { NextConfig } from "next";
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

export default nextConfig;
