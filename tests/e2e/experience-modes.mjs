/* global document, window, getComputedStyle, requestAnimationFrame, DOMException, matchMedia */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import axe from "axe-core";
import { chromium } from "playwright";

const origin = new URL(process.env.PORTFOLIO_AUDIT_URL);
assert(
  ["http:", "https:"].includes(origin.protocol) &&
    ["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) &&
    !origin.username &&
    !origin.password,
  "Experience-mode checks require the isolated local release server."
);
const routes = JSON.parse(
  process.env.PORTFOLIO_AUDIT_PATHS ??
    '["/", "/work/", "/resume/", "/contact/"]'
);
assert(
  Array.isArray(routes) &&
    routes.length &&
    routes.every(
      (route) =>
        typeof route === "string" &&
        new URL(route, origin).origin === origin.origin
    ),
  "Mode audit paths must remain on the local origin."
);
const home =
  routes.find((route) => new URL(route, origin).pathname === "/") ?? routes[0];
const resume = routes.find((route) => /\/resume\/?$/.test(route));
const modes = ["immersive", "minimal"];
const output = process.env.PORTFOLIO_AUDIT_OUTPUT_DIR;
const checks = [];
const audits = [];
const failures = [];
const browserErrors = [];
const browserConsole = [];
const unexpectedRequests = [];
const policyViolations = [];
let browser;

async function context(options = {}, storedMode) {
  const result = await browser.newContext({
    reducedMotion: "reduce",
    ...options
  });
  await result.route("**/*", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (
      url.hostname === "challenges.cloudflare.com" &&
      url.pathname === "/turnstile/v0/api.js"
    ) {
      return route.fulfill({
        contentType: "application/javascript",
        body: 'window.turnstile={render(element,options){element.textContent="Verification test adapter";queueMicrotask(()=>options.callback("mode-audit-token"));return "mode-audit-widget";},reset(){}};'
      });
    }
    if (
      url.origin !== origin.origin ||
      !["GET", "HEAD"].includes(request.method())
    ) {
      unexpectedRequests.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    return route.continue();
  });
  await result.addInitScript(
    ({ mode, auditOrigin }) => {
      if (mode !== undefined && window.location.origin === auditOrigin)
        window.localStorage.setItem("portfolio-experience-mode", mode);
      window.__firstFrameMode = null;
      requestAnimationFrame(() => {
        window.__firstFrameMode =
          document.documentElement.dataset.experienceMode;
      });
      document.addEventListener("securitypolicyviolation", (event) => {
        window.__modePolicyViolations ??= [];
        window.__modePolicyViolations.push({
          directive: event.effectiveDirective,
          blockedURI: event.blockedURI
        });
      });
    },
    { mode: storedMode, auditOrigin: origin.origin }
  );
  result.on("page", (page) => {
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type()))
        browserConsole.push({ level: message.type(), message: message.text() });
    });
  });
  return result;
}

