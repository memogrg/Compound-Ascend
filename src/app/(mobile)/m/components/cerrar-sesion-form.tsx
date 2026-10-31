"use client";

import type { CSSProperties, ReactNode } from "react";
import { signOutAction } from "@/lib/auth/actions";
import { cerrarSesionCompras } from "@/lib/capacitor/purchases";

/**
 * El form de «Cerrar sesión» del móvil. Antes de la Server Action desvincula la cuenta de
 * RevenueCat, para que quien entre después en el mismo teléfono no herede las compras de
 * ésta. En el navegador `cerrarSesionCompras` es no-op y el form se comporta igual que antes.
 * El botón lo pone la pantalla: este componente solo es el form.
 */
export function CerrarSesionForm({
  style,
  children,
}: {
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <form
      style={style}
      action={async () => {
        await cerrarSesionCompras();
        await signOutAction("/m/login");
      }}
    >
      {children}
    </form>
  );
}
