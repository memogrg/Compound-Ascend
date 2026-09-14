# Sign in with Apple

Apple 4.8 lo exige: en cuanto la app ofrece un login social de terceros —nosotros ofrecemos
Google—, tiene que ofrecer también Sign in with Apple. Sin esto, el binario se rechaza.

El código está en `main`, pero **no funciona hasta que el provider esté configurado**. Este
documento dice qué falta, quién lo hace y cómo se prueba.

## Cómo funciona

Login **nativo por idToken**, el mismo camino que Google nativo:

1. `MobileAppleButton` (solo iOS, dentro de la app) llama a `nativeAppleLogin()`.
2. `@capgo/capacitor-social-login` abre la hoja del sistema y devuelve un `idToken` de Apple.
3. Ese `idToken` se canjea con `supabase.auth.signInWithIdToken({ provider: "apple" })`.

El **nonce** va hasheado (SHA-256) al plugin y **raw** a Supabase, que re-hashea y compara.
El plugin no hashea por su cuenta —en iOS asigna `request.nonce = nonce` literal—, así que
mandarle el raw a los dos haría que Supabase comparase hash contra raw y el canje fallaría.

El botón **no se renderiza** en web ni en Android. El flujo de Apple fuera de iOS es el web,
que necesita Services ID y un `redirectUrl` a nuestro backend; nada de eso está montado, y un
botón que no funciona es peor que ninguno.

## Prerrequisitos fuera del repo

Ninguno vive en el código. Son de M-2.

**Memo, en el Apple Developer Portal:**

| qué                             | dónde                                   | para qué                                              |
| ------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| Capability «Sign in with Apple» | App ID `com.compoundascend.cartera`     | habilita el flujo nativo                              |
| Entitlement en el target        | Xcode → Signing & Capabilities          | lo firma el binario (#789)                            |
| **Services ID**                 | Identifiers → Services IDs              | identifica el flujo web ante Apple                    |
| **Key `.p8`** + Key ID          | Keys → nueva key con Sign in with Apple | firma el client secret                                |
| **Team ID**                     | Membership                              | entra en el JWT del secret                            |
| Private Email Relay             | Services → Configure                    | deja que salgan correos a `@privaterelay.appleid.com` |

**David, en Supabase** (Authentication → Providers → Apple):

- **Client IDs**: `com.compoundascend.cartera,com.compoundascend.cartera.web`

  El **bundle id va primero y es el que importa** para este PR: el flujo nativo por idToken
  se valida contra él. El Services ID (`.web`) es para el flujo web, que hoy no se usa.

- **Secret Key (for OAuth)**: el JWT que se firma con la key `.p8` + Team ID + Key ID.

  > **Caduca cada 6 meses.** Apple no admite secrets de más de 180 días. Cuando caduque, el
  > login de Apple deja de funcionar de golpe y sin aviso previo. Hay que regenerarlo y
  > pegarlo de nuevo. Anotalo en el calendario el día que lo crees.

## Cómo probar

Nada de esto se puede probar desde Windows ni desde el navegador: hace falta iOS.

1. **Simulador** (Xcode → iPhone): iniciá sesión con un Apple ID en Ajustes del simulador
   antes de abrir la app. El botón solo aparece dentro de la app, no en Safari.
2. **Dispositivo**: es la prueba que vale. Face ID / Touch ID entran en el flujo.
3. **«Ocultar mi correo»**: elegí esa opción al menos una vez. El correo que llega es
   `algo@privaterelay.appleid.com` y el trigger `handle_new_user` rellena `display_name` con
   `split_part(email, '@', 1)`, o sea basura tipo `k7x2m9q`. `setDisplayNameFromProviderAction`
   lo reemplaza con el nombre que manda Apple.

   **Apple manda el nombre UNA SOLA VEZ**, en el primer login de cada Apple ID. Para volver a
   verlo hay que revocar el acceso en Ajustes → Apple ID → Inicio de sesión con Apple →
   CARTERA+ → Dejar de usar. Reinstalar la app **no** alcanza.

4. **Segundo login**: entrá y salí. La segunda vez Apple no manda nombre, y el que se guardó
   la primera vez tiene que seguir ahí.
5. **Nombre propio**: cambiá el nombre en Configuración y volvé a entrar con Apple. **No se
   debe pisar** — hay un test que lo vigila (`tests/unit/display-name-proveedor.test.ts`).

## Lo que este flujo NO hace

El login nativo por idToken **no pasa por `/auth/callback`**. Ese handler es el que registra
la aceptación de Términos, así que quien entre por acá queda con `terms_version = null`.

No es un agujero: lo cubre el banner de aceptación de T-08, que aparece en el layout de `/m`
cuando falta la versión vigente. Es exactamente la misma situación que el login de Google
nativo, que ya se comporta así en producción.

## Archivos

| archivo                                                 | qué hace                                                                    |
| ------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/capacitor/social-login-init.ts`                | init del plugin, nonce y heurística de cancelación (compartidos con Google) |
| `src/lib/capacitor/apple-native.ts`                     | el flujo: nonce → plugin → `signInWithIdToken`                              |
| `src/app/(mobile)/m/components/mobile-apple-button.tsx` | el botón, solo iOS                                                          |
| `src/modules/account/api/actions.ts`                    | `setDisplayNameFromProviderAction`                                          |
