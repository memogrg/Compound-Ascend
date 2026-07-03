"use client";

/**
 * Onboarding de la ingesta por correo. El usuario configura en su correo un reenvío
 * de los avisos del banco a la dirección de ingesta y registra aquí el correo desde
 * el que reenvía; la propiedad se prueba con un código de 6 dígitos enviado a esa
 * dirección. Calca el flujo de whatsapp-link.tsx (código → verificación).
 * Cuerpo de su set-row (el título/descripción viven en la página).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import {
  requestIngestEmailAction,
  confirmIngestEmailAction,
  removeIngestEmailAction,
} from "@/modules/account/api/actions";
import type { IngestEmailRow } from "@/modules/account/services/ingest-email-service";

export function IngestEmails({ initial }: { initial: IngestEmailRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState<string | null>(null); // correo esperando código
  const [busyId, setBusyId] = useState<string | null>(null);

  const sendCode = () =>
    start(async () => {
      const r = await requestIngestEmailAction(email.trim());
      if (r.ok) {
        setVerifying(email.trim());
        setCode("");
        toast(`Te enviamos un código a ${email.trim()}.`);
      } else {
        toast(r.message ?? "No pudimos enviar el código.", "error");
      }
    });

  const confirm = () =>
    start(async () => {
      if (!verifying) return;
      const r = await confirmIngestEmailAction(verifying, code.trim());
      if (r.ok) {
        toast("Correo verificado.");
        setVerifying(null);
        setEmail("");
        setCode("");
        router.refresh();
      } else {
        toast(r.message ?? "No pudimos verificar el correo.", "error");
      }
    });

  const remove = (id: string) =>
    start(async () => {
      setBusyId(id);
      const r = await removeIngestEmailAction(id);
      setBusyId(null);
      if (r.ok) {
        toast("Correo eliminado.");
        router.refresh();
      } else {
        toast(r.message ?? "No pudimos eliminar el correo.", "error");
      }
    });

  return (
    <div className="statecard">
      {/* Lista de correos registrados. */}
      {initial.length > 0 ? (
        <table className="mailtab" style={{ marginBottom: 14 }}>
          <tbody>
            {initial.map((e) => (
              <tr key={e.id}>
                <td
                  style={{
                    width: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 0,
                  }}
                >
                  {e.forwarderEmail}
                </td>
                <td>
                  <span className={`vchip ${e.verified ? "ok" : "pend"}`}>
                    {e.verified ? "Verificado" : "Pendiente"}
                  </span>
                </td>
                <td style={{ textAlign: "right", paddingLeft: 12 }}>
                  <button
                    type="button"
                    className="linkbtn"
                    disabled={pending && busyId === e.id}
                    onClick={() => remove(e.id)}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      {/* Alta: email → enviar código → confirmar. */}
      {verifying ? (
        <div>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "0 0 8px" }}>
            Ingresá el código de 6 dígitos que enviamos a <strong>{verifying}</strong>:
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              className="inp tnum"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
              style={{
                maxWidth: 150,
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.3em",
                textAlign: "center",
              }}
            />
            <button
              type="button"
              className="btn btn-primary"
              onClick={confirm}
              disabled={pending || code.trim().length !== 6}
            >
              {pending ? "Verificando…" : "Confirmar"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setVerifying(null)}
              disabled={pending}
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="inp"
            type="email"
            placeholder="correo-desde-el-que-reenvias@correo.com"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            style={{ flex: 1, minWidth: 180 }}
          />
          <button
            type="button"
            className="btn btn-secondary"
            onClick={sendCode}
            disabled={pending || email.trim().length < 5}
          >
            {pending ? "Enviando…" : "Enviar código"}
          </button>
        </div>
      )}
    </div>
  );
}
