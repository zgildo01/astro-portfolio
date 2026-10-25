export const CONTACT_LIMITS = {
  name: 100,
  email: 254,
  message: 5000,
  messageMin: 10,
  turnstileToken: 2048,
  bodyBytes: 32768
} as const;

export interface ContactFields {
  name: string;
  email: string;
  message: string;
}

export interface ContactSubmission extends ContactFields {
  honeypot: string;
  turnstileToken: string;
}

export type ContactField = keyof ContactFields | "turnstileToken";
export type ContactFieldErrors = Partial<Record<ContactField, string>>;
export type ContactResponse =
  | { ok: true; message: string }
  | { ok: false; message: string; errors?: ContactFieldErrors };

type ValidationResult<T> =
  { ok: true; value: T } | { ok: false; errors: ContactFieldErrors };

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

// A single mailbox only; keep control characters out of email headers.
export function isContactEmail(value: string): boolean {
  return (
    value.length <= CONTACT_LIMITS.email &&
    !/\p{Cc}/u.test(value) &&
    /^[^\s@<>(),;:\\"]+@[^\s@<>(),;:\\"]+\.[^\s@<>(),;:\\"]+$/.test(value)
  );
}

export function validateContactFields(
  input: unknown
): ValidationResult<ContactFields> {
  const fields = isRecord(input) ? input : {};
  const value = {
    name: text(fields.name),
    email: text(fields.email),
    message: text(fields.message)
  };
  const errors: ContactFieldErrors = {};

  if (
    !value.name ||
    value.name.length > CONTACT_LIMITS.name ||
    /\p{Cc}/u.test(value.name)
  ) {
    errors.name = `Enter your name using ${CONTACT_LIMITS.name} characters or fewer.`;
  }
  if (!isContactEmail(value.email)) {
    errors.email = "Enter a valid email address.";
  }
  if (
    value.message.length < CONTACT_LIMITS.messageMin ||
    value.message.length > CONTACT_LIMITS.message ||
    /\p{Cc}/u.test(value.message.replace(/[\t\n\r]/g, ""))
  ) {
    errors.message = `Enter a message between ${CONTACT_LIMITS.messageMin} and ${CONTACT_LIMITS.message} characters.`;
  }

  return Object.keys(errors).length
    ? { ok: false, errors }
    : { ok: true, value };
}

export function validateContactSubmission(
  input: unknown
): ValidationResult<ContactSubmission> {
  const fields = isRecord(input) ? input : {};
  const result = validateContactFields(input);
  const errors: ContactFieldErrors = result.ok ? {} : { ...result.errors };
  const turnstileToken = text(fields.turnstileToken);

  if (fields.honeypot !== undefined && typeof fields.honeypot !== "string") {
    errors.message = "Please send your message using the contact form.";
  }

  if (
    !turnstileToken ||
    turnstileToken.length > CONTACT_LIMITS.turnstileToken ||
    /\s|\p{Cc}/u.test(turnstileToken)
  ) {
    errors.turnstileToken = "Complete the verification before sending.";
  }

  if (Object.keys(errors).length || !result.ok) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      ...result.value,
      honeypot: text(fields.honeypot),
      turnstileToken
    }
  };
}
