import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import CaseStudyCard from "../../../src/components/work/CaseStudyCard.astro";
import type { CaseStudy } from "../../../src/lib/work/types";
import CaseStudyLayout from "../../../src/layouts/CaseStudyLayout.astro";
import { getStaticPaths } from "../../../src/pages/work/[slug].astro";
import WorkIndex from "../../../src/pages/work/index.astro";

let container: Awaited<ReturnType<typeof AstroContainer.create>>;

const contentState = vi.hoisted(() => ({ caseStudies: [] as CaseStudy[] }));

vi.mock("../../../src/lib/content/loadPortfolioForBuild", () => ({
  loadPortfolioForBuild: vi.fn(async () => ({
    caseStudies: contentState.caseStudies
  }))
}));

const fixture: CaseStudy = {
  slug: "fixture-documentation",
  title: "A different documentation project",
  description: "A distinct description supplied by the case study entry.",
  organization: "Example organization",
  category: "Engineering tools",
  role: "Extension developer",
  technologies: ["Python", "Markdown"],
  sections: [
    {
      id: "context",
      title: "Project context",
      paragraphs: ["The team needed a common reference for its existing tools."]
    },
    {
      id: "result",
      title: "Project result",
      paragraphs: ["Generated files made existing capabilities easier to find."]
    }
  ]
};

function renderCaseStudy(caseStudy: CaseStudy): Promise<string> {
  return container.renderToString(CaseStudyLayout, {
    request: new Request(`http://localhost/work/${caseStudy.slug}/`),
    props: { caseStudy },
    partial: false
  });
}

describe("work case studies", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  beforeEach(() => {
    contentState.caseStudies = [fixture];
  });

  it("links each published entry to its generated static route", async () => {
    const paths = await getStaticPaths();
    const html = await container.renderToString(WorkIndex, {
      request: new Request("http://localhost/work/"),
      partial: false
    });

    expect(paths).toHaveLength(contentState.caseStudies.length);
    for (const caseStudy of contentState.caseStudies) {
      expect(paths).toContainEqual({
        params: { slug: caseStudy.slug },
        props: { caseStudy }
      });
      expect(html).toMatch(new RegExp(`href="/work/${caseStudy.slug}/?"`));
    }
  });

  it("shows an honest empty state and generates no case-study routes when nothing is published", async () => {
    contentState.caseStudies = [];
    const paths = await getStaticPaths();
    const html = await container.renderToString(WorkIndex, {
      request: new Request("http://localhost/work/"),
      partial: false
    });

    expect(paths).toEqual([]);
    expect(html).toContain("Case studies in preparation");
    expect(html).not.toContain(fixture.title);
    expect(html).not.toContain(`/work/${fixture.slug}`);
  });

  it("renders metadata and content from a supplied entry without a workflow", async () => {
    const html = await renderCaseStudy(fixture);

    expect(html).toContain(fixture.title);
    expect(html).toMatch(
      new RegExp(`<title>[^<]*${fixture.title}[^<]*</title>`)
    );
    expect(html).toContain(
      `<meta name="description" content="${fixture.description}">`
    );
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toContain(fixture.organization);
    expect(html).toContain(fixture.role);
    for (const section of fixture.sections) {
      expect(html).toContain(section.title);
      for (const paragraph of section.paragraphs) {
        expect(html).toContain(paragraph);
      }
    }
    expect(html).not.toContain("<figcaption>Workflow</figcaption>");
  });

  it("gives every case-study section a working in-page navigation target", async () => {
    const html = await renderCaseStudy({
      ...fixture,
      sections: fixture.sections.map((section, index) => ({
        ...section,
        ...(index === 0 && {
          workflow: ["Source comments", "Manual generation", "Markdown files"]
        })
      }))
    });
    const targetIds = [...html.matchAll(/\bid="([^"]*)"/g)].map(([, id]) => id);
    const fragments = [...html.matchAll(/\bhref="#([^"]+)"/g)].map(
      ([, id]) => id
    );

    for (const { id } of fixture.sections) {
      expect(fragments).toContain(id);
      expect(targetIds.filter((target) => target === id)).toHaveLength(1);
    }
    for (const fragment of fragments) {
      expect(targetIds).toContain(fragment);
    }
    expect(html).toContain("Manual generation");
  });

  it("escapes content in both the listing card and the full case study", async () => {
    const untrustedTitle = "Tools <strong>with markup</strong>";
    const untrustedParagraph = '<script>alert("fixture")</script> & examples';
    const entry: CaseStudy = {
      ...fixture,
      title: untrustedTitle,
      description: 'A "quoted" description with <markup> & context.',
      sections: [
        {
          id: "content",
          title: "Source content",
          paragraphs: [untrustedParagraph]
        }
      ]
    };
    const [card, page] = await Promise.all([
      container.renderToString(CaseStudyCard, { props: { caseStudy: entry } }),
      renderCaseStudy(entry)
    ]);

    for (const html of [card, page]) {
      expect(html).toContain("&lt;strong&gt;with markup&lt;/strong&gt;");
      expect(html).not.toContain(untrustedTitle);
      expect(html).toContain("&lt;markup&gt; &amp; context.");
    }
    expect(page).toContain("&lt;script&gt;");
    expect(page).not.toContain(untrustedParagraph);
    expect(page).toContain("&quot;quoted&quot;");
  });
});
