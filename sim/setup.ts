/**
 * Vitest setup for the simulation runner. Runs BEFORE any Supabase client is
 * created, and does two things:
 *
 *  1. WebSocket polyfill. `@supabase/supabase-js` constructs a realtime client
 *     that needs a global `WebSocket`; Node 20 has none, so `ws` provides it.
 *     This is the error surfaced by `tests/rls` on Node 20. `??=` keeps the
 *     native global when a newer Node already has one.
 *  2. Prod guardrail. Point the plain Supabase env at the TEST project too, so
 *     even an accidental non-`ctx` client creation can never reach production.
 */
import { WebSocket as WsWebSocket } from "ws";

const globalWithWs = globalThis as unknown as { WebSocket?: unknown };
globalWithWs.WebSocket ??= WsWebSocket;

const testUrl = process.env.SUPABASE_TEST_URL;
const testAnon = process.env.SUPABASE_TEST_ANON_KEY;
const testService = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
if (testUrl && testAnon && testService) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = testUrl;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = testAnon;
  process.env.SUPABASE_SERVICE_ROLE_KEY = testService;
}
