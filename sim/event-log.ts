/**
 * Structured decision/event/check journal for a simulation run. The runner
 * records each phase, setup write, event and invariant check; the test prints
 * the formatted journal so a failure is legible without a debugger.
 */
export type LogKind = "info" | "phase" | "setup" | "event" | "check";

export interface LogEntry {
  seq: number;
  /** Virtual day offset (null for non-clocked plumbing / info lines). */
  day: number | null;
  kind: LogKind;
  label: string;
  detail?: Record<string, unknown>;
}

export interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

export class EventLog {
  private seq = 0;
  readonly entries: LogEntry[] = [];
  readonly checks: CheckResult[] = [];

  record(
    kind: LogKind,
    label: string,
    day: number | null = null,
    detail?: Record<string, unknown>,
  ): void {
    this.entries.push({ seq: this.seq++, day, kind, label, ...(detail ? { detail } : {}) });
  }

  check(result: CheckResult): void {
    this.checks.push(result);
    this.record("check", `${result.ok ? "PASS" : "FAIL"} · ${result.name}`, null, {
      ok: result.ok,
      info: result.detail,
    });
  }

  get failures(): CheckResult[] {
    return this.checks.filter((c) => !c.ok);
  }

  /** Human-readable dump for the test output / debugging. */
  format(): string {
    const lines = this.entries.map((e) => {
      const day = e.day === null ? "-" : `d${e.day}`;
      const detail = e.detail ? ` ${JSON.stringify(e.detail)}` : "";
      return `#${String(e.seq).padStart(2, "0")} [${day}] ${e.kind.toUpperCase().padEnd(5)} ${e.label}${detail}`;
    });
    const passed = this.checks.length - this.failures.length;
    lines.push(`— checks: ${passed}/${this.checks.length} PASS, ${this.failures.length} FAIL —`);
    return lines.join("\n");
  }
}
