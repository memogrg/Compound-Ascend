"use client";

/**
 * CONVERSACIÓN DEL ASISTENTE — un solo componente para las tres superficies:
 *
 *  - panel flotante  (coach-panel.tsx, variant="panel")   — sigue disponible en toda la app
 *  - tab de página   (/asistente,      variant="page")    — mismo hilo, a lo ancho
 *  - móvil           (/m/asistente,    variant="mobile")  — piel de mobile.css
 *
 * Las tres comparten la MISMA lógica (carga del hilo retenido, envío, historial acotado,
 * tarjetas de acción, escáner de recibos) y el MISMO markup. Lo único que cambia por
 * superficie son las clases CSS, que salen del mapa `SKINS`: así el panel conserva su
 * piel `coach-*` y el móvil la suya `m-*` sin que la lógica se duplique ni divergir.
 *
 * El hilo es compartido de verdad porque las tres leen `loadChatHistoryAction()` y el
 * backend persiste cada turno en `chat_messages`: pasar del panel al tab (o al móvil)
 * no pierde la conversación. Se carga la VENTANA RETENIDA (lib/ai/chat-retention), no solo
 * el día, para poder scrollear y responder a un mensaje de días atrás; el aviso de arriba
 * del hilo dice cuánto se guarda y sale de la misma constante.
 *
 * Ninguna acción financiera se ejecuta sin confirmación explícita del usuario.
 */
import { useEffect, useId, useRef, useState } from "react";

import { Icon } from "@/components/ui/icon";
import { AgentMark } from "@/components/ui/agent-mark";
import { SobreCombobox } from "@/components/ai/sobre-combobox";
import { useCaptureCurrency } from "@/components/layout/currency-context";
import { useCaptureToday, useUserTimezone } from "@/components/tz/timezone-context";
import {
  confirmTransactionAction,
  confirmGoalAction,
  confirmPriceAlertAction,
  confirmSetDcaAction,
  confirmAdjustBudgetAction,
  confirmDebtExtraPaymentAction,
  confirmBatchTransactionsAction,
  loadChatHistoryAction,
  emailTranscriptAction,
} from "@/modules/assistant/api/actions";
import { fetchWithTimeout, isTimeoutError } from "@/lib/fetch-timeout";
import { retentionNoticeText } from "@/lib/ai/chat-retention";
import { quoteExcerpt, QUOTE_MISSING_TEXT } from "@/lib/ai/chat-quote";
import {
  normalizarFilas,
  validarFila,
  resumenValidacion,
  aPayload,
  parsearMonto,
  type BatchRowDraft,
} from "@/lib/ai/batch-rows";
import {
  draftFromExtract,
  validarRecibo,
  necesitaConfirmarMoneda,
  etiquetaConfirmarMoneda,
  avisoFecha,
  aPayloadRecibo,
  resumenRegistro,
  type ReceiptDraft,
  type ReceiptExtract,
} from "@/lib/ai/receipt-draft";
import type { AIActionProposal } from "@/lib/ai/types";
import type { ConfirmResult, BatchResult } from "@/modules/assistant/api/actions";
import { formatMoney, CURRENCY_OPTIONS } from "@/lib/format";
import { renderMarkdown } from "@/lib/markdown";
import { cn } from "@/lib/utils";

// ----------------------------------------------------------------------------
// Pieles (solo clases CSS; el markup es idéntico en las tres superficies)
// ----------------------------------------------------------------------------
export type Skin = {
  scroll: string;
  msg: string;
  msgMe: string;
  ava: string;
  bubble: string;
  /** "text" = «Pensando…» (web); "dots" = tres puntos animados (móvil). */
  typing: "text" | "dots";
  chips: string;
  chip: string;
  bar: string;
  input: string;
  send: string;
  cam: string;
  toolbar: string;
  toolbarMsg: string;
  /** Línea sutil de retención, arriba del hilo. */
  retention: string;
  /** Acción "Responder" bajo cada mensaje citable. */
  replyBtn: string;
  /** Fragmento citado, dentro de la burbuja del mensaje que responde. */
  quote: string;
  /** Barra de "respondiendo a…" sobre el input, con su botón de cancelar. */
  replyBar: string;
  replyBarX: string;
  /** Pie fijo con el encuadre educativo (reemplaza el disclaimer por mensaje). */
  disclaimer: string;
  cardWrap: string;
  card: string;
  eyebrow: string;
  amount: string;
  amountName: string;
  sub: string;
  tagWrap: string;
  tag: string;
  fieldLabel: string;
  error: string;
  actions: string;
  btnPrimary: string;
  btnSecondary: string;
  done: string;
  /** Clase del input del combobox de sobres (el móvil necesita `m-inp`). */
  sobreInput?: string;
  /** Campos de texto/fecha/número dentro de una tarjeta (alta en lote). */
  fieldInput?: string;
  /** Selects dentro de una tarjeta (moneda del alta en lote). */
  fieldSelect?: string;
};

const WEB_SKIN: Skin = {
  scroll: "coach-body",
  msg: "coach-msg",
  msgMe: "me",
  ava: "ava",
  bubble: "coach-bubble",
  typing: "text",
  chips: "coach-chips",
  chip: "coach-chip",
  bar: "coach-input",
  input: "",
  send: "coach-send",
  cam: "coach-send ac-cam",
  toolbar: "ac-toolbar",
  toolbarMsg: "muted ac-toolbar-msg",
  retention: "muted ac-retention",
  replyBtn: "ac-reply-btn",
  quote: "ac-quote",
  replyBar: "ac-replying",
  replyBarX: "ac-replying-x",
  disclaimer: "muted ac-disclaimer",
  cardWrap: "ac-card-wrap",
  card: "card ac-confirm",
  eyebrow: "eyebrow",
  amount: "ac-amt",
  amountName: "ac-amt ac-amt-name",
  sub: "muted ac-sub",
  tagWrap: "ac-tag-wrap",
  tag: "chip ac-tag",
  fieldLabel: "fld-label",
  error: "auth-err ac-err",
  actions: "ac-actions",
  btnPrimary: "btn btn-primary",
  btnSecondary: "btn btn-secondary",
  done: "coach-bubble ac-done",
  fieldInput: "inp",
  fieldSelect: "sel",
};

const MOBILE_SKIN: Skin = {
  scroll: "m-chat-scroll",
  msg: "m-msg",
  msgMe: "me",
  ava: "m-ava",
  bubble: "m-bubble",
  typing: "dots",
  chips: "m-chat-chips",
  chip: "m-chat-chip",
  bar: "m-chat-bar",
  input: "m-inp m-chat-input",
  send: "icon-btn m-chat-send",
  cam: "icon-btn m-chat-cam",
  toolbar: "m-chat-toolbar",
  toolbarMsg: "muted m-chat-toolbar-msg",
  retention: "muted m-chat-retention",
  replyBtn: "m-reply-btn",
  quote: "m-quote",
  replyBar: "m-replying",
  replyBarX: "m-replying-x",
  disclaimer: "muted m-chat-disclaimer",
  cardWrap: "",
  card: "m-confirm",
  eyebrow: "m-confirm-eyebrow",
  amount: "m-confirm-amt",
  amountName: "m-confirm-amt m-confirm-name",
  sub: "muted m-confirm-sub",
  tagWrap: "m-confirm-tag",
  tag: "m-confirm-chip",
  fieldLabel: "m-field-label",
  error: "m-auth-msg m-confirm-err",
  actions: "m-confirm-actions",
  btnPrimary: "m-btn m-btn-primary",
  btnSecondary: "m-btn m-btn-secondary",
  done: "m-confirm-done",
  sobreInput: "m-inp",
  fieldInput: "m-inp",
  fieldSelect: "m-inp",
};

