"use client";

/**
 * Dirección de ingesta única de la cuenta. Es lo primero que el usuario necesita
 * para conectar su correo: la copia, arma el reenvío en su bandeja y listo — sin
 * códigos ni verificación, porque el destinatario ya identifica su cuenta.
 *
 * El botón de copiar existe porque la dirección NO se teclea a mano: un carácter
 * mal copiado manda los avisos del banco a un buzón que no existe, en silencio.
 */
import { useState } from "react";

export function IngestAddressCard({ address }: { address: string }) {
  const [copiado, setCopiado] = useState(false);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles (o contexto no seguro): el usuario la
      // selecciona a mano. No hay nada que avisar.
    }
  };

  return (
    <div className="statecard" style={{ marginBottom: 12 }}>
      <p
        className="muted"
        style={{ fontSize: 11.5, letterSpacing: "0.08em", textTransform: "uppercase", margin: 0 }}
      >
        Tu dirección de ingesta
      </p>
      <div
        className="row"
        style={{ gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}
      >
        <code
          className="tnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 14,
            fontWeight: 700,
            wordBreak: "break-all",
            flex: 1,
            minWidth: 200,
          }}
        >
          {address}
        </code>
        <button type="button" className="btn btn-primary" onClick={copiar}>
          {copiado ? "Copiado" : "Copiar"}
        </button>
      </div>
      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.5, margin: "10px 0 0" }}>
        Es tuya y solo tuya: cualquier aviso del banco que reenvíes acá entra a tu cuenta, sin que
        tengas que verificar nada. No la compartas.
      </p>
    </div>
  );
}
