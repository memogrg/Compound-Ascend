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

Requiere **Android Studio** (trae el SDK) y un **JDK 17–21** para Gradle — el JDK que trae
Android Studio no sirve, ver [Release para Google Play](#release-para-google-play). El proyecto
se abre desde Android Studio:

```bash
npm run sync
npm run open:android   # cap open android  → abre el proyecto en Android Studio
```

### targetSdk 36 y reglas de backup

El target es **API 36 (Android 16)**, el mínimo que Play exige para publicar. Lo que trae 36 y
ya está resuelto: el **edge-to-edge es forzado** (la app siempre dibuja bajo las barras de
sistema, sin opt-out). No hay nada que hacer del lado nativo porque los safe-areas los maneja
el CSS con `env(safe-area-inset-*)` + `viewport-fit=cover` — un solo criterio para las dos
plataformas, como explica `capacitor.config.ts`.

El `AndroidManifest.xml` declara **`allowBackup="false"`** más `data_extraction_rules.xml`
(API 31+) y `backup_rules.xml` (API < 31), que excluyen `shared_prefs`, bases de datos,
archivos y `app_webview/`. El motivo es concreto: ahí viven las **cookies de sesión de
Supabase** y el **snapshot financiero de los widgets** (`cartera_widget`). Restaurar ese backup
en otro teléfono equivale a clonar la sesión. Con `allowBackup="false"` los dos XML son
redundantes, pero documentan la intención y protegen si alguien reactiva el backup — si lo
hace, que sea una decisión, no un descuido. **Mantener los dos archivos en sincronía.**

También hay un permiso de `CAMERA`: el escáner de recibos de `/m/asistente` usa un
`<input type="file" capture="environment">` y sin el permiso Capacitor no ofrece la cámara en
`onShowFileChooser` — cae al selector de archivos, en silencio.

## Release para Google Play

### 1. JDK 17–21

Gradle 8.13 corre sobre JDK 17 a 21. El JBR que trae **Android Studio Quail es Java 25** y
Gradle 8.13 no arranca sobre él (`Unsupported class file major version 69`). Instalá Temurin 21
y apuntá `JAVA_HOME` ahí:

```powershell
winget install EclipseAdoptium.Temurin.21.JDK
# JAVA_HOME = C:\Program Files\Eclipse Adoptium\jdk-21.x.x-hotspot  (variable de entorno de usuario)
```

En Android Studio: **Settings → Build, Execution, Deployment → Build Tools → Gradle → Gradle
JDK** = ese mismo Temurin 21. Así la línea de comandos y el IDE compilan con el mismo JDK.

### 2. Upload key (una sola vez, fuera del repo)

```bash
mkdir -p ~/.android-keys && cd ~/.android-keys
keytool -genkeypair -v -keystore cartera-upload.jks -alias cartera-upload -keyalg RSA -keysize 2048 -validity 10000
```

Guardá el `.jks` y **las dos contraseñas** (keystore y key) en el gestor de contraseñas de la
empresa. Si se pierde, Play permite pedir un reset de la upload key, pero es un trámite con
soporte y días de espera.

> El `.gitignore` de `android/` ignora `*.jks`, `*.keystore`, `keystore.properties`, `*.p12` y
> `*.pem`. Aun así, el `.jks` vive fuera del repo: que el ignore sea la segunda defensa, no la primera.

### 3. `keystore.properties`

Copiá `android/keystore.properties.example` a `android/keystore.properties` y completá
`storeFile` (ruta absoluta; en Windows con barras normales, `C:/Users/<vos>/.android-keys/cartera-upload.jks`),
`storePassword`, `keyAlias` (`cartera-upload`) y `keyPassword`.

En CI no hay archivo: `app/build.gradle` lee las mismas cuatro claves de `ANDROID_KEYSTORE_PATH`,
`ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` y `ANDROID_KEY_PASSWORD`. Sin ninguna de las
dos fuentes el release se compila **sin firma** y Gradle lo avisa con
`WARNING: release sin firma: …` — no falla, para que CI pueda compilar sin secretos.

### 4. Google Sign-In nativo — OBLIGATORIO antes del primer AAB

Google solo le entrega el `idToken` a un APK cuyo par **(paquete, SHA-1)** esté registrado como
cliente OAuth de tipo **Android** en el proyecto de Google Cloud **«CARTERA Plus»** (el mismo del
`webClientId` `127034942043-…`). Hacen falta **tres** clientes Android con paquete
`com.compoundascend.cartera`, uno por huella:

1. **Debug de cada desarrollador:**
   ```bash
   keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
   ```
2. **La upload key:**
   ```bash
   keytool -list -v -keystore ~/.android-keys/cartera-upload.jks -alias cartera-upload | grep SHA1
   ```
3. **La app signing key de Play:** se lee en Play Console → **Configuración → Integridad de la
   app → Firma de apps**, después de la primera subida. Sin esta, el login con Google falla en
   la build instalada desde la tienda con `[16] Account reauth failed`.

El campo **«Nombre del paquete»** es el `applicationId` (`com.compoundascend.cartera`), **no**
el dominio del sitio. Los cambios tardan de 5 minutos a una hora en aplicarse.

### 5. Build

```bash
cd mobile-shell && npx cap sync android && cd android && ./gradlew clean bundleRelease
# → app/build/outputs/bundle/release/app-release.aab
```

### 6. Verificar el alineamiento de 16 KB

[bundletool](https://github.com/google/bundletool/releases) es un `.jar`
(`java -jar bundletool.jar …`):

```bash
java -jar bundletool.jar dump config --bundle=app/build/outputs/bundle/release/app-release.aab | grep -i alignment
# debe decir PAGE_ALIGNMENT_16K
```

### 7. Probar el AAB como lo instala Play

```bash
java -jar bundletool.jar build-apks --bundle=app/build/outputs/bundle/release/app-release.aab \
  --output=app.apks --mode=universal \
  --ks=$HOME/.android-keys/cartera-upload.jks --ks-key-alias=cartera-upload
java -jar bundletool.jar install-apks --apks=app.apks   # con el emulador corriendo
```

Firmado con la upload key, el login con Google funciona si el cliente (2) ya está registrado.

### 8. Play App Signing

En la primera subida elegí **«Let Google manage and protect your app signing key»**. La key que
firma lo que llega a los teléfonos la genera y guarda Google; la nuestra (el `.jks`) es solo la
**upload key**. Por eso existe el cliente OAuth (3).

### 9. `versionCode` en cada subida

Play rechaza un `versionCode` igual o menor al último subido. En CI se pasa por
`ANDROID_VERSION_CODE`; a mano, editá el fallback en `app/build.gradle` antes de cada
`bundleRelease`. El `versionName` (`1.0.0`) es solo lo que ve el usuario.

## iOS

Requiere **Xcode completo** (no solo Command Line Tools) y **CocoaPods** (ya instalado: 1.16.2).
El proyecto Xcode ya está creado en `ios/`, pero el `pod install` quedó **pendiente** porque
`xcodebuild` necesita Xcode completo. Una vez instalado Xcode:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer   # apuntar a Xcode
cd ios/App && pod install && cd -                                  # instala las dependencias nativas
npm run open:ios                                                    # cap open ios → abre en Xcode
```

## Requisitos de App Store

Dos cosas que Apple revisa antes de aceptar el binario y que hay que mantener a mano:

**`ios/App/App/PrivacyInfo.xcprivacy`** — el *privacy manifest*. Declara qué datos recolecta la
app (correo, nombre, información financiera, historial de compra, fotos, contenido del usuario,
ID de usuario, crashes y performance — todo con propósito `AppFunctionality`, sin tracking) y
qué *required-reason APIs* usa (`UserDefaults`, timestamps de archivos, boot time). Está agregado
al target **App** en la fase *Resources*: si no viaja dentro del bundle, no sirve de nada.

> **Cada plugin nuevo que toque `UserDefaults`, archivos o APIs de sistema hay que reflejarlo acá.**
> Las razones se declaran por API, no por plugin, así que revisá el `PrivacyInfo.xcprivacy` del
> plugin al instalarlo y sumá al nuestro la categoría que falte. Un manifiesto incompleto es
> rechazo automático en App Store Connect.

**Usage descriptions en `Info.plist`** — iOS mata la app si pide un permiso sin su texto, y Apple
rechaza los textos genéricos: tienen que decir para qué sirve el permiso en esta app concreta.

| Clave | Por qué existe |
|---|---|
| `NSCameraUsageDescription` | el escáner de recibos de `/m/asistente` usa `<input type="file" capture="environment">`, que abre la cámara |
| `NSPhotoLibraryUsageDescription` | ese mismo input permite elegir una foto ya guardada |
| `NSFaceIDUsageDescription` | desbloqueo biométrico |

También en `Info.plist`: `ITSAppUsesNonExemptEncryption = false` (evita el cuestionario de
exportación en cada subida — solo usamos HTTPS estándar), `CFBundleDevelopmentRegion = es` +
`CFBundleLocalizations` (la app es 100 % español), `UIRequiredDeviceCapabilities = arm64`
(`armv7` es de 32 bits, muerto desde iOS 11) y **solo `UIInterfaceOrientationPortrait`**.

El target es **iPhone solamente** (`TARGETED_DEVICE_FAMILY = "1"`): la web `/m` es phone-first y
no tiene layout de landscape ni de tablet. Declarar iPad obliga a que la app se vea bien ahí, y
hoy no se ve — es causa de rechazo. Si algún día hay layout de tablet, se vuelve a `"1,2"` y se
reponen las orientaciones.

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
