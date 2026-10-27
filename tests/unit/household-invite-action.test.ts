/**
 * Invitar al hogar: rol y cupo se validan EN EL SERVIDOR, en inviteHouseholdMembersAction (la
 * singular delega en ella). Corre la action y el servicio de miembros reales contra una base en
 * memoria que imita las RPC y la RLS que usan:
 *  · rol: con hogar activo, solo owner/adult; sin hogar se permite (va a ser el titular);
 *  · cupo: límite del plan del TITULAR − (activos + pendientes NO vencidas), y los correos que
 *    ya tienen una invitación pendiente no cuentan;
 *  · sin hogar, el cupo sale del plan propio (ensure_household lo hace titular).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("react", async () => {
  const actual = await vi.importActual<typeof import("react")>("react");
  return { ...actual, cache: <T>(fn: T) => fn };
});

type Plan = "ninguno" | "esencial" | "pro" | "max";
type Miembro = {
  household_id: string;
  user_id: string;
  role: "owner" | "adult" | "member" | "viewer";
  status: "active" | "invited" | "removed";
  created_at: string;
};
type Invitacion = {
  id: string;
  household_id: string;
  email: string;
  token: string;
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
  created_at: string;
};
type Fila = Record<string, unknown>;

const bd = vi.hoisted(() => ({
  uid: "yo",
  planes: {} as Record<string, string>,
  hogares: [] as { id: string; owner_id: string }[],
  miembros: [] as Miembro[],
  invitaciones: [] as Invitacion[],
  enviados: [] as string[],
  seq: 0,
}));

vi.mock("@/lib/auth/session", () => ({
  isSupabaseConfigured: () => true,
  getUser: async () => ({ id: bd.uid, email: `${bd.uid}@ejemplo.com`, user_metadata: {} }),
  requireUser: async () => ({ id: bd.uid }),
}));
vi.mock("@/lib/email/send", () => ({
  isEmailConfigured: () => true,
  sendEmail: async ({ to }: { to: string }) => {
    bd.enviados.push(to);
    return { ok: true };
  },
}));
vi.mock("@/lib/env", () => ({ getClientEnv: () => ({ NEXT_PUBLIC_APP_URL: "https://app.test" }) }));
vi.mock("@/lib/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/revalidation/rutas-espejo", () => ({ revalidarRuta: vi.fn() }));
vi.mock("@/modules/personal-profile/services/profile-service", () => ({}));
vi.mock("@/modules/personal-profile/services/demo-template", () => ({}));
vi.mock("@/lib/ai/profile-matices", () => ({}));
vi.mock("@/lib/ai/advisor-knowledge", () => ({ ARCHETYPE_PLAYBOOKS: {} }));

/** Hogar activo como resolveActiveMembership / household_owner_plan: owner primero, si no el más antiguo. */
function hogarActivo(uid: string): Miembro | undefined {
  const activas = bd.miembros
    .filter((m) => m.user_id === uid && m.status === "active")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return activas.find((m) => m.role === "owner") ?? activas[0];
}

function esEditor(uid: string, householdId: string): boolean {
  return bd.miembros.some(
    (m) =>
      m.household_id === householdId &&
      m.user_id === uid &&
      m.status === "active" &&
      (m.role === "owner" || m.role === "adult"),
  );
}

function stamp(): string {
  bd.seq += 1;
  return new Date(Date.UTC(2026, 0, 1, 0, 0, bd.seq)).toISOString();
}

