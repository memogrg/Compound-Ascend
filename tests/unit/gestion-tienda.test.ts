/**
 * «Gestionar suscripción» en /m/perfil: en Android abre Play Store por intent (sin Custom Tab,
 * que dejaba un tab en blanco al volver), en iOS por el navegador in-app, y al volver a la app
 * relee la pantalla una sola vez.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const nat = vi.hoisted(() => ({
  plataforma: "android" as "android" | "ios" | "web",
  open: vi.fn(async (_o: { url: string }) => {}),
  resume: [] as (() => void)[],
  remove: vi.fn(async () => {}),
}));

vi.mock("@/lib/capacitor/native", () => ({
  capacitorPlatform: () => nat.plataforma,
  capacitorBrowser: () => ({ open: nat.open, close: async () => {} }),
}));
vi.mock("@/app/(mobile)/m/lib/app-lock", () => ({
  onAppResume: async (cb: () => void) => {
    nat.resume.push(cb);
    return { remove: nat.remove };
  },
}));

const URL_PLAY =
  "https://play.google.com/store/account/subscriptions?package=com.compoundascend.cartera";
const win = { location: { href: "https://app/m/perfil" }, open: vi.fn() };

async function cargar() {
  vi.resetModules();
  return import("@/app/(mobile)/m/(app)/perfil/gestion-tienda");
}

beforeEach(() => {
  nat.plataforma = "android";
  nat.open.mockClear();
  nat.remove.mockClear();
  nat.resume = [];
  win.location.href = "https://app/m/perfil";
  win.open.mockClear();
  vi.stubGlobal("window", win);
});

describe("abrirGestionTienda", () => {
  it("Android: navega a la URL (intent a Play Store) y no abre el Custom Tab", async () => {
    const { abrirGestionTienda } = await cargar();
    await abrirGestionTienda(URL_PLAY);
    expect(win.location.href).toBe(URL_PLAY);
    expect(nat.open).not.toHaveBeenCalled();
  });

  it("iOS: usa el navegador in-app y no navega el WebView", async () => {
    nat.plataforma = "ios";
    const { abrirGestionTienda } = await cargar();
    await abrirGestionTienda("https://apps.apple.com/account/subscriptions");
    expect(nat.open).toHaveBeenCalledWith({ url: "https://apps.apple.com/account/subscriptions" });
    expect(win.location.href).toBe("https://app/m/perfil");
  });
});

describe("refrescarAlVolver", () => {
  it("al volver refresca una sola vez y suelta la escucha", async () => {
    const { refrescarAlVolver } = await cargar();
    const refrescar = vi.fn();
    refrescarAlVolver(refrescar);
    await Promise.resolve();
    expect(refrescar).not.toHaveBeenCalled();
    nat.resume.forEach((cb) => cb());
    nat.resume.forEach((cb) => cb());
    expect(refrescar).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(nat.remove).toHaveBeenCalled();
  });

  it("dos toques antes de volver arman una sola escucha", async () => {
    const { refrescarAlVolver } = await cargar();
    const refrescar = vi.fn();
    refrescarAlVolver(refrescar);
    refrescarAlVolver(refrescar);
    await Promise.resolve();
    expect(nat.resume).toHaveLength(1);
    nat.resume[0]!();
    expect(refrescar).toHaveBeenCalledTimes(1);
  });

  it("después de volver, un nuevo toque vuelve a armar la escucha", async () => {
    const { refrescarAlVolver } = await cargar();
    const refrescar = vi.fn();
    refrescarAlVolver(refrescar);
    nat.resume[0]!();
    refrescarAlVolver(refrescar);
    expect(nat.resume).toHaveLength(2);
  });
});
