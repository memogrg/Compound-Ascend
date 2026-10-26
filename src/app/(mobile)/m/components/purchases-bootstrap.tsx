"use client";

import { useEffect } from "react";
import { isCapacitor } from "@/lib/capacitor/native";
import { configurarCompras } from "@/lib/capacitor/purchases";

/**
 * Configura RevenueCat con el UUID de la cuenta al abrir la app (solo app nativa; no-op en
 * web). Es lo que permite que el webhook sepa de quién es cada compra. No pinta nada.
 */
export function PurchasesBootstrap({ userId }: { userId: string }) {
  useEffect(() => {
    if (isCapacitor()) void configurarCompras(userId);
  }, [userId]);
  return null;
}