export type AssistantVariant = "panel" | "page" | "mobile";

const SKIN_BY_VARIANT: Record<AssistantVariant, Skin> = {
  panel: WEB_SKIN,
  page: WEB_SKIN,
  mobile: MOBILE_SKIN,
};

// ----------------------------------------------------------------------------
// Tipos compartidos
// ----------------------------------------------------------------------------
export type DraftTxn = {
  kind: "ingreso" | "gasto";
  description: string;
  amount: number;
  currency: string;
  occurredOn: string;
  source: "chat" | "receipt" | "manual";
  /** Sobre (hoja) sugerido por la IA; el usuario lo confirma/corrige. null = "Sin sobre". */
  categoryId?: string | null;
  categoryPath?: string | null;
  linkedKind?: "debt" | "goal" | "holding" | "policy" | "rental" | null;
  linkedId?: string | null;
  linkedName?: string | null;
};

type DraftGoal = {
  name: string;
  targetAmount: number;
  monthlyContribution: number;
  currency: string;
  targetDate: string | null;
};

type DraftAlert = {
  symbol: string;
  targetPrice: number;
  assetType: "etf" | "accion" | "cripto";
  currency: string;
};

/** Restante del sobre que devuelve confirmTransactionAction (solo gasto con sobre). */
export type SobreRemaining = {
  path: string;
  currency: string;
  budget: number;
  spent: number;
  remaining: number;
  hasBudget: boolean;
};

/** Cita mostrada arriba de un mensaje. `missing` = el citado ya lo borró la retención. */
type Quote = { id: string; excerpt: string; role: "user" | "assistant"; missing?: boolean };

type ChatMsg = {
  id: number;
  role: "user" | "assistant";
  text: string;
  /**
   * id REAL de chat_messages. Solo los mensajes persistidos lo tienen — son los únicos que se
   * pueden citar (el saludo, los borradores y un turno en vuelo todavía no existen en la BD).
   */
  dbId?: string;
  /** Mensaje al que este responde. */
  quote?: Quote;
  action?: AIActionProposal | null;
  /** Borrador EDITABLE que viene del escáner de recibos (no de la IA). */
  receipt?: ReceiptDraft;
};

const LINK_LABEL: Record<string, string> = {
  debt: "deuda",
  goal: "meta",
  holding: "inversión",
  policy: "seguro",
  rental: "alquiler",
};

/** Timeout del cliente para el chat (~40s), por debajo del maxDuration=60 del endpoint. */
const CHAT_TIMEOUT_MS = 40_000;

/**
 * Encuadre educativo. Vive ACÁ, fijo al pie de la conversación, y ya NO en cada respuesta del
 * modelo (el system prompt tiene prohibido repetirlo): dicho una vez y siempre visible informa
 * mejor que un párrafo de disclaimer por mensaje, que se vuelve ruido y se deja de leer.
 * Impersonal, así que sirve al voseo de la web y al "tú" del móvil sin duplicarse.
 */
const DISCLAIMER = "My Agent C+ da información educativa, no asesoría financiera.";

/** Mensaje de éxito: con restante del sobre si aplica, o el genérico si no. */
export function sobreSuccessMessage(s: SobreRemaining | null): string {
  if (!s) return "✓ Transacción registrada.";
  if (!s.hasBudget) return `✓ Registrado en ${s.path}. (Este sobre no tiene presupuesto asignado)`;
  if (s.remaining < 0)
    return `✓ Registrado en ${s.path}. Te pasaste por ${formatMoney(-s.remaining, s.currency)}.`;
  return `✓ Registrado en ${s.path}. Te quedan ${formatMoney(s.remaining, s.currency)} de ${formatMoney(s.budget, s.currency)} este mes.`;
}

/** Mapea action.payload → borrador de transacción. `today` = hoy en la zona del perfil. */
function txnFromAction(
  action: AIActionProposal,
  fallbackCurrency: string,
  today: string,
): DraftTxn {
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
    currency: String(p.currency ?? fallbackCurrency),
    occurredOn: String(p.date ?? p.occurredOn ?? today),
    source: "chat",
    categoryId: typeof p.categoryId === "string" ? p.categoryId : null,
    categoryPath: typeof p.categoryPath === "string" ? p.categoryPath : null,
    linkedKind,
    linkedId: linkedKind && typeof p.linkedId === "string" ? p.linkedId : null,
    linkedName: linkedKind && typeof p.linkedName === "string" ? p.linkedName : null,
  };
}

/** Mapea action.payload → borrador de meta. */
function goalFromAction(action: AIActionProposal, fallbackCurrency: string): DraftGoal {
  const p = action.payload as Record<string, unknown>;
  const targetDate = typeof p.targetDate === "string" && p.targetDate.trim() ? p.targetDate : null;
  return {
    name: String(p.name ?? action.summary ?? "Meta"),
    targetAmount: Number(p.targetAmount ?? 0),
    monthlyContribution: Number(p.monthlyContribution ?? 0),
    currency: String(p.currency ?? fallbackCurrency),
    targetDate,
  };
}

