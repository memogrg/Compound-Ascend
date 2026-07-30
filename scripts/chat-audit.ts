/**
 * Auditoría en masa del chat (My Agent C+). Corre el banco scripts/chat-audit-preguntas.md contra
 * POST /api/assistant/chat y evalúa cada respuesta con: HEURÍSTICAS (regex, 0 costo) + JUEZ LLM barato
 * (Gemini flash-lite) + ASSERTS de fixture (cifras del motor). Genera un reporte HTML+JSON en
 * scripts/out/ con timestamp (reejecutable, comparable antes/después). NO modifica el chat.
 *
 * Ejecutar (Node 24 corre .ts directo):
 *   node scripts/chat-audit.ts
 * Requiere (env / .env.local):
 *   AUDIT_BASE_URL           URL del server corriendo (default http://localhost:3000)
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   AUDIT_EMAIL + AUDIT_PASSWORD   (usuario de prueba)  — O BIEN  AUDIT_COOKIE (cookie cruda del navegador)
 *   GEMINI_API_KEY           (opcional; sin él corre solo heurísticas, sin juez LLM)
 *   AUDIT_FIXTURE            (opcional; ruta a un JSON con cifras esperadas del motor, ver más abajo)
 *
 * Autenticación: el endpoint lee la sesión por COOKIE (@supabase/ssr). El harness inicia sesión con
 * email/password vía supabase-js y arma la cookie `sb-<ref>-auth-token` (base64url + chunking) que el
 * server espera. Fallback: AUDIT_COOKIE con la cookie que copiás del navegador (DevTools → Application).
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

// ── Env ──
function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim().replace(/^["']|["']$/g, "");
}
// Carga liviana de .env.local (sin dependencia): KEY=VALUE por línea.
try {
  const raw = readFileSync(join(ROOT, ".env.local"), "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]!] === undefined) process.env[m[1]!] = m[2];
  }
} catch {
  /* sin .env.local: se usan las env del proceso */
}

const BASE_URL = env("AUDIT_BASE_URL", "http://localhost:3000").replace(/\/$/, "");
const ORIGIN = new URL(BASE_URL).origin;
const SUPABASE_URL = env("NEXT_PUBLIC_SUPABASE_URL");
const ANON = env("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const GEMINI_KEY = env("GEMINI_API_KEY");
const JUDGE_MODEL = env("AUDIT_JUDGE_MODEL", "gemini-2.5-flash-lite");
const REQ_TIMEOUT_MS = 60_000;
const MAX_SENTENCES = 6; // umbral de "flooding"

// ── Tipos ──
type Category = { name: string; questions: string[] };
type Turn = { message: string; history: { role: "user" | "assistant"; content: string }[] };
type RunItem = {
  id: string;
  category: string;
  question: string;
  turns: Turn[]; // >1 solo en arrastre / repetición
  kind: "single" | "carryover" | "repeat";
};
type ChatResult = {
  reply: string;
  action: unknown | null;
  status: number;
  latencyMs: number;
  error?: string;
};
type Flag = { type: string; detail: string };
type Judge = {
  answered: number;
  concise: number;
  currency_ok: number;
  no_hallucination: number;
  advisor_tone: number;
  fail: boolean;
  reason: string;
} | null;
type Audited = {
  item: RunItem;
  result: ChatResult;
  laneGuess: "determinista" | "llm" | "?";
  flags: Flag[];
  judge: Judge;
  pass: boolean;
};

// ── Fixture (cifras del motor para ASSERTS exactos; opcional) ──
type Fixture = {
  currency: string; // moneda de visualización (símbolo esperado)
  hasSobres: boolean;
  gastoMensual?: number;
  compromisoMensual?: number;
  numeroIndependencia?: number;
  ingresoMensual?: number;
};
function loadFixture(): Fixture | null {
  const path = env("AUDIT_FIXTURE");
  if (!path) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Fixture;
  } catch (e) {
    console.warn("No pude leer el fixture:", (e as Error).message);
    return null;
  }
}

// ── Símbolos de moneda ──
const SYMBOL: Record<string, string> = { CRC: "₡", USD: "$", MXN: "$", COP: "$", ARS: "$", EUR: "€" };

