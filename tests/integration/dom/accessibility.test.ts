import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import Home from "../../../src/pages/index.astro";
import About from "../../../src/pages/about.astro";
import Resume from "../../../src/pages/resume.astro";
import Work from "../../../src/pages/work/index.astro";
import Contact from "../../../src/pages/contact.astro";
import BaseLayout from "../../../src/layouts/BaseLayout.astro";
import CaseStudyLayout from "../../../src/layouts/CaseStudyLayout.astro";
import ContactForm from "../../../src/components/contact/ContactForm.astro";
import type { LoadedPortfolioContent } from "../../../src/lib/content/loadPortfolioForBuild";
import {
  createPortfolioContent,
  testContactProps
} from "../../fixtures/portfolio";
import { mountHtml } from "../../helpers/dom";
import { auditAccessibility } from "../../helpers/accessibility";

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
  { name: "Home", path: "/", component: Home },
  { name: "About", path: "/about/", component: About },
  { name: "Resume", path: "/resume/", component: Resume },
  { name: "Work", path: "/work/", component: Work },
  { name: "Contact", path: "/contact/", component: Contact }
] as const;

async function expectAccessible(): Promise<void> {
  const result = await auditAccessibility();
  expect(
    result.violations.map(({ id, nodes }) => ({
      id,
      targets: nodes.map((node) => node.target)
    }))
  ).toEqual([]);
  expect(result.passes.length).toBeGreaterThan(10);
}

describe("automated semantic accessibility of rendered Astro pages", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });
  beforeEach(() => {
    state.content = createPortfolioContent();
  });

  it.each(pages)(
    "$name passes the enabled WCAG/semantic axe rules",
    async (page) => {
      mountHtml(
        await container.renderToString(page.component, {
          request: new Request(`https://portfolio.test${page.path}`),
          partial: false
        })
      );
      await expectAccessible();
    }
  );

  it("the authored case-study template passes with section navigation and workflow", async () => {
    const caseStudy = state.content!.caseStudies[0];
    mountHtml(
      await container.renderToString(CaseStudyLayout, {
        request: new Request(`https://portfolio.test/work/${caseStudy.slug}`),
        props: { caseStudy },
        partial: false
      })
    );
    await expectAccessible();
  });

  it("the empty Work collection retains accessible recovery content", async () => {
    state.content!.caseStudies = [];
    mountHtml(
      await container.renderToString(Work, {
        request: new Request("https://portfolio.test/work/"),
        partial: false
      })
    );
    await expectAccessible();
  });

  it("an expanded compact menu retains semantic navigation", async () => {
    mountHtml(
      await container.renderToString(Home, {
        request: new Request("https://portfolio.test/"),
        partial: false
      })
    );
    // jsdom does not evaluate responsive styles; emulate the compact layout's
    // hidden desktop navigation before auditing the expanded mobile disclosure.
    document.querySelector<HTMLElement>(
      'nav[data-placement="header"]'
    )!.parentElement!.hidden = true;
    document.querySelector<HTMLDetailsElement>("header details")!.open = true;
    await expectAccessible();
  });

  it("contact remains accessible when no verification key is configured", async () => {
    const form = await container.renderToString(ContactForm, {
      props: { ...testContactProps, siteKey: "" }
    });
    mountHtml(
      await container.renderToString(BaseLayout, {
        request: new Request("https://portfolio.test/contact/"),
        props: { title: "Contact | Example" },
        slots: { default: `<h1>Contact</h1>${form}` },
        partial: false
      })
    );
    await expectAccessible();
  });
});
