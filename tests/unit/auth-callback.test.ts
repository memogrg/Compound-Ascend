import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: vi.fn(),
}));

import { createSupabaseServerClient } from "@/lib/supabase/server";
import * as callbackRoute from "@/app/auth/callback/route";

function createRequest(code: string | null, next = "/dashboard") {
  const url = new URL("https://example.com/auth/callback");
  if (code !== null) url.searchParams.set("code", code);
  url.searchParams.set("next", next);
  return new Request(url.toString());
}

describe("auth callback route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deduplicates concurrent callback exchanges for the same code", async () => {
    let resolveExchange: (value: unknown) => void;
    const exchangeDeferred = new Promise((resolve) => {
      resolveExchange = resolve;
    });

    const exchangeCodeForSession = vi.fn(() => exchangeDeferred);
    const mockCreateServerClient = vi.mocked(createSupabaseServerClient);
    mockCreateServerClient.mockReturnValue({
      auth: { exchangeCodeForSession },
    } as any);

    const request = createRequest("abc123", "/dashboard");

    const first = callbackRoute.GET(request);
    await Promise.resolve();
    const second = callbackRoute.GET(request);

    expect(exchangeCodeForSession).toHaveBeenCalledTimes(1);

    resolveExchange!({ error: null });
    const [result1, result2] = await Promise.all([first, second]);

    expect(result1.status).toBe(307);
    expect(result2.status).toBe(307);
    expect(result1.headers.get("location")).toBe("https://example.com/dashboard");
    expect(result2.headers.get("location")).toBe("https://example.com/dashboard");
  });

  it("redirects to the safe next destination when authorization code is already used", async () => {
    const exchangeCodeForSession = vi.fn().mockResolvedValue({
      error: {
        status: 400,
        message: "This authorization code has already been used",
      },
    });
    const mockCreateServerClient = vi.mocked(createSupabaseServerClient);
    mockCreateServerClient.mockReturnValue({
      auth: { exchangeCodeForSession },
    } as any);

    const request = createRequest("used-code", "/dashboard");
    const response = await callbackRoute.GET(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://example.com/dashboard");
  });
});
