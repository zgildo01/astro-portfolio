/* global PerformanceObserver, document, performance, window */
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";

const origin = new URL(process.env.PORTFOLIO_AUDIT_URL);
assert(
  ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname),
  "Performance audits must use the isolated local release server."
);
const routes = JSON.parse(process.env.PORTFOLIO_AUDIT_PATHS ?? '["/"]');
assert(
  Array.isArray(routes) &&
    routes.length > 0 &&
    routes.every((route) => typeof route === "string" && route.startsWith("/")),
  "Performance paths must be a nonempty JSON array."
);
const output = process.env.PORTFOLIO_AUDIT_OUTPUT_DIR;
const dist = fileURLToPath(new URL("../../dist/", import.meta.url));
const budgets = {
  lcpMs: 2_500,
  cls: 0.1,
  interactionUpperBoundMs: 200,
  scriptGzipBytes: 35 * 1024,
  stylesheetGzipBytes: 24 * 1024,
  initialEncodedBytes: 750 * 1024
};
const browser = await chromium.launch({ headless: true });
const results = [];
const failures = [];
const home =
  routes.find((route) => new URL(route, origin).pathname === origin.pathname) ??
  routes[0];
const scenarios = [
  ...routes.map((route) => ({ route, mode: "immersive" })),
  { route: home, mode: "minimal" }
];

async function sample(route, mode) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  try {
    const unexpected = [];
    await context.route("**/*", async (request) => {
      const url = new URL(request.request().url());
      if (url.hostname === "challenges.cloudflare.com") {
        // Measure our contact enhancement consistently without loading a real
        // third-party challenge or sending visitor/provider data from CI.
        await request.fulfill({
          contentType: "application/javascript",
          body: `window.turnstile={render(element,options){element.textContent="Verification test adapter";queueMicrotask(()=>options.callback("performance-test-token"));return"performance-widget";},reset(){}};`
        });
      } else if (
        url.origin !== origin.origin ||
        (url.pathname.includes("/api/") && request.request().method() !== "GET")
      ) {
        unexpected.push(`${request.request().method()} ${url.pathname}`);
        await request.abort();
      } else await request.continue();
    });
    const page = await context.newPage();
    const consoleMessages = [];
    page.on("pageerror", (error) => consoleMessages.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        consoleMessages.push(message.text());
    });
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await page.addInitScript(
      ({ mode, auditOrigin }) => {
        if (mode !== "immersive" && window.location.origin === auditOrigin)
          window.localStorage.setItem("portfolio-experience-mode", mode);
        globalThis.__portfolioPerformance = { lcpMs: 0, cls: 0, events: [] };
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            globalThis.__portfolioPerformance.lcpMs = entry.startTime;
        }).observe({ type: "largest-contentful-paint", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (!entry.hadRecentInput)
              globalThis.__portfolioPerformance.cls += entry.value;
        }).observe({ type: "layout-shift", buffered: true });
        new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            if (entry.interactionId)
              globalThis.__portfolioPerformance.events.push(entry.duration);
        }).observe({ type: "event", durationThreshold: 16, buffered: true });
      },
      { mode, auditOrigin: origin.origin }
    );
    const response = await page.goto(new URL(route, origin).href, {
      waitUntil: "networkidle"
    });
    assert.equal(response.status(), 200, route);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    assert.equal(
      await page.locator("html").getAttribute("data-experience-mode"),
      mode,
      "The requested cold-load appearance mode did not initialize."
    );
    const initial = await page.evaluate(() => ({
      ...globalThis.__portfolioPerformance,
      encodedBytes:
        performance.getEntriesByType("navigation")[0].encodedBodySize +
        performance
          .getEntriesByType("resource")
          .reduce((sum, resource) => sum + resource.encodedBodySize, 0),
      resources: performance.getEntriesByType("resource").map((r) => r.name),
      inlineScripts: [...document.scripts]
        .filter(
          (script) =>
            !script.src &&
            [
              "",
              "module",
              "text/javascript",
              "application/javascript"
            ].includes(script.type)
        )
        .map((script) => script.textContent ?? "")
    }));
    const clicksBefore = await page.evaluate(
      () => performance.eventCounts.get("click") ?? 0
    );
    for (let index = 0; index < 4; index++)
      await page.locator("header [data-mobile-navigation] > summary").click();
    await page.waitForTimeout(250);
    const interaction = await page.evaluate(() => ({
      events: globalThis.__portfolioPerformance.events,
      clicks: performance.eventCounts.get("click") ?? 0
    }));
    assert(
      interaction.clicks - clicksBefore >= 4,
      "Menu inputs were not exercised."
    );
    let scriptGzipBytes = initial.inlineScripts.reduce(
      (sum, script) => sum + gzipSync(script).length,
      0
    );
    let stylesheetGzipBytes = 0;
    for (const resource of new Set(initial.resources)) {
      const url = new URL(resource);
      const offset = url.pathname.indexOf("/_astro/");
      if (url.origin !== origin.origin || offset < 0) continue;
      const isScript = url.pathname.endsWith(".js");
      const isStylesheet = url.pathname.endsWith(".css");
      if (!isScript && !isStylesheet) continue;
      const file = path.resolve(
        dist,
        decodeURIComponent(url.pathname.slice(offset + 1))
      );
      assert(file.startsWith(dist), "Asset escaped the build directory.");
      const bytes = gzipSync(await readFile(file)).length;
      if (isScript) scriptGzipBytes += bytes;
      else stylesheetGzipBytes += bytes;
    }
    assert.deepEqual(
      unexpected,
      [],
      "Audit attempted an unexpected external call."
    );
    assert.deepEqual(
      consoleMessages,
      [],
      "Browser console warnings/errors occurred."
    );
    assert(initial.lcpMs > 0, "The browser did not record LCP.");
    return {
      lcpMs: initial.lcpMs,
      cls: initial.cls,
      // Event Timing quantizes durations in 8 ms steps and omits small events.
      // Keep a conservative margin for these lab inputs; this is not field INP.
      interactionUpperBoundMs: Math.max(
        24,
        ...interaction.events.map((duration) => duration + 8)
      ),
      scriptGzipBytes,
      stylesheetGzipBytes,
      initialEncodedBytes: initial.encodedBytes
    };
  } finally {
    await context.close();
  }
}

