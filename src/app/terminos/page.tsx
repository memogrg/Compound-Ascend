import Link from "next/link";
import { LegalShell } from "@/components/marketing/v3/legal-shell";
import { CORREO_PRIVACIDAD } from "@/lib/legal/version";

export const metadata = {
  title: "Términos y condiciones — CARTERA+",
  description:
    "Las condiciones de uso de CARTERA+: qué es el servicio, qué esperamos de vos, qué no es (asesoría financiera) y cómo cancelás.",
};

/**
 * Página pública (ver PUBLIC_PREFIXES en lib/supabase/middleware.ts).
 *
 * Sin precios ni pasarelas a propósito: estos términos se leen TAMBIÉN desde la app
 * nativa, donde dirigir a comprar fuera de la tienda viola Apple 3.1.1 y las Google
 * Payments Policies. Por eso el cobro se describe de forma neutral.
 */
export default function TerminosPage() {
  return (
    <LegalShell titulo="Términos y condiciones">
      <p>
        Estas condiciones rigen el uso de <strong>CARTERA+</strong>. Al crear una cuenta o usar el
        servicio, aceptás lo que sigue. Si no estás de acuerdo con algo, no uses el servicio.
      </p>

      <h2>1. Qué es CARTERA+</h2>
      <p>
        CARTERA+ es una aplicación de finanzas personales: te deja registrar y organizar tus
        ingresos, gastos, presupuesto, deudas, metas, inversiones y patrimonio, y consultar a{" "}
        <strong>My Agent C+</strong>, un asistente que responde sobre tu propia situación.
      </p>

      <h2>2. Tu cuenta</h2>
      <ul>
        <li>Tenés que ser mayor de 18 años.</li>
        <li>
          La información que registrás al crear la cuenta debe ser verdadera, y mantenerla al día es
          tu responsabilidad.
        </li>
        <li>
          Sos responsable de lo que pase con tus credenciales. Si sospechás que alguien entró a tu
          cuenta, cambiá la contraseña y avisanos.
        </li>
        <li>Una cuenta pertenece a una persona: no la compartas.</li>
      </ul>

      <h2>3. Planes y pago</h2>
      <p>
        El servicio se ofrece con planes de distinta capacidad, y algunos son de pago. Los planes de
        pago se contratan <strong>según el canal donde te registraste</strong>, y ahí mismo podés
        ver el estado de tu suscripción, cambiarla o darla de baja.
      </p>
      <p>
        Si una suscripción deja de estar activa, tu cuenta y tu información siguen siendo tuyas:
        conservás el acceso para descargar tus datos o eliminar la cuenta.
      </p>

      <h2>4. Uso aceptable</h2>
      <p>Al usar CARTERA+ te comprometés a no:</p>
      <ul>
        <li>Usar el servicio para algo ilegal, ni para datos financieros que no te pertenezcan.</li>
        <li>
          Intentar acceder a cuentas o datos de otras personas, ni sortear los límites de uso o las
          medidas de seguridad.
        </li>
        <li>
          Automatizar el acceso, revender el servicio o extraer su contenido de forma masiva sin
          autorización escrita.
        </li>
        <li>Subir contenido dañino, ni cargar la infraestructura a propósito.</li>
      </ul>
      <p>
        Si incumplís estas condiciones podemos suspender o cerrar la cuenta. Cuando sea razonable,
        avisamos antes y damos margen para descargar los datos.
      </p>

      <h2>5. Propiedad intelectual</h2>
      <p>
        La aplicación, su código, su diseño, su marca y sus contenidos son de{" "}
        <span className="lg-pendiente">[Razón social]</span>. Se te concede una licencia personal,
        limitada, revocable y no transferible para usar el servicio.
      </p>
      <p>
        <strong>Tus datos son tuyos.</strong> Lo que registrás te pertenece; solo los usamos para
        prestarte el servicio, según la <Link href="/privacidad">Política de privacidad</Link>.
      </p>

      <h2>6. Esto no es asesoría financiera</h2>
      <p>
        <strong>
          CARTERA+ y My Agent C+ brindan información educativa y herramientas de organización; no
          constituyen asesoría financiera, legal ni fiscal. Las decisiones son tuyas.
        </strong>
      </p>
      <p>
        Las proyecciones, simulaciones y recomendaciones son cálculos a partir de lo que vos
        registraste y de supuestos que pueden no cumplirse. Los precios de mercado provienen de
        terceros, pueden venir con retraso o con errores, y una rentabilidad pasada no anticipa la
        futura. My Agent C+ es un modelo de lenguaje y <strong>puede equivocarse</strong>. Antes de
        una decisión importante, consultá a una persona profesional habilitada.
      </p>

      <h2>7. Disponibilidad y límites de responsabilidad</h2>
      <p>
        Hacemos lo razonable para que el servicio esté disponible, pero se ofrece «tal cual», sin
        garantía de que funcione sin interrupciones ni errores. Puede haber mantenimientos, fallas
        de terceros de los que dependemos y cambios de funcionalidad.
      </p>
      <p>
        En la medida en que la ley lo permita, no respondemos por pérdidas indirectas o de lucro
        cesante derivadas de decisiones financieras que tomes usando el servicio. Nada de esto
        limita responsabilidades que la legislación costarricense no permita excluir.
      </p>
      <p>
        <strong>Respaldo:</strong> «Descargar mis datos» existe para que puedas conservar tu
        información por tu cuenta. Te recomendamos usarlo con cierta regularidad.
      </p>

      <h2>8. Cancelación y borrado</h2>
      <p>
        Podés dejar de usar el servicio cuando quieras y eliminar tu cuenta desde la aplicación. Los
        pasos están en <Link href="/eliminar-cuenta">Cómo eliminar tu cuenta</Link>. El borrado es{" "}
        <strong>irreversible</strong>: descargá tus datos antes si los querés conservar.
      </p>
      <p>
        Los comprobantes de los pagos ya realizados se conservan del lado de la pasarela de cobro
        por obligación contable, aunque borres la cuenta.
      </p>

      <h2>9. Cambios en estas condiciones</h2>
      <p>
        Podemos actualizarlas. Si el cambio es relevante, te avisamos dentro de la aplicación.
        Seguir usando el servicio después de un cambio significa que lo aceptás.
      </p>

      <h2>10. Ley aplicable</h2>
      <p>
        Estas condiciones se rigen por las leyes de la República de Costa Rica, y cualquier
        controversia se somete a sus tribunales.
      </p>

      <h2>11. Contacto</h2>
      <p>
        <span className="lg-pendiente">[Razón social]</span> · Costa Rica ·{" "}
        <a href={`mailto:${CORREO_PRIVACIDAD}`}>{CORREO_PRIVACIDAD}</a>
      </p>
    </LegalShell>
  );
}
