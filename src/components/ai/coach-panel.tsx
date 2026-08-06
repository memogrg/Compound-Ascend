"use client";

/**
 * AI Coach flotante con dos modos + receipt scanner (F8). Disponible desde CUALQUIER
 * pantalla de la app (lo monta app-shell).
 * - "Asistente": wizard guiado que registra una transacción (solo tras confirmar).
 * - "Finanzas AI": la conversación con My Agent C+.
 * - Receipt: sube/captura imagen → /api/assistant/scan-receipt → tarjeta de
 *   confirmación → crea la transacción solo si el usuario confirma.
 *
 * La conversación NO vive aquí: es <AssistantConversation>, el mismo componente que
 * renderiza el tab de página completa (/asistente) y el móvil (/m/asistente). Este
 * archivo solo aporta el contenedor (FAB + panel + tabs) y el wizard manual.
 *
 * Ninguna acción financiera se ejecuta sin confirmación del usuario.
 */
import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { AgentMark } from "@/components/ui/agent-mark";
import { SobreCombobox } from "@/components/ai/sobre-combobox";
import {
  AssistantConversation,
  ReceiptConfirmCard,
  TxnConfirmCard,
  type DraftTxn,
} from "@/components/ai/assistant-conversation";
import { draftFromExtract, type ReceiptDraft, type ReceiptExtract } from "@/lib/ai/receipt-draft";
import { useCaptureToday, useUserTimezone } from "@/components/tz/timezone-context";
import { CURRENCIES } from "@/modules/personal-profile/constants";

/** Saludo del panel (web = voseo). */
const GREETING =
  "Hola, soy **My Agent C+**. Preguntame sobre tu dinero. Si propongo registrar algo, te pediré confirmación.";

const CHIPS = [
  "¿Cómo está mi salud financiera?",
  "¿Dónde puedo recortar gastos?",
  "¿Voy bien para mi Rich Life?",
];

type Mode = "assistant" | "ai";

