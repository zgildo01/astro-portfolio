import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getByRole, getAllByRole, within } from "@testing-library/dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import Home from "../../../src/pages/index.astro";
import About from "../../../src/pages/about.astro";
import Resume from "../../../src/pages/resume.astro";
import Work from "../../../src/pages/work/index.astro";
import Contact from "../../../src/pages/contact.astro";
import CaseStudyLayout from "../../../src/layouts/CaseStudyLayout.astro";
import BaseLayout from "../../../src/layouts/BaseLayout.astro";
import { siteConfig } from "../../../src/config/site";
import { pageMetadata } from "../../../src/config/pageMetadata";
import type { LoadedPortfolioContent } from "../../../src/lib/content/loadPortfolioForBuild";
import { createPortfolioContent } from "../../fixtures/portfolio";
import { mountHtml } from "../../helpers/dom";
import {
  expectDocumentStructure,
  expectResolvedReferences,
  expectSafeDocumentLinks
} from "../../helpers/pageAssertions";

const state = vi.hoisted(() => ({
  content: undefined as LoadedPortfolioContent | undefined
}));
vi.mock("../../../src/lib/content/loadPortfolioForBuild", () => ({
  loadPortfolioForBuild: vi.fn(async () => state.content)
}));
vi.mock("../../../src/config/contact", () => ({
  contactConfig: {
    turnstileSiteKey: "1x00000000000000000000AA",
    linkedin: "https://www.linkedin.com/in/example/",
    github: "https://github.com/example"
  }
}));

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
const pages = [
  {
    name: "Home",
    path: "/",
    component: Home,
    title: pageMetadata.home.title,
    heading: siteConfig.name,
    current: "/"
  },
  {
    name: "About",
    path: "/about/",
    component: About,
    title: pageMetadata.about.title,
    heading: "About",
    current: "/about"
  },
  {
    name: "Resume",
    path: "/resume/",
    component: Resume,
    title: "Alex Example | Resume",
    heading: "Alex Example",
    current: "/resume"
  },
  {
    name: "Work",
    path: "/work/",
    component: Work,
    title: pageMetadata.work.title,
    heading: "Work",
    current: "/work"
  },
  {
    name: "Contact",
    path: "/contact/",
    component: Contact,
    title: pageMetadata.contact.title,
    heading: "Contact",
    current: "/contact"
  }
] as const;

async function render(page: (typeof pages)[number]): Promise<void> {
  mountHtml(
    await container.renderToString(page.component, {
      request: new Request(`https://portfolio.test${page.path}`),
      partial: false
    })
  );
}

