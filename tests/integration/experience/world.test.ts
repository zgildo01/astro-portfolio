import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { JSDOM } from "jsdom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import Company from "../../../src/pages/experience.astro";
import Confidence from "../../../src/pages/experience/confidence.astro";
import Investigation from "../../../src/pages/experience/investigation.astro";
import Explainer from "../../../src/pages/experience/data-and-rights.astro";

vi.mock("../../../src/features/experience/scenes.server", () => ({
  getSceneImages: async () =>
    ["reception", "arrival", "hall"].map((id) => ({
      id,
      src: `/images/${id}.webp`,
      srcSet: `/images/${id}-640.webp 640w, /images/${id}.webp 1280w`,
      width: 1280,
      height: 720
    })),
  sceneById: (scenes: { id: string }[], id: string) =>
    scenes.find((scene) => scene.id === id)
}));

const pages = [
  {
    name: "company",
    component: Company,
    path: "/experience/",
    world: "company"
  },
  {
    name: "confidence",
    component: Confidence,
    path: "/experience/confidence/",
    world: "company"
  },
  {
    name: "investigation",
    component: Investigation,
    path: "/experience/investigation/",
    world: "news"
  },
  {
    name: "explainer",
    component: Explainer,
    path: "/experience/data-and-rights/",
    world: "news"
  }
] as const;

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
const documents: JSDOM[] = [];

beforeAll(async () => {
  container = await AstroContainer.create();
});

afterEach(() => {
  vi.unstubAllEnvs();
  for (const dom of documents.splice(0)) dom.window.close();
});

async function render(page: (typeof pages)[number], base = "/") {
  vi.stubEnv("BASE_URL", base);
  const html = await container.renderToString(page.component, {
    request: new Request(`https://portfolio.test${page.path}`),
    partial: false
  });
  const dom = new JSDOM(html, { url: "https://portfolio.test/" });
  documents.push(dom);
  return dom.window.document;
}

describe("BROOD static world", () => {
  it.each(pages)(
    "$name has a complete independent, non-indexable document without hydration",
    async (page) => {
      const document = await render(page);
      expect(document.documentElement.lang).toBe("en");
      expect(document.documentElement.dataset.experienceWorld).toBe(page.world);
      expect(document.title).toMatch(/Brood Civic Systems|The Civic Margin/);
      expect(
        document.querySelector('meta[name="robots"]')?.getAttribute("content")
      ).toBe("noindex,nofollow");
      expect(
        document
          .querySelector('meta[name="description"]')
          ?.getAttribute("content")
      ).toBeTruthy();
      expect(document.querySelector('link[rel="canonical"]')).toBeNull();
      expect(
        document.querySelector('[property^="og:"],script,astro-island')
      ).toBeNull();
      expect(document.querySelector(".site-header,.site-footer")).toBeNull();
      expect(document.body.textContent).not.toMatch(
        /Zeus Zaragoza|Platform Engineer/
      );
      expect(document.querySelectorAll("main")).toHaveLength(1);
      expect(document.querySelectorAll("main h1")).toHaveLength(1);
      expect(document.querySelector("main")?.hasAttribute("tabindex")).toBe(
        false
      );
      expect(
        document.querySelector(".experience-skip-link")?.getAttribute("href")
      ).toBe("#main-content");
      expect(document.getElementById("main-content")?.tagName).toBe("MAIN");
      expect(document.body.textContent).toMatch(/fictional/i);
    }
  );

  it.each(pages)(
    "$name keeps navigation and a visible portfolio exit under a subdirectory",
    async (page) => {
      const document = await render(page, "/portfolio/");
      const links = Array.from(
        document.querySelectorAll<HTMLAnchorElement>("a")
      );
      const local = links.filter(
        (link) => !link.getAttribute("href")?.startsWith("https:")
      );
      for (const link of local) {
        const href = link.getAttribute("href")!;
        expect(href).toMatch(/^#|^\/portfolio\//);
        expect(href).not.toMatch(/\.html(?:#|$)/);
      }
      expect(
        links.some(
          (link) =>
            link.getAttribute("href") === "/portfolio/#observation-entry" &&
            /Leave this/.test(link.textContent ?? "")
        )
      ).toBe(true);
    }
  );

  it("reveals the console through native operational materials without authentication", async () => {
    const documents = await Promise.all(pages.map((page) => render(page)));
    for (const [index, document] of documents.entries()) {
      const consoleLinks = document.querySelectorAll(
        'a[href="/experience/console/"]'
      );
      expect(consoleLinks).toHaveLength(index === 1 ? 1 : 0);
    }
    const confidence = documents[1];
    const disclosure = confidence.querySelector("details#service-documents");
    expect(disclosure?.querySelector("summary")?.textContent?.trim()).toBe(
      "Operational materials"
    );
    expect(disclosure?.hasAttribute("open")).toBe(false);
    expect(
      disclosure?.querySelector("a#console-entry")?.getAttribute("href")
    ).toBe("/experience/console/");
    expect(confidence.querySelector("form,input,button")).toBeNull();
  });

  it("keeps the investigation fictional while preserving identifiable primary sources", async () => {
    const investigation = await render(pages[2]);
    const explainer = await render(pages[3]);
    expect(investigation.querySelector(".reality-note")?.textContent).toContain(
      "the events below are fictional"
    );
    expect(investigation.querySelector(".reality-note")?.textContent).toContain(
      "not allegations against this invented company"
    );
    const sources = Array.from(
      explainer.querySelectorAll<HTMLAnchorElement>(".source-list a")
    ).map((link) => link.href);
    expect(sources).toEqual([
      "https://consumer.ftc.gov/articles/what-know-about-people-search-sites-sell-your-information",
      "https://www.congress.gov/crs-product/R48667",
      "https://www.edpb.europa.eu/topics/key-gdpr-concepts/basic-principles_en",
      "https://privacy.ca.gov/drop/how-drop-works/",
      "https://europa.eu/youreurope/citizens/consumers/internet-telecoms/data-protection-online-privacy/"
    ]);
    expect(explainer.body.textContent).toContain(
      "rather than an absence of privacy law"
    );
    expect(explainer.body.textContent).toContain("does not invent a location");
    expect(explainer.body.textContent).not.toMatch(
      /offline study|future Worker/
    );
  });

  it("introduces the scenes gradually with responsive images and reserved dimensions", async () => {
    const company = await render(pages[0]);
    const investigation = await render(pages[2]);
    const images = [
      ...company.querySelectorAll<HTMLImageElement>("main img"),
      ...investigation.querySelectorAll<HTMLImageElement>("main img")
    ];
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/images/reception.webp",
      "/images/arrival.webp",
      "/images/hall.webp"
    ]);
    for (const image of images) {
      expect(image.alt.length).toBeGreaterThan(25);
      expect(image.getAttribute("srcset")).toContain("640w");
      expect(image.getAttribute("sizes")).toBeTruthy();
      expect(image.width).toBe(1280);
      expect(image.height).toBe(720);
    }
    expect(images[0].getAttribute("fetchpriority")).toBe("high");
    expect(
      images.slice(1).every((image) => image.getAttribute("loading") === "lazy")
    ).toBe(true);
  });
});
