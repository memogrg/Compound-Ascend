import "./faqs.css";
import { FaqsMotion } from "./faqs-motion";

/**
 * Las preguntas frecuentes: 69 en 12 temas.
 *
 * Están fuera de la landing a propósito. En la landing, seis preguntas eran un
 * trámite antes del precio; una landing no aguanta sesenta sin dejar de vender,
 * y una página de FAQ vive de ellas.
 *
 * Los acordeones son <details>: funcionan sin JavaScript y el ⌘F del navegador
 * los encuentra igual. El CSS va prefijado con `.lp` por lo mismo que la
 * landing —nombres genéricos que ya existen en globals.css—.
 */
export function Faqs() {
  return (
    <div className="lp">
      {/* El isotipo, el mismo símbolo de la landing. */}
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
          <a className="lp-brand" href="/A" aria-label="CARTERA+">
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
            <a href="/A#como">Cómo funciona</a>
            <a href="/A#planes">Planes</a>
            <a href="/faqs" className="act">
              FAQs
            </a>
            <a href="#" className="lp-btn lp-btn-ghost">
              Iniciar sesión
            </a>
            <a href="#" className="lp-btn btn-green">
              Probá 14 días
            </a>
          </nav>
        </div>
      </header>

      <main>
        <div className="wrap tope">
          <p className="lp-rotulo">Preguntas frecuentes</p>
          <h1>
            Todo lo que querés saber
            <br />
            <em>antes y después de empezar.</em>
          </h1>
          <p className="lead">
            Cómo entran tus datos, cómo se manejan las dos monedas, cómo se calcula la salida de tus
            deudas, qué hace exactamente{" "}
            <span className="cw">
              My Agent C<i>+</i>
            </span>{" "}
            y qué no. Sin letra chica.
          </p>

          <div className="buscador">
            <input
              id="q"
              type="search"
              placeholder="Buscá una palabra: dólares, avalancha, cancelar…"
              autoComplete="off"
              aria-label="Buscar en las preguntas frecuentes"
            />
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </div>
          <p className="conteo" id="conteo"></p>
        </div>

        <div className="wrap cuerpo">
          <nav className="indice" id="indice">
            <p>Temas</p>
            <a href="#empezar">Empezar</a>
            <a href="#datos">Tus datos</a>
            <a href="#monedas">Monedas y Costa Rica</a>
            <a href="#presupuesto">Presupuesto y sobres</a>
            <a href="#deudas">Deudas</a>
            <a href="#ahorro">Ahorro y protección</a>
            <a href="#inversiones">Inversiones</a>
            <a href="#patrimonio">Patrimonio</a>
            <a href="#agente">My Agent C+</a>
            <a href="#hogar">Hogar compartido</a>
            <a href="#planes">Planes y pagos</a>
            <a href="#seguridad">Seguridad y privacidad</a>
          </nav>

          <div id="preguntas">
            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="empezar">
              <h2>Empezar</h2>
              <p className="lp-sub">Lo primero que se pregunta todo el mundo.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Cuánto tardo en tener algo útil en pantalla?</summary>
                  <div className="lp-r">
                    <p>
                      Una tarde. El arranque te pide tus ingresos, tus gastos fijos, tus deudas y lo
                      que tenés ahorrado o invertido. Con eso ya salen tu flujo mensual, tu fecha
                      estimada de salida de deudas y tu patrimonio neto.
                    </p>
                    <p>
                      No necesitás cargar un año de historia para empezar.{" "}
                      <strong>Empezá con los últimos tres meses</strong> y el resto se va llenando
                      solo conforme registrás.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Tengo que tener mis finanzas ordenadas para empezar?</summary>
                  <div className="lp-r">
                    <p>
                      No. Es al revés: el desorden es el punto de partida normal.{" "}
                      <span className="cw">
                        CARTERA<i>+</i>
                      </span>{" "}
                      no te pide que llegues ordenado, te ayuda a ordenarte.
                    </p>
                    <p>
                      Si no sabés cuánto gastás en algo, poné un estimado. Un número aproximado hoy
                      vale más que uno exacto dentro de seis meses.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué me va a preguntar al inicio?</summary>
                  <div className="lp-r">
                    <p>
                      Seis bloques:{" "}
                      <strong>ingresos, gastos, ahorros, deudas, inversiones y protección</strong>.
                      De ahí se deriva todo lo demás — presupuesto, patrimonio, índice, metas — sin
                      volver a preguntarte lo mismo.
                    </p>
                    <p>
                      Podés dejar bloques a medias y completarlos después. La app funciona con lo
                      que le hayas dado.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Puedo probar sin poner mis datos reales?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Durante los <strong>14 días de prueba</strong> usás la aplicación como
                      querás: con tus números reales, con cifras inventadas para ver cómo se
                      comporta, o con una mezcla de las dos. Nadie te obliga a cargar nada antes de
                      tiempo, y lo que pongás de prueba lo podés borrar o corregir después.
                    </p>
                    <p>
                      Para abrir la cuenta sí se registra una tarjeta de débito o crédito.{" "}
                      <strong>No se cobra nada durante los 14 días</strong>: el primer cobro se hace
                      al vencer la prueba, y si cancelás antes, no se cobra.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Sirve si soy independiente y mis ingresos varían?</summary>
                  <div className="lp-r">
                    <p>
                      Sí, y de hecho ahí es donde más ayuda. Podés registrar varias fuentes de
                      ingreso con distinta frecuencia — mensual, quincenal, por proyecto — y el
                      presupuesto trabaja con tu promedio real, no con un salario fijo que no tenés.
                    </p>
                    <p>
                      Para meses irregulares conviene mirar el flujo libre acumulado en vez del mes
                      suelto: es la métrica que{" "}
                      <span className="cw">
                        My Agent C<i>+</i>
                      </span>{" "}
                      usa para decirte cuánto podés comprometer sin ahogarte.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Funciona desde el celular?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Es una aplicación web que corre en el navegador del teléfono, la tablet y
                      la computadora, con la misma cuenta y la misma información en los tres.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Necesito saber de finanzas para usarla?</summary>
                  <div className="lp-r">
                    <p>
                      No. Las decisiones se te presentan en español claro y con el porqué al lado:
                      por qué esta deuda antes que la otra, por qué conviene el fondo antes de
                      invertir, qué cambia si abonás de más este mes.
                    </p>
                    <p>
                      Si querés el detalle técnico, está un clic más adentro. Si no, no te lo
                      cruzás.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="datos">
              <h2>Tus datos y cómo entran</h2>
              <p className="lp-sub">Cuatro vías, y ninguna es obligatoria.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Cómo registro mis movimientos?</summary>
                  <div className="lp-r">
                    <p>Como te resulte más fácil, y podés mezclar las cuatro vías:</p>
                    <ul>
                      <li>
                        <strong>Por chat:</strong> le escribís «gasté ₡23.450 en el súper» y queda
                        registrado y clasificado.
                      </li>
                      <li>
                        <strong>Manual:</strong> el formulario de siempre, para cuando querés
                        control fino.
                      </li>
                      <li>
                        <strong>Foto del recibo:</strong> se lee el monto, el comercio y la fecha.
                      </li>
                      <li>
                        <strong>Importando:</strong> el estado de cuenta en CSV, o la lectura
                        automática de los avisos de tu banco donde esté disponible.
                      </li>
                    </ul>
                    <p>
                      El registro manual y por chat están en los tres planes. La foto del recibo y
                      la lectura automática del correo entran desde <strong>Pro+</strong>.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Tengo que darles la clave de mi banco?</summary>
                  <div className="lp-r">
                    <p>
                      <strong>No, y no es una política: es que no existe el campo.</strong>{" "}
                      <span className="cw">
                        CARTERA<i>+</i>
                      </span>{" "}
                      nunca pide ni guarda credenciales bancarias, ni tiene forma de iniciar sesión
                      en tu banco.
                    </p>
                    <p>
                      La lectura automática funciona con los avisos que tu banco{" "}
                      <em>ya te manda por correo</em>: vos los reenviás, la app los lee. Nada más.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Cómo funciona la lectura automática del correo?</summary>
                  <div className="lp-r">
                    <p>
                      La app te da una dirección propia. Configurás en tu correo una regla que
                      reenvíe ahí los avisos de compra de tu banco, y cada aviso que llega se
                      convierte en un movimiento propuesto.
                    </p>
                    <p>
                      <strong>Se propone, no se registra solo.</strong> Vos confirmás — o editás, o
                      descartás — antes de que entre a tus números.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Y si mi banco no está entre los que se leen automáticamente?</summary>
                  <div className="lp-r">
                    <p>
                      Hoy la lectura automática cubre los avisos de <strong>BAC</strong>. Con
                      cualquier otro banco seguís teniendo las otras tres vías: foto del recibo,
                      importación del estado de cuenta en CSV, o registro por chat en cinco
                      segundos.
                    </p>
                    <p>
                      Los parsers de <strong>BNCR y BCR</strong> están en camino. Que tu banco no
                      esté todavía no te deja fuera de nada: cambia cuánto tenés que escribir, no lo
                      que la app puede hacer con tus números.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Se puede corregir un movimiento mal clasificado?</summary>
                  <div className="lp-r">
                    <p>
                      Sí, y conviene hacerlo: la clasificación aprende de tus correcciones. Si movés
                      «Automercado» de Supermercado a Hogar, la próxima vez lo propone donde vos lo
                      pusiste.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Puedo sacar mi información si algún día me voy?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Desde la configuración descargás{" "}
                      <strong>un archivo de Excel con todo</strong>: movimientos, presupuesto,
                      deudas, inversiones, metas, seguros y perfil, cada tema en su propia hoja. Si
                      compartís hogar, el archivo trae el hogar completo y cada movimiento lleva su
                      autor.
                    </p>
                    <p>
                      Y podés borrar la cuenta completa desde ahí mismo. Al borrarla se elimina todo
                      lo asociado, no queda una copia «por si acaso».
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué pasa si dejo de registrar un mes?</summary>
                  <div className="lp-r">
                    <p>
                      Nada se rompe. Los meses sin movimientos quedan como están y el histórico
                      sigue ahí cuando volvés. Lo único que se resiente es la precisión de las
                      proyecciones, porque trabajan con tu promedio real.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="monedas">
              <h2>Monedas y Costa Rica</h2>
              <p className="lp-sub">
                Colones y dólares en la misma cuenta, sin hacer cuentas aparte.
              </p>
              <div className="lista">
                <details className="qa">
                  <summary>Gano en colones y ahorro en dólares. ¿Sirve?</summary>
                  <div className="lp-r">
                    <p>
                      Sí, y es el caso normal en Costa Rica. Las dos monedas conviven en la misma
                      cuenta: cada movimiento, deuda o inversión guarda su propia moneda y la app
                      convierte al tipo de cambio para mostrarte los totales.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué es la moneda principal y para qué sirve?</summary>
                  <div className="lp-r">
                    <p>
                      Es la moneda en la que querés <em>pensar</em>. Todos los agregados —patrimonio
                      neto, flujo del mes, índice patrimonial— se calculan y se muestran en ella,
                      aunque por debajo cada dato conserve la suya.
                    </p>
                    <p>
                      Podés cambiarla cuando querás y ver el mismo panorama en la otra moneda. Los
                      números no cambian de valor, cambian de unidad.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué tipo de cambio usan?</summary>
                  <div className="lp-r">
                    <p>
                      El del día para las conversiones de pantalla. Un movimiento registrado en
                      dólares queda guardado en dólares para siempre: no se «congela» convertido,
                      así que un cambio de tipo de cambio no te reescribe la historia.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Contempla aguinaldo, salario escolar y marchamo?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Son ingresos y gastos que no caen todos los meses pero sí todos los años,
                      y tratarlos como si fueran mensuales distorsiona el presupuesto entero.
                    </p>
                    <p>
                      Se registran con su frecuencia real y aparecen donde corresponde: el aguinaldo
                      como ingreso de fin de año, el marchamo como el gasto de diciembre que te
                      desarma enero si no lo viste venir.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Es una app gringa traducida?</summary>
                  <div className="lp-r">
                    <p>
                      No. Está pensada desde Costa Rica: dos monedas conviviendo, aguinaldo y
                      salario escolar, marchamo, tasas locales, y bancos de acá. Los productos
                      traducidos fallan justo en eso — asumen una sola moneda y doce meses iguales.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="presupuesto">
              <h2>Presupuesto, sobres y flujo</h2>
              <p className="lp-sub">El plan del mes, y lo que realmente tenés.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Qué son los sobres?</summary>
                  <div className="lp-r">
                    <p>
                      Es el plan de tu flujo: repartís lo que entra en categorías —súper, casa,
                      transporte, gustos, ahorro— y cada gasto descuenta del sobre que le toca. Así
                      ves de un vistazo dónde te queda espacio y dónde ya te pasaste.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Cuál es la diferencia entre el sobre y el dinero que tengo?</summary>
                  <div className="lp-r">
                    <p>
                      Es la distinción más importante de la app.{" "}
                      <strong>Los sobres son el plan; la liquidez es el dinero real.</strong> Podés
                      tener el sobre de «gustos» intacto y aun así no tener plata en la cuenta,
                      porque el sobre dice lo que <em>pensás</em> gastar, no lo que <em>tenés</em>.
                    </p>
                    <p>
                      Por eso hay un saldo de liquidez aparte, que se actualiza con cada movimiento
                      y con el cierre de cada mes.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué es el flujo libre?</summary>
                  <div className="lp-r">
                    <p>
                      Lo que te queda al mes después de ingresos menos gastos y compromisos. Es el
                      número que manda: mientras esté en negativo, todo lo demás —ahorrar, invertir,
                      salir de deudas— compite por dinero que no existe.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Puedo cambiar el presupuesto a mitad de mes?</summary>
                  <div className="lp-r">
                    <p>
                      Sí, cuando querás. Un presupuesto que no se puede ajustar deja de usarse al
                      segundo mes. Si un sobre te quedó corto, lo movés y se recalcula el resto.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué pasa al cerrar el mes?</summary>
                  <div className="lp-r">
                    <p>
                      Se guarda una fotografía del mes —ingresos, gastos, flujo, patrimonio— y el
                      saldo neto se suma o resta a tu liquidez real. Ese histórico es lo que después
                      alimenta las tendencias y las proyecciones.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="deudas">
              <h2>Deudas</h2>
              <p className="lp-sub">Cómo se decide cuál atacar primero y cuándo salís.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Cómo decide cuál deuda pagar primero?</summary>
                  <div className="lp-r">
                    <p>Con dos estrategias, y elegís vos:</p>
                    <ul>
                      <li>
                        <strong>Avalancha:</strong> primero la de <em>tasa más alta</em>. Es la que
                        menos intereses te cuesta en total — matemáticamente la mejor.
                      </li>
                      <li>
                        <strong>Bola de nieve:</strong> primero la de <em>saldo más chico</em>.
                        Cuesta un poco más en intereses, pero cerrás deudas antes y eso sostiene el
                        hábito.
                      </li>
                    </ul>
                    <p>
                      La app te muestra el orden de ataque, la fecha de salida y los intereses
                      totales de cada una para que compares antes de elegir.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿De dónde sale la fecha en que quedo libre de deudas?</summary>
                  <div className="lp-r">
                    <p>
                      De una amortización real: saldo, tasa anual, cuota y el orden de ataque que
                      elegiste. Se calcula mes a mes, no con una regla de tres.
                    </p>
                    <p>
                      Es una proyección con los datos de hoy: si cambia una tasa, una cuota o hacés
                      un abono extra, la fecha se recalcula.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué pasa si hago un abono extra?</summary>
                  <div className="lp-r">
                    <p>
                      Lo registrás y la fecha de salida se adelanta, con el ahorro en intereses a la
                      vista. Podés simular el abono antes de hacerlo para ver cuánto mueve la aguja:
                      es una de las preguntas que{" "}
                      <span className="cw">
                        My Agent C<i>+</i>
                      </span>{" "}
                      contesta con tus números.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué es una «deuda mala»?</summary>
                  <div className="lp-r">
                    <p>
                      La que te cuesta más de lo que cualquier inversión razonable te puede rendir.
                      En la práctica, la app marca como deuda cara la que está{" "}
                      <strong>por encima del 25% anual</strong> — tarjetas y crédito de consumo,
                      casi siempre.
                    </p>
                    <p>
                      La hipoteca a tasa moderada no entra en esa categoría: no toda deuda es un
                      problema, y tratarlas igual lleva a decisiones malas.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Me conviene abonar a la deuda o invertir ese dinero?</summary>
                  <div className="lp-r">
                    <p>
                      Es exactamente la comparación que hace la app: la tasa de tu deuda contra el
                      rendimiento esperado de la inversión, con tus montos y tus plazos. Pagar una
                      deuda al 24% es un rendimiento del 24% garantizado — difícil de ganarle.
                    </p>
                    <p>
                      Y la respuesta contempla tu situación completa, no solo la aritmética: si no
                      tenés fondo de emergencia, la respuesta puede cambiar.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Me avisa antes de que se venza una cuota?</summary>
                  <div className="lp-r">
                    <p>
                      Sí, con recordatorios de las cuotas próximas. Podés elegir por qué canal te
                      llegan —o apagarlos— desde la configuración.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="ahorro">
              <h2>Ahorro, metas y protección</h2>
              <p className="lp-sub">Lo que sostiene el avance cuando algo sale mal.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Cuánto debería tener en el fondo de emergencia?</summary>
                  <div className="lp-r">
                    <p>
                      La referencia habitual son <strong>tres a seis meses de gastos</strong>. La
                      app te muestra tu cobertura actual en meses —no en colones— porque el número
                      que importa es cuánto tiempo aguantás sin ingresos, y eso depende de cuánto
                      gastás.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Cómo funcionan las metas de ahorro?</summary>
                  <div className="lp-r">
                    <p>
                      Definís el monto y la fecha, y la app calcula cuánto tenés que apartar por mes
                      y si eso cabe en tu flujo. Si no cabe, te lo dice: una meta marcada como no
                      viable es más útil que una que te miente durante ocho meses.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿El dinero de mis metas cuenta como patrimonio?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Lo que llevás acumulado en cada meta suma a tu patrimonio líquido y por lo
                      tanto entra en tus meses de independencia y en tu Número de Libertad.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué es el «fondo de paz»?</summary>
                  <div className="lp-r">
                    <p>
                      Es la reserva que va más allá de la emergencia: el colchón que te permite
                      tomar decisiones sin apuro —cambiar de trabajo, aguantar un mal trimestre,
                      decir que no— en vez de solo sobrevivir un imprevisto.
                    </p>
                    <p>
                      Son <strong>de 3 a 6 meses de tu gasto esencial</strong> —vos elegís cuántos—
                      y se arma <em>después</em> del fondo de emergencia, no en paralelo. La app lo
                      dimensiona con tu gasto real y te dice cuánto falta y de cuánto tendría que
                      ser el aporte para cerrarlo.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué toma en cuenta de mis seguros?</summary>
                  <div className="lp-r">
                    <p>
                      Registrás tus pólizas con su cobertura y su prima. Entran en el presupuesto
                      como gasto y en el patrimonio como protección, que es una de las dimensiones
                      del índice: podés tener buen patrimonio y estar mal protegido, y eso conviene
                      verlo antes de que pase algo.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="inversiones">
              <h2>Inversiones</h2>
              <p className="lp-sub">Qué mide, qué proyecta y qué no hace.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿CARTERA+ invierte mi dinero?</summary>
                  <div className="lp-r">
                    <p>
                      <strong>No.</strong> No es una casa de bolsa ni una plataforma de inversión:
                      no mueve tu dinero, no ejecuta órdenes y no tiene acceso a tus cuentas de
                      inversión. Registrás lo que ya tenés y la app lo analiza.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Me dice en qué invertir?</summary>
                  <div className="lp-r">
                    <p>
                      No te recomienda instrumentos ni emisores concretos. Lo que hace es analizar{" "}
                      <em>tu</em> portafolio: cuánto tenés en cada clase de activo, qué tan
                      concentrado estás, cuánto es líquido, cuánto genera ingreso, y cómo se compara
                      eso con tus objetivos y tu horizonte.
                    </p>
                    <p>
                      <span className="cw">
                        CARTERA<i>+</i>
                      </span>{" "}
                      no es un asesor de inversiones registrado y no sustituye a uno.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué tipos de inversión puedo registrar?</summary>
                  <div className="lp-r">
                    <p>
                      Las clases habituales: certificados a plazo, fondos, acciones, bonos, bienes
                      raíces, participación en un negocio, cripto y activos alternativos. Cada una
                      con su moneda, su valor actual y su liquidez.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Cómo mide si estoy bien diversificado?</summary>
                  <div className="lp-r">
                    <p>
                      Con dos cosas distintas: <strong>concentración</strong> (cuánto pesa tu
                      posición más grande) y <strong>diversificación</strong> (en cuántas clases de
                      activo estás repartido). Se puede estar en muchas cosas y aun así tener el 70%
                      en una sola: por eso se miden aparte.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Puedo proyectar cuánto tendría en X años?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Definís el monto, el aporte mensual, el plazo y un rendimiento esperado, y
                      la app te muestra el escenario con el riesgo a la vista.
                    </p>
                    <p>
                      Son proyecciones, no promesas: un rendimiento esperado es un supuesto, y la
                      app lo trata como tal.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué es la tasa de inversión?</summary>
                  <div className="lp-r">
                    <p>
                      Qué proporción de lo que ganás termina convertido en patrimonio productivo, en
                      vez de gastarse o quedarse quieto. Es una de las ocho dimensiones del índice
                      patrimonial y una de las que más lo mueve en el largo plazo.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Y la cobertura pasiva?</summary>
                  <div className="lp-r">
                    <p>
                      Qué parte de tus gastos mensuales ya está cubierta por ingresos que no
                      dependen de que trabajés —alquileres, dividendos, intereses—. Al 100%, tus
                      gastos se pagan solos. Es la métrica que traduce «patrimonio» a «libertad».
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="patrimonio">
              <h2>Patrimonio</h2>
              <p className="lp-sub">Las métricas que miden dónde estás de verdad.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Qué es el Índice Patrimonial?</summary>
                  <div className="lp-r">
                    <p>
                      Una nota de <strong>0 a 100</strong> que resume tu situación en ocho
                      dimensiones: patrimonio neto ajustado, patrimonio invertible, meses de
                      libertad, cobertura pasiva, tasa de inversión, calidad de la deuda, protección
                      y diversificación.
                    </p>
                    <p>
                      No es una calificación moral. Es una forma de ver en un número si el conjunto
                      está mejorando o no.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué significa mi nivel?</summary>
                  <div className="lp-r">
                    <p>El índice cae en uno de siete niveles:</p>
                    <ul>
                      <li>
                        <span className="mono">0–15</span> · Punto de partida
                      </li>
                      <li>
                        <span className="mono">16–30</span> · Base en construcción
                      </li>
                      <li>
                        <span className="mono">31–45</span> · Estabilidad inicial
                      </li>
                      <li>
                        <span className="mono">46–60</span> · Constructor patrimonial
                      </li>
                      <li>
                        <span className="mono">61–75</span> · Patrimonio sólido
                      </li>
                      <li>
                        <span className="mono">76–90</span> · Alta independencia
                      </li>
                      <li>
                        <span className="mono">91–100</span> · Libertad patrimonial
                      </li>
                    </ul>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué es el Número de Libertad?</summary>
                  <div className="lp-r">
                    <p>
                      El patrimonio que necesitarías para que tus gastos se paguen solos:{" "}
                      <strong>tu gasto anual multiplicado por un factor</strong> (25, 30 o 33, según
                      qué tan conservador quieras ser).
                    </p>
                    <p>
                      Es la cifra que convierte una aspiración vaga —«ser libre financieramente»— en
                      un objetivo con monto.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Y los Años de Libertad?</summary>
                  <div className="lp-r">
                    <p>
                      Cuántos años podrías vivir con tu patrimonio invertible al ritmo de gasto
                      actual. Es el mismo cálculo mirado desde el otro lado: en vez de «cuánto me
                      falta», «cuánto ya tengo comprado».
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Por qué mi casa no vale lo mismo en el cálculo?</summary>
                  <div className="lp-r">
                    <p>
                      Porque no todo activo es igual de disponible. Para el patrimonio{" "}
                      <em>ajustado</em> se aplica un descuento por clase, según qué tan rápido y qué
                      tan seguro podrías convertirlo en dinero:
                    </p>
                    <ul>
                      <li>Efectivo: 100%</li>
                      <li>Inversiones líquidas: 95–100%</li>
                      <li>Bonos y fondos: 90–100%</li>
                      <li>Bienes raíces: 75–90%</li>
                      <li>Vehículo: 50–80%</li>
                      <li>Cripto: 50–80%</li>
                      <li>Participación en un negocio: 40–80%</li>
                      <li>Coleccionables: 30–70%</li>
                    </ul>
                    <p>
                      Tu patrimonio neto sin ajustar también está a la vista. Son dos lecturas
                      distintas y las dos sirven.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué es el patrimonio invertible?</summary>
                  <div className="lp-r">
                    <p>
                      La parte de tu patrimonio que efectivamente puede trabajar para vos:
                      inversiones y activos productivos. Tu casa de habitación es patrimonio, pero
                      no te genera ingreso — por eso no entra en esta métrica.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Me avisa si algo se está poniendo frágil?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. La app detecta señales concretas —patrimonio neto negativo, patrimonio
                      alto con poca liquidez, buena tasa de inversión con poca protección, deuda
                      cara creciendo, concentración excesiva, gasto alto contra patrimonio— y te las
                      muestra con la acción que corresponde.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="agente">
              <h2>My Agent C+</h2>
              <p className="lp-sub">Qué hace, qué recuerda y dónde están los límites.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿La IA se inventa los números?</summary>
                  <div className="lp-r">
                    <p>
                      No puede: <strong>no es ella la que calcula</strong>. Las cifras las producen
                      motores de cálculo determinísticos —amortización, patrimonio, presupuesto— y{" "}
                      <span className="cw">
                        My Agent C<i>+</i>
                      </span>{" "}
                      las interpreta y las explica. Si te da un número, viene de tus datos.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué sabe de mí exactamente?</summary>
                  <div className="lp-r">
                    <p>
                      Tus ingresos, gastos, presupuesto, deudas con su tasa real, ahorros, metas,
                      inversiones, patrimonio y las decisiones que fuiste tomando. Ese contexto es
                      lo que hace que la respuesta sea sobre vos y no un consejo genérico de
                      internet.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Se acuerda de lo que hablamos la vez pasada?</summary>
                  <div className="lp-r">
                    <p>
                      Sí, y esa es buena parte del valor. Recuerda tus prioridades, lo que decidiste
                      y cómo venís progresando, así que cada conversación continúa donde quedó la
                      anterior en vez de empezar de cero.
                    </p>
                    <p>La profundidad de esa memoria es una de las diferencias entre los planes.</p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Cuántas veces puedo preguntarle al mes?</summary>
                  <div className="lp-r">
                    <p>
                      Alrededor de <strong>100 consultas al mes en Esencial</strong>, unas{" "}
                      <strong>250 en Pro</strong> y unas <strong>500 en Max</strong>. Son cifras
                      aproximadas a propósito: una pregunta corta consume menos que una que obliga a
                      revisar todo tu patrimonio, así que el número real se mueve según lo que
                      preguntés.
                    </p>
                    <p>
                      Para dimensionarlo: en Esencial son unas tres consultas por día, todos los
                      días del mes. No es un plan pensado para que estés midiendo cuánto te queda.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Puede hacer cambios en mi cuenta sin que yo sepa?</summary>
                  <div className="lp-r">
                    <p>
                      No. Cuando propone registrar o modificar algo,{" "}
                      <strong>te lo muestra y espera tu confirmación</strong>. Podés aceptarlo,
                      editarlo o descartarlo. Las acciones importantes no se ejecutan solas.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Es un asesor financiero certificado?</summary>
                  <div className="lp-r">
                    <p>
                      No. Es una herramienta de análisis y acompañamiento: te ayuda a entender tus
                      números y a comparar escenarios, pero no sustituye a un profesional
                      certificado, ni a tu contador, ni a tu abogado.
                    </p>
                    <p>
                      Las decisiones son tuyas, y para asuntos fiscales, legales o de inversión
                      regulada conviene consultar a un especialista.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>
                    ¿Qué pasa si le pregunto algo que no tiene que ver con mi plata?
                  </summary>
                  <div className="lp-r">
                    <p>
                      Te va a devolver a lo suyo. Está hecho para finanzas personales; no es un
                      asistente de propósito general y no pretende serlo.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="hogar">
              <h2>Hogar compartido</h2>
              <p className="lp-sub">Cuando la plata se decide entre dos.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Funciona para una pareja?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Un hogar puede tener dos adultos y sus dependientes, con los gastos
                      comunes en un solo lugar y el panorama financiero consolidado.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Cada quien ve todo?</summary>
                  <div className="lp-r">
                    <p>
                      Lo que está en el hogar es compartido: esa es la idea. Si hay algo que
                      preferís mantener aparte, se registra fuera del hogar.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Se puede empezar solo y sumar a alguien después?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Podés arrancar por tu cuenta y convertir la cuenta en hogar más adelante
                      sin perder lo que ya cargaste.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="planes">
              <h2>Planes, pagos y cuenta</h2>
              <p className="lp-sub">Qué cambia entre planes y cómo se cancela.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Cuál es la diferencia real entre los planes?</summary>
                  <div className="lp-r">
                    <p>
                      La profundidad del acompañamiento. Las herramientas financieras están en los
                      tres; lo que cambia es cuánto podés usar a{" "}
                      <span className="cw">
                        My Agent C<i>+</i>
                      </span>{" "}
                      y cuánta memoria tiene de tu historia:
                    </p>
                    <ul>
                      <li>
                        <strong>Esencial+</strong> — uso esencial, memoria básica. Para ordenarte.
                      </li>
                      <li>
                        <strong>Pro+</strong> — mayor uso, memoria ampliada, inversiones y hogar.
                        Para decidir con acompañamiento.
                      </li>
                      <li>
                        <strong>Max+</strong> — máxima capacidad y memoria completa de tu historia
                        financiera.
                      </li>
                    </ul>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Me van a cobrar sin avisar?</summary>
                  <div className="lp-r">
                    <p>
                      Tenés 14 días de prueba y cancelás desde tu configuración, sin escribirle a
                      nadie. No hay permanencia ni penalización por salir.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Necesito tarjeta para probar?</summary>
                  <div className="lp-r">
                    <p>
                      Sí. Para abrir la cuenta se registra una tarjeta de débito o crédito, pero{" "}
                      <strong>durante los 14 días no se cobra nada</strong>. El primer cobro se hace
                      al vencer la prueba, y si cancelás antes, no se cobra.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Puedo cambiar de plan después?</summary>
                  <div className="lp-r">
                    <p>Sí, para arriba o para abajo, cuando querás.</p>
                    <p>
                      <strong>Al subir</strong>, el cambio entra de una y se cobra la diferencia.{" "}
                      <strong>Al bajar</strong>, seguís con todo lo de tu plan actual hasta que
                      venza el mes que ya pagaste — y ahí entra el nuevo.
                    </p>
                    <p>
                      Tu información nunca se pierde al cambiar de plan. Lo que cambia es qué podés
                      hacer con ella. La única excepción es el hogar compartido: es parte de{" "}
                      <strong>Max+</strong>, así que al bajar a otro plan el hogar se deshace. Vos
                      conservás tu cuenta y tus datos; las otras personas también conservan los
                      suyos, pero pasan a tener su propia suscripción.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Los precios están en dólares o en colones?</summary>
                  <div className="lp-r">
                    <p>
                      Los precios de referencia se muestran en dólares. Los impuestos aplican según
                      tu país.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>Si cancelo, ¿qué pasa con mi información?</summary>
                  <div className="lp-r">
                    <p>
                      Queda en tu cuenta por si volvés. Si querés que desaparezca, borrás la cuenta
                      desde la configuración y se elimina todo lo asociado.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            {/* ══════════════════════════════════════════════════════════════════════ */}
            <section className="grupo" id="seguridad">
              <h2>Seguridad y privacidad</h2>
              <p className="lp-sub">Qué se guarda, qué no y quién puede verlo.</p>
              <div className="lista">
                <details className="qa">
                  <summary>¿Quién puede ver mis datos?</summary>
                  <div className="lp-r">
                    <p>
                      Vos, y quien compartas el hogar. Cada cuenta está aislada a nivel de base de
                      datos: no es una separación por pantalla, es que las consultas de una cuenta
                      no alcanzan las filas de otra.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Venden o comparten mi información?</summary>
                  <div className="lp-r">
                    <p>
                      No. Tu información financiera no se vende ni se comparte con terceros para
                      publicidad ni para decisiones de crédito.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Qué pasa con los correos que reenvío?</summary>
                  <div className="lp-r">
                    <p>
                      Se procesan para extraer el movimiento y quedan asociados solo a tu cuenta. La
                      dirección de ingesta es tuya y se puede rotar; si la revocás, deja de
                      funcionar y no se le reasigna a nadie.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Guardan mis credenciales bancarias?</summary>
                  <div className="lp-r">
                    <p>
                      No existen en el sistema. No hay campo, no hay tabla y no hay forma de que la
                      app entre a tu banco. Es la razón por la que el mecanismo es reenviar avisos y
                      no conectarse con tu usuario.
                    </p>
                  </div>
                </details>

                <details className="qa">
                  <summary>¿Puedo borrar todo?</summary>
                  <div className="lp-r">
                    <p>
                      Sí, desde la configuración. Al borrar la cuenta se elimina en cascada todo lo
                      que cuelga de ella: movimientos, deudas, metas, inversiones, conversaciones y
                      el historial.
                    </p>
                  </div>
                </details>
              </div>
            </section>

            <div className="nada" id="nada">
              <b>No encontramos esa palabra.</b>
              <p>Probá con otra, o escribinos y la agregamos acá.</p>
            </div>
          </div>
        </div>
      </main>

      <section className="cierre">
        <div className="wrap">
          <h2>¿Te quedó una duda que no está acá?</h2>
          <p>Escribinos y la contestamos. Si le sirve a alguien más, la sumamos a esta página.</p>
          <a className="lp-btn btn-green btn-lg" href="#">
            Probar{" "}
            <span className="cw cw-inv">
              CARTERA<i>+</i>
            </span>{" "}
            14 días
          </a>
          <p className="fine">
            14 días de prueba · No se cobra hasta el día 15 · Cancelás cuando querás
          </p>
        </div>
      </section>

      <footer className="pie">
        <div className="wrap in">
          <span>
            <span className="cw">
              CARTERA<i>+</i>
            </span>{" "}
            · Costa Rica
          </span>
          <span>Privacidad · Términos</span>
        </div>
      </footer>
      <FaqsMotion />
    </div>
  );
}
