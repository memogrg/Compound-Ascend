// @ts-nocheck
"use client";

/**
 * El buscador y el índice pegajoso de las FAQ. Portado del prototipo, sin
 * tipos, tocando el DOM directo — de ahí el `@ts-nocheck`.
 *
 * El buscador ABRE las coincidencias en vez de solo mostrarlas: devolver
 * títulos cerrados obliga a un clic más para leer lo que uno acaba de buscar.
 * Normaliza acentos, así que «dolares» encuentra «dólares».
 */
import { useEffect, useRef } from "react";

export function FaqsMotion() {
  const yaCorrio = useRef(false);

  useEffect(() => {
    if (yaCorrio.current) return;
    yaCorrio.current = true;

    const observadores = [];
    class ObservadorVigilado extends IntersectionObserver {
      constructor(cb, opts) {
        super(cb, opts);
        observadores.push(this);
      }
    }

    try {
      /* ═══ BUSCADOR Y ÍNDICE ═════════════════════════════════════════════════════
         Todo en el cliente: el contenido ya está en el DOM, así que filtrar es
         esconder. Sin llamadas, sin índice que mantener, y funciona con el buscador
         del navegador (⌘F) igual de bien.

         Detalle que importa: al filtrar se ABREN las coincidencias. Si el usuario
         busca «avalancha» y le devolvemos tres títulos cerrados, tiene que hacer un
         clic más para ver si acertó.
         ═══════════════════════════════════════════════════════════════════════════ */
      (function () {
        const caja = document.getElementById("q");
        const conteo = document.getElementById("conteo");
        const nada = document.getElementById("nada");
        const qas = [].slice.call(document.querySelectorAll(".qa"));
        const grupos = [].slice.call(document.querySelectorAll(".grupo"));
        const indice = document.getElementById("indice");
        if (!caja) return;

        // Se normaliza para que «dolares» encuentre «dólares».
        function limpiar(t) {
          return t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
        }
        qas.forEach(function (q) {
          q.dataset.txt = limpiar(q.textContent);
        });

        const total = qas.length;
        conteo.textContent = total + " preguntas";

        function filtrar() {
          const t = limpiar(caja.value.trim());
          if (!t) {
            qas.forEach(function (q) {
              q.classList.remove("oculta");
              q.open = false;
            });
            grupos.forEach(function (g) {
              g.classList.remove("oculta");
            });
            nada.classList.remove("lp-on");
            indice.style.display = "";
            conteo.textContent = total + " preguntas";
            return;
          }
          let vistos = 0;
          qas.forEach(function (q) {
            const hay = q.dataset.txt.indexOf(t) > -1;
            q.classList.toggle("oculta", !hay);
            q.open = hay; // abrir la coincidencia, no solo mostrarla
            if (hay) vistos++;
          });
          grupos.forEach(function (g) {
            g.classList.toggle("oculta", !g.querySelector(".qa:not(.oculta)"));
          });
          nada.classList.toggle("lp-on", vistos === 0);
          indice.style.display = "none"; // con el filtro activo el índice ya no aplica
          conteo.textContent =
            vistos === 0 ? "sin resultados" : vistos === 1 ? "1 pregunta" : vistos + " preguntas";
        }
        caja.addEventListener("input", filtrar);
        caja.addEventListener("search", filtrar); // la «x» del campo type=search

        /* El tema activo en el índice, con IntersectionObserver y no con `scroll`:
           no corre nada en el hilo principal en cada cuadro. */
        const enlaces = [].slice.call(indice.querySelectorAll("a"));
        const porId = {};
        enlaces.forEach(function (a) {
          porId[a.getAttribute("href").slice(1)] = a;
        });
        new ObservadorVigilado(
          function (ent) {
            ent.forEach(function (e) {
              const a = porId[e.target.id];
              if (!a) return;
              if (e.isIntersecting) {
                enlaces.forEach(function (x) {
                  x.classList.remove("act");
                });
                a.classList.add("act");
              }
            });
          },
          { rootMargin: "-88px 0px -70% 0px", threshold: 0 },
        ).observe &&
          grupos.forEach(function (g) {
            new ObservadorVigilado(
              function (ent) {
                if (!ent[0].isIntersecting) return;
                enlaces.forEach(function (x) {
                  x.classList.remove("act");
                });
                const a = porId[g.id];
                if (a) a.classList.add("act");
              },
              { rootMargin: "-88px 0px -72% 0px", threshold: 0 },
            ).observe(g);
          });

        /* Si se llega con un ancla (#deudas) o se busca desde otra página, que el
           tema quede marcado de entrada. */
        if (location.hash && porId[location.hash.slice(1)]) {
          porId[location.hash.slice(1)].classList.add("act");
        }
      })();
    } catch (err) {
      console.error("faqs: falló el buscador", err);
    }

    return () => observadores.forEach((o) => o.disconnect());
  }, []);

  return null;
}
