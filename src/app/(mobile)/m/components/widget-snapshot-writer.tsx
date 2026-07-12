"use client";

/**
 * Escribe el snapshot del widget en cada carga de sesión del móvil. Sin UI (devuelve null).
 * Solo dentro de la app nativa: obtiene las métricas con `getWidgetSnapshotAction` (reusa
 * getRichLifeSummary) y las manda al puente `WidgetBridge`. En web/iOS es no-op.
 */
import { useEffect } from "react";

import { getWidgetSnapshotAction } from "@/modules/rich-life/api/actions";

import { isNativeApp } from "../lib/app-lock";
import { writeWidgetSnapshot } from "../lib/widget-snapshot";

export function WidgetSnapshotWriter() {
  useEffect(() => {
    if (!isNativeApp()) return;
    void (async () => {
      const snapshot = await getWidgetSnapshotAction();
      if (snapshot) await writeWidgetSnapshot(snapshot);
    })();
  }, []);
  return null;
}
