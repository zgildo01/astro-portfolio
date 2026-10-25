import { isContactEmail } from "../lib/contact/validation";

const email = import.meta.env.PUBLIC_CONTACT_EMAIL?.trim();

export const contactConfig = {
  turnstileSiteKey: import.meta.env.PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "",
  email: email && isContactEmail(email) ? email : undefined,
  linkedin: "https://www.linkedin.com/in/zgildo01/",
  github: "https://github.com/zgildo01"
} as const;
