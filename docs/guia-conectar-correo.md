# Conectá tu correo del banco — guía paso a paso (para todos)

Tu banco ya te manda un correo cada vez que pasás la tarjeta, te llega un SINPE o hacés una
transferencia. CARTERA+ lee ese correo y arma el movimiento por vos: comercio, monto, fecha y con cuál
tarjeta fue. **Vos solo confirmás con un toque.** Nada entra a tus números sin tu visto bueno.

Se configura **una sola vez**, toma entre 5 y 10 minutos, y no hay que darle a nadie la clave del
banco: no existe ese campo en la app.

---

## Antes de empezar: las tres cosas que necesitás

| #   | Qué                                                                                                                                                               | Por qué                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | **Que tu banco te avise por correo.** Buscá en tu bandeja un correo del banco de una compra reciente. Si no hay ninguno, andá al **Paso 0**.                      | Sin aviso no hay nada que leer.                                      |
| 2   | **Tu dirección de ingesta** (Paso 1). Es una dirección de correo que CARTERA+ te da, tuya y de nadie más.                                                         | Es lo que hace que tus avisos entren a _tu_ cuenta y a ninguna otra. |
| 3   | **Una computadora si usás Gmail.** Google no deja configurar reenvíos desde la app del celular. Outlook, iCloud y Yahoo se pueden desde el navegador del celular. | Es solo para configurarlo; después funciona solo.                    |

---

## Paso 0 · Activá los avisos por correo en tu banco (si todavía no te llegan)

Todos los bancos de Costa Rica pueden avisarte por correo; casi siempre viene apagado o solo por SMS.
Se enciende desde la app o la banca en línea del banco, en una sección que se llama **Alertas**,
**Notificaciones** o **Avisos**. Buscá ahí la opción de **correo electrónico** y marcá **todas** las que
te dejen: compras con tarjeta, retiros, transferencias, SINPE recibido y enviado. Ponete el monto mínimo
en **0** (o el más bajo que te permita) para que avise de todo.

| Banco                                                         | Dónde está (nombre aproximado del menú)                                  | Cómo se ve el remitente                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| **BAC Credomatic**                                            | Banca en línea → Configuración → **Notificaciones** → Correo electrónico | `notificacionbac@baccredomatic.cr`, asunto «Notificación de transacción …»    |
| **Banco Nacional (BN)**                                       | BN Internet Banking / BN Móvil → **Alertas y notificaciones**            | remitente `@bncr.fi.cr`                                                       |
| **BCR**                                                       | Bancobcr.com / BCR Móvil → Perfil → **Alertas**                          | remitente `@bancobcr.com`                                                     |
| **Banco Popular**                                             | Banca en línea / BPDC Móvil → **Notificaciones**                         | remitente `@bancopopular.fi.cr`                                               |
| **Davivienda**                                                | Banca en Línea → Preferencias → **Alertas**                              | `Alertas@davibank.cr`, asunto «Alerta Transacción Tarjeta de Crédito Titular» |
| **Promerica**                                                 | Promerica Móvil / Banca en línea → **Notificaciones**                    | asunto «¡Tu transacción fue realizada con éxito!»                             |
| **Scotiabank, Lafise, Coopenae, Coopeservidores y los demás** | Perfil o Configuración → **Alertas** / **Notificaciones**                | el remitente aparece en cualquier aviso que ya tengas                         |

> Si el menú se llama distinto, buscá la palabra **alerta**. Si no lo encontrás, llamá al banco y pedí
> «activar las alertas de transacciones por correo electrónico»: es un trámite de dos minutos.

---

## Paso 1 · Copiá tu dirección de ingesta

1. Abrí CARTERA+ y entrá a **Configuración → Correos del banco**.
2. Vas a ver **tu dirección de ingesta**. Se ve así: `u2g5zmfs5w2@in.aitechumbrella.com`.
3. Tocá **Copiar**.

> **No la teclees a mano: copiala.** Un carácter cambiado manda tus avisos a un buzón que no existe y
> nadie se enteraría. **No la compartas:** cualquier correo que llegue a esa dirección entra a tu cuenta.

---

## Paso 2 · Decile a tu correo que reenvíe los avisos del banco

Elegí tu proveedor y seguí los clics tal cual. En todos los casos vas a reenviar **a tu dirección de
ingesta**, la que copiaste en el Paso 1.

### A · Gmail (personal o de trabajo) — en la computadora

**Parte 1: agregar la dirección (2 minutos)**

