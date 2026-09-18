import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  formatMoney,
  formatDelta,
  formatPct1,
  formatCompact,
  formatAxisCompact,
  formatDayMonth,
  formatMonthShort,
} from "@/lib/format";

import { MotionDemo } from "./motion-demo";

/**
 * Galería interna del design system: tokens, motion, primitivas y formateadores.
 *
 * NO lee ni escribe datos: sin Supabase, sin servicios, sin Server Actions. Todo lo que
 * muestra son constantes de este archivo y clases del design system.
 *
 * Doble puerta:
 *  1. VERCEL_ENV === "production" → notFound(). Local y los previews la muestran; el
 *     dominio real devuelve 404.
 *  2. Vive bajo (dashboard), así que el middleware ya exige sesión y plan activo. Para
 *     verla en un preview hay que iniciar sesión.
 *
 * No está en nav.ts ni en ningún menú: se llega escribiendo la URL.
 */
export const metadata: Metadata = {
  title: "Design system · interno",
  robots: { index: false, follow: false },
};

/** Orden FIJO de series. El mismo dato lleva el mismo color en toda la app. */
const SERIES = [
  { token: "--chart-1", claro: "#378451", oscuro: "#3f9560", rol: "Ingresos · positivo" },
  { token: "--chart-2", claro: "#3a6ea5", oscuro: "#5a8ccb", rol: "Inversiones" },
  { token: "--chart-3", claro: "#c48a2e", oscuro: "#c4862c", rol: "Gasto fijo" },
  { token: "--chart-4", claro: "#7b5ea7", oscuro: "#9b7cc8", rol: "Gasto variable" },
  { token: "--chart-5", claro: "#c34f4b", oscuro: "#d46460", rol: "Deudas · negativo" },
  { token: "--chart-6", claro: "#0f9aa8", oscuro: "#28a2b0", rol: "Ahorro y metas" },
] as const;

/**
 * Se muestran los tokens DIRECTOS, no los alias (--pos, --warn, --neg).
 *
 * Un alias como `--pos: var(--success)` se declara en :root y se resuelve AHÍ, así que un
 * `data-theme="dark"` puesto en un contenedor no lo voltea: seguiría pintando el valor
 * claro dentro de la sección oscura. Los directos sí se redefinen en el bloque oscuro.
 */
const SEMANTICOS = [
  { token: "--success", rol: "Positivo · a favor (alias: --pos)" },
  { token: "--warning", rol: "Atención (alias: --warn)" },
  { token: "--danger", rol: "Negativo · en contra (alias: --neg)" },
  { token: "--info", rol: "Informativo" },
] as const;

const ANDAMIAJE = [
  { token: "--chart-grid", rol: "Líneas de retícula" },
  { token: "--chart-axis", rol: "Ejes y sus etiquetas" },
  { token: "--chart-crosshair", rol: "Cruz de lectura" },
  { token: "--chart-glow", rol: "Halo del punto activo" },
] as const;

/** 42/23/17/13,5/11/10,5. No hay tokens tipográficos: los tamaños viven en cada regla. */
const TIPOGRAFIA = [
  { px: 42, uso: "Cifra principal de una pantalla", display: true },
  { px: 23, uso: "Título de sección", display: true },
  { px: 17, uso: "Título de tarjeta", display: true },
  { px: 13.5, uso: "Texto corrido", display: false },
  { px: 11, uso: "Etiqueta, eyebrow", display: false },
  { px: 10.5, uso: "Nota al pie, unidad", display: false },
] as const;

function Muestra({ token, valor, rol }: { token: string; valor?: string; rol: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <span
        aria-hidden
        style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          background: `var(${token})`,
          border: "1px solid var(--border)",
          flexShrink: 0,
        }}
      />
      <div style={{ minWidth: 0 }}>
        <code style={{ fontSize: 12.5 }}>{token}</code>
        {valor ? (
          <code className="muted tnum" style={{ fontSize: 11, marginLeft: 8 }}>
            {valor}
          </code>
        ) : null}
        <div className="muted" style={{ fontSize: 11.5 }}>
          {rol}
        </div>
      </div>
    </div>
  );
}

