import "./landing.css";
import { LandingMotion } from "./landing-motion";

/**
 * La landing de CARTERA+.
 *
 * Portada del prototipo `_heroes/A.html` con un script, no a mano: son ~2.000
 * líneas y transcribirlas garantiza erratas silenciosas.
 *
 * Todo el CSS vive prefijado con `.lp` en landing.css. El prototipo usa nombres
 * genéricos —.wrap, .card, .btn, .hero, .plan— que YA existen en globals.css;
 * sin el prefijo las dos hojas se pisan y gana la que cargue después. Por eso
 * la página entera va envuelta en un solo <div className="lp">.
 *
 * La página cuenta una historia y en este orden: tensión → mecanismo → guía →
 * destino → prueba → confianza → precio → objeciones → cierre.
 */
export function Landing() {
  return (
    <div className="lp">
      {/* Isotipo CARTERA+ como símbolo reutilizable. Es EXACTAMENTE el de
           src/components/marketing/landing.tsx: la C en tinta y el + en verde de marca.
           Cada vez que se nombra CARTERA+ o al agente en la página se instancia este
           símbolo, para que la línea gráfica sea una sola. */}
      <svg
        width="0"
        height="0"
        style={{ position: "absolute" }}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <symbol id="iso" viewBox="0 0 64 64">
            <path
              d="M45 18.5 A 19 19 0 1 0 45 45.5"
              fill="none"
              stroke="#1d1d1f"
              strokeWidth="7"
              strokeLinecap="round"
            />
            <path
              d="M46 26 V38 M40 32 H52"
              fill="none"
              stroke="#378451"
              strokeWidth="4.6"
              strokeLinecap="round"
            />
          </symbol>
        </defs>
      </svg>
      <header className="hdr">
        <div className="wrap hd">
          <a className="lp-brand" href="#top" aria-label="CARTERA+">
            {/* El isotipo REAL, el mismo de src/components/marketing/landing.tsx */}
            <svg className="mark" viewBox="0 0 64 64" fill="none" aria-hidden="true">
              <path
                d="M45 18.5 A 19 19 0 1 0 45 45.5"
                stroke="#1d1d1f"
                strokeWidth="7"
                strokeLinecap="round"
              />
              <path
                d="M46 26 V38 M40 32 H52"
                stroke="#378451"
                strokeWidth="4.6"
                strokeLinecap="round"
              />
            </svg>
            <span className="wm">
              CARTERA<span className="p">+</span>
            </span>
          </a>
          <nav className="lp-nav">
            <a href="#como">Cómo funciona</a>
            <a href="#planes">Planes</a>
            <a href="/faqs">FAQs</a>
            <a href="/login" className="lp-btn lp-btn-ghost">
              Iniciar sesión
            </a>
            <a href="/signup" className="lp-btn btn-green">
              Probá 14 días
            </a>
          </nav>
        </div>
      </header>

      <main id="top">
        {/* ══ 01 · HERO — la promesa ══ */}
        <section className="hero">
          <div className="aurora" aria-hidden="true">
            <div className="aur a1"></div>
            <div className="aur a2"></div>
            <div className="aur a3"></div>
          </div>
          <div className="wrap in">
            <p className="lp-rotulo">
              <i></i>Tu asesor financiero, siempre con vos
            </p>
            <h1>
              <span className="hline">
                <span>Tu dinero,</span>
              </span>
              <span className="hline2">
                <span className="rot" id="rot" aria-hidden="true">
                  <span className="pal">
                    con <em>estrategia.</em>
                  </span>
                </span>
                <span className="medidor" id="medidor" aria-hidden="true"></span>
              </span>
              <span className="sr">Tu dinero, un paso adelante.</span>
            </h1>
            <p className="lead">
              <span className="cw">
                CARTERA<i>+</i>
              </span>{" "}
              conecta tus movimientos, decisiones y objetivos financieros para decirte no solo dónde
              estás, sino qué hacer después.
            </p>
            <a className="lp-btn btn-green btn-lg" href="/signup">
              Quiero estar un paso adelante
            </a>
            <p className="fine">14 días de prueba · Diseñado para Costa Rica</p>
          </div>
          <div className="escena" id="escena">
            <canvas id="gl"></canvas>
          </div>
        </section>

        {/* ══ 02 · EL PROBLEMA ══════════════════════════════════════════════════════
           La tensión NO es «sos desordenado». Es «ya hacés las cosas, pero te falta
           criterio para saber si te acercan a donde querés estar». El lector ya
           trabaja, ya ahorra y probablemente ya invierte: tratarlo de descuidado
           rompe el posicionamiento antes de empezar. ══════════════════════════ */}
        <section className="soft">
          <div className="wrap">
            <div className="sec-head center reveal">
              <p className="lp-rotulo">El problema</p>
              <h2>
                Sabés cuánto ganás.
                <br />
                Pero no siempre sabés
                <br />
                <em>si estás avanzando.</em>
              </h2>
              <p className="lead">
                Pagás, ahorrás, invertís, tomás decisiones. Pero sin ver todo tu panorama
                financiero, es difícil saber si cada decisión te acerca o te aleja de donde querés
                estar.
              </p>
            </div>
            <div className="dolores">
              <div className="dolor reveal">
                <q>Gano bien… pero a final de mes no sé dónde quedó todo.</q>
                <p>
                  No necesariamente gastás demasiado. El problema es no saber qué decisiones están
                  absorbiendo tu dinero.
                </p>
              </div>
              <div className="dolor reveal">
                <q>Ahorro, pero siento que nunca termino de avanzar.</q>
                <p>
                  Un mes guardás. Otro mes lo usás. Y tus metas financieras siguen exactamente donde
                  estaban.
                </p>
              </div>
              <div className="dolor reveal">
                <q>Tengo dinero disponible… pero no sé cuál es la mejor decisión.</q>
                <p>
                  ¿Abonar la deuda? ¿Ahorrar? ¿Invertir? El problema no siempre es tener dinero. Es
                  saber qué hacer primero con él.
                </p>
              </div>
            </div>
            <p className="remate reveal">
              No se trata de ganar más.
              <br />
              Se trata de <b>hacer más con lo que ya ganás.</b>
            </p>
          </div>
        </section>

        {/* ══ 03 · EL ASESOR ═════════════════════════════════════════════════════════
           El bloque que justifica la mensualidad. Acá se deja de vender que CARTERA+
           ordena información y se vende la razón por la que alguien paga todos los
           meses: My Agent C+ conoce la realidad financiera de ESA persona y razona
           dentro de ella.

           Lo que NO se vende: «una IA a la que le podés preguntar sobre finanzas» —
           eso lo hace cualquier chatbot. Lo que sí: números + hábitos + memoria +
           objetivos. Por eso el titular no termina en «conoce tus números»: la
           promesa del producto no termina ahí.

           La confianza se dice en positivo. «La IA nunca inventa un número» es una
           frase defensiva: pone al lector a pensar en que podría inventarlo cuando
           ni se le había ocurrido. La versión al derecho vive en `.control` y el
           detalle de los motores de cálculo va en el FAQ.
           ═══════════════════════════════════════════════════════════════════════ */}
        <section className="asesor">
          <div className="wrap dos">
            <div className="reveal">
              <p className="lp-rotulo agente largo">
                <span className="cw">
                  My Agent C<i>+</i>
                </span>{" "}
                <em>· Tu asesor financiero personal</em>
              </p>
              <h2 style={{ marginTop: "14px" }}>
                No solo conoce tus números.
                <br />
                <em>Te conoce a vos.</em>
              </h2>
              <p className="lead" style={{ marginTop: "16px" }}>
                <span className="cw">
                  My Agent C<i>+</i>
                </span>{" "}
                conecta tus movimientos, hábitos, decisiones y objetivos para entender tu situación
                financiera en contexto. Cuanto más construís tu historia en{" "}
                <span className="cw">
                  CARTERA<i>+</i>
                </span>
                , mejor entiende dónde estás y qué necesitás para avanzar.
              </p>
              <p className="subraya">
                No recibís una respuesta genérica.
                <br />
                Recibís una respuesta <em>basada en tu realidad.</em>
              </p>

              <div className="caps">
                <div className="cap">
                  <span className="lp-ico">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  </span>
                  <div>
                    <b>Entiende tus números.</b>
                    <span>Ingresos, gastos, deudas, ahorro, inversiones, patrimonio y metas.</span>
                  </div>
                </div>
                <div className="cap">
                  <span className="lp-ico">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  </span>
                  <div>
                    <b>Entiende tus hábitos.</b>
                    <span>
                      Reconoce patrones y detecta cuándo tus decisiones empiezan a alejarte de tus
                      objetivos.
                    </span>
                  </div>
                </div>
                <div className="cap">
                  <span className="lp-ico">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  </span>
                  <div>
                    <b>Recuerda tu camino.</b>
                    <span>
                      Conoce tus prioridades, decisiones y progreso, para que cada conversación
                      continúe donde quedó la anterior.
                    </span>
                  </div>
                </div>
                <div className="cap">
                  <span className="lp-ico">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 12.5l5 5L20 6.5" />
                    </svg>
                  </span>
                  <div>
                    <b>Te ayuda a decidir.</b>
                    <span>
                      Compara escenarios con tus propios números y te muestra el impacto de cada
                      alternativa antes de que tomés una decisión.
                    </span>
                  </div>
                </div>
              </div>

              <p className="control">
                Recomendaciones respaldadas por cálculos y tus datos financieros.{" "}
                <b>Vos mantenés el control:</b>{" "}
                <span className="cw">
                  My Agent C<i>+</i>
                </span>{" "}
                analiza, calcula y propone — la decisión siempre es tuya.
              </p>
            </div>

            <div className="conver reveal">
              <div className="halo" aria-hidden="true">
                <span></span>
                <span></span>
                <span></span>
              </div>
              <div className="vitrina">
                <div className="hilo" id="hilo"></div>
                <div className="redactor">
                  <div className="campo" id="campo">
                    <span className="ph">Escribile a tu asesor…</span>
                  </div>
                  <button
                    className="enviar"
                    id="enviar"
                    type="button"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="wrap">
            <p className="remate ancho corto reveal">
              No necesitás aprender a analizar cada número.
              <br />
              Necesitás tener a alguien que <b>los analice con vos.</b>
            </p>
            <p className="fine reveal" style={{ textAlign: "center", marginTop: "18px" }}>
              Disponible 24/7 · Con tu contexto · Con tus objetivos · Con tus números
            </p>

            <div className="paso-cta reveal">
              <a className="lp-btn lp-btn-ghost" href="/signup">
                Probalo con tus propios números
              </a>
              <p className="fine">14 días · No se cobra hasta el día 15</p>
            </div>
          </div>
        </section>

        {/* ══ 04 · CÓMO FUNCIONA ═════════════════════════════════════════════════════
           No es «cómo funciona técnicamente CARTERA+»: es cómo resuelve el problema
           que la sección anterior acaba de hacer sentir. Por eso el bloque NO gira
           alrededor del correo del banco — eso convertiría al producto en una
           herramienta sofisticada para registrar gastos, que es justo lo que no es.

           Versión gerencial: el mensaje es el mismo, la densidad no. Cada paso baja a
           una sola frase y la tarjeta pasa a ser el argumento. Las tres cierran con la
           misma figura — «De X a Y» — para que la fila se lea como una escalera de
           transformación: panorama → historia → decisión.

           La nota de compatibilidad de bancos no está acá a propósito: es demasiado
           operacional para este momento y rompe la percepción de amplitud justo donde
           se está construyendo. Vive en el FAQ. ═══════════════════════════════════ */}
        <section className="soft" id="como">
          <div className="wrap">
            <div className="sec-head center reveal">
              <p className="lp-rotulo">Cómo funciona</p>
              <h2>
                Primero entiende dónde estás.
                <br />
                Después te ayuda a decidir
                <br />
                <em>hacia dónde ir.</em>
              </h2>
              <p className="lead">
                En tres pasos,{" "}
                <span className="cw">
                  CARTERA<i>+</i>
                </span>{" "}
                convierte tu información dispersa en el tipo de lectura financiera que hasta hoy
                solo tenía quien podía pagar un asesor.
              </p>
            </div>

            <div className="pasos">
              {/* 01 · la entrada, sin imponer un método */}
              <div className="paso reveal">
                <p className="lp-n">01</p>
                <h3>Contanos tu realidad financiera</h3>
                <p className="p">
                  Como te resulte más fácil: chat, manual, importar movimientos o las integraciones
                  disponibles.
                </p>
                <div className="art">
                  <div className="cuerpo">
                    <div className="canales">
                      <div className="canal">
                        <span className="lp-ic">💬</span>
                        <b>Chat</b>
                      </div>
                      <div className="canal">
                        <span className="lp-ic ic-v">+</span>
                        <b>Manual</b>
                      </div>
                      <div className="canal">
                        <span className="lp-ic ic-v">↗</span>
                        <b>Banco</b>
                      </div>
                      <div className="canal">
                        <span className="lp-ic ic-v">↧</span>
                        <b>Importar</b>
                      </div>
                    </div>
                    <div className="ejemplo">
                      <span className="dice">«Gasté ₡23.450 en Automercado»</span>
                      <span className="hace">Registrado y clasificado</span>
                    </div>
                  </div>
                  <p className="gana">
                    De datos regados a <em>un panorama completo.</em>
                  </p>
                </div>
              </div>

              {/* 02 · el paso que hoy falta en el mercado: construir contexto */}
              <div className="paso reveal">
                <p className="lp-n">02</p>
                <h3>
                  <span className="cw">
                    CARTERA<i>+</i>
                  </span>{" "}
                  conecta los puntos
                </h3>
                <p className="p">
                  No registra gastos: entiende tu situación. Ingresos, deudas, ahorro y metas, una
                  sola lectura.
                </p>
                <div className="art">
                  <div className="cuerpo">
                    <svg className="hilos" viewBox="0 0 300 176" fill="none" aria-hidden="true">
                      <g stroke="#cfd6cf" strokeWidth="1.2">
                        <path d="M92 22 C 170 22, 180 78, 236 88" />
                        <path d="M92 55 C 170 55, 184 74, 236 88" />
                        <path d="M92 88 C 160 88, 190 88, 236 88" />
                        <path d="M92 121 C 170 121, 184 102, 236 88" />
                        <path d="M92 154 C 170 154, 180 98, 236 88" />
                      </g>
                      <g className="nodos">
                        <rect x="6" y="12" width="86" height="21" rx="10.5" />
                        <text x="20" y="26">
                          Ingresos
                        </text>
                        <rect x="6" y="45" width="86" height="21" rx="10.5" />
                        <text x="20" y="59">
                          Gastos
                        </text>
                        <rect x="6" y="78" width="86" height="21" rx="10.5" />
                        <text x="20" y="92">
                          Deudas
                        </text>
                        <rect x="6" y="111" width="86" height="21" rx="10.5" />
                        <text x="20" y="125">
                          Ahorro
                        </text>
                        <rect x="6" y="144" width="86" height="21" rx="10.5" />
                        <text x="20" y="158">
                          Metas
                        </text>
                      </g>
                      {/* El punto donde todo converge es la marca. Disco blanco con anillo verde
                       para que el isotipo conserve sus dos colores, como el ícono de la app. */}
                      <circle
                        cx="248"
                        cy="88"
                        r="21"
                        fill="#fff"
                        stroke="#378451"
                        strokeWidth="1.6"
                      />
                      <use href="#iso" x="234" y="74" width="28" height="28" />
                    </svg>
                  </div>
                  <p className="gana">
                    De movimientos sueltos a <em>una sola historia.</em>
                  </p>
                </div>
              </div>

              {/* 03 · el salto de información a decisión */}
              <div className="paso reveal">
                <p className="lp-n">03</p>
                <h3>Convertí información en decisiones</h3>
                <p className="p">
                  Cada mes sabés cuál es la decisión que más te mueve la aguja — y por qué es esa y
                  no otra.
                </p>
                <div className="art atencion">
                  <div className="cuerpo">
                    <p className="titulillo">Tu próxima jugada</p>
                    <div className="jugada">
                      <b>Atacá el préstamo del vehículo</b>
                      <span className="tasa">13,5% · tu deuda más cara</span>
                      <span>Cada abono acá vale por tres.</span>
                    </div>
                    <div className="fila">
                      <i className="lp-media"></i>
                      <span>Fondo de emergencia en 1,3 meses</span>
                    </div>
                    <div className="fila">
                      <i className="opor"></i>
                      <span>₡300.000 sin asignar este mes</span>
                    </div>
                  </div>
                  <p className="gana">
                    De información a <em>una decisión clara.</em>
                  </p>
                </div>
              </div>
            </div>

            <p className="remate reveal">
              Vos decidís.
              <br />
              <span className="cw">
                CARTERA<i>+</i>
              </span>{" "}
              te da <b>el contexto para decidir mejor.</b>
            </p>
          </div>
        </section>

        {/* ══ 05 · EL CAMINO — la transformación ════════════════════════════════════
           No son cuatro funcionalidades. Es UN camino, y contesta la pregunta que
           deja el bloque anterior: «entendés dónde estoy, ¿y hacia dónde me llevás?».

           Decisiones de guion:
           · «Tomá el control» y no «Ordena»: ordenar es lo que hace la aplicación,
             tomar el control es lo que logra la persona. El escalón se nombra por el
             resultado del usuario, nunca por la función del producto.
           · Deuda y protección van JUNTAS en el 02. Separarlas dejaba el crecimiento
             patrimonial comprimido al final, y «crecer antes de proteger» no se
             sostiene como secuencia financiera.
           · Nada de «avalancha o bola de nieve» acá: el mecanismo vive dentro del
             producto. En la landing se vende el resultado.
           · Cada tarjeta cierra con un «de → a»: es lo único que dice qué CAMBIA en
             la persona, y es lo que convierte la fila en una transformación.
           ═══════════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="wrap">
            <div className="sec-head center reveal">
              <p className="lp-rotulo">Tu camino financiero</p>
              <h2>
                No importa dónde estés hoy.
                <br />
                Importa saber cuál es
                <br />
                <em>tu siguiente movimiento.</em>
              </h2>
              <p className="lead">
                <span className="cw">
                  CARTERA<i>+</i>
                </span>{" "}
                entiende tu punto de partida y te acompaña paso a paso: primero tomás el control,
                después fortalecés tu base, luego hacés crecer tu patrimonio y, finalmente,
                construís la libertad para elegir cómo querés vivir.
              </p>
            </div>

            {/* El riel: sin esto, cuatro tarjetas en fila se leen como una lista de
               funciones. Con esto se leen como etapas de un recorrido que ya empezó. */}
            <div className="riel reveal">
              <span className="hoy">Hoy</span>
              <span className="via" aria-hidden="true"></span>
              <div className="paradas">
                <div className="parada">
                  <i></i>
                  <span>Control</span>
                </div>
                <div className="parada">
                  <i></i>
                  <span>Base</span>
                </div>
                <div className="parada">
                  <i></i>
                  <span>Crecimiento</span>
                </div>
                <div className="parada">
                  <i></i>
                  <span>Libertad</span>
                </div>
              </div>
            </div>

            <div className="escalera">
              <div className="peld reveal">
                <p className="lp-n">01</p>
                <h3>Tomá el control</h3>
                <p className="clave">Entendé exactamente dónde estás.</p>
                <p className="cuerpo">
                  Reuní ingresos, gastos, compromisos y presupuesto para saber cuánto tenés, cuánto
                  necesitás y cuánto realmente podés mover.
                </p>
                <p className="salto">
                  De no saber a dónde se va <em>a saber exactamente qué está pasando.</em>
                </p>
                <p className="medida">
                  <b>Bajo control</b>
                  <span>16 categorías · ₡755.417</span>
                </p>
              </div>

              <div className="peld reveal">
                <p className="lp-n">02</p>
                <h3>Construí tu base</h3>
                <p className="clave">Liberá capacidad y ganá estabilidad.</p>
                <p className="cuerpo">
                  Priorizá tus deudas, construí tu fondo de emergencia y prepará tus finanzas para
                  que un imprevisto no vuelva a poner todo en cero.
                </p>
                <p className="salto">
                  De reaccionar cada mes <em>a tener margen para decidir.</em>
                </p>
                <p className="medida">
                  <b>Libre de deudas · fondo</b>
                  <span>jul 2030 · 1,3 de 3 meses</span>
                </p>
              </div>

              <div className="peld reveal">
                <p className="lp-n">03</p>
                <h3>Hacé crecer tu patrimonio</h3>
                <p className="clave">Poné tu dinero a trabajar.</p>
                <p className="cuerpo">
                  Transformá tu capacidad de ahorro en inversión y patrimonio, con objetivos,
                  escenarios y una visión clara del riesgo y del tiempo.
                </p>
                <p className="salto">
                  De guardar dinero <em>a construir patrimonio.</em>
                </p>
                <p className="medida">
                  <b>Patrimonio proyectado</b>
                  <span>₡25,5M → ₡34,4M</span>
                </p>
              </div>

              <div className="peld fin reveal">
                <span className="destino">Tu destino</span>
                <p className="lp-n">04</p>
                <h3>Viví tu Rich Life</h3>
                <p className="clave">Convertí tu progreso financiero en libertad de elección.</p>
                <p className="cuerpo">
                  Avanzá hacia tus números de Seguridad, Independencia y Libertad Financiera
                  mientras construís el patrimonio que sostiene la vida que querés vivir.
                </p>
                <p className="salto">
                  De trabajar por dinero <em>a que tu dinero trabaje para tus decisiones.</em>
                </p>
                <p className="medida">
                  <b>Tus tres números</b>
                  <span>Seguridad · Independencia · Libertad</span>
                </p>
              </div>
            </div>

            <p className="remate ancho reveal">
              Tu Rich Life no empieza cuando tengas más dinero.
              <br />
              Empieza cuando <b>sabés qué hacer con el que tenés hoy.</b>
            </p>

            <div className="paso-cta reveal">
              <a className="lp-btn lp-btn-ghost" href="/signup">
                Empezar mi camino
              </a>
              <p className="fine">14 días · No se cobra hasta el día 15</p>
            </div>
          </div>
        </section>

        {/* ══ 06 · EL ESCENARIO — un año, un plan, una dirección ════════════════════
           HONESTIDAD PRIMERO. Esto NO es un testimonio: es un escenario calculado
           con los motores de CARTERA+ sobre un perfil financiero definido. El bloque
           se llamaba «LA PRUEBA» y hablaba de «doce meses de movimientos reales» —
           eso implica evidencia empírica de una familia que efectivamente usó el
           producto un año, y esa familia todavía no existe.

           Se quitó «cuenta demo» (era demasiado operacional) pero se presenta como
           lo que es — una proyección — con su nota al pie. Queda MÁS premium, no
           menos: se está contando una historia, no enseñando una captura.

           Cuando haya usuarios con 6 o 12 meses de historial real, este bloque pasa
           de «CARTERA+ en acción» a «historias reales». Ese cambio es oro para
           conversión y hay que hacerlo apenas se pueda.
           ═══════════════════════════════════════════════════════════════════════ */}
        <section className="soft">
          <div className="wrap">
            <div className="sec-head center reveal">
              <p className="lp-rotulo">Un año. Un plan. Una dirección.</p>
              <h2>
                Mirá lo que puede cambiar
                <br />
                cuando cada decisión
                <br />
                <em>suma a la siguiente.</em>
              </h2>
              <p className="lead">
                Una familia costarricense. Dos ingresos. Deudas, gastos, ahorro y objetivos que
                compiten por el mismo dinero.{" "}
                <span className="cw">
                  CARTERA<i>+</i>
                </span>{" "}
                analiza su punto de partida y proyecta cómo puede evolucionar su situación en 12
                meses cuando cada movimiento sigue una estrategia.
              </p>
            </div>

            <div className="escena-año">
              {/* ENERO · la foto del arranque */}
              <div className="reveal">
                <p className="momento">
                  <b>Enero</b>
                  <i></i>
                  <span className="sello">El punto de partida</span>
                </p>
                <div className="parte">
                  <p className="titular">
                    Ganaban dinero. Pagaban sus cuentas. Pero no estaban avanzando.
                  </p>
                  <div className="tercias">
                    <div className="tercia">
                      <b>Flujo libre al mes</b>
                      <p className="lp-v rojo">−₡14.480</p>
                      <small>Cerraban meses en negativo.</small>
                    </div>
                    <div className="tercia">
                      <b>Deuda más cara</b>
                      <p className="lp-v">₡1.850.000</p>
                      <small>Una tarjeta al 45% anual.</small>
                    </div>
                    <div className="tercia">
                      <b>Patrimonio neto</b>
                      <p className="lp-v">₡25,5M</p>
                      <small>Sin una dirección clara.</small>
                    </div>
                  </div>
                  <p className="moraleja">
                    El problema no era cuánto ganaban.
                    <br />
                    Era <em>el orden en que estaban usando su dinero.</em>
                  </p>
                </div>
              </div>

              {/* EL CAMINO · doce meses, animados.
                 Sin este paso, los números de diciembre parecen magia. Y como el
                 bloque vende PROGRESO, la interfaz tiene que mostrar movimiento:
                 la aguja recorre el año y los tres números van cambiando con ella. */}
              <div className="pasaje reveal">
                <div className="linea" id="linea">
                  <div className="lectura">
                    <p className="mes">
                      <b id="lmes">Enero</b>
                      <span>del escenario</span>
                    </p>
                    <div className="vivos">
                      <div>
                        <b>Flujo del mes</b>
                        <span id="lflujo" className="lp-neg">
                          −₡14.480
                        </span>
                      </div>
                      <div>
                        <b>Deuda más cara</b>
                        <span id="ldeuda">₡1.850.000</span>
                      </div>
                      <div>
                        <b>Patrimonio neto</b>
                        <span id="lpatri">₡25,5M</span>
                      </div>
                    </div>
                  </div>

                  <svg
                    className="grafo"
                    id="grafo"
                    viewBox="0 0 720 168"
                    role="img"
                    aria-label="El flujo libre mensual del escenario pasa de −₡14.480 en enero a +₡173.920 en diciembre, cruzando a positivo en marzo."
                  ></svg>

                  <div className="hitos">
                    <div className="hito" data-mes="0">
                      <i>Ene</i>
                      <b>Ordenar</b>
                      <span>Todos los compromisos, a la vista de una vez.</span>
                    </div>
                    <div className="hito" data-mes="2">
                      <i>Mar</i>
                      <b>Liberar</b>
                      <span>Primer mes que cierra en positivo.</span>
                    </div>
                    <div className="hito" data-mes="5">
                      <i>Jun</i>
                      <b>Proteger</b>
                      <span>Fondo de emergencia levantado.</span>
                    </div>
                    <div className="hito" data-mes="9">
                      <i>Oct</i>
                      <b>Crecer</b>
                      <span>Deuda al 45% eliminada: el dinero cambia de destino.</span>
                    </div>
                  </div>
                </div>
                <p className="nota">
                  Cada decisión liberó capacidad para financiar la siguiente, mientras{" "}
                  <span className="cw">
                    My Agent C<i>+</i>
                  </span>{" "}
                  recalculaba el camino según evolucionaban sus números.
                </p>
              </div>

              {/* DICIEMBRE · el resultado, con el salto en grande */}
              <div className="reveal">
                <p className="momento">
                  <b>12 meses después</b>
                  <i></i>
                  <span className="sello">Mismos ingresos</span>
                </p>
                <div className="parte llega">
                  <p className="titular">
                    Mismos ingresos.
                    <br />
                    Una posición financiera <strong>diferente.</strong>
                  </p>
                  <div className="saltos">
                    <div className="salto-c">
                      <b>Flujo mensual</b>
                      <p className="par">
                        −₡14.480 <s>→</s> <u>+₡173.920</u>
                      </p>
                      <p className="lp-delta">+₡188.400 de capacidad al mes</p>
                      <small>De cerrar meses en negativo a tener con qué decidir.</small>
                    </div>
                    <div className="salto-c">
                      <b>Deuda más cara</b>
                      <p className="par">
                        ₡1.850.000 <s>→</s> <u>₡0</u>
                      </p>
                      <p className="lp-delta">Deuda eliminada</p>
                      <small>
                        Una tarjeta al 45% dejó de consumir dinero que ahora va a otros objetivos.
                      </small>
                    </div>
                    <div className="salto-c">
                      <b>Patrimonio neto</b>
                      <p className="par">
                        ₡25,5M <s>→</s> <u>₡34,4M</u>
                      </p>
                      <p className="lp-delta">+₡8,9 millones</p>
                      <small>Sin depender de un ingreso extraordinario dentro del escenario.</small>
                    </div>
                  </div>
                  <div className="cierre-esc">
                    <p>
                      No se trata solamente de ver tus números crecer.
                      <br />
                      Se trata de ver crecer <em>tus posibilidades.</em>
                    </p>
                    <p className="abre">
                      Más margen para decidir. Más capacidad para invertir. Más protección ante
                      imprevistos. Más libertad para construir lo que sigue.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <p className="letra-chica reveal">
              Escenario ilustrativo calculado con{" "}
              <span className="cw">
                CARTERA<i>+</i>
              </span>{" "}
              a partir de un perfil financiero. Los resultados individuales dependen de ingresos,
              gastos, decisiones, rendimientos y otras circunstancias personales.
            </p>

            <div className="paso-cta reveal">
              <a className="lp-btn lp-btn-ghost" href="/signup">
                Ver qué pasa con mis números
              </a>
              <p className="fine">14 días · No se cobra hasta el día 15</p>
            </div>
          </div>
        </section>

        {/* ══ 07 · POR QUÉ CARTERA+ ═════════════════════════════════════════════════
           No es un bloque para explicar más funciones: es el que CIERRA el argumento
           de venta. El visitante ya vio el problema, cómo se entienden sus finanzas,
           al asesor, el camino y el impacto. Queda una sola pregunta: «¿por qué
           debería confiarle mis finanzas a CARTERA+?».

           Los cuatro argumentos anteriores eran tres DEFENSIVOS y uno comercial. Acá
           van cuatro razones para ELEGIR, no cuatro razones para no tener miedo; la
           seguridad baja a la franja de sellos, que es donde pesa lo justo.

           Y no se termina vendiendo IA. Se termina vendiendo control, criterio y
           progreso: la IA, el agente, los motores de cálculo y los sobres son la
           tecnología detrás. Lo que la persona compra es «quiero dejar de improvisar
           con mi dinero» — ese es el sentimiento con el que tiene que llegar al
           precio, que es la sección siguiente.
           ═══════════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="wrap">
            <div className="sec-head center reveal">
              <p className="lp-rotulo">
                Por qué{" "}
                <span className="cw">
                  CARTERA<i>+</i>
                </span>
              </p>
              <h2>
                Tu dinero es demasiado importante
                <br />
                <em>para manejarlo a ciegas.</em>
              </h2>
              <p className="lead">
                <span className="cw">
                  CARTERA<i>+</i>
                </span>{" "}
                no nació para mostrarte más gráficos. Nació para ayudarte a entender tu posición
                financiera, tomar mejores decisiones y avanzar con un plan construido alrededor de
                tus números.
              </p>
              <p className="subraya" style={{ textAlign: "center" }}>
                No necesitás otra app de finanzas.
                <br />
                Necesitás <em>claridad sobre qué hacer después.</em>
              </p>
            </div>

            <div className="pilares">
              <div className="pilar reveal">
                <p className="lp-n">01 — Conoce tu realidad</p>
                <h3>No parte de promedios. Parte de vos.</h3>
                <p>
                  Tus ingresos, gastos, deudas, ahorro, inversiones, objetivos y decisiones
                  construyen el contexto desde el que{" "}
                  <span className="cw">
                    CARTERA<i>+</i>
                  </span>{" "}
                  te ayuda.
                </p>
                <p className="cierra">Tus números. Tu realidad. Tu estrategia.</p>
              </div>

              {/* Ésta es la razón nº 1 de compra: información sin acción no cambia nada. */}
              <div className="pilar reveal">
                <p className="lp-n">02 — Te dice qué sigue</p>
                <h3>Información sin acción no cambia tus finanzas.</h3>
                <p>
                  <span className="cw">
                    CARTERA<i>+</i>
                  </span>{" "}
                  conecta tus números, identifica prioridades y te ayuda a entender cuál puede ser
                  tu siguiente movimiento y por qué.
                </p>
                <p className="cierra">Menos dudas. Más claridad para decidir.</p>
              </div>

              {/* Acá se vende el valor RECURRENTE de la suscripción. */}
              <div className="pilar reveal">
                <p className="lp-n">03 — Crece con vos</p>
                <h3>Tu asesor no empieza de cero cada vez.</h3>
                <p>
                  <span className="cw">
                    My Agent C<i>+</i>
                  </span>{" "}
                  recuerda tu contexto, tus objetivos y tu progreso para acompañarte a medida que
                  cambia tu vida financiera.
                </p>
                <p className="cierra">Cuanto más avanzás, más contexto tiene para ayudarte.</p>
              </div>

              <div className="pilar reveal">
                <p className="lp-n">04 — Vos tenés el control</p>
                <h3>Tecnología que te asesora. Decisiones que siguen siendo tuyas.</h3>
                <p>
                  <span className="cw">
                    CARTERA<i>+</i>
                  </span>{" "}
                  analiza, calcula y propone escenarios para que entendás las consecuencias antes de
                  decidir.
                </p>
                <p className="cierra">
                  <span className="cw">
                    CARTERA<i>+</i>
                  </span>{" "}
                  propone. Vos decidís.
                </p>
              </div>
            </div>

            <div className="sellos reveal">
              <span>Hecho para Costa Rica</span>
              <span>Sin compartir claves bancarias</span>
              <span>Acciones bajo tu control</span>
              <span>Cálculos basados en tus datos</span>
            </div>

            <p className="remate ancho cierre-porque reveal">
              Tu dinero ya está tomando decisiones todos los días.
              <br />
              Es hora de que <b>vos las dirijás.</b>
            </p>
            <p className="bajo-remate reveal">
              Entendé dónde estás. Sabé qué sigue. Construí hacia donde querés llegar.
            </p>
            <div className="acto reveal">
              <a className="lp-btn btn-green btn-lg" href="/signup">
                Empezar con{" "}
                <span className="cw cw-inv">
                  CARTERA<i>+</i>
                </span>
              </a>
              <p className="fine">
                14 días de prueba · No se cobra hasta el día 15 · Diseñado para Costa Rica
              </p>
            </div>
          </div>
        </section>

        {/* ══ 08 · PLANES ═══════════════════════════════════════════════════════════
           Momento de monetización. Todo lo anterior construyó el valor: acá NO se
           vuelve a explicar la aplicación. La persona mira las tres tarjetas y tiene
           que pensar «este es el nivel que necesito».

           El cambio conceptual: los planes no se diferencian por funcionalidades
           sueltas sino por el NIVEL DE INTELIGENCIA Y ACOMPAÑAMIENTO — que es
           justamente lo más valioso del producto y lo que la landing entera vino
           vendiendo. Por eso cada tarjeta abre con el bloque de My Agent C+ y su
           medidor de tres tramos.

           Posicionamiento que NO hay que romper: Esencial+ deja entrar, Pro+ es la
           experiencia que se quiere vender masivamente, Max+ vende continuidad y
           memoria total. Si Esencial+ se vuelve demasiado bueno, los $34 se comparan
           mentalmente contra otra app de presupuesto en vez de contra tener
           acompañamiento financiero personalizado todos los días.

           NOTA LEGAL: no se dice «ilimitado» en ninguna parte. Hasta confirmar si
           hay política de uso justo, va «máxima capacidad».
           ═══════════════════════════════════════════════════════════════════════ */}
        <section className="soft" id="planes">
          <div className="wrap">
            <div className="sec-head center reveal">
              <p className="lp-rotulo">Planes</p>
              <h2>
                Elegí cuánto querés que
                <br />
                <span className="cw">
                  CARTERA<i>+</i>
                </span>{" "}
                <em>haga por vos.</em>
              </h2>
              <p className="lead">
                Todos los planes te ayudan a entender y organizar tus finanzas. Lo que cambia es la
                profundidad con la que{" "}
                <span className="cw">
                  My Agent C<i>+</i>
                </span>{" "}
                puede conocerte, recordar tu historia y acompañar tus decisiones.
              </p>
              <p className="fine">14 días de prueba · Sin permanencia · Cancelás cuando querás</p>
            </div>

            <div className="planes">
              {/* ── ESENCIAL+ · la puerta de entrada ── */}
              <div className="lp-plan reveal">
                <p className="nom">
                  Esencial<i>+</i>
                </p>
                <p className="promesa">Para tomar el control.</p>
                <p className="precio">
                  <span className="lp-n">$17</span>
                  <span className="lp-m">/ mes</span>
                </p>
                <div className="lp-agente-nivel">
                  <p className="et">
                    <span className="cw">
                      My Agent C<i>+</i>
                    </span>
                  </p>
                  <p className="lv">
                    <b>Esencial</b>
                    <span className="lp-medidor3">
                      <i className="lp-on"></i>
                      <i></i>
                      <i></i>
                    </span>
                  </p>
                  <small>Uso limitado · Memoria básica</small>
                </div>
                <ul>
                  <li>Ingresos, gastos y sobres por categoría</li>
                  <li>Presupuesto y flujo mensual</li>
                  <li>Deudas y estrategias de pago</li>
                  <li>Fondo de emergencia y metas</li>
                  <li>Patrimonio y su evolución en el tiempo</li>
                  <li>Colones y dólares</li>
                </ul>
                <p className="remata">
                  Todo lo que necesitás para dejar de manejar tu dinero a ciegas.
                </p>
                <a
                  className="lp-btn lp-btn-ghost"
                  href="/signup?plan=esencial"
                  style={{ height: "48px" }}
                >
                  Empezar con Esencial+
                </a>
              </div>

              {/* ── PRO+ · la que se quiere vender ──
                 Toda la landing habla de My Agent: acá es donde la persona realmente
                 experimenta el producto que se le acaba de vender. */}
              <div className="lp-plan hot reveal">
                <span className="badge">La experiencia completa</span>
                <p className="nom">
                  Pro<i>+</i>
                </p>
                <p className="promesa">Tu asesor financiero para el día a día.</p>
                <p className="precio">
                  <span className="lp-n">$34</span>
                  <span className="lp-m">/ mes</span>
                </p>
                <div className="lp-agente-nivel">
                  <p className="et">
                    <span className="cw">
                      My Agent C<i>+</i>
                    </span>
                  </p>
                  <p className="lv">
                    <b>Avanzado</b>
                    <span className="lp-medidor3">
                      <i className="lp-on"></i>
                      <i className="lp-on"></i>
                      <i></i>
                    </span>
                  </p>
                  <small>Mayor uso · Memoria ampliada</small>
                </div>
                <ul>
                  <li>
                    <strong>Todo lo de Esencial+</strong>
                  </li>
                  <li>Memoria ampliada de conversaciones, decisiones y objetivos</li>
                  <li>Registro por chat, foto del recibo y las fuentes disponibles</li>
                  <li>Inversiones y análisis de portafolio</li>
                  <li>Comparación de escenarios y proyecciones</li>
                  <li>Finanzas compartidas del hogar</li>
                </ul>
                <p className="remata">
                  Para quien no solo quiere ver sus números. Quiere saber qué hacer con ellos.
                </p>
                <a className="lp-btn btn-green" href="/signup?plan=pro" style={{ height: "48px" }}>
                  Probar Pro+ por 14 días
                </a>
              </div>

              {/* ── MAX+ · continuidad, profundidad y memoria ── */}
              <div className="lp-plan reveal">
                <p className="nom">
                  Max<i>+</i>
                </p>
                <p className="promesa">Toda tu historia. Toda la capacidad.</p>
                <p className="precio">
                  <span className="lp-n">$47</span>
                  <span className="lp-m">/ mes</span>
                </p>
                <p className="delta13">Solo $13 más que Pro+</p>
                <div className="lp-agente-nivel">
                  <p className="et">
                    <span className="cw">
                      My Agent C<i>+</i>
                    </span>
                  </p>
                  <p className="lv">
                    <b>Completo</b>
                    <span className="lp-medidor3">
                      <i className="lp-on"></i>
                      <i className="lp-on"></i>
                      <i className="lp-on"></i>
                    </span>
                  </p>
                  <small>Máxima capacidad · Memoria completa</small>
                </div>
                <ul>
                  <li>
                    <strong>Todo lo de Pro+</strong>
                  </li>
                  <li>Memoria completa de tu historia financiera</li>
                  <li>Análisis financiero de máxima profundidad</li>
                  <li>Inversiones y patrimonio con análisis avanzado</li>
                  <li>Escenarios y proyecciones más completos</li>
                  <li>Contexto integral del hogar</li>
                </ul>
                <p className="remata">
                  Tu asesor no recuerda una conversación. Recuerda tu camino.
                </p>
                <a
                  className="lp-btn lp-btn-ghost"
                  href="/signup?plan=max"
                  style={{ height: "48px" }}
                >
                  Quiero Max+
                </a>
              </div>
            </div>

            <p className="fine reveal" style={{ marginTop: "26px", textAlign: "center" }}>
              Precios de referencia en dólares. Impuestos según tu país.
            </p>

            {/* La última objeción: «no tengo mis finanzas en orden como para empezar». */}
            <p className="remate ancho cierre-precio reveal">
              No necesitás tener tus finanzas resueltas para empezar.
              <br />
              <b>
                Para eso está{" "}
                <span className="cw">
                  CARTERA<i>+</i>
                </span>
                .
              </b>
            </p>
            <div className="acto-precio reveal">
              <p>
                Empezá donde estás.{" "}
                <span className="cw">
                  My Agent C<i>+</i>
                </span>{" "}
                te ayudará a entender qué sigue.
              </p>
              <a className="lp-btn btn-green btn-lg" href="/signup">
                Probar{" "}
                <span className="cw cw-inv">
                  CARTERA<i>+</i>
                </span>{" "}
                14 días
              </a>
              <p className="fine" style={{ marginTop: "14px" }}>
                No se cobra hasta el día 15 · Cancelás cuando querás
              </p>
            </div>
          </div>
        </section>

        {/* ══ 10 · CIERRE ══ */}
        {/* ══ 09 · EL CIERRE ════════════════════════════════════════════════════════
           Acá no se vende nada más: ya se vendió. Sin tarjetas, sin cifras y SIN
           BOTÓN — quien llegó hasta abajo ya pasó por cuatro CTA y por el precio, y
           otro más convertiría el final en un banner. Esto es marca.

           El titular gira del pasado al futuro: «falta entenderla / analizarla /
           conectarla / proyectarla» y termina en «ahora construí lo que sigue». Hasta
           este punto la página analiza lo que ya pasó; la última línea mira adelante.
           ═══════════════════════════════════════════════════════════════════════ */}
        <section className="cierre">
          <div className="wrap reveal">
            <p className="lp-rotulo">
              Por eso existe{" "}
              <span className="cw">
                CARTERA<i>+</i>
              </span>
            </p>
            <h2 style={{ marginTop: "18px" }}>
              Tu dinero ya cuenta una historia.
              <br />
              <span className="linea2" id="linea2" aria-hidden="true">
                <span className="gira" id="gira">
                  Falta <em>entenderla.</em>
                </span>
              </span>
              <span className="sr">Ahora construí lo que sigue.</span>
            </h2>
            <p className="lead">
              <span className="cw">
                CARTERA<i>+</i>
              </span>{" "}
              conecta tus números, tus decisiones y tus objetivos para ayudarte a entender dónde
              estás, decidir qué sigue y avanzar hacia la vida financiera que querés construir.
            </p>

            <div className="firma">
              <p className="trilogia">
                Entendé dónde estás.
                <br />
                Decidí qué sigue.
                <br />
                <em>Construí hacia dónde querés llegar.</em>
              </p>
              <p className="marca">
                <span className="cw">
                  CARTERA<i>+</i>
                </span>
                <span className="sep">·</span>Tu asesor financiero, siempre con vos.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="pie">
        <div className="wrap in">
          <span>
            <span className="cw">
              CARTERA<i>+</i>
            </span>{" "}
            · Costa Rica
          </span>
          <span>Es información y educación financiera, no asesoría formal. © 2026</span>
        </div>
      </footer>

      <div className="cta-fijo">
        <a className="lp-btn btn-green btn-lg" href="/signup">
          <span className="disco">
            <svg className="cm">
              <use href="#iso" />
            </svg>
          </span>
          Probá 14 días
        </a>
      </div>
      <LandingMotion />
    </div>
  );
}