describe("professional page DOM contracts", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });
  beforeEach(() => {
    state.content = createPortfolioContent();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(pages)(
    "$name exposes one coherent document and main landmark",
    async (page) => {
      await render(page);
      expectDocumentStructure();
      expect(document.title).toBe(page.title);
      expect(
        getByRole(document.body, "heading", { level: 1 }).textContent
      ).toBe(page.heading);
      expect(
        document.querySelector('meta[name="viewport"]')?.getAttribute("content")
      ).toBe("width=device-width");
      expect(
        document.querySelector('link[rel="icon"]')?.getAttribute("href")
      ).toBe("/favicon.svg");
      expect(document.querySelectorAll("astro-island")).toHaveLength(0);
    }
  );

  it.each(pages)(
    "$name resolves labels, descriptions and fragment targets without duplicate IDs",
    async (page) => {
      await render(page);
      expectResolvedReferences();
      expectSafeDocumentLinks();
      const skip =
        document.querySelector<HTMLAnchorElement>("[data-skip-link]")!;
      expect(skip.hash).toBe("#main-content");
      expect(document.getElementById(skip.hash.slice(1))?.tagName).toBe("MAIN");
    }
  );

  it.each(pages)(
    "$name keeps the correct destination current in every shell navigation",
    async (page) => {
      await render(page);
      const navigation = document.querySelectorAll("nav[data-placement]");
      expect(navigation).toHaveLength(3);
      for (const nav of navigation) {
        const links = [...nav.querySelectorAll("a")];
        expect(links.map((a) => a.textContent?.trim())).toEqual(
          siteConfig.primaryNavigation.map((item) => item.label)
        );
        expect(
          links.filter((a) => a.hasAttribute("aria-current"))
        ).toHaveLength(1);
        const current = nav.querySelector("a[aria-current]")!;
        expect(current.getAttribute("href")).toBe(page.current);
        expect(current.getAttribute("aria-current")).toBe("page");
      }
    }
  );

  it.each(pages)(
    "$name has useful navigation and content before client scripts run",
    async (page) => {
      await render(page);
      const main = getByRole(document.body, "main");
      expect(main.textContent?.trim().length).toBeGreaterThan(70);
      expect(
        getAllByRole(document.body, "navigation").length
      ).toBeGreaterThanOrEqual(2);
      const disclosure = document.querySelector("body > header details")!;
      expect(disclosure.hasAttribute("open")).toBe(false);
      expect(disclosure.querySelector("summary")?.textContent?.trim()).toBe(
        "Menu"
      );
      expect(disclosure.querySelectorAll("a")).toHaveLength(5);
      expect(document.documentElement.dataset.sceneryMotion).toBe("still");
    }
  );

  it("keeps every homepage recruiter action reachable in one link", async () => {
    await render(pages[0]);
    const main = getByRole(document.body, "main");
    expect(
      within(main)
        .getByRole("link", { name: "View my resume" })
        .getAttribute("href")
    ).toBe("/resume");
    expect(
      within(main)
        .getByRole("link", { name: "View selected work" })
        .getAttribute("href")
    ).toBe("/work");
    expect(
      within(main)
        .getByRole("link", { name: "Contact me" })
        .getAttribute("href")
    ).toBe("/contact");
  });

  it.each(pages)(
    "$name keeps decorative scenery out of the accessibility tree",
    async (page) => {
      await render(page);
      const scenery = document.querySelector("[data-scenery-environment]");
      if (page.name === "Resume") {
        expect(scenery).toBeNull();
        expect(document.querySelector("[data-scenery-control]")).toBeNull();
      } else {
        expect(scenery?.getAttribute("aria-hidden")).toBe("true");
        for (const image of scenery!.querySelectorAll("img"))
          expect(image.alt).toBe("");
        expect(
          document.querySelector<HTMLFieldSetElement>("[data-scenery-control]")
            ?.hidden
        ).toBe(true);
      }
    }
  );

  it("provides descriptive alternative text for editorial images", async () => {
    for (const page of [pages[0], pages[1]]) {
      await render(page);
      const images = getByRole(document.body, "main").querySelectorAll("img");
      expect(images.length).toBeGreaterThan(0);
      for (const image of images) {
        expect(image.alt.length).toBeGreaterThan(30);
        expect(Number(image.getAttribute("width"))).toBeGreaterThan(0);
        expect(Number(image.getAttribute("height"))).toBeGreaterThan(0);
      }
    }
  });

  it.each([
    ["/work/shared-tooling", "/work", "location"],
    ["/work/shared-tooling/", "/work", "location"],
    ["/work/shared-tooling/implementation", "/work", "location"],
    ["/workshop", null, null],
    ["/resume-copy", null, null],
    ["/contact-us", null, null],
    ["/aboutness", null, null]
  ])(
    "uses path boundaries for navigation at %s",
    async (path, current, aria) => {
      mountHtml(
        await container.renderToString(BaseLayout, {
          request: new Request(`https://portfolio.test${path}`),
          props: { title: "Route contract" },
          slots: { default: "<h1>Route contract</h1>" },
          partial: false
        })
      );
      for (const nav of document.querySelectorAll("nav[data-placement]")) {
        const links = nav.querySelectorAll("a[aria-current]");
        expect(links).toHaveLength(current ? 1 : 0);
        if (current) {
          expect(links[0].getAttribute("href")).toBe(current);
          expect(links[0].getAttribute("aria-current")).toBe(aria);
        }
      }
    }
  );

  it("renders a case study within the same professional document contracts", async () => {
    const caseStudy = state.content!.caseStudies[0];
    mountHtml(
      await container.renderToString(CaseStudyLayout, {
        request: new Request(`https://portfolio.test/work/${caseStudy.slug}`),
        props: { caseStudy },
        partial: false
      })
    );
    expectDocumentStructure();
    expectResolvedReferences();
    expectSafeDocumentLinks();
    expect(document.title).toContain(caseStudy.title);
    expect(
      getByRole(document.body, "navigation", { name: "Breadcrumb" })
    ).not.toBeNull();
    expect(
      getByRole(document.body, "navigation", { name: "On this page" })
    ).not.toBeNull();
  });

  it("keeps every internal content link inside the rendered route graph", async () => {
    const routes = new Set(
      pages.map((page) => page.path.replace(/\/$/, "") || "/")
    );
    for (const entry of state.content!.caseStudies)
      routes.add(`/work/${entry.slug}`);
    for (const page of pages) {
      await render(page);
      for (const link of document.querySelectorAll<HTMLAnchorElement>(
        "a[href]"
      )) {
        const raw = link.getAttribute("href")!;
        const destination = new URL(raw, `https://portfolio.test${page.path}`);
        if (
          destination.origin !== "https://portfolio.test" ||
          raw.startsWith("#")
        )
          continue;
        expect(
          routes.has(destination.pathname.replace(/\/$/, "") || "/"),
          `${page.name}: ${raw}`
        ).toBe(true);
      }
    }
  });

  it("prefixes page actions, navigation, and document assets for a subdirectory deployment", async () => {
    vi.stubEnv("BASE_URL", "/portfolio/");
    mountHtml(
      await container.renderToString(Home, {
        request: new Request("https://portfolio.test/portfolio/"),
        partial: false
      })
    );
    expect(
      document.querySelector('link[rel="icon"]')?.getAttribute("href")
    ).toBe("/portfolio/favicon.svg");
    for (const link of document.querySelectorAll<HTMLAnchorElement>(
      'a[href^="/"]'
    )) {
      expect(link.getAttribute("href")).toMatch(/^\/portfolio\//);
    }
    for (const navigation of document.querySelectorAll("nav[data-placement]")) {
      expect(
        navigation.querySelector('a[aria-current="page"]')?.getAttribute("href")
      ).toBe("/portfolio/");
    }
  });

  it("escapes shell metadata without creating executable or extra head elements", async () => {
    const title = '</title><script>unsafe()</script> & "Example"';
    const description = '"><img src=x onerror="unsafe()">';
    mountHtml(
      await container.renderToString(BaseLayout, {
        request: new Request("https://portfolio.test/"),
        props: { title, description },
        slots: { default: "<h1>Safe page</h1>" },
        partial: false
      })
    );
    expect(document.title).toBe(title);
    expect(document.head.querySelectorAll("title")).toHaveLength(1);
    expect(document.head.querySelector("script,img,[onerror]")).toBeNull();
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
    ).toBe(description);
  });
});