/** Mapea action.payload → borrador de alerta de precio. */
function alertFromAction(action: AIActionProposal, fallbackCurrency: string): DraftAlert {
  const p = action.payload as Record<string, unknown>;
  const at = p.assetType === "etf" || p.assetType === "accion" ? p.assetType : "cripto";
  return {
    symbol: String(p.symbol ?? "").toUpperCase(),
    targetPrice: Number(p.targetPrice ?? 0),
    assetType: at,
    currency: String(p.currency ?? (at === "cripto" ? "USD" : fallbackCurrency)),
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

// ----------------------------------------------------------------------------
// Componente compartido
// ----------------------------------------------------------------------------
type Props = {
  variant: AssistantVariant;
  /** Saludo inicial (voseo en web, "tú" en móvil). */
  greeting: string;
  /**
   * Moneda con la que se CAPTURA un monto (la principal, no la de visualización).
   * Se pasa por prop donde no hay CurrencyProvider (el móvil /m/asistente vive fuera
   * del grupo (app)); si se omite, sale del contexto.
   */
  captureCurrency?: string;
  /**
   * Zona horaria del perfil para fechar la captura. Mismo motivo que `captureCurrency`:
   * el asistente móvil vive fuera del provider. null/omitida = sale del contexto.
   */
  timezone?: string | null;
  /** Chips de sugerencias sobre el input. Vacío = no se dibuja la fila. */
  chips?: string[];
  /** Botón «enviarme el transcript por correo». */
  transcript?: boolean;
  /** Escáner de recibos dentro de la barra de entrada. */
  scanner?: boolean;
};

export function AssistantConversation({
  variant,
  greeting,
  captureCurrency,
  timezone,
  chips = [],
  transcript = true,
  scanner = false,
}: Props) {
  const s = SKIN_BY_VARIANT[variant];
  // La PRINCIPAL, no la de visualización: es la moneda con la que se captura.
  const contextCurrency = useCaptureCurrency();
  const currency = captureCurrency ?? contextCurrency;
  // "Hoy" en la ZONA DEL PERFIL, la misma que usa el servidor (`userToday`): si el cliente
  // fechara con la del navegador, un gasto capturado a las 11pm desde un dispositivo en
  // otra zona caería en un día distinto del que el resto de la app considera hoy. Es una
  // función, no un valor: se evalúa al capturar, no en el render (que puede ser de ayer).
  const today = useCaptureToday(timezone);
  // La zona en crudo, además de "hoy": cuando el recibo no declara moneda, el país que sale de la
  // zona es mejor default que la moneda principal (ver `resolveReceiptCurrency`).
  const contextTz = useUserTimezone();
  const tz = timezone ?? contextTz;

  const [messages, setMessages] = useState<ChatMsg[]>([
    { id: 0, role: "assistant", text: greeting },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [transcriptMsg, setTranscriptMsg] = useState<string | null>(null);
  const [sendingTranscript, setSendingTranscript] = useState(false);
  // Mensaje que se está citando (null = mensaje suelto). Se limpia al enviar o al cancelar.
  const [replying, setReplying] = useState<Quote | null>(null);
  const idRef = useRef(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  // Cerrojo de envío en un ref, NO en el estado: dos clicks en el mismo tick leen el mismo
  // `sending === false` (React aún no re-renderizó) y ambos pasaban la guarda. El usuario veía
  // su mensaje duplicado y el segundo turno gastaba una llamada al modelo de más.
  const sendingRef = useRef(false);

  const nextId = () => idRef.current++;

  // Al abrir: cargar la VENTANA RETENIDA (persistida por usuario) para que el hilo sobreviva a
  // minimizar/refrescar/cambiar de superficie y se pueda scrollear/responder a un mensaje de días
  // atrás. Es lo que hace que el panel y el tab muestren el MISMO hilo. Sin nada, queda el saludo.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const previos = await loadChatHistoryAction();
        if (!alive || previos.length === 0) return;
        // La cita se resuelve contra el propio hilo cargado: si el citado quedó fuera de la
        // ventana retenida (o ya se borró), no hay texto que mostrar y se avisa en vez de
        // dibujar una cita vacía.
        const porId = new Map(previos.map((m) => [m.id, m]));
        setMessages((prev) => [
          prev[0]!, // saludo
          ...previos.map((m): ChatMsg => {
            const citado = m.replyToId ? porId.get(m.replyToId) : undefined;
            return {
              id: nextId(),
              role: m.role,
              text: m.content,
              dbId: m.id,
              ...(m.replyToId
                ? {
                    quote: citado
                      ? { id: citado.id, excerpt: quoteExcerpt(citado.content), role: citado.role }
                      : { id: m.replyToId, excerpt: "", role: "assistant" as const, missing: true },
                  }
                : {}),
            };
          }),
        ]);
      } catch {
        // best-effort: si falla la carga, se queda el saludo
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, sending, scanning]);

  // AUTO-RESIZE del campo: crece con el contenido y vuelve a una línea al enviar (el efecto
  // corre también cuando `input` pasa a ""). El TOPE vive en CSS (`max-height` + scroll) y no
  // acá: cada piel tiene su tipografía, así que un tope en píxeles fijo daría distinta cantidad
  // de líneas en web y en móvil. Poner "auto" antes de medir es obligatorio — si no, scrollHeight
  // devuelve el alto ya inflado y el campo nunca vuelve a achicarse.
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  /**
   * En la WEB el Enter envía (es un chat de escritorio, con teclado y modificadores a mano).
   * En MÓVIL no: el Enter del teclado virtual hace salto de línea y se envía con el botón, que es
   * lo que hacen WhatsApp y Telegram en teléfono. Ahí no hay Ctrl ni Shift cómodos, y un Enter que
   * envía convierte cualquier intento de escribir dos renglones en dos mensajes cortados.
   */
  const enterEnvia = variant !== "mobile";

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return; // Shift+Enter: el textarea ya inserta el salto por sí solo.
    if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+Enter NO inserta nada por defecto en un textarea: hay que hacerlo a mano.
      // `setRangeText` con "end" respeta la selección actual y deja el cursor después del salto,
      // que es lo que no se logra reconstruyendo el string a mano.
      e.preventDefault();
      const el = e.currentTarget;
      el.setRangeText("\n", el.selectionStart, el.selectionEnd, "end");
      setInput(el.value);
      return;
    }
    if (!enterEnvia) return; // móvil: Enter = salto de línea.
    e.preventDefault();
    void send(input);
  };

  const sendTranscript = async () => {
    if (sendingTranscript) return;
    setSendingTranscript(true);
    setTranscriptMsg(null);
    try {
      const res = await emailTranscriptAction();
      setTranscriptMsg(res.message ?? (res.ok ? "Transcript enviado." : "No se pudo enviar."));
    } catch {
      setTranscriptMsg("No se pudo enviar el transcript.");
    } finally {
      setSendingTranscript(false);
    }
  };

  const send = async (raw: string) => {
    const q = raw.trim();
    if (!q || sendingRef.current) return;
    sendingRef.current = true;
    setInput("");
    // La cita se captura ACÁ y se limpia ya: si el usuario elige otra mientras este turno está en
    // vuelo, la respuesta que vuelve no debe pisarla.
    const cita = replying;
    setReplying(null);
    // Solo los últimos turnos como CONTEXTO (no toda la conversación): acota el prompt y evita
    // re-responder temas viejos. El servidor además usa su propia memoria reciente.
    const history = messages
      .filter((m) => !m.action && !m.receipt)
      .slice(-12)
      .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) }));
    // Se guarda el id local del mensaje para poder colgarle después su dbId: sin eso el mensaje
    // recién enviado no sería citable hasta recargar el hilo.
    const localId = nextId();
    setMessages((m) => [
      ...m,
      { id: localId, role: "user", text: q, ...(cita ? { quote: cita } : {}) },
    ]);
    setSending(true);
    try {
      // Timeout del cliente (~40s, bajo el maxDuration=60 del server): si tarda, cortamos con un
      // mensaje claro en vez de dejar el spinner girando para siempre.
      const res = await fetchWithTimeout(
        "/api/assistant/chat",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: q, history, replyToMessageId: cita?.id ?? null }),
        },
        CHAT_TIMEOUT_MS,
      );
      const data = await res.json();
      // Los ids que devuelve el servidor se cuelgan del mensaje ya pintado (el del usuario) y del
      // nuevo (el del asesor): a partir de acá los dos se pueden citar. Si el citado ya no existía,
      // la cita del mensaje del usuario pasa a mostrar el aviso en vez del fragmento.
      setMessages((m) => [
        ...m.map((prev) =>
          prev.id === localId && res.ok
            ? {
                ...prev,
                ...(data.messageIds?.user ? { dbId: String(data.messageIds.user) } : {}),
                ...(prev.quote && data.quoteMissing
                  ? { quote: { ...prev.quote, missing: true } }
                  : {}),
              }
            : prev,
        ),
        res.ok
          ? {
              id: nextId(),
              role: "assistant" as const,
              text: String(data.reply ?? ""),
              action: data.action ?? null,
              ...(data.messageIds?.assistant ? { dbId: String(data.messageIds.assistant) } : {}),
            }
          : {
              id: nextId(),
              role: "assistant" as const,
              text: data.error?.message ?? "No pude responder ahora.",
            },
      ]);
    } catch (err) {
      const text = isTimeoutError(err)
        ? "Se está tardando más de lo normal, probá de nuevo."
        : "Hubo un problema de conexión.";
      setMessages((m) => [...m, { id: nextId(), role: "assistant", text }]);
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
        // Los defaults (moneda no declarada, fecha imposible) los decide `draftFromExtract`, no
        // este handler: es la MISMA regla que aplica el panel web. Acá solo se le da el contexto.
        const receipt = draftFromExtract(data.extract as ReceiptExtract, {
          hoy: today(),
          primaryCurrency: currency,
          timezone: tz,
        });
        setMessages((m) => [
          ...m,
          {
            id: nextId(),
            role: "assistant",
            text: "Leí tu recibo. Revisá y corregí lo que haga falta antes de registrarlo:",
            receipt,
          },
        ]);
      } else {
        setMessages((m) => [
          ...m,
          { id: nextId(), role: "assistant", text: "No pude leer el recibo. Probá con otra foto." },
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
  };

  return (
    <>
      {transcript ? (
        <div className={s.toolbar}>
          {transcriptMsg ? <span className={s.toolbarMsg}>{transcriptMsg}</span> : null}
          <button
            className={s.btnSecondary}
            onClick={sendTranscript}
            disabled={sendingTranscript}
            title="Recibí por correo la conversación de hoy"
          >
            {sendingTranscript ? "Enviando…" : "✉︎ Enviarme el transcript"}
          </button>
        </div>
      ) : null}

      <div className={s.scroll}>
        {/* Retención: encabeza el hilo porque explica dónde EMPIEZA (lo anterior ya se borró).
            Es el sitio al que se llega al scrollear hacia arriba buscando "¿hasta dónde llega
            esto?". Sale de CHAT_RETENTION_DAYS: si mañana son 30 días, el texto cambia solo. */}
        <p className={s.retention}>{retentionNoticeText()}</p>
        {messages.map((m) => (
          <div key={m.id}>
            <div className={cn(s.msg, m.role === "user" && s.msgMe)}>
              {m.role === "assistant" ? (
                <span className={s.ava}>
                  <AgentMark />
                </span>
              ) : null}
              {/* La IA responde en Markdown → HTML seguro (escape-first + allowlist, ver
                  lib/markdown). El texto del usuario va como texto plano (React lo escapa).
                  La CITA va SIEMPRE como texto plano, incluso citando al asesor: es un
                  fragmento recortado, no un mensaje — renderizar markdown a medias abriría
                  etiquetas sin cerrar. */}
              {m.role === "assistant" ? (
                <div className={s.bubble}>
                  {m.quote ? <QuoteStrip skin={s} quote={m.quote} /> : null}
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.text) }} />
                </div>
              ) : (
                <div className={s.bubble}>
                  {m.quote ? <QuoteStrip skin={s} quote={m.quote} /> : null}
                  {m.text}
                </div>
              )}
            </div>
            {/* Solo lo persistido se puede citar: el saludo y un turno en vuelo no existen en la
                BD todavía. En web el botón se revela al pasar por encima o al tabular (CSS); en
                móvil queda siempre visible, que es lo que sirve sin puntero. */}
            {m.dbId ? (
              <div className={cn(s.msg, m.role === "user" && s.msgMe)}>
                <button
                  type="button"
                  className={s.replyBtn}
                  onClick={() =>
                    setReplying({
                      id: m.dbId!,
                      excerpt: quoteExcerpt(m.text),
                      role: m.role,
                    })
                  }
                  aria-label={`Responder a este mensaje: ${quoteExcerpt(m.text, 60)}`}
                >
                  Responder
                </button>
              </div>
            ) : null}
            {m.action?.type === "create_transaction" ? (
              <div className={s.cardWrap}>
                <TxnConfirmCard skin={s} draft={txnFromAction(m.action, currency, today())} />
              </div>
            ) : null}
            {m.action?.type === "create_goal" ? (
              <div className={s.cardWrap}>
                <GoalConfirmCard skin={s} draft={goalFromAction(m.action, currency)} />
              </div>
            ) : null}
            {m.action?.type === "create_price_alert" ? (
              <div className={s.cardWrap}>
                <PriceAlertConfirmCard skin={s} draft={alertFromAction(m.action, currency)} />
              </div>
            ) : null}
            {/* Acciones que nacen de un CONSEJO. El payload ya viene RESUELTO por el servidor
                (ids reales, montos del motor), así que la tarjeta solo muestra y confirma. */}
            {m.action?.type === "set_dca" ? (
              <div className={s.cardWrap}>
                <SetDcaConfirmCard skin={s} p={m.action.payload} />
              </div>
            ) : null}
            {m.action?.type === "adjust_budget" ? (
              <div className={s.cardWrap}>
                <AdjustBudgetConfirmCard skin={s} p={m.action.payload} />
              </div>
            ) : null}
            {m.action?.type === "debt_extra_payment" ? (
              <div className={s.cardWrap}>
                <DebtExtraPaymentConfirmCard skin={s} p={m.action.payload} />
              </div>
            ) : null}
            {m.action?.type === "create_transactions_batch" ? (
              <div className={s.cardWrap}>
                <BatchTxnConfirmCard skin={s} p={m.action.payload} />
              </div>
            ) : null}
            {m.receipt ? (
              <div className={s.cardWrap}>
                <ReceiptConfirmCard skin={s} draft={m.receipt} hoy={today()} />
              </div>
            ) : null}
          </div>
        ))}
        {sending ? <Thinking skin={s} /> : null}
        {scanning ? (
          <div className={s.msg}>
            <span className={s.ava}>
              <AgentMark />
            </span>
            <div className={cn(s.bubble, "muted")}>Leyendo tu recibo…</div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {chips.length > 0 ? (
        <div className={s.chips}>
          {chips.map((c) => (
            <button key={c} className={s.chip} onClick={() => send(c)} disabled={sending}>
              {c}
            </button>
          ))}
        </div>
      ) : null}

      {replying ? (
        <div className={s.replyBar}>
          {/* "tu mensaje" y no "vos"/"ti": el mismo texto sirve al voseo de la web y al "tú" del
              móvil, sin partir la copia por superficie (el Skin es solo CSS). */}
          <span className="muted">
            Respondiendo a {replying.role === "assistant" ? "My Agent C+" : "tu mensaje"}:{" "}
            <em>{replying.excerpt}</em>
          </span>
          <button
            type="button"
            className={s.replyBarX}
            onClick={() => setReplying(null)}
            aria-label="Cancelar la respuesta a ese mensaje"
          >
            <Icon name="x" />
          </button>
        </div>
      ) : null}

      <div className={s.bar}>
        {scanner ? (
          <>
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
              className={s.cam}
              onClick={() => fileRef.current?.click()}
              disabled={scanning}
              aria-label="Escanear recibo"
              title="Escanear recibo"
            >
              <Icon name="camera" />
            </button>
          </>
        ) : null}
        <textarea
          ref={taRef}
          className={s.input}
          value={input}
          maxLength={2000}
          rows={1}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Pregunta sobre tu dinero…"
          aria-label="Mensaje para My Agent C+"
          // En la web el Enter envía, así que la tecla del teclado virtual dice "enviar"; en
          // móvil hace salto de línea y decir "enviar" sería mentirle al usuario.
          enterKeyHint={enterEnvia ? "send" : "enter"}
          inputMode="text"
        />
        <button
          type="button"
          className={s.send}
          onClick={() => void send(input)}
          disabled={sending || !input.trim()}
          aria-label="Enviar"
        >
          <Icon name="send" />
        </button>
      </div>

      {/* Encuadre educativo: fijo al pie y siempre visible, en vez de repetido en cada respuesta.
          Va DESPUÉS de la barra de entrada porque es del producto, no de la conversación. */}
      <p className={s.disclaimer}>{DISCLAIMER}</p>
    </>
  );
}

