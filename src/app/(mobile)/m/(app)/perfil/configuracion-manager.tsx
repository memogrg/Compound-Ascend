"use client";

/**
 * Ajustes gestionables de /m/perfil ("Configuración"), mismo molde que la web /configuracion:
 * reutiliza EXACTAMENTE las Server Actions del módulo account (+ inviteHouseholdMembersAction
 * de personal-profile) sin duplicar lógica. Todo con el Form Kit móvil (BottomSheet / Toggle /
 * ConfirmDialog / TextField) + es-MX, tema claro.
 *  - Moneda principal → updateCurrencyAction
 *  - WhatsApp → linkWhatsAppAction (muestra OTP + instrucciones) / revokeWhatsAppAction
 *  - Notificaciones → updateNotificationPrefAction (optimista, revierte si falla)
 *  - Hogar (invitar, gating: solo editor) → inviteHouseholdMembersAction
 *  - Correos del banco → requestIngestEmailAction / confirmIngestEmailAction / removeIngestEmailAction
 *  - Borrar todos los datos → clearAllDataAction (confirmación de 2 pasos)
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { currencySymbol } from "@/lib/format";
import { CURRENCIES } from "@/modules/personal-profile/constants";
import {
  updateCurrencyAction,
  linkWhatsAppAction,
  revokeWhatsAppAction,
  updateNotificationPrefAction,
  requestIngestEmailAction,
  confirmIngestEmailAction,
  removeIngestEmailAction,
  clearAllDataAction,
} from "@/modules/account/api/actions";
import { inviteHouseholdMembersAction } from "@/modules/personal-profile/api/actions";
import { INGEST_TARGET } from "@/modules/account/constants";
import type { NotificationChannel, NotificationPrefs } from "@/lib/notifications/preferences";
import type { IngestEmailRow } from "@/modules/account/services/ingest-email-service";

import { BottomSheet, ConfirmDialog, useToast } from "../../components/form-kit";

type WaLink = { status: "pending" | "active" | "revoked"; phone: string | null } | null;
type SheetId = "currency" | "whatsapp" | "household" | null;

const NOTIF_ROWS: { key: NotificationChannel; label: string; hint: string; disabled?: boolean; badge?: string }[] = [
  { key: "inApp", label: "En la app", hint: 'Avisos del día en "Qué noté".' },
  { key: "email", label: "Correo", hint: "Resumen semanal por correo." },
  { key: "whatsapp", label: "WhatsApp", hint: "Resumen semanal (si vinculaste tu WhatsApp)." },
  { key: "push", label: "Notificaciones push", hint: "Avisos en tu dispositivo.", disabled: true, badge: "Próximamente" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INVITES = 4;

export function ConfiguracionManager({
  currency,
  notifications,
  wa,
  whatsappConfigured,
  ingestEmails,
  isEditor,
}: {
  currency: string;
  notifications: NotificationPrefs;
  wa: WaLink;
  whatsappConfigured: boolean;
  ingestEmails: IngestEmailRow[];
  isEditor: boolean;
}) {
  const [sheet, setSheet] = useState<SheetId>(null);
  const [danger, setDanger] = useState<0 | 1 | 2>(0);
  const waLinked = wa?.status === "active";

  return (
    <>
      {/* Ajustes */}
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <SettingRow
          title="Moneda principal"
          sub={`${currency} · ${currencySymbol(currency)}`}
          onClick={() => setSheet("currency")}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} style={{ width: 18, height: 18 }}>
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" strokeLinecap="round" />
            </svg>
          }
        />
        <SettingRow
          title="WhatsApp"
          sub={waLinked ? `Vinculado · ${wa?.phone ?? ""}` : "No vinculado"}
          subPos={waLinked}
          onClick={() => setSheet("whatsapp")}
          accent
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <path d="M21 11.5a8.4 8.4 0 0 1-11.9 7.6L3 21l1.9-6A8.5 8.5 0 1 1 21 11.5Z" />
            </svg>
          }
        />
        <SettingRow
          title="Hogar"
          sub={isEditor ? "Invita miembros a tu hogar" : "Miembros e invitaciones"}
          onClick={() => setSheet("household")}
          icon={
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
              <path d="M4 11l8-6 8 6" />
              <path d="M6 10v9h12v-9" />
              <path d="M10 19v-5h4v5" />
            </svg>
          }
        />
      </div>

      {/* Notificaciones */}
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <div className="ov" style={{ marginBottom: 6 }}>
          Notificaciones
        </div>
        {NOTIF_ROWS.map((r) => (
          <NotifToggle key={r.key} row={r} initial={notifications[r.key]} />
        ))}
      </div>

      {/* Correos del banco (ingesta) */}
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <div className="ov" style={{ marginBottom: 6 }}>
          Correos del banco
        </div>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 10px" }}>
          Reenvía los avisos de tu banco a <strong className="mono">{INGEST_TARGET}</strong> y registra
          aquí el correo desde el que reenvías.
        </p>
        <IngestSection emails={ingestEmails} />
      </div>

      {/* Zona de peligro */}
      <div className="card card-p" style={{ marginBottom: 14 }}>
        <div className="ov" style={{ marginBottom: 6 }}>
          Zona de peligro
        </div>
        <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 10px" }}>
          Borra todos tus datos financieros (ingresos, gastos, deudas, inversiones, patrimonio…). Tu
          cuenta y perfil se conservan. No se puede deshacer.
        </p>
        <button type="button" className="m-btn m-btn-block m-btn-danger" onClick={() => setDanger(1)}>
          Borrar todos mis datos
        </button>
      </div>

      {/* Hoja: moneda */}
      <BottomSheet open={sheet === "currency"} onClose={() => setSheet(null)} title="Moneda principal">
        <CurrencySheet current={currency} onDone={() => setSheet(null)} />
      </BottomSheet>

      {/* Hoja: WhatsApp */}
      <BottomSheet open={sheet === "whatsapp"} onClose={() => setSheet(null)} title="Asistente de WhatsApp">
        <WhatsAppSheet wa={wa} configured={whatsappConfigured} onDone={() => setSheet(null)} />
      </BottomSheet>

      {/* Hoja: hogar */}
      <BottomSheet open={sheet === "household"} onClose={() => setSheet(null)} title="Invitar a tu hogar">
        <HouseholdSheet isEditor={isEditor} />
      </BottomSheet>

      {/* Borrar datos: paso 1 */}
      <ConfirmDialog
        open={danger === 1}
        title="¿Borrar todos tus datos?"
        message="Se eliminarán tus ingresos, gastos, deudas, inversiones, pólizas y patrimonio. Tu cuenta se conserva."
        confirmLabel="Sí, continuar"
        variant="danger"
        onConfirm={() => setDanger(2)}
        onCancel={() => setDanger(0)}
      />
      {/* Borrar datos: paso 2 (confirmación final) */}
      <ClearDataStep2 open={danger === 2} onClose={() => setDanger(0)} />
    </>
  );
}

