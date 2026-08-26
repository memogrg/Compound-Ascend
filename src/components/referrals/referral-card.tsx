"use client";

import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";

import { Icon } from "@/components/ui/icon";
import { referralUrl } from "@/lib/referrals/code";

/**
 * Tarjeta de invitación: QR, link, copiar, compartir y contador.
 *
 * UNA sola implementación para web y móvil; `skin` cambia las clases, no el
 * comportamiento. Igual que los asistentes de configuración: dos pieles, una
 * máquina.
 *
 * ── EL QR SE GENERA EN EL CLIENTE ───────────────────────────────────────────
 * Nada de servicios externos de QR: mandar la URL a un tercero para que dibuje
 * el código filtra a ese tercero quién invita a quién. `qrcode` lo dibuja en el
 * navegador y la URL no sale de la máquina del usuario.
 *
 * ── SIN PII ─────────────────────────────────────────────────────────────────
 * El QR contiene EXCLUSIVAMENTE la URL de invitación con el código, que es
 * público por diseño. Ni nombre, ni correo, ni id: un QR se imprime, se
 * fotografía y se reenvía sin control, y todo lo que lleve dentro es público
 * para siempre.
 */
export function ReferralCard({
  code,
  count,
  appUrl,
  skin = "web",
}: {
  code: string;
  count: number;
  /** Origen de la app. En cliente cae a `window.location.origin`. */
  appUrl?: string;
  skin?: "web" | "mobile";
}) {
  const [origin, setOrigin] = useState(appUrl ?? "");
  const [qr, setQr] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [canShare, setCanShare] = useState(false);

  // El origen real solo se conoce en el navegador cuando no llega por props
  // (p. ej. previews de Vercel, donde NEXT_PUBLIC_APP_URL apunta a producción).
  useEffect(() => {
    if (!appUrl) setOrigin(window.location.origin);
    setCanShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, [appUrl]);

  const url = origin ? referralUrl(origin, code) : "";

  useEffect(() => {
    if (!url) return;
    let alive = true;
    // Margen 1 y nivel M: el QR va a leerse desde una pantalla de teléfono a
    // 20 cm o desde una captura reenviada por WhatsApp, no desde un cartel.
    QRCode.toDataURL(url, { width: 512, margin: 1, errorCorrectionLevel: "M" })
      .then((dataUrl) => {
        if (alive) setQr(dataUrl);
      })
      .catch(() => {
        // Sin QR, el link y el botón de copiar siguen funcionando: la tarjeta
        // no depende de que la librería resuelva.
        if (alive) setQr(null);
      });
    return () => {
      alive = false;
    };
  }, [url]);

  useEffect(() => {
    if (!feedback) return;
    const t = setTimeout(() => setFeedback(null), 1800);
    return () => clearTimeout(t);
  }, [feedback]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(url);
      setFeedback("Link copiado");
    } catch {
      setFeedback("No pudimos copiar. Mantené presionado el link.");
    }
  }, [url]);

  const share = useCallback(async () => {
    try {
      await navigator.share({
        title: "CARTERA+",
        text: "Te invito a ordenar tus finanzas con CARTERA+.",
        url,
      });
    } catch {
      // El usuario canceló la hoja de compartir: no es un error que reportar.
    }
  }, [url]);

  const mobile = skin === "mobile";

  return (
    <div className={mobile ? "ref-card ref-card-m" : "ref-card"}>
      <div className="ref-count">
        {count === 0 ? (
          <>
            Todavía no has invitado a nadie. <strong>Empezá compartiendo tu código.</strong>
          </>
        ) : (
          <>
            Has invitado a <strong>{count}</strong> {count === 1 ? "persona" : "personas"}.
          </>
        )}
      </div>

      <div className="ref-qr-wrap">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- data: URI generado en el cliente; next/image no aporta nada y exigiría configurar el loader.
          <img
            className="ref-qr"
            src={qr}
            alt={`Código QR de invitación ${code}`}
            width={180}
            height={180}
          />
        ) : (
          <div className="ref-qr ref-qr-skel" aria-hidden />
        )}
        <div className="ref-code" aria-label="Tu código de invitación">
          {code}
        </div>
      </div>

      <div className="ref-link" title={url}>
        {url || "…"}
      </div>

      <div className="ref-actions">
        <button
          type="button"
          className={mobile ? "m-btn m-btn-primary" : "btn btn-primary"}
          onClick={copy}
        >
          <Icon name="upload" width={2.2} /> Copiar link
        </button>
        {canShare ? (
          <button
            type="button"
            className={mobile ? "m-btn m-btn-secondary" : "btn btn-secondary"}
            onClick={share}
          >
            <Icon name="send" width={2.2} /> Compartir
          </button>
        ) : null}
        {qr ? (
          // Descarga del PNG: es lo que se manda por WhatsApp cuando compartir
          // un link no alcanza (grupos, impresión, un local físico).
          <a
            className={mobile ? "m-btn m-btn-secondary" : "btn btn-secondary"}
            href={qr}
            download={`cartera-plus-${code}.png`}
          >
            <Icon name="scan" width={2.2} /> Descargar QR
          </a>
        ) : null}
      </div>

      <div className="ref-feedback" role="status" aria-live="polite">
        {feedback ?? ""}
      </div>
    </div>
  );
}
