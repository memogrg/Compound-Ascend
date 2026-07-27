import { describe, it, expect } from "vitest";
import { cronAuthorized } from "@/lib/security/cron-auth";

describe("cronAuthorized · auth del cron por CRON_SECRET", () => {
  const SECRET = "s3cr3t";

  it("autoriza con X-Cron-Secret o Authorization: Bearer correctos", () => {
    expect(cronAuthorized({ xCronSecret: SECRET }, SECRET)).toBe(true);
    expect(cronAuthorized({ authorization: `Bearer ${SECRET}` }, SECRET)).toBe(true);
  });

  it("rechaza secreto equivocado o header ausente", () => {
    expect(cronAuthorized({ xCronSecret: "malo" }, SECRET)).toBe(false);
    expect(cronAuthorized({ authorization: "Bearer malo" }, SECRET)).toBe(false);
    expect(cronAuthorized({}, SECRET)).toBe(false);
    expect(cronAuthorized({ authorization: SECRET }, SECRET)).toBe(false); // sin "Bearer "
  });

  it("sin CRON_SECRET configurado NUNCA autoriza (aunque manden algo)", () => {
    expect(cronAuthorized({ xCronSecret: "loquesea" }, undefined)).toBe(false);
    expect(cronAuthorized({ authorization: "Bearer loquesea" }, null)).toBe(false);
    expect(cronAuthorized({ xCronSecret: "" }, "")).toBe(false);
  });
});
