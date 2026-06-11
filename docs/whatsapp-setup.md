# Asistente de WhatsApp (Twilio) — configuración

El bot registra gastos por **foto** de recibo, gastos/ingresos por **texto** y
responde **consultas de solo lectura** del presupuesto. La capa de mensajería
(`src/lib/whatsapp/`) está desacoplada del proveedor: migrar de Twilio a Meta
Cloud API solo toca `twilio.ts`.

> Seguridad: el número que llega en un webhook es falsificable. El vínculo
> número↔usuario SOLO se establece tras verificar un **OTP** que el usuario envía
> desde la app. Sin vínculo activo, el bot no expone ningún dato. Toda escritura
> requiere **confirmación** explícita ("Sí"/"Editar").

---

## 1. Cuenta Twilio + WhatsApp Sandbox (para pruebas)

1. Crea una cuenta en **twilio.com**.
2. Consola → **Messaging → Try it out → Send a WhatsApp message** (Sandbox).
3. Une tu teléfono al sandbox: envía por WhatsApp el código `join <dos-palabras>`
   al número del sandbox (p. ej. `+1 415 523 8886`). Repite por cada número que
   pruebe (el sandbox solo habla con números unidos).

## 2. Apuntar el webhook a la app

En **Sandbox settings** → **"When a message comes in"**:

- **URL:** `https://{TU_APP_URL}/api/whatsapp/webhook`
- **Método:** `HTTP POST`

> ⚠️ La URL debe coincidir EXACTAMENTE con `NEXT_PUBLIC_APP_URL` (mismo esquema,
> host y path, sin barra final extra). La firma `X-Twilio-Signature` se calcula
> sobre esa URL; si no coincide, el webhook responde 403.

## 3. Variables de entorno (Vercel / `.env.local`)

| Variable | Valor |
|---|---|
| `TWILIO_ACCOUNT_SID` | SID de la cuenta (consola, `ACxxxxxxxx`) |
| `TWILIO_AUTH_TOKEN` | Auth Token (consola). También firma los webhooks |
| `TWILIO_WHATSAPP_NUMBER` | Número del bot en E.164, p. ej. `+14155238886` (sandbox) |

Tras agregarlas en Vercel, **redeploy** (las env solo aplican a deploys nuevos).
Si faltan, la integración se omite con gracia (no rompe la app).

## 4. Vincular un número (enrolamiento OTP)

1. En la app: **Configuración → Asistente de WhatsApp → Vincular WhatsApp**.
2. La app muestra un **código de 6 dígitos** (expira en 10 min).
3. El usuario envía ese código por WhatsApp al número del bot.
4. El bot confirma: "✅ Listo, {nombre}. Tu WhatsApp quedó vinculado…".
5. Para desvincular: **Desvincular WhatsApp** en la misma tarjeta.

Comandos útiles para el usuario: `ayuda` (menú), una **foto** del recibo, o texto
como `gasté 12000 en super` / `¿cuánto gasté este mes?`.

## 5. Producción (número propio aprobado)

El sandbox es solo para pruebas. Para producción:

1. Registra un número de WhatsApp en Twilio y completa la **aprobación del sender**
   (perfil de empresa) con Twilio/Meta.
2. Para mensajes **proactivos** fuera de la ventana de 24 h, se requieren
   **plantillas (templates) aprobadas**. El flujo actual responde dentro de la
   ventana de sesión (respuesta a un mensaje del usuario), que no requiere
   plantilla.
3. Actualiza `TWILIO_WHATSAPP_NUMBER` al número aprobado y reapunta el webhook a la
   misma URL `/api/whatsapp/webhook`.

---

## Notas de seguridad (implementadas)

- **Firma:** `verifyTwilioSignature` (HMAC-SHA1 sobre URL + params ordenados) valida
  cada POST antes de confiar en el cuerpo; inválido → 403.
- **OTP:** vínculo solo tras código verificado; expira a los 10 min; revocable.
- **service-role:** se usa solo server-side en el webhook y solo tras resolver el
  usuario por OTP verificado.
- **Confirmación:** ningún gasto/ingreso se escribe sin "Sí" del usuario.
- **Límites de IA:** se respeta el presupuesto de tokens por plan (`assertTokenBudget`
  + `recordUsage`).
- **Privacidad:** no se registran los cuerpos de los mensajes (pueden tener montos);
  solo metadatos.
- **Household:** las transacciones se guardan con el `household_id` correcto para que
  la familia también las vea.
