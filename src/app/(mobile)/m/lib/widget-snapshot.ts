/**
 * Escritor del snapshot para los widgets de pantalla de inicio (Android).
 *
 * Native-only: obtiene el puente propio `WidgetBridge` vía `registerPlugin` de
 * @capacitor/core (SSR-safe: solo crea un proxy; SIN dynamic import, que se cuelga con
 * remote URL). En web/iOS es no-op. Reusa `isNativeApp` de app-lock.ts (no duplica).
 */
import { registerPlugin } from "@capacitor/core";

import type { WidgetSnapshot } from "@/modules/rich-life/api/actions";
import { isNativeApp } from "./app-lock";

interface WidgetBridgePlugin {
  setSnapshot(options: { data: string }): Promise<void>;
}

const WidgetBridge = registerPlugin<WidgetBridgePlugin>("WidgetBridge");

/** Manda el snapshot (JSON) al puente nativo, que lo persiste y repinta los widgets. */
export async function writeWidgetSnapshot(snapshot: WidgetSnapshot): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await WidgetBridge.setSnapshot({ data: JSON.stringify(snapshot) });
  } catch (e) {
    console.warn("[widget] setSnapshot error", e);
  }
}
