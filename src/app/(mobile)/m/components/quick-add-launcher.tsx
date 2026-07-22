"use client";

import { useState } from "react";
import { Fab } from "./form-kit/fab";
import { QuickAddSheet } from "./quick-add-sheet";
import type {
  FuenteIngreso,
  SobreRapido,
} from "@/modules/financial-base/services/quick-add-service";

/**
 * El "+" de Inicio y su hoja. Existe solo para tener el estado de apertura en cliente sin
 * convertir Inicio entero en un componente de cliente.
 *
 * Los sobres se pasan YA cargados desde el servidor: pedirlos al abrir metería una espera
 * justo en el momento que este delta intenta acortar, y son dos consultas ligeras que
 * Inicio puede resolver en paralelo con lo demás.
 */
export function QuickAddLauncher({
  sobres,
  frecuentes,
  fuentes,
  currency,
}: {
  sobres: SobreRapido[];
  frecuentes: SobreRapido[];
  fuentes: FuenteIngreso[];
  currency: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Fab onClick={() => setOpen(true)} label="Registrar movimiento" />
      <QuickAddSheet
        open={open}
        onClose={() => setOpen(false)}
        sobres={sobres}
        frecuentes={frecuentes}
        fuentes={fuentes}
        currency={currency}
      />
    </>
  );
}
