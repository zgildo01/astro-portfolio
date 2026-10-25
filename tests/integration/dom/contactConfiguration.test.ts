import { afterEach, describe, expect, it, vi } from "vitest";

async function configuration(siteKey = "", email = "") {
  vi.resetModules();
  vi.stubEnv("PUBLIC_TURNSTILE_SITE_KEY", siteKey);
  vi.stubEnv("PUBLIC_CONTACT_EMAIL", email);
  return (await import("../../../src/config/contact")).contactConfig;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("public contact configuration boundaries", () => {
  it("does not enable a widget when the public build value is absent", async () => {
    expect((await configuration()).turnstileSiteKey).toBe("");
  });

  it("normalizes surrounding whitespace in the supplied public widget identity", async () => {
    expect(
      (await configuration("  synthetic-public-widget  ")).turnstileSiteKey
    ).toBe("synthetic-public-widget");
  });

  it("keeps a deliberately absent public address absent", async () => {
    expect((await configuration()).email).toBeUndefined();
  });

  it("accepts and trims an explicitly public single mailbox", async () => {
    expect((await configuration("", "  public@example.test  ")).email).toBe(
      "public@example.test"
    );
  });

  it.each([
    "not a mailbox",
    "mailto:public@example.test",
    "first@example.test,second@example.test",
    "public@example.test\r\nBcc: hidden@example.test",
    "javascript:alert(1)",
    "Public Person <public@example.test>",
    "<script>alert(1)</script>@example.test"
  ])(
    "does not create an unsafe public fallback link from %s",
    async (email) => {
      expect((await configuration("", email)).email).toBeUndefined();
    }
  );

  it("never uses private provider settings as a public widget key or address", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "private-widget-secret");
    vi.stubEnv("RESEND_API_KEY", "private-sending-secret");
    vi.stubEnv("CONTACT_TO_EMAIL", "private-inbox@example.test");
    vi.stubEnv("CONTACT_FROM_EMAIL", "private-sender@example.test");
    const config = await configuration();
    expect(config.turnstileSiteKey).toBe("");
    expect(config.email).toBeUndefined();
    expect(JSON.stringify(config)).not.toMatch(/private-/);
    expect(config.linkedin).toMatch(/^https:\/\//);
    expect(config.github).toMatch(/^https:\/\//);
  });
});
