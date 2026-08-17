/**
 * Shared run context, written by the setup project and read by the journeys and the
 * cleanup project (cross-process, so it lives on disk, not in memory). Also owns the
 * canonical paths for auth state and evidence — both under audit/ and gitignored.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./env";

export const AUTH_DIR = join(REPO_ROOT, "audit", ".auth");
export const EVIDENCE_ROOT = join(REPO_ROOT, "audit", "evidence");

export const WEB_STORAGE = join(AUTH_DIR, "web.json");
export const MOBILE_STORAGE = join(AUTH_DIR, "mobile.json");
const CONTEXT_FILE = join(AUTH_DIR, "context.json");

export interface CertContext {
  runId: string;
  userId: string;
  email: string;
  password: string;
  householdId: string | null;
  /** Supabase project refs, for the "browser talked to TEST" cookie assertion. */
  testRef: string;
  prodRef: string;
}

export function ensureDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
}

export function writeContext(ctx: CertContext): void {
  ensureDir(AUTH_DIR);
  writeFileSync(CONTEXT_FILE, JSON.stringify(ctx, null, 2), "utf8");
}

export function readContext(): CertContext {
  if (!existsSync(CONTEXT_FILE)) {
    throw new Error(`[cert] Falta ${CONTEXT_FILE}. ¿Corrió el proyecto "setup"?`);
  }
  return JSON.parse(readFileSync(CONTEXT_FILE, "utf8")) as CertContext;
}

/** Per-run evidence dir: audit/evidence/<runId>/. */
export function runDir(runId: string): string {
  return join(EVIDENCE_ROOT, runId);
}
