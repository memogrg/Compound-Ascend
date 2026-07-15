/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from '@capacitor/cli';

// Modo DUAL (se decide al correr `cap sync`/`cap copy`, que evalúan este archivo):
//  - Si defines la variable de entorno CAP_SERVER_URL, la app carga esa URL remota
//    → modo HÍBRIDO / remote URL (dev live-reload contra Next.js, o tu deploy de producción).
//  - Si NO la defines, la app usa el contenido empaquetado en www/ → modo BUNDLED (default).
const serverUrl = process.env.CAP_SERVER_URL?.trim();

const config: CapacitorConfig = {
  appId: 'com.compoundascend.cartera',
  appName: 'CARTERA+',
  // webDir: diseño estático empaquetado (fallback bundled si no hay CAP_SERVER_URL).
  webDir: 'www',
  backgroundColor: '#F1EFE8',
  // Solo se agrega `server` cuando hay CAP_SERVER_URL; si no, queda bundled (sin server.url).
  ...(serverUrl
    ? {
        server: {
          url: serverUrl,
          // cleartext=true permite http en LAN (dev). En https es inofensivo.
          cleartext: serverUrl.startsWith('http://'),
        },
      }
    : {}),
  android: {
    // Fondo detrás del webview / status bar acorde a la canvas CLARA del diseño (--canvas).
    backgroundColor: '#F1EFE8',
  },
  ios: {
    backgroundColor: '#F1EFE8',
    // Edge-to-edge: el WebView NO auto-ajusta insets (contentInset 'never'); los safe-areas
    // los maneja el CSS con env(safe-area-inset-*) + viewport-fit=cover del HTML — UN solo
    // criterio, igual que Android. Con 'always' el scrollview insertaba su propio inset y
    // competía con el CSS (doble/inconsistente). Requiere `npx cap sync ios` + rebuild nativo
    // (no basta redeploy web) para tomar efecto.
    contentInset: 'never',
  },
  plugins: {
    SplashScreen: {
      // Auto-oculta el splash tras un instante corto: como el shell carga contenido
      // estático (www/) y no hay JS que llame SplashScreen.hide(), launchAutoHide=true
      // garantiza que el splash NO se quede pegado.
      launchShowDuration: 1500,
      launchAutoHide: true,
      // Fondo del splash = canvas CLARA del diseño (--canvas). El splash OSCURO sale de
      // los drawables -night generados (#15140F); al coincidir este color con el fondo
      // de la app, cualquier micro-gap entre splash y webview es imperceptible.
      backgroundColor: '#F1EFE8',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false,
    },
  },
};

export default config;