export function CoachPanel() {
  // PRINCIPAL, no la de visualización: es la moneda con la que se captura.
  const captureCurrency = useCaptureCurrency();
  // "Hoy" en la zona del PERFIL (la misma que usa el servidor), no la del navegador.
  const today = useCaptureToday();
  // La zona en crudo: cuando el recibo no declara moneda, el país que sale de ella es mejor
  // default que la moneda principal (ver `resolveReceiptCurrency`).
  const tz = useUserTimezone();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("assistant");
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<ReceiptDraft | null>(null);
  const [scanning, setScanning] = useState(false);

  const onPickFile = () => fileRef.current?.click();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setScanning(true);
    try {
      const { base64, mimeType } = await readImage(file);
      const res = await fetch("/api/assistant/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (res.ok && data.extract) {
        // Los defaults (moneda no declarada, fecha imposible) los decide `draftFromExtract`, la
        // MISMA regla que aplica el chat móvil. Acá solo se le da el contexto del usuario.
        setReceipt(
          draftFromExtract(data.extract as ReceiptExtract, {
            hoy: today(),
            primaryCurrency: captureCurrency,
            timezone: tz,
          }),
        );
      } else {
        setReceipt(null);
        alert("No pudimos leer el recibo. Intenta con otra foto.");
      }
    } finally {
      setScanning(false);
    }
  };

  // En /asistente el FAB no aporta —ya estás en la conversación— y en móvil se monta justo
  // encima del botón de enviar. Sigue disponible en TODAS las demás pantallas.
  // El early return va después de los hooks: el orden no puede variar entre renders.
  if (pathname.startsWith("/asistente")) return null;

  return (
    <>
      <button
        className={`coach-fab${open ? " hide" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Pregúntale a My Agent C+"
      >
        <span className="spark">
          <AgentMark />
        </span>
        <span className="coach-fab-label">Pregúntale a My Agent C+</span>
      </button>

      <div className={`coach-panel${open ? " open" : ""}`} role="dialog" aria-label="My Agent C+">
        <div className="coach-top">
          <span className="spark">
            <AgentMark />
          </span>
          <div>
            <div className="coach-title">My Agent C+</div>
            <div className="coach-status">Tu asesor financiero</div>
          </div>
          <button
            className="coach-x"
            aria-label="Escanear recibo"
            onClick={onPickFile}
            title="Escanear recibo"
            style={{ marginLeft: "auto" }}
          >
            <Icon name="budget" width={2} />
          </button>
          <button className="coach-x" aria-label="Cerrar" onClick={() => setOpen(false)}>
            <Icon name="x" width={2} />
          </button>
          <input
            ref={fileRef}
            type="file"
            aria-label="Subir foto del recibo"
            accept="image/*"
            capture="environment"
            hidden
            onChange={onFile}
          />
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            gap: 2,
            padding: "0 12px",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Tab active={mode === "assistant"} onClick={() => setMode("assistant")}>
            Asistente
          </Tab>
          <Tab active={mode === "ai"} onClick={() => setMode("ai")}>
            Finanzas AI
          </Tab>
        </div>

        {scanning ? (
          <div className="muted" style={{ padding: "10px 18px", fontSize: 12 }}>
            Analizando recibo…
          </div>
        ) : null}

        {receipt ? (
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--line)" }}>
            <ReceiptConfirmCard
              draft={receipt}
              hoy={today()}
              onCancel={() => setReceipt(null)}
              onConfirmed={() => setReceipt(null)}
            />
          </div>
        ) : null}

        {mode === "assistant" ? (
          <TransactionWizard today={today} />
        ) : (
          <AssistantConversation variant="panel" greeting={GREETING} chips={CHIPS} />
        )}
      </div>
    </>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 12px",
        fontSize: 13,
        fontWeight: 500,
        background: "transparent",
        border: 0,
        borderBottom: active ? "2px solid var(--ink)" : "2px solid transparent",
        color: active ? "var(--ink)" : "var(--muted)",
        cursor: "pointer",
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  );
}

// ----------------------------------------------------------------------------
// Modo 1 — Asistente guiado (wizard de transacción)
// ----------------------------------------------------------------------------
function TransactionWizard({ today }: { today: () => string }) {
  const [draft, setDraft] = useState<DraftTxn>(() => ({
    kind: "gasto",
    description: "",
    amount: 0,
    currency: "CRC",
    occurredOn: today(),
    source: "manual",
  }));
  const [confirming, setConfirming] = useState(false);
  const descRef = useRef<HTMLInputElement>(null);

  // "Registrar otro gasto": deja el form en blanco (kind Gasto, conserva la moneda) y foco en
  // Descripción, sin cerrar el chat. Los campos del form están siempre montados → foco inmediato.
  const registerAnother = () => {
    setDraft((d) => ({
      kind: "gasto",
      description: "",
      amount: 0,
      currency: d.currency,
      occurredOn: today(),
      source: "manual",
      categoryId: null,
    }));
    setConfirming(false);
    setTimeout(() => descRef.current?.focus(), 0);
  };

  return (
    <div className="coach-body">
      <div className="coach-bubble" style={{ alignSelf: "stretch" }}>
        Registremos una transacción paso a paso. Nada se guarda hasta que confirmes.
      </div>

      <Field label="Tipo">
        <div style={{ display: "flex", gap: 8 }}>
          {(["gasto", "ingreso"] as const).map((k) => (
            <button
              key={k}
              className="coach-chip"
              style={
                draft.kind === k ? { background: "var(--ink)", color: "var(--bg)" } : undefined
              }
              // Al cambiar de naturaleza, el sobre elegido ya no aplica → se limpia.
              onClick={() => setDraft((d) => ({ ...d, kind: k, categoryId: null }))}
            >
              {k === "gasto" ? "Gasto" : "Ingreso"}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Descripción">
        <input
          ref={descRef}
          className="inp"
          aria-label="Descripción"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Supermercado, salario…"
        />
      </Field>

      <Field label="Sobre">
        <SobreCombobox
          kind={draft.kind}
          value={draft.categoryId ?? ""}
          onChange={(categoryId) => setDraft((d) => ({ ...d, categoryId: categoryId || null }))}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <Field label="Monto">
          <input
            className="inp"
            type="number"
            min="0"
            step="0.01"
            aria-label="Monto"
            value={draft.amount || ""}
            onChange={(e) => setDraft((d) => ({ ...d, amount: Number(e.target.value) }))}
            placeholder="0"
          />
        </Field>
        <Field label="Moneda">
          <select
            className="sel"
            aria-label="Moneda"
            value={draft.currency}
            onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.value}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Fecha">
        <input
          className="inp"
          type="date"
          aria-label="Fecha"
          value={draft.occurredOn}
          onChange={(e) => setDraft((d) => ({ ...d, occurredOn: e.target.value }))}
        />
      </Field>

      {confirming ? (
        <TxnConfirmCard
          draft={draft}
          title="Confirma la transacción"
          onCancel={() => setConfirming(false)}
          onConfirmed={() => setConfirming(false)}
          onRegisterAnother={registerAnother}
        />
      ) : (
        <button
          className="btn btn-primary"
          style={{ justifyContent: "center" }}
          disabled={!draft.description || draft.amount <= 0}
          onClick={() => setConfirming(true)}
        >
          Revisar y confirmar
        </button>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span className="fld-label">{label}</span>
      {children}
    </div>
  );
}

// ----------------------------------------------------------------------------
function readImage(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result);
      const base64 = result.split(",")[1] ?? "";
      resolve({ base64, mimeType: file.type || "image/jpeg" });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
