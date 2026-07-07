# CARTERA+ · mobile-shell (Capacitor)

Shell de [Capacitor](https://capacitorjs.com/) que empaqueta el **diseño móvil estático** de
CARTERA+ como app nativa **Android** e **iOS**, en modo **BUNDLED** (la web viaja dentro del
binario; no apunta a ningún servidor). Está **aislado** del build de Next.js del repo: tiene su
propio `package.json` y no depende de `src/`.

- **appId:** `com.compoundascend.cartera` · **appName:** `CARTERA+` · **webDir:** `www/`
- La app es `www/index.html` (copia de `design-movil/project/CARTERA Movil.html`, autocontenida:
  CSS/JS/SVG inline + Google Fonts). `www/mobile/` y `www/assets/` son páginas y estilos de apoyo.

## Actualizar el contenido web

Editá lo que haya en `www/` y luego propagá a los proyectos nativos:

```bash
npm run sync          # cap sync  (copia www + actualiza plugins, ambas plataformas)
# o solo copiar la web, sin tocar dependencias nativas:
npm run copy
```

## Modo HÍBRIDO / remote URL (probar contra el Next.js real)

`capacitor.config.ts` es dual: si defines la variable `CAP_SERVER_URL` al correr `cap sync`,
la app **carga esa URL** en vez del `www/` empaquetado. Si no la defines, sigue en **bundled**.

**DEV — live-reload contra tu Next.js local (Android, gratis):**

```bash
# 1) En el repo Next.js (otra terminal), levantá el server visible en la LAN:
npm run dev -- -H 0.0.0.0

# 2) Hallá la IP LAN de tu Mac:
ipconfig getifaddr en0        # ej. 192.168.1.23

# 3) Acá en mobile-shell/, sincronizá apuntando a esa URL y abrí Android Studio:
CAP_SERVER_URL="http://<TU-IP>:3000/m" npm run sync
npm run open:android
```

Con el teléfono y la Mac en el **mismo WiFi**, al pulsar ▶ en Android Studio la app carga `/m`
con tus datos reales y **se recarga sola** cuando guardás cambios en la web.

**PROD — contra tu deploy (Vercel):**

```bash
CAP_SERVER_URL="https://<tu-dominio-vercel>/m" npm run sync
npm run open:android   # o open:ios
```

> Volver a **bundled**: corré `npm run sync` **sin** `CAP_SERVER_URL`.

## Android

Requiere **Android Studio** (incluye el JDK y el SDK). Este entorno no tenía Java, así que el
proyecto quedó andamiado pero se compila/abre desde Android Studio:

```bash
npm run sync
npm run open:android   # cap open android  → abre el proyecto en Android Studio
```

## iOS

Requiere **Xcode completo** (no solo Command Line Tools) y **CocoaPods** (ya instalado: 1.16.2).
El proyecto Xcode ya está creado en `ios/`, pero el `pod install` quedó **pendiente** porque
`xcodebuild` necesita Xcode completo. Una vez instalado Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer   # apuntar a Xcode
cd ios/App && pod install && cd -                                  # instala las dependencias nativas
npm run open:ios                                                    # cap open ios → abre en Xcode
```

## Íconos y splash

Por ahora se usan los **placeholders** del template de Capacitor (Android `ic_launcher*.png` +
`splash.png`; iOS `AppIcon` + `splash-2732*`). Para reemplazarlos por la marca CARTERA+ más
adelante, lo más simple es [`@capacitor/assets`](https://github.com/ionic-team/capacitor-assets):
poné un `assets/icon.png` (1024×1024) y `assets/splash.png` (2732×2732) y corré
`npx @capacitor/assets generate`.

## Notas de versión

- **Capacitor 7.6.7** (no 8.x): el CLI de Capacitor 8 exige Node ≥ 22 y este entorno usa Node 20.
  Capacitor 7 empaqueta Android/iOS igual. Al pasar a Node 22 se puede subir a Capacitor 8.
- Tema: el `<meta name="theme-color">` y el `backgroundColor` de `capacitor.config.ts` usan
  `#15140F` (canvas oscuro del diseño). El diseño arranca en tema **claro** por defecto
  (`data-theme="light"`); si preferís que abra en oscuro, cambialo en `www/index.html`.
