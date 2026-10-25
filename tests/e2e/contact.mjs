/* global document, window, fetch */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { clearTimeout, setTimeout } from "node:timers";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const portProbe = createServer();
portProbe.listen(0, "127.0.0.1");
await once(portProbe, "listening");
const port = portProbe.address().port;
await new Promise((resolve) => portProbe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    "node_modules/astro/bin/astro.mjs",
    "dev",
    "--ignore-lock",
    "--host",
    "127.0.0.1",
    "--port",
    String(port)
  ],
  {
    cwd: root,
    env: {
      ...process.env,
      ASTRO_DEV_BACKGROUND: "false",
      PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
      PUBLIC_CONTACT_EMAIL: "",
      PORTFOLIO_BASE_PATH: "/"
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);
let serverOutput = "";
for (const stream of [server.stdout, server.stderr]) {
  stream.on("data", (chunk) => {
    serverOutput = (serverOutput + chunk.toString()).slice(-6000);
  });
}

const widgetAdapter = `
window.__contactTest = {
  options: undefined,
  resets: 0,
  solve() { this.options.callback("browser-test-token"); }
};
window.turnstile = {
  ready(callback) {
    const script = document.querySelector('script[src^="https://challenges.cloudflare.com/turnstile/v0/api.js"]');
    if (script && (script.async || script.defer)) {
      throw new Error("Turnstile ready() does not support an async/defer script.");
    }
    callback();
  },
  render(container, options) {
    window.__contactTest.options = options;
    const widget = document.createElement("div");
    widget.style.width = options.size === "compact" ? "150px" : "300px";
    widget.style.height = options.size === "compact" ? "140px" : "65px";
    widget.style.minWidth = widget.style.width;
    widget.setAttribute("aria-label", "Verification test adapter");
    widget.textContent = "Verification test adapter";
    container.replaceChildren(widget);
    queueMicrotask(() => window.__contactTest.solve());
    return "browser-test-widget";
  },
  reset() {
    window.__contactTest.resets++;
    queueMicrotask(() => window.__contactTest.solve());
  }
};`;

let browser;
let checks = 0;
async function check(label, test) {
  await test();
  checks++;
  process.stdout.write(`PASS ${label}\n`);
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null)
      throw new Error("Contact test server exited.");
    try {
      const response = await fetch(`${origin}/contact`);
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      // The development server may still be starting.
    }
    await delay(200);
  }
  assert(ready, "Contact test server did not become ready.");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  await context.route(
    "https://challenges.cloudflare.com/turnstile/v0/api.js*",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: widgetAdapter
      })
  );
  const page = await context.newPage();
  const browserErrors = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  const requests = [];
  let mode = "success";
  let releaseRequest;
  await page.route("**/api/contact", async (route) => {
    requests.push(route.request().postDataJSON());
    if (mode === "pending") {
      await new Promise((resolve) => {
        releaseRequest = resolve;
      });
    }
    if (mode === "network") return route.abort("failed");
    const status =
      mode === "validation" ? 422 : mode === "unavailable" ? 503 : 200;
    const body =
      mode === "validation"
        ? {
            ok: false,
            message: "Please check your email.",
            errors: { email: "Enter a valid email address." }
          }
        : mode === "unavailable"
          ? {
              ok: false,
              message:
                "Your message could not be sent. Please try again later or use the contact links on this page."
            }
          : { ok: true, message: "Your message has been sent." };
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(body)
    });
  });

  const submit = page.locator("[data-contact-submit]");
  const summary = page.locator("#contact-errors");
  const status = page.locator("[data-contact-status]");
  async function load() {
    await page.goto(`${origin}/contact`);
    await submit.waitFor();
    await page.waitForFunction(
      () => !document.querySelector("[data-contact-submit]").disabled
    );
  }
  async function fill() {
    await page.locator("#contact-name").fill("Browser Test");
    await page.locator("#contact-email").fill("browser@example.com");
    await page
      .locator("#contact-message")
      .fill("A professional inquiry from the browser test adapter.");
  }

  await check(
    "keyboard validation focuses a linked error summary without sending",
    async () => {
      await load();
      await submit.focus();
      await page.keyboard.press("Enter");
      await summary.waitFor({ state: "visible" });
      assert.equal(
        await summary.evaluate((el) => el === document.activeElement),
        true
      );
      assert.equal(await page.locator('[aria-invalid="true"]').count(), 3);
      await page.locator('#contact-errors a[href="#contact-email"]').click();
      assert.equal(
        await page
          .locator("#contact-email")
          .evaluate((el) => el === document.activeElement),
        true
      );
      assert.equal(requests.length, 0);
    }
  );

  await check(
    "successful delivery clears the form and resets its single-use token",
    async () => {
      await fill();
      await submit.click();
      await page.waitForFunction(
        () =>
          document.querySelector("[data-contact-status]").dataset.state ===
          "success"
      );
      assert.equal(await page.locator("#contact-message").inputValue(), "");
      assert.equal(
        await status.evaluate((el) => el === document.activeElement),
        true
      );
      assert.equal(requests.length, 1);
      assert.equal(requests[0].honeypot, "");
      assert.equal(requests[0].turnstileToken, "browser-test-token");
      assert.equal(await page.evaluate(() => window.__contactTest.resets), 1);
    }
  );

  for (const failure of ["validation", "unavailable", "network"]) {
    await check(
      `${failure} failure preserves the draft and permits a deliberate retry`,
      async () => {
        await load();
        await fill();
        mode = failure;
        await submit.click();
        await summary.waitFor({ state: "visible" });
        await page.waitForFunction(
          () => !document.querySelector("[data-contact-submit]").disabled
        );
        assert.match(
          await page.locator("#contact-message").inputValue(),
          /professional inquiry/
        );
        assert.equal(await status.getAttribute("data-state"), "error");
        assert.equal(
          await summary.evaluate((el) => el === document.activeElement),
          true
        );
        if (failure === "validation") {
          assert.equal(
            await page.locator("#contact-email").getAttribute("aria-invalid"),
            "true"
          );
        }
        mode = "success";
        await submit.click();
        await page.waitForFunction(
          () =>
            document.querySelector("[data-contact-status]").dataset.state ===
            "success"
        );
      }
    );
  }

  await check("pending submission blocks duplicate requests", async () => {
    await load();
    await fill();
    const before = requests.length;
    mode = "pending";
    await page.locator("form[data-contact-form]").evaluate((form) => {
      form.requestSubmit();
      form.requestSubmit();
    });
    await page.waitForFunction(
      () =>
        document
          .querySelector("form[data-contact-form]")
          .getAttribute("aria-busy") === "true"
    );
    for (let attempt = 0; !releaseRequest && attempt < 50; attempt++)
      await delay(20);
    assert.equal(requests.length, before + 1);
    assert.equal(await submit.isDisabled(), true);
    assert.equal(await page.locator("#contact-message").isDisabled(), true);
    mode = "success";
    releaseRequest();
    await page.waitForFunction(
      () =>
        document.querySelector("[data-contact-status]").dataset.state ===
        "success"
    );
  });

  await check(
    "expired verification disables sending and recovers using the keyboard",
    async () => {
      await load();
      await page.evaluate(() =>
        window.__contactTest.options["expired-callback"]()
      );
      assert.equal(await submit.isDisabled(), true);
      const retry = page.locator("[data-contact-retry]");
      await retry.focus();
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => !document.querySelector("[data-contact-submit]").disabled
      );
      assert.equal(await retry.isVisible(), false);
    }
  );

  await check(
    "verification script failure retains working contact alternatives",
    async () => {
      const blocked = await context.newPage();
      await blocked.route(
        "https://challenges.cloudflare.com/turnstile/v0/api.js*",
        (route) => route.abort("failed")
      );
      await blocked.goto(`${origin}/contact`);
      await blocked
        .locator("[data-contact-retry]")
        .waitFor({ state: "visible" });
      assert.equal(
        await blocked.locator("[data-contact-submit]").isDisabled(),
        true
      );
      assert.equal(
        await blocked
          .getByRole("link", { name: "Connect on LinkedIn" })
          .isVisible(),
        true
      );
      await blocked.close();
    }
  );

  await check(
    "responsive layout retains labels, visible controls, and no horizontal overflow",
    async () => {
      await load();
      for (const width of [320, 390, 511, 600, 767, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1
          ),
          true,
          `Overflow at ${width}px`
        );
        assert.equal(
          await page.getByLabel("Name (required)", { exact: true }).isVisible(),
          true
        );
        assert.equal(await page.locator("main").count(), 1);
        assert.equal(
          await page.evaluate(() => document.querySelectorAll("h1").length),
          1
        );
        assert.equal(await page.locator("main[tabindex]").count(), 0);
      }
      if (process.env.CONTACT_SCREENSHOT_DIR) {
        await mkdir(process.env.CONTACT_SCREENSHOT_DIR, { recursive: true });
        for (const width of [390, 1440]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.screenshot({
            path: path.join(
              process.env.CONTACT_SCREENSHOT_DIR,
              `contact-${width}.png`
            ),
            fullPage: true
          });
        }
      }
    }
  );

  await check(
    "without JavaScript the form stays disabled and LinkedIn remains usable",
    async () => {
      const noScript = await browser.newContext({ javaScriptEnabled: false });
      const fallback = await noScript.newPage();
      await fallback.goto(`${origin}/contact`);
      assert.equal(
        await fallback.locator("[data-contact-submit]").isDisabled(),
        true
      );
      assert.equal(
        await fallback.locator("#contact-message").isDisabled(),
        true
      );
      assert.equal(
        await fallback
          .getByRole("link", { name: "Connect on LinkedIn" })
          .isVisible(),
        true
      );
      assert.match(
        await fallback.locator("noscript").innerText(),
        /JavaScript is needed/
      );
      await noScript.close();
    }
  );
  assert.deepEqual(browserErrors, [], "Browser runtime errors were reported.");
  process.stdout.write(
    `Contact browser verification: ${checks} checks passed; providers were mocked, no email was sent.\n`
  );
} catch (error) {
  process.stderr.write(serverOutput);
  throw error;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = once(server, "exit");
    server.kill("SIGTERM");
    const timer = setTimeout(() => server.kill("SIGKILL"), 5000);
    timer.unref();
    await exited;
    clearTimeout(timer);
  }
}
