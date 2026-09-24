/**
 * Un ÚNICO login por corrida, guardado en `.auth/`.
 *
 * El limitador de tasa NO se toca: la regla es de producción y ahí se queda. Lo que cambia
 * es el consumo — antes cada uno de los nueve specs iniciaba sesión en su `beforeAll`, y
 * contra el servidor congelado (`QA_FREEZE`) la ventana fija del limitador no rota nunca, así
 * que el bucket `auth` se agotaba a mitad de la corrida y los specs siguientes se colgaban
 * hasta el timeout con un mensaje que no menciona el límite.
 *
 * Con la sesión guardada, tres corridas seguidas contra el MISMO servidor congelado gastan
 * tres logins en vez de veintisiete.
 */
import { chromium, type FullConfig } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

import { ESTADO_SESION, iniciarSesion } from "./sesion";

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL ?? "http://localhost:3001";

  await mkdir(path.dirname(ESTADO_SESION), { recursive: true });

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ baseURL });
    const page = await ctx.newPage();
    await iniciarSesion(page);
    await ctx.storageState({ path: ESTADO_SESION });
    await ctx.close();
  } finally {
    await browser.close();
  }
}
