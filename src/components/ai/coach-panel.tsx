"use client";

/**
 * AI Coach con dos modos + receipt scanner (F8).
 * - "Asistente": wizard guiado que registra una transacción (solo tras confirmar).
 * - "Finanzas AI": chat con Gemini vía /api/assistant/chat; las acciones que
 *   propone requieren confirmación explícita (ActionCard).
 * - Receipt: sube/captura imagen → /api/assistant/scan-receipt → tarjeta de
 *   confirmación → crea la transacción solo si el usuario confirma.
 *
 * Ninguna acción financiera se ejecuta sin confirmación del usuario.
 */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { confirmTransactionAction } from "@/modules/assistant/api/actions";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "@/modules/financial-base/constants";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import type { AIActionProposal } from "@/lib/ai/types";

type Msg = { role: "ai" | "me"; html: string; action?: AIActionProposal | null };
type Mode = "assistant" | "ai";

const CHIPS = [
  "¿Cómo está mi salud financiera?",
  "¿Dónde puedo recortar gastos?",
  "¿Voy bien para mi Rich Life?",
];

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function CoachPanel() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("assistant");
  const fileRef = useRef<HTMLInputElement>(null);
  const [receipt, setReceipt] = useState<DraftTxn | null>(null);
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
        setReceipt({
          kind: "gasto",
          description: data.extract.merchant ?? "Compra",
          amount: data.extract.amount ?? 0,
          currency: "CRC",
          occurredOn: data.extract.date ?? todayISO(),
          source: "receipt",
        });
      } else {
        setReceipt(null);
        alert("No pudimos leer el recibo. Intenta con otra foto.");
      }
    } finally {
      setScanning(false);
    }
  };

  return (
    <>
      <button
        className={`coach-fab${open ? " hide" : ""}`}
        onClick={() => setOpen(true)}
        aria-label="Abrir Ascend AI"
      >
        <span className="spark">
          <Icon name="spark" filled />
        </span>
        Pregúntale a Ascend AI
      </button>

      <div className={`coach-panel${open ? " open" : ""}`} role="dialog" aria-label="Ascend AI">
        <div className="coach-top">
          <span className="spark">
            <Icon name="spark" filled />
          </span>
          <div>
            <div className="coach-title">Ascend AI</div>
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
            <TxnConfirmCard
              draft={receipt}
              title="Recibo escaneado"
              onCancel={() => setReceipt(null)}
              onConfirmed={() => setReceipt(null)}
            />
          </div>
        ) : null}

        {mode === "assistant" ? <TransactionWizard /> : <FinanceChat />}
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
// Modo 2 — Finanzas AI (chat)
// ----------------------------------------------------------------------------
function FinanceChat() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "ai",
      html: "Hola, soy <strong>Ascend AI</strong>. Pregúntame sobre tu dinero. Si propongo registrar algo, te pediré confirmación.",
    },
  ]);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight });
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    setValue("");
    const history = messages
      .filter((m) => !m.action)
      .map((m) => ({ role: m.role === "me" ? "user" : "assistant", content: stripHtml(m.html) }));
    setMessages((m) => [...m, { role: "me", html: escapeHtml(q) }]);
    setBusy(true);
    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessages((m) => [
          ...m,
          { role: "ai", html: escapeHtml(data.reply), action: data.action ?? null },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "ai", html: escapeHtml(data.error?.message ?? "No pude responder ahora.") },
        ]);
      }
    } catch {
      setMessages((m) => [...m, { role: "ai", html: "Hubo un problema de conexión." }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="coach-body" ref={bodyRef}>
        {messages.map((m, i) => (
          <div key={i}>
            <div className={`coach-msg${m.role === "me" ? " me" : ""}`}>
              {m.role === "ai" ? (
                <span className="ava">
                  <Icon name="spark" filled />
                </span>
              ) : null}
              <div className="coach-bubble" dangerouslySetInnerHTML={{ __html: m.html }} />
            </div>
            {m.action ? <ActionCard action={m.action} /> : null}
          </div>
        ))}
        {busy ? (
          <div className="muted" style={{ fontSize: 12, paddingLeft: 36 }}>
            Pensando…
          </div>
        ) : null}
      </div>
      <div className="coach-chips">
        {CHIPS.map((c) => (
          <button key={c} className="coach-chip" onClick={() => send(c)}>
            {c}
          </button>
        ))}
      </div>
      <div className="coach-input">
        <input
          placeholder="Pregunta sobre tu dinero…"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send(value)}
          aria-label="Mensaje para Ascend AI"
        />
        <button className="coach-send" aria-label="Enviar" onClick={() => send(value)}>
          <Icon name="send" width={2} />
        </button>
      </div>
    </>
  );
}

