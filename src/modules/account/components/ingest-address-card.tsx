"use client";

/**
 * Dirección de ingesta única de la cuenta. Es lo primero que el usuario necesita
 * para conectar su correo: la copia, arma el reenvío en su bandeja y listo — sin
 * códigos ni verificación, porque el destinatario ya identifica su cuenta.
 *
 * El botón de copiar existe porque la dirección NO se teclea a mano: un carácter
 * mal copiado manda los avisos del banco a un buzón que no existe, en silencio.
 */
import { useState, useTransition, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { pollIngestNowAction } from "@/modules/account/api/actions";

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
      <PollNowRow />
      <IngestSetupGuide address={address} />
    </div>
  );
}

/**
 * «Buscar avisos ahora». El buzón se revisa solo cada 5 minutos; cuando la
 * persona acaba de reenviar algo (o de agregar la dirección en Gmail y espera el
 * botón de confirmar) no tiene por qué mirar el reloj.
 */
function PollNowRow() {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  const [ultimo, setUltimo] = useState<string | null>(null);

  const buscar = () =>
    start(async () => {
      const r = await pollIngestNowAction();
      setUltimo(r.message);
      if (r.ok) router.refresh();
      else toast(r.message, "error");
    });

  return (
    <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center", marginTop: 12 }}>
      <button type="button" className="btn" onClick={buscar} disabled={pending}>
        {pending ? "Revisando el buzón…" : "Buscar avisos ahora"}
      </button>
      <span className="muted" style={{ fontSize: 12.5, lineHeight: 1.4 }}>
        {ultimo ?? "Revisamos el buzón solo cada 5 minutos. ¿Recién reenviaste algo? Tocá acá."}
      </span>
    </div>
  );
}

const STEP_STYLE: CSSProperties = { fontSize: 13, lineHeight: 1.55, margin: "6px 0 0 18px" };
const NOTE_STYLE: CSSProperties = { fontSize: 12.5, lineHeight: 1.5, margin: "8px 0 0" };

/**
 * Guía "para todos", clic por clic, con la dirección del usuario ya puesta en
 * cada paso. Vive junto a la dirección porque es el momento en que la necesita;
 * la versión larga está en docs/guia-conectar-correo.md.
 */
function IngestSetupGuide({ address }: { address: string }) {
  return (
    <details style={{ marginTop: 12 }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, fontSize: 13.5 }}>
        Cómo configurarlo, paso a paso (5–10 minutos, una sola vez)
      </summary>

      <p style={NOTE_STYLE}>
        <strong>Paso 0 · Que el banco te avise por correo.</strong> Buscá en tu bandeja un correo
        del banco de una compra reciente. Si no hay, entrá a la app o banca en línea de tu banco →{" "}
        <strong>Alertas</strong> o <strong>Notificaciones</strong> → marcá{" "}
        <strong>correo electrónico</strong> para todo (compras, retiros, transferencias, SINPE) y
        poné el monto mínimo en cero.
      </p>

      <details style={{ marginTop: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>Gmail (en la computadora)</summary>
        <ol style={STEP_STYLE}>
          <li>
            Engranaje ⚙ → <strong>Ver toda la configuración</strong> → pestaña{" "}
            <strong>Reenvío y correo POP/IMAP</strong>.
          </li>
          <li>
            <strong>Agregar una dirección de reenvío</strong> → pegá <code>{address}</code> →
            Siguiente → Continuar → Aceptar.
          </li>
          <li>
            Gmail manda una confirmación a esa dirección. <strong>Nos llega a nosotros:</strong> en
            unos minutos aparece acá arriba el botón «Confirmar el reenvío». Tocalo y después
            recargá Gmail.
          </li>
          <li>
            Abrí un correo del banco → ⋮ → <strong>Filtrar mensajes como estos</strong> →{" "}
            <strong>Crear filtro</strong>.
          </li>
          <li>
            Marcá <strong>Reenviarlo a</strong> (elegí tu dirección) y{" "}
            <strong>No enviarlo nunca a Spam</strong> → <strong>Crear filtro</strong>. Repetí por
            cada banco.
          </li>
        </ol>
        <p className="muted" style={NOTE_STYLE}>
          Google no deja hacer esto desde la app del celular. Si no ves la pestaña «Reenvío» y el
          correo es de tu empresa, el administrador lo tiene apagado: usá el reenvío manual.
        </p>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>
          Outlook / Hotmail / Microsoft 365
        </summary>
        <ol style={STEP_STYLE}>
          <li>
            Engranaje ⚙ → <strong>Correo</strong> → <strong>Reglas</strong> →{" "}
            <strong>Agregar nueva regla</strong>.
          </li>
          <li>
            Condición <strong>De</strong> → el correo desde el que te escribe tu banco (copialo de
            un aviso que ya tengas).
          </li>
          <li>
            Acción <strong>Redirigir a</strong> (no «Reenviar a») → pegá <code>{address}</code> →
            Guardar.
          </li>
        </ol>
        <p className="muted" style={NOTE_STYLE}>
          Si te rebota con «5.7.520 external forwarding», tu empresa bloquea el reenvío externo: usá
          el reenvío manual mientras el administrador lo habilita.
        </p>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>iCloud (correo de Apple)</summary>
        <ol style={STEP_STYLE}>
          <li>
            En icloud.com/mail: engranaje ⚙ → <strong>Ajustes</strong> → <strong>Reglas</strong> →{" "}
            <strong>Añadir regla</strong>.
          </li>
          <li>
            Si un mensaje <strong>es de</strong> tu banco → <strong>Reenviar a</strong>{" "}
            <code>{address}</code>. No marqués «Eliminar después de reenviar».
          </li>
        </ol>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>Yahoo</summary>
        <p style={NOTE_STYLE}>
          El reenvío automático solo existe en Yahoo Mail Plus (de pago): Ajustes → Más ajustes →
          Buzones → Reenvío → pegá <code>{address}</code>. Sin Plus, usá el reenvío manual.
        </p>
      </details>

      <details style={{ marginTop: 8 }}>
        <summary style={{ cursor: "pointer", fontSize: 13 }}>
          Reenvío manual (cualquier correo, desde el celular)
        </summary>
        <p style={NOTE_STYLE}>
          Abrí el aviso del banco → <strong>Reenviar</strong> → pegá <code>{address}</code> →
          enviar. Da igual desde cuál correo lo mandés. Sirve también para cargar avisos viejos: el
          reenvío automático solo aplica a correos nuevos.
        </p>
      </details>

      <p style={NOTE_STYLE}>
        <strong>Probalo:</strong> reenviá a mano un aviso que ya tengas. Tocá «Buscar avisos ahora»
        (o esperá: el buzón se revisa solo cada 5 minutos); el movimiento aparece en{" "}
        <strong>Transacciones → Por revisar</strong>, donde lo confirmás con un toque o lo editás
        antes.
      </p>
    </details>
  );
}
