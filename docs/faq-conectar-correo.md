# Conectar tu correo — copy para la landing y las FAQs

Texto listo para la landing y para `/faqs` (`src/components/marketing/v3/faqs.tsx`, sección «Registrar
movimientos» y «Privacidad»). Voseo, sin tecnicismos, sin prometer lo que no existe: **no hay conexión
directa con bancos en Costa Rica**, el carril es el correo. La guía paso a paso vive en
`docs/guia-conectar-correo.md` y en el artefacto «Conectar tu correo del banco».

---

## Para la landing (dos frases)

**Tus gastos se registran solos.** Tu banco ya te avisa por correo cada vez que pasás la tarjeta.
Conectá ese correo a CARTERA+ una sola vez, y cada aviso se convierte en un movimiento listo para
confirmar con un toque. Sin teclear nada, y sin darle a nadie la clave del banco.

---

## FAQs — en el orden en que la gente las hace

**¿Cómo registra CARTERA+ mis gastos sin que yo los escriba?**
Tu banco te manda un correo por cada compra, transferencia o SINPE. Vos hacés que tu correo reenvíe
esos avisos a **tu dirección de ingesta** de CARTERA+ (una dirección de correo tuya y solo tuya, que
copiás desde Configuración), y nosotros leemos el comercio, el monto, la fecha y la tarjeta. El
movimiento te espera en «Por revisar»: confirmás con un toque, o corregís lo que haga falta ahí mismo.

**¿Tengo que darles la clave del banco?**
No, y no es una política: no existe el campo. La app nunca entra a tu banco. Solo lee los avisos que el
banco _ya te manda a vos_.

**¿Con qué correos funciona?**
Con todos: Gmail, Outlook y Hotmail, iCloud, Yahoo y los de empresa. En Gmail, Outlook e iCloud el
reenvío automático es gratis. Yahoo cobra el reenvío automático, pero podés reenviar los avisos a mano
desde el celular con un toque y funciona igual.

**¿Cuánto tarda configurarlo?**
Entre 5 y 10 minutos, una sola vez. Para Gmail hace falta una computadora, porque Google no deja
configurar reenvíos desde la app del celular. La guía paso a paso te lleva clic por clic.

**¿Con qué bancos funciona?**
Con **BAC, BCR, Banco Nacional, Davivienda y Promerica** la lectura de compras con tarjeta es completa:
comercio, monto, moneda, fecha, tarjeta (y SINPE en BAC, transferencias en BCR, pago de tarjeta en
Promerica). Para **Popular, Scotiabank, Lafise, Coopenae, Coopeservidores** y los demás bancos y
cooperativas del país hacemos una lectura general (monto, si es gasto o ingreso, comercio, fecha) que
vos revisás antes de confirmar, y que se vuelve exacta con el primer aviso real de cada banco. Si un
aviso no lo entendemos, no se pierde: se guarda, te lo decimos en Configuración y aparece solo cuando lo
sepamos leer.

**Mi banco no me manda correos, solo SMS. ¿Qué hago?**
Encendé los avisos por correo desde la app o la banca en línea de tu banco: buscá **Alertas** o
**Notificaciones**, marcá **correo electrónico** y poné el monto mínimo en cero. Todos los bancos de
Costa Rica lo tienen; casi siempre viene apagado. Si no lo encontrás, una llamada al banco lo activa.

**Gmail me pidió confirmar la dirección de reenvío. ¿Dónde está el código?**
Google manda esa confirmación a tu dirección de ingesta, así que nos llega a nosotros. Entrá a
Configuración → Correos del banco: ahí te espera el botón **«Confirmar el reenvío»**. Un clic y listo.
Hasta que no confirmés, Gmail no reenvía nada.

**Configuré todo y no llega nada.**
Revisá en este orden: (1) que el aviso del banco te haya llegado a vos; (2) que la dirección de ingesta
esté copiada exacta; (3) en Gmail, que hayás confirmado el reenvío y marcado «No enviarlo nunca a
Spam» (Gmail no reenvía spam); (4) tocá «Buscar avisos ahora» en Configuración → Correos del banco (o esperá: el buzón se revisa solo cada 5 minutos).
Si en Configuración dice «recibimos N avisos que todavía no sabemos leer», tu reenvío funciona.

**¿Van a leer todo mi correo?**
No. Solo nos llega lo que vos reenviás. Por eso recomendamos un filtro **por remitente del banco** en
vez del reenvío total: así ni siquiera pasa por nosotros nada que no sea un aviso de movimiento.

**¿Cómo saben que un movimiento es mío y no de otro usuario?**
Porque tu dirección de ingesta es única e irrepetible. Lo que llega a ella entra a tu cuenta —o a la de
tu familia, si compartís una— y a ninguna otra. Un correo que no llegue a una dirección conocida se
ignora.

**¿Se registra algo sin que yo lo apruebe?**
No. Todo llega como propuesta y espera tu confirmación. Vos decidís qué entra a tus números.

**¿Y si el banco puso mal el nombre del comercio, o la fecha?**
Lo corregís antes de confirmar, en la misma fila: monto, moneda, fecha, comercio, nota, sobre y cuenta.

**Ya lo había registrado a mano (o por recibo, o por chat). ¿Se duplica?**
No. Si el aviso del banco se parece a un movimiento que ya tenés (mismo monto, moneda, fecha o un
día de diferencia y comercio parecido), Por revisar te lo dice antes de confirmar y te ofrece
**«Sí, es el mismo»**: se unen en un solo movimiento, que gana la referencia del banco y la tarjeta.
Si registrás algo a mano y el aviso ya estaba esperando, se une solo y te lo avisa.

**¿Cómo cargo los movimientos de antes (el historial)?**
El reenvío automático solo aplica a correos nuevos. En Gmail buscá los avisos del banco con una
fecha (`from:notificacionbac@baccredomatic.cr after:2026/08/01`), seleccioná todos, ⋮ → **Reenviar
como archivo adjunto**, a tu dirección de ingesta. Es un solo correo con todos los avisos adentro; los
leemos uno por uno. Después, en Por revisar, filtrá por fecha, marcá «Todos» y **Registrar**. Un lote
admite hasta 200 avisos por correo.

**¿Hay más de una forma de conectar el correo?**
No: una sola, la dirección de ingesta. No hay códigos ni correos que registrar.

**¿Y si reenvío el mismo aviso dos veces?**
No se duplica. Reconocemos el movimiento por su referencia y lo contamos una sola vez.

**¿Una compra rechazada se registra?**
No. Si el aviso dice que la transacción fue rechazada o declinada, no se propone nada.

**¿Por qué no me conecto directo al banco, como en otras apps?**
Porque en Costa Rica todavía no existe esa conexión: ningún banco tico ofrece una API abierta y la
regulación está en planificación. Las apps que la ofrecen operan en México, Brasil o Colombia. El correo
es hoy la forma más segura y completa de traer tus movimientos sin darle tu contraseña del banco a nadie.

**¿Puedo apagarlo?**
Cuando quieras. Borrá el reenvío o el filtro en tu proveedor de correo. Lo que ya registraste se queda
con vos.

**¿Y las compras en efectivo, o lo que el banco no avisa por correo?**
Para eso está la foto del recibo y el registro por chat. Y estamos trabajando para que la app del
celular lea también las notificaciones del banco, para que ni eso haya que teclear.
