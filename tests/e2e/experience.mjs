/* global document, window, getComputedStyle */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { URL } from "node:url";
import { gzipSync } from "node:zlib";
import axe from "axe-core";
import { chromium } from "playwright";

const origin = new URL(
  process.env.PORTFOLIO_AUDIT_URL ?? "http://127.0.0.1:4321"
);
const configured = process.env.PORTFOLIO_AUDIT_PATHS
  ? JSON.parse(process.env.PORTFOLIO_AUDIT_PATHS)
  : [
      "/experience/",
      "/experience/confidence/",
      "/experience/investigation/",
      "/experience/data-and-rights/",
      "/experience/console/"
    ];
assert(
  Array.isArray(configured) &&
    configured.length === 5 &&
    configured.every((value) => typeof value === "string"),
  "Experience audit requires its five built routes."
);
const routes = configured.map((route) => {
  const url = new URL(route, origin);
  assert.equal(url.origin, origin.origin);
  return url.pathname;
});
const company = routes.find((route) => /\/experience\/$/.test(route));
const consolePath = routes.find((route) =>
  /\/experience\/console\/$/.test(route)
);
const confidence = routes.find((route) =>
  /\/experience\/confidence\/$/.test(route)
);
assert(
  company && consolePath && confidence,
  "Expected company, confidence, and console routes."
);
const home = company.replace(/experience\/$/, "");
const output = process.env.PORTFOLIO_AUDIT_OUTPUT_DIR;
const checks = [];
const failures = [];
const browserErrors = [];
const browserConsole = [];
const requests = [];
const networkRequests = [];
const performance = {};
const consoleModuleUrls = new Set();
const networkFixture = {
  clientIp: "192.0.2.44",
  country: "XX",
  region: "Test region",
  city: "Test city",
  provider: "Synthetic release adapter",
  source: "Current Worker request",
  locationBasis: "IP-derived; approximate"
};

async function check(name, run) {
  try {
    await run();
    checks.push(name);
    process.stdout.write(`PASS experience: ${name}\n`);
  } catch (error) {
    failures.push({ name, message: error.message });
    process.stderr.write(`FAIL experience: ${name}: ${error.message}\n`);
  }
}

async function contextFor(
  browser,
  options = {},
  observeErrors = true,
  observeRequests = true
) {
  const context = await browser.newContext({
    reducedMotion: "reduce",
    viewport: { width: 1440, height: 1000 },
    ...options
  });
  if (observeRequests)
    context.on("request", (request) =>
      requests.push({
        url: request.url(),
        method: request.method(),
        body: request.postData()
      })
    );
  await context.route("**/api/experience/network", async (route) => {
    networkRequests.push(route.request().method());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(networkFixture)
    });
  });
  if (observeErrors)
    context.on("page", (page) => {
      page.on("pageerror", (error) => browserErrors.push(error.message));
      page.on("console", (message) => {
        if (["warning", "error"].includes(message.type()))
          browserConsole.push({
            level: message.type(),
            message: message.text(),
            location: message.location()
          });
      });
    });
  return context;
}

