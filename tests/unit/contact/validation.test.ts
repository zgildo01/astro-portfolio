import { describe, expect, it } from "vitest";

import {
  CONTACT_LIMITS,
  isContactEmail,
  validateContactFields,
  validateContactSubmission
} from "../../../src/lib/contact/validation";

const FIELDS = {
  name: "Ada Lovelace",
  email: "ada@example.test",
  message: "I would like to discuss a platform engineering opportunity."
};
const SUBMISSION = { ...FIELDS, honeypot: "", turnstileToken: "valid-token" };

describe("contact field validation", () => {
  it("normalizes surrounding whitespace while retaining multiline prose", () => {
    expect(
      validateContactFields({
        name: "  Ada Lovelace  ",
        email: " ada@example.test ",
        message: "\nHello there.\n\nA second paragraph.\n"
      })
    ).toEqual({
      ok: true,
      value: {
        name: "Ada Lovelace",
        email: "ada@example.test",
        message: "Hello there.\n\nA second paragraph."
      }
    });
  });

  it("accepts names and messages in languages other than English", () => {
    expect(
      validateContactFields({
        ...FIELDS,
        name: "Žofie Nováková",
        message: "Ráda bych probrala spolupráci na platformě."
      }).ok
    ).toBe(true);
  });

  it.each([undefined, null, true, [], "not an object", {}])(
    "rejects missing or non-object fields: %j",
    (input) => {
      const result = validateContactFields(input);
      expect(result.ok).toBe(false);
      if (!result.ok)
        expect(Object.keys(result.errors).sort()).toEqual([
          "email",
          "message",
          "name"
        ]);
    }
  );

  it.each([
    ["name", ""],
    ["name", "   "],
    ["name", "x".repeat(CONTACT_LIMITS.name + 1)],
    ["email", "invalid"],
    ["email", "first@example.test,second@example.test"],
    ["email", "visitor@example.test\r\nBcc: hidden@example.test"],
    ["message", "short"],
    ["message", "x".repeat(CONTACT_LIMITS.message + 1)],
    ["name", "Ada\u0000Lovelace"],
    ["message", "A message with\u0000a hidden control character"],
    ["name", 123],
    ["email", ["ada@example.test"]],
    ["message", { content: "text" }]
  ])("reports the invalid %s field", (field, value) => {
    const result = validateContactFields({ ...FIELDS, [String(field)]: value });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveProperty(String(field));
  });

  it("accepts exact character limits and preserves tabs/newlines in messages", () => {
    expect(
      validateContactFields({
        ...FIELDS,
        name: "x".repeat(CONTACT_LIMITS.name),
        message: "x".repeat(CONTACT_LIMITS.message)
      }).ok
    ).toBe(true);
    expect(
      validateContactFields({
        ...FIELDS,
        message: "First line.\n\tSecond line."
      }).ok
    ).toBe(true);
    expect(
      validateContactFields({
        ...FIELDS,
        message: "x".repeat(CONTACT_LIMITS.messageMin)
      }).ok
    ).toBe(true);
  });

  it.each(["ada@example.test", "ada+portfolio@sub.example.test"])(
    "accepts a single mailbox: %s",
    (email) => {
      expect(isContactEmail(email)).toBe(true);
    }
  );

  it.each([
    "Ada <ada@example.test>",
    "one@example.test;two@example.test",
    "bad@address",
    "a\u0000b@example.test",
    `${"x".repeat(250)}@example.test`,
    "visitor@example.test\nInjected: header"
  ])("rejects an invalid or unsafe mailbox: %s", (email) => {
    expect(isContactEmail(email)).toBe(false);
  });
});

describe("contact submission validation", () => {
  it("requires a token on the server while field-only validation works before verification", () => {
    expect(validateContactFields(FIELDS).ok).toBe(true);
    const result = validateContactSubmission(FIELDS);
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.turnstileToken).toEqual(expect.any(String));
  });

  it("returns only the expected normalized fields", () => {
    expect(
      validateContactSubmission({ ...SUBMISSION, arbitrary: "ignored" })
    ).toEqual({ ok: true, value: SUBMISSION });
  });

  it.each([
    "",
    " ",
    "invalid token",
    "token\u0000value",
    "x".repeat(CONTACT_LIMITS.turnstileToken + 1),
    null,
    true
  ])("rejects an invalid verification token: %j", (turnstileToken) => {
    const result = validateContactSubmission({ ...SUBMISSION, turnstileToken });
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors.turnstileToken).toEqual(expect.any(String));
  });

  it("retains a filled honeypot so the handler can suppress delivery", () => {
    expect(
      validateContactSubmission({ ...SUBMISSION, honeypot: " bot value " })
    ).toEqual({ ok: true, value: { ...SUBMISSION, honeypot: "bot value" } });
  });
});
