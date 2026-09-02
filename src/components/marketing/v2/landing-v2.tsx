import Link from "next/link";
import { HeroPhoneLazy } from "./hero-phone/hero-phone-lazy";
import "./landing-v2.css";

/**
 * LANDING CARTERA+ v2 — dirección de arte «Expediente».
 *
 * Server Component: todo el contenido se renderiza en el servidor y lo único que viaja al cliente es
 * la escena del teléfono, que además se carga aparte y solo si el equipo da la talla.
 *
 * Papel crema, filetes de un píxel, y las cifras SIEMPRE en Space Mono. La página se lee como un
 * expediente financiero porque es así como se comporta el producto: motores de cálculo, nada
 * inventado, nada ejecutado sin permiso. El riesgo de esta dirección es volverse «banco viejo»; lo
 * que la sostiene es la interlínea generosa, un solo acento verde por sección y los números como
 * único elemento duro.
 *
 * Voz: voseo costarricense, mecanismo antes que adjetivo, cifras verificables.
 *
 * TODAS LAS CIFRAS salen de la cuenta de demostración Familia Ramírez, con 12 meses de movimientos
 * sembrados. Son las mismas que muestra la pantalla del teléfono del hero: si alguien compara, tiene
 * que cuadrar.
 */

const REGISTRO = "/signup";
const INGRESO = "/login";

/** Precios en USD. Decisión del 2 sep 2026: se muestran SOLO en dólares — el equivalente en colones
 *  al tipo de cambio del día metía una dependencia de red en la página que más rápido tiene que
 *  cargar, y fijarlo obligaba a mantenerlo a mano. El cobro es en dólares de todos modos. */
const PLANES = [
  {
    nombre: "Base",
    precio: 17,
    resumen: "Sobres, transacciones, deudas con plan de pago y el patrimonio en el tiempo.",
    destacado: false,
  },
  {
    nombre: "Pro",
    precio: 34,
    resumen: "Todo lo anterior más My Agent C+ con memoria, inversiones y hogar compartido.",
    destacado: true,
  },
  {
    nombre: "Pro+",
    precio: 47,
    resumen: "Todo lo de Pro más la lectura automática del correo del banco y defensa patrimonial.",
    destacado: false,
  },
] as const;

const PRUEBAS = [
  {
    antes: "−₡14.480",
    despues: "+₡173.920",
    pie: "Flujo libre al mes, de tres meses en rojo a doce en azul",
  },
  {
    antes: "₡1.850.000",
    despues: "₡0",
    pie: "La tarjeta al 45% anual, saldada en diez pagos",
  },
  {
    antes: "₡25,5M",
    despues: "₡34,4M",
    pie: "Patrimonio neto en el mismo año",
  },
] as const;

const ESCALERA = [
  {
    num: "01",
    titulo: "Ordena",
    texto: "Sobres por categoría y todos tus movimientos en un solo lugar.",
    dato: "16 sobres · ₡755.417",
  },
  {
    num: "02",
    titulo: "Elimina",
    texto: "Avalancha o bola de nieve, con la fecha real en que quedás libre.",
    dato: "₡5.303.319 en intereses · jul 2030",
  },
  {
    num: "03",
    titulo: "Protege",
    texto: "Fondo de emergencia, fondo de paz y coberturas antes de crecer.",
    dato: "₡1.520.000 / ₡3.500.000",
  },
  {
    num: "04",
    titulo: "Vive tu Rich Life",
    texto: "Patrimonio en el tiempo y tus tres números: Seguridad, Independencia y Libertad.",
    dato: "₡25,5M → ₡34,4M en 12 meses",
  },
] as const;

