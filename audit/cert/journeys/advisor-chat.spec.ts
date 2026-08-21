/**
 * Advisor-chat journey (#6b, IA por UI) — the LIGHTWEIGHT path-check: "el camino del chat anda
 * por la UI". NOT a grounding/honesty test — that was validated against the real model in Fase 8;
 * asserting grounding on a live/flaky chat here would duplicate it and fragilize the harness.
 *
 * Provider: the default config forces the StubProvider, so the reply is a fixed non-empty Spanish
 * string and the round-trip is deterministic. The gate is provider-agnostic (works for stub OR a
 * real key): `POST /api/assistant/chat` returns 200 with a NON-EMPTY reply, and a new assistant
 * bubble renders. The chat NEVER writes a transaction (creation only happens via
 * confirmTransactionAction after confirmation) — so there's no BD gate here.
 *
 * Honest scope note: under the stub the reply is the canned "IA no configurada" text and the
 * tool-calling layer short-circuits (tools do NOT run). Real tool execution + answer quality are
 * covered by Fase 8. This spec certifies that the send→respond→render path works end-to-end.
 */
import { test, expect } from "../fixtures";
import { createCertUser, deleteCertUser } from "../lib/seed";
import { loginWeb, loginMobile } from "../pods/login";

test.use({ storageState: { cookies: [], origins: [] } });

const MESSAGE = "¿Cómo voy con mis finanzas este mes?";

test("chat del asesor: enviar por UI → respuesta 200 no-vacía + burbuja (path-check)", async (
  { page, journey, evidence },
  testInfo,
) => {
  test.setTimeout(180_000);
  const surface = (testInfo.project.metadata as { surface?: string }).surface === "mobile" ? "mobile" : "web";
  const runId = `chat-${testInfo.project.name}-${Date.now()}`;

  const user = await createCertUser(runId, { onboarding: true });
  try {
    if (surface === "mobile") await loginMobile(page, { email: user.email, password: user.password });
    else await loginWeb(page, { email: user.email, password: user.password });

    // ── Send a message and wait for the chat round-trip (provider-agnostic gate) ──
    const { status, reply, bubbleText } = await journey.askAdvisor(MESSAGE);
    await evidence.shot(page, "chat-replied");

    evidence.check("POST /api/assistant/chat respondió 200", status === 200, `status=${status}`);
    expect(status, "el endpoint de chat no respondió 200").toBe(200);

    evidence.check("Respuesta NO vacía", reply.trim().length > 0, `len=${reply.trim().length}`);
    expect(reply.trim().length, "la respuesta del chat vino vacía").toBeGreaterThan(0);

    evidence.check("Burbuja del asistente renderizada", bubbleText.length > 0, `bubbleLen=${bubbleText.length}`);
    expect(bubbleText.length, "no se renderizó una burbuja de respuesta en la UI").toBeGreaterThan(0);
  } finally {
    await deleteCertUser(user.userId);
  }
});
