import Link from "next/link";
import { LegalShell } from "@/components/marketing/v3/legal-shell";
import { CORREO_PRIVACIDAD } from "@/lib/legal/version";

export const metadata = {
  title: "Política de privacidad — CARTERA+",
  description:
    "Qué datos recoge CARTERA+, para qué, con quién se comparten, cuánto se conservan y cómo ejercés tus derechos. Escrita a partir de lo que la aplicación hace de verdad.",
};

/**
 * Página pública (ver PUBLIC_PREFIXES en lib/supabase/middleware.ts). Tiene que abrir
 * SIN sesión: Play Console y App Store la revisan desde fuera de la app.
 *
 * Regla al editarla: cada afirmación tiene que corresponder a algo verificable en el
 * repositorio. Una política que promete de más es peor que una corta — lo que no se
 * cumple es exactamente lo que una autoridad revisa primero.
 */
export default function PrivacidadPage() {
  return (
    <LegalShell titulo="Política de privacidad">
      <p>
        Esta política explica qué información recoge <strong>CARTERA+</strong>, para qué la usa, con
        quién la comparte y qué podés hacer con ella. Está escrita a partir de lo que la aplicación
        hace hoy, no de lo que nos gustaría que hiciera.
      </p>

      <h2>1. Quién es responsable</h2>
      <p>
        El responsable del tratamiento es <span className="lg-pendiente">[Razón social]</span>, con
        domicilio en Costa Rica. Para cualquier consulta sobre tus datos, escribinos a{" "}
        <a href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>.
      </p>
      <p>
        Tratamos tus datos conforme a la <strong>Ley N.º 8968</strong> de Protección de la Persona
        frente al tratamiento de sus datos personales y su reglamento.
      </p>

      <h2>2. Qué datos recogemos</h2>

      <h3>2.1 Cuenta</h3>
      <p>
        Tu correo electrónico y tu nombre. Si te registrás con correo y contraseña, la contraseña se
        guarda cifrada y nunca en texto plano: nosotros no podemos leerla. También podés entrar con{" "}
        <strong>Google</strong>, y en ese caso recibimos de Google tu correo y tu nombre.
      </p>

      <h3>2.2 Perfil financiero personal</h3>
      <p>
        Lo que respondés en el cuestionario: edad, país, estado civil, cuántas personas dependen de
        vos, etapa de vida y tu preferencia de riesgo (seguridad, equilibrio o crecimiento), junto
        con las respuestas de comportamiento que usa el diagnóstico.
      </p>

      <h3>2.3 Datos financieros que ingresás</h3>
      <p>
        Ingresos, gastos, transacciones, presupuesto por sobres, deudas, inversiones, seguros,
        activos, metas y las cuentas con las que operás. Si registrás una tarjeta para la ingesta
        por correo, guardamos únicamente sus <strong>últimos cuatro dígitos</strong>, que sirven
        para reconocer de qué tarjeta habla cada aviso.
      </p>
      <p>
        <strong>No pedimos ni guardamos credenciales bancarias.</strong> No hay usuario, clave ni
        conexión con tu banco: no existe el campo ni la tabla.
      </p>

      <h3>2.4 Contenido que generás</h3>
      <ul>
        <li>
          Tus conversaciones con <strong>My Agent C+</strong>.
        </li>
        <li>
          La memoria del asesor: hechos que el asistente anota de lo que le contás para no volver a
          preguntártelos. Puede incluir cosas personales que mencionés al pasar — trabajo, familia,
          planes.
        </li>
        <li>Las fotos de recibos que escaneás.</li>
        <li>
          Los correos de tu banco o comercio que reenviés a tu dirección de ingesta, y las
          propuestas de gasto que se extraen de ellos.
        </li>
      </ul>

      <h3>2.5 Preferencias</h3>
      <p>Moneda principal y de visualización, zona horaria, tema y preferencias de avisos.</p>

      <h3>2.6 Diagnóstico</h3>
      <p>
        Informes de error para arreglar fallas. Están configurados sin datos personales, y antes de
        enviarse se depuran las direcciones de correo y las secuencias largas de dígitos.{" "}
        <strong>No grabamos tu pantalla</strong>: en una aplicación financiera eso filmaría montos,
        saldos y nombres.
      </p>

      <h2>3. Para qué usamos cada dato</h2>
      <div className="lg-tabla-wrap">
        <table className="lg-tabla">
          <thead>
            <tr>
              <th>Finalidad</th>
              <th>Base que la legitima</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Prestarte el servicio: guardar y mostrar tu información financiera</td>
              <td>Ejecución del contrato</td>
            </tr>
            <tr>
              <td>Responder con My Agent C+ y recordar lo que le contás</td>
              <td>Tu consentimiento</td>
            </tr>
            <tr>
              <td>Leer los correos que reenviás para proponerte gastos</td>
              <td>Tu consentimiento</td>
            </tr>
            <tr>
              <td>Compartir información dentro de un hogar</td>
              <td>Consentimiento de cada integrante</td>
            </tr>
            <tr>
              <td>Enviarte avisos y resúmenes</td>
              <td>Tus preferencias de notificación</td>
            </tr>
            <tr>
              <td>Seguridad, prevención de abuso y límites de uso</td>
              <td>Interés legítimo</td>
            </tr>
            <tr>
              <td>Cobrar la suscripción y emitir comprobantes</td>
              <td>Contrato y obligación legal</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>4. Con quién compartimos</h2>
      <p>
        No vendemos tus datos ni los cedemos con fines publicitarios. Trabajamos con proveedores que
        los tratan por cuenta nuestra y solo para lo que se indica:
      </p>
      <div className="lg-tabla-wrap">
        <table className="lg-tabla">
          <thead>
            <tr>
              <th>Proveedor</th>
              <th>Para qué</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>Base de datos y autenticación: es donde vive tu información</td>
            </tr>
            <tr>
              <td>Google (Gemini)</td>
              <td>
                Procesa el contexto de tu situación financiera, tus mensajes del chat y las imágenes
                de recibos para poder responderte
              </td>
            </tr>
            <tr>
              <td>Stripe</td>
              <td>
                Cobro de la suscripción. Los datos de tu tarjeta se entregan directamente a Stripe y{" "}
                <strong>nunca pasan por nuestros servidores</strong>
              </td>
            </tr>
            <tr>
              <td>Sentry</td>
              <td>Diagnóstico de errores. Sin datos personales y sin grabación de pantalla</td>
            </tr>
            <tr>
              <td>Upstash</td>
              <td>Control de límites de uso</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>Alojamiento de la aplicación</td>
            </tr>
            <tr>
              <td>Google Workspace</td>
              <td>
                Buzón que recibe los correos que reenviás, y envío de los correos que te mandamos
              </td>
            </tr>
            <tr>
              <td>Proveedores de precios de mercado</td>
              <td>
                Cotizaciones de acciones y cripto. Solo reciben el <em>símbolo</em> del instrumento:
                nunca tu identidad, tus montos ni tu cartera
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        Sobre Gemini: según los términos de la API de pago de Google, el contenido enviado no se usa
        para entrenar sus modelos.{" "}
        <span className="lg-pendiente">[confirmar nivel de API contratado]</span>
      </p>
      <p>
        <strong>Transferencias internacionales.</strong> Estos proveedores operan desde Estados
        Unidos, así que tus datos se procesan fuera de Costa Rica bajo las salvaguardas
        contractuales de cada uno.
      </p>

      <h2>5. El asistente My Agent C+</h2>
      <p>
        Cuando le escribís, junto a tu mensaje se envía un resumen de tu situación financiera
        —cifras de flujo, deudas, metas, patrimonio y cartera— para que la respuesta tenga sentido
        en tu caso y no sea un consejo genérico.
      </p>
      <p>
        <strong>El asistente nunca ejecuta nada por su cuenta.</strong> Cuando propone registrar un
        gasto o un movimiento, aparece una tarjeta editable y no se escribe nada hasta que vos
        confirmás.
      </p>
      <p>
        <strong>Conversaciones:</strong> se conservan <strong>7 días</strong> y después se borran
        automáticamente.
      </p>
      <p>
        <strong>Memoria del asesor:</strong> podés verla, editarla, borrar cada hecho por separado o
        vaciarla entera desde Configuración. Hoy no existe un interruptor para apagarla: si no
        querés que se registre nada, vaciala y escribinos a{" "}
        <a href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>.
      </p>

      <h2>6. Ingesta por correo</h2>
      <p>
        Podés reenviar los avisos de tu banco o comercio a una dirección personal que la aplicación
        genera para vos. Esos mensajes se guardan y se convierten en propuestas de gasto que vos
        revisás y aceptás o descartás: <strong>nada se registra solo</strong>.
      </p>
      <p>
        <strong>Retención:</strong>{" "}
        <span className="lg-pendiente">[X días — pendiente de fijar]</span>. Hoy los mensajes y sus
        propuestas se conservan hasta que los resolvés o hasta que borrás tu cuenta.
      </p>
      <p>
        La dirección se puede revocar, pero hoy esa acción no está disponible desde la aplicación:
        pedíla a <a href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a> y dejará de
        funcionar. Si nunca reenviás nada, esa dirección no recibe ni guarda nada.
      </p>

      <h2>7. Hogar compartido</h2>
      <p>
        Si formás parte de un hogar, sus integrantes ven la información financiera compartida:
        movimientos, presupuesto, deudas, metas y patrimonio del hogar. Tus conversaciones con My
        Agent C+ y la memoria del asesor <strong>no</strong> se comparten.
      </p>
      <p>
        Si salís de un hogar o borrás tu cuenta siendo integrante, tus registros se reasignan a la
        persona titular, porque forman parte de las cuentas compartidas. Si quien borra la cuenta es
        la titular, el hogar se disuelve y sus datos se eliminan.
      </p>

      <h2>8. Cuánto conservamos cada cosa</h2>
      <div className="lg-tabla-wrap">
        <table className="lg-tabla">
          <thead>
            <tr>
              <th>Dato</th>
              <th>Cuánto</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Cuenta, perfil y datos financieros</td>
              <td>Mientras tu cuenta exista</td>
            </tr>
            <tr>
              <td>Conversaciones con My Agent C+</td>
              <td>7 días</td>
            </tr>
            <tr>
              <td>Memoria del asesor</td>
              <td>Hasta que la borres</td>
            </tr>
            <tr>
              <td>Correos reenviados y sus propuestas</td>
              <td>
                <span className="lg-pendiente">[X días]</span> — hoy, hasta resolverlos o borrar la
                cuenta
              </td>
            </tr>
            <tr>
              <td>Registros de auditoría</td>
              <td>Se eliminan al borrar la cuenta</td>
            </tr>
            <tr>
              <td>Eventos de seguridad</td>
              <td>Se conservan anonimizados, sin vínculo con vos</td>
            </tr>
            <tr>
              <td>Facturas y comprobantes de pago</td>
              <td>
                Quedan en Stripe por el plazo que exige la normativa contable, aunque borres la
                cuenta
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>9. Tus derechos</h2>
      <p>
        Tenés derecho de acceso, rectificación, cancelación y oposición, y a llevarte tu
        información. Buena parte se ejerce sola desde la aplicación:
      </p>
      <ul>
        <li>
          <strong>Acceso y portabilidad:</strong> «Descargar mis datos» en Ajustes te entrega tu
          información en un archivo.
        </li>
        <li>
          <strong>Rectificación:</strong> podés editar cualquier dato donde lo registraste.
        </li>
        <li>
          <strong>Cancelación:</strong> «Eliminar cuenta» en Ajustes. Los pasos están en{" "}
          <Link href="/eliminar-cuenta">Cómo eliminar tu cuenta</Link>.
        </li>
        <li>
          <strong>Memoria del asesor:</strong> borrala por hecho o entera desde Configuración.
        </li>
      </ul>
      <p>
        Para cualquier otra solicitud, escribinos a{" "}
        <a href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>. Respondemos dentro de los
        plazos de la Ley 8968 y su reglamento.
      </p>

      <h2>10. Seguridad</h2>
      <ul>
        <li>Todo viaja cifrado (HTTPS).</li>
        <li>
          Cada cuenta está aislada en la base de datos con reglas a nivel de fila: una consulta no
          puede devolver datos de otra persona aunque se lo pida.
        </li>
        <li>No existen credenciales bancarias en el sistema.</li>
        <li>Borrar la cuenta exige un código enviado a tu correo.</li>
      </ul>
      <p>
        Ningún sistema es infalible. Si detectamos una brecha que te afecte, te lo comunicaremos y
        lo reportaremos a la autoridad correspondiente.
      </p>

      <h2>11. Menores de edad</h2>
      <p>
        El servicio es para mayores de 18 años. No recogemos datos de menores a sabiendas; si
        detectamos una cuenta de una persona menor de edad, la eliminamos.
      </p>

      <h2>12. Cookies y almacenamiento local</h2>
      <p>
        Usamos lo mínimo para que la aplicación funcione: una cookie de sesión que te mantiene
        conectado, y almacenamiento del navegador para tu zona horaria, tu tema y preferencias de la
        interfaz. <strong>No usamos cookies de publicidad ni de seguimiento de terceros.</strong>
      </p>

      <h2>13. Cambios</h2>
      <p>
        Si esta política cambia, actualizamos la fecha del encabezado y, cuando el cambio sea
        relevante, te avisamos dentro de la aplicación.
      </p>

      <h2>14. Contacto</h2>
      <p>
        <span className="lg-pendiente">[Razón social]</span> · Costa Rica ·{" "}
        <a href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>
      </p>
    </LegalShell>
  );
}
