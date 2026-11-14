/* global document, fetch, AbortSignal */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";
import { chromium, firefox } from "playwright";

const root = fileURLToPath(new URL("../../", import.meta.url));
const astro = path.join(root, "node_modules/astro/bin/astro.mjs");
const output = process.env.PORTFOLIO_AUDIT_OUTPUT_DIR;
const environments = {
  ...process.env,
  ASTRO_DEV_BACKGROUND: "false",
  ASTRO_DISABLE_UPDATE_CHECK: "true",
  ASTRO_TELEMETRY_DISABLED: "1",
  // Explicit blanks prevent local .env credentials or vault paths being used.
  RESUME_VAULT_DIR: "",
  RESUME_CONTENT_TOKEN: "",
  PUBLIC_TURNSTILE_SITE_KEY: "",
  PUBLIC_CONTACT_EMAIL: "",
  TURNSTILE_SECRET_KEY: "",
  RESEND_API_KEY: "",
  CONTACT_FROM_EMAIL: "",
  CONTACT_TO_EMAIL: "",
  CLOUDFLARE_API_TOKEN: "",
  CLOUDFLARE_ACCOUNT_ID: "",
  PORTFOLIO_DISPATCH_TOKEN: "",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  PORTFOLIO_BASE_PATH: "/",
  PORTFOLIO_SITE_URL: "https://portfolio.example"
};
delete environments.VITE_USER_NODE_ENV;

function start(args, nodeEnvironment) {
  const child = spawn(process.execPath, [astro, ...args], {
    cwd: root,
    env: { ...environments, NODE_ENV: nodeEnvironment },
    stdio: ["ignore", "pipe", "pipe"]
  });
  let log = "";
  let spawnError;
  child.on("error", (error) => {
    spawnError = error;
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", (chunk) => {
      log = (log + chunk.toString()).slice(-16_000);
    });
  }
  return { child, log: () => log, error: () => spawnError };
}

async function stop(running) {
  const child = running?.child;
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  if (
    !(await Promise.race([
      exited.then(() => true),
      delay(5000, undefined, { ref: false }).then(() => false)
    ]))
  ) {
    child.kill("SIGKILL");
    await exited;
  }
}