// ── 1) Parseo del banco ──
function parseBank(): Category[] {
  const md = readFileSync(join(ROOT, "chat-audit-preguntas.md"), "utf8").split("Criterios de auditoría")[0]!;
  const cats: Category[] = [];
  let cur: Category | null = null;
  for (const line of md.split(/\r?\n/)) {
    const h = line.match(/^##\s+\d+\.\s+(.+)$/);
    if (h) {
      cur = { name: h[1]!.trim(), questions: [] };
      cats.push(cur);
      continue;
    }
    const b = line.match(/^-\s+(.+)$/);
    if (b && cur) cur.questions.push(b[1]!.trim());
  }
  return cats;
}

/** Convierte una pregunta del banco en un RunItem, detectando arrastre/repetición por su texto. */
function toRunItem(category: string, question: string, idx: number): RunItem {
  const id = `${category.slice(0, 4).toLowerCase()}-${idx}`;
  const noMarks = question.replace(/\s*\((?:probar arrastre|dos preguntas juntas|.*?)\)\s*/gi, " ").trim();
  // Arrastre: la marca "(probar arrastre)" — turno previo de INVERSIÓN + la pregunta actual.
  if (/probar arrastre/i.test(question)) {
    const prev = "¿cómo va mi portafolio?";
    return {
      id,
      category,
      question: noMarks,
      kind: "carryover",
      turns: [{ message: prev, history: [] }, { message: noMarks, history: [{ role: "user", content: prev }] }],
    };
  }
  // Repetición: "repetir la misma pregunta 2 veces" — misma sesión, dos veces, debe dar lo mismo.
  if (/2 veces|dos veces|repetir la misma/i.test(question)) {
    const q = "¿mi número de libertad?";
    return {
      id,
      category,
      question: `${q} (×2)`,
      kind: "repeat",
      turns: [
        { message: q, history: [] },
        { message: q, history: [{ role: "user", content: q }, { role: "assistant", content: "" }] },
      ],
    };
  }
  return { id, category, question: noMarks, kind: "single", turns: [{ message: noMarks, history: [] }] };
}

// ── 2) Autenticación (cookie de sesión @supabase/ssr) ──
async function buildAuth(): Promise<{ cookie: string; who: string }> {
  const raw = env("AUDIT_COOKIE");
  if (raw) return { cookie: raw, who: "cookie cruda (AUDIT_COOKIE)" };
  const email = env("AUDIT_EMAIL");
  const password = env("AUDIT_PASSWORD");
  if (!SUPABASE_URL || !ANON || !email || !password) {
    throw new Error("Falta auth: seteá AUDIT_EMAIL+AUDIT_PASSWORD (y NEXT_PUBLIC_SUPABASE_*), o AUDIT_COOKIE.");
  }
  const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`Login falló: ${error?.message ?? "sin sesión"}`);
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const name = `sb-${ref}-auth-token`;
  // @supabase/ssr 0.12: value = "base64-" + base64url(JSON(session)), chunked a 3180 chars.
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const CHUNK = 3180;
  const pairs: string[] =
    value.length <= CHUNK
      ? [`${name}=${value}`]
      : chunk(value, CHUNK).map((c, i) => `${name}.${i}=${c}`);
  return { cookie: pairs.join("; "), who: `${email} (sesión)` };
}
function chunk(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

// ── 3) Ejecución de un turno contra el endpoint ──
async function callChat(turn: Turn, cookie: string): Promise<ChatResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQ_TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/assistant/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: ORIGIN, Cookie: cookie },
      body: JSON.stringify({ message: turn.message, history: turn.history }),
      signal: controller.signal,
    });
    const latencyMs = Date.now() - t0;
    const text = await res.text();
    let reply = "";
    let action: unknown = null;
    try {
      const j = JSON.parse(text) as { reply?: string; action?: unknown; error?: { message?: string } };
      reply = j.reply ?? j.error?.message ?? "";
      action = j.action ?? null;
    } catch {
      reply = text.slice(0, 400);
    }
    return { reply, action, status: res.status, latencyMs };
  } catch (e) {
    const err = e as Error;
    return { reply: "", action: null, status: 0, latencyMs: Date.now() - t0, error: err.name === "AbortError" ? "timeout" : err.message };
  } finally {
    clearTimeout(timer);
  }
}

