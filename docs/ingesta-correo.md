# Ingesta por correo — cómo funciona, dónde se puede romper el aislamiento y cómo se verifica

> Auditoría del carril de ingesta por email de CARTERA+, medida contra el repo (`main` + `feat/landing-v2`)
> y contra la base de datos viva (`llaqonigsazoieyfhdea`) el **2 de septiembre de 2026**.
> Documento hermano: `docs/guia-conectar-correo.md` (la guía que ve el usuario).
>
> **Retiro de WhatsApp (2 sep 2026 — ya hecho):** WhatsApp salió del producto; la ingesta por correo es
> ahora la ÚNICA vía externa sin sesión. `src/lib/ingestion/review-flow.ts` se eliminó con el canal y la
> confirmación de propuestas vive solo en la bandeja "Por revisar" (web y móvil). El tipo `PendingAction`
> que usa la ingesta vive ahora en `src/lib/ingestion/types.ts` (ya no en `lib/whatsapp/`) y `formatMoney`
> se importa de `@/lib/format`; `GoalPending`/`StoredPending` eran solo del canal y se fueron con él.

---

## 1. Estado real hoy (medido, no supuesto)

| Métrica (prod)                                                                  | Valor                               |
| ------------------------------------------------------------------------------- | ----------------------------------- |
| Reenviadores registrados (`email_ingest_links`)                                 | 2                                   |
| Reenviadores **verificados**                                                    | **0**                               |
| Correos procesados históricamente (`processed_events`, provider `email_ingest`) | 167 (último: 1 sep 2026, 02:02 UTC) |
| Propuestas en cola (`ingest_proposals`)                                         | 0                                   |
| Transacciones con `source='email'`                                              | 0                                   |
| Tarjetas etiquetadas (`account_cards`)                                          | 0                                   |