const probe = createServer();
probe.listen(0, "127.0.0.1");
await once(probe, "listening");
const port = probe.address().port;
await new Promise((resolve) => probe.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const address = `${origin}/experience/console/`;
const server = start(
  ["dev", "--ignore-lock", "--host", "127.0.0.1", "--port", String(port)],
  "development"
);
const browsers = [];
const checks = [];
const interactionDiagnostics = [];
let checker;
let passed = false;

async function ready() {
  for (let attempt = 0; attempt < 150; attempt++) {
    if (server.error()) throw server.error();
    assert.equal(
      server.child.exitCode,
      null,
      "Development server exited early."
    );
    try {
      const response = await fetch(address, {
        signal: AbortSignal.timeout(2000)
      });
      await response.body?.cancel();
      if (response.status === 200) return;
    } catch {
      /* The isolated server may still be starting. */
    }
    await delay(200);
  }
  throw new Error("Console development server did not become ready.");
}

async function hydrate({ name, browser }, phase) {
  // Every run is a fresh client. A warm browser cache can conceal production
  // jsx-dev-runtime files that another Astro process wrote over live dev files.
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce"
  });
  const errors = [];
  const messages = [];
  const unexpected = [];
  let interactionStarted = false;
  await context.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.origin !== origin ||
      request.method() !== "GET" ||
      url.pathname.startsWith("/api/")
    ) {
      unexpected.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    const text = message.text();
    if (
      name === "Firefox" &&
      interactionStarted &&
      message.type() === "warning" &&
      text.includes(
        "This site appears to use a scroll-linked positioning effect."
      ) &&
      text.includes(
        "https://firefox-source-docs.mozilla.org/performance/scroll-linked_effects.html"
      )
    ) {
      // A/B traced to Astro toolbar's refreshIslandsOverlayPositions listener.
      // This known interaction diagnostic is separate from startup failures;
      // every other warning and all application/console errors still fail.
      interactionDiagnostics.push({
        browser: name,
        phase,
        reason: "Astro development toolbar scroll-position overlay",
        text
      });
      return;
    }
    if (["error", "warning"].includes(message.type()))
      messages.push({ level: message.type(), text });
  });
  try {
    const response = await page.goto(address);
    assert.equal(response.status(), 200, `${name}: console HTTP status`);
    await page.locator('.experience-console[data-ready="true"]').waitFor();
    const cameras = page.getByRole("group", { name: "Camera selection" });
    assert.equal(await cameras.getByRole("button").count(), 11);
    assert.deepEqual(errors, [], `${name} ${phase}: startup exceptions`);
    assert.deepEqual(messages, [], `${name} ${phase}: startup warnings/errors`);
    interactionStarted = true;
    await cameras.getByRole("button", { name: /^Control room/ }).click();
    await page.locator(".monitor-window").waitFor();
    assert.equal(await page.locator(".mini-image img").count(), 1);
    const selectedSource = await page
      .locator(".feed-image")
      .getAttribute("src");
    await page.getByRole("button", { name: "Hold image", exact: true }).click();
    await cameras.getByRole("button", { name: /^Office hall/ }).click();
    assert.equal(
      await page.locator(".feed-image").getAttribute("src"),
      selectedSource
    );
    await page
      .getByRole("button", { name: "Release image", exact: true })
      .click();
    await page.waitForFunction(
      (held) =>
        document.querySelector(".feed-image")?.getAttribute("src") !== held,
      selectedSource
    );
    const client = page
      .locator("dt")
      .filter({ hasText: /^Reported client$/ })
      .locator("..")
      .locator("dd");
    assert.match(
      await client.innerText(),
      name === "Firefox" ? /Firefox/ : /Chromium family/
    );
    await page.locator(".feed-image").evaluate((image) => image.decode());
    await page.setViewportSize({ width: 320, height: 900 });
    await page.waitForFunction(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth + 1
    );
    const frame = await page.locator(".scene").boundingBox();
    assert(
      frame?.width > 0 && frame.height > 0,
      `${name}: a visible monitor remains at320px`
    );
    assert(
      Math.abs(frame.width / frame.height - 1672 / 941) < 0.03,
      `${name}: monitor preserves its aspect ratio`
    );
    assert.deepEqual(errors, [], `${name} ${phase}: browser exceptions`);
    assert.deepEqual(messages, [], `${name} ${phase}: browser warnings/errors`);
    assert.deepEqual(
      unexpected,
      [],
      `${name} ${phase}: unexpected network request`
    );
    checks.push(`${name}: ${phase}`);
    process.stdout.write(`PASS development hydration: ${name} ${phase}\n`);
  } finally {
    await context.close();
  }
}

try {
  await ready();
  for (const [name, engine] of [
    ["Chromium", chromium],
    ["Firefox", firefox]
  ])
    browsers.push({ name, browser: await engine.launch({ headless: true }) });
  for (const browser of browsers)
    await hydrate(browser, "before type checking");
  checker = start(["check"], "production");
  const completed = await Promise.race([
    once(checker.child, "close").then(([code]) => ({ code })),
    delay(120_000, undefined, { ref: false }).then(() => null)
  ]);
  assert(completed, "Production-mode type checking timed out.");
  assert.equal(
    completed.code,
    0,
    `Production-mode type checking failed:\n${checker.log()}`
  );
  assert.equal(
    server.child.exitCode,
    null,
    "The same development server must remain running."
  );
  for (const browser of browsers)
    await hydrate(browser, "after production-mode type checking");
  passed = true;
  process.stdout.write(
    "Development console verification: four cold clients pass across Firefox and Chromium; the live server survives production-mode type checking.\n"
  );
} catch (error) {
  process.stderr.write(
    `${error.stack ?? error}\nDevelopment server output:\n${server.log()}\n`
  );
  process.exitCode = 1;
} finally {
  for (const { browser } of browsers) await browser.close();
  await stop(checker);
  await stop(server);
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "experience-dev.json"),
      JSON.stringify({ passed, checks, interactionDiagnostics }, null, 2) + "\n"
    );
  }
}