/** Fila de ajuste tappable (mismo look que .srow del server, pero como botón). */
function SettingRow({
  title,
  sub,
  subPos,
  icon,
  accent,
  onClick,
}: {
  title: string;
  sub: string;
  subPos?: boolean;
  icon: React.ReactNode;
  accent?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="srow"
      onClick={onClick}
      style={{ width: "100%", background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
    >
      <span
        className="lic"
        style={accent ? { background: "var(--accent-soft)", color: "var(--accent)" } : { background: "var(--surface-2)" }}
        aria-hidden
      >
        {icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="st">{title}</div>
        <div className={`ss ${subPos ? "pos" : ""}`}>{sub}</div>
      </div>
      <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth={2} style={{ width: 18, height: 18 }} aria-hidden>
        <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

/** Toggle de un canal de notificación (optimista; revierte si la action falla). */
function NotifToggle({
  row,
  initial,
}: {
  row: { key: NotificationChannel; label: string; hint: string; disabled?: boolean; badge?: string };
  initial: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  const toggle = async (next: boolean) => {
    setOn(next);
    setBusy(true);
    const res = await updateNotificationPrefAction(row.key, next);
    setBusy(false);
    if (res.ok) {
      toast.show(next ? "Canal activado" : "Canal desactivado", "success");
      router.refresh();
    } else {
      setOn(!next); // revertir
      toast.show(res.message ?? "No se pudo guardar", "error");
    }
  };

  return (
    <div className="srow">
      <div style={{ flex: 1 }}>
        <div className="st">
          {row.label}
          {row.badge ? (
            <span className="badge neutral" style={{ marginLeft: 8, fontSize: 10.5 }}>
              {row.badge}
            </span>
          ) : null}
        </div>
        <div className="ss">{row.hint}</div>
      </div>
      <label className="sw" aria-label={`${row.label}: ${on ? "activado" : "desactivado"}`}>
        <input
          type="checkbox"
          checked={on}
          disabled={row.disabled || busy}
          onChange={(e) => toggle(e.target.checked)}
        />
        <span className="tr" />
      </label>
    </div>
  );
}

/** Lista de opciones de moneda; al elegir, llama updateCurrencyAction (como el <select> web). */
function CurrencySheet({ current, onDone }: { current: string; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const pick = async (code: string) => {
    if (code === current) return onDone();
    setBusy(true);
    const res = await updateCurrencyAction(code);
    setBusy(false);
    if (res.ok) {
      toast.show("Moneda actualizada", "success");
      onDone();
      router.refresh();
    } else {
      toast.show(res.message ?? "No se pudo cambiar la moneda", "error");
    }
  };

  return (
    <div className="m-optlist">
      {CURRENCIES.map((c) => (
        <button
          key={c.value}
          type="button"
          className={`m-opt${c.value === current ? " sel" : ""}`}
          disabled={busy}
          onClick={() => pick(c.value)}
        >
          <span className="m-opt-t">{c.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Vincular (muestra OTP + instrucciones) / desvincular WhatsApp. */
function WhatsAppSheet({ wa, configured, onDone }: { wa: WaLink; configured: boolean; onDone: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [otp, setOtp] = useState<{ code: string; botNumber: string | null; expiresInMin: number } | null>(null);
  const isActive = wa?.status === "active";

  const generate = () =>
    start(async () => {
      const r = await linkWhatsAppAction();
      if (r.ok && r.otp) {
        setOtp({ code: r.otp, botNumber: r.botNumber ?? null, expiresInMin: r.expiresInMin ?? 10 });
      } else {
        toast.show(r.message ?? "No pudimos generar el código.", "error");
      }
    });

  const revoke = () =>
    start(async () => {
      const r = await revokeWhatsAppAction();
      if (r.ok) {
        toast.show("WhatsApp desvinculado", "success");
        onDone();
        router.refresh();
      } else {
        toast.show(r.message ?? "No pudimos desvincular.", "error");
      }
    });

  return (
    <div style={{ display: "grid", gap: 12 }}>
      {isActive ? (
        <>
          <div className="ss pos" style={{ fontSize: 13.5 }}>
            Vinculado{wa?.phone ? ` · ${wa.phone}` : ""}
          </div>
          <button type="button" className="m-btn m-btn-block m-btn-secondary" onClick={revoke} disabled={pending}>
            {pending ? "Desvinculando…" : "Desvincular WhatsApp"}
          </button>
        </>
      ) : otp ? (
        <div>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            Envía este código por WhatsApp al número <strong>{otp.botNumber ?? "del bot"}</strong>:
          </div>
          <div
            className="mono"
            style={{ fontSize: 30, fontWeight: 800, letterSpacing: "0.14em", textAlign: "center", margin: "14px 0 6px", color: "var(--accent)" }}
          >
            {otp.code}
          </div>
          <div className="muted" style={{ fontSize: 12, textAlign: "center", lineHeight: 1.5 }}>
            Expira en {otp.expiresInMin} minutos. Al recibirlo, te confirmaremos por WhatsApp.
          </div>
        </div>
      ) : (
        <>
          <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Registra gastos por foto o texto y consulta tu presupuesto desde WhatsApp. Tu número se
            vincula solo tras confirmar un código.
          </div>
          <button type="button" className="m-btn m-btn-block m-btn-primary" onClick={generate} disabled={pending}>
            {pending ? "Generando…" : "Vincular WhatsApp"}
          </button>
        </>
      )}
      {!configured ? (
        <div className="muted" style={{ fontSize: 11.5, lineHeight: 1.5 }}>
          La integración de WhatsApp aún no está configurada en el servidor.
        </div>
      ) : null}
    </div>
  );
}

/** Invitar miembros al hogar (chips, hasta 4) → inviteHouseholdMembersAction. Gated a editor. */
function HouseholdSheet({ isEditor }: { isEditor: boolean }) {
  const [value, setValue] = useState("");
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, start] = useTransition();

  if (!isEditor) {
    return (
      <div className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
        Solo un adulto (owner) de tu hogar puede enviar invitaciones. Pídele a quien administra el
        hogar que agregue nuevos miembros.
      </div>
    );
  }

  const add = () => {
    const e = value.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) return setError("Ese correo no parece válido.");
    if (emails.includes(e)) return setError("Ya agregaste ese correo.");
    if (emails.length >= MAX_INVITES) return setError(`Puedes invitar hasta ${MAX_INVITES} miembros.`);
    setEmails([...emails, e]);
    setValue("");
    setError(null);
  };

  const send = () =>
    start(async () => {
      setStatus(null);
      const res = await inviteHouseholdMembersAction(emails);
      setStatus(res.message);
      if (res.ok) setEmails([]);
    });

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
        Agrega el correo de cada miembro (hasta {MAX_INVITES}). Les enviaremos una invitación para
        unirse a la gestión compartida.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="m-inp"
          type="email"
          inputMode="email"
          value={value}
          placeholder="correo@ejemplo.com"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          disabled={emails.length >= MAX_INVITES}
          style={{ flex: 1 }}
        />
        <button type="button" className="m-btn m-btn-secondary" style={{ flex: "none", padding: "0 16px" }} onClick={add} disabled={emails.length >= MAX_INVITES}>
          Agregar
        </button>
      </div>
      {error ? (
        <div className="m-field-err" role="alert">
          {error}
        </div>
      ) : null}
      {emails.length > 0 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {emails.map((e) => (
            <span key={e} className="badge neutral" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              {e}
              <button
                type="button"
                aria-label={`Quitar ${e}`}
                onClick={() => setEmails(emails.filter((x) => x !== e))}
                style={{ background: "none", border: 0, color: "inherit", cursor: "pointer", fontSize: 15, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <button
        type="button"
        className="m-btn m-btn-block m-btn-primary"
        onClick={send}
        disabled={sending || emails.length === 0}
      >
        {sending ? "Enviando…" : "Enviar invitaciones"}
      </button>
      {status ? (
        <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }} role="status">
          {status}
        </div>
      ) : null}
    </div>
  );
}

/** Correos del banco: lista + alta (email → código → confirmar). Espeja ingest-emails.tsx. */
function IngestSection({ emails }: { emails: IngestEmailRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const sendCode = () =>
    start(async () => {
      const r = await requestIngestEmailAction(email.trim());
      if (r.ok) {
        setVerifying(email.trim());
        setCode("");
        toast.show(`Te enviamos un código a ${email.trim()}.`, "success");
      } else {
        toast.show(r.message ?? "No pudimos enviar el código.", "error");
      }
    });

  const confirm = () =>
    start(async () => {
      if (!verifying) return;
      const r = await confirmIngestEmailAction(verifying, code.trim());
      if (r.ok) {
        toast.show("Correo verificado.", "success");
        setVerifying(null);
        setEmail("");
        setCode("");
        router.refresh();
      } else {
        toast.show(r.message ?? "No pudimos verificar el correo.", "error");
      }
    });

  const remove = (id: string) =>
    start(async () => {
      setBusyId(id);
      const r = await removeIngestEmailAction(id);
      setBusyId(null);
      if (r.ok) {
        toast.show("Correo eliminado.", "success");
        router.refresh();
      } else {
        toast.show(r.message ?? "No pudimos eliminar el correo.", "error");
      }
    });

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {emails.length > 0 ? (
        <div style={{ display: "grid", gap: 8 }}>
          {emails.map((e) => (
            <div key={e.id} className="between" style={{ gap: 10 }}>
              <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }}>
                {e.forwarderEmail}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8, flex: "none" }}>
                <span className={`badge ${e.verified ? "pos" : "neutral"}`} style={{ fontSize: 10.5 }}>
                  {e.verified ? "Verificado" : "Pendiente"}
                </span>
                <button
                  type="button"
                  className="linkbtn"
                  style={{ background: "none", border: 0, color: "var(--danger)", cursor: "pointer", fontSize: 12.5, fontWeight: 600 }}
                  disabled={pending && busyId === e.id}
                  onClick={() => remove(e.id)}
                >
                  Quitar
                </button>
              </span>
            </div>
          ))}
        </div>
      ) : null}

      {verifying ? (
        <>
          <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Ingresa el código de 6 dígitos que enviamos a <strong>{verifying}</strong>:
          </div>
          <input
            className="m-inp mono"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            style={{ letterSpacing: "0.3em", textAlign: "center" }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="m-btn m-btn-secondary" style={{ flex: "none", padding: "0 16px" }} onClick={() => setVerifying(null)} disabled={pending}>
              Cancelar
            </button>
            <button type="button" className="m-btn m-btn-block m-btn-primary" onClick={confirm} disabled={pending || code.trim().length !== 6}>
              {pending ? "Verificando…" : "Confirmar"}
            </button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 8 }}>
          <input
            className="m-inp"
            type="email"
            inputMode="email"
            placeholder="correo-que-reenvia@correo.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" className="m-btn m-btn-secondary" style={{ flex: "none", padding: "0 16px" }} onClick={sendCode} disabled={pending || email.trim().length < 5}>
            {pending ? "Enviando…" : "Enviar código"}
          </button>
        </div>
      )}
    </div>
  );
}

/** Paso 2 del borrado: confirmación final que ejecuta clearAllDataAction. */
function ClearDataStep2({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = useState(false);

  const doClear = async () => {
    setPending(true);
    const res = await clearAllDataAction();
    setPending(false);
    if (res.ok) {
      toast.show("Todos tus datos fueron borrados", "success");
      onClose();
      router.refresh();
    } else {
      toast.show(res.message ?? "No pudimos borrar los datos.", "error");
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="Confirmación final"
      message="Esto es permanente. Se borrarán definitivamente todos tus datos financieros."
      confirmLabel="Borrar definitivamente"
      variant="danger"
      pending={pending}
      onConfirm={doClear}
      onCancel={onClose}
    />
  );
}
