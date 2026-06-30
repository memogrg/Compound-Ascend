"use client";

/**
 * Onboarding de la ingesta por correo. El usuario configura en su correo un reenvío
 * de los avisos del banco a la dirección de ingesta y registra aquí el correo desde
 * el que reenvía; la propiedad se prueba con un código de 6 dígitos enviado a esa
 * dirección. Calca el flujo de whatsapp-link.tsx (código → verificación).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { useToast } from "@/components/ui/toast";
import {
  requestIngestEmailAction,
  confirmIngestEmailAction,
  removeIngestEmailAction,
} from "@/modules/account/api/actions";
import type { IngestEmailRow } from "@/modules/account/services/ingest-email-service";

const INGEST_TARGET = "communications@aitechumbrella.com";
const HELP =
  "Al reenviar los avisos de tu banco a esta dirección, CARTERA+ los lee y registra tus " +
  "movimientos sin que los teclees. Solo procesamos correos del remitente que verificaste; " +
  "nada se guarda sin tu confirmación.";

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
    <div className="card card-pad">
      <div className="row" style={{ alignItems: "center", gap: 8 }}>
        <div className="card-title">Correos del banco</div>
        <span
          className="tip"
          data-tip={HELP}
          style={{ display: "inline-flex", color: "var(--muted)" }}
        >
          <Icon name="info" style={{ width: 14, height: 14 }} />
        </span>
      </div>

      <p className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
        Configurá en tu correo un reenvío de los avisos de tu banco a{" "}
        <strong className="tnum">{INGEST_TARGET}</strong>, y registrá acá el correo desde el que
        reenviás.
      </p>

      {/* Lista de correos registrados. */}
      {initial.length > 0 ? (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          {initial.map((e) => (
            <div
              key={e.id}
              className="row"
              style={{ justifyContent: "space-between", gap: 8, fontSize: 13 }}
            >
              <span
                style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {e.forwarderEmail}
              </span>
              <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flex: "none" }}>
                <span
                  className="chip"
                  style={
                    e.verified
                      ? { background: "var(--pos-soft, rgba(60,140,90,.12))", color: "var(--pos)" }
                      : { background: "var(--warn-soft, rgba(190,140,40,.12))", color: "var(--warn)" }
                  }
                >
                  {e.verified ? "Verificado" : "Pendiente"}
                </span>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ fontSize: 11, padding: "4px 10px" }}
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

      {/* Alta: email → enviar código → confirmar. */}
      {verifying ? (
        <div style={{ marginTop: 14 }}>
          <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5 }}>
            Ingresá el código de 6 dígitos que enviamos a <strong>{verifying}</strong>:
          </p>
          <div className="row" style={{ gap: 8, marginTop: 8 }}>
            <input
              className="inp tnum"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(ev) => setCode(ev.target.value.replace(/\D/g, ""))}
              style={{ width: 120, letterSpacing: 3 }}
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
        <div className="row" style={{ gap: 8, marginTop: 14 }}>
          <input
            className="inp"
            type="email"
            placeholder="tucorreo@gmail.com"
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            style={{ flex: 1, minWidth: 0 }}
          />
          <button
            type="button"
            className="btn btn-primary"
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
