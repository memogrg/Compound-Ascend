"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import { confirmTransactionAction, confirmGoalAction } from "@/modules/assistant/api/actions";
import { SobreCombobox } from "@/components/ai/sobre-combobox";
import type { AIActionProposal } from "@/lib/ai/types";
import { formatMoney } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";

/**
 * Asistente IA en móvil (/m/asistente): chat + escáner de recibos, con la piel de
 * mobile.css. REUTILIZA el MISMO backend sin reimplementar nada:
 *  - chat:   POST /api/assistant/chat            { message, history } → { reply, action }
 *  - recibo: POST /api/assistant/scan-receipt    { imageBase64, mimeType } → { extract }
 *  - ejecutar acción: confirmTransactionAction / confirmGoalAction (Server Actions)
 * Las acciones propuestas por la IA NUNCA se auto-ejecutan: se muestran en una tarjeta
 * de confirmación (Confirmar / Cancelar), igual que en la web. es-MX "tú", tema claro.
 */

type DraftTxn = {
  kind: "ingreso" | "gasto";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string;
  source: "chat" | "receipt" | "manual";
  // Sobre (hoja) sugerido por la IA; el usuario confirma/corrige. null/undefined = "Sin sobre".
  categoryId?: string | null;
  categoryPath?: string | null;
  linkedKind?: "debt" | "goal" | "holding" | "policy" | "rental" | null;
  linkedId?: string | null;
  linkedName?: string | null;
};
/** Restante del sobre que devuelve confirmTransactionAction (solo gasto con sobre). */
type SobreRemaining = {
  path: string;
  currency: string;
  budget: number;
  spent: number;
  remaining: number;
  hasBudget: boolean;
};
/** Mensaje de éxito: con restante del sobre si aplica, o el genérico si no. */
function sobreSuccessMessage(s: SobreRemaining | null): string {
  if (!s) return "✓ Transacción registrada.";
  if (!s.hasBudget) return `✓ Registrado en ${s.path}. (Este sobre no tiene presupuesto asignado)`;
  if (s.remaining < 0)
    return `✓ Registrado en ${s.path}. Te pasaste por ${formatMoney(-s.remaining, s.currency)}.`;
  return `✓ Registrado en ${s.path}. Te quedan ${formatMoney(s.remaining, s.currency)} de ${formatMoney(s.budget, s.currency)} este mes.`;
}
type DraftGoal = {
  name: string;
  targetAmount: number;
  monthlyContribution: number;
  currency: string;
  targetDate: string | null;
};
type ChatMsg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  action?: AIActionProposal | null;
  txn?: DraftTxn; // borrador de transacción proveniente del escáner de recibos
};

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mapea action.payload → borrador de transacción (espeja ActionCard de la web). */
function txnFromAction(action: AIActionProposal, principal: string): DraftTxn {
  const p = action.payload as Record<string, unknown>;
  const VALID = new Set(["debt", "goal", "holding", "policy", "rental"]);
  const linkedKind =
    typeof p.linkedKind === "string" && VALID.has(p.linkedKind)
      ? (p.linkedKind as DraftTxn["linkedKind"])
      : null;
  return {
    kind: (p.kind as "ingreso" | "gasto") ?? "gasto",
    description: String(p.description ?? action.summary ?? "Transacción"),
    amount: Number(p.amount ?? 0),
    // La que proponga la IA; si no propone, la PRINCIPAL del usuario. El "CRC" literal que
    // había aquí imponía colones a cualquiera, sin forma de corregirlo.
    currency: String(p.currency ?? principal),
    occurredOn: String(p.date ?? p.occurredOn ?? todayISO()),
    source: "chat",
    // Sobre sugerido por el backend (hoja real del usuario) — preselecciona el selector.
    categoryId: typeof p.categoryId === "string" ? p.categoryId : null,
    categoryPath: typeof p.categoryPath === "string" ? p.categoryPath : null,
    linkedKind,
    linkedId: linkedKind && typeof p.linkedId === "string" ? p.linkedId : null,
    linkedName: linkedKind && typeof p.linkedName === "string" ? p.linkedName : null,
  };
}

/** Mapea action.payload → borrador de meta (espeja ActionCard de la web). */
function goalFromAction(action: AIActionProposal, principal: string): DraftGoal {
  const p = action.payload as Record<string, unknown>;
  const targetDate = typeof p.targetDate === "string" && p.targetDate.trim() ? p.targetDate : null;
  return {
    name: String(p.name ?? action.summary ?? "Meta"),
    targetAmount: Number(p.targetAmount ?? 0),
    monthlyContribution: Number(p.monthlyContribution ?? 0),
    currency: String(p.currency ?? principal),
    targetDate,
  };
}

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