**Lectura:** el carril está **apagado de hecho**. `lookupOwnerByForwarder` filtra por `verified = true`
(`src/lib/ingestion/email/forwarder-lookup.ts`), y no hay ninguna fila verificada: todo correo que llegue
al buzón se cuenta como `ignorados` y se queda sin leer para siempre. La data de la validación de junio
desapareció con las pruebas de borrado de cuenta (#82): `email_ingest_links`, `ingest_proposals` y
`transactions` cuelgan de `auth.users` con `on delete cascade`; `processed_events` no tiene `user_id`,
por eso sobrevivieron los 167 registros.

**Y hay una señal de embudo roto:** las 2 filas existentes son de usuarios reales que pidieron el código
y **nunca lo confirmaron** (26 ago y 2 sep — ambas con `verify_code_hash` vivo y sin verificar). Dos de dos
intentos self-serve se cayeron en el paso del código. Antes de invitar gente hay que reproducir ese paso
de punta a punta: el envío usa SMTP (`SMTP_HOST/USER/PASS` están puestos), así que lo primero a descartar
es que el código esté cayendo en la carpeta de spam del usuario, y lo segundo que 15 minutos de vigencia
(`VERIFY_TTL_MIN`) sean muy poco para alguien que abre el correo en otro dispositivo.

---

## 2. Cómo se decide hoy de quién es cada correo

```
Banco → bandeja del usuario → (reenvío) → communications@aitechumbrella.com (Gmail, IMAP)
                                                     │
        GitHub Actions cada 15 min ─ POST /api/ingest/email/poll (X-Cron-Secret)
                                                     │
                       fetchUnseen(): IMAP search "no leídos" en INBOX
                                                     │
        candidatos = To/Cc del envelope + Delivered-To, X-Forwarded-For/To,
                     X-Original-To, X-Gm-Original-To  +  EL REMITENTE (From)
                                                     │
        lookupOwnerByForwarder(candidatos) → email_ingest_links WHERE verified
                                                     │
             ¿match? ── no ──→ ignorado (no se marca leído: se reintenta siempre)
                │ sí
        processed_events(messageId) → ¿ya visto? ── sí ──→ duplicado
                │ no
        parseNotification(texto)  ← hoy SOLO existe el parser de BAC
                │
        ingest_proposals (status 'pending')  ─ único (coalesce(household_id,user_id), external_ref)
                │
        Confirmación en la bandeja "Por revisar" de /transacciones (web y móvil)
                    →  transacción real (origin='imported', source='email')
```

Lo que **sí** está bien resuelto y conviene no tocar:

- **Nada se confirma solo.** El poller deja propuestas; la transacción la crea el usuario. Un correo
  malicioso o mal parseado no ensucia las cifras sin que alguien lo apruebe.
- **Doble idempotencia:** por `messageId` (`processed_events`) y por `(cuenta, external_ref)` (índice único).
  Reenviar dos veces el mismo aviso no duplica el gasto.
- **RLS real** en `ingest_proposals`: sin policy de INSERT para usuarios (solo el poller con service-role),
  y lectura acotada a dueño + hogar.
- **La allowlist es la única puerta.** Un correo de un remitente desconocido no se procesa jamás.

---

## 3. Aislamiento entre usuarios: los cuatro huecos reales

> **Estado al 2 sep 2026:** P0-1, P0-2 y P0-3 quedaron cerrados en la rama
> `fix/ingesta-correo-aislamiento`. El `revoke` de P0-1 ya está **aplicado en la base de producción**
> (`anon`/`authenticated` quedaron con SELECT y DELETE; INSERT/UPDATE solo service-role), así que el
> agujero de secuestro está cerrado incluso antes de desplegar el código. Ojo con el orden: hasta que
> el código nuevo esté en prod, el alta de correos **falla** (el código viejo escribe con el cliente de
> sesión, que ya no tiene grant). Como no hay ningún reenviador verificado, no rompe nada en uso.

El miedo de fondo — _"que un usuario conecte su correo y los gastos le lleguen a todos"_ — **no ocurre**:
la propuesta se inserta con el `user_id`/`household_id` del dueño resuelto y la RLS impide que otro la lea.
El riesgo real es el opuesto y más silencioso: **que el correo de un usuario se le asigne al usuario equivocado**.
Hay cuatro caminos para eso, y tres son P0.

### P0-1 · Cualquiera con cuenta puede reclamar el correo de otro (secuestro de reenviador)

**Confirmado en la base viva.** Las policies de `email_ingest_links` son:

```
eil_ins  INSERT  with check (user_id = auth.uid())
eil_upd  UPDATE  using/with check (user_id = auth.uid())
```

y `authenticated` tiene privilegio de INSERT y UPDATE sobre **todas** las columnas, incluida `verified`.
El `with check` solo mira `user_id`: **no valida `forwarder_email` ni impide poner `verified = true`**.
La verificación por código vive en la server action (`ingest-email-service.ts`), no en la base — y la base
es directamente alcanzable con la anon key + el JWT del atacante.

Explotación, en un solo POST a PostgREST:

```
POST /rest/v1/email_ingest_links
{ "user_id": "<mi propio id>", "forwarder_email": "victima@gmail.com", "verified": true }
```

Consecuencias, en orden de gravedad:

1. **Robo de movimientos.** Si la víctima configura después su reenvío, sus avisos del banco se resuelven
   contra la fila del atacante y **sus gastos aparecen en la cuenta del atacante**. Es exactamente el
   escenario que no puede pasar.
2. **Bloqueo (squatting).** `uq_email_ingest_links_forwarder` es único: la víctima ya no puede registrar su
   propio correo y recibe _"Ese correo no está disponible"_ sin entender por qué.

**CERRADO** — migración `20260902000001_email_ingest_hardening.sql`, aplicada en prod. El fix fue sacar
la escritura de manos del cliente:

- `revoke insert, update … from anon, authenticated` + borrar las policies `eil_ins`/`eil_upd`. SELECT
  (dueño + hogar) y DELETE (dueño) siguen intactos.
- El alta y la verificación pasan a hacerse **solo desde el servidor**, con service-role, en
  `ingest-email-service.ts`. **No** se hizo con funciones `security definer`, y la razón importa: el
  código de 6 dígitos tiene que viajar SOLO por correo. Un RPC que se lo devolviera al llamador no
  probaría nada — cualquiera pediría el código de la dirección de otro y lo confirmaría en el acto.
  Las garantías las pone el servicio: `requireUser()` autentica, `user_id` sale de la sesión y nunca
  del cliente, una dirección de otra cuenta se rechaza sin revelar de quién es, y `verified` solo pasa
  a true tras comparar el hash **en tiempo constante**.
- Trigger `email_ingest_guard` como defensa en profundidad: aunque un `grant all` futuro devolviera el
  privilegio por descuido, un rol `anon`/`authenticated` sigue sin poder escribir.
- Rate limit real (Upstash ya estaba conectado): 3 códigos por dirección/hora, 10 por usuario/día y 8
  intentos de confirmación cada 15 min — sin esto la app servía para bombardear cualquier dirección con
  nuestra marca, y 6 dígitos se adivinan a fuerza bruta.
- `verified_at` deja rastro de cuándo se probó la propiedad (la invariante 6.3-#2 pasa a ser detectable).
- TTL del código: 15 → 30 minutos (los dos intentos reales de usuarios se cayeron en ese paso).

### P0-2 · El remitente se acepta como identidad, y el remitente se falsifica

En `fetchUnseen` (`imap-poller.ts`) los candidatos incluyen el `From`:

```ts
recipients: [...new Set([...recipients, from])], // + From para reenvío manual
```

Es necesario para el reenvío manual (donde el usuario queda en el `From`), pero convierte una cabecera
falsificable en credencial. Cualquiera puede mandar un correo a `communications@aitechumbrella.com` con
`From: victima@gmail.com` y un cuerpo con formato BAC, y le inyecta propuestas a la víctima. No crea
transacciones solas, pero sí ensucia su bandeja "Por revisar" y habilita ingeniería social
("confirmá este cargo de ₡480.000").

**CERRADO** — `fromIsAuthenticated()` en `imap-poller.ts`. El From dejó de mezclarse con los
destinatarios: ahora es un nivel aparte (`senderCandidates`) que solo se puebla si **nuestro** buzón
estampó `Authentication-Results` con `dkim=pass` del mismo dominio del From, o `spf=pass` con
`smtp.mailfrom` idéntico a esa dirección. `ARC-Authentication-Results` se ignora a propósito: es la
afirmación de un tercero. Un correo con `From: victima@gmail.com` mandado desde otro servidor no
consigue ninguna de las dos y no se le acepta la identidad.

### P0-3 · Candidatos múltiples → dueño no determinista

```ts
.in("forwarder_email", candidates).limit(1).maybeSingle()
```

Sin `order by`. Si un correo trae **dos** direcciones verificadas de **cuentas distintas** — dos cónyuges
con cuentas separadas en copia del mismo aviso, o un reenvío manual con copia a otro usuario —, Postgres
devuelve la que quiera y **el movimiento cae en una cuenta al azar**. No hay error, no hay log: se ve como
si hubiera funcionado.

**CERRADO** — `lookupOwnerByForwarder` trae _todos_ los match y devuelve `OwnerLookup`:
`found` | `none` | `ambiguous`. Con dos cuentas distintas el correo **no se procesa**, no se marca leído
y se cuenta en `ambiguos` para alertar; dos correos del mismo hogar no son ambigüedad. La resolución es
en dos niveles: primero destinatarios (auto-forward), y solo si ahí no hay nada, el remitente autenticado
(reenvío manual). Una ambigüedad en el primer nivel corta — no se baja al segundo a buscar suerte.

### P1-4 · Pérdida silenciosa: el banco que no sabemos leer

Si el dueño se resuelve pero `parseNotification` no devuelve nada, el correo se marcaba `processed` +
leído y desaparecía. El usuario configuró todo bien, ve que el correo salió de su bandeja, y en la app no
pasaba nada. Nunca sabría por qué.

**CERRADO** — (a) el correo con dueño y cero movimientos queda en `ingest_notices` (remitente, asunto,
recorte) y Configuración le dice al usuario «tu reenvío funciona; recibimos N avisos que todavía no
sabemos leer» (PR #737); (b) el parser genérico de Costa Rica (`sources/cr-generic-notification.ts`)
propone con confianza ≤ 0.85 los avisos de BNCR, BCR, Popular y el resto de bancos y cooperativas
identificables, así que «no sabemos leerlo» queda reservado a lo que ni siquiera trae banco o monto
(rama `feat/plantillas-bancos`). `ingest_notices` sigue siendo la cola para afinar plantillas exactas.

### Otros hallazgos operativos

| #   | Hallazgo                                                                                                                                                                                                    | Severidad | Fix                                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------------------- |
| 5   | El poller lee **solo INBOX**. Un correo reenviado falla SPF y DMARC por diseño → Gmail lo puede mandar a Spam y se pierde sin rastro                                                                        | P1        | Filtro "no enviar nunca a Spam" en el buzón de ingesta **y** leer también `[Gmail]/Spam` |
| 6   | Gmail exige verificar la dirección destino y **manda el enlace a nuestro buzón compartido**. Hoy alguien tiene que abrirlo a mano por cada usuario nuevo                                                    | P1        | Ver §4: dirección única por usuario, o un auto-confirmador en el poller                  |
| 7   | ~~Sin límite de envío en `requestIngestEmailVerification`~~                                                                                                                                                 | —         | **CERRADO** con P0-1                                                                     |
| 8   | ~~`verify_expires_at` = 15 min~~ · falta el botón "reenviar código"                                                                                                                                         | P2        | TTL ya subido a 30 min; falta el botón                                                   |
| 8b  | `anon`/`authenticated` tienen **TRUNCATE** sobre las tablas de usuario (herencia del `grant all` de los default privileges). TRUNCATE **ignora la RLS**. Hoy no es explotable porque PostgREST no lo expone | P2        | Revocar TRUNCATE a los roles del cliente en todas las tablas                             |
| 9   | Los `ignorados` se acumulan sin leer en el buzón para siempre                                                                                                                                               | P2        | Purga a los 30 días + métrica                                                            |
| 10  | El resumen del poller no va a ninguna parte (solo el JSON de la respuesta)                                                                                                                                  | P2        | Registrar cada corrida y alertar si `ignorados > 0` sostenido o si no hay corrida en 1 h |
| 11  | Prod **sin backups** (gap P1-7 de la auditoría)                                                                                                                                                             | P1        | Fuera de este carril, pero aplica a estos datos                                          |

---

## 4. La decisión de arquitectura que borra tres de los cuatro huecos

Hoy la identidad se **infiere** de las cabeceras de un correo. Es inferencia sobre terreno que no controlamos:
cada proveedor pone cabeceras distintas, ninguna está garantizada, y Google no documenta las suyas
(`X-Forwarded-To`/`X-Forwarded-For` son comportamiento observado, no contrato).

**La alternativa es no inferir: darle a cada usuario su propia dirección de ingesta.**

```
memo   → u7f3k9q2@in.carteraplus.com   ┐
ana    → u4b8m1x5@in.carteraplus.com   ├→ catch-all → buzón de ingesta (IMAP)
carlos → u9d2p6w7@in.carteraplus.com   ┘
```

El destinatario **es** la identidad. Se cae solo:

- **P0-2 (spoofing) desaparece:** el atacante tendría que adivinar el token del destinatario.
- **P0-3 (ambigüedad) desaparece:** un correo tiene una dirección de ingesta, no varias.
- **Hallazgo 6 desaparece:** el código/enlace de verificación de Gmail llega a la dirección de _ese_ usuario;
  el poller lo reconoce, lo asocia sin ambigüedad y se lo muestra en la app (o abre el enlace solo).
- **Privacidad:** si el usuario se equivoca de filtro y reenvía correo personal, entra por su propio buzón lógico.

Dos advertencias:

1. **No usar plus-addressing** (`communications+token@`). Ya se probó y Google no deja verificar alias con `+`;
   además varios formularios de reenvío rechazan el `+`. Tienen que ser direcciones reales distintas, que es
   justo lo que da un catch-all sobre un subdominio (`in.carteraplus.com`).
2. La dirección larga es más difícil de teclear en el formulario de reenvío → en la app va con botón de copiar
   y se manda también por correo para poder pegarla en la compu.

La dirección plana actual se queda como camino de reenvío manual heredado, con el `From` ya endurecido por DKIM.

---

## 5. Matriz por proveedor (verificado contra documentación oficial, sep 2026)

| Proveedor                    | Reenvío automático                                                                          | ¿Verifica el destino?                                                                         | Costo                                  | Trampa principal                                                                                                                                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Gmail personal**           | Configuración → Reenvío y correo POP/IMAP; filtro por remitente para reenviar solo el banco | **Sí**, enlace/código a la dirección destino. El filtro solo lista direcciones ya verificadas | Gratis                                 | **Nunca reenvía lo que cae en Spam** → hay que crear antes el filtro "No enviarlo nunca a Spam". Y **no se configura desde el celular**: la doc de Google empieza cada paso con "En tu computadora"       |
| **Google Workspace**         | Igual que Gmail                                                                             | Sí                                                                                            | —                                      | El admin puede apagarlo: la sección de Reenvío **desaparece sin mensaje de error**                                                                                                                        |
| **Outlook.com / Hotmail**    | Configuración → Correo → Reenvío; o Reglas → **Redirigir a**                                | **No verifica nada**                                                                          | Gratis                                 | Usar **"Redirigir a"**, no "Reenviar a" (el reenvío llega "de parte del usuario" y se pierde el remitente del banco). Sin verificación, un typo manda los avisos del banco a un tercero y nadie se entera |
| **Microsoft 365 / Exchange** | Igual que Outlook web                                                                       | No                                                                                            | —                                      | **Bloqueado por defecto desde 2021** en todo tenant nuevo. Rebota con `5.7.520 Access denied, Your organization does not allow external forwarding` → lo tiene que habilitar el admin                     |
| **Yahoo Mail**               | Configuración → Buzones → Auto-forwarding                                                   | Sí, botón _Verify_                                                                            | **Requiere Yahoo Mail Plus (de pago)** | Además "no disponible en todos los locales" — falta confirmar Costa Rica con una cuenta real                                                                                                              |
| **iCloud**                   | icloud.com/mail → Configuración → Reenvío de correo                                         | No                                                                                            | Gratis                                 | **No marcar "Eliminar mensajes después de reenviarlos"**: el usuario pierde su propia copia. Solo desde icloud.com, no desde la app Mail                                                                  |
| **Cualquiera**               | Reenvío **manual** del aviso                                                                | —                                                                                             | Gratis                                 | Camino de rescate universal. Depende del `From` → exige el endurecimiento P0-2                                                                                                                            |

Nota de mercado: RACSA cerró su correo de consumo; ICE/kölbi y los cables no documentan reenvío para
usuarios finales. Con Gmail, Outlook, iCloud y Yahoo se cubre prácticamente todo el mercado tico.

Realidad de entrega, para no prometer de más: al reenviar, **SPF falla siempre** (cambia la IP de origen) y
DMARC falla en cascada; DKIM sobrevive solo si nadie toca el mensaje. Por eso el buzón de ingesta **no debe**
rechazar por DMARC y sí necesita el filtro anti-spam explícito.

---

## 6. Protocolo de verificación — cómo se prueba que quedó bien

### 6.1 Antes de invitar a alguien (una vez por proveedor)

El endpoint ya trae modo diagnóstico: **`POST /api/ingest/email/poll?debug=1`** con `X-Cron-Secret`.
Devuelve, por correo no leído (hasta 10), el remitente, el asunto, **los candidatos de destinatario** y si
matchean un reenviador conocido — **sin procesar ni marcar leído**. Es la herramienta correcta para ver qué
cabecera trae la dirección en cada proveedor, sobre correos reales.

Para cada proveedor (Gmail, Outlook, iCloud, Yahoo) y en los dos modos (automático y manual):

1. Reenviar un aviso real del banco desde una cuenta de prueba de ese proveedor.
2. Correr el poll en modo debug y **anotar la lista de candidatos**.
3. Confirmar que la dirección del usuario aparece y que `matched: true`.
4. Anotar en esta tabla qué cabecera la trajo, para saber de qué dependemos:

| Proveedor   | Modo     | Cabecera que trajo la dirección | ¿Match? | Fecha |
| ----------- | -------- | ------------------------------- | ------- | ----- |
| Gmail       | auto     |                                 |         |       |
| Gmail       | manual   |                                 |         |       |
| Outlook.com | redirect |                                 |         |       |
| iCloud      | auto     |                                 |         |       |
| Yahoo       | auto     |                                 |         |       |

### 6.2 Prueba de aislamiento (obligatoria antes de abrir el registro)

Con **dos cuentas de prueba A y B, ambas verificadas**:

1. Reenviar un aviso desde A. Confirmar que la propuesta nace con el `user_id` de A y que B no la ve.
2. Reenviar desde A **con copia al correo de B**. Con el fix P0-3, debe quedar **sin procesar** (ambiguo),
   nunca asignado a uno de los dos al azar.
3. Con la sesión de B, intentar leer las propuestas de A vía PostgREST directo (anon key + JWT de B):
   debe devolver 0 filas.
4. Con la sesión de B, intentar insertar `forwarder_email` de A con `verified = true`: **con el fix P0-1
   debe fallar; hoy pasa.** Este es el test de regresión que hay que dejar escrito.

### 6.3 Invariantes que se corren solos (semanal, y en el CI de datos)

```sql
-- 1. Ninguna propuesta debe pertenecer a una cuenta distinta de la del reenviador que la originó.
select p.id, p.user_id
from ingest_proposals p
left join email_ingest_links l
  on l.user_id = p.user_id
 and (p.household_id is null or l.household_id = p.household_id)
where l.id is null;

-- 2. Ningún correo verificado sin rastro de código (síntoma de auto-verificación por RLS).
select id, forwarder_email from email_ingest_links
where verified and verify_code_hash is null and created_at > '2026-09-01';

-- 3. Ningún correo repetido entre cuentas distintas (el índice único ya lo impide; vigilar por si cae).
select forwarder_email, count(distinct user_id) from email_ingest_links
group by 1 having count(distinct user_id) > 1;

-- 4. Usuarios verificados sin una sola propuesta a las 72 h → el reenvío no quedó bien configurado.
select l.user_id, l.forwarder_email, l.created_at
from email_ingest_links l
where l.verified and l.created_at < now() - interval '72 hours'
  and not exists (select 1 from ingest_proposals p where p.user_id = l.user_id);
```

La #4 no es un bug: es el disparador del acompañamiento. Si a las 72 horas no llegó nada, hay que escribirle
al usuario, no esperar a que se dé cuenta.

### 6.4 Alertas mínimas del carril

- Sin corrida del poller en 1 hora → alerta (el cron de GitHub Actions falla en silencio hoy).
- `ignorados > 0` en tres corridas seguidas → hay correo llegando de gente que no está en la allowlist.
- `AUTHENTICATIONFAILED` en el log del poll → el App Password del buzón se murió (ya se loguea, falta que alerte).
- Correos con dueño y cero movimientos → cola de parsers pendientes (hallazgo P1-4).

---

## 7. Orden sugerido de trabajo (un delta a la vez)

| #   | Delta                                                                                                | Estado                                                                  |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1   | **P0-1 / P0-2 / P0-3**: revoke + escritura solo desde el servidor + rate limit + DKIM + sin adivinar | **HECHO** (rama `fix/ingesta-correo-aislamiento`; el revoke ya en prod) |
| 2   | Desplegar y reactivar el carril: verificar un reenviador real y probar punta a punta                 | Siguiente. Sin esto no hay nada que medir                               |
| 3   | Dirección de ingesta única por usuario (§4), sobre Cloudflare Email Routing                          | Siguiente. Borra la inferencia por cabeceras de raíz                    |
| 4   | OAuth de Microsoft (Graph `Mail.Read`)                                                               | El único "un clic" de verdad que es gratis y sin auditoría              |
| 5   | `ingest_unparsed` + aviso al usuario                                                                 | Convierte la pérdida silenciosa en cola de trabajo de parsers           |
| 6   | Spam del buzón + alertas del cron                                                                    | Evita la pérdida invisible                                              |
| 7   | Gmail OAuth (piloto ≤100 usuarios con cliente desechable → después CASA o proveedor)                 | Decisión con costo; ver §8                                              |
| 8   | Parsers BNCR y BCR                                                                                   | Recién ahí el producto sirve fuera de BAC                               |

---

## 8. Cómo se llega a "un clic" (investigado el 2 sep 2026, con fuentes oficiales)

El reenvío nunca va a ser un clic: es configuración en casa ajena. Lo que sí puede serlo es **conectar la
bandeja**. El terreno, por proveedor:

| Proveedor                    | Camino a un clic                                                                                                                                                                                   | Costo                     | Plazo            |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------- |
| **Outlook / Hotmail / M365** | Microsoft Graph `Mail.Read` delegado. Funciona en cuentas personales **sin consentimiento de administrador**; la verificación de publicador es **gratis y de minutos**. No existe auditoría pagada | **$0**                    | ~1 semana        |
| **Gmail (piloto)**           | `gmail.readonly` con el cliente OAuth en producción **sin verificar**: tope de **100 usuarios de por vida y por cliente** (no se resetea), con pantalla de "app no verificada"                     | $0                        | ~1 semana        |
| **Gmail (escala)**           | El mismo scope es **restringido**: verificación + **auditoría de seguridad CASA anual**. Precio no publicado por Google; los evaluadores rondan **$540–$1.800/año**                                | Costo fijo anual          | **6–12 semanas** |
| **Gmail (comprado)**         | Un proveedor con cliente Google pre-verificado (Nylas y similares) evita verificación y CASA                                                                                                       | ~$49/mes + ~$2/cuenta/mes | ~1 semana        |
| **Yahoo (plan gratis)**      | **La palanca que buscábamos:** el reenvío automático es de pago, pero **IMAP con contraseña de aplicación es gratis** y no está paywalleado. `imap.mail.yahoo.com:993`                             | **$0**                    | ~1 semana        |
| **iCloud**                   | Contraseña específica de app + IMAP (`imap.mail.me.com:993`). Gratis, máx. 25 activas                                                                                                              | **$0**                    | ~1 semana        |

Tres cosas que hay que tener en la cabeza antes de tocar OAuth de Google:

1. **`gmail.metadata` también es restringido** y ni siquiera lee el cuerpo: no hay atajo por ahí. Los
   scopes de complemento (`gmail.addons.current.message.readonly`) sí son "sensibles" en vez de
   restringidos, pero solo leen el mensaje que el usuario tiene abierto: no sirven para ingesta de fondo.
2. **Limited Use prohíbe que una persona lea el correo ingerido** sin consentimiento explícito por
   mensaje. Eso hay que diseñarlo ANTES (un control "dejá que soporte vea este correo"), porque es lo que
   convierte una verificación de seis semanas en una de doce. También prohíbe usar esos datos para
   decisiones de crédito y para entrenar modelos más allá del modelo personalizado del propio usuario.
3. **El tope de 100 del piloto es permanente y por cliente.** Si se hace piloto, con un cliente OAuth
   desechable, no con el que se vaya a verificar después.

**Y la palanca de las contraseñas de aplicación tiene un precio que no es dinero:** custodiar una
credencial del correo del usuario. Si se toma ese camino (Yahoo e iCloud, donde es la _única_ opción),
va cifrada con llave de KMS —nunca al alcance del código de aplicación con la service-role— y con el
flujo de re-autenticación construido **antes** de lanzarlo: la contraseña se revoca sola cuando el
usuario cambia su clave principal, y si no hay aviso, el usuario solo ve que "dejó de funcionar".

---

## 9. Puesta en marcha de la dirección única (configuración de una sola vez)

El código ya está: si `INGEST_ADDRESS_DOMAIN` está definido, cada cuenta recibe su dirección
`u<token>@<dominio>` la primera vez que abre Configuración, y el poller la resuelve por
`X-Gm-Original-To`. Si la variable falta, la app no ofrece direcciones únicas y queda el carril
heredado — no se rompe nada. Falta la parte de infraestructura, que son 15 minutos:

**Por qué así.** El DNS de `aitechumbrella.com` está en Squarespace y el correo en Google Workspace.
Cloudflare Email Routing —que sería lo ideal— **solo sirve subdominios delegados por NS en cuentas
Enterprise**, así que queda descartado sin mover el dominio entero. Google Workspace hace lo mismo
gratis y sin tocar el apex.

### 9.1 Subdominio en Google Workspace

1. Consola de administración → **Cuenta → Dominios → Administrar dominios → Agregar un dominio** →
   **Dominio secundario** → `in.aitechumbrella.com` → **Agregar dominio y comenzar la verificación**.
   Al terminar, volver a **Administrar dominios** y pulsar **Activar Gmail** en el subdominio.
   Es gratis: se paga por usuario creado en él, y no vamos a crear ninguno. **Secundario, no alias**:
   un alias replicaría todos los usuarios existentes en el subdominio y el catch-all dejaría de ser
   uniforme.
2. Si pide verificación, el TXT va en Squarespace (normalmente se hereda del dominio padre).

### 9.2 MX en Squarespace

DNS Settings → **Custom Records** → añadir:

| Alojamiento (Host) | Tipo | Prioridad | Datos             |
| ------------------ | ---- | --------- | ----------------- |
| `in`               | MX   | 10        | `smtp.google.com` |

Ruta: **account.squarespace.com/domains** → el dominio → **DNS** → **Registros personalizados** →
**Agregar registro**. En «Alojamiento» va solo `in`, no el dominio completo.

**No tocar el MX del apex.** El correo de la empresa sigue igual.

### 9.3 Regla de enrutamiento (el catch-all)

Consola → **Apps → Google Workspace → Gmail → Enrutamiento** (_Routing_ — NO «Enrutamiento
predeterminado» ni «Hosts», que son pantallas distintas) → **Configurar** / **Agregar otra regla**:

- Nombre: `ingesta-catchall`.
- **Selecciona cuándo se aplica esta acción** (_Select when this action is applied_): solo
  **Mensajes entrantes**.
- **Filtro de sobre** → **Solo afectar a destinatarios específicos del sobre** →
  **Coincidencia de patrones** → `(?i)^.*@in\.aitechumbrella\.com$`
  (el campo espera una expresión regular estilo RE2; `(?i)` la hace insensible a mayúsculas). Esto
  confina el catch-all al subdominio; el apex conserva su comportamiento normal de rebote.
- Acción **Modificar mensaje** → **Cambiar destinatario del sobre** → **Reemplazar la dirección de
  correo electrónico completa del destinatario** → `communications@aitechumbrella.com`.
- ⚠️ Dentro de **Modificar mensaje**, marcar **«Agregar encabezado X-Gm-Original-To»**
  (_Add X-Gm-Original-To header_; si no aparece arriba, está en la lista **Avanzado**).
  **Es el paso que sostiene todo el diseño.** Sin él, el destinatario original se pierde al reescribir
  el sobre y la dirección única queda irrecuperable: en un auto-forward el `To:` trae la dirección del
  propio usuario, no la nuestra.
- Tipos de cuenta: **Todas las cuentas inactivas y no reconocidas** (desmarcar _Cuenta de usuario_ y
  _Cuenta de grupo_).
- Hasta 24 h en propagar, normalmente minutos.

### 9.4 Variable en Vercel

`INGEST_ADDRESS_DOMAIN = in.aitechumbrella.com` en **Settings → Environment Variables** (el campo se
llama **Name**, no «Key»), entorno **Production**. **Hay que redesplegar**: las variables nuevas no se
aplican a despliegues existentes. **Deployments → ⋯ → Redeploy → y confirmar otra vez «Redeploy» en la
ventana** (son dos clics; quedarse en el menú no hace nada).

Runbook clic por clic para quien lo ejecute: artifact «Encender la ingesta por correo».

### 9.5 Los dos límites que hay que tener presentes

- **Tope de recepción del buzón: 60/min, 3.600/hora, 86.400/día, y Google dice que no se puede subir.**
  Al pasarse, **rebota** el correo nuevo durante ~24 h; no lo encola. Un buzón para todos es un cuello
  de botella: hay que modelar el volumen antes de crecer, y el plan B documentado es mover la ingesta
  a un webhook (SendGrid Inbound Parse o Mailgun), que además entrega el destinatario real del sobre
  sin reescrituras.
- **Gmail deduplica por `Message-ID` dentro de un mismo buzón.** Si dos usuarios reenvían el MISMO
  mensaje (mismo `Message-ID`), Gmail colapsa uno y se pierde ese evento. Para avisos de banco es
  improbable —son distintos por usuario—, pero es otra razón para el webhook a futuro.

### 9.6 La confirmación de reenvío de Gmail

Cuando el usuario configure el reenvío, Google manda a **su** dirección de ingesta un correo de
`forwarding-noreply@google.com`, asunto `Gmail Forwarding Confirmation (#NNNNNNNN)…`, con un código y
un enlace `https://mail-settings.google.com/mail/vf-<token>`.

**No se puede auto-confirmar desde el servidor:** el enlace abre una pantalla con un botón _Confirm_,
no es un GET idempotente, y no hay endpoint documentado. Lo que sí se puede —y es el siguiente
delta— es **detectar ese correo, resolver al usuario por `X-Gm-Original-To` y mostrarle el enlace
dentro de la app**: «Confirmá el reenvío», un clic, sin salir a buscar nada. Ojo: el enlace gemelo con
prefijo `uf-` **cancela** el reenvío; nunca ofrecer ese.

Caso especial: los usuarios del propio `aitechumbrella.com` no reciben confirmación —Google la omite
cuando el destino es un subdominio del mismo dominio— así que su reenvío queda activo de una.

---

## 10. Estado de cierre (4 de septiembre de 2026)

Revisión completa del carril contra el objetivo del producto: _que el usuario conecte cualquier correo,
que todos los avisos de sus bancos entren solos, y que él solo confirme —y corrija ahí mismo si hace falta—
sin volver a teclear un gasto_. Lo que está, lo que se cerró en esta entrega y lo que sigue faltando.

### 10.1 Lo que ya funciona en producción

| Pieza                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Estado                  | Evidencia                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------- |
| Dirección de ingesta única por cuenta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅ Viva                 | `u2g5zmfs5w2@in.aitechumbrella.com` creada al abrir Configuración; segunda cuenta con la suya                  |
| Subdominio `in.aitechumbrella.com` en Workspace + MX + catch-all con `X-Gm-Original-To` + filtro de sobre por destinatario                                                                                                                                                                                                                                                                                                                                                                                                          | ✅ Configurado          | Capturas del 4 sep; regla `ingesta-catchall` habilitada; `dig MX` responde `1 smtp.google.com`                 |
| `INGEST_ADDRESS_DOMAIN` en Vercel                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅                      | Todos los entornos; despliegue posterior READY                                                                 |
| Poller cada 15 min por GitHub Actions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅ Corre                | Última corrida: `{"ok":true,"ignorados":104,…}` — vivo, autenticado, sin errores                               |
| Aislamiento entre cuentas (los 3 P0)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | ✅ Cerrado y desplegado | PR #717                                                                                                        |
| Parser de avisos de **BAC**: compra con tarjeta (CRC/USD), SINPE recibido/debitado por IBAN, fallback con confianza baja; comercio y fecha de respaldo desde el asunto                                                                                                                                                                                                                                                                                                                                                              | ✅                      | `sources/bac-notification.ts`                                                                                  |
| Plantillas **exactas** calibradas con correos reales (sep 2026): **BCR** (compra en tabla + «Transferencia entre cuentas BCR» a terceros/propia por nombre), **BN** (comprobante de Compra, monto `CRC 27939,00`, ref alfanumérica), **Davivienda/DAVIbank** (prosa `Alertas@davibank.cr`), **Promerica** (compra con etiquetas sin dos puntos y `CRC: 16,915.00`; pago de tarjeta propia). BAC SINPE con la redacción «acreditando la cuenta … un monto de …». Confianza 0.95                                                      | ✅                      | `sources/bcr-notification.ts`, `bn-notification.ts`, `davivienda-notification.ts`, `promerica-notification.ts` |
| Parser **genérico de Costa Rica** (BNCR, BCR, Popular, Scotiabank, Promerica, Davivienda, Lafise, Cathay, BCT, Improsa, Coopenae, Coopeservidores, Coopealianza, Coopeande, Mucap, Grupo Mutual, Caja de ANDE, Prival): identifica el banco por dominio del remitente o marca, y saca monto/moneda, tipo (compra, SINPE Móvil, retiro en cajero, reverso, pago de tarjeta, entre cuentas propias), comercio/contraparte, fecha, referencia y último-4 con anclas comunes. Confianza ≤ 0.85: siempre pasa por «Por revisar». PR #738 | ✅                      | `sources/cr-generic-notification.ts`, `sources/common.ts`                                                      |
| Confirmación / descarte en «Por revisar» (web y móvil) → transacción real con `origin='imported', source='email'`                                                                                                                                                                                                                                                                                                                                                                                                                   | ✅                      | `confirmIngestProposalAction`                                                                                  |
| Categorización automática al confirmar (reglas → historial del hogar → caché de sugerencias)                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅                      | `buildTransactionRow` → `resolveAutoCategory`                                                                  |

### 10.2 Lo que cerró esta entrega (rama `feat/ingesta-cierre`)

- **La confirmación de reenvío de Gmail ya no se pierde.** Se captura, se le muestra al usuario en
  Configuración con el botón «Confirmar el reenvío» y el código. Sin esto, todo usuario de Gmail se
  quedaba a mitad del paso 3 sin saber por qué. (No se puede auto-confirmar: el enlace abre una pantalla
  con botón.)
- **Los correos de bancos sin parser dejan rastro** (`ingest_notices`, con recorte del texto) y el usuario
  ve «tu reenvío funciona: recibimos N avisos que todavía no sabemos leer». Es, además, **la única forma
  de conseguir muestras reales de BNCR, BCR y los demás** para escribir sus parsers.
- **Corregir antes de confirmar**, en la misma fila (web) o en una hoja (móvil): monto, moneda, fecha,
  comercio, nota, sobre y cuenta. Confirmar sin tocar nada sigue siendo un clic. Un movimiento con sobre
  elegido ya no cae al segundo paso de «Por clasificar».
- **Una compra RECHAZADA de BAC ya no se propone como gasto.**
- **Los 104 correos ajenos** que el buzón re-bajaba completos cada 15 minutos se archivan a los 3 días.
- **Modo diagnóstico desde GitHub Actions** (`debug=true`), con los correos más recientes primero: certificar
  un proveedor nuevo es un clic, sin repartir la clave del cron.
- `.env.example` documenta por fin las variables de la ingesta.

### 10.3 Lo que todavía falta, por orden de impacto

1. **Plantillas exactas que faltan.** Ya hay plantilla real para BAC, BCR, BN, Davivienda y Promerica
   (compras con tarjeta; SINPE solo BAC; transferencias solo BCR). Sin muestra real todavía: **Popular,
   Scotiabank, Lafise, Coopenae, Coopeservidores** y el SINPE/transferencia/retiro de BN, BCR, Davivienda
   y Promerica — los cubre la genérica (≤ 0.85) y `ingest_notices` junta lo que no entienda. Regla: cada
   plantilla nueva = un archivo + una línea en `sources/index.ts` ANTES de la genérica, con test de la
   muestra real.
2. **SINPE Móvil por SMS.** Varios bancos (BAC entre ellos) avisan el SINPE Móvil recibido por **SMS**,
   no por correo, así que por este carril solo entra lo que el banco decida mandar por correo. El
   camino para el resto es el oyente de notificaciones en Android (§11).
3. **Etiquetas de tarjeta.** El backend sabe el `last4` (`account_cards`) pero no hay pantalla para
   ponerle nombre («Visa mía», «Adicional de Caro»). Hasta entonces la fila no muestra de cuál tarjeta es.
4. **Transferencias entre cuentas propias.** La genérica las marca `[Entre cuentas propias]` con
   confianza 0.5 para que el usuario decida; lo correcto a futuro es proponerlas como traslado (no como
   gasto ni ingreso) cuando el modelo de transacciones lo soporte.
5. **Reenvío «como adjunto».** Si el usuario reenvía el aviso como archivo adjunto (`.eml`), el cuerpo
   llega vacío y se descarta sin aviso.
6. **Observabilidad.** El resumen de cada corrida vive solo en el log de Actions. Falta persistirlo y
   alertar si `ignorados`/`ambiguos` crecen o si el buzón deja de autenticar.
7. **Límite del buzón único** (86.400/día, y al pasarse rebota). No es problema hoy; es el detonante para
   pasar a un webhook (SendGrid/Mailgun) cuando haya cientos de usuarios activos.

---

## 11. Cómo se llega a «sin clics» — lo que hacen las demás apps y qué aplica en Costa Rica

Investigado el 4 de septiembre de 2026 con fuentes oficiales. La pregunta de fondo: _¿cómo sabe la app cuánto
gana y cuánto gasta el usuario sin que él lo escriba?_ Hay seis mecanismos en el mundo. En Costa Rica, en
2026, tres sirven, dos sirven a medias y uno no existe.

| Mecanismo                                                                                 | Qué captura                                                                        | Fricción                            | Costo                          | Costa Rica hoy                                                                                                                                                                     | Android / iOS              |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **Agregación bancaria** (Belvo, Prometeo, Fintoc, Plaid…)                                 | Todo: tarjeta, SINPE, salario, cajero                                              | 3 toques, luego cero                | Belvo desde **US$1.000/mes**   | **No existe.** Ningún agregador cubre un banco tico; 0 bancos con API pública; la regulación está «en planificación» (BCCR/SUGEF) y la Ley Marco Fintech no trae datos abiertos    | —                          |
| **Correo** (lo que ya tenemos)                                                            | Lo que el banco mande por correo: compras con tarjeta en BAC/BCR, SINPE por IBAN…  | 3–6 clics una vez                   | ≈ $0                           | **La mejor opción hoy.** Monedly (competidor tico, US$9,99/mes) corre exactamente esto                                                                                             | ✔ / ✔                      |
| **Escuchar las notificaciones push del teléfono** (Android `NotificationListenerService`) | Lo que la app del banco notifique: compras, SINPE recibido/enviado, en tiempo real | 2–3 toques una vez                  | Solo ingeniería (~2–3 semanas) | **El salto más grande hacia «cero clics»** para la mayoría Android de CR. Google lo permite con consentimiento explícito y divulgación; parsear en el teléfono y subir solo campos | ✔ / **✘ imposible en iOS** |
| **Leer SMS** (Android)                                                                    | BAC avisa SINPE Móvil por SMS; BN Alertas es solo SMS (y solo Kolbi)               | 2 toques + revisión de Google Play  | Ingeniería + riesgo de rechazo | A medias: Play lo permite para «gestión de presupuesto por SMS» pero la revisión es discrecional y ha habido bajas                                                                 | ✔ con riesgo / ✘           |
| **Importar estado de cuenta** (CSV/XLS/PDF)                                               | Todo, una vez al mes                                                               | 3–4 toques al mes                   | OCR centavos por página        | BAC exporta CSV/XLS/QIF/MT940; BCR Excel/PDF; Popular solo PDF al correo. Como «compartir con CARTERA+» desde la app del banco es un toque                                         | ✔ / ✔                      |
| **Inferir lo recurrente** (salario, alquiler, suscripciones)                              | Ingresos y gastos fijos, por patrón                                                | 1 toque: «¿ya te llegó el salario?» | Solo ingeniería                | Universal. Es lo que hacen Monarch, Rocket Money y Copilot                                                                                                                         | ✔ / ✔                      |

Lo que **no** sirve, para no perder tiempo: Apple Wallet y Google Wallet no exponen transacciones a
terceros (FinanceKit es solo Apple Card en EE. UU./Reino Unido); las APIs de «card-linked offers» (Fidel,
Visa/Mastercard) solo dan compras en comercios inscritos y no están en CR; el scraping con credenciales del
usuario viola el contrato de banca electrónica de todos los bancos ticos y se rompe con cada OTP.

Y en iOS, el único camino en tiempo real son los **Atajos** (automatización «Transacción» al pagar con Apple
Pay, y «Mensaje» al recibir un SMS con «SINPE»): funciona, pero el usuario tiene que instalarlos y son
frágiles. Se ofrecen como opción avanzada, no como base.

### 11.1 La pila recomendada para Costa Rica, en orden de retorno

**Ahora (este trimestre).** (1) El correo como columna vertebral: ya está; sumar **Microsoft OAuth**, que
es el único «un clic» gratis y sin auditoría, y dejar Gmail OAuth para cuando la cuota de usuarios de Gmail
justifique la CASA anual. (2) **Inferencia de recurrentes** con tarjeta de confirmación de un toque:
«¿Ya recibiste tu salario de ₡X?» — llena justo los huecos que el correo deja (salario, alquiler, cuotas).
(3) Un **asistente por banco para activar alertas**: en BAC, las de transferencias y cajero; en BN, las
alertas SMS; en BCR, las compras por correo. Sube la tasa de acierto de todos los demás canales gratis.

**Siguiente trimestre.** (4) **Escucha de notificaciones en Android** con un plugin propio de Capacitor
(el único publicado está archivado y no funciona), parseo en el dispositivo, pantalla de consentimiento
explícita, activación por banco. Captura SINPE y tarjeta al instante sin depender de SMS ni correo.
(5) **Importar estado de cuenta** como destino de «Compartir» desde la app del banco: BAC CSV/XLS primero.
Es la red de seguridad mensual que garantiza completitud.

**Después.** (6) Atajos de iOS como opción avanzada. (7) Permiso de SMS en Android solo si la escucha de
notificaciones no cubre a los usuarios de BN. (8) Agregación bancaria: no existe; reevaluar cuando
Prometeo o Belvo anuncien CR o el BCCR publique una hoja de ruta.

### 11.2 Los cinco tropiezos que hay que evitar

1. **Prometer «conectá tu banco» en 2026.** No hay agregador para CR. Lo que sí se puede prometer:
   «conectá tu correo y tus avisos entran solos».
2. **Subir notificaciones crudas al servidor.** Hace indefendible el formulario de seguridad de datos de
   Google Play. Parsear en el teléfono; subir solo `{banco, monto, moneda, comercio, fecha, tipo}`.
3. **Apoyarse en SMS.** BN Alertas es solo SMS y solo Kolbi; BAC no deja activar avisos de compra por
   SMS desde Banca en Línea; el permiso de Play es discrecional. Es un refuerzo para BN, nunca la base.
4. **Plantillas de banco sin telemetría.** Los correos y las notificaciones cambian de redacción sin aviso.
   Sin métrica de acierto por banco y plantillas actualizables sin desplegar, se pierden semanas de datos
   antes de que alguien lo note. El paso de «confirmar con un toque» es justamente lo que hace que el
   usuario avise cuando algo se leyó mal: no quitarlo.
5. **Leer el cambio de SINPE de junio de 2026 al revés.** El BCCR empuja de SMS a canales autenticados
   (₡100.000 vs ₡500.000 diarios): el SINPE va a llegar cada vez más como **push de la app del banco** y
   menos como SMS. Eso favorece la escucha de notificaciones y el correo, y erosiona el SMS.
