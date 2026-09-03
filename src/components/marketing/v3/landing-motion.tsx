// @ts-nocheck
"use client";

/**
 * Todo el movimiento de la landing: la escena 3D del hero, el chat que se
 * escribe solo, la línea de tiempo de doce meses, el titular que rota, los
 * reveals y el índice pegajoso.
 *
 * Va con `@ts-nocheck` por la misma razón que la escena: es JavaScript de
 * animación portado del prototipo, sin tipos, que toca el DOM directo.
 * Anotarlo a mano serían cuarenta aserciones sobre código ya verificado
 * corriendo, y acá no hay lógica de negocio: si algo falla, se ve al instante.
 *
 * Corre en un efecto y no en el marcado porque necesita el DOM montado. El
 * `ref` de guarda existe porque en desarrollo React monta los efectos dos
 * veces: sin él quedarían dos observadores y dos intervalos por cada uno, y el
 * chat se escribiría encima de sí mismo.
 *
 * La limpieza apaga intervalos y observadores al desmontar. En una página
 * suelta no hacía falta; acá, sin eso, navegar al panel deja temporizadores
 * escribiendo en nodos que ya no existen.
 */
import { useEffect, useRef } from "react";

export function LandingMotion() {
  const yaCorrio = useRef(false);

  useEffect(() => {
    if (yaCorrio.current) return;
    yaCorrio.current = true;

    const intervalos = [];
    const tiempos = [];
    const observadores = [];

    const setInterval = (fn, ms) => {
      const id = window.setInterval(fn, ms);
      intervalos.push(id);
      return id;
    };
    const setTimeout = (fn, ms) => {
      const id = window.setTimeout(fn, ms);
      tiempos.push(id);
      return id;
    };
    class ObservadorVigilado extends IntersectionObserver {
      constructor(cb, opts) {
        super(cb, opts);
        observadores.push(this);
      }
    }

    try {
      import("./escena")
        .then(({ montarTelefono }) =>
          montarTelefono({
            canvas: document.getElementById("gl"),
            stage: document.getElementById("escena"),
            tema: "claro",
            telon: false,
            // Más cerca que el valor por defecto: la pantalla tiene que LEERSE,
            // sin que el aparato se corte por los bordes.
            distancia: 12.7,
          }),
        )
        .catch((err) => console.error("landing: no cargó la escena 3D", err));

      /* La cabecera se enciende al primer píxel de scroll. Va con IntersectionObserver sobre un
         centinela de 1 px y no con el evento `scroll`: así no corre nada en el hilo principal en
         cada cuadro mientras alguien baja. */
      (function () {
        const hdr = document.querySelector(".hdr");
        if (!hdr) return;
        const centinela = document.createElement("div");
        centinela.style.cssText =
          "position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none";
        document.body.prepend(centinela);
        new ObservadorVigilado(
          function (e) {
            hdr.classList.toggle("vidrio", !e[0].isIntersecting);
          },
          { threshold: 0 },
        ).observe(centinela);
      })();

      /* Aparición al hacer scroll: cada bloque sube 18 px una sola vez. Con IntersectionObserver
         y no con el evento de scroll — el observer no corre en el hilo principal en cada cuadro. */
      (function () {
        var obs = new ObservadorVigilado(
          function (entradas) {
            entradas.forEach(function (e) {
              if (e.isIntersecting) {
                e.target.classList.add("lp-on");
                obs.unobserve(e.target);
              }
            });
          },
          { rootMargin: "0px 0px -4% 0px", threshold: 0 },
        );
        document.querySelectorAll(".reveal").forEach(function (el, i) {
          el.style.transitionDelay = (i % 4) * 70 + "ms";
          obs.observe(el);
        });
        /* Red de seguridad: un bloque que nunca dispare el observer se queda INVISIBLE, y eso es
           peor que no tener animación. Si a los 4 s algo sigue apagado y ya pasó por pantalla,
           se enciende igual. */
        setTimeout(function () {
          document.querySelectorAll(".reveal:not(.lp-on)").forEach(function (el) {
            if (el.getBoundingClientRect().top < innerHeight) el.classList.add("lp-on");
          });
        }, 4000);
      })();

      /* ═══ EL TITULAR QUE PIENSA ═════════════════════════════════════════════════
         La segunda línea rota entre cinco palabras y cierra con la frase de marca,
         y de ahí vuelve a empezar. No es un adorno: es el argumento. CARTERA+ no
         registra el pasado, ayuda a decidir lo que sigue, y el titular tenía que
         moverse para decir eso sin explicarlo.

         Dos cuidados:
         · El ancho de la línea se ANIMA. Sin eso, al ser un titular centrado, cada
           cambio de palabra daría un brinco lateral. El `#medidor` mide la frase
           siguiente antes de escribirla — está dentro del h1 para heredar el tamaño
           y la familia exactos.
         · El bloque que rota va `aria-hidden` y el h1 lleva un texto fijo para
           lectores de pantalla: nadie tendría que oír un encabezado que se reescribe
           solo cada dos segundos.
         ═══════════════════════════════════════════════════════════════════════════ */
      (function () {
        const rot = document.getElementById("rot");
        const medidor = document.getElementById("medidor");
        if (!rot || !medidor) return;

        const FRASES = [
          "con <em>estrategia.</em>",
          "con <em>claridad.</em>",
          "con <em>dirección.</em>",
          "con <em>inteligencia.</em>",
          "con <em>visión.</em>",
          "<em>un paso adelante.</em>",
        ];
        const ULTIMA = FRASES.length - 1;

        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
          rot.innerHTML = '<span class="pal">' + FRASES[ULTIMA] + "</span>";
          return;
        }

        let i = 0,
          aLaVista = true,
          andando = false,
          temporizador = 0;

        /* UN SOLO HILO DE ROTACIÓN. `andando` se levanta al PROGRAMAR, no al ejecutar.
           Antes `arrancar()` dejaba un paso agendado a 2,2 s sin tocar la bandera, así que
           el observador de visibilidad —que solo miraba `!andando`— creía que no había
           nada corriendo y arrancaba un SEGUNDO ciclo: dos rotaciones a la vez sobre el
           mismo titular. Con el relevo por innerHTML no se notaba (los dos hilos se
           pisaban el mismo nodo); con el cruce de capas se veía apilarse una capa por
           vuelta. El `clearTimeout` garantiza que nunca queden dos pasos agendados. */
        function programar(ms: number) {
          andando = true;
          clearTimeout(temporizador);
          temporizador = window.setTimeout(paso, ms);
        }

        function ancho(html) {
          medidor.innerHTML = html;
          return medidor.getBoundingClientRect().width;
        }

        function fijarAncho(html) {
          rot.style.width = ancho(html) + "px";
        }

        function paso() {
          if (!aLaVista || document.hidden) {
            andando = false;
            return;
          }
          andando = true;
          const sig = (i + 1) % FRASES.length;

          /* Las dos palabras se CRUZAN. Antes esto era un relevo: se desvanecía la
             saliente, se esperaba 360 ms y recién ahí entraba la nueva desde opacidad
             cero — o sea el renglón quedaba vacío como un tercio de segundo en cada
             vuelta, y el titular del hero se leía a medias. Ahora la saliente se despega
             a una capa absoluta encima y las dos animaciones corren a la vez. */
          /* Cinturón: si alguna capa vieja sobrevivió, se va acá. Sin esto un fallo de
             temporizador convierte una fuga perdida en una capa permanente. */
          rot.querySelectorAll(".pal.fuga").forEach(function (n) {
            n.remove();
          });
          const saliente = rot.querySelector(".pal");
          if (saliente) {
            saliente.classList.add("fuga");
            // Se retira sola al terminar: si se quedara, cada vuelta apilaría una capa más.
            setTimeout(function () {
              saliente.remove();
            }, 460);
          }
          fijarAncho(FRASES[sig]); // el ancho glisa mientras la palabra se va

          const entrante = document.createElement("span");
          entrante.className = "pal";
          entrante.innerHTML = FRASES[sig]; // texto propio del archivo, no entra nada del usuario
          rot.appendChild(entrante);
          // reflow para que la animación de entrada vuelva a correr
          rot.classList.remove("entra");
          void rot.offsetWidth;
          rot.classList.add("entra");
          i = sig;
          // la frase de marca se queda más tiempo: es el remate del ciclo
          programar(i === ULTIMA ? 3400 : 1900);
        }

        // el ancho de arranque, ya con las fuentes cargadas
        function arrancar() {
          fijarAncho(FRASES[i]);
          if (!andando) programar(2200);
        }
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(arrancar);
        else arrancar();

        // no gastar batería animando un titular que quedó fuera de pantalla
        new ObservadorVigilado(
          function (e) {
            aLaVista = e[0].isIntersecting;
            if (aLaVista && !document.hidden && !andando) programar(0);
          },
          { threshold: 0 },
        ).observe(rot);

        document.addEventListener("visibilitychange", function () {
          if (!document.hidden && aLaVista && !andando) programar(0);
        });

        // el ancho depende del tamaño de letra, que es fluido
        let t;
        addEventListener(
          "resize",
          function () {
            clearTimeout(t);
            t = setTimeout(function () {
              fijarAncho(FRASES[i]);
            }, 140);
          },
          { passive: true },
        );
      })();

      /* ═══ EL CHAT QUE CONVERSA ══════════════════════════════════════════════════
         Tres idas y vueltas en bucle: se ve al usuario ESCRIBIENDO, el mensaje sale,
         el asesor piensa (los tres puntos) y responde. Las burbujas van al aire —
         sin tarjeta alrededor — para que se lea como una conversación pasando y no
         como una captura de pantalla.

         El guion NO demuestra cálculo, demuestra CONTEXTO. Ese es el argumento del
         bloque: el primer turno muestra que razona con los objetivos de la persona,
         el segundo que incorpora una prioridad humana («tengo un viaje») a una
         decisión financiera, y el tercero deja la puerta abierta. Si algún día se
         cambia el guion, esa progresión es lo que hay que conservar.

         Reglas que se respetan acá:
         · El hilo tiene alto fijo, así que la página no se mueve mientras corre.
         · Solo corre cuando la sección está a la vista y la pestaña está activa.
         · Con `prefers-reduced-motion` se pinta la conversación entera de una.
         · Las cifras son las de la cuenta de demostración que usa el resto de la
           página: fondo en 1,3 meses, préstamo del vehículo al 13,5% como deuda más
           cara, ₡300.000 sin asignar. Si cambian allá, cambian acá.
         ═══════════════════════════════════════════════════════════════════════════ */
      (function () {
        const hilo = document.getElementById("hilo");
        const campo = document.getElementById("campo");
        const btn = document.getElementById("enviar");
        if (!hilo || !campo || !btn) return;

        const GUION = [
          { de: "yo", t: "¿Qué debería hacer con los ₡300.000 que me sobraron este mes?" },
          {
            de: "ia",
            t: [
              "Por tus objetivos actuales, yo no los invertiría todos todavía.",
              "Tu fondo de emergencia cubre <b>1,3 meses</b> y tu meta son 3. Y el préstamo del vehículo sigue al <b>13,5%</b> — es tu deuda más cara.",
              "Con esos ₡300.000 tenés tres caminos:",
            ],
            ops: [
              ["Abonar al préstamo", "Bajás intereses y adelantás tu fecha libre de deudas."],
              ["Completar tu fondo", "Ganás protección, pero seguís cargando la deuda más cara."],
              ["Invertirlos", "Se puede, pero hoy tu deuda tiene prioridad."],
            ],
          },
          {
            de: "ia",
            t: ["Mi propuesta:"],
            plan: [
              ["₡225.000", "al préstamo del vehículo"],
              ["₡75.000", "al fondo de emergencia"],
            ],
            cierre:
              "Adelantás tu salida de deudas sin dejar de levantar el fondo. ¿Te muestro cómo quedarían los tres escenarios?",
          },
          { de: "yo", t: "Este mes tengo un viaje. Prefiero guardar un poco más de efectivo." },
          {
            de: "ia",
            t: [
              "Tiene sentido. Para ese viaje habías definido un presupuesto de ₡180.000 y todavía te faltan <b>₡65.000</b> por cubrir.",
              "Reservamos esos ₡65.000 y repartimos los ₡235.000 restantes entre deuda y fondo, sin tocar tu presupuesto del mes.",
              "¿Ajustamos el plan así?",
            ],
          },
          { de: "yo", t: "¿Y si quiero comprar carro el próximo año?" },
          {
            de: "ia",
            t: [
              "Entonces cambia el plan. Veamos cuánto necesitarías acumular sin atrasar tu salida de deudas.",
            ],
          },
        ];

        const ISO = '<svg viewBox="0 0 64 64" aria-hidden="true"><use href="#iso"/></svg>';
        const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
        let aLaVista = false,
          corriendo = false,
          cancelar = false;

        function esperar(ms) {
          return new Promise(function (res) {
            var t = setInterval(function () {
              if (cancelar) {
                clearInterval(t);
                res();
              }
            }, 120);
            setTimeout(function () {
              clearInterval(t);
              res();
            }, ms);
          });
        }

        function el(clase, html) {
          const d = document.createElement("div");
          d.className = clase;
          if (html != null) d.innerHTML = html;
          hilo.appendChild(d);
          return d;
        }

        function burbujaYo(t) {
          el("burb yo", t);
        }

        /* La burbuja del asesor va con el ícono de la app al lado: sin la tarjeta
           alrededor, ese disco es lo único que dice de quién es el mensaje. */
        function burbujaIA(turno) {
          let h = turno.t
            .map(function (x) {
              return "<p>" + x + "</p>";
            })
            .join("");
          if (turno.ops) {
            h +=
              '<div class="ops">' +
              turno.ops
                .map(function (o, i) {
                  return (
                    "<div><i>" +
                    (i + 1) +
                    "</i><div><b>" +
                    o[0] +
                    "</b><span>" +
                    o[1] +
                    "</span></div></div>"
                  );
                })
                .join("") +
              "</div>";
          }
          if (turno.plan) {
            h +=
              '<div class="reparto">' +
              turno.plan
                .map(function (f) {
                  return "<div><em>" + f[0] + "</em><span>" + f[1] + "</span></div>";
                })
                .join("") +
              "</div>";
          }
          if (turno.cierre) h += "<p>" + turno.cierre + "</p>";
          el("fila-ia", '<span class="ava">' + ISO + '</span><div class="burb ia">' + h + "</div>");
        }

        function limpiarCampo() {
          campo.innerHTML = '<span class="ph">Escribile a tu asesor…</span>';
          btn.classList.remove("lp-listo");
        }

        /* Teclea letra por letra. El cursor va en su propio elemento para que
           parpadee sin re-pintar el texto en cada paso. */
        function teclear(t) {
          return new Promise(function (res) {
            campo.innerHTML =
              '<span class="tira"><span id="tec"></span><i class="cursor"></i></span>';
            const tira = campo.querySelector(".tira");
            const tec = campo.querySelector("#tec");
            const ancho = campo.clientWidth - 40;
            let i = 0;
            var paso = setInterval(function () {
              if (cancelar) {
                clearInterval(paso);
                return res();
              }
              i += 1;
              tec.textContent = t.slice(0, i);
              // el texto se corre a la izquierda para que el cursor no se salga del campo
              const sobra = tira.scrollWidth - ancho;
              tira.style.transform = sobra > 0 ? "translateX(-" + sobra + "px)" : "none";
              if (i >= t.length) {
                clearInterval(paso);
                btn.classList.add("lp-listo");
                res();
              }
            }, 24);
          });
        }

        function enviar() {
          btn.classList.add("va");
          return esperar(180).then(function () {
            btn.classList.remove("va");
          });
        }

        function pensando(ms) {
          const p = el(
            "fila-ia",
            '<span class="ava">' + ISO + '</span><div class="puntos"><i></i><i></i><i></i></div>',
          );
          return esperar(ms).then(function () {
            p.remove();
          });
        }

        /* Apertura: el asesor saluda con el dato que dispara la conversación. Existe
           para que la columna NUNCA se vea vacía — sin ella, quien llega justo al
           arranque del ciclo se topa con un hueco durante el primer tecleo. */
        function abrir() {
          hilo.innerHTML = "";
          burbujaIA({ t: ["Hola, José. Cerraste el mes con <b>₡300.000</b> sin asignar."] });
        }

        function reiniciar() {
          if (!hilo.children.length) abrir();
          limpiarCampo();
        }

        function ciclo() {
          if (corriendo) return;
          corriendo = true;
          cancelar = false;
          reiniciar();

          /* El hilo viejo se borra al ENVIAR el primer mensaje, no al arrancar el ciclo: así la
             conversación anterior sigue en pantalla mientras se teclea la nueva y no hay ni un
             instante en blanco. */
          let primero = true;
          let cadena = Promise.resolve();
          GUION.forEach(function (turno) {
            cadena = cadena.then(function () {
              if (cancelar) return;
              if (turno.de === "yo") {
                return teclear(turno.t)
                  .then(function () {
                    return esperar(340);
                  })
                  .then(enviar)
                  .then(function () {
                    if (primero) {
                      abrir();
                      primero = false;
                    }
                    burbujaYo(turno.t);
                    limpiarCampo();
                    return esperar(520);
                  });
              }
              // el asesor tarda más cuando la respuesta es más larga
              const largo =
                turno.t.join(" ").length + (turno.ops ? 120 : 0) + (turno.cierre ? 60 : 0);
              return pensando(Math.min(1800, 700 + largo * 3)).then(function () {
                burbujaIA(turno);
                return esperar(turno.ops ? 2200 : 1500);
              });
            });
          });

          cadena
            .then(function () {
              return esperar(2800);
            })
            .then(function () {
              corriendo = false;
              if (aLaVista && !document.hidden && !cancelar) ciclo();
            });
        }

        if (quieto) {
          abrir();
          GUION.forEach(function (t) {
            if (t.de === "yo") burbujaYo(t.t);
            else burbujaIA(t);
          });
          limpiarCampo();
          return;
        }

        new ObservadorVigilado(
          function (ent) {
            aLaVista = ent[0].isIntersecting;
            if (aLaVista && !document.hidden) ciclo();
            else cancelar = true;
          },
          { threshold: 0.25 },
        ).observe(hilo);

        document.addEventListener("visibilitychange", function () {
          if (document.hidden) cancelar = true;
          else if (aLaVista) ciclo();
        });
      })();

      /* ═══ DOCE MESES, ANIMADOS ══════════════════════════════════════════════════
         Este bloque vende PROGRESO, así que la interfaz tiene que mostrar
         movimiento: una aguja recorre el año sobre la curva del flujo mensual y los
         tres números de arriba van cambiando con ella. Los cuatro movimientos se
         encienden cuando la aguja pasa por su mes.

         Reglas que se respetan acá:
         · La animación arranca sola al entrar en pantalla y dura ~6 s. NO va atada
           al scroll a propósito: con scroll rápido se la salta y en móvil da
           tirones. El autoplay siempre se ve bien.
         · Corre UNA vez. Repetirla en bucle convertiría un argumento en un adorno.
         · Con `prefers-reduced-motion` se pinta diciembre de una y no se anima.
         · El SVG se dibuja acá y no en el HTML para que la geometría salga de los
           datos: si mañana cambian las cifras, la curva se recalcula sola.

         LOS DATOS son el escenario ilustrativo, no una cuenta real (ver la nota al
         pie del bloque). Los extremos SÍ tienen que cuadrar con las tres cifras de
         diciembre: −14.480 → +173.920, 1.850.000 → 0, 25,5M → 34,4M.
         ═══════════════════════════════════════════════════════════════════════════ */
      (function () {
        const caja = document.getElementById("linea");
        const svg = document.getElementById("grafo");
        if (!caja || !svg) return;

        const MES = [
          "Enero",
          "Febrero",
          "Marzo",
          "Abril",
          "Mayo",
          "Junio",
          "Julio",
          "Agosto",
          "Setiembre",
          "Octubre",
          "Noviembre",
          "Diciembre",
        ];
        const COR = [
          "Ene",
          "Feb",
          "Mar",
          "Abr",
          "May",
          "Jun",
          "Jul",
          "Ago",
          "Set",
          "Oct",
          "Nov",
          "Dic",
        ];

        // flujo libre del mes: arranca en rojo, cruza a positivo en marzo y pega un
        // salto en octubre, cuando la cuota de la tarjeta deja de existir
        const FLUJO = [
          -14480, -6200, 8400, 24900, 41300, 58700, 74100, 92600, 110400, 138900, 157200, 173920,
        ];
        // la deuda cara se extingue en octubre
        const DEUDA = [
          1850000, 1706000, 1548000, 1379000, 1198000, 1004000, 797000, 576000, 341000, 0, 0, 0,
        ];
        // patrimonio neto, en millones
        const PATRI = [25.5, 26.1, 26.8, 27.6, 28.4, 29.3, 30.2, 31.1, 32.0, 32.9, 33.7, 34.4];

        /* La proporción del lienzo cambia con el ancho: con el viewBox de escritorio
           (720×168 ≈ 4,3:1) el gráfico en un teléfono queda de 80 px de alto y los
           meses ilegibles. En móvil se dibuja casi cuadrado y los meses van con una
           sola letra — el nombre completo ya lo dice la lectura de arriba.
           El margen derecho tampoco puede ser mínimo: el punto de diciembre y su
           aguja quedaban pegados al canto de la tarjeta. */
        let W, H, IZQ, DER, ARR, ABA, x0, x1, y0, y1, yCero, movil;
        const MAX = 190000,
          MIN = -30000;
        function medir() {
          movil = innerWidth < 768;
          W = movil ? 380 : 720;
          H = movil ? 215 : 168;
          IZQ = movil ? 20 : 38;
          DER = movil ? 20 : 38;
          ARR = 14;
          ABA = movil ? 32 : 26;
          x0 = IZQ;
          x1 = W - DER;
          y0 = ARR;
          y1 = H - ABA;
          yCero = Y(0);
        }
        function X(i) {
          return x0 + ((x1 - x0) * i) / 11;
        }
        function Y(v) {
          return y1 - ((v - MIN) / (MAX - MIN)) * (y1 - y0);
        }
        medir();

        /* ── el dibujo ── */
        function ns(t, a) {
          const e = document.createElementNS("http://www.w3.org/2000/svg", t);
          for (const k in a) e.setAttribute(k, a[k]);
          return e;
        }
        let rec, rotulos, aguja, punto;
        function construir() {
          svg.textContent = "";
          svg.setAttribute("viewBox", "0 0 " + W + " " + H);

          let curva = "",
            i;
          for (i = 0; i < 12; i++) {
            curva += (i ? " L" : "M") + X(i).toFixed(1) + " " + Y(FLUJO[i]).toFixed(1);
          }
          const area =
            curva +
            " L" +
            X(11).toFixed(1) +
            " " +
            yCero.toFixed(1) +
            " L" +
            X(0).toFixed(1) +
            " " +
            yCero.toFixed(1) +
            " Z";

          const defs = ns("defs");
          // El degradado corta justo en la línea del cero: lo que queda debajo se ve
          // rojo y lo que queda encima, verde. Un solo relleno, dos lecturas.
          const g = ns("linearGradient", {
            id: "gflujo",
            gradientUnits: "userSpaceOnUse",
            x1: 0,
            y1: y0,
            x2: 0,
            y2: y1,
          });
          const c = (yCero - y0) / (y1 - y0);
          [
            [0, "rgba(55,132,81,.26)"],
            [c, "rgba(55,132,81,.04)"],
            [c, "rgba(176,74,70,.05)"],
            [1, "rgba(176,74,70,.20)"],
          ].forEach(function (pt) {
            g.appendChild(
              ns("stop", { offset: (pt[0] * 100).toFixed(2) + "%", "stop-color": pt[1] }),
            );
          });
          defs.appendChild(g);
          const clip = ns("clipPath", { id: "ccorte" });
          rec = ns("rect", { x: 0, y: 0, width: 0, height: H });
          clip.appendChild(rec);
          defs.appendChild(clip);
          svg.appendChild(defs);

          svg.appendChild(ns("line", { class: "cero", x1: x0, y1: yCero, x2: x1, y2: yCero }));
          const capa = ns("g", { "clip-path": "url(#ccorte)" });
          capa.appendChild(ns("path", { d: area, fill: "url(#gflujo)" }));
          capa.appendChild(ns("path", { class: "curva", d: curva }));
          svg.appendChild(capa);

          for (let j = 0; j < 12; j++) {
            const t = ns("text", {
              class: "rotulo" + (movil ? " chico" : ""),
              x: X(j),
              y: H - 8,
              "text-anchor": "middle",
            });
            t.textContent = movil ? COR[j].charAt(0) : COR[j];
            t.setAttribute("data-i", j);
            svg.appendChild(t);
          }
          rotulos = svg.querySelectorAll(".rotulo");
          aguja = ns("line", { class: "aguja", x1: X(0), y1: y0 - 4, x2: X(0), y2: y1 + 4 });
          punto = ns("circle", { class: "punto", cx: X(0), cy: Y(FLUJO[0]), r: movil ? 5.5 : 4.5 });
          svg.appendChild(aguja);
          svg.appendChild(punto);
        }
        construir();

        /* ── formato de cifras ── */
        /* A mano y no con `toLocaleString`: es-CR devuelve espacio fino como
           separador de miles y el resto de la página usa punto. */
        function miles(n) {
          return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        }
        function colon(n) {
          return (n < 0 ? "−₡" : "₡") + miles(Math.abs(Math.round(n)));
        }
        function conSigno(n) {
          return (n < 0 ? "−₡" : "+₡") + miles(Math.abs(Math.round(n)));
        }

        const elMes = document.getElementById("lmes");
        const elFlu = document.getElementById("lflujo");
        const elDeu = document.getElementById("ldeuda");
        const elPat = document.getElementById("lpatri");
        const hitos = [].slice.call(caja.querySelectorAll(".hito"));

        function interp(arr, t) {
          const i = Math.min(10, Math.floor(t)),
            f = t - i;
          return arr[i] + (arr[i + 1] - arr[i]) * f;
        }

        let ultimo = 0;
        function pintar(t) {
          ultimo = t;
          const i = Math.round(t);
          const fx = X(0) + ((X(11) - X(0)) * t) / 11;
          const fv = interp(FLUJO, t);
          rec.setAttribute("width", fx + 3);
          aguja.setAttribute("x1", fx);
          aguja.setAttribute("x2", fx);
          punto.setAttribute("cx", fx);
          punto.setAttribute("cy", Y(fv));

          elMes.textContent = MES[i];
          elFlu.textContent = conSigno(fv);
          elFlu.className = fv < 0 ? "neg" : "ok";
          const dv = interp(DEUDA, t);
          elDeu.textContent = colon(dv);
          elDeu.className = dv === 0 ? "ok" : "";
          elPat.textContent = "₡" + interp(PATRI, t).toFixed(1).replace(".", ",") + "M";

          for (let k = 0; k < rotulos.length; k++) {
            rotulos[k].classList.toggle("act", +rotulos[k].getAttribute("data-i") === i);
          }
          hitos.forEach(function (h) {
            h.classList.toggle("lp-on", t >= +h.getAttribute("data-mes") - 0.15);
          });
        }

        const quieto = matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (quieto) {
          pintar(11);
          return;
        }

        pintar(0);
        let corrio = false;
        function correr() {
          if (corrio) return;
          corrio = true;
          // Declaraciones separadas: `ini` SÍ se reasigna en cada cuadro, así
          // que no puede compartir el `const` de la duración.
          const DUR = 6000;
          let ini = null;
          function paso(ts) {
            if (ini === null) ini = ts;
            const p = Math.min(1, (ts - ini) / DUR);
            // arranca despacio y frena al final: el año se siente recorrido, no barrido
            const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
            pintar(e * 11);
            if (p < 1) requestAnimationFrame(paso);
          }
          requestAnimationFrame(paso);
        }

        new ObservadorVigilado(
          function (ent, obs) {
            if (ent[0].isIntersecting) {
              setTimeout(correr, 350);
              obs.disconnect();
            }
          },
          { threshold: 0.35 },
        ).observe(caja);

        // Al girar el teléfono cambia la proporción del lienzo: se rehace y se
        // repinta donde iba (o al final, si la animación ya terminó).
        let reloj,
          eraMovil = movil;
        addEventListener(
          "resize",
          function () {
            clearTimeout(reloj);
            reloj = setTimeout(function () {
              if (innerWidth < 768 === eraMovil) return;
              medir();
              eraMovil = movil;
              construir();
              pintar(ultimo);
            }, 180);
          },
          { passive: true },
        );
      })();

      /* ═══ EL CIERRE QUE GIRA ════════════════════════════════════════════════════
         Espejo del hero, pero al revés: el hero abre prometiendo dirección y este
         cierre la entrega. Y sobre todo, gira del pasado al futuro — «falta
         entenderla» habla de lo que ya pasó; «ahora construí lo que sigue» es la
         tesis del producto.

         Diferencias deliberadas con el titular del hero:
         · Va MÁS LENTO (2,6 s por frase contra 1,9 s). El final tiene que
           desacelerar, no rematar.
         · Cruza con fundido y no animando el ancho. Durante el cruce el texto está
           en opacidad 0, así que el recentrado no se ve y no hace falta el medidor
           invisible que sí necesita el hero.
         · La frase final se queda mucho más tiempo (6,5 s): es la que tiene que
           quedar en la cabeza cuando se cierre la pestaña.

         Accesibilidad: la línea que rota va `aria-hidden` y al lado hay un texto
         fijo para lectores de pantalla, igual que en el hero. Y con
         `prefers-reduced-motion` se pinta la frase final y no se anima nada.
         ═══════════════════════════════════════════════════════════════════════════ */
      (function () {
        const g = document.getElementById("gira");
        if (!g) return;

        const FRASES = [
          "Falta <em>entenderla.</em>",
          "Falta <em>analizarla.</em>",
          "Falta <em>conectarla.</em>",
          "Falta <em>proyectarla.</em>",
          "Ahora construí <em>lo que sigue.</em>",
        ];
        const FIN = FRASES.length - 1;

        if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
          g.innerHTML = FRASES[FIN];
          return;
        }

        let i = 0,
          aLaVista = false,
          andando = false,
          tmp;

        function paso() {
          if (!aLaVista || document.hidden) {
            andando = false;
            return;
          }
          andando = true;
          // la frase de cierre se queda mucho más: es la que tiene que quedar
          const espera = i === FIN ? 6500 : 2600;
          tmp = setTimeout(function () {
            g.classList.add("va"); // se va
            setTimeout(function () {
              i = (i + 1) % FRASES.length;
              g.innerHTML = FRASES[i];
              g.classList.remove("va"); // vuelve
              paso();
            }, 430);
          }, espera);
        }

        new ObservadorVigilado(
          function (e) {
            aLaVista = e[0].isIntersecting;
            if (aLaVista && !document.hidden && !andando) paso();
            else if (!aLaVista) clearTimeout(tmp);
          },
          { threshold: 0.3 },
        ).observe(g);

        document.addEventListener("visibilitychange", function () {
          if (document.hidden) clearTimeout(tmp);
          else if (aLaVista && !andando) paso();
        });
      })();
    } catch (err) {
      // El movimiento es adorno: si algo falla, la página se sigue leyendo.
      console.error("landing: falló el movimiento", err);
    }

    return () => {
      intervalos.forEach(window.clearInterval);
      tiempos.forEach(window.clearTimeout);
      observadores.forEach((o) => o.disconnect());
    };
  }, []);

  return null;
}
