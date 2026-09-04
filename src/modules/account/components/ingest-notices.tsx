"use client";

/**
 * Avisos de la ingesta por correo, debajo de la dirección de ingesta.
 *
 *  · Confirmación de reenvío de Gmail: Google le mandó el enlace a la dirección
 *    de ingesta (no al usuario), así que se lo mostramos acá. Un clic y listo.
 *  · Correos de banco sin parser: «los recibimos, estamos en eso». Que el usuario
 *    sepa que su reenvío funciona aunque todavía no vea movimientos.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { resolveIngestNoticeAction } from "@/modules/account/api/actions";
import type { IngestNoticesView } from "@/modules/account/services/ingest-notices-service";

export function IngestNotices({ view }: { view: IngestNoticesView }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);

  if (view.gmail.length === 0 && view.unparsedCount === 0) return null;

  const resolver = (id: string) =>
    start(async () => {
      setBusy(id);
      const r = await resolveIngestNoticeAction(id);
      setBusy(null);
      if (r.ok) router.refresh();
      else toast(r.message ?? "No pudimos actualizar el aviso.", "error");
    });

  return (
    <div style={{ display: "grid", gap: 10, marginBottom: 12 }}>
      {view.gmail.map((n) => (
        <div
          key={n.id}
          className="statecard"
          style={{ borderLeft: "3px solid var(--warning)", background: "var(--warning-soft)" }}
        >
          <p style={{ margin: 0, fontWeight: 600 }}>Gmail te pide confirmar el reenvío</p>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "6px 0 10px" }}>
            Google mandó la confirmación a tu dirección de ingesta, así que la recibimos nosotros.
            Tocá el botón, confirmá en la pantalla de Google y volvé a tu Gmail a activar el
            reenvío.
            {n.confirmCode ? (
              <>
                {" "}
                Si Gmail te pide un código en vez del enlace:{" "}
                <strong className="tnum" style={{ fontFamily: "var(--font-mono)" }}>
                  {n.confirmCode}
                </strong>
                .
              </>
            ) : null}
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {n.confirmUrl ? (
              <a
                className="btn btn-primary"
                href={n.confirmUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Confirmar el reenvío
              </a>
            ) : null}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={pending && busy === n.id}
              onClick={() => resolver(n.id)}
            >
              Ya lo confirmé
            </button>
          </div>
        </div>
      ))}

      {view.unparsedCount > 0 ? (
        <div className="statecard" style={{ borderLeft: "3px solid var(--info)" }}>
          <p style={{ margin: 0, fontWeight: 600 }}>
            Tu reenvío funciona: recibimos {view.unparsedCount}{" "}
            {view.unparsedCount === 1 ? "aviso" : "avisos"} que todavía no sabemos leer
          </p>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, margin: "6px 0 0" }}>
            {view.unparsedSenders.length > 0 ? (
              <>
                Vienen de <strong>{view.unparsedSenders.join(", ")}</strong>.{" "}
              </>
            ) : null}
            Hoy leemos los avisos de BAC y estamos agregando los demás bancos. Los correos ya están
            guardados: cuando el tuyo esté listo, aparecen solos en «Por revisar».
          </p>
        </div>
      ) : null}
    </div>
  );
}
