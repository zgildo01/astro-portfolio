/* global document, window, getComputedStyle */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import axe from "axe-core";
import { chromium } from "playwright";

const origin = new URL(
  process.env.PORTFOLIO_AUDIT_URL ?? "http://127.0.0.1:4321"
);
const configuredRoutes = process.env.PORTFOLIO_AUDIT_PATHS
  ? JSON.parse(process.env.PORTFOLIO_AUDIT_PATHS)
  : ["/", "/about/", "/work/", "/resume/", "/contact/"];
assert(
  Array.isArray(configuredRoutes) &&
    configuredRoutes.every((route) => typeof route === "string"),
  "PORTFOLIO_AUDIT_PATHS must be a JSON array of route paths."
);
function normalizeAuditRoute(route) {
  const url = new URL(route, origin);
  assert.equal(url.origin, origin.origin, "Audit routes must stay on origin.");
  if (!url.pathname.endsWith("/") && !path.posix.extname(url.pathname))
    url.pathname += "/";
  return url.pathname;
}
const routes = configuredRoutes.map(normalizeAuditRoute);
function expectedPageStatus(route) {
  return /\/__release_missing_page__\/?$/.test(route) ? 404 : 200;
}
const output = process.env.PORTFOLIO_AUDIT_OUTPUT_DIR;
if (output) await mkdir(output, { recursive: true });
const checks = [];
const audits = [];
const failures = [];
const browserErrors = [];
const browserConsole = [];
let expectedNotFoundConsoleEvents = 0;
const requests = [];

const verificationAdapter = `
window.turnstile = {
  render(container, options) {
    const verification = document.createElement("span");
    verification.textContent = "Verification test adapter";
    container.replaceChildren(verification);
    window.__verification = options;
    queueMicrotask(() => options.callback("synthetic-accessibility-token"));
    return "accessibility-widget";
  },
  reset() {
    queueMicrotask(() => window.__verification.callback("synthetic-accessibility-token"));
  }
};`;

async function prepareContext(browser, options = {}) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    ...options
  });
  // The browser audits never contact challenge or email providers. The form
  // endpoint is intercepted even when the supplied URL is a deployed site.
  await context.route("**/api/contact*", async (route) => {
    requests.push(route.request().method());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ok: true, message: "Synthetic inquiry accepted." })
    });
  });
  await context.route("https://challenges.cloudflare.com/**", (route) => {
    if (new URL(route.request().url()).pathname === "/turnstile/v0/api.js") {
      return route.fulfill({
        contentType: "application/javascript",
        body: verificationAdapter
      });
    }
    return route.abort();
  });
  context.on("page", (page) => {
    page.on("pageerror", (error) => browserErrors.push(error.message));
    page.on("console", (message) => {
      if (["warning", "error"].includes(message.type())) {
        const location = message.location();
        if (
          message.type() === "error" &&
          /^Failed to load resource: the server responded with a status of 404(?: \(Not Found\))?$/.test(
            message.text()
          ) &&
          location.url &&
          expectedPageStatus(new URL(location.url).pathname) === 404
        ) {
          expectedNotFoundConsoleEvents++;
          return;
        }
        browserConsole.push({
          level: message.type(),
          message: message.text(),
          location
        });
      }
    });
  });
  return context;
}

async function check(name, run) {
  try {
    await run();
    checks.push(name);
    process.stdout.write(`PASS accessibility: ${name}\n`);
  } catch (error) {
    failures.push({ name, message: error.message });
    process.stderr.write(`FAIL accessibility: ${name}: ${error.message}\n`);
  }
}

async function load(page, route) {
  const url = new URL(route, origin);
  assert.equal(url.origin, origin.origin, "Audit routes must stay on origin.");
  const response = await page.goto(url.href);
  assert(response, `No response for ${route}.`);
  assert.equal(
    response.status(),
    expectedPageStatus(url.pathname),
    `Unexpected page response ${response.status()} for ${route}.`
  );
  await page.evaluate(() => document.fonts.ready);
  await page.locator("main h1").waitFor();
}

async function audit(page, route, state) {
  // DevTools execution injects the auditor without weakening the application's
  // Content Security Policy or replacing browser rendering with jsdom stubs.
  await page.evaluate(axe.source);
  const result = await page.evaluate(async () => {
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
    const summarize = (items) =>
      items.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.map(({ target, failureSummary }) => ({
          target,
          failureSummary
        }))
      }));
    return {
      violations: summarize(violations),
      incomplete: summarize(incomplete),
      passedRules: passes.length
    };
  });
  audits.push({ route, state, ...result });
  assert.deepEqual(result.violations, [], `${route} ${state} axe violations`);
  assert(
    result.passedRules > 10,
    "The browser accessibility audit did not run."
  );
}

