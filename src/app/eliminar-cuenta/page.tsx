import Link from "next/link";
import { LegalShell } from "@/components/marketing/v3/legal-shell";
import { CORREO_PRIVACIDAD } from "@/lib/legal/version";

export const metadata = {
  title: "Cómo eliminar tu cuenta — CARTERA+",
  description:
    "Pasos para eliminar tu cuenta de CARTERA+ y todos tus datos, qué se borra, qué se conserva y cómo pedirlo por correo si no podés entrar.",
};

/**
 * Página pública (ver PUBLIC_PREFIXES en lib/supabase/middleware.ts).
 *
 * Google Play exige una URL pública —alcanzable SIN instalar la app y SIN iniciar
 * sesión— que explique cómo borrar la cuenta y qué pasa con los datos. Por eso los
 * pasos están escritos completos acá y no solo dentro de la aplicación.
 *
 * Al editarla: los rótulos tienen que coincidir LITERALMENTE con los botones reales
 * (ver modules/account/components/delete-account-button.tsx). Una guía que nombra un
 * botón que no existe es peor que no tener guía.
 */
export default function EliminarCuentaPage() {
  return (
    <LegalShell titulo="Cómo eliminar tu cuenta">
      <p>
        Podés eliminar tu cuenta de <strong>CARTERA+</strong> y todos tus datos vos mismo, desde la
        aplicación, sin pedirnos permiso ni esperar respuesta. Acá están los pasos exactos.
      </p>
      <p>
        <strong>El borrado es irreversible.</strong> No hay papelera ni período de gracia: cuando
        termina, no podemos recuperar nada. Por eso el propio flujo te ofrece descargar tus datos
        antes.
      </p>

      <h2>Desde la aplicación</h2>
      <ol className="lg-pasos">
        <li>
          Entrá a tu cuenta y abrí <strong>Ajustes</strong> (en el móvil, el menú ☰ →{" "}
          <em>Ajustes</em>; en la web, <em>Configuración</em>).
        </li>
        <li>
          Bajá hasta <strong>Zona de peligro</strong> y tocá <strong>«Borrar mi cuenta…»</strong>.
          (Justo arriba, en <strong>Tus datos</strong>, está la descarga de tu información.)
        </li>
        <li>
          Escribí <strong>BORRAR</strong> en el campo que aparece y tocá{" "}
          <strong>«Enviar código»</strong>.
        </li>
        <li>
          Buscá en tu correo el código que te enviamos y escribilo. Sirve para confirmar que sos vos
          quien lo pide.
        </li>
        <li>
          Antes del paso final, aprovechá <strong>«Descargar mis datos (.xlsx)»</strong> si querés
          conservar tu información.
        </li>
        <li>
          Tocá <strong>«Borrar mi cuenta»</strong>. Listo: la sesión se cierra y la cuenta deja de
          existir.
        </li>
      </ol>

      <h2>Qué se elimina</h2>
      <ul>
        <li>Tu cuenta de acceso y tu perfil.</li>
        <li>
          Todos tus datos financieros: movimientos, ingresos, gastos, presupuesto, deudas, metas,
          inversiones, seguros, activos y cuentas.
        </li>
        <li>Tus conversaciones con My Agent C+ y la memoria del asesor.</li>
        <li>Las fotos de recibos que hayas subido.</li>
        <li>Los correos reenviados a tu dirección de ingesta y sus propuestas de gasto.</li>
        <li>Tus registros de auditoría.</li>
        <li>Si tenés una suscripción activa, se cancela en el mismo paso.</li>
      </ul>

      <h2>Qué se conserva, y por qué</h2>
      <ul>
        <li>
          <strong>Eventos de seguridad:</strong> se conservan <em>anonimizados</em>. Queda el
          registro de que algo ocurrió, sin ningún vínculo con vos. Sirve para detectar ataques
          contra el servicio.
        </li>
        <li>
          <strong>Facturas y comprobantes de pagos ya realizados:</strong> quedan del lado de la
          pasarela de cobro por el plazo que exige la normativa contable. No podemos borrarlos, y
          ninguna empresa puede.
        </li>
        <li>
          <strong>Si formabas parte de un hogar</strong> y no eras la persona titular, los registros
          que creaste se reasignan a quien lo titula, porque forman parte de las cuentas compartidas
          del hogar. Si eras la titular, el hogar se disuelve y sus datos se eliminan.
        </li>
      </ul>

      <h2>Si no podés entrar a tu cuenta</h2>
      <p>
        Escribinos desde la dirección de correo con la que te registraste a{" "}
        <a href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>, con el asunto «Eliminar mi
        cuenta». Verificamos que la solicitud venga de esa dirección y la procesamos.
      </p>

      <h2>Más información</h2>
      <p>
        Qué datos guardamos, con quién los compartimos y cuánto los conservamos está en la{" "}
        <Link href="/privacidad">Política de privacidad</Link>.
      </p>
    </LegalShell>
  );
}
