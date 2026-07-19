# CARTERA+ · mobile-shell (Capacitor)

Shell de [Capacitor](https://capacitorjs.com/) que empaqueta CARTERA+ como app nativa
**Android** e **iOS**. La app **carga la web real desde el servidor**; el shell solo aporta el
contenedor nativo, los plugins y los assets de marca. Está **aislado** del build de Next.js del
repo: tiene su propio `package.json` y no depende de `src/`.

- **appId:** `com.compoundascend.cartera` · **appName:** `CARTERA+` · **webDir:** `www/`

## De dónde carga la app

Se decide al correr `cap sync`/`cap copy`, que evalúan `capacitor.config.ts`:

| Variables | Carga |
|---|---|
| *(ninguna)* | `https://carteraplus.vercel.app/m` — **producción, el default** |
| `CAP_SERVER_URL=<url>` | esa URL (dev con live-reload contra tu Next.js en la LAN) |
| `CAP_BUNDLED=1` | el contenido de `www/`, solo si se pide explícitamente |

**El default es producción a propósito.** Antes el default era el modo bundled y `www/`
contenía el prototipo estático de diseño: quien olvidara exportar `CAP_SERVER_URL` compilaba
un binario que abría una cuenta ficticia con datos verosímiles, sin ningún aviso. Ahora
olvidar la variable produce el comportamiento correcto, y `www/` es solo una **página de
diagnóstico** que dice claramente que la app está mal configurada — imposible de confundir
con la app real.

El prototipo de diseño se conserva en **`design-prototipo/`** como referencia; ya no viaja
dentro del binario.

## Propagar cambios a los proyectos nativos

```bash
npm run sync          # cap sync  (copia web + actualiza plugins, ambas plataformas)
npm run copy          # solo copiar la web, sin tocar dependencias nativas
npm run pods          # reinstalar Pods de iOS (fuerza locale UTF-8; ver nota en package.json)
```

## Modo HÍBRIDO / remote URL (probar contra el Next.js real)

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
- Tema: el `backgroundColor` de `capacitor.config.ts` usa el canvas claro (`#F1EFE8`), que es
  el fondo detrás del WebView. El tema de la app lo decide la web servida, no el shell.