/** Query builder mínimo: eq / gt / in sobre filas en memoria; RLS donde el código depende de ella. */
function tabla(nombre: string) {
  const filtros: ((f: Fila) => boolean)[] = [];
  const filas = (): Fila[] => {
    if (nombre === "profiles") return Object.entries(bd.planes).map(([id, plan]) => ({ id, plan }));
    if (nombre === "household_members") return bd.miembros;
    if (nombre === "household_invitations")
      // RLS hh_invit_select: solo un editor del hogar ve sus invitaciones.
      return bd.invitaciones.filter((i) => esEditor(bd.uid, i.household_id));
    throw new Error(`tabla inesperada: ${nombre}`);
  };
  const resultado = () => filas().filter((f) => filtros.every((p) => p(f)));
  const q = {
    select: () => q,
    order: () => q,
    eq: (c: string, v: unknown) => (filtros.push((f) => f[c] === v), q),
    gt: (c: string, v: string) => (filtros.push((f) => String(f[c]) > v), q),
    in: (c: string, vs: unknown[]) => (filtros.push((f) => vs.includes(f[c])), q),
    maybeSingle: async () => ({ data: resultado()[0] ?? null, error: null }),
    then: (ok: (r: { data: Fila[]; error: null }) => unknown) =>
      Promise.resolve({ data: resultado(), error: null }).then(ok),
    insert: (nuevas: { household_id: string; email: string }[]) => ({
      select: async () => {
        // RLS hh_invit_insert: solo un editor del hogar.
        if (nuevas.some((n) => !esEditor(bd.uid, n.household_id)))
          return { data: null, error: { message: "rls" } };
        const creadas = nuevas.map((n) => ({
          id: `inv-${++bd.seq}`,
          household_id: n.household_id,
          email: n.email,
          token: `tok-${bd.seq}`,
          status: "pending" as const,
          expires_at: "2999-01-01T00:00:00.000Z",
          created_at: stamp(),
        }));
        bd.invitaciones.push(...creadas);
        return { data: creadas, error: null };
      },
    }),
  };
  return q;
}

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: (t: string) => tabla(t),
    rpc: async (fn: string) => {
      const activa = hogarActivo(bd.uid);
      if (fn === "household_owner_plan") {
        if (!activa) return { data: null, error: null };
        const h = bd.hogares.find((x) => x.id === activa.household_id)!;
        return { data: bd.planes[h.owner_id] ?? null, error: null };
      }
      if (fn === "list_household_members") {
        if (!activa) return { data: [], error: null };
        const data = bd.miembros
          .filter((m) => m.household_id === activa.household_id && m.status !== "removed")
          .map((m) => ({ ...m, email: `${m.user_id}@ejemplo.com`, joined_at: m.created_at }));
        return { data, error: null };
      }
      if (fn === "ensure_household") {
        if (activa) return { data: activa.household_id, error: null };
        const id = crearHogar(bd.uid);
        return { data: id, error: null };
      }
      throw new Error(`rpc inesperada: ${fn}`);
    },
  }),
}));

function crearHogar(ownerId: string): string {
  const id = `hogar-${++bd.seq}`;
  bd.hogares.push({ id, owner_id: ownerId });
  bd.miembros.push({
    household_id: id,
    user_id: ownerId,
    role: "owner",
    status: "active",
    created_at: stamp(),
  });
  return id;
}

function sumar(householdId: string, userId: string, role: Miembro["role"], plan: Plan = "ninguno") {
  bd.planes[userId] = plan;
  bd.miembros.push({
    household_id: householdId,
    user_id: userId,
    role,
    status: "active",
    created_at: stamp(),
  });
}

function pendiente(householdId: string, email: string, vence: string) {
  bd.invitaciones.push({
    id: `inv-${++bd.seq}`,
    household_id: householdId,
    email,
    token: `tok-${bd.seq}`,
    status: "pending",
    expires_at: vence,
    created_at: stamp(),
  });
}

const FUTURO = "2999-01-01T00:00:00.000Z";
const PASADO = "2000-01-01T00:00:00.000Z";

import {
  inviteHouseholdMembersAction,
  inviteHouseholdMemberAction,
} from "@/modules/personal-profile/api/actions";

beforeEach(() => {
  bd.uid = "yo";
  bd.planes = {};
  bd.hogares = [];
  bd.miembros = [];
  bd.invitaciones = [];
  bd.enviados = [];
  bd.seq = 0;
});

