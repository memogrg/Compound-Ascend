"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { currencySymbol } from "@/lib/format";
import {
  addTransactionAction,
  getQuickAddJarsAction,
  suggestSobreAction,
} from "@/modules/financial-base/api/v2-actions";
import type {
  FuenteIngreso,
  SobreRapido,
} from "@/modules/financial-base/services/quick-add-service";
import type { Jar } from "@/modules/financial-base/engine/expense-jars";
import { BottomSheet } from "./form-kit/bottom-sheet";
import { SheetSelect } from "./form-kit/fields";
import { CUR_OPTS } from "./form-kit/options";
import { SobrePicker } from "../(app)/gastos/gastos-forms";
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
  fuentes,
  currency,
}: {
  open: boolean;
  onClose: () => void;
  sobres: SobreRapido[];
  frecuentes: SobreRapido[];
  /** Fuentes de ingreso existentes. El "+" registra CONTRA una, no crea ninguna. */
  fuentes: FuenteIngreso[];
  /** Moneda principal del usuario. Es el valor INICIAL del selector, no un valor por
   *  omisión invisible: el usuario ve en qué moneda va a guardar y puede cambiarlo. */
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
  // La moneda es ESTADO visible, no una constante. El P0 del #437 nació de guardar con una
  // moneda que el usuario nunca vio.
  const [cur, setCur] = useState(currency);
  const [fuenteId, setFuenteId] = useState<string | null>(null);
  // Picker completo: los frascos se piden al abrirlo, no al abrir la hoja (ver
  // getQuickAddJarsAction).
  const [pickerOpen, setPickerOpen] = useState(false);
  const [jars, setJars] = useState<Extract<Jar, { kind: "normal" }>[] | null>(null);
  const [cargandoJars, setCargandoJars] = useState(false);

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
    setCur(currency);
    setFuenteId(null);
    setPickerOpen(false);
  }, [open, currency]);

  /** Los frascos se piden la PRIMERA vez que se abre el picker y se quedan cacheados
   *  mientras la hoja siga abierta: es el agregado caro, y no debe repetirse por cada
   *  vistazo. */
  const abrirPicker = async () => {
    setPickerOpen(true);
    if (jars || cargandoJars) return;
    setCargandoJars(true);
    try {
      const r = await getQuickAddJarsAction();
      setJars(r.jars);
    } finally {
      setCargandoJars(false);
    }
  };

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

  /**
   * `otro` = "Guardar y añadir otro": no cierra la hoja, deja el teclado puesto y limpia
   * SOLO el importe. Al volver del súper se meten tres o cuatro gastos seguidos, y
   * obligar a reabrir la hoja cada vez multiplica el trabajo por los toques de abrir,
   * enfocar y volver a elegir sobre. El sobre y el comercio se conservan justo porque en
   * esa ráfaga suelen repetirse.
   */
  const guardar = async (otro = false) => {
    if (!puedeGuardar) return;
    setGuardando(true);
    const res = await addTransactionAction({
      kind,
      amount: importe,
      // La que el usuario TIENE DELANTE en el selector. El P0 de moneda nació justo de un
      // importe cuya etiqueta salía de otro sitio que el número.
      currency: cur,
      occurredOn: date,
      categoryId: esGasto ? categoryId : null,
      // El ingreso se enlaza a la fuente por ID, no por su nombre: así suma en el
      // "recibido" de esa fuente en la pantalla de Ingresos. Un texto suelto no lo hace.
      incomeSourceId: !esGasto && fuenteId ? fuenteId : undefined,
      merchantOrSource: merchant.trim() === "" ? undefined : merchant.trim(),
      description: note.trim() === "" ? undefined : note.trim(),
      status: "confirmed",
      origin: "manual",
    });
    setGuardando(false);

    if (res.ok) {
      // Háptica + toast corto. Una pantalla de éxito sería un toque más en el flujo que
      // estamos acortando.
      navigator.vibrate?.(12);
      toast.show(esGasto ? "Gasto registrado" : "Ingreso registrado");
      if (otro) {
        setAmount("");
        // Se vuelve a pedir el foco: guardar lo pierde, y sin esto el siguiente movimiento
        // costaría un toque solo para volver al teclado.
        inputRef.current?.focus();
      } else {
        onClose();
      }
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
          <span className="m-qa-sym">{currencySymbol(cur)}</span>
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

        {esGasto ? (
          <>
            <div className="m-qa-lbl m-qa-lbl-row">
              <span>
                Sobre
                {sugiriendo ? <span className="m-qa-hint"> · buscando…</span> : null}
              </span>
              {/* Los chips son un ACELERADOR, no el catálogo. Sin esta salida, un gasto en
                  un sobre que no está entre los frecuentes no se podía registrar desde
                  aquí — había que ir a Gastos. */}
              <button type="button" className="m-qa-vertodos" onClick={abrirPicker}>
                {cargandoJars ? "Abriendo…" : "Ver todos"}
              </button>
            </div>
            <div className="m-qa-chips">
              {/* La sugerencia va como CHIP, en la misma fila que los frecuentes y ya
                  marcado, no como una línea de texto aparte. Si vive fuera de la fila, el
                  usuario tiene que leerla para enterarse; dentro, se cambia de un toque
                  igual que cualquier otro. Cuando cae fuera de los frecuentes se antepone,
                  porque es la que está aplicada. */}
              {sobreElegido && !frecuentes.some((f) => f.id === sobreElegido.id) ? (
                <button
                  type="button"
                  className="m-qa-chip on"
                  onClick={() => {
                    setCategoryId(null);
                    setOrigen(null);
                  }}
                  title={origen === "ia" ? "Sugerido por IA — tócalo para quitarlo" : undefined}
                >
                  {sobreElegido.name}
                  {/* El origen se nombra porque no es lo mismo "lo pusiste ahí siempre" que
                      "lo propuso la IA": lo segundo se revisa. */}
                  {origen === "ia" ? <span className="m-qa-orig"> sugerido</span> : null}
                  {origen === "historial" || origen === "cache" ? (
                    <span className="m-qa-orig"> como siempre</span>
                  ) : null}
                </button>
              ) : null}
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

        {!esGasto ? (
          <>
            <div className="m-qa-lbl">Fuente</div>
            {fuentes.length === 0 ? (
              // Sin fuentes NO se ofrece crear una desde aquí: el "+" registra cobros, y
              // dar de alta una fuente es una decisión de presupuesto con recurrencia,
              // tipo y categoría. Hacerlo por el camino rápido crearía fuentes basura.
              <div className="m-qa-hint">
                Aún no tienes fuentes de ingreso.{" "}
                <a href="/m/ingresos" className="m-qa-vertodos">
                  Créala en Ingresos
                </a>
              </div>
            ) : (
              <>
                <div className="m-qa-chips">
                  {fuentes.map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      className={`m-qa-chip${fuenteId === f.id ? " on" : ""}`}
                      onClick={() => {
                        const sel = fuenteId === f.id ? null : f.id;
                        setFuenteId(sel);
                        // La moneda SIGUE a la fuente: si "Salario Caro" está en USD, el
                        // importe se etiqueta en USD. Es lo que hace receivePartialIncome
                        // (toma line.currency) y es el invariante del P0: número y moneda
                        // de la misma fuente. Queda visible en el selector, y cambiable.
                        if (sel) setCur(f.currency);
                      }}
                    >
                      {f.name}
                      {f.currency !== cur ? <span className="m-qa-orig"> {f.currency}</span> : null}
                    </button>
                  ))}
                </div>
                <div className="m-qa-hint">
                  ¿Falta una?{" "}
                  <a href="/m/ingresos" className="m-qa-vertodos">
                    Créala en Ingresos
                  </a>
                </div>
              </>
            )}
          </>
        ) : null}

        {/* ANTES de "Más detalles" a propósito: con el teclado puesto solo caben ~512px, y
            el camino frecuente (importe → sobre → guardar) tiene que terminar sin scroll.
            Lo opcional va después. */}
        <div className="m-qa-guardar">
          <button
            type="button"
            className="m-btn m-btn-block m-btn-primary"
            disabled={!puedeGuardar}
            onClick={() => guardar(false)}
          >
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {/* Secundario y discreto: la ráfaga de varios gastos seguidos es real pero es la
              minoría, así que no puede competir visualmente con "Guardar". */}
          <button
            type="button"
            className="m-qa-otro"
            disabled={!puedeGuardar}
            onClick={() => guardar(true)}
          >
            Guardar y añadir otro
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
            {/* SELECTOR, no un texto. Antes decía "Se guarda en CRC, tu moneda principal"
                y no había forma de cambiarlo: exactamente la omisión que causó el P0 del
                #437, un importe en colones guardado como dólares. */}
            <SheetSelect
              name="currency"
              label="Moneda"
              value={cur}
              onChange={setCur}
              options={CUR_OPTS}
              sheetTitle="Moneda"
            />
          </div>
        ) : null}
      </div>

      {/* El MISMO picker de /m/gastos y /m/transacciones — agrupado por frasco y con el
          gastado/presupuestado al lado. Importado, no reescrito: un segundo picker se
          desincronizaría del primero en cuanto uno de los dos cambiara. */}
      <SobrePicker
        open={pickerOpen}
        jars={jars ?? []}
        currency={cur}
        selectedId={categoryId}
        onPick={(env) => {
          setCategoryId(env.id);
          setOrigen(null); // elegido a mano: ya no hay origen que explicar
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </BottomSheet>
  );
}
