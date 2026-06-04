"use client";

import { useState, useTransition } from "react";
import { testEmailAction, type EmailTestResult } from "@/modules/account/api/actions";

/** Botón de diagnóstico del envío de correo (invitaciones de familia). */
export function EmailTester() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EmailTestResult | null>(null);

  const run = () =>
    startTransition(async () => {
      setResult(await testEmailAction());
    });

  return (
    <div className="card card-pad">
      <div className="card-title">Correo (invitaciones)</div>
      <p className="muted" style={{ fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>
        Comprueba que el envío de invitaciones de familia funcione. Verificamos la conexión y te
        enviamos un correo de prueba a tu propia dirección.
      </p>
      <button className="btn btn-secondary" style={{ marginTop: 12 }} onClick={run} disabled={pending}>
        {pending ? "Probando…" : "Probar envío de correo"}
      </button>
      {result ? (
        <div
          className={result.ok ? "auth-msg" : "auth-msg warn"}
          role="status"
          style={{ marginTop: 14, marginBottom: 0 }}
        >
          {result.message}
        </div>
      ) : null}
    </div>
  );
}