/** Tarjeta de acción propuesta por la IA. Solo create_transaction es ejecutable aquí. */
function ActionCard({ action }: { action: AIActionProposal }) {
  const [done, setDone] = useState(false);
  if (action.type === "create_transaction") {
    const p = action.payload as Record<string, unknown>;
    const VALID_LINKS = new Set(["debt", "goal", "holding", "policy", "rental"]);
    const linkedKind =
      typeof p.linkedKind === "string" && VALID_LINKS.has(p.linkedKind)
        ? (p.linkedKind as DraftTxn["linkedKind"])
        : null;
    const draft: DraftTxn = {
      kind: (p.kind as "ingreso" | "gasto") ?? "gasto",
      description: String(p.description ?? action.summary ?? "Transacción"),
      amount: Number(p.amount ?? 0),
      currency: String(p.currency ?? "CRC"),
      occurredOn: String(p.date ?? p.occurredOn ?? todayISO()),
      source: "chat",
      linkedKind,
      linkedId: linkedKind && typeof p.linkedId === "string" ? p.linkedId : null,
      linkedName: linkedKind && typeof p.linkedName === "string" ? p.linkedName : null,
    };
    return (
      <div style={{ padding: "4px 0 0 36px" }}>
        {done ? null : (
          <TxnConfirmCard
            draft={draft}
            title="Acción propuesta"
            onCancel={() => setDone(true)}
            onConfirmed={() => setDone(true)}
          />
        )}
      </div>
    );
  }
  // Sugerencias no ejecutables: solo informativas.
  return (
    <div style={{ padding: "6px 0 0 36px" }}>
      <div className="coach-bubble" style={{ borderLeft: "2px solid var(--info)" }}>
        {action.summary ?? "Sugerencia registrada. Revísala en el módulo correspondiente."}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Modo 1 — Asistente guiado (wizard de transacción)
// ----------------------------------------------------------------------------
type DraftTxn = {
  kind: "ingreso" | "gasto";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string;
  source: "chat" | "receipt" | "manual";
  // Fase 5: vínculo propuesto por la IA (el usuario lo ve antes de confirmar).
  linkedKind?: "debt" | "goal" | "holding" | "policy" | "rental" | null;
  linkedId?: string | null;
  linkedName?: string | null;
};

function TransactionWizard() {
  const [draft, setDraft] = useState<DraftTxn>({
    kind: "gasto",
    description: "",
    amount: 0,
    currency: "CRC",
    occurredOn: todayISO(),
    source: "manual",
  });
  const [confirming, setConfirming] = useState(false);
  const cats = draft.kind === "gasto" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

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
              onClick={() => setDraft((d) => ({ ...d, kind: k }))}
            >
              {k === "gasto" ? "Gasto" : "Ingreso"}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Descripción">
        <input
          className="inp"
          aria-label="Descripción"
          value={draft.description}
          onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))}
          placeholder="Supermercado, salario…"
        />
      </Field>

      <Field label="Categoría">
        <select
          className="sel"
          aria-label="Categoría"
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: d.description || e.target.value }))
          }
          defaultValue=""
        >
          <option value="">Selecciona…</option>
          {cats.map((c) => (
            <option key={c.value} value={c.label}>
              {c.label}
            </option>
          ))}
        </select>
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

/** Tarjeta de confirmación compartida (wizard, IA, recibo). Crea solo al confirmar. */
function TxnConfirmCard({
  draft,
  title,
  onCancel,
  onConfirmed,
}: {
  draft: DraftTxn;
  title: string;
  onCancel: () => void;
  onConfirmed: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpia el timeout pendiente si la tarjeta se desmonta antes de los 1200ms
  // (evita invocar onConfirmed sobre un componente ya desmontado).
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const confirm = async () => {
    setPending(true);
    setError(null);
    const res = await confirmTransactionAction(draft);
    setPending(false);
    if (res.ok) {
      setOk(true);
      timerRef.current = setTimeout(onConfirmed, 1200);
    } else {
      setError(res.message ?? "No se pudo guardar.");
    }
  };

  if (ok) {
    return (
      <div className="coach-bubble" style={{ borderLeft: "2px solid var(--pos)" }}>
        ✓ Transacción registrada.
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="eyebrow">{title}</div>
      <div style={{ fontSize: 14, fontWeight: 500, marginTop: 6 }}>
        {draft.kind === "ingreso" ? "+" : "−"}
        {draft.currency} {draft.amount.toLocaleString("es-CR")}
      </div>
      <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
        {draft.description} · {draft.occurredOn}
      </div>
      {draft.linkedKind && draft.linkedId ? (
        <div style={{ marginTop: 6 }}>
          <span className="chip" style={{ fontSize: 10.5 }}>
            Vinculada a{" "}
            {draft.linkedKind === "debt"
              ? "deuda"
              : draft.linkedKind === "goal"
                ? "meta"
                : "entidad"}
            {draft.linkedName ? `: ${draft.linkedName}` : ""}
          </span>
        </div>
      ) : null}
      {error ? (
        <div className="auth-err" style={{ marginTop: 6 }}>
          {error}
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button
          className="btn btn-secondary"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={onCancel}
          disabled={pending}
        >
          Cancelar
        </button>
        <button
          className="btn btn-primary"
          style={{ flex: 1, justifyContent: "center" }}
          onClick={confirm}
          disabled={pending}
        >
          {pending ? "Guardando…" : "Confirmar"}
        </button>
      </div>
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "");
}