// ── 4) Heurísticas (0 costo) ──
const MONEY_Q = /cu[aá]nto|gast|ingres|entra|sobra|libre|presupuest|queda|ahorr|fondo|compromiso|patrimonio|n[uú]mero/i;
const NO_CAPACITY = /\bno (puedo|s[eé]|tengo|pude)\b|no lo (tengo|invento|s[eé])|defin[íi]lo|registr[aá] tu gasto|no tengo acceso/i;
const OWNED_HINT: string[] = []; // se llena con símbolos del fixture si se conocen

function sentenceCount(s: string): number {
  return (s.match(/[.!?…]+(\s|$)/g) ?? []).length || (s.trim() ? 1 : 0);
}

function heuristics(item: RunItem, res: ChatResult, fx: Fixture | null): Flag[] {
  const flags: Flag[] = [];
  const r = res.reply;
  if (res.error) flags.push({ type: "error", detail: res.error });
  if (res.status >= 500) flags.push({ type: "error", detail: `HTTP ${res.status}` });
  if (!r.trim()) return flags;

  const displaySym = fx ? SYMBOL[fx.currency] ?? fx.currency : null;
  // Moneda: símbolo ₡ junto a "USD"/"dólares", o $ junto a "colones/₡"; o símbolo ≠ display.
  if (/[₡]\s?[\d.,]+\s*(usd|d[oó]lares)/i.test(r) || /\$\s?[\d.,]+\s*(crc|colones)/i.test(r)) {
    flags.push({ type: "moneda", detail: "símbolo y código de moneda no coinciden" });
  }
  if (/\(\s*[~≈]\s*[₡$][\d.,]/.test(r) || /equivale/i.test(r)) {
    flags.push({ type: "moneda", detail: "convierte a mano / agrega equivalencia" });
  }
  if (displaySym && new RegExp(`\\$\\s?\\d`).test(r) && displaySym !== "$") {
    flags.push({ type: "moneda", detail: `usa $ pero la moneda de visualización es ${fx!.currency}` });
  }
  // "₡0"/"0" en pregunta de dinero cuando hay sobres.
  if (MONEY_Q.test(item.question) && (!fx || fx.hasSobres) && /(?:^|\s)[₡$]?0(?:[.,]0+)?(?:\s|$|\.)/.test(r) && /gast|presupuest|sobre/i.test(item.question)) {
    flags.push({ type: "cero", detail: "reporta 0 en una pregunta de gasto/presupuesto" });
  }
  // "no puedo/no sé/definilo" en preguntas cuyo dato SÍ existe (datos/acciones).
  if (NO_CAPACITY.test(r) && !/qu[eé] hora|dolar|doge|casino/i.test(item.question)) {
    flags.push({ type: "no_se_con_dato", detail: "dice que no puede/no sabe ante un dato disponible" });
  }
  // Flooding.
  const sc = sentenceCount(r);
  if (sc > MAX_SENTENCES) flags.push({ type: "flooding", detail: `${sc} frases (> ${MAX_SENTENCES})` });
  // Arrastre: en el turno de arrastre, no debe hablar de portafolio/inversión.
  if (item.kind === "carryover" && /portafolio|inversi[oó]n|holding|acci[oó]n|cripto|rendimiento/i.test(r)) {
    flags.push({ type: "arrastre", detail: "trae el tema del turno anterior (inversión)" });
  }
  // Alucinación de moneda no poseída (DOGE) con precio/ATH.
  if (/doge/i.test(item.question) && /[₡$]\s?[\d.,]{2,}|ath|m[aá]ximo/i.test(r) && !NO_CAPACITY.test(r)) {
    flags.push({ type: "alucinacion", detail: "da precio/ATH de una moneda que el usuario no tiene" });
  }
  // Fuera de tema: "qué hora es" no debe inventar finanzas.
  if (/qu[eé] hora/i.test(item.question) && /[₡$]\s?[\d.,]|gast|ahorr|invers/i.test(r)) {
    flags.push({ type: "fuera_tema", detail: "responde con finanzas a una pregunta fuera de tema" });
  }
  void OWNED_HINT;
  return flags;
}

// ── 5) Asserts de fixture + consistencia ──
function firstMoney(s: string): number | null {
  const m = s.match(/[₡$]\s?(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?|\d+)/);
  if (!m) return null;
  const n = Number(m[1]!.replace(/\.(?=\d{3}\b)/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}
function near(a: number, b: number, tolPct = 2): boolean {
  return Math.abs(a - b) <= Math.max(1, (Math.abs(b) * tolPct) / 100);
}
function fixtureAsserts(item: RunItem, res: ChatResult, fx: Fixture): Flag[] {
  const flags: Flag[] = [];
  const q = item.question.toLowerCase();
  const got = firstMoney(res.reply);
  const check = (label: string, expected?: number) => {
    if (expected == null || got == null) return;
    if (!near(got, expected)) flags.push({ type: "cifra", detail: `${label}: chat ${got} ≠ motor ${expected}` });
  };
  if (/gasto (al mes|mensual)|cu[aá]nto gasto/.test(q)) check("gasto mensual", fx.gastoMensual);
  if (/compromiso/.test(q)) check("compromiso", fx.compromisoMensual);
  if (/n[uú]mero de independencia|independiente/.test(q)) check("independencia", fx.numeroIndependencia);
  if (/cu[aá]nto (me )?entra|gano mensual/.test(q)) check("ingreso mensual", fx.ingresoMensual);
  // Consistencia global: compromiso ≈ Independencia × 0,08 ÷ 12.
  if (fx.compromisoMensual && fx.numeroIndependencia) {
    const back = Math.round((fx.numeroIndependencia * 0.08) / 12);
    if (!near(back, fx.compromisoMensual, 3)) {
      flags.push({ type: "inconsistencia", detail: `fixture incoherente: compromiso ${fx.compromisoMensual} vs Ind×0,08/12 ${back}` });
    }
  }
  return flags;
}

// ── 6) Juez LLM (Gemini flash-lite, opcional) ──
async function judge(item: RunItem, res: ChatResult, currency: string): Promise<Judge> {
  if (!GEMINI_KEY || !res.reply.trim()) return null;
  const sys =
    `Sos un auditor de un asistente financiero. Moneda de visualización: ${currency}. Puntuá 1-5 (5=mejor) la RESPUESTA a la PREGUNTA en: ` +
    `answered (respondió lo preguntado), concise (≤5 frases, sin folleto), currency_ok (moneda consistente, sin convertir a mano), ` +
    `no_hallucination (no inventa cifras/precios), advisor_tone (asesor experto, cálido, directo). ` +
    `Devolvé SOLO JSON: {"answered":n,"concise":n,"currency_ok":n,"no_hallucination":n,"advisor_tone":n,"fail":true|false,"reason":"una frase"}. ` +
    `fail=true si hay un error grave (moneda mal, alucinación, "no puedo" con dato, arrastre, no responde).`;
  const body = {
    systemInstruction: { parts: [{ text: sys }] },
    contents: [{ role: "user", parts: [{ text: `PREGUNTA: ${item.question}\nRESPUESTA: ${res.reply}` }] }],
    generationConfig: { temperature: 0, maxOutputTokens: 200, responseMimeType: "application/json" },
  };
  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${JUDGE_MODEL}:generateContent?key=${GEMINI_KEY}`,
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
    );
    const j = (await r.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const txt = j.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    if (!m) return null;
    return JSON.parse(m[0]) as Judge;
  } catch {
    return null;
  }
}

// ── Orquestación ──
function guessLane(res: ChatResult): "determinista" | "llm" | "?" {
  if (res.error || !res.reply) return "?";
  // Heurística: el carril determinista es rápido y su texto sigue plantillas conocidas.
  const templated = /Tu (Número|gasto mensual|sobre de mayor|saldo)|Tenés [\d.,]|Te propongo (crear|registrar)|Vendiendo tus|llegás en ~/i.test(res.reply);
  if (templated && res.latencyMs < 2500) return "determinista";
  return "llm";
}

function isFail(a: { flags: Flag[]; judge: Judge; result: ChatResult }): boolean {
  if (a.result.error || a.result.status >= 500) return true;
  const severe = a.flags.some((f) => ["moneda", "cero", "no_se_con_dato", "alucinacion", "arrastre", "cifra", "fuera_tema", "error"].includes(f.type));
  if (severe) return true;
  if (a.judge?.fail) return true;
  return false;
}

async function main(): Promise<void> {
  console.log(`Auditoría del chat → ${BASE_URL}`);
  const fx = loadFixture();
  if (fx) OWNED_HINT.push(SYMBOL[fx.currency] ?? fx.currency);
  const auth = await buildAuth();
  console.log(`Auth: ${auth.who}`);

  const cats = parseBank();
  const items: RunItem[] = [];
  for (const c of cats) c.questions.forEach((q, i) => items.push(toRunItem(c.name, q, i)));
  console.log(`Banco: ${items.length} preguntas en ${cats.length} categorías.`);

  const audited: Audited[] = [];
  for (const item of items) {
    // Corre los turnos en secuencia (misma "sesión"): la ÚLTIMA respuesta es la que se audita.
    let last: ChatResult = { reply: "", action: null, status: 0, latencyMs: 0 };
    const replies: string[] = [];
    for (const turn of item.turns) {
      last = await callChat(turn, auth.cookie);
      replies.push(last.reply);
    }
    const flags = heuristics(item, last, fx);
    if (fx) flags.push(...fixtureAsserts(item, last, fx));
    // Repetición: la 2ª respuesta debe ser igual a la 1ª.
    if (item.kind === "repeat" && replies.length === 2 && norm(replies[0]!) !== norm(replies[1]!)) {
      flags.push({ type: "inconsistencia", detail: "la misma pregunta 2× dio respuestas distintas" });
    }
    const jd = await judge(item, last, fx?.currency ?? "CRC");
    const laneGuess = guessLane(last);
    const pass = !isFail({ flags, judge: jd, result: last });
    audited.push({ item, result: last, laneGuess, flags, judge: jd, pass });
    process.stdout.write(pass ? "." : "F");
  }
  process.stdout.write("\n");

  writeReport(audited, cats, auth.who);
}
function norm(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// ── Reporte ──
function pctl(xs: number[], p: number): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]!;
}
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function writeReport(rows: Audited[], cats: Category[], who: string): void {
  const outDir = join(HERE, "out");
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const total = rows.length;
  const fails = rows.filter((r) => !r.pass);
  const byType = new Map<string, number>();
  for (const r of rows) for (const f of r.flags) byType.set(f.type, (byType.get(f.type) ?? 0) + 1);
  const lat = rows.map((r) => r.result.latencyMs).filter((x) => x > 0);
  const laneDet = rows.filter((r) => r.laneGuess === "determinista").length;

  // JSON (para comparar corridas).
  writeFileSync(
    join(outDir, `audit-${stamp}.json`),
    JSON.stringify(
      { stamp, base: BASE_URL, who, total, fails: fails.length, byType: Object.fromEntries(byType), rows: rows.map((r) => ({ id: r.item.id, category: r.item.category, question: r.item.question, lane: r.laneGuess, latencyMs: r.result.latencyMs, status: r.result.status, pass: r.pass, flags: r.flags, judge: r.judge, reply: r.result.reply })) },
      null,
      2,
    ),
  );

  const typeRows = [...byType.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => `<tr><td>${esc(t)}</td><td>${n}</td></tr>`).join("");
  const catBlocks = cats
    .map((c) => {
      const rs = rows.filter((r) => r.item.category === c.name);
      if (rs.length === 0) return "";
      const body = rs
        .map((r) => {
          const flags = r.flags.map((f) => `<span class="flag ${f.type}">${esc(f.type)}</span>`).join(" ");
          const j = r.judge ? `${r.judge.answered}/${r.judge.concise}/${r.judge.currency_ok}/${r.judge.no_hallucination}/${r.judge.advisor_tone}` : "—";
          return `<tr class="${r.pass ? "ok" : "bad"}"><td>${esc(r.item.question)}</td><td>${r.laneGuess}</td><td>${r.result.latencyMs}ms</td><td class="reply">${esc(r.result.reply).slice(0, 500)}</td><td>${flags}</td><td>${j}</td><td>${r.pass ? "PASS" : "FAIL"}</td></tr>`;
        })
        .join("");
      const cf = rs.filter((r) => !r.pass).length;
      return `<h2>${esc(c.name)} <small>(${cf}/${rs.length} fail)</small></h2><table class="q"><thead><tr><th>Pregunta</th><th>Carril</th><th>Lat</th><th>Respuesta</th><th>Flags</th><th>Juez a/c/m/h/t</th><th></th></tr></thead><tbody>${body}</tbody></table>`;
    })
    .join("");

  const html = `<!doctype html><meta charset="utf8"><title>Auditoría chat ${stamp}</title><style>
    body{font:14px/1.5 system-ui,sans-serif;margin:24px;color:#111;background:#fafafa}
    h1{margin:0} .sub{color:#666;margin:4px 0 20px}
    .cards{display:flex;gap:12px;flex-wrap:wrap;margin-bottom:20px}
    .card{background:#fff;border:1px solid #e5e5e5;border-radius:10px;padding:12px 16px;min-width:120px}
    .card b{font-size:22px;display:block} .bad b{color:#c0392b} .ok b{color:#1e8449}
    table{border-collapse:collapse;width:100%;background:#fff;margin:8px 0 24px} th,td{border:1px solid #eee;padding:6px 8px;text-align:left;vertical-align:top}
    th{background:#f3f3f3} table.q td.reply{max-width:520px;font-size:12.5px;color:#333} tr.bad td:last-child{color:#c0392b;font-weight:600} tr.ok td:last-child{color:#1e8449}
    .flag{display:inline-block;background:#eee;border-radius:6px;padding:1px 6px;font-size:11px;margin:1px}
    .flag.moneda,.flag.cero,.flag.alucinacion,.flag.arrastre,.flag.cifra,.flag.no_se_con_dato,.flag.error,.flag.fuera_tema{background:#fdecea;color:#c0392b}
    .flag.flooding,.flag.inconsistencia{background:#fef5e7;color:#b9770e}
    small{color:#888;font-weight:400}
  </style>
  <h1>Auditoría del chat — My Agent C+</h1>
  <div class="sub">${stamp} · ${esc(BASE_URL)} · ${esc(who)} · ${GEMINI_KEY ? "con juez LLM" : "solo heurísticas"}</div>
  <div class="cards">
    <div class="card"><b>${total}</b>preguntas</div>
    <div class="card ${fails.length ? "bad" : "ok"}"><b>${fails.length}</b>FAIL (${Math.round((fails.length / total) * 100)}%)</div>
    <div class="card"><b>${laneDet}</b>determinista</div>
    <div class="card"><b>${pctl(lat, 50)}ms</b>latencia p50</div>
    <div class="card"><b>${pctl(lat, 95)}ms</b>latencia p95</div>
  </div>
  <h2>Fallas por tipo</h2><table><thead><tr><th>Tipo</th><th>#</th></tr></thead><tbody>${typeRows || "<tr><td colspan=2>—</td></tr>"}</tbody></table>
  ${catBlocks}`;
  const htmlPath = join(outDir, `audit-${stamp}.html`);
  writeFileSync(htmlPath, html);

  console.log(`\n${fails.length}/${total} FAIL (${Math.round((fails.length / total) * 100)}%). Fallas por tipo:`);
  for (const [t, n] of [...byType.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${t}: ${n}`);
  console.log(`Latencia p50 ${pctl(lat, 50)}ms · p95 ${pctl(lat, 95)}ms`);
  console.log(`Reporte: ${htmlPath}`);
}

main().catch((e) => {
  console.error("Harness falló:", (e as Error).message);
  process.exit(1);
});
