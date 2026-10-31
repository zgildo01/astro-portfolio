/* global document, window, getComputedStyle */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { chromium } from "playwright";

const origin = new URL(process.env.PORTFOLIO_AUDIT_URL);
assert(
  ["http:", "https:"].includes(origin.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
    !origin.username &&
    !origin.password,
  "Security checks require an isolated local Worker origin."
);
const routes = JSON.parse(process.env.PORTFOLIO_AUDIT_PATHS ?? '["/"]');
assert(
  Array.isArray(routes) && routes.length > 0 && typeof routes[0] === "string",
  "Security checks need a homepage route."
);
const address = new URL(routes[0], origin);
assert.equal(address.origin, origin.origin, "Security checks must stay local.");
const output = process.env.PORTFOLIO_AUDIT_OUTPUT_DIR;
const scriptProbe = "window.__portfolioUntrustedScriptExecuted = true;";
const styleProbe =
  "#portfolio-security-style-probe { border-top: 13px solid rgb(1, 2, 3) !important; }";
const probeHashes = [scriptProbe, styleProbe].map(
  (source) => `sha256-${createHash("sha256").update(source).digest("base64")}`
);
const messages = [];
const pageErrors = [];
const unexpectedRequests = [];
const checks = [];
let browser;
let violations = [];
let expectedConsoleCount = 0;
let passed = false;
let failure;

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.origin !== origin.origin ||
      !["GET", "HEAD"].includes(request.method())
    ) {
      unexpectedRequests.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()))
      messages.push({ level: message.type(), text: message.text() });
  });
  await page.addInitScript(() => {
    window.localStorage.setItem("portfolio-experience-mode", "immersive");
    window.__portfolioUntrustedScriptExecuted = false;
    window.__portfolioSecurityViolations = [];
    document.addEventListener("securitypolicyviolation", (event) => {
      window.__portfolioSecurityViolations.push({
        effectiveDirective: event.effectiveDirective,
        blockedURI: event.blockedURI,
        disposition: event.disposition
      });
    });
  });
  const response = await page.goto(address.href, { waitUntil: "networkidle" });
  assert.equal(response.status(), 200, "The security-check homepage failed.");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => document.querySelector("[data-scenery-control]")?.hidden === false
  );
  const ordinary = await page.evaluate(() => ({
    stylesheets: document.styleSheets.length,
    bodyDisplay: getComputedStyle(document.body).display,
    violations: window.__portfolioSecurityViolations
  }));
  assert(ordinary.stylesheets > 0, "Application stylesheets did not load.");
  assert.equal(
    ordinary.bodyDisplay,
    "flex",
    "The application layout CSS failed."
  );
  assert.deepEqual(
    ordinary.violations,
    [],
    "Ordinary page resources violate CSP."
  );
  assert.deepEqual(
    messages,
    [],
    "Ordinary page console warnings/errors occurred."
  );
  checks.push(
    "Application scripts and styles work under the production policy"
  );

  const baseline = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.id = "portfolio-security-style-probe";
    document.body.append(probe);
    return getComputedStyle(probe).borderTopWidth;
  });
  await page.evaluate(
    ({ scriptProbe, styleProbe }) => {
      const script = document.createElement("script");
      script.textContent = scriptProbe;
      document.body.append(script);
      const style = document.createElement("style");
      style.textContent = styleProbe;
      document.head.append(style);
    },
    { scriptProbe, styleProbe }
  );
  await page.waitForFunction(
    () => window.__portfolioSecurityViolations.length >= 2
  );
  const result = await page.evaluate(() => ({
    scriptExecuted: window.__portfolioUntrustedScriptExecuted,
    border: getComputedStyle(
      document.getElementById("portfolio-security-style-probe")
    ).borderTopWidth,
    violations: window.__portfolioSecurityViolations
  }));
  violations = result.violations;
  assert.equal(
    result.scriptExecuted,
    false,
    "Untrusted inline JavaScript ran."
  );
  assert.equal(
    result.border,
    baseline,
    "An untrusted inline style element applied."
  );
  assert.deepEqual(
    violations.map((entry) => entry.effectiveDirective).sort(),
    ["script-src-elem", "style-src-elem"],
    "Expected exactly the two deliberately provoked policy violations."
  );
  for (const violation of violations) {
    assert.equal(violation.blockedURI, "inline");
    assert.equal(violation.disposition, "enforce");
  }
  checks.push("Untrusted inline JavaScript is blocked");
  checks.push("Untrusted inline style elements are blocked");

  // Chromium reports the precise rejected hash. Only the two intentional
  // violations are expected; unrelated console errors must still fail.
  const expected = messages.filter(
    (message) =>
      message.level === "error" &&
      /content security policy/i.test(message.text) &&
      probeHashes.some((hash) => message.text.includes(hash))
  );
  expectedConsoleCount = expected.length;
  assert.equal(expectedConsoleCount, 2, "Intentional CSP diagnostics changed.");
  assert.deepEqual(
    messages.filter((message) => !expected.includes(message)),
    [],
    "Unexpected browser console warnings/errors occurred."
  );
  assert.deepEqual(pageErrors, [], "Browser runtime exceptions occurred.");
  assert.deepEqual(
    unexpectedRequests,
    [],
    "Unexpected network request attempted."
  );
  checks.push("No unrelated console errors or external/POST requests occur");
  passed = true;
  process.stdout.write(
    "Browser security checks passed: application resources work; untrusted inline script/style execution is blocked.\n"
  );
} catch (error) {
  failure = error.message;
  throw error;
} finally {
  await browser?.close();
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "security.json"),
      JSON.stringify(
        {
          passed,
          route: address.pathname,
          checks,
          violations,
          expectedConsoleCount,
          pageErrors,
          unexpectedRequests,
          failure
        },
        null,
        2
      ) + "\n"
    );
  }
}