function exceeds(metrics) {
  return Object.entries(budgets).some(([key, limit]) => metrics[key] > limit);
}

try {
  for (const { route, mode } of scenarios) {
    const samples = [await sample(route, mode)];
    // A failed measurement gets two additional cold runs. The median still
    // fails a consistent regression while reducing single-run host noise.
    if (exceeds(samples[0])) {
      samples.push(await sample(route, mode), await sample(route, mode));
    }
    const metrics = Object.fromEntries(
      Object.keys(budgets).map((key) => [
        key,
        samples.map((entry) => entry[key]).sort((a, b) => a - b)[
          Math.floor(samples.length / 2)
        ]
      ])
    );
    results.push({ route, mode, metrics, samples });
    for (const [key, limit] of Object.entries(budgets)) {
      if (metrics[key] > limit)
        failures.push(
          `${mode} ${route}: ${key} ${metrics[key]} exceeds ${limit}`
        );
    }
    process.stdout.write(
      `Performance ${mode} ${route}: LCP ${Math.round(metrics.lcpMs)}ms, CLS ${metrics.cls.toFixed(3)}, sampled interaction <=${metrics.interactionUpperBoundMs}ms.\n`
    );
  }
} finally {
  await browser.close();
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "performance.json"),
      JSON.stringify(
        {
          environment:
            "Chromium: 390x844 at DPR 2, cold cache, 4x CPU, 150ms latency, 1.6Mbps down",
          thirdPartyVerification: "simulated; no provider traffic or email",
          fieldINP:
            "not measured; lab interaction bounds are reported separately",
          budgets,
          results,
          failures
        },
        null,
        2
      ) + "\n"
    );
  }
}
assert.deepEqual(failures, [], "Performance budgets failed.");
