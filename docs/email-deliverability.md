# Entregabilidad de correo (anti-spam) y remitente propio

Esta guía resuelve dos problemas operativos. **Ninguno se arregla en código**: son
configuración de DNS y del panel de Supabase. El código de la app ya usa
`EMAIL_FROM` + `replyTo` correctamente (`src/lib/email/send.ts`).

---

## 1. Las invitaciones caen en spam → autenticar el dominio remitente

Los correos transaccionales (invitaciones de household) salen vía SMTP/Resend con
el remitente `EMAIL_FROM` (p. ej. `Compound Ascend <communications@aitechumbrella.com>`).
Si el **dominio** de ese remitente no está autenticado, los proveedores (Gmail,
Outlook) lo mandan a "no deseados".

Hay que publicar **tres registros DNS** en el dominio de `EMAIL_FROM`:

| Registro | Qué hace | Cómo obtenerlo |
|---|---|---|
| **SPF** (TXT) | Autoriza qué servidores pueden enviar en nombre del dominio | Resend o Google te dan el valor; Workspace usa `v=spf1 include:_spf.google.com ~all` |
| **DKIM** (TXT/CNAME) | Firma criptográfica que prueba que el correo no fue alterado | **Resend:** verifica el dominio en el panel → te da los CNAME DKIM. **Google Workspace:** Admin → Apps → Gmail → Autenticar correo → genera la clave DKIM |
| **DMARC** (TXT en `_dmarc.<dominio>`) | Política ante fallos de SPF/DKIM + reportes | Empieza laxo: `v=DMARC1; p=none; rua=mailto:dmarc@tudominio.com` y endurece a `p=quarantine`/`p=reject` cuando SPF+DKIM pasen de forma estable |

### Pasos según proveedor

- **Resend:** Dashboard → Domains → Add Domain → verifica el dominio. Resend lista
  los registros SPF + DKIM (DMARC lo añades tú). Hasta que el dominio figure como
  **verified**, usa solo direcciones de ese dominio en `EMAIL_FROM`.
- **SMTP de Google Workspace:** activa **DKIM** en Google Admin (Apps → Google
  Workspace → Gmail → Autenticar correo). SPF ya suele estar; añade DMARC.

### Buenas prácticas de contenido (reducen el score de spam)

- `EMAIL_FROM` debe usar un **dominio propio verificado** (no `@gmail.com`).
- `replyTo` real (la app ya pone el correo del invitador como `reply_to`).
- Asunto claro, **sin clickbait** ni mayúsculas/`!!!`.
- Incluir **texto plano alternativo** además del HTML, evitar HTML "spammy"
  (imágenes pesadas, muchos enlaces, URLs acortadas).

### Verificación

Configuración → "Probar correo" (`testEmailAction`) envía un correo de prueba al
propio usuario y reporta el proveedor/errores. Tras publicar SPF/DKIM/DMARC,
revisa que el correo llegue a **bandeja de entrada** (no spam) y mira las cabeceras
(`Authentication-Results`) para confirmar `spf=pass dkim=pass dmarc=pass`.

---

## 2. El correo de confirmación viene de Supabase, no de tu dominio

`supabase.auth.signUp` dispara el correo de confirmación, y **lo envía Supabase
Auth** con su propio remitente compartido (no `EMAIL_FROM`). Para que salga de tu
dominio:

### Custom SMTP en Supabase (100 % panel, sin cambio de código)

1. Supabase → **Authentication → Emails → SMTP Settings** → activar **Custom SMTP**.
2. Ingresar las **mismas credenciales** que usa la app (Workspace/Resend):
   - Host, puerto (465 SSL / 587 STARTTLS), usuario y contraseña (App Password).
   - **Sender email** y **Sender name** con tu dominio verificado (igual que
     `EMAIL_FROM`).
3. Guardar. A partir de ahí **todos** los correos de Auth (confirmación, reset de
   contraseña, magic link, cambio de email) salen de tu dominio.
4. Opcional: **Authentication → Email Templates** → personalizar con el branding de
   Compound Ascend (asunto, logo, copy en español).

> Importante: Custom SMTP es obligatorio para producción. Sin él, Supabase aplica
> límites de envío bajos y el dominio remitente no es el tuyo.

---

## Variables de entorno relacionadas (app)

| Variable | Uso |
|---|---|
| `EMAIL_FROM` | Remitente de los correos transaccionales. Formato: `Nombre <correo@dominio.com>` |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` / `SMTP_PORT` | Vía SMTP (Workspace/otro). `SMTP_PORT` por defecto 465 |
| `RESEND_API_KEY` | Vía Resend (alternativa a SMTP) |
| `NEXT_PUBLIC_APP_URL` | Base para los enlaces de invitación/aceptación |

`EMAIL_FROM` y `replyTo` ya se aplican en `src/lib/email/send.ts` (`fromAddress()`
y el campo `replyTo`/`reply_to`). Las credenciales de Custom SMTP de Supabase se
configuran **aparte**, en el panel de Supabase — no se comparten desde la app.
