"use client";

/**
 * Date-picker tipo calendario (popover) que scopea ÚNICAMENTE la card
 * "Categorías de gasto". Al elegir un día hace router.push(?asOf=YYYY-MM-DD)
 * preservando el resto de params (p.ej. ?range). El servidor recorta el gasto
 * real de los frascos a ese día. Sin librerías: popover propio con clases del
 * design system + estilos inline (mismo patrón que category-kebab).
 */
import { useEffect, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Icon } from "@/components/ui/icon";

const MONTHS_FULL = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];
const MONTHS_SHORT = [
  "ene",
  "feb",
  "mar",
  "abr",
  "may",
  "jun",
  "jul",
  "ago",
  "sep",
  "oct",
  "nov",
  "dic",
];
// Calendario con lunes como primer día (convención es-ES).
const DOW = ["L", "M", "X", "J", "V", "S", "D"];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Lunes=0 … Domingo=6 a partir del getDay() nativo (Domingo=0). */
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function JarDatePicker({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [cy, cm, cd] = current.split("-").map(Number) as [number, number, number];
  const [open, setOpen] = useState(false);
  // Mes visible en el popover (arranca en el del valor actual).
  const [viewY, setViewY] = useState(cy);
  const [viewM, setViewM] = useState(cm); // 1-12
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // Al reabrir, vuelve a centrar en el mes seleccionado.
  useEffect(() => {
    if (open) {
      setViewY(cy);
      setViewM(cm);
    }
  }, [open, cy, cm]);

  const select = (day: number) => {
    const value = `${viewY}-${pad2(viewM)}-${pad2(day)}`;
    const params = new URLSearchParams(searchParams.toString());
    params.set("asOf", value);
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    setOpen(false);
    router.push(`${pathname}?${params.toString()}${hash}`);
  };

  const stepMonth = (delta: number) => {
    let y = viewY;
    let m = viewM + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setViewY(y);
    setViewM(m);
  };

  const daysInMonth = new Date(viewY, viewM, 0).getDate();
  const lead = mondayIndex(new Date(viewY, viewM - 1, 1).getDay());
  const today = new Date();
  const todayY = today.getFullYear();
  const todayM = today.getMonth() + 1;
  const todayD = today.getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const triggerLabel = `${cd} ${MONTHS_SHORT[cm - 1]} ${cy}`;

  return (
    <div ref={wrapRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        aria-label="Fecha de corte de los frascos"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          height: 34,
          padding: "0 10px",
          border: "1px solid var(--line)",
          borderRadius: 10,
          background: "var(--surface)",
          cursor: "pointer",
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--ink)",
        }}
      >
        <span style={{ display: "inline-flex", color: "var(--ink-2)" }}>
          <Icon name="budget" width={1.8} style={{ width: 15, height: 15 }} />
        </span>
        {triggerLabel}
        <span
          className="tip"
          data-tip="El gasto real de cada frasco se acumula hasta el día elegido."
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: 15,
            height: 15,
            borderRadius: "50%",
            border: "1px solid var(--line)",
            color: "var(--muted)",
            fontSize: 10,
            fontWeight: 700,
            marginLeft: 2,
          }}
        >
          ?
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Elegir fecha"
          className="card"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            zIndex: 25, // bajo el topbar sticky (z30)
            width: 256,
            padding: 12,
            boxShadow: "0 12px 32px rgba(0,0,0,.18)",
          }}
        >
          <div
            className="row"
            style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}
          >
            <button
              type="button"
              className="icon-btn"
              aria-label="Mes anterior"
              style={{ width: 28, height: 28 }}
              onClick={() => stepMonth(-1)}
            >
              ‹
            </button>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: "capitalize" }}>
              {MONTHS_FULL[viewM - 1]} {viewY}
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="Mes siguiente"
              style={{ width: 28, height: 28 }}
              onClick={() => stepMonth(1)}
            >
              ›
            </button>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 2,
              fontSize: 10.5,
              fontWeight: 700,
              color: "var(--muted)",
              textAlign: "center",
              marginBottom: 4,
            }}
          >
            {DOW.map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
            {cells.map((day, i) => {
              if (day === null) return <span key={`b${i}`} />;
              const isSelected = viewY === cy && viewM === cm && day === cd;
              const isToday = viewY === todayY && viewM === todayM && day === todayD;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => select(day)}
                  aria-label={`${day} de ${MONTHS_FULL[viewM - 1]} ${viewY}`}
                  aria-current={isSelected ? "date" : undefined}
                  style={{
                    height: 30,
                    border: isToday && !isSelected ? "1px solid var(--line-strong)" : "1px solid transparent",
                    borderRadius: 8,
                    background: isSelected ? "var(--ink)" : "transparent",
                    color: isSelected ? "var(--bg)" : "var(--ink)",
                    fontSize: 12.5,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: "pointer",
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