const MECANISMOS = [
  {
    titulo: "Nunca pedimos tu clave del banco",
    texto:
      "No hay credenciales bancarias que darnos ni que podamos perder. Reenviás el aviso por correo.",
  },
  {
    titulo: "La IA no calcula",
    texto:
      "Los números salen de motores de cálculo verificables. La IA los explica; no los inventa.",
  },
  {
    titulo: "Nada se ejecuta sin vos",
    texto: "Toda propuesta espera tu confirmación. Podés editarla o descartarla.",
  },
  {
    titulo: "Hecho para Costa Rica",
    texto:
      "Colones y dólares, aguinaldo, salario escolar y marchamo — no una app gringa traducida.",
  },
] as const;

const PREGUNTAS = [
  {
    q: "¿Tengo que darles la clave de mi banco?",
    a: "No, y no es una política: es que no existe el campo. CARTERA+ nunca pide ni guarda credenciales bancarias. Reenviás el aviso que ya te llega por correo.",
  },
  {
    q: "¿Y si no soy de BAC?",
    a: "Hoy la lectura automática es de BAC. Con cualquier otro banco registrás con una foto del recibo, importás el estado de cuenta en CSV, o lo anotás en cinco segundos. Vienen BNCR y BCR.",
  },
  {
    q: "¿La IA se inventa los números?",
    a: "No puede: no es ella la que calcula. Los motores de cálculo producen las cifras y la IA las explica. Si te da un número, viene de tus datos.",
  },
  {
    q: "Gano en colones y ahorro en dólares. ¿Sirve?",
    a: "Sí. Las dos monedas conviven en la misma cuenta, con el tipo de cambio del día, y podés ver todo en la que prefieras.",
  },
  {
    q: "¿Funciona para una pareja?",
    a: "Sí. Un hogar puede tener dos adultos y dependientes, con los gastos comunes en un solo lugar.",
  },
  {
    q: "¿Me van a cobrar sin avisar?",
    a: "Tenés 14 días de prueba y cancelás desde tu configuración, sin escribirle a nadie.",
  },
] as const;

/** Isotipo «C+», autocontenido: no depende del shell del app logueado. */
function Isotipo() {
  return (
    <span className="v2-mark" aria-hidden="true">
      C
    </span>
  );
}

