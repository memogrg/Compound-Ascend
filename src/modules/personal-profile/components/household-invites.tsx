"use client";

/**
 * Captura de correos de miembros de la familia (hasta 4) cuando el núcleo es
 * "familia". Los correos se guardan en el borrador del perfil; el envío real de
 * la invitación se realiza cuando hay un proveedor de email configurado.
 */
import { useState, useTransition } from "react";
import { Icon } from "@/components/ui/icon";
import { inviteHouseholdMembersAction } from "@/modules/personal-profile/api/actions";

const MAX = 4;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function HouseholdInvites({
  emails,
  onChange,
}: {
  emails: string[];
  onChange: (emails: string[]) => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sending, startSending] = useTransition();

  const sendInvites = () =>
    startSending(async () => {
      setStatus(null);
      const res = await inviteHouseholdMembersAction(emails);
      setStatus(res.message);
    });

  const add = () => {
    const e = value.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) return setError("Ese correo no parece válido.");
    if (emails.includes(e)) return setError("Ya agregaste ese correo.");
    if (emails.length >= MAX) return setError(`Puedes invitar hasta ${MAX} miembros.`);
    onChange([...emails, e]);
    setValue("");
    setError(null);
  };

  const remove = (e: string) => onChange(emails.filter((x) => x !== e));

  return (
    <div className="fld">
      <label className="fld-label">Invita a tu familia (hasta {MAX})</label>
      <p className="muted" style={{ fontSize: 12, marginTop: 2, marginBottom: 8, lineHeight: 1.5 }}>
        Agrega el correo de cada miembro. Les enviaremos una invitación para unirse a la gestión
        compartida y así sabremos quién registra cada dato.
      </p>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          className="inp"
          type="email"
          value={value}
          placeholder="correo@ejemplo.com"
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          disabled={emails.length >= MAX}
          aria-invalid={error ? true : undefined}
        />
        <button
          type="button"
          className="btn btn-secondary"
          onClick={add}
          disabled={emails.length >= MAX}
        >
          Agregar
        </button>
      </div>
      {error ? (
        <span className="auth-err" role="alert">
          {error}
        </span>
      ) : null}
      {emails.length > 0 ? (
        <>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {emails.map((e) => (
            <span
              key={e}
              className="chip-sel on"
              style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
            >
              {e}
              <button
                type="button"
                aria-label={`Quitar ${e}`}
                onClick={() => remove(e)}
                style={{
                  background: "none",
                  border: 0,
                  color: "inherit",
                  cursor: "pointer",
                  display: "grid",
                  placeItems: "center",
                  padding: 0,
                }}
              >
                <Icon name="x" width={2} />
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <button type="button" className="btn btn-secondary" onClick={sendInvites} disabled={sending}>
            {sending ? "Enviando…" : "Enviar invitaciones"}
          </button>
          {status ? (
            <span className="muted" style={{ fontSize: 12.5 }} role="status">
              {status}
            </span>
          ) : null}
        </div>
        </>
      ) : null}
    </div>
  );
}
