import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, describe, expect, it } from "vitest";

import ContactForm from "../../../src/components/contact/ContactForm.astro";
import { CONTACT_LIMITS } from "../../../src/lib/contact/validation";

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
const props = {
  siteKey: "1x00000000000000000000AA",
  endpoint: "/api/contact",
  linkedin: "https://www.linkedin.com/in/zgildo01/",
  github: "https://github.com/zgildo01"
};

describe("contact form", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  it("labels required fields and connects each hint and error to an existing target", async () => {
    const html = await container.renderToString(ContactForm, { props });
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const field of ["name", "email", "message"]) {
      expect(html).toContain(`<label for="contact-${field}">`);
      expect(html).toMatch(
        new RegExp(
          `<(?:input|textarea)\\b[^>]*id="contact-${field}"[^>]*\\brequired(?:\\s|>)`
        )
      );
    }
    for (const [, targets] of html.matchAll(
      /\baria-(?:describedby|labelledby)="([^"]+)"/g
    )) {
      for (const target of targets.split(/\s+/)) expect(ids).toContain(target);
    }
    expect(html).toContain('autocomplete="name"');
    expect(html).toContain('autocomplete="email"');
    expect(html).toContain('type="email"');
    expect(html).toContain(`maxlength="${CONTACT_LIMITS.message}"`);
    expect(html).toContain('role="status" aria-live="polite"');
  });

  it("prevents a native post before enhancement and preserves useful contact links without JavaScript", async () => {
    const html = await container.renderToString(ContactForm, {
      props: { ...props, email: "contact@example.com" }
    });

    expect(html).toMatch(
      /<fieldset\b[^>]*\bdata-contact-fields\b[^>]*\bdisabled(?:\s|>)/
    );
    expect(html).toMatch(
      /<button\b[^>]*\bdata-contact-submit\b[^>]*\bdisabled(?:\s|>)/
    );
    expect(html).toContain("<noscript>");
    expect(html).toContain("JavaScript is needed to send this form.");
    expect(html).toContain('href="mailto:contact@example.com"');
    expect(html).toContain(`href="${props.linkedin}"`);
    expect(html).toContain(`href="${props.github}"`);
  });

  it("keeps verification unavailable honestly when no site key is configured", async () => {
    const html = await container.renderToString(ContactForm, {
      props: { ...props, siteKey: "" }
    });

    expect(html).toContain("The message form is currently unavailable.");
    expect(html).not.toMatch(/\bdata-contact-challenge(?:\s|=|>)/);
    expect(html).not.toContain("mailto:");
    expect(html).toContain(`href="${props.linkedin}"`);
    expect(html).toMatch(
      /<button\b[^>]*\bdata-contact-submit\b[^>]*\bdisabled(?:\s|>)/
    );
    expect(html).not.toContain("Contact experience in progress");
  });

  it("excludes the honeypot from navigation and the accessibility tree", async () => {
    const html = await container.renderToString(ContactForm, { props });

    expect(html).toMatch(
      /<div\b[^>]*\bhidden\b[^>]*aria-hidden="true"[^>]*>\s*<label for="contact-honeypot">[\s\S]*?<input\b[^>]*name="honeypot"[^>]*tabindex="-1"/
    );
    expect(html).not.toContain('name="phone"');
  });

  it("uses the supplied deployment path and escapes public configuration", async () => {
    const html = await container.renderToString(ContactForm, {
      props: {
        ...props,
        endpoint: "/portfolio/api/contact",
        siteKey: '" onfocus="alert(1)'
      }
    });

    expect(html).toContain('action="/portfolio/api/contact"');
    expect(html).toContain('data-site-key="&quot; onfocus=&quot;alert(1)"');
    expect(html).not.toContain('data-site-key="" onfocus=');
  });
});
