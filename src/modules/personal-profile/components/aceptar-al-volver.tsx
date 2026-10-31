"use client";

/**
 * Aceptación AUTOMÁTICA de la invitación, para quien vuelve del login o del registro
 * (`/invitacion/aceptar?token=…&auto=1`). Ya tocó «unirme» antes de autenticarse: pedirle
 * otro clic al volver era donde la invitación se quedaba sin aceptar.
 *
 * Se acepta desde el cliente, con la server action, y no al renderizar la página: un GET con
 * efectos lo dispararía cualquier prefetch o vista previa del enlace.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { acceptInvitationAction } from "@/modules/personal-profile/api/actions";

type Accion = (token: string) => Promise<{ ok: boolean; message?: string }>;

export type ResultadoAceptacion =
  { estado: "lista"; mensaje: null } | { estado: "error"; mensaje: string };

const ERROR_GENERICO = "No pudimos unirte al hogar. Intentá de nuevo.";

/** Llama a la acción y traduce el resultado a lo que pinta la pantalla. Nunca lanza. */
export async function intentarAceptar(token: string, accion: Accion): Promise<ResultadoAceptacion> {
  try {
    const r = await accion(token);
    if (r.ok) return { estado: "lista", mensaje: null };
    return { estado: "error", mensaje: r.message ?? ERROR_GENERICO };
  } catch {
    return { estado: "error", mensaje: ERROR_GENERICO };
  }
}

export function AceptarAlVolver({ token, inviterName }: { token: string; inviterName: string }) {
  const [resultado, setResultado] = useState<ResultadoAceptacion | null>(null);
  // Una aceptación a la vez: el doble efecto de StrictMode (o un doble toque en «Reintentar»)
  // no debe llamar dos veces a la RPC, porque la segunda falla con «ya no está disponible».
  const enCurso = useRef(false);

  const aceptar = useCallback(async () => {
    if (enCurso.current) return;
    enCurso.current = true;
    setResultado(null);
    const r = await intentarAceptar(token, acceptInvitationAction);
    enCurso.current = false;
    setResultado(r);
  }, [token]);

  useEffect(() => {
    void aceptar();
  }, [aceptar]);

  if (!resultado) {
    return (
      <p role="status" style={{ fontSize: 15, lineHeight: 1.6 }}>
        Uniéndote al hogar…
      </p>
    );
  }

  if (resultado.estado === "lista") {
    return (
      <div>
        <p role="status" style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 18 }}>
          Ya sos parte del hogar de <strong>{inviterName}</strong>.
        </p>
        {/* El único paso que le queda al invitado: cómo quiere que le llamemos. */}
        <Link
          href="/invitacion/nombre"
          className="btn btn-primary"
          style={{ width: "100%", textAlign: "center" }}
        >
          Ir a la app
        </Link>
      </div>
    );
  }

  return (
    <div>
      <span className="auth-err" role="alert" style={{ display: "block", marginBottom: 14 }}>
        {resultado.mensaje}
      </span>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => void aceptar()}
        style={{ width: "100%" }}
      >
        Reintentar
      </button>
    </div>
  );
}