async function load(page, route) {
  const response = await page.goto(new URL(route, origin).href, {
    waitUntil: "networkidle"
  });
  assert.equal(response.status(), 200, `Mode page failed: ${route}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(
    () => document.querySelector("[data-experience-control]")?.hidden === false
  );
  await page.waitForFunction(() => window.__firstFrameMode !== null);
  policyViolations.push(
    ...(await page.evaluate(() => window.__modePolicyViolations ?? []))
  );
}

async function selectMode(page, mode) {
  const control = page.locator("[data-experience-control]").first();
  if (!(await control.evaluate((element) => element.open)))
    await control.locator("summary").click();
  await control
    .getByRole("radio", { name: new RegExp(`^${mode}`, "i") })
    .check();
  await page.waitForFunction(
    (value) => document.documentElement.dataset.experienceMode === value,
    mode
  );
}

async function closeSettings(page) {
  await page.locator("[data-experience-control]").evaluateAll((elements) =>
    elements.forEach((element) => {
      element.open = false;
    })
  );
}

async function noOverflow(page) {
  const size = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    width: document.documentElement.scrollWidth
  }));
  assert(
    size.width <= size.viewport + 1,
    `Mode causes horizontal overflow: ${JSON.stringify(size)}`
  );
}

async function settleLayout(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })
  );
}

async function runningEffects(page) {
  return page.locator("[data-scenery-effect]").evaluateAll(
    (elements) =>
      elements.filter((element) => {
        const style = getComputedStyle(element);
        const states = style.animationPlayState.split(",");
        return style.animationName
          .split(",")
          .some(
            (name, index) =>
              name.trim() !== "none" &&
              states[index % states.length].trim() === "running"
          );
      }).length
  );
}

async function assertMotionPaused(page) {
  assert.equal(
    await page.locator("html").getAttribute("data-scenery-motion"),
    "still"
  );
  assert.equal(
    await runningEffects(page),
    0,
    "Motion must remain paused in this mode."
  );
}

async function audit(page, mode, state) {
  await page.evaluate(axe.source);
  const results = await page.evaluate(async () => {
    const { violations, incomplete, passes } = await window.axe.run(document, {
      runOnly: {
        type: "tag",
        values: [
          "wcag2a",
          "wcag2aa",
          "wcag21a",
          "wcag21aa",
          "wcag22aa",
          "best-practice"
        ]
      }
    });
    return {
      violations: violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, failureSummary }) => ({
          target,
          failureSummary
        }))
      })),
      incomplete: incomplete.map(({ id, nodes }) => ({
        id,
        targets: nodes.map(({ target }) => target)
      })),
      passedRules: passes.length
    };
  });
  audits.push({ mode, state, ...results });
  assert(results.passedRules > 10, "Mode accessibility rules did not run.");
  assert.deepEqual(
    results.violations,
    [],
    `${mode}/${state} accessibility violations`
  );
}

async function check(name, run) {
  try {
    await run();
    checks.push(name);
    process.stdout.write(`PASS experience modes: ${name}\n`);
  } catch (error) {
    failures.push({ name, message: error.message });
    process.stderr.write(`FAIL experience modes: ${name}: ${error.message}\n`);
  }
}

try {
  browser = await chromium.launch({ headless: true });
  await check(
    "wide headers keep Display beside primary navigation",
    async () => {
      const session = await context({ viewport: { width: 1440, height: 900 } });
      try {
        const page = await session.newPage();
        await load(page, home);
        const navigation = await page
          .locator('header nav[data-placement="header"]')
          .boundingBox();
        const display = await page
          .locator("[data-experience-control] > summary")
          .boundingBox();
        assert(navigation && display, "Both header controls must be visible.");
        assert(
          Math.min(
            navigation.y + navigation.height,
            display.y + display.height
          ) > Math.max(navigation.y, display.y),
          "With enough space, Display must share the navigation row."
        );
        assert(
          display.x >= navigation.x + navigation.width,
          "Display must not overlap primary navigation."
        );
        await noOverflow(page);
      } finally {
        await session.close();
      }
    }
  );
  for (const mode of modes) {
    const session = await context({}, mode);
    try {
      const page = await session.newPage();
      for (const route of routes) {
        await check(
          `${mode} direct route ${route} keeps content, navigation, and safe motion`,
          async () => {
            await load(page, route);
            assert.equal(
              await page.locator("html").getAttribute("data-experience-mode"),
              mode
            );
            assert.equal(
              await page.evaluate(() => window.__firstFrameMode),
              mode,
              "A stored mode must apply before the first animation frame."
            );
            assert.equal(await page.locator("main").count(), 1);
            assert.equal(await page.locator("main h1").count(), 1);
            assert.equal(await page.locator("main[tabindex]").count(), 0);
            assert.equal(
              await page.locator("astro-island").count(),
              0,
              "Professional routes must not acquire hydrated experience islands."
            );
            for (const link of await page
              .locator('header nav[data-placement="header"] a')
              .all()) {
              const href = await link.getAttribute("href");
              assert(
                !href.includes("/experience"),
                "Professional navigation must not route through the optional experience."
              );
            }
            await assertMotionPaused(page);
            if (mode !== "immersive") {
              assert.equal(
                await page.locator("[data-scenery-environment]").isVisible(),
                false
              );
              assert.equal(
                await page.locator("[data-scenery-control]").isVisible(),
                false
              );
              for (const element of await page
                .locator("[data-atmosphere-copy]")
                .all())
                assert.equal(await element.isVisible(), false);
            }
            if (mode === "minimal")
              for (const figure of await page
                .locator("[data-atmosphere-figure]")
                .all())
                assert.equal(await figure.isVisible(), false);
            for (const width of [320, 767, 1440]) {
              await page.setViewportSize({ width, height: 900 });
              await noOverflow(page);
            }
            await page.setViewportSize({ width: 320, height: 900 });
            await page.evaluate(() => {
              document.documentElement.style.fontSize = "200%";
            });
            await noOverflow(page);
            await page.evaluate(() => {
              document.documentElement.style.fontSize = "";
            });
          }
        );
      }
      await check(
        `${mode} appearance settings remain keyboard accessible at 320px and enlarged text`,
        async () => {
          await load(page, home);
          await page.setViewportSize({ width: 320, height: 900 });
          const settings = page.locator("[data-experience-control]").first();
          const toggle = settings.locator("summary");
          await toggle.focus();
          await page.keyboard.press("Enter");
          assert.equal(
            await settings.evaluate((element) => element.open),
            true
          );
          assert.equal(await settings.getByRole("radio").count(), 2);
          await settings.getByRole("radio", { name: /^Immersive/i }).focus();
          await page.keyboard.press("ArrowRight");
          assert.equal(
            await page.locator("html").getAttribute("data-experience-mode"),
            "minimal"
          );
          await page.keyboard.press("ArrowLeft");
          assert.equal(
            await page.locator("html").getAttribute("data-experience-mode"),
            "immersive"
          );
          await selectMode(page, mode);
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
          });
          await noOverflow(page);
          for (const label of await settings.locator("label").all()) {
            const rectangle = await label.boundingBox();
            assert(
              rectangle.height >= 44,
              "Mode selection must retain a usable pointer target."
            );
          }
          await audit(page, mode, "settings open at 320px / 200% text");
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "";
          });
          await closeSettings(page);
          await page.setViewportSize({ width: 1440, height: 900 });
          await audit(page, mode, "homepage");
          if (output) {
            await mkdir(output, { recursive: true });
            await page.screenshot({
              path: path.join(output, `mode-${mode}.png`),
              fullPage: true,
              animations: "disabled"
            });
          }
        }
      );
    } finally {
      await session.close();
    }
  }

  await check(
    "native Menu and Display panels cannot obscure each other on mobile",
    async () => {
      const session = await context({ viewport: { width: 320, height: 900 } });
      try {
        const page = await session.newPage();
        await load(page, home);
        const menu = page.locator("header [data-mobile-navigation]");
        const display = page.locator("[data-experience-control]").first();
        await menu.locator("summary").click();
        assert.equal(await menu.evaluate((element) => element.open), true);
        await display.locator("summary").click();
        assert.equal(await display.evaluate((element) => element.open), true);
        assert.equal(await menu.evaluate((element) => element.open), false);
        await menu.locator("summary").click();
        assert.equal(await menu.evaluate((element) => element.open), true);
        assert.equal(await display.evaluate((element) => element.open), false);
        await noOverflow(page);
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "legacy Professional preferences become Minimal without a third option or motion",
    async () => {
      const session = await context({}, "professional");
      try {
        const page = await session.newPage();
        await load(page, home);
        assert.equal(
          await page.locator("html").getAttribute("data-experience-mode"),
          "minimal"
        );
        assert.equal(
          await page.evaluate(() => window.__firstFrameMode),
          "minimal"
        );
        const settings = page.locator("[data-experience-control]").first();
        assert.equal(await settings.locator('input[type="radio"]').count(), 2);
        assert.equal(
          await settings.locator('input[value="professional"]').count(),
          0
        );
        assert.equal(
          await settings.locator('input[value="minimal"]').isChecked(),
          true
        );
        await assertMotionPaused(page);
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "native mode choices persist through reload and direct professional navigation",
    async () => {
      const session = await context();
      try {
        const page = await session.newPage();
        await load(page, home);
        assert.equal(
          await page.locator("html").getAttribute("data-experience-mode"),
          "immersive"
        );
        await selectMode(page, "minimal");
        await closeSettings(page);
        await page.reload({ waitUntil: "networkidle" });
        assert.equal(
          await page.locator("html").getAttribute("data-experience-mode"),
          "minimal"
        );
        for (const route of routes.filter((value) =>
          /\/(work|resume|contact)\/?$/.test(value)
        )) {
          await load(page, route);
          assert.equal(
            await page.locator("html").getAttribute("data-experience-mode"),
            "minimal"
          );
        }
        await selectMode(page, "immersive");
        assert.equal(
          await page.evaluate(() =>
            window.localStorage.getItem("portfolio-experience-mode")
          ),
          "immersive"
        );
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "reduced-motion Immersive and explicit Still survive mode round trips",
    async () => {
      const session = await context({}, "immersive");
      try {
        const page = await session.newPage();
        await load(page, home);
        await assertMotionPaused(page);
        await page.getByRole("radio", { name: "Motion", exact: true }).check();
        assert.equal(
          await page.locator("html").getAttribute("data-scenery-motion"),
          "motion"
        );
        assert(
          (await runningEffects(page)) > 0,
          "An explicit Immersive Motion choice must activate the decorative layer."
        );
        await page.getByRole("radio", { name: "Still", exact: true }).check();
        await selectMode(page, "minimal");
        await assertMotionPaused(page);
        await selectMode(page, "immersive");
        await closeSettings(page);
        await assertMotionPaused(page);
        assert.equal(
          await page
            .getByRole("radio", { name: "Still", exact: true })
            .isChecked(),
          true
        );
        assert.equal(
          await page.evaluate(() =>
            window.localStorage.getItem("portfolio-scenery-motion")
          ),
          "still"
        );
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "the saved Motion preference cannot start animations in Minimal",
    async () => {
      const session = await context({ reducedMotion: "no-preference" });
      await session.addInitScript((auditOrigin) => {
        if (window.location.origin === auditOrigin)
          window.localStorage.setItem("portfolio-scenery-motion", "motion");
      }, origin.origin);
      try {
        const page = await session.newPage();
        await load(page, home);
        assert.equal(
          await page.locator("html").getAttribute("data-scenery-motion"),
          "motion"
        );
        await selectMode(page, "minimal");
        await assertMotionPaused(page);
        await selectMode(page, "immersive");
        assert.equal(
          await page.locator("html").getAttribute("data-scenery-motion"),
          "motion"
        );
        await selectMode(page, "minimal");
        await assertMotionPaused(page);
        assert.equal(
          await page.evaluate(() =>
            window.localStorage.getItem("portfolio-scenery-motion")
          ),
          "motion"
        );
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "blocked browser storage keeps mode controls working and reports no exception",
    async () => {
      const session = await context();
      await session.addInitScript(() => {
        Object.defineProperty(window, "localStorage", {
          configurable: true,
          get() {
            throw new DOMException("Denied", "SecurityError");
          }
        });
      });
      try {
        const page = await session.newPage();
        await load(page, home);
        assert.equal(
          await page.locator("html").getAttribute("data-experience-mode"),
          "immersive"
        );
        await selectMode(page, "minimal");
        await selectMode(page, "immersive");
        assert.equal(
          await page.locator("html").getAttribute("data-experience-mode"),
          "immersive"
        );
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "real storage events synchronize another open tab without reloading",
    async () => {
      const session = await context();
      try {
        const first = await session.newPage();
        const second = await session.newPage();
        await load(first, home);
        await load(second, home);
        await selectMode(first, "minimal");
        await second.waitForFunction(
          () => document.documentElement.dataset.experienceMode === "minimal"
        );
        await selectMode(second, "immersive");
        await first.waitForFunction(
          () => document.documentElement.dataset.experienceMode === "immersive"
        );
        assert.equal(
          await first.evaluate(() =>
            window.localStorage.getItem("portfolio-experience-mode")
          ),
          "immersive"
        );
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "Minimal keeps meaningful case-study figures and all essential page content",
    async () => {
      const session = await context();
      try {
        const page = await session.newPage();
        for (const route of routes) {
          await load(page, route);
          const content = await page.locator("main").textContent();
          const links = await page
            .locator("main a[href]")
            .evaluateAll((elements) =>
              elements.map((element) => element.getAttribute("href"))
            );
          await selectMode(page, "minimal");
          await closeSettings(page);
          assert.equal(
            await page.locator("main").textContent(),
            content,
            "Mode selection must not replace authored professional content."
          );
          assert.deepEqual(
            await page
              .locator("main a[href]")
              .evaluateAll((elements) =>
                elements.map((element) => element.getAttribute("href"))
              ),
            links
          );
          for (const figure of await page
            .locator("main figure:not([data-atmosphere-figure])")
            .all())
            assert.equal(
              await figure.isVisible(),
              true,
              "A useful workflow figure must remain visible in Minimal."
            );
        }
      } finally {
        await session.close();
      }
    }
  );

  if (resume)
    await check(
      "every mode leaves resume print presentation clean and readable",
      async () => {
        const session = await context();
        try {
          const page = await session.newPage();
          for (const mode of modes) {
            await load(page, resume);
            await selectMode(page, mode);
            await closeSettings(page);
            await page.emulateMedia({ media: "print" });
            await settleLayout(page);
            await page.waitForFunction(
              () =>
                matchMedia("print").matches &&
                getComputedStyle(document.body).backgroundColor ===
                  "rgb(255, 255, 255)",
              undefined,
              { timeout: 5_000 }
            );
            const colors = await page.locator("body").evaluate((element) => ({
              background: getComputedStyle(element).backgroundColor,
              color: getComputedStyle(element).color
            }));
            assert.equal(colors.background, "rgb(255, 255, 255)");
            assert.notEqual(colors.color, "rgb(255, 255, 255)");
            assert.equal(
              await page.locator("body > header").isVisible(),
              false
            );
            assert.equal(
              await page.locator("body > footer").isVisible(),
              false
            );
            assert.equal(await page.locator("main h1").isVisible(), true);
            await page.emulateMedia({ media: "screen" });
            await settleLayout(page);
            await page.waitForFunction(
              () => !matchMedia("print").matches,
              undefined,
              { timeout: 5_000 }
            );
          }
        } finally {
          await session.close();
        }
      }
    );

  await check(
    "without JavaScript Immersive stays still and usable without dead settings",
    async () => {
      const session = await context({ javaScriptEnabled: false });
      try {
        const page = await session.newPage();
        for (const route of routes) {
          const response = await page.goto(new URL(route, origin).href);
          assert.equal(response.status(), 200);
          assert.equal(
            await page.locator("html").getAttribute("data-experience-mode"),
            "immersive"
          );
          assert.equal(
            await page.locator("html").getAttribute("data-scenery-motion"),
            "still"
          );
          assert.equal(
            await page.locator("[data-experience-control]").isVisible(),
            false
          );
          assert.equal(await page.locator("main h1").isVisible(), true);
          if (await page.locator("[data-scenery-environment]").count())
            assert.equal(
              await page.locator("[data-scenery-environment]").isVisible(),
              true
            );
          await assertMotionPaused(page);
          for (const link of await page.locator("main a[href]").all())
            assert.equal(await link.isVisible(), true);
        }
      } finally {
        await session.close();
      }
    }
  );

  await check(
    "normal mode selection emits no browser exceptions, CSP failures, warnings, or external submissions",
    async () => {
      assert.deepEqual(browserErrors, []);
      assert.deepEqual(browserConsole, []);
      assert.deepEqual(policyViolations, []);
      assert.deepEqual(unexpectedRequests, []);
    }
  );
} finally {
  await browser?.close();
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "experience-modes.json"),
      JSON.stringify(
        {
          checks: checks.length,
          failures,
          audits,
          browserErrors,
          browserConsole,
          policyViolations,
          unexpectedRequests,
          limitations: [
            "Provider initialization uses an adapter; no challenge service or email submission is exercised.",
            "Automated axe and text resizing do not replace manual screen-reader/browser-zoom review."
          ]
        },
        null,
        2
      ) + "\n"
    );
  }
}
assert.deepEqual(failures, [], "Experience-mode release checks failed.");
process.stdout.write(
  `Experience-mode verification: ${checks.length} checks passed.\n`
);
