import Link from "next/link";
import { LandingFx } from "@/components/marketing/landing-fx";
import { Phone3DLazy } from "@/components/marketing/phone-3d/phone-3d-lazy";
import "./landing.css";

/**
 * LANDING PÚBLICA DE CARTERA+ — Server Component.
 *
 * Todo lo que se ve acá es estático y se renderiza en el servidor; lo único que llega al cliente es
 * la isla de efectos (`LandingFx`) y el teléfono 3D, que carga aparte y solo en el navegador.
 *
 * La monta `src/app/page.tsx`, que antes redirige a /dashboard si hay sesión: esto es lo que ve
 * alguien que todavía no entró.
 */

/**
 * Precios de referencia, en USD. Acá arriba a propósito: cuando se definan los definitivos (o salga
 * el test de puerta falsa) es una línea, no una cacería por el markup.
 */
const PRECIOS = { esencial: 17, pro: 34, max: 47 } as const;

/** Los destinos reales del app. El diseño los tenía como `#`, pero acá los botones tienen que andar. */
const REGISTRO = "/signup";
const INGRESO = "/login";

/** El check de las listas. Se repite ~14 veces; como componente el markup queda legible. */
function Check() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="m5 13 4 4L19 7" />
    </svg>
  );
}

/** Isotipo "C+": autocontenido, no depende del shell del app logueado. */
function Isotipo() {
  return (
    <svg className="mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path
        d="M45 18.5 A 19 19 0 1 0 45 45.5"
        stroke="#1d1d1f"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path d="M46 26 V38 M40 32 H52" stroke="#378451" strokeWidth="4.6" strokeLinecap="round" />
    </svg>
  );
}

type Plan = {
  nombre: string;
  gancho: string;
  precio: number;
  puntos: string[];
  destacado?: boolean;
};

const PLANES: Plan[] = [
  {
    nombre: "Esencial+",
    gancho: "Ordena tu dinero.",
    precio: PRECIOS.esencial,
    puntos: [
      "Perfil financiero: tu ADN y arquetipo",
      "Ingresos, gastos y sobres por categoría",
      "Multi-moneda CRC / USD",
      "Deudas con estrategia (avalancha / bola de nieve)",
      "Asesor IA con cuota mensual",
    ],
  },
  {
    nombre: "Pro+",
    gancho: "Tu asesor completo.",
    precio: PRECIOS.pro,
    destacado: true,
    puntos: [
      "Todo lo de Esencial+",
      "Asesor IA sin fricción, con memoria de coaching",
      "Registro por foto de recibo y correo del banco",
      "Patrimonio completo: inversiones en vivo + protección",
      "Informes y comparaciones: ¿abono o invierto?",
    ],
  },
  {
    nombre: "Max+",
    gancho: "Para tu hogar y tu patrimonio.",
    precio: PRECIOS.max,
    puntos: [
      "Todo lo de Pro+",
      "Cuentas de hogar / pareja: finanzas compartidas",
      "Análisis profundo de portafolio con más contexto",
      "Prioridad en nuevas funciones",
      "Acompañamiento reforzado",
    ],
  },
];

const FUNDAMENTOS = [
  {
    num: "01",
    titulo: "Ordena",
    texto:
      "Toma el control de tus ingresos, gastos y sobres por categoría. Claridad total de a dónde va cada colón.",
  },
  {
    num: "02",
    titulo: "Haz crecer",
    texto:
      "Convierte tus ahorros en patrimonio. Invierte con un plan y escenarios con el riesgo visible, no con miedo.",
  },
  {
    num: "03",
    titulo: "Protege",
    texto:
      "Fondo de emergencia, fondo de paz y coberturas: blinda lo que ya lograste para que un imprevisto no borre años de avance.",
  },
  {
    num: "04",
    titulo: "Vive tu Rich Life",
    texto:
      "Patrimonio neto en el tiempo, Rich Life Score y tus tres Números: Seguridad, Independencia y Libertad.",
  },
];

const CAPACIDADES = [
  "Coaching con memoria: recuerda tu proceso y reconoce tu avance.",
  "Las cifras salen de motores de cálculo — la IA nunca inventa un número.",
  "Registra gastos con una foto del recibo o reenviando los avisos de tu banco por correo.",
  "Nunca ejecuta nada sin tu permiso. La decisión siempre es tuya.",
];