const LINK_LABEL: Record<string, string> = {
  debt: "deuda",
  goal: "meta",
  holding: "inversión",
  policy: "seguro",
  rental: "alquiler",
};

export function MobileAssistant({ primaryCurrency }: { primaryCurrency: string }) {
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 0,
      role: "assistant",
      text: "¡Hola! Soy tu asistente de CARTERA+. Pregúntame sobre tus finanzas, o escanea un recibo con la cámara y lo registro por ti (siempre con tu confirmación).",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const idRef = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const nextId = () => idRef.current++;

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, scanning]);

  async function send() {
    const q = input.trim();
    if (!q || sending) return;
    setInput("");
    // history = conversación previa (sin tarjetas de acción), como la web
    const history = messages
      .filter((m) => !m.action && !m.txn)
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) }));
    setMessages((m) => [...m, { id: nextId(), role: "user", text: q }]);
    setSending(true);
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
          {
            id: nextId(),
            role: "assistant",
            text: String(data.reply ?? ""),
            action: data.action ?? null,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: "assistant",
            text: data.error?.message ?? "No pude responder ahora.",
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "assistant", text: "Hubo un problema de conexión." },
      ]);
    } finally {
      setSending(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir la misma foto
    if (!file || scanning) return;
    setScanning(true);
    setMessages((m) => [...m, { id: nextId(), role: "user", text: "📷 Recibo enviado" }]);
    try {
      const { base64, mimeType } = await readImage(file);
      const res = await fetch("/api/assistant/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64, mimeType }),
      });
      const data = await res.json();
      if (res.ok && data.extract) {
        // `currency` faltaba en este tipo inline, así que se descartaba en silencio la
        // moneda que el extractor SÍ detecta del recibo (el prompt pide distinguir ₡ de $).
        const ext = data.extract as {
          amount: number | null;
          merchant: string | null;
          date: string | null;
          currency: string | null;
        };
        const txn: DraftTxn = {
          kind: "gasto",
          description: ext.merchant ?? "Compra",
          amount: ext.amount ?? 0,
          currency: ext.currency ?? primaryCurrency,
          occurredOn: ext.date ?? todayISO(),
          source: "receipt",
        };
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: "assistant",
            text: "Leí tu recibo. Revisa y confirma para registrarlo:",
            txn,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: "assistant",
            text: "No pude leer el recibo. Intenta con otra foto.",
          },
        ]);
      }
    } catch {
      setMessages((m) => [
        ...m,
        { id: nextId(), role: "assistant", text: "No pude procesar la imagen." },
      ]);
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="m-chat">
      <header className="m-chat-head">
        <Link href="/m" className="icon-btn" aria-label="Volver">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
        <div>
          <div className="m-chat-title">Asistente IA</div>
          <div className="muted" style={{ fontSize: 11.5 }}>
            Chat + escáner de recibos
          </div>
        </div>
      </header>

      <div className="m-chat-scroll">
        {messages.map((m) => (
          <div key={m.id}>
            <div className={`m-msg${m.role === "user" ? " me" : ""}`}>
              {m.role === "assistant" ? (
                <span className="m-ava" aria-hidden>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 3l1.6 3.9L17.5 8.5 13.6 10 12 14l-1.6-4L6.5 8.5l3.9-1.6z" />
                  </svg>
                </span>
              ) : null}
              {/* La IA responde en Markdown → HTML seguro (paridad con la web). El texto del
                  usuario se renderiza como texto plano (React lo escapa). Ver lib/markdown. */}
              {m.role === "assistant" ? (
                <div
                  className="m-bubble"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }}
                />
              ) : (
                <div className="m-bubble">{m.text}</div>
              )}
            </div>
            {m.action?.type === "create_transaction" ? (
              <MTxnConfirm draft={txnFromAction(m.action, primaryCurrency)} />
            ) : null}
            {m.action?.type === "create_goal" ? (
              <MGoalConfirm draft={goalFromAction(m.action, primaryCurrency)} />
            ) : null}
            {m.txn ? <MTxnConfirm draft={m.txn} /> : null}
          </div>
        ))}
        {sending ? (
          <div className="m-msg">
            <span className="m-ava" aria-hidden>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3l1.6 3.9L17.5 8.5 13.6 10 12 14l-1.6-4L6.5 8.5l3.9-1.6z" />
              </svg>
            </span>
            <div className="m-bubble m-typing" aria-label="Escribiendo">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}
        {scanning ? (
          <div className="m-msg">
            <span className="m-ava" aria-hidden />
            <div className="m-bubble muted">Leyendo tu recibo…</div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <div className="m-chat-bar">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          onChange={onFile}
          aria-label="Escanear recibo con la cámara"
        />
        <button
          type="button"
          className="icon-btn m-chat-cam"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          aria-label="Escanear recibo"
          title="Escanear recibo"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.9}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>
        <input
          className="m-inp m-chat-input"
          value={input}
          maxLength={2000}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Escribe tu mensaje…"
          aria-label="Mensaje"
          inputMode="text"
        />
        <button
          type="button"
          className="icon-btn m-chat-send"
          onClick={() => void send()}
          disabled={sending || !input.trim()}
          aria-label="Enviar"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** Tarjeta de confirmación de transacción (chat o recibo). Ejecuta solo al confirmar. */
function MTxnConfirm({ draft }: { draft: DraftTxn }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "ok" | "cancel">("idle");
  // Restante del sobre tras crear el gasto (para el mensaje de éxito); null = mensaje genérico.
  const [sobre, setSobre] = useState<SobreRemaining | null>(null);
  // Sobre elegido (arranca en el sugerido por la IA); "" = Sin sobre.
  const [categoryId, setCategoryId] = useState<string>(draft.categoryId ?? "");

  const confirm = async () => {
    setPending(true);
    setError(null);
    const res = await confirmTransactionAction({ ...draft, categoryId: categoryId || null });
    setPending(false);
    if (res.ok) {
      setSobre(res.sobre ?? null);
      setPhase("ok");
    } else setError(res.message ?? "No se pudo guardar.");
  };

  if (phase === "cancel") return null;
  if (phase === "ok") return <div className="m-confirm-done">{sobreSuccessMessage(sobre)}</div>;

  return (
    <div className="m-confirm">
      <div className="m-confirm-eyebrow">Acción propuesta</div>
      <div className="m-confirm-amt">
        {draft.kind === "ingreso" ? "+" : "−"}
        {formatMoney(draft.amount, draft.currency)}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
        {draft.description} · {draft.occurredOn}
      </div>
      <label style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          Sobre
        </span>
        <SobreCombobox
          kind={draft.kind}
          value={categoryId}
          onChange={setCategoryId}
          disabled={pending}
          suggestedPath={draft.categoryPath}
          inputClassName="m-inp"
        />
      </label>
      {draft.linkedKind && draft.linkedId ? (
        <div style={{ marginTop: 8 }}>
          <span className="m-confirm-chip">
            Vinculada a {LINK_LABEL[draft.linkedKind] ?? "entidad"}
            {draft.linkedName ? `: ${draft.linkedName}` : ""}
          </span>
        </div>
      ) : null}
      {error ? (
        <div className="m-auth-msg" style={{ marginTop: 8 }}>
          {error}
        </div>
      ) : null}
      <div className="m-confirm-actions">
        <button
          className="m-btn m-btn-secondary"
          onClick={() => setPhase("cancel")}
          disabled={pending}
        >
          Cancelar
        </button>
        <button className="m-btn m-btn-primary" onClick={confirm} disabled={pending}>
          {pending ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

/** Tarjeta de confirmación de meta propuesta por la IA. Ejecuta solo al confirmar. */
function MGoalConfirm({ draft }: { draft: DraftGoal }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "ok" | "cancel">("idle");

  const confirm = async () => {
    setPending(true);
    setError(null);
    const res = await confirmGoalAction({
      name: draft.name,
      targetAmount: draft.targetAmount,
      monthlyContribution: draft.monthlyContribution,
      currency: draft.currency,
      ...(draft.targetDate ? { targetDate: draft.targetDate } : {}),
    });
    setPending(false);
    if (res.ok) setPhase("ok");
    else setError(res.message ?? "No se pudo crear la meta.");
  };

  if (phase === "cancel") return null;
  if (phase === "ok") return <div className="m-confirm-done">✓ Meta creada.</div>;

  return (
    <div className="m-confirm">
      <div className="m-confirm-eyebrow">Crear meta</div>
      <div className="m-confirm-amt" style={{ fontSize: 16 }}>
        {draft.name}
      </div>
      <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
        Objetivo: {formatMoney(draft.targetAmount, draft.currency)}
        {draft.monthlyContribution > 0
          ? ` · ${formatMoney(draft.monthlyContribution, draft.currency)}/mes`
          : ""}
        {draft.targetDate ? ` · para ${draft.targetDate}` : ""}
      </div>
      {error ? (
        <div className="m-auth-msg" style={{ marginTop: 8 }}>
          {error}
        </div>
      ) : null}
      <div className="m-confirm-actions">
        <button
          className="m-btn m-btn-secondary"
          onClick={() => setPhase("cancel")}
          disabled={pending}
        >
          Cancelar
        </button>
        <button className="m-btn m-btn-primary" onClick={confirm} disabled={pending}>
          {pending ? "Creando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
