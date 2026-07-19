/// <reference types="@capacitor/cli" />
import type { CapacitorConfig } from '@capacitor/cli';

/**
 * De dónde carga la app (se decide al correr `cap sync`/`cap copy`, que evalúan este archivo).
 *
 * EL DEFAULT ES LA URL DE PRODUCCIÓN, y es deliberado. Antes el default era el modo
 * bundled: quien olvidara exportar CAP_SERVER_URL compilaba un binario que abría el
 * prototipo estático de diseño —una cuenta ficticia con datos verosímiles— sin ningún
 * aviso. Un fallo silencioso que se confunde con la app real reaparece una y otra vez,
 * porque nada lo delata. Invirtiendo el default, olvidar la variable ya no rompe nada:
 * el camino correcto es el que ocurre solo.
 *
 *  - Sin variables            → producción (PROD_URL).
 *  - CAP_SERVER_URL=<url>     → esa URL (dev con live-reload contra Next.js en la LAN,
 *                               p. ej. http://10.0.2.2:3000/m en el emulador de Android).
 *  - CAP_BUNDLED=1            → modo bundled, SOLO si se pide explícitamente. Y lo que
 *                               se empaqueta ya no es el prototipo, sino una página de
 *                               diagnóstico imposible de confundir con la app (ver www/).
 */
const PROD_URL = 'https://carteraplus.vercel.app/m';
const bundled = process.env.CAP_BUNDLED === '1';
const serverUrl = process.env.CAP_SERVER_URL?.trim() || PROD_URL;

const config: CapacitorConfig = {
  appId: 'com.compoundascend.cartera',
  appName: 'CARTERA+',
  // webDir: solo la página de diagnóstico. Es el contenido que viaja dentro del binario
  // y únicamente se ve si algo va mal (o en modo bundled explícito).
  webDir: 'www',
  backgroundColor: '#F1EFE8',
  ...(bundled
    ? {}
    : {
        server: {
          url: serverUrl,
          // cleartext=true permite http en LAN (dev). En https es inofensivo.
          cleartext: serverUrl.startsWith('http://'),
        },
      }),
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