export function Landing() {
  return (
    <div className="lp">
      <LandingFx />

      <header id="lp-hdr" className="lp-hdr">
        <div className="wrap hd">
          <a className="brand" href="#top" aria-label="CARTERA+">
            <Isotipo />
            CARTERA<span className="p">+</span>
          </a>
          <Link className="btn btn-sm btn-ghost" href={INGRESO}>
            Iniciar sesión
          </Link>
        </div>
      </header>

      {/* ── HERO: columna en flujo normal. El teléfono es un bloque más, nunca una capa
             encima del copy ni de los botones. La aurora sí va detrás, sin capturar clics. ── */}
      <section className="hero" id="top">
        <div className="aurora" aria-hidden="true">
          <div className="aur a1" />
          <div className="aur a2" />
          <div className="aur a3" />
        </div>

        <div className="wrap hero-col">
          <span className="eyebrow">
            <span className="dot" />
            Tu asesor financiero con IA
          </span>

          <h1>
            <span className="hline">
              <span>Tu dinero,</span>
            </span>
            <span className="hline">
              <span>
                con <em className="g">dirección.</em>
              </span>
            </span>
          </h1>

          <p className="sub">
            CARTERA+ ordena tu dinero, elimina tus deudas, hace crecer tu patrimonio y protege lo
            que ya lograste — un paso a la vez, hacia tu rich life real.
          </p>

          {/* La caja fija el hueco del teléfono antes de que cargue la escena: el canvas vive
              adentro y el layout no salta cuando aparece (CLS 0). */}
          <div className="phone-box">
            <Phone3DLazy />
          </div>

          <div className="cta-row">
            <Link className="btn btn-lg btn-pri" href={REGISTRO}>
              Prueba CARTERA+
            </Link>
            <a className="lnk" href="#fundamentos">
              Cómo funciona ›
            </a>
          </div>

          <div className="trust">
            Prueba de 14 días · Cancela cuando quieras · Tus datos son solo tuyos.
          </div>
        </div>
      </section>

      {/* ── FUNDAMENTOS ── */}
      <section id="fundamentos">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="overline">La escalera financiera</span>
            <h2>Cuatro movimientos que cambian tu vida financiera.</h2>
            <p className="sec-sub">
              No es magia ni fuerza de voluntad: es un sistema que te acompaña en orden.
            </p>
          </div>
          <div className="grid4">
            {FUNDAMENTOS.map((f, i) => (
              <div key={f.num} className={`fcard reveal d${i + 1}`}>
                <span className="num">{f.num}</span>
                <h3>{f.titulo}</h3>
                <p>{f.texto}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── EL AGENTE ── */}
      <section className="agent-band">
        <div className="wrap">
          <div className="agent">
            <div className="reveal">
              <span className="overline">My Agent C+</span>
              <h2>Un asesor que sí conoce tus números.</h2>
              <p className="agent-p">
                Pregúntale lo que sea sobre tu dinero, 24/7. Conoce tu presupuesto, tus deudas con
                su tasa real, tus fondos y tu portafolio — y te guía como coach, no como juez.
              </p>
              <ul>
                {CAPACIDADES.map((c) => (
                  <li key={c}>
                    <Check />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div className="chatbox reveal d2">
              <div className="cm me">
                <div className="bub">¿Cómo está mi salud financiera?</div>
              </div>
              <div className="cm ai">
                <span className="av">C+</span>
                <div className="bub">
                  Vas <b>bien encaminado</b>: 78/100. Tu ahorro sube y tu deuda baja. El punto a
                  cuidar es tu tarjeta al 24% — si le abonas ₡45.000 extra, la liquidas{" "}
                  <b>8 meses antes</b>. ¿Te armo el plan?
                </div>
              </div>
              <div className="cm me">
                <div className="bub">Dale, y ¿me alcanza para invertir este mes?</div>
              </div>
              <div className="cm ai">
                <span className="av">C+</span>
                <div className="bub">
                  Con tu fondo de paz en 4,1 meses, sí hay espacio. Te muestro los escenarios con su
                  riesgo visible — sin promesas, con números reales.
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PLANES ── */}
      <section id="planes">
        <div className="wrap">
          <div className="sec-head reveal">
            <span className="overline">Planes</span>
            <h2>Elige cómo quieres avanzar.</h2>
            <p className="sec-sub">
              Todos incluyen 14 días de prueba. Sin permanencia: cancela cuando quieras.
            </p>
          </div>
          <div className="plans">
            {PLANES.map((plan, i) => (
              <div
                key={plan.nombre}
                className={`plan reveal d${i + 1}${plan.destacado ? " hot" : ""}`}
              >
                {plan.destacado ? <span className="badge">Más popular</span> : null}
                <h3>{plan.nombre}</h3>
                <div className="tag">{plan.gancho}</div>
                <div className="price">
                  <span className="n">${plan.precio}</span>
                  <span className="per"> /mes</span>
                </div>
                <ul>
                  {plan.puntos.map((p) => (
                    <li key={p}>
                      <Check />
                      {p}
                    </li>
                  ))}
                </ul>
                <Link
                  className={`btn btn-lg ${plan.destacado ? "btn-green" : "btn-ghost"}`}
                  href={REGISTRO}
                >
                  Empezar con {plan.nombre}
                </Link>
              </div>
            ))}
          </div>
          {/* TODO precios finales */}
          <p className="plans-note">Precios de referencia en USD; impuestos según tu país.</p>
        </div>
      </section>

      {/* ── PRIVACIDAD ── */}
      <section className="sec-privacidad">
        <div className="wrap">
          <div className="privacy reveal">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 2 4 6v6c0 5 3.4 9 8 10 4.6-1 8-5 8-10V6l-8-4Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <h2>Tus datos son solo tuyos.</h2>
            <p>
              Tu información financiera está protegida y solo tú puedes acceder a ella. Nada se
              comparte ni se ejecuta sin tu confirmación.
            </p>
          </div>
        </div>
      </section>

      {/* ── CIERRE ── */}
      <div className="final">
        <div className="wrap reveal">
          <h2>Empieza hoy tu ascenso financiero.</h2>
          <div className="cta-row">
            <Link className="btn btn-lg btn-pri" href={REGISTRO}>
              Prueba CARTERA+
            </Link>
          </div>
          <div className="trust">14 días de prueba · Hecho para Costa Rica y Latinoamérica</div>
        </div>
      </div>

      <footer>
        <div className="wrap ft">
          <span>
            CARTERA<span className="p">+</span> · Tu asesor financiero con IA
          </span>
          <span>
            Es información y educación financiera, no asesoría formal. © {new Date().getFullYear()}
          </span>
        </div>
      </footer>
    </div>
  );
}