async function load(page, route) {
  const response = await page.goto(new URL(route, origin).href);
  assert(response);
  assert.equal(response.status(), 200, route);
  await page.locator("main h1").waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function ready(page) {
  await page.locator('.experience-console[data-ready="true"]').waitFor();
}

async function noOverflow(page) {
  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  assert(
    sizes.content <= sizes.viewport + 1,
    `${page.url()} ${JSON.stringify(sizes)}`
  );
}

function reading(page, label) {
  return page
    .locator("dt")
    .filter({ hasText: new RegExp(`^${label}$`) })
    .locator("..")
    .locator("dd");
}

const browser = await chromium.launch({ headless: true });
try {
  const context = await contextFor(browser);
  const page = await context.newPage();
  await check(
    "native discovery advances through company materials and returns to its footer camera",
    async () => {
      await load(page, home);
      assert.equal(
        await page.locator("astro-island").count(),
        0,
        "Professional pages must not hydrate React."
      );
      const camera = page.locator("#observation-entry");
      await camera.scrollIntoViewIfNeeded();
      await camera.focus();
      await page.keyboard.press("Enter");
      await page.waitForURL(new URL(company, origin).href);
      await page.locator(`main a[href="${confidence}"]`).first().click();
      await page.waitForURL(new URL(confidence, origin).href);
      await page.locator("#service-documents > summary").click();
      await page.locator("#console-entry").click();
      await page.waitForURL(new URL(consolePath, origin).href);
      await ready(page);
      await page.locator("#experience-exit").click();
      await page.waitForURL(new URL(`${home}#observation-entry`, origin).href);
      assert.equal(await page.locator("astro-island").count(), 0);
      assert.equal(
        await page
          .locator("#observation-entry")
          .evaluate((element) => element === document.activeElement),
        true
      );
      await page.evaluate(() => {
        window.localStorage.setItem("portfolio-experience-mode", "minimal");
      });
      try {
        await load(page, company);
        await page
          .locator(`header a[href="${home}#observation-entry"]`)
          .click();
        await page.waitForURL(
          new URL(`${home}#observation-entry`, origin).href
        );
        assert.equal(
          await page.locator("#observation-entry").isVisible(),
          false
        );
        await page.waitForFunction(
          () =>
            document.activeElement?.tagName === "A" &&
            document.activeElement.closest("header") !== null
        );
      } finally {
        await page.evaluate(() => window.localStorage.clear());
      }
    }
  );

  await check(
    "all eleven cameras render their own image and preserve one selected input",
    async () => {
      await load(page, consolePath);
      await ready(page);
      const buttons = page
        .getByRole("group", { name: "Camera selection" })
        .getByRole("button");
      assert.equal(await buttons.count(), 11);
      const sources = new Set();
      for (const button of await buttons.all()) {
        await button.click();
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.channel[aria-pressed="true"]')
              .length === 1
        );
        assert.equal(await button.getAttribute("aria-pressed"), "true");
        const selected = page.locator(".feed-image");
        await selected.evaluate((image) => image.decode());
        assert((await selected.getAttribute("alt")).length > 20);
        sources.add(await selected.getAttribute("src"));
        const control =
          (await button.locator(".channel-name").textContent()) ===
          "Control room";
        assert.equal(
          await page.locator(".monitor-window").count(),
          control ? 1 : 0
        );
        if (control)
          assert.equal(await page.locator(".mini-image img").count(), 1);
      }
      assert.equal(
        sources.size,
        11,
        "Each channel needs a distinct retained image."
      );
      assert.equal(await page.locator("#experience-exit").isVisible(), true);
    }
  );

  await check(
    "hold keeps the viewed frame while selections and local time continue; reset clears this session",
    async () => {
      const buttons = page
        .getByRole("group", { name: "Camera selection" })
        .getByRole("button");
      await buttons.nth(0).click();
      const first = await page.locator(".feed-image").getAttribute("src");
      await page
        .getByRole("button", { name: "Hold image", exact: true })
        .click();
      await buttons.nth(4).click();
      assert.equal(
        await page.locator(".feed-image").getAttribute("src"),
        first
      );
      assert.equal(await buttons.nth(4).getAttribute("aria-pressed"), "true");
      assert.match(
        await page.locator(".osd-clock time").textContent(),
        /^\d{2}:\d{2}:\d{2}$/
      );
      await page
        .getByRole("button", { name: "Release image", exact: true })
        .click();
      assert.notEqual(
        await page.locator(".feed-image").getAttribute("src"),
        first
      );
      await page.locator(".experience-console").dispatchEvent("copy");
      await page.waitForFunction(
        () =>
          document.querySelector(".activity-message")?.textContent ===
          "Confidential information must not be shared."
      );
      assert.equal(
        await reading(page, "Information handling").textContent(),
        "Notice issued"
      );
      const before = networkRequests.length;
      await page
        .getByRole("button", { name: "Reset station", exact: true })
        .click();
      await ready(page);
      await page.waitForFunction(
        () =>
          document.querySelector('.channel[aria-pressed="true"] .channel-name')
            ?.textContent === "Waiting area"
      );
      assert.equal(
        await reading(page, "Information handling").textContent(),
        "No incident"
      );
      assert.equal(
        await reading(page, "Actual view entries").textContent(),
        "1"
      );
      await page.waitForFunction(
        () => document.querySelector(".console-loading") === null
      );
      assert.equal(
        networkRequests.length,
        before + 1,
        "Reset attaches exactly one fresh network return."
      );
      const storage = await page.evaluate(() => ({
        local: Object.keys(window.localStorage),
        session: Object.keys(window.sessionStorage)
      }));
      assert.deepEqual(
        storage,
        { local: [], session: [] },
        "Observations must not persist a visitor profile."
      );
    }
  );

  await check(
    "network return is disclosed and reduced motion prevents ambient effects",
    async () => {
      await page
        .getByText("Terminal / network readings", { exact: true })
        .click();
      await page.waitForFunction(() =>
        [...document.querySelectorAll("dd")].some(
          (element) => element.textContent === "192.0.2.44"
        )
      );
      assert.equal(
        await reading(page, "Public connection address").textContent(),
        networkFixture.clientIp
      );
      assert.equal(
        await reading(page, "Network provider").textContent(),
        networkFixture.provider
      );
      assert.equal(
        await page
          .getByRole("checkbox", { name: /Ambient signal/ })
          .isDisabled(),
        true
      );
      assert.equal(
        await page.locator(".experience-console").getAttribute("data-motion"),
        "off"
      );
      assert.equal(
        await page
          .locator(".experience-console .scanlines, .experience-console .roll")
          .count(),
        0
      );
    }
  );

  await check(
    "experience routes reflow at 320px and with enlarged text",
    async () => {
      for (const route of routes) {
        await page.setViewportSize({ width: 320, height: 900 });
        await load(page, route);
        if (route === consolePath) await ready(page);
        await noOverflow(page);
        await page.evaluate(() => {
          document.documentElement.style.fontSize = "200%";
        });
        await noOverflow(page);
        if (route === consolePath) {
          const exit = page.locator("#experience-exit");
          await exit.focus();
          assert.equal(
            await exit.evaluate(
              (element) => getComputedStyle(element).outlineStyle !== "none"
            ),
            true
          );
        }
      }
      await page.evaluate(() => {
        document.documentElement.style.fontSize = "";
      });
    }
  );
  await check(
    "native documents and the hydrated console pass browser accessibility rules",
    async () => {
      for (const route of routes) {
        for (const width of [320, 1440]) {
          await page.setViewportSize({ width, height: 900 });
          await load(page, route);
          if (route === consolePath) {
            await ready(page);
            await page
              .getByText("Terminal / network readings", { exact: true })
              .click();
          }
          await page.evaluate(axe.source);
          const result = await page.evaluate(async () => {
            const { violations, passes } = await window.axe.run(document, {
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
              passedRules: passes.length,
              violations: violations.map(({ id, nodes }) => ({
                id,
                targets: nodes.map(({ target }) => target)
              }))
            };
          });
          assert(result.passedRules > 10);
          assert.deepEqual(result.violations, [], `${route} at ${width}px`);
        }
      }
    }
  );
  await context.close();

  const performanceContext = await contextFor(browser);
  const performancePage = await performanceContext.newPage();
  const scripts = [];
  performancePage.on("response", (response) => {
    if (response.request().resourceType() === "script")
      scripts.push(response.body());
  });
  await check(
    "the optional console stays within its script, transfer, and scene-loading budgets",
    async () => {
      await load(performancePage, consolePath);
      await ready(performancePage);
      for (const island of await performancePage
        .locator("astro-island[component-url]")
        .all()) {
        for (const attribute of ["component-url", "renderer-url"])
          consoleModuleUrls.add(
            new URL(await island.getAttribute(attribute), origin).href
          );
      }
      await performancePage.waitForLoadState("networkidle");
      const scriptBodies = await Promise.all(scripts);
      performance.scriptGzipBytes = scriptBodies.reduce(
        (sum, body) => sum + gzipSync(body).byteLength,
        0
      );
      const measured = await performancePage.evaluate(() => {
        const resources = window.performance.getEntriesByType("resource");
        const navigation = window.performance.getEntriesByType("navigation")[0];
        return {
          encodedTransferBytes: resources.reduce(
            (sum, resource) => sum + resource.encodedBodySize,
            navigation?.encodedBodySize ?? 0
          ),
          sceneRequests: resources
            .filter((resource) =>
              /\/(?:arrival|interior|botanical|signal|control-room|stairwell|office-hall|reception|clinical-bloom|withheld-reflection|closed-passage)[_.]/.test(
                new URL(resource.name).pathname
              )
            )
            .map((resource) => resource.name)
        };
      });
      Object.assign(performance, measured);
      assert(
        performance.scriptGzipBytes > 0 &&
          performance.scriptGzipBytes <= 100 * 1024,
        `Console gzip scripts: ${performance.scriptGzipBytes} bytes.`
      );
      assert(
        measured.encodedTransferBytes > 0 &&
          measured.encodedTransferBytes <= 750 * 1024,
        `Initial encoded transfer: ${measured.encodedTransferBytes} bytes.`
      );
      assert(
        measured.sceneRequests.length >= 1 &&
          measured.sceneRequests.length <= 3,
        `Console must load the selected scene rather than precache its archive: ${measured.sceneRequests.length} image requests.`
      );
    }
  );
  await performanceContext.close();

  const professionalContext = await contextFor(
    browser,
    { reducedMotion: "no-preference" },
    true,
    false
  );
  await professionalContext.route(
    "https://challenges.cloudflare.com/**",
    (route) =>
      route.fulfill({
        contentType: "application/javascript",
        body: 'window.turnstile = {render(){return "isolated-professional-check"},reset(){}};'
      })
  );
  const professional = await professionalContext.newPage();
  const professionalRequests = [];
  professional.on("request", (request) =>
    professionalRequests.push(request.url())
  );
  await check(
    "professional routes never download the console component or React renderer",
    async () => {
      assert(
        consoleModuleUrls.size >= 2,
        "Expected the distinct console component and renderer modules."
      );
      for (const suffix of ["", "about/", "work/", "resume/", "contact/"]) {
        await load(professional, `${home}${suffix}`);
        assert.equal(await professional.locator("astro-island").count(), 0);
      }
      assert.deepEqual(
        professionalRequests.filter((url) => consoleModuleUrls.has(url)),
        []
      );
    }
  );
  await professionalContext.close();

  const localContext = await contextFor(browser, {
    timezoneId: "Asia/Tokyo",
    locale: "en-GB",
    reducedMotion: "no-preference"
  });
  const localPage = await localContext.newPage();
  await check(
    "clock follows browser local time and ambient motion remains optional",
    async () => {
      await load(localPage, consolePath);
      await ready(localPage);
      assert.match(
        await reading(localPage, "Reported time zone").textContent(),
        /Asia\/Tokyo/
      );
      const displayed = await localPage
        .locator(".observer-time")
        .evaluate((element) => ({
          actual: element.textContent,
          expected: new Date(element.dateTime).toLocaleTimeString("en-GB", {
            hour12: false
          })
        }));
      assert.equal(displayed.actual, displayed.expected);
      const ambient = localPage.getByRole("checkbox", {
        name: /Ambient signal/
      });
      assert.equal(await ambient.isDisabled(), false);
      await ambient.check();
      assert.equal(
        await localPage
          .locator(".experience-console")
          .getAttribute("data-motion"),
        "on"
      );
      await ambient.uncheck();
      assert.equal(
        await localPage
          .locator(".experience-console")
          .getAttribute("data-motion"),
        "off"
      );
    }
  );
  await localContext.close();

  const noScript = await contextFor(browser, {
    javaScriptEnabled: false,
    viewport: { width: 320, height: 900 }
  });
  const fallback = await noScript.newPage();
  await check(
    "all routes and the entire retained archive remain usable without JavaScript",
    async () => {
      const before = networkRequests.length;
      for (const route of routes) {
        await load(fallback, route);
        assert.equal(await fallback.locator("main").count(), 1);
        assert.equal(await fallback.locator("h1").count(), 1);
        await noOverflow(fallback);
      }
      await load(fallback, consolePath);
      assert.equal(
        await fallback
          .locator('.experience-console[data-ready="true"]')
          .count(),
        0
      );
      assert.equal(
        await fallback.locator(".equipment-dock").isVisible(),
        false
      );
      await fallback
        .getByText("Open the static scene archive", { exact: true })
        .click();
      const archive = fallback.locator("#retained-views figure");
      assert.equal(await archive.count(), 11);
      for (const figure of await archive.all()) {
        assert.equal(await figure.isVisible(), true);
        assert((await figure.locator("img").getAttribute("alt")).length > 20);
      }
      assert.equal(
        networkRequests.length,
        before,
        "No-JavaScript archive must not request visitor readings."
      );
      await fallback.locator("#experience-exit").click();
      await fallback.waitForURL(
        new URL(`${home}#observation-entry`, origin).href
      );
    }
  );
  await noScript.close();

  const failedScript = await contextFor(browser, {}, false);
  await failedScript.route("**/_astro/*.js*", (route) => route.abort("failed"));
  const disconnected = await failedScript.newPage();
  await check(
    "blocked modules and failed images preserve usable recovery and exit controls",
    async () => {
      await load(disconnected, consolePath);
      assert.equal(
        await disconnected
          .locator('.experience-console[data-ready="true"]')
          .count(),
        0
      );
      await disconnected
        .getByText("Open the static scene archive", { exact: true })
        .click();
      assert.equal(
        await disconnected.locator("#retained-views figure").count(),
        11
      );
      await disconnected.locator("#experience-exit").click();
      await disconnected.waitForURL(
        new URL(`${home}#observation-entry`, origin).href
      );
      assert.equal(await disconnected.locator("main h1").isVisible(), true);
      const imageContext = await contextFor(browser, {
        viewport: { width: 320, height: 900 }
      });
      let failedImage = false;
      await imageContext.route("**/_astro/office-hall*.webp", (route) => {
        if (failedImage) return route.continue();
        failedImage = true;
        return route.fulfill({
          contentType: "image/webp",
          body: "Synthetic invalid image"
        });
      });
      try {
        const imagePage = await imageContext.newPage();
        await load(imagePage, consolePath);
        await ready(imagePage);
        await imagePage
          .getByRole("group", { name: "Camera selection" })
          .getByRole("button")
          .nth(4)
          .click();
        const failure = imagePage.locator(".signal-error");
        await failure.waitFor({ state: "visible" });
        for (const control of [
          failure.getByRole("button", { name: "Retry image", exact: true }),
          failure.getByRole("link", {
            name: "Open retained views",
            exact: true
          })
        ]) {
          await control.scrollIntoViewIfNeeded();
          await control.focus();
          assert.equal(
            await control.evaluate((element) => {
              const rectangle = element.getBoundingClientRect();
              const target = document.elementFromPoint(
                rectangle.left + rectangle.width / 2,
                rectangle.top + rectangle.height / 2
              );
              return element === target || element.contains(target);
            }),
            true,
            "Narrow image-error controls must remain reachable within the scrollable monitor."
          );
        }
        await failure
          .getByRole("button", { name: "Retry image", exact: true })
          .click();
        await failure.waitFor({ state: "detached" });
        await imagePage
          .locator(".feed-image")
          .evaluate((image) => image.decode());
        await noOverflow(imagePage);
        await imagePage.locator("#experience-exit").click();
        await imagePage.waitForURL(
          new URL(`${home}#observation-entry`, origin).href
        );
      } finally {
        await imageContext.close();
      }
    }
  );
  await failedScript.close();

  await check(
    "browser observations never leave this origin or issue writes",
    async () => {
      assert(
        requests.length > 20,
        "Browser request audit must actually observe navigation and assets."
      );
      assert.deepEqual(
        requests.filter(
          (request) => new URL(request.url).origin !== origin.origin
        ),
        []
      );
      assert.deepEqual(
        requests.filter(
          (request) => request.method !== "GET" || request.body !== null
        ),
        []
      );
      assert(networkRequests.length >= 1);
      assert.deepEqual([...new Set(networkRequests)], ["GET"]);
      assert.deepEqual(
        browserErrors,
        [],
        "Unexpected JavaScript runtime errors."
      );
      assert.deepEqual(
        browserConsole,
        [],
        "Unexpected browser warnings or errors."
      );
    }
  );
} finally {
  await browser.close();
  if (output) {
    await mkdir(output, { recursive: true });
    await writeFile(
      path.join(output, "experience.json"),
      JSON.stringify(
        {
          checks: checks.length,
          failures,
          browserErrors,
          browserConsole,
          requestCount: requests.length,
          performance,
          limitations: [
            "Network values use a same-origin synthetic adapter; the Worker is verified separately.",
            "Blocked-module errors are intentional in the isolated load-failure context.",
            "These browser checks do not replace a human visual or screen-reader review."
          ]
        },
        null,
        2
      ) + "\n"
    );
  }
}
assert.deepEqual(failures, [], "Experience browser release checks failed.");
process.stdout.write(
  `Experience release verification: ${checks.length} checks passed.\n`
);