1. Entrá a [gmail.com](https://gmail.com) en la computadora.
2. Arriba a la derecha, tocá el **engranaje ⚙** → **Ver toda la configuración**.
3. Abrí la pestaña **Reenvío y correo POP/IMAP**.
4. Tocá **Agregar una dirección de reenvío**.
5. Pegá tu dirección de ingesta → **Siguiente** → **Continuar** → **Aceptar**.
6. Gmail te dice que mandó un correo de confirmación a esa dirección. **Ese correo nos llega a nosotros**
   (la dirección es tuya dentro de CARTERA+), así que seguí en la Parte 2.

**Parte 2: confirmar desde CARTERA+ (1 minuto)**

7. Volvé a CARTERA+ → **Configuración → Correos del banco**. En menos de 15 minutos aparece una tarjeta
   que dice **«Gmail necesita que confirmés el reenvío»** con un botón **Confirmar el reenvío**.
8. Tocá el botón. Se abre una página de Google: tocá **Confirmar**.
9. Volvé a la pestaña de Gmail y **recargá la página** (F5).

**Parte 3: que se reenvíen solo los avisos del banco, no todo tu correo (2 minutos)**

10. En Gmail, abrí un correo de tu banco (uno de una compra).
11. Arriba a la derecha del correo, tocá los tres puntos **⋮** → **Filtrar mensajes como estos**.
12. Se abre un cuadro con el remitente ya puesto en **De**. Tocá **Crear filtro**.
13. Marcá **dos** casillas: **Reenviarlo a** (y elegí tu dirección de ingesta en la lista) y
    **No enviarlo nunca a Spam**.
14. Tocá **Crear filtro**. Listo.

> ¿Por qué la casilla de Spam? Porque Gmail **no reenvía nada** que haya marcado como spam, y los avisos
> de banco a veces caen ahí. Con esa casilla te asegurás de que siempre pasen.
>
> ¿Tenés más de un banco? Repetí la Parte 3 con un correo de cada banco.
>
> **Si no ves la pestaña «Reenvío»** y tu Gmail es de la empresa, el administrador lo tiene apagado.
> Pedile que habilite el reenvío automático, o usá el **reenvío manual** (opción E).

### B · Outlook.com / Hotmail / Live / correo de Microsoft 365

1. Entrá a [outlook.com](https://outlook.com) (sirve en el celular, desde el navegador).
2. **Engranaje ⚙** → **Correo** → **Reglas** → **Agregar nueva regla**.
3. Nombre: `Avisos del banco`.
4. **Agregar una condición** → **De** → escribí el correo desde el que te escribe tu banco (copialo
   de un aviso que ya tengas; para BAC es `notificacionbac@baccredomatic.cr`).
5. **Agregar una acción** → **Redirigir a** → pegá tu dirección de ingesta.
   ⚠ Elegí **Redirigir a**, no «Reenviar a»: si lo reenviás, llega como si lo mandaras vos y se
   pierde el dato de qué banco lo envió.
6. **Guardar**.

> Outlook no verifica la dirección de destino: revisá que quedó bien pegada antes de guardar.
>
> **Si al probar te rebota** un mensaje con `5.7.520 … external forwarding`, tu correo es de una empresa
> con Microsoft 365 y el reenvío externo está bloqueado. Lo tiene que habilitar el administrador; mientras
> tanto, usá el reenvío manual (opción E).

### C · iCloud (correo de Apple)

1. Entrá a [icloud.com/mail](https://www.icloud.com/mail) en la computadora.
2. **Engranaje ⚙** → **Ajustes** → pestaña **Reglas** → **Añadir regla**.
3. **Si un mensaje** → **es de** → escribí el correo de tu banco.
4. **Entonces** → **Reenviar a** → pegá tu dirección de ingesta.
5. **NO** marques «Eliminar después de reenviar»: perderías tu propia copia. → **Aceptar**.

> Las reglas de iCloud pueden tardar hasta 15 minutos en empezar a aplicarse.

### D · Yahoo

Yahoo solo permite reenvío automático con **Yahoo Mail Plus** (de pago). Si lo tenés: **Ajustes → Más
ajustes → Buzones → tu cuenta → Reenvío** → pegá tu dirección → **Verificar**. Si no lo tenés, usá el
reenvío manual (opción E): funciona igual de bien, solo que lo hacés vos con un toque.

### E · Reenvío manual — funciona con cualquier correo, desde el celular

1. Abrí el aviso del banco.
2. Tocá **Reenviar**.
3. Pegá tu dirección de ingesta en «Para» y enviá.

Da igual desde cuál de tus correos lo mandes: lo que identifica tu cuenta es la dirección **a la que
llega**, no desde dónde sale. Es también la forma de cargar avisos **viejos**: el reenvío automático solo
aplica a correos nuevos.

---

## Paso 3 · Probalo

1. Reenviá **a mano** (opción E) un aviso del banco que ya tengas en la bandeja.
2. Esperá hasta 15 minutos (revisamos el buzón cada 15).
3. Abrí CARTERA+ → **Transacciones → Por revisar**. Ahí debería estar el movimiento.

Si en Configuración → Correos del banco aparece «recibimos N avisos que todavía no sabemos leer», tu
reenvío **funciona**: el problema es solo el formato de ese banco, y ya lo tenemos en la cola.

---

## Paso 4 · Confirmá tu primer movimiento

En **Por revisar** cada aviso llega como propuesta:

- **Confirmar** — un toque, y entra a tus números.
- **Editar** — si el banco puso mal el comercio o la fecha, o querés dejarlo en su **sobre** o cambiarle
  el monto, la moneda, la cuenta o ponerle una nota: se corrige ahí mismo y después confirmás.
- **Descartar** — si no es tuyo o no querés registrarlo.

Un aviso reenviado dos veces **no se duplica**: lo reconocemos por su referencia.

---

## Qué se lee de cada banco (hoy)

| Banco                                                                                                                                                                                                                                               | Qué entiende CARTERA+                                                                                                                                                                                                                             | Qué vas a ver                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **BAC, BCR, Banco Nacional, Davivienda, Promerica**                                                                                                                                                                                                 | Compras con tarjeta con comercio, monto, moneda, fecha, referencia y últimos 4 de la tarjeta. Además: SINPE recibido y enviado (BAC), transferencias entre cuentas (BCR), pago de tarjeta (Promerica). Las compras **rechazadas** no se proponen. | Propuesta completa; casi siempre solo hay que confirmar.                                                                             |
| **Popular, Scotiabank, Lafise, Cathay, BCT, Improsa, Coopenae, Coopeservidores, Coopealianza, Coopeande, Mucap, Grupo Mutual, Caja de ANDE, Prival** — y los avisos de SINPE, retiros o transferencias de los bancos de arriba que todavía no vimos | Lectura general: monto, moneda, si es gasto o ingreso, comercio o contraparte, fecha, referencia.                                                                                                                                                 | Propuesta para **revisar**: dale una mirada antes de confirmar. Con el primer aviso real de cada banco, la lectura se vuelve exacta. |
| Otro banco o formato que no reconocemos                                                                                                                                                                                                             | Se guarda el aviso y te lo decimos en Configuración.                                                                                                                                                                                              | Nada que hacer: en cuanto lo sepamos leer, aparece solo.                                                                             |

---

## Si no llega nada — revisá en este orden

1. **¿El banco te mandó el correo?** Tiene que estar en tu bandeja. Si no, volvé al **Paso 0**.
2. **¿Copiaste bien la dirección?** Configuración → Correos del banco y compará carácter por carácter
   con la que pusiste en tu correo. Es la causa número uno.
3. **¿Gmail sigue pidiendo confirmar?** En Configuración → Correos del banco está el botón. Hasta que no
   confirmés, Gmail no reenvía nada.
4. **¿El aviso cayó en Spam?** Gmail no reenvía spam. Marcá **No enviarlo nunca a Spam** en el filtro
   (Paso 2, parte 3).
5. **¿Es correo de la empresa?** Google Workspace y Microsoft 365 pueden tener el reenvío bloqueado por
   el administrador. Mientras tanto, reenvío manual.
6. **¿Pasaron 15 minutos?** Revisamos el buzón cada 15 minutos; no es instantáneo.

Si nada de eso lo explica, escribinos contándonos el banco y la hora a la que reenviaste, y lo revisamos.

---

## Preguntas que todos hacen

**¿Van a leer todo mi correo?**
No. Solo nos llega lo que vos reenviás. Por eso el filtro **por remitente del banco**: así ni siquiera
pasa por nosotros nada que no sea un aviso de movimiento.

**¿Otro usuario puede ver mis gastos?**
No. Tu dirección de ingesta es única e irrepetible. Lo que llega a ella entra a tu cuenta (o a la de tu
familia, si compartís una) y a ninguna otra. Un correo que no llegue a una dirección conocida se ignora.

**¿Se registra algo sin que yo lo apruebe?**
No. Todo llega como propuesta y espera tu confirmación.

**¿Y las compras en efectivo, o lo que el banco avisa solo por SMS?**
Para eso está la foto del recibo y el registro por chat («gasté ₡4.500 en el taxi»). Y estamos
trabajando para que la app del celular lea también las notificaciones del banco.

**¿Puedo apagarlo?**
Cuando quieras: borrá el filtro o la regla en tu correo. Lo que ya registraste se queda con vos.

**¿Puedo cambiar mi dirección de ingesta?**
Sí. Si creés que se filtró, escribinos y te damos una nueva: la vieja deja de funcionar en el acto y no
se le asigna a nadie más.