export function LandingV2() {
  return (
    <div className="v2">
      {/* ═══ BARRA ═══ */}
      <header className="v2-hdr">
        <div className="v2-wrap v2-hd">
          <a className="v2-brand" href="#top" aria-label="CARTERA+">
            <Isotipo />
            <span className="v2-wordmark">
              CARTERA<span className="v2-p">+</span>
            </span>
          </a>
          <nav className="v2-nav">
            <a href="#registro">Cómo funciona</a>
            <a href="#planes">Planes</a>
            <a href="#preguntas">Preguntas</a>
            <Link className="v2-btn v2-btn-linea" href={INGRESO}>
              Iniciar sesión
            </Link>
            <Link className="v2-btn v2-btn-tinta" href={REGISTRO}>
              Probá 14 días
            </Link>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* ═══ 01 · HERO ═══ */}
        <section className="v2-hero">
          <div className="v2-wrap v2-hero-grid">
            <div className="v2-hero-col">
              <p className="v2-eyebrow">
                <span className="v2-dot" aria-hidden="true" />
                Tu asesor financiero con IA
              </p>

              <h1 className="v2-h1">
                Tu plata,
                <br />
                con dirección.
              </h1>

              <p className="v2-lead">
                CARTERA+ ordena tus gastos, te saca de las deudas en el orden que menos intereses
                paga, y te enseña el patrimonio subiendo. Con los números a la vista, siempre.
              </p>

              <div className="v2-cta">
                <Link className="v2-btn v2-btn-tinta v2-btn-lg" href={REGISTRO}>
                  Probá CARTERA+ 14 días
                </Link>
                <a className="v2-lnk" href="#registro">
                  Ver cómo funciona ›
                </a>
              </div>

              <p className="v2-trust">
                14 días de prueba · Cancelás cuando querás · Tus datos son solo tuyos.
              </p>
            </div>

            {/* La vitrina: el ÚNICO momento 3D de la página. La tarjeta estática se renderiza en el
                servidor y se queda si el equipo no da para WebGL — así el alto nunca cambia. */}
            <div className="v2-vitrina">
              <div className="v2-quieto" aria-hidden="true">
                <p className="v2-overline">Centro de mando</p>
                <p className="v2-quieto-cifra">₡1.354.594</p>
                <p className="v2-quieto-pie">Tu liquidez hoy</p>
                <div className="v2-quieto-caja">
                  <p className="v2-overline v2-verde">My Agent C+</p>
                  <p className="v2-quieto-tit">Tu próxima jugada</p>
                  <p className="v2-quieto-txt">
                    Atacá primero el préstamo del vehículo (13,5%): es el que más te cuesta.
                  </p>
                </div>
                <div className="v2-quieto-barras">
                  <div className="v2-quieto-fila">
                    <span>Deuda total</span>
                    <span className="v2-mono">₡32.166.147</span>
                  </div>
                  <div className="v2-barra">
                    <i style={{ width: "38%" }} />
                  </div>
                  <div className="v2-quieto-fila">
                    <span>Fondo de emergencia</span>
                    <span className="v2-mono">₡1.520.000</span>
                  </div>
                  <div className="v2-barra">
                    <i style={{ width: "43%" }} />
                  </div>
                </div>
              </div>
              <HeroPhoneLazy />
            </div>

            {/* La tira de prueba: las tres cifras que sostienen todo lo que dice la página. Es
                hermana de la columna de copy y no hija, para que en móvil pueda ir DESPUÉS del
                teléfono (ver `grid-template-areas` en la hoja). */}
            <div className="v2-tira">
              <p className="v2-overline">Cuenta de demostración · 12 meses de historia</p>
              <div className="v2-tira-grid">
                {PRUEBAS.map((p) => (
                  <div className="v2-tira-item" key={p.pie}>
                    <p className="v2-cifra">
                      <span>{p.antes}</span> <span className="v2-flecha">→</span>{" "}
                      <span className="v2-verde">{p.despues}</span>
                    </p>
                    <p className="v2-pie">{p.pie}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 02 · NO TECLEÁS NADA ═══ */}
        <section className="v2-sec" id="registro">
          <div className="v2-wrap v2-dos">
            <div className="v2-col-txt">
              <p className="v2-overline">Registro de movimientos</p>
              <h2 className="v2-h2">No tecleás nada. Reenviás el aviso del banco.</h2>
              <p className="v2-parr">
                El mismo correo que tu banco ya te manda entra a CARTERA+, se lee solo y aparece
                como una propuesta con comercio, monto y categoría. Vos solo confirmás.
              </p>
              <p className="v2-nota">
                Hoy el lector automático es de BAC. Para cualquier otro banco: foto del recibo,
                importación de CSV o registro manual. Vienen BNCR y BCR.
              </p>
            </div>

            <ol className="v2-pasos">
              <li className="v2-card">
                <p className="v2-paso">01 · Llega</p>
                <p className="v2-de">De: notificaciones@bac.net</p>
                <p className="v2-card-tit">Compra aprobada</p>
                <p className="v2-mono v2-card-datos">
                  AUTOMERCADO SJ
                  <br />
                  CRC 23.450,00
                  <br />
                  Visa ****2062
                </p>
              </li>
              <li className="v2-card v2-card-viva">
                <p className="v2-paso v2-verde">02 · Propone</p>
                <p className="v2-card-tit">Automercado</p>
                <p className="v2-card-monto">₡23.450</p>
                <p className="v2-card-sub">Supermercado y feria · Visa Memo</p>
                <p className="v2-card-acciones">
                  <span className="v2-chip-verde">Confirmar</span>
                  <span className="v2-chip-linea">Editar</span>
                </p>
              </li>
              <li className="v2-card">
                <p className="v2-paso">03 · Queda</p>
                <p className="v2-card-tit">Sobre «Supermercado y feria»</p>
                <div className="v2-barra">
                  <i style={{ width: "64%" }} />
                </div>
                <p className="v2-mono v2-card-datos">₡160.400 / ₡250.000</p>
                <p className="v2-card-sub">Sin abrir la app, sin escribir una línea.</p>
              </li>
            </ol>
          </div>
        </section>

        {/* ═══ 03 · EL ASESOR ═══ */}
        <section className="v2-sec v2-sec-tono">
          <div className="v2-wrap v2-dos v2-dos-ancho">
            <div className="v2-col-txt">
              <p className="v2-overline">My Agent C+</p>
              <h2 className="v2-h2">Un asesor que sí conoce tus números.</h2>
              <p className="v2-parr">
                No responde con generalidades de internet. Responde con tu saldo, tu tasa, tu fondo
                y tu plazo — y te dice por qué.
              </p>
              <ul className="v2-marcas">
                <li>
                  Las cifras salen de motores de cálculo. La IA explica y recomienda —{" "}
                  <strong>nunca inventa un número</strong>.
                </li>
                <li>
                  Si propone registrar algo, <strong>te pide confirmación</strong>. No ejecuta nada
                  solo.
                </li>
              </ul>
            </div>

            <div className="v2-chat">
              <div className="v2-chat-hd">
                <span className="v2-av">C</span>
                <span className="v2-chat-nom">My Agent C+</span>
                <span className="v2-chat-rol">· Tu asesor financiero</span>
              </div>
              <p className="v2-burb v2-burb-yo">
                Me quedaron ₡300.000 libres este mes. ¿Los abono al carro o los meto al fondo de
                emergencia?
              </p>
              <div className="v2-burb v2-burb-ia">
                <p>Al fondo de emergencia, y te digo por qué con tus números.</p>
                <p>
                  El préstamo del vehículo está al <strong>13,5%</strong>, así que abonarle ₡300.000
                  te ahorra unos ₡40.500 de interés al año. No es poco.
                </p>
                <p>
                  Pero tu fondo va en <strong>₡1.520.000 de ₡3.500.000</strong>: hoy cubre menos de
                  dos meses. Si algo se rompe antes de llegar a tres, la salida vuelve a ser la
                  tarjeta — y esa está al 45%. Te costaría más de tres veces lo que te ahorra el
                  abono.
                </p>
              </div>
              <div className="v2-propuesta">
                <p className="v2-overline v2-verde">Propuesta · pendiente de tu confirmación</p>
                <p className="v2-prop-tit">Aporte al fondo de emergencia</p>
                <p className="v2-mono v2-prop-datos">₡300.000 · hoy · Cuenta de ahorro BAC</p>
                <p className="v2-prop-pie">
                  No lo registro hasta que me digás que sí. La decisión siempre es tuya.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ═══ 04 · LA ESCALERA ═══ */}
        <section className="v2-sec">
          <div className="v2-wrap">
            <div className="v2-sec-head">
              <p className="v2-overline">La escalera financiera</p>
              <h2 className="v2-h2">Cuatro movimientos, y en ese orden.</h2>
              <p className="v2-parr">
                No es fuerza de voluntad. Es una secuencia: cada paso libera la plata que paga el
                siguiente.
              </p>
            </div>

            <div className="v2-escalera">
              {ESCALERA.map((e, i) => (
                <div
                  className={`v2-card v2-peldano${i === 3 ? " v2-peldano-tinta" : ""}`}
                  key={e.num}
                >
                  <p className="v2-num">{e.num}</p>
                  <p className="v2-card-tit v2-card-tit-lg">{e.titulo}</p>
                  <p className="v2-card-sub">{e.texto}</p>
                  <p className="v2-mono v2-peldano-dato">{e.dato}</p>
                </div>
              ))}
            </div>
            <p className="v2-nota v2-nota-centrada">
              Cifras de la cuenta de demostración Familia Ramírez, con 12 meses de movimientos
              reales.
            </p>
          </div>
        </section>

        {/* ═══ 05 · MECANISMOS ═══ */}
        <section className="v2-sec v2-sec-tono">
          <div className="v2-wrap">
            <div className="v2-sec-head">
              <p className="v2-overline">Por qué confiar</p>
              <h2 className="v2-h2">Mecanismos, no adjetivos.</h2>
            </div>
            <div className="v2-mecanismos">
              {MECANISMOS.map((m) => (
                <div className="v2-mec" key={m.titulo}>
                  <p className="v2-card-tit">{m.titulo}</p>
                  <p className="v2-card-sub">{m.texto}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 06 · PLANES ═══ */}
        <section className="v2-sec" id="planes">
          <div className="v2-wrap">
            <div className="v2-sec-head">
              <p className="v2-overline">Planes</p>
              <h2 className="v2-h2">Tres planes. Ninguno te amarra.</h2>
              <p className="v2-parr">
                14 días de prueba en cualquiera. Cancelás vos, cuando querás.
              </p>
            </div>
            <div className="v2-planes">
              {PLANES.map((p) => (
                <div className={`v2-plan${p.destacado ? " v2-plan-hot" : ""}`} key={p.nombre}>
                  {p.destacado ? <span className="v2-badge">El que casi todos eligen</span> : null}
                  <p className="v2-plan-nom">{p.nombre}</p>
                  <p className="v2-plan-precio">
                    <span className="v2-plan-n">${p.precio}</span>
                    <span className="v2-plan-mes"> / mes</span>
                  </p>
                  <p className="v2-card-sub">{p.resumen}</p>
                  <Link
                    className={`v2-btn ${p.destacado ? "v2-btn-tinta" : "v2-btn-linea"} v2-btn-bloque`}
                    href={REGISTRO}
                  >
                    Probar 14 días
                  </Link>
                </div>
              ))}
            </div>
            <p className="v2-nota v2-nota-centrada">Precios en dólares. Impuestos según tu país.</p>
          </div>
        </section>

        {/* ═══ 07 · PREGUNTAS ═══ */}
        <section className="v2-sec v2-sec-tono" id="preguntas">
          <div className="v2-wrap v2-dos v2-dos-faq">
            <div className="v2-col-txt">
              <p className="v2-overline">Preguntas difíciles</p>
              <h2 className="v2-h2">Lo que preguntarías antes de pagar.</h2>
            </div>
            <div className="v2-faq">
              {PREGUNTAS.map((p) => (
                <div className="v2-qa" key={p.q}>
                  <p className="v2-q">{p.q}</p>
                  <p className="v2-a">{p.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ 08 · CIERRE ═══ */}
        <section className="v2-cierre">
          <div className="v2-wrap v2-cierre-col">
            <h2 className="v2-h2 v2-h2-cierre">
              Tu plata ya cuenta una historia. Falta que alguien la lea.
            </h2>
            <p className="v2-parr">
              Empezá con los últimos tres meses. En una tarde vas a ver hacia dónde va tu dinero y
              qué movimiento te conviene hacer primero.
            </p>
            <Link className="v2-btn v2-btn-tinta v2-btn-lg" href={REGISTRO}>
              Probá CARTERA+ 14 días
            </Link>
            <p className="v2-nota">Sin tarjeta para empezar · Cancelás cuando querás</p>
          </div>
        </section>
      </main>

      <footer className="v2-pie">
        <div className="v2-wrap v2-pie-fila">
          <span>
            CARTERA<span className="v2-p">+</span> · Costa Rica
          </span>
          <span className="v2-pie-legal">
            Es información y educación financiera, no asesoría formal. © {new Date().getFullYear()}
          </span>
        </div>
      </footer>

      {/* En móvil el CTA vive fijo abajo: la página es larga y el botón del hero queda lejísimos
          cuando alguien se convence en la sección 05. */}
      <div className="v2-cta-fijo">
        <Link className="v2-btn v2-btn-tinta v2-btn-bloque" href={REGISTRO}>
          Probá CARTERA+ 14 días
        </Link>
      </div>
    </div>
  );
}

export default LandingV2;
