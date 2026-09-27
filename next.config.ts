import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { buildSecurityHeaders } from "./src/lib/security/headers";
import { CABECERA_BANDERAS, cabeceraBanderas } from "./src/lib/qa/banderas";

/**
 * CARTERA+ — configuración Next.js
 * Las cabeceras de seguridad se construyen por ambiente en lib/security/headers.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Tree-shaking dirigido de librerías con muchos exports: importa solo lo usado
  // en vez del barrel completo (mejora el tamaño de bundle y el cold start).
  experimental: {
    optimizePackageImports: ["recharts", "lucide-react", "@tabler/icons-react", "motion"],
  },
  // typedRoutes se habilitará cuando el set de rutas se estabilice (las rutas de
  // navegación con anclas #seccion son strings dinámicos en F0).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          ...buildSecurityHeaders(),
          // Con qué banderas de INTERFAZ se compiló este build. Se evalúa AQUÍ, en el proceso
          // del build, que es el único que lo sabe: `next start` ya no puede cambiarlo, y el
          // bundle no lo dice (Turbopack pliega la comparación y el valor no deja rastro).
          // Lo lee quien captura, para que dos snapshots con banderas distintas no se comparen
          // como si midieran lo mismo. Ver `src/lib/qa/banderas.ts`.
          { key: CABECERA_BANDERAS, value: cabeceraBanderas() },
        ],
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