/**
 * Fragmento citado arriba de un mensaje. Si el citado ya no existe (lo borró la retención) se
 * muestra el aviso en vez de un hueco: el usuario ve POR QUÉ no está, no una cita vacía.
 */
function QuoteStrip({ skin, quote }: { skin: Skin; quote: Quote }) {
  return (
    <div className={cn(skin.quote, quote.missing && "is-missing")}>
      {quote.missing ? (
        <em>{QUOTE_MISSING_TEXT}</em>
      ) : (
        <>
          <span className="ac-quote-who">
            {quote.role === "assistant" ? "My Agent C+" : "Tu mensaje"}
          </span>
          {quote.excerpt}
        </>
      )}
    </div>
  );
}

/** Indicador de «está pensando»: texto en web, puntos animados en móvil. */
function Thinking({ skin }: { skin: Skin }) {
  if (skin.typing === "text") {
    return (
      <div className="muted ac-thinking" aria-label="Pensando">
        Pensando…
      </div>
    );
  }
  return (
    <div className={skin.msg}>
      <span className={skin.ava}>
        <AgentMark />
      </span>
      <div className={cn(skin.bubble, "m-typing")} aria-label="Escribiendo">
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Tarjetas de confirmación (compartidas: chat, recibo y wizard del panel)
// ----------------------------------------------------------------------------

/**
 * Tarjeta de confirmación de transacción. Crea SOLO al confirmar.
 * `onRegisterAnother` lo pasa únicamente el formulario manual del panel: al éxito muestra
 * "Registrar otro"/"Listo" y no se auto-cierra.
 */
export function TxnConfirmCard({
  draft,
  title = "Acción propuesta",
  skin = WEB_SKIN,
  onCancel,
  onConfirmed,
  onRegisterAnother,
}: {
  draft: DraftTxn;
  title?: string;
  skin?: Skin;
  onCancel?: () => void;
  onConfirmed?: () => void;
  onRegisterAnother?: () => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "ok" | "cancel">("idle");
  const [sobre, setSobre] = useState<SobreRemaining | null>(null);
  // Sobre elegido (arranca en el sugerido por la IA / el elegido en el form manual); "" = Sin sobre.
  const [categoryId, setCategoryId] = useState<string>(draft.categoryId ?? "");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Limpia el timeout pendiente si la tarjeta se desmonta antes de los 1200ms.
  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const confirm = async () => {
    setPending(true);
    setError(null);
    const res = await confirmTransactionAction({ ...draft, categoryId: categoryId || null });
    setPending(false);
    if (res.ok) {
      setSobre(res.sobre ?? null);
      setPhase("ok");
      // Manual: nunca auto-cierra (el usuario elige "otro"/"listo"). IA/recibo: auto-cierra salvo
      // que haya restante para leer.
      if (onConfirmed && !onRegisterAnother && !res.sobre)
        timerRef.current = setTimeout(onConfirmed, 1200);
    } else {
      setError(res.message ?? "No se pudo guardar.");
    }
  };

  const cancel = () => {
    setPhase("cancel");
    onCancel?.();
  };

  if (phase === "cancel") return null;
  if (phase === "ok") {
    return (
      <div className={skin.done}>
        {sobreSuccessMessage(sobre)}
        {onRegisterAnother ? (
          <div className={skin.actions}>
            <button className={skin.btnPrimary} onClick={onRegisterAnother}>
              Registrar otro gasto
            </button>
            <button className={skin.btnSecondary} onClick={onConfirmed}>
              Listo
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={skin.card}>
      <div className={skin.eyebrow}>{title}</div>
      <div className={skin.amount}>
        {draft.kind === "ingreso" ? "+" : "−"}
        {formatMoney(draft.amount, draft.currency)}
      </div>
      <div className={skin.sub}>
        {draft.description} · {draft.occurredOn}
      </div>
      <div className="ac-field">
        <span className={skin.fieldLabel}>Sobre</span>
        <SobreCombobox
          kind={draft.kind}
          value={categoryId}
          onChange={setCategoryId}
          disabled={pending}
          suggestedPath={draft.categoryPath}
          {...(skin.sobreInput ? { inputClassName: skin.sobreInput } : {})}
        />
      </div>
      {draft.linkedKind && draft.linkedId ? (
        <div className={skin.tagWrap}>
          <span className={skin.tag}>
            Vinculada a {LINK_LABEL[draft.linkedKind] ?? "entidad"}
            {draft.linkedName ? `: ${draft.linkedName}` : ""}
          </span>
        </div>
      ) : null}
      {error ? <div className={skin.error}>{error}</div> : null}
      <div className={skin.actions}>
        <button className={skin.btnSecondary} onClick={cancel} disabled={pending}>
          Cancelar
        </button>
        <button className={skin.btnPrimary} onClick={confirm} disabled={pending}>
          {pending ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

/** Restante del sobre para el resumen del recibo (sin repetir el "✓ Registrado" de la línea 1). */
function detalleSobre(s: SobreRemaining | null): string | null {
  if (!s) return null;
  if (!s.hasBudget) return `Sobre: ${s.path} (sin presupuesto asignado).`;
  if (s.remaining < 0)
    return `Sobre: ${s.path}. Te pasaste por ${formatMoney(-s.remaining, s.currency)}.`;
  return `Sobre: ${s.path}. Te quedan ${formatMoney(s.remaining, s.currency)} de ${formatMoney(s.budget, s.currency)} este mes.`;
}

/**
 * RECIBO ESCANEADO — la tarjeta de confirmación del escáner, ENTERA editable.
 *
 * Es la última defensa antes de escribir, y hasta ahora solo dejaba tocar el sobre: monto, moneda,
 * comercio y fecha se registraban tal como los hubiera leído el OCR. Un tiquete de ₡4.100 sin
 * moneda impresa entraba como $4.100 (la principal del usuario) con fecha de dos años atrás, sin
 * un solo aviso — y el "✓ registrado" tampoco decía dónde había quedado.
 *
 * Ahora los cuatro campos se editan, precargados con lo del OCR, y se registra EXACTAMENTE lo que
 * queda en la tarjeta (`aPayloadRecibo`). Las reglas —qué moneda proponer, qué fecha es
 * sospechosa, qué avisar— son puras y viven en `lib/ai/receipt-draft`.
 *
 * La comparte el chat de las tres superficies (panel web, /asistente y móvil): solo cambia la piel.
 */
export function ReceiptConfirmCard({
  draft,
  hoy,
  title = "Recibo escaneado",
  skin = WEB_SKIN,
  onCancel,
  onConfirmed,
}: {
  draft: ReceiptDraft;
  /** Hoy en la zona del PERFIL (la misma que usa el servidor), no la del navegador. */
  hoy: string;
  title?: string;
  skin?: Skin;
  onCancel?: () => void;
  onConfirmed?: () => void;
}) {
  // Los id de los campos se generan por instancia: en el hilo del chat pueden convivir dos
  // recibos escaneados, y con id fijos los <label> del segundo apuntarían a los campos del
  // primero (tocar "Monto" enfocaría el recibo de arriba).
  const uid = useId();
  const [d, setD] = useState<ReceiptDraft>(draft);
  // La moneda que no venía en el recibo se PROPONE, no se adopta: hasta que el usuario la
  // confirme (o elija otra) no se registra nada.
  const [monedaOk, setMonedaOk] = useState(!necesitaConfirmarMoneda(draft));
  const [intento, setIntento] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "ok" | "cancel">("idle");
  const [hecho, setHecho] = useState<{
    titulo: string;
    periodo: string | null;
    sobre: string | null;
  } | null>(null);

  const editar = (cambio: Partial<ReceiptDraft>) => setD((prev) => ({ ...prev, ...cambio }));

  const err = validarRecibo(d, hoy);
  const ver = intento; // los errores aparecen recién al intentar confirmar
  // La vista previa se calcula con lo EDITADO: el símbolo del importe cambia con el select de
  // moneda, que es justo lo que faltaba para notar un "$4.100" que debía ser "₡4.100".
  const montoPrevio = parsearMonto(d.amountText) ?? 0;
  const aviso = avisoFecha(d.occurredOn, hoy, { flag: d.dateFlag, leida: d.dateRead });

  const confirmar = async () => {
    setIntento(true);
    if (Object.keys(err).length > 0 || !monedaOk) return;
    setPending(true);
    setError(null);
    const payload = aPayloadRecibo(d);
    const res = await confirmTransactionAction(payload);
    setPending(false);
    if (!res.ok) {
      setError(res.message ?? "No se pudo guardar.");
      return;
    }
    // Se muestra lo que QUEDÓ registrado (monto + moneda + fecha + sobre) y, si cayó fuera del
    // mes en curso, se dice explícitamente: si no, el usuario lo busca en sus movimientos y no
    // está. Nunca auto-cierra — este resumen es el que permite notar que el OCR se equivocó.
    const { titulo, periodo } = resumenRegistro(
      {
        amount: payload.amount,
        currency: payload.currency,
        occurredOn: payload.occurredOn,
        description: payload.description,
      },
      hoy,
    );
    setHecho({ titulo, periodo, sobre: detalleSobre(res.sobre ?? null) });
    setPhase("ok");
  };

  if (phase === "cancel") return null;
  if (phase === "ok" && hecho) {
    return (
      <div className={skin.done}>
        {hecho.titulo}
        {hecho.sobre ? <div className={skin.sub}>{hecho.sobre}</div> : null}
        {hecho.periodo ? <div className="ac-rc-warn">{hecho.periodo}</div> : null}
        {onConfirmed ? (
          <div className={skin.actions}>
            <button className={skin.btnSecondary} onClick={onConfirmed}>
              Listo
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={skin.card}>
      <div className={skin.eyebrow}>{title}</div>
      {/* El signo lo pone formatMoney (cero neutro: "₡0", no "−₡0"). */}
      <div className={skin.amount}>{formatMoney(-montoPrevio, d.currency)}</div>

      <label className={skin.fieldLabel} htmlFor={`rc-com-${uid}`}>
        Comercio
      </label>
      <input
        id={`rc-com-${uid}`}
        className={`${skin.fieldInput ?? "inp"} ac-rc-field${ver && err.comercio ? " is-bad" : ""}`}
        value={d.description}
        onChange={(e) => editar({ description: e.target.value })}
        disabled={pending}
        placeholder="Nombre del comercio"
        autoComplete="off"
      />
      {ver && err.comercio ? <div className={skin.error}>{err.comercio}</div> : null}

      <div className="ac-rc-grid">
        <div className="ac-rc-cell">
          <label className={skin.fieldLabel} htmlFor={`rc-fec-${uid}`}>
            Fecha
          </label>
          <input
            id={`rc-fec-${uid}`}
            type="date"
            max={hoy}
            className={`${skin.fieldInput ?? "inp"} ac-rc-field${ver && err.fecha ? " is-bad" : ""}`}
            value={d.occurredOn}
            onChange={(e) => editar({ occurredOn: e.target.value })}
            disabled={pending}
          />
        </div>
        <div className="ac-rc-cell">
          <label className={skin.fieldLabel} htmlFor={`rc-mon-${uid}`}>
            Monto
          </label>
          <input
            id={`rc-mon-${uid}`}
            className={`${skin.fieldInput ?? "inp"} ac-rc-field${ver && err.monto ? " is-bad" : ""}`}
            value={d.amountText}
            onChange={(e) => editar({ amountText: e.target.value })}
            disabled={pending}
            inputMode="decimal"
            placeholder="0"
          />
        </div>
        <div className="ac-rc-cell ac-rc-cell-cur">
          <label className={skin.fieldLabel} htmlFor={`rc-cur-${uid}`}>
            Moneda
          </label>
          <select
            id={`rc-cur-${uid}`}
            className={`${skin.fieldSelect ?? "sel"} ac-rc-field${ver && !monedaOk ? " is-bad" : ""}`}
            value={d.currency}
            // Elegir en el select ES confirmar: el usuario ya miró el campo.
            onChange={(e) => {
              editar({ currency: e.target.value });
              setMonedaOk(true);
            }}
            disabled={pending}
          >
            {CURRENCY_OPTIONS.map((o) => (
              <option key={o.code} value={o.code}>
                {o.code}
              </option>
            ))}
          </select>
        </div>
      </div>
      {/* La fecha y la moneda avisan JUNTO a su campo y antes de confirmar, no después. */}
      {ver && err.fecha ? <div className={skin.error}>{err.fecha}</div> : null}
      {aviso ? (
        <div className={aviso.tono === "error" ? skin.error : "ac-rc-warn"}>{aviso.texto}</div>
      ) : null}
      {ver && err.monto ? <div className={skin.error}>{err.monto}</div> : null}
      {!monedaOk ? (
        <div className="ac-rc-warn">
          No detecté la moneda en el recibo.{" "}
          {d.currencyOrigin === "pais"
            ? "Propongo la de tu país; confirmala o elegí otra."
            : "Propongo tu moneda principal; confirmala o elegí otra."}
          <button
            type="button"
            className="ac-rc-chip"
            onClick={() => setMonedaOk(true)}
            disabled={pending}
          >
            {etiquetaConfirmarMoneda(d.currency)}
          </button>
        </div>
      ) : null}
      {ver && !monedaOk ? <div className={skin.error}>Confirmá la moneda del recibo.</div> : null}

      <label className={skin.fieldLabel}>Sobre</label>
      <SobreCombobox
        kind="gasto"
        value={d.categoryId ?? ""}
        onChange={(v) => editar({ categoryId: v || null })}
        disabled={pending}
        {...(skin.sobreInput ? { inputClassName: skin.sobreInput } : {})}
      />

      {error ? <div className={skin.error}>{error}</div> : null}
      <div className={skin.actions}>
        <button
          className={skin.btnSecondary}
          onClick={() => {
            setPhase("cancel");
            onCancel?.();
          }}
          disabled={pending}
        >
          Cancelar
        </button>
        <button className={skin.btnPrimary} onClick={confirmar} disabled={pending}>
          {pending ? "Guardando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

/** Confirmación de meta propuesta por la IA (create_goal). */
function GoalConfirmCard({ draft, skin }: { draft: DraftGoal; skin: Skin }) {
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
  if (phase === "ok") return <div className={skin.done}>✓ Meta creada.</div>;

  return (
    <div className={skin.card}>
      <div className={skin.eyebrow}>Crear meta</div>
      <div className={skin.amountName}>{draft.name}</div>
      <div className={skin.sub}>
        Objetivo: {formatMoney(draft.targetAmount, draft.currency)}
        {draft.monthlyContribution > 0
          ? ` · ${formatMoney(draft.monthlyContribution, draft.currency)}/mes`
          : ""}
        {draft.targetDate ? ` · para ${draft.targetDate}` : ""}
      </div>
      {error ? <div className={skin.error}>{error}</div> : null}
      <div className={skin.actions}>
        <button className={skin.btnSecondary} onClick={() => setPhase("cancel")} disabled={pending}>
          Cancelar
        </button>
        <button className={skin.btnPrimary} onClick={confirm} disabled={pending}>
          {pending ? "Creando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// Acciones que nacen de un CONSEJO (set_dca, adjust_budget, debt_extra_payment)
//
// Las tres tienen el MISMO ciclo —mostrar, confirmar, ejecutar, avisar— y solo cambian el texto
// y a qué server action llaman, así que comparten cascarón. El payload llega ya resuelto por el
// servidor: acá no se calcula ni se corrige nada, solo se muestra lo que se va a ejecutar.
// ----------------------------------------------------------------------------

/** Lee un número del payload (viene como unknown desde la propuesta). */
const pNum = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
/** Lee un texto del payload. */
const pStr = (v: unknown, fallback = ""): string =>
  typeof v === "string" && v.trim() ? v : fallback;

function AdviceConfirmCard({
  skin,
  eyebrow,
  amount,
  detail,
  okText,
  onConfirm,
}: {
  skin: Skin;
  eyebrow: string;
  amount: string;
  detail: string;
  okText: string;
  onConfirm: () => Promise<ConfirmResult>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "ok" | "cancel">("idle");

  const confirm = async () => {
    setPending(true);
    setError(null);
    const res = await onConfirm();
    setPending(false);
    if (res.ok) setPhase("ok");
    else setError(res.message ?? "No se pudo aplicar.");
  };

  if (phase === "cancel") return null;
  if (phase === "ok") return <div className={skin.done}>{okText}</div>;

  return (
    <div className={skin.card}>
      <div className={skin.eyebrow}>{eyebrow}</div>
      <div className={skin.amount}>{amount}</div>
      <div className={skin.sub}>{detail}</div>
      {error ? <div className={skin.error}>{error}</div> : null}
      <div className={skin.actions}>
        <button className={skin.btnSecondary} onClick={() => setPhase("cancel")} disabled={pending}>
          Cancelar
        </button>
        <button className={skin.btnPrimary} onClick={confirm} disabled={pending}>
          {pending ? "Aplicando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}

/** Fijar/ajustar el aporte mensual (DCA) de una inversión. */
function SetDcaConfirmCard({ skin, p }: { skin: Skin; p: Record<string, unknown> }) {
  const monto = pNum(p.monthlyContribution);
  const actual = pNum(p.currentContribution);
  const currency = pStr(p.currency, "CRC");
  const label = pStr(p.label, "tu inversión");
  return (
    <AdviceConfirmCard
      skin={skin}
      eyebrow="Aporte mensual"
      amount={`${formatMoney(monto, currency)}/mes`}
      // Se muestra DE CUÁNTO A CUÁNTO: confirmar un cambio sin ver el punto de partida es a ciegas.
      detail={
        actual > 0
          ? `${label} · hoy aportás ${formatMoney(actual, currency)}/mes`
          : `${label} · hoy no tiene aporte automático`
      }
      okText="✓ Aporte mensual actualizado."
      onConfirm={() =>
        confirmSetDcaAction({
          holdingId: pStr(p.holdingId),
          monthlyContribution: monto,
        })
      }
    />
  );
}

/** Subir/bajar el presupuesto de un sobre del mes en curso. */
function AdjustBudgetConfirmCard({ skin, p }: { skin: Skin; p: Record<string, unknown> }) {
  const monto = pNum(p.amount);
  const actual = pNum(p.currentAmount);
  const currency = pStr(p.currency, "CRC");
  const path = pStr(p.path, pStr(p.name, "el sobre"));
  const sube = monto > actual;
  return (
    <AdviceConfirmCard
      skin={skin}
      eyebrow={`${sube ? "Subir" : "Bajar"} presupuesto`}
      amount={formatMoney(monto, currency)}
      detail={
        actual > 0
          ? `${path} · hoy está en ${formatMoney(actual, currency)}`
          : `${path} · hoy no tiene presupuesto`
      }
      okText="✓ Presupuesto actualizado."
      onConfirm={() =>
        confirmAdjustBudgetAction({
          categoryId: pStr(p.categoryId),
          name: pStr(p.name),
          amount: monto,
          currency,
          periodMonth: pNum(p.periodMonth),
          periodYear: pNum(p.periodYear),
        })
      }
    />
  );
}

/** Abono EXTRA a capital de una deuda. */
function DebtExtraPaymentConfirmCard({ skin, p }: { skin: Skin; p: Record<string, unknown> }) {
  const monto = pNum(p.amount);
  const saldo = pNum(p.balance);
  const apr = typeof p.apr === "number" ? p.apr : null;
  const currency = pStr(p.currency, "CRC");
  const name = pStr(p.name, "tu deuda");
  return (
    <AdviceConfirmCard
      skin={skin}
      eyebrow="Abono extra a capital"
      amount={formatMoney(monto, currency)}
      detail={`${name} · saldo ${formatMoney(saldo, currency)}${apr != null ? ` · ${apr}% anual` : ""}`}
      okText="✓ Abono registrado."
      onConfirm={() =>
        confirmDebtExtraPaymentAction({
          debtId: pStr(p.debtId),
          amount: monto,
          paymentDate: pStr(p.paymentDate),
          currency,
        })
      }
    />
  );
}

/**
 * Alta EN LOTE de las transacciones que faltaban del estado de cuenta.
 *
 * Cada fila es EDITABLE ENTERA antes de confirmar —fecha, comercio, monto, moneda y sobre—, no
 * solo el sobre. Las filas salen de un estado de cuenta pegado que leyó un parser determinista o
 * el LLM, y los dos se equivocan de formas conocidas: el comercio arrastra ruido del banco
 * ("OCN00PHEREDIA" pegado al nombre), el monto puede confundirse con el saldo cuando la fila trae
 * los dos, y la moneda se asume la del estado. Corregir DESPUÉS significa editar N transacciones
 * ya registradas de a una.
 *
 * También se puede sacar una fila del lote (✕) sin perder el resto — un estado suele traer algo
 * que el usuario no quiere anotar.
 *
 * Se registra EXACTAMENTE lo que quedó en la tarjeta: `aPayload` toma los valores editados y el
 * LLM no vuelve a intervenir. Las reglas de validación viven en `lib/ai/batch-rows` (puras) y
 * espejan `batchTransactionsInputSchema`, que es lo que el servidor va a exigir igual.
 */
function BatchTxnConfirmCard({ skin, p }: { skin: Skin; p: Record<string, unknown> }) {
  const [rows, setRows] = useState<BatchRowDraft[]>(() => normalizarFilas(p.rows));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [intento, setIntento] = useState(false);
  const [hecho, setHecho] = useState<BatchResult | null>(null);

  const editar = (uid: string, cambio: Partial<BatchRowDraft>) =>
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...cambio } : r)));
  const quitar = (uid: string) => setRows((rs) => rs.filter((r) => r.uid !== uid));

  const { conError } = resumenValidacion(rows);

  const confirmar = async () => {
    // Primero se marcan los errores; recién cuando no queda ninguno se registra. Sin esto, la
    // tarjeta mostraría los campos en rojo desde que abre, antes de que el usuario toque nada.
    setIntento(true);
    if (conError > 0 || rows.length === 0) return;
    setPending(true);
    setError(null);
    const res = await confirmBatchTransactionsAction({ rows: aPayload(rows) });
    setPending(false);
    if (res.creadas > 0 || res.fallidas.length > 0) setHecho(res);
    else setError(res.message ?? "No se pudo registrar el lote.");
  };

  if (rows.length === 0 && !hecho) return null;

  if (hecho) {
    return (
      <div className={skin.done}>
        ✓ {hecho.creadas}{" "}
        {hecho.creadas === 1 ? "movimiento registrado" : "movimientos registrados"}.
        {hecho.fallidas.length > 0 ? (
          <div className={skin.sub}>
            No pude con {hecho.fallidas.length}:{" "}
            {hecho.fallidas.map((f) => f.description).join(", ")}.
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={skin.card}>
      <div className={skin.eyebrow}>
        Registrar {rows.length} {rows.length === 1 ? "movimiento" : "movimientos"}
      </div>
      <div className={skin.sub}>Revisá y corregí lo que haga falta antes de registrar.</div>
      <div className="ac-batch">
        {rows.map((r) => {
          const err = validarFila(r);
          const ver = intento; // los errores aparecen recién al intentar registrar
          return (
            <div className="ac-batch-row" key={r.uid}>
              <div className="ac-batch-head">
                <span className={`ac-batch-kind ${r.kind === "ingreso" ? "is-in" : "is-out"}`}>
                  {r.kind === "ingreso" ? "Ingreso" : "Gasto"}
                </span>
                <button
                  type="button"
                  className="ac-batch-x"
                  onClick={() => quitar(r.uid)}
                  disabled={pending}
                  aria-label={`Quitar ${r.description || "la fila"} del lote`}
                >
                  <Icon name="x" />
                </button>
              </div>

              <label className={skin.fieldLabel} htmlFor={`bd-${r.uid}`}>
                Comercio
              </label>
              <input
                id={`bd-${r.uid}`}
                className={`${skin.fieldInput ?? "inp"} ac-batch-field${ver && err.comercio ? " is-bad" : ""}`}
                value={r.description}
                onChange={(e) => editar(r.uid, { description: e.target.value })}
                disabled={pending}
                placeholder="Nombre del comercio"
                autoComplete="off"
              />
              {ver && err.comercio ? <div className={skin.error}>{err.comercio}</div> : null}

              <div className="ac-batch-grid">
                <div className="ac-batch-cell">
                  <label className={skin.fieldLabel} htmlFor={`bf-${r.uid}`}>
                    Fecha
                  </label>
                  <input
                    id={`bf-${r.uid}`}
                    type="date"
                    className={`${skin.fieldInput ?? "inp"} ac-batch-field${ver && err.fecha ? " is-bad" : ""}`}
                    value={r.occurredOn}
                    onChange={(e) => editar(r.uid, { occurredOn: e.target.value })}
                    disabled={pending}
                  />
                  {ver && err.fecha ? <div className={skin.error}>{err.fecha}</div> : null}
                </div>
                <div className="ac-batch-cell">
                  <label className={skin.fieldLabel} htmlFor={`bm-${r.uid}`}>
                    Monto
                  </label>
                  <input
                    id={`bm-${r.uid}`}
                    className={`${skin.fieldInput ?? "inp"} ac-batch-field${ver && err.monto ? " is-bad" : ""}`}
                    value={r.amountText}
                    onChange={(e) => editar(r.uid, { amountText: e.target.value })}
                    disabled={pending}
                    inputMode="decimal"
                    placeholder="0"
                  />
                  {ver && err.monto ? <div className={skin.error}>{err.monto}</div> : null}
                </div>
                <div className="ac-batch-cell ac-batch-cell-cur">
                  <label className={skin.fieldLabel} htmlFor={`bc-${r.uid}`}>
                    Moneda
                  </label>
                  <select
                    id={`bc-${r.uid}`}
                    className={`${skin.fieldSelect ?? "sel"} ac-batch-field`}
                    value={r.currency}
                    onChange={(e) => editar(r.uid, { currency: e.target.value })}
                    disabled={pending}
                  >
                    {CURRENCY_OPTIONS.map((o) => (
                      <option key={o.code} value={o.code}>
                        {o.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className={skin.fieldLabel}>Sobre</label>
              <SobreCombobox
                kind={r.kind}
                value={r.categoryId ?? ""}
                onChange={(v) => editar(r.uid, { categoryId: v || null })}
                disabled={pending}
                suggestedPath={r.categoryPath}
                {...(skin.sobreInput ? { inputClassName: skin.sobreInput } : {})}
              />
              {ver && err.sobre ? <div className={skin.error}>{err.sobre}</div> : null}
            </div>
          );
        })}
      </div>
      {intento && conError > 0 ? (
        <div className={skin.error}>
          {conError === 1
            ? "Hay 1 fila con algo que corregir."
            : `Hay ${conError} filas con algo que corregir.`}
        </div>
      ) : null}
      {error ? <div className={skin.error}>{error}</div> : null}
      <div className={skin.actions}>
        <button className={skin.btnSecondary} onClick={() => setRows([])} disabled={pending}>
          Cancelar
        </button>
        <button className={skin.btnPrimary} onClick={confirmar} disabled={pending}>
          {pending ? "Registrando…" : `Registrar ${rows.length}`}
        </button>
      </div>
    </div>
  );
}

/** Confirmación de alerta de precio propuesta por la IA (create_price_alert). */
function PriceAlertConfirmCard({ draft, skin }: { draft: DraftAlert; skin: Skin }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "ok" | "cancel">("idle");

  const confirm = async () => {
    setPending(true);
    setError(null);
    const res = await confirmPriceAlertAction({
      symbol: draft.symbol,
      targetPrice: draft.targetPrice,
      assetType: draft.assetType,
      currency: draft.currency,
    });
    setPending(false);
    if (res.ok) setPhase("ok");
    else setError(res.message ?? "No se pudo crear la alerta.");
  };

  if (phase === "cancel") return null;
  if (phase === "ok") return <div className={skin.done}>✓ Alerta creada.</div>;

  return (
    <div className={skin.card}>
      <div className={skin.eyebrow}>Crear alerta de precio</div>
      <div className={skin.amountName}>{draft.symbol}</div>
      <div className={skin.sub}>
        Te avisamos cuando llegue a {formatMoney(draft.targetPrice, draft.currency)} (la dirección
        se calcula con el precio actual).
      </div>
      {error ? <div className={skin.error}>{error}</div> : null}
      <div className={skin.actions}>
        <button className={skin.btnSecondary} onClick={() => setPhase("cancel")} disabled={pending}>
          Cancelar
        </button>
        <button className={skin.btnPrimary} onClick={confirm} disabled={pending}>
          {pending ? "Creando…" : "Confirmar"}
        </button>
      </div>
    </div>
  );
}