describe("inviteHouseholdMembersAction · rol y cupo en el servidor", () => {
  it("(1) sin hogar con plan max → invita y crea el hogar con él de titular", async () => {
    bd.planes.yo = "max";
    const r = await inviteHouseholdMembersAction(["ana@ejemplo.com", "beto@ejemplo.com"]);
    expect(r).toMatchObject({ ok: true, sent: 2 });
    expect(bd.hogares).toEqual([{ id: expect.any(String), owner_id: "yo" }]);
    expect(bd.invitaciones).toHaveLength(2);
  });

  it.each(["pro", "esencial", "ninguno"] as const)(
    "(2) sin hogar con plan %s (sin hogar incluido) → rechaza por cupo, sin crear nada",
    async (plan) => {
      bd.planes.yo = plan;
      const r = await inviteHouseholdMembersAction(["ana@ejemplo.com"]);
      expect(r.ok).toBe(false);
      expect(r.message).toBe(
        "Tu plan permite hasta 1 persona en el hogar (incluido vos). No quedan cupos.",
      );
      expect(bd.hogares).toHaveLength(0);
      expect(bd.invitaciones).toHaveLength(0);
    },
  );

  it("(3) owner max con cupo → ok; si pide más de lo que queda → rechaza", async () => {
    bd.planes.yo = "max";
    const h = crearHogar("yo");
    sumar(h, "pareja", "adult");
    expect(
      await inviteHouseholdMembersAction(["ana@ejemplo.com", "beto@ejemplo.com"]),
    ).toMatchObject({
      ok: false,
      message: "Tu plan permite hasta 3 personas en el hogar (incluido vos). Te queda 1 cupo.",
    });
    expect(await inviteHouseholdMembersAction(["ana@ejemplo.com"])).toMatchObject({
      ok: true,
      sent: 1,
    });
  });

  it("(4) adult de un hogar Max+ (sin plan propio) → ok, con el cupo del titular", async () => {
    bd.planes.titular = "max";
    const h = crearHogar("titular");
    sumar(h, "yo", "adult", "ninguno");
    const r = await inviteHouseholdMembersAction(["ana@ejemplo.com"]);
    expect(r).toMatchObject({ ok: true, sent: 1 });
    expect(bd.invitaciones[0]?.household_id).toBe(h);
  });

  it.each(["member", "viewer"] as const)("(5) %s → mensaje de rol, sin crear nada", async (rol) => {
    bd.planes.titular = "max";
    const h = crearHogar("titular");
    sumar(h, "yo", rol, "max");
    const r = await inviteHouseholdMembersAction(["ana@ejemplo.com"]);
    expect(r).toMatchObject({
      ok: false,
      message: "Solo el titular o un adulto del hogar puede invitar.",
    });
    expect(bd.invitaciones).toHaveLength(0);
  });

  it("(6) cupo lleno contando las pendientes no vencidas → rechaza", async () => {
    bd.planes.yo = "max";
    const h = crearHogar("yo");
    sumar(h, "pareja", "adult");
    pendiente(h, "hija@ejemplo.com", FUTURO);
    const r = await inviteHouseholdMembersAction(["ana@ejemplo.com"]);
    expect(r).toMatchObject({
      ok: false,
      message: "Tu plan permite hasta 3 personas en el hogar (incluido vos). No quedan cupos.",
    });
  });

  it("(6b) reinvitar a quien ya tiene una pendiente no ocupa cupo: reenvía la misma", async () => {
    bd.planes.yo = "max";
    const h = crearHogar("yo");
    sumar(h, "pareja", "adult");
    pendiente(h, "hija@ejemplo.com", FUTURO);
    const r = await inviteHouseholdMembersAction(["hija@ejemplo.com"]);
    expect(r).toMatchObject({ ok: true, sent: 1 });
    expect(bd.invitaciones).toHaveLength(1);
  });

  it("(7) las pendientes vencidas no cuentan para el cupo", async () => {
    bd.planes.yo = "max";
    const h = crearHogar("yo");
    sumar(h, "pareja", "adult");
    pendiente(h, "vieja@ejemplo.com", PASADO);
    const r = await inviteHouseholdMembersAction(["ana@ejemplo.com"]);
    expect(r).toMatchObject({ ok: true, sent: 1 });
  });

  it("(7b) a una pendiente vencida no se le reusa el token: sale una invitación nueva", async () => {
    bd.planes.yo = "max";
    crearHogar("yo");
    const h = bd.hogares[0]!.id;
    pendiente(h, "ana@ejemplo.com", PASADO);
    const r = await inviteHouseholdMembersAction(["ana@ejemplo.com"]);
    expect(r).toMatchObject({ ok: true, sent: 1 });
    expect(bd.invitaciones.filter((i) => i.email === "ana@ejemplo.com")).toHaveLength(2);
  });
});

describe("inviteHouseholdMemberAction (singular) valida a través del plural", () => {
  it("(8) sin cupo → el mismo rechazo; con cupo → invita", async () => {
    bd.planes.yo = "pro";
    crearHogar("yo");
    expect(await inviteHouseholdMemberAction("ana@ejemplo.com")).toMatchObject({
      ok: false,
      message: "Tu plan permite hasta 1 persona en el hogar (incluido vos). No quedan cupos.",
    });
    bd.planes.yo = "max";
    expect(await inviteHouseholdMemberAction("ana@ejemplo.com")).toMatchObject({
      ok: true,
      sent: 1,
    });
  });

  it("(8b) un member que usa la singular recibe el mensaje de rol", async () => {
    bd.planes.titular = "max";
    const h = crearHogar("titular");
    sumar(h, "yo", "member");
    expect(await inviteHouseholdMemberAction("ana@ejemplo.com")).toMatchObject({
      ok: false,
      message: "Solo el titular o un adulto del hogar puede invitar.",
    });
  });
});

describe("listHouseholdMembers · el cupo que se muestra", () => {
  it("un adult de un hogar Max+ ve el cupo del titular (3), no el suyo (1)", async () => {
    const { listHouseholdMembers } =
      await import("@/modules/personal-profile/services/household-members-service");
    bd.planes.titular = "max";
    const h = crearHogar("titular");
    sumar(h, "yo", "adult", "ninguno");
    expect((await listHouseholdMembers()).quota).toMatchObject({
      limit: 3,
      usedActive: 2,
      remaining: 1,
    });
  });

  it("sin hogar, quien mira ya ocupa su lugar: un Pro+ solo tiene 0 cupos libres", async () => {
    const { listHouseholdMembers } =
      await import("@/modules/personal-profile/services/household-members-service");
    bd.planes.yo = "pro";
    expect((await listHouseholdMembers()).quota).toMatchObject({
      limit: 1,
      usedActive: 1,
      remaining: 0,
    });
  });
});
