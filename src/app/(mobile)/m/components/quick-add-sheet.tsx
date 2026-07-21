"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { currencySymbol } from "@/lib/format";
import { addTransactionAction, suggestSobreAction } from "@/modules/financial-base/api/v2-actions";
import type { SobreRapido } from "@/modules/financial-base/services/quick-add-service";
import { BottomSheet } from "./form-kit/bottom-sheet";
import { useToast } from "./form-kit/toast";

/**
 * ALTA RÁPIDA de un movimiento. El objetivo son TRES toques: abrir, escribir el importe,
 * confirmar el sobre.
 *
 * El obstáculo nunca fue dónde estaba el botón: el formulario de /m/transacciones pide
 * siete campos y seis tienen un valor obvio casi siempre. Aquí esos seis van por defecto
 * y plegados, y solo el importe pide atención.
 *
 * Qué acelera QUÉ, que es la parte que se suele confundir:
 *  · Los CHIPS de sobres frecuentes resuelven el camino de tres toques. No dependen de
 *    nada remoto, así que responden al instante.
 *  · La SUGERENCIA por IA necesita el comercio, y el comercio vive plegado. Por eso solo
 *    entra cuando el usuario decide escribirlo, y nunca bloquea el guardado.
 */
export function QuickAddSheet({
  open,
  onClose,
  sobres,
  frecuentes,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  sobres: SobreRapido[];
  frecuentes: SobreRapido[];
  /** Moneda principal del usuario. Se GUARDA explícitamente, no por omisión. */
  currency: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const [kind, setKind] = useState<"gasto" | "ingreso">("gasto");
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [merchant, setMerchant] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [detalles, setDetalles] = useState(false);
  const [sugiriendo, setSugiriendo] = useState(false);
  const [origen, setOrigen] = useState<"historial" | "cache" | "ia" | null>(null);
  const [guardando, setGuardando] = useState(false);

  // Teclado numérico ARRIBA al abrir: cero toques para empezar a escribir. El retardo es
  // para que iOS lo levante — pedir el foco antes de que la hoja termine de animar lo
  // ignora sin avisar.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => inputRef.current?.focus(), 260);
    return () => clearTimeout(t);
  }, [open]);

  // Al cerrar se limpia, para que la siguiente alta no arrastre el gasto anterior.
  useEffect(() => {
    if (open) return;
    setKind("gasto");
    setAmount("");
    setCategoryId(null);
    setMerchant("");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    setDetalles(false);
    setOrigen(null);
  }, [open]);

  const esGasto = kind === "gasto";
  const importe = Number(amount.replace(",", ".")) || 0;
  const puedeGuardar = importe > 0 && !guardando;

  /** Se dispara al SALIR del comercio, no en cada tecla: una llamada por comercio escrito
   *  y no una por letra. Si tarda o falla, el usuario ya podía guardar igual.
   *
   *  No es "la IA adivinando": es la MISMA cascada que corre al guardar (historial del
   *  hogar → caché → IA solo si no hay nada). Enseñarla aquí no añade magia, quita una
   *  sorpresa — el sobre ya se iba a asignar; ahora se ve antes de confirmar. */
  const pedirSugerencia = async () => {
    // Solo gasto: los sobres que cargamos son hojas de gasto, y en ingreso el guardado
    // manda categoryId null. Sugerir ahí propondría un sobre que luego se descarta solo.
    if (!esGasto || merchant.trim().length < 2 || categoryId) return;
    setSugiriendo(true);
    try {
      const r = await suggestSobreAction(merchant, sobres, kind);
      // Solo se aplica si el usuario no eligió mientras tanto: su decisión manda.
      if (r.categoryId && !categoryId) {
        setCategoryId(r.categoryId);
        setOrigen(r.source);
      }
    } finally {
      setSugiriendo(false);
    }
  };

  const guardar = async () => {
    if (!puedeGuardar) return;
    setGuardando(true);
    const res = await addTransactionAction({
      kind,
      amount: importe,
      // EXPLÍCITA, nunca por omisión: el P0 de moneda nació justo de un importe cuya
      // etiqueta salía de otro sitio que el número.
      currency,
      occurredOn: date,
      categoryId: esGasto ? categoryId : null,
      merchantOrSource: merchant.trim() === "" ? undefined : merchant.trim(),
      description: note.trim() === "" ? undefined : note.trim(),
      status: "confirmed",
      origin: "manual",
    });
    setGuardando(false);

    if (res.ok) {
      // Háptica + toast corto y se cierra. Una pantalla de éxito sería un toque más en el
      // flujo que estamos acortando.
      navigator.vibrate?.(12);
      toast.show(esGasto ? "Gasto registrado" : "Ingreso registrado");
      onClose();
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo guardar", "error");
    }
  };

  const sobreElegido = sobres.find((s) => s.id === categoryId);

  return (
    <BottomSheet open={open} onClose={onClose} title={esGasto ? "Nuevo gasto" : "Nuevo ingreso"}>
      <div className="m-qa">
        <div className="seg" role="group" aria-label="Tipo de movimiento">
          {(["gasto", "ingreso"] as const).map((k) => (
            <button
              key={k}
              type="button"
              className={`seg-btn${kind === k ? " on" : ""}`}
              onClick={() => setKind(k)}
            >
              {k === "gasto" ? "Gasto" : "Ingreso"}
            </button>
          ))}
        </div>

        <div className="m-qa-money">
          <span className="m-qa-sym">{currencySymbol(currency)}</span>
          <input
            ref={inputRef}
            className="m-qa-inp"
            type="text"
            inputMode="decimal"
            enterKeyHint="done"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="0"
            aria-label="Importe"
          />
        </div>

        {esGasto && frecuentes.length > 0 ? (
          <>
            <div className="m-qa-lbl">
              Sobre
              {sugiriendo ? <span className="m-qa-hint"> · buscando…</span> : null}
            </div>
            <div className="m-qa-chips">
              {frecuentes.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`m-qa-chip${categoryId === s.id ? " on" : ""}`}
                  onClick={() => {
                    setCategoryId(categoryId === s.id ? null : s.id);
                    setOrigen(null); // elegido a mano: ya no hay que explicar de dónde salió
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </>
        ) : null}

        {/* La sugerencia puede caer FUERA de los frecuentes; si no se dijera, el usuario
            guardaría con un sobre que nunca vio. El origen se nombra porque no es lo mismo
            "lo pusiste ahí siempre" que "lo propuso la IA": lo segundo se revisa. */}
        {sobreElegido && !frecuentes.some((f) => f.id === sobreElegido.id) ? (
          <div className="m-qa-elegido">
            Sobre: <strong>{sobreElegido.name}</strong>
            {origen === "ia" ? " · sugerido, revísalo" : null}
            {origen === "historial" || origen === "cache" ? " · como siempre" : null}
          </div>
        ) : null}

        {/* ANTES de "Más detalles" a propósito: con el teclado puesto solo caben ~512px, y
            el camino frecuente (importe → sobre → guardar) tiene que terminar sin scroll.
            Lo opcional va después. */}
        <div className="m-qa-guardar">
          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={!puedeGuardar}
            onClick={guardar}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>

        <button type="button" className="m-qa-mas" onClick={() => setDetalles((v) => !v)}>
          {detalles ? "Menos detalles" : "Más detalles"}
        </button>

        {detalles ? (
          <div className="m-qa-det">
            <label className="fld-label" htmlFor="qa-com">
              {esGasto ? "Comercio" : "Fuente"}
            </label>
            <input
              id="qa-com"
              className="m-inp"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
              onBlur={pedirSugerencia}
              placeholder={esGasto ? "Súper, gasolina…" : "Salario…"}
              maxLength={160}
            />
            <label className="fld-label" htmlFor="qa-fecha">
              Fecha
            </label>
            <input
              id="qa-fecha"
              className="m-inp"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            <label className="fld-label" htmlFor="qa-nota">
              Nota
            </label>
            <input
              id="qa-nota"
              className="m-inp"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
            />
            <div className="m-qa-hint">Se guarda en {currency}, tu moneda principal.</div>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}