async function noHorizontalOverflow(page) {
  const dimensions = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  assert(
    dimensions.content <= dimensions.viewport + 1,
    `Horizontal overflow: ${JSON.stringify(dimensions)}`
  );
}

async function settleLayout(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        window.requestAnimationFrame(() =>
          window.requestAnimationFrame(resolve)
        )
      )
  );
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await prepareContext(browser);
  const page = await context.newPage();
  const found = new Set(routes);
  for (const route of routes) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await load(page, route);
    if (!process.env.PORTFOLIO_AUDIT_PATHS) {
      for (const href of await page
        .locator('main a[href*="/work/"]')
        .evaluateAll((links) => links.map((link) => link.href))) {
        const url = new URL(href);
        if (url.origin === origin.origin)
          found.add(normalizeAuditRoute(url.pathname));
      }
    }
  }

  for (const route of found) {
    await check(`${route} landmarks and accessible references`, async () => {
      await load(page, route);
      assert.equal(await page.locator("main").count(), 1);
      assert.equal(await page.locator("h1").count(), 1);
      assert.equal(await page.locator("main[tabindex]").count(), 0);
      const invalidTabOrder = await page
        .locator("[tabindex]")
        .evaluateAll((elements) =>
          elements.some(
            (element) => Number(element.getAttribute("tabindex")) > 0
          )
        );
      assert.equal(invalidTabOrder, false);
      const imagesWithoutAlt = await page.locator("img:not([alt])").count();
      assert.equal(imagesWithoutAlt, 0);
    });
    for (const width of [320, 1440]) {
      await check(`${route} full axe rules at ${width}px`, async () => {
        await page.setViewportSize({ width, height: 900 });
        await load(page, route);
        await audit(page, route, `${width}px`);
        if (output) {
          await page.screenshot({
            path: path.join(
              output,
              `${route.replace(/\W/g, "_") || "home"}-${width}.png`
            ),
            fullPage: true
          });
        }
      });
    }
    await check(
      `${route} responsive reflow and 200% text resizing`,
      async () => {
        await load(page, route);
        for (const width of [320, 390, 600, 767, 768, 1024, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "";
          });
          await settleLayout(page);
          await noHorizontalOverflow(page);
          await page.evaluate(() => {
            document.documentElement.style.fontSize = "200%";
          });
          await settleLayout(page);
          await noHorizontalOverflow(page);
          if (width === 320) {
            const crampedControls = await page
              .locator(
                "[data-scenery-control] legend, [data-scenery-control] label span"
              )
              .evaluateAll((labels) =>
                labels
                  .filter((label) => {
                    const range = document.createRange();
                    range.selectNodeContents(label);
                    return (
                      [...range.getClientRects()].filter(
                        (rect) => rect.width > 0
                      ).length > 1
                    );
                  })
                  .map((label) => label.textContent.trim())
              );
            assert.deepEqual(
              crampedControls,
              [],
              "Motion labels must remain whole words when text is enlarged."
            );
            const squeezedTitles = await page
              .locator(".work-card h3 a")
              .evaluateAll((links) =>
                links
                  .filter((link) => {
                    const title = link.firstElementChild;
                    return (
                      title &&
                      title.getBoundingClientRect().width <
                        link.getBoundingClientRect().width * 0.9
                    );
                  })
                  .map((link) => link.textContent.trim())
              );
            assert.deepEqual(
              squeezedTitles,
              [],
              "Narrow work titles must use the link width rather than a column beside the decorative arrow."
            );
          }
        }
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "";
        });
      }
    );
    await check(`${route} keyboard skip and visible focus`, async () => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await load(page, route);
      await page.keyboard.press("Tab");
      const skip = page.locator("[data-skip-link]");
      assert.equal(
        await skip.evaluate((el) => el === document.activeElement),
        true
      );
      const focus = await skip.evaluate((el) => {
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return {
          outline: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
          opacity: style.opacity,
          inViewport:
            rect.left >= 0 &&
            rect.top >= 0 &&
            rect.right <= window.innerWidth &&
            rect.bottom <= window.innerHeight
        };
      });
      assert.notEqual(focus.outline, "none");
      assert(focus.width >= 2);
      assert.equal(focus.opacity, "1");
      assert.equal(focus.inViewport, true);
      await page.keyboard.press("Enter");
      await page.waitForFunction(
        () => window.location.hash === "#main-content"
      );
      await page.keyboard.press("Tab");
      assert.equal(
        await page.evaluate(() =>
          document.querySelector("main").contains(document.activeElement)
        ),
        true,
        "The skip link must move sequential keyboard navigation past the header."
      );
    });
  }

  const home =
    [...found].find((route) => route === origin.pathname) ?? routes[0];
  await check("compact menu works with keyboard at 320px", async () => {
    await page.setViewportSize({ width: 320, height: 700 });
    await load(page, home);
    const toggle = page.locator("header [data-mobile-navigation] > summary");
    await toggle.focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page
        .locator("header [data-mobile-navigation]")
        .getAttribute("open"),
      ""
    );
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () =>
          document.activeElement.closest('nav[data-placement="mobile"]') !==
          null
      ),
      true
    );
    await audit(page, home, "compact menu expanded");
    await toggle.focus();
    await page.keyboard.press("Space");
    assert.equal(
      await page
        .locator("header [data-mobile-navigation]")
        .getAttribute("open"),
      null
    );
  });

  await check(
    "reduced motion defaults to still and explicit choices persist",
    async () => {
      await load(page, home);
      const settings = page.locator("[data-experience-control]").first();
      await settings.locator("summary").click();
      await settings.getByRole("radio", { name: /^Immersive/i }).check();
      await settings.locator("summary").click();
      await page
        .locator("[data-scenery-control]")
        .waitFor({ state: "visible" });
      assert.equal(
        await page.locator("html").getAttribute("data-scenery-motion"),
        "still"
      );
      const effectStates = await page
        .locator("[data-scenery-effect]")
        .evaluateAll((elements) =>
          elements.map(
            (element) => getComputedStyle(element).animationPlayState
          )
        );
      assert(effectStates.every((state) => state === "paused"));
      await page.getByRole("radio", { name: "Still", exact: true }).focus();
      await page.keyboard.press("ArrowLeft");
      assert.equal(
        await page.locator("html").getAttribute("data-scenery-motion"),
        "motion"
      );
      await page.keyboard.press("ArrowRight");
      await page.reload();
      assert.equal(
        await page.locator("html").getAttribute("data-scenery-motion"),
        "still"
      );
    }
  );

  await check(
    "floating skip link leaves enlarged footer controls unobscured",
    async () => {
      await page.setViewportSize({ width: 320, height: 900 });
      await load(page, home);
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "200%";
      });
      await settleLayout(page);
      const radio = page.getByRole("radio", { name: "Motion", exact: true });
      await radio.evaluate((input) => {
        const label = input.closest("label").getBoundingClientRect();
        const skip = document
          .querySelector("[data-skip-link]")
          .getBoundingClientRect();
        window.scrollTo(
          0,
          window.scrollY +
            label.top +
            label.height / 2 -
            (skip.top + skip.height / 2)
        );
      });
      await settleLayout(page);
      await radio.focus();
      await settleLayout(page);
      const target = await radio.evaluate((input) => {
        const label = input.closest("label");
        const rectangle = label.getBoundingClientRect();
        const skip = document.querySelector("[data-skip-link]");
        const floating = skip.getBoundingClientRect();
        const left = Math.max(rectangle.left, floating.left);
        const right = Math.min(rectangle.right, floating.right);
        const top = Math.max(rectangle.top, floating.top);
        const bottom = Math.min(rectangle.bottom, floating.bottom);
        const point = { x: (left + right) / 2, y: (top + bottom) / 2 };
        const hit = document.elementFromPoint(point.x, point.y);
        return {
          focused: document.activeElement === input,
          intersectsFloatingGeometry: right > left && bottom > top,
          targetReceivesPointer: hit !== null && label.contains(hit),
          floatingVisible: skip.dataset.floatingVisible,
          mainHasTabindex: document
            .querySelector("main")
            .hasAttribute("tabindex")
        };
      });
      assert.equal(target.focused, true);
      assert.equal(
        target.intersectsFloatingGeometry,
        true,
        "The regression must position a control under the floating geometry."
      );
      assert.equal(
        target.targetReceivesPointer,
        true,
        "The fixed link must not intercept the focused control's clickable label."
      );
      assert.equal(target.floatingVisible, "false");
      assert.equal(target.mainHasTabindex, false);
    }
  );

  const resume = [...found].find((route) => /\/resume\/?$/.test(route));
  if (resume) {
    await check(
      "resume print presentation stays legible without navigation or effects",
      async () => {
        await load(page, resume);
        await page.emulateMedia({ media: "print" });
        await settleLayout(page);
        await page.waitForFunction(
          () => {
            const style = getComputedStyle(document.body);
            return (
              style.backgroundColor === "rgb(255, 255, 255)" &&
              style.display === "block"
            );
          },
          { timeout: 5_000 }
        );
        assert.equal(await page.locator("body > header").isVisible(), false);
        assert.equal(await page.locator("body > footer").isVisible(), false);
        assert.equal(await page.locator("[data-skip-link]").isVisible(), false);
        const print = await page.locator("body").evaluate((el) => ({
          background: getComputedStyle(el).backgroundColor,
          color: getComputedStyle(el).color,
          fontSize: parseFloat(getComputedStyle(el).fontSize),
          display: getComputedStyle(el).display
        }));
        assert.equal(print.background, "rgb(255, 255, 255)");
        assert.equal(print.color, "rgb(27, 33, 30)");
        assert.equal(print.display, "block");
        assert(
          Math.abs(print.fontSize - 13.3333) < 0.1,
          "Print body text must keep its intended 10pt size."
        );
        assert.equal(
          await page
            .locator("main h1")
            .evaluate((el) => getComputedStyle(el).fontSize),
          "32px"
        );
        if (output)
          await page.screenshot({
            path: path.join(output, "resume-print.png"),
            fullPage: true
          });
        await page.emulateMedia({ media: "screen" });
      }
    );
  }

  const contact = [...found].find((route) => /\/contact\/?$/.test(route));
  if (contact) {
    await check(
      "contact form has an accessible configured or unavailable state",
      async () => {
        await load(page, contact);
        const configured = await page
          .locator("form[data-contact-form]")
          .getAttribute("data-site-key");
        const submit = page.locator("[data-contact-submit]");
        if (configured) {
          await submit.waitFor({ state: "visible" });
          await page.waitForFunction(
            () => !document.querySelector("[data-contact-submit]").disabled
          );
          await submit.focus();
          await page.keyboard.press("Enter");
          await page.locator("#contact-errors").waitFor({ state: "visible" });
          assert.equal(
            await page
              .locator("#contact-errors")
              .evaluate((el) => el === document.activeElement),
            true
          );
          assert.equal(requests.length, 0, "Invalid form must not submit.");
          await audit(page, contact, "validation errors");
          await page.locator("#contact-name").fill("Accessibility Test");
          await page.locator("#contact-email").fill("browser@example.test");
          await page
            .locator("#contact-message")
            .fill(
              "A synthetic inquiry for the production accessibility release check."
            );
          await submit.focus();
          await page.keyboard.press("Enter");
          await page.waitForFunction(
            () =>
              document.querySelector("[data-contact-status]").dataset.state ===
              "success"
          );
          assert.deepEqual(
            requests,
            ["POST"],
            "The valid form must make exactly one intercepted request."
          );
          assert.equal(await page.locator("#contact-name").inputValue(), "");
          assert.equal(await page.locator("#contact-email").inputValue(), "");
          assert.equal(await page.locator("#contact-message").inputValue(), "");
          assert.equal(
            await page.locator("#contact-errors").isVisible(),
            false
          );
          assert.equal(
            await page
              .locator("[data-contact-status]")
              .evaluate((element) => element === document.activeElement),
            true
          );
          await audit(page, contact, "successful mocked delivery");
        } else {
          assert.equal(await submit.isDisabled(), true);
          assert(
            await page
              .getByRole("link", { name: "Connect on LinkedIn" })
              .isVisible()
          );
        }
      }
    );
  }
  await context.close();

  const noScript = await prepareContext(browser, { javaScriptEnabled: false });
  const fallback = await noScript.newPage();
  for (const route of found) {
    await check(`${route} remains readable without JavaScript`, async () => {
      await fallback.setViewportSize({ width: 320, height: 900 });
      const response = await fallback.goto(new URL(route, origin).href);
      assert(response);
      assert.equal(response.status(), expectedPageStatus(route));
      assert(await fallback.locator("main h1").isVisible());
      assert.equal(
        await fallback.locator("[data-scenery-control]").isVisible(),
        false
      );
      if (route === contact)
        assert.equal(
          await fallback.locator("[data-contact-submit]").isDisabled(),
          true
        );
    });
  }
  await noScript.close();
  assert.deepEqual(browserErrors, [], "Browser runtime errors occurred.");
  assert.deepEqual(browserConsole, [], "Browser warnings or errors occurred.");
} finally {
  await browser.close();
  if (output) {
    await writeFile(
      path.join(output, "accessibility.json"),
      JSON.stringify(
        {
          checks: checks.length,
          failures,
          browserErrors,
          browserConsole,
          expectedNotFoundConsoleEvents,
          audits,
          limitations: [
            "Automated checks do not certify WCAG conformance or replace human screen-reader review.",
            "200% root text resizing and a 320 CSS-pixel viewport test text/reflow behavior; browser UI zoom is a separate manual check.",
            "Provider scripts and contact responses are test adapters; no real provider or email delivery is exercised.",
            "Review axe incomplete results manually, including image/gradient-dependent contrast."
          ]
        },
        null,
        2
      )
    );
  }
}
assert.deepEqual(failures, [], "Browser accessibility release checks failed.");
process.stdout.write(
  `Accessibility release verification: ${checks.length} checks passed.\n`
);