/** Las tres familias de color, para repetirlas tal cual dentro del contenedor oscuro. */
function Paleta({ oscuro = false }: { oscuro?: boolean }) {
  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Series · orden fijo
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          }}
        >
          {SERIES.map((s) => (
            <Muestra
              key={s.token}
              token={s.token}
              valor={oscuro ? s.oscuro : s.claro}
              rol={s.rol}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Semánticos
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          }}
        >
          {SEMANTICOS.map((s) => (
            <Muestra key={s.token} token={s.token} rol={s.rol} />
          ))}
        </div>
      </div>
      <div>
        <div className="eyebrow" style={{ marginBottom: 10 }}>
          Andamiaje del gráfico
        </div>
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))",
          }}
        >
          {ANDAMIAJE.map((s) => (
            <Muestra key={s.token} token={s.token} rol={s.rol} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Seccion({
  n,
  titulo,
  sub,
  children,
}: {
  n: number;
  titulo: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card section-gap">
      <div className="card-head">
        <div>
          <div className="eyebrow">{`0${n}`}</div>
          <h2 className="card-title">{titulo}</h2>
          {sub ? <div className="card-sub">{sub}</div> : null}
        </div>
      </div>
      <div className="card-pad">{children}</div>
    </section>
  );
}

export default function DevUiPage() {
  // Puerta 1: el dominio de producción no sirve esta ruta.
  if (process.env.VERCEL_ENV === "production") notFound();

  return (
    <div style={{ display: "grid", gap: 20, paddingBottom: 48 }}>
      <header>
        <div className="eyebrow">Interno · no indexado</div>
        <h1 className="card-title" style={{ fontSize: 23 }}>
          Design system
        </h1>
        <p className="muted" style={{ fontSize: 13.5, maxWidth: 640 }}>
          Catálogo de tokens y primitivas. Punto de partida del catálogo que crece en la fase 2. Los
          valores de color son los declarados en <code>src/styles/tokens.css</code>.
        </p>
      </header>

      <Seccion n={1} titulo="Color" sub="Series, semánticos y andamiaje — tema claro">
        <Paleta />
      </Seccion>

      <Seccion
        n={2}
        titulo="Los mismos tokens en oscuro"
        sub="Contenedor con data-theme forzado: no cambia el tema de la app"
      >
        <div
          data-theme="dark"
          // --bg/--ink son ALIAS (--bg: var(--canvas)) declarados en :root, y un alias se
          // resuelve donde se declara: un data-theme en un contenedor NO los voltea. Los que
          // sí voltean son los tokens DIRECTOS del bloque oscuro, como --canvas y --text.
          style={{
            background: "var(--canvas)",
            color: "var(--text)",
            padding: 20,
            borderRadius: 14,
            border: "1px solid var(--border)",
          }}
        >
          <Paleta oscuro />
        </div>
      </Seccion>

      <Seccion n={3} titulo="Escala tipográfica" sub="Sin tokens: los tamaños viven en cada regla">
        <div style={{ display: "grid", gap: 14 }}>
          {TIPOGRAFIA.map((t) => (
            <div key={t.px} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
              <code className="muted tnum" style={{ fontSize: 11, minWidth: 54 }}>
                {String(t.px).replace(".", ",")} px
              </code>
              <span
                style={{
                  fontSize: t.px,
                  fontFamily: t.display ? "var(--font-display)" : "var(--font-body)",
                  lineHeight: 1.15,
                }}
              >
                ₡1.250.000
              </span>
              <span className="muted" style={{ fontSize: 11.5 }}>
                {t.uso}
              </span>
            </div>
          ))}
        </div>
      </Seccion>

      <Seccion n={4} titulo="Motion" sub="Duraciones y curvas — pulsá para verlas">
        <MotionDemo />
      </Seccion>

      <Seccion n={5} titulo="Primitivas" sub="Clases del design system, con datos de ejemplo">
        <div style={{ display: "grid", gap: 22 }}>
          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Botones
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary">
                Registrar gasto
              </button>
              <button type="button" className="btn btn-secondary">
                Ver detalle
              </button>
              <button type="button" className="btn btn-ghost">
                Cancelar
              </button>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Chips y deltas
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="chip">Mensual</span>
              <span className="chip">Esencial</span>
              <span className="delta up">{formatDelta(173920, "CRC")}</span>
              <span className="delta down">{formatDelta(-14480, "CRC")}</span>
              <span className="delta flat">{formatDelta(0, "CRC")}</span>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Barra de progreso
            </div>
            <div className="bar-track">
              <div className="bar-fill" style={{ width: "43%", background: "var(--chart-6)" }} />
            </div>
            <div className="muted" style={{ fontSize: 11.5, marginTop: 6 }}>
              Fondo de emergencia · {formatMoney(1520000, "CRC")} de {formatMoney(3500000, "CRC")} (
              {formatPct1(0.434)})
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Segmentado y pestañas
            </div>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <div className="seg">
                <button type="button" className="seg-btn on">
                  Mes
                </button>
                <button type="button" className="seg-btn">
                  Trimestre
                </button>
                <button type="button" className="seg-btn">
                  Año
                </button>
              </div>
              <div className="tabs">
                <span className="tab on">Resumen</span>
                <span className="tab">Movimientos</span>
                <span className="tab">Sobres</span>
              </div>
            </div>
          </div>

          <div>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Cifra grande y fila de lista
            </div>
            <div className="num-xl tnum" style={{ fontSize: 42 }}>
              {formatMoney(34380821, "CRC")}
            </div>
            <div style={{ marginTop: 12, border: "1px solid var(--border)", borderRadius: 12 }}>
              {[
                { n: "Supermercado y feria", m: -250000, f: "2026-08-04" },
                { n: "Salario quincena", m: 575000, f: "2026-08-15" },
                { n: "Pago tarjeta BAC", m: -380000, f: "2026-08-20" },
              ].map((r) => (
                <div key={r.n} className="list-row">
                  <span
                    aria-hidden
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 999,
                      background: r.m > 0 ? "var(--chart-1)" : "var(--chart-4)",
                      opacity: 0.18,
                    }}
                  />
                  <span>
                    {r.n}
                    <span className="muted" style={{ fontSize: 11.5, display: "block" }}>
                      {formatDayMonth(r.f)}
                    </span>
                  </span>
                  <span className="tnum">{formatDelta(r.m, "CRC")}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Seccion>

      <Seccion
        n={6}
        titulo="Formateadores"
        sub="src/lib/format.ts — miles con punto, siempre, en servidor y cliente"
      >
        <div style={{ display: "grid", gap: 8 }}>
          {[
            ["formatMoney(1250000, 'CRC')", formatMoney(1250000, "CRC")],
            ["formatMoney(2500, 'USD', 2)", formatMoney(2500, "USD", 2)],
            ["formatDelta(2500, 'CRC')", formatDelta(2500, "CRC")],
            ["formatDelta(-2500, 'CRC')", formatDelta(-2500, "CRC")],
            ["formatDelta(0, 'CRC')", formatDelta(0, "CRC")],
            ["formatPct1(0.123)", formatPct1(0.123)],
            ["formatPct1(-0.045)", formatPct1(-0.045)],
            ["formatCompact(163300, 'CRC')", formatCompact(163300, "CRC")],
            ["formatAxisCompact(607000, 'CRC')", formatAxisCompact(607000, "CRC")],
            ["formatDayMonth('2026-08-16')", formatDayMonth("2026-08-16")],
            ["formatMonthShort('2026-08')", formatMonthShort("2026-08")],
          ].map(([llamada, salida]) => (
            <div
              key={llamada}
              style={{ display: "flex", gap: 14, alignItems: "baseline", flexWrap: "wrap" }}
            >
              <code className="muted" style={{ fontSize: 12, minWidth: 260 }}>
                {llamada}
              </code>
              <span className="tnum" style={{ fontSize: 15 }}>
                {salida}
              </span>
            </div>
          ))}
        </div>
      </Seccion>
    </div>
  );
}
