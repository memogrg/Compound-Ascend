"use client";

import { useState, useTransition } from "react";
import { testEmailAction, type EmailTestResult } from "@/modules/account/api/actions";

/** Botón de diagnóstico del envío de correo (cuerpo de su set-row). */
export function EmailTester() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<EmailTestResult | null>(null);

  const run = () =>
    startTransition(async () => {
      setResult(await testEmailAction());
    });

  return (
    <div>
      <button className="btn btn-secondary" onClick={run} disabled={pending}>
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
