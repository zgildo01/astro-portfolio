import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getByRole, within } from "@testing-library/dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import WorkIndex from "../../../src/pages/work/index.astro";
import { getStaticPaths } from "../../../src/pages/work/[slug].astro";
import CaseStudyLayout from "../../../src/layouts/CaseStudyLayout.astro";
import { parseWorkMarkdown } from "../../../src/lib/work/parseWorkMarkdown";
import {
  WorkValidationError,
  type CaseStudy
} from "../../../src/lib/work/types";
import { createCaseStudy } from "../../fixtures/portfolio";
import { mountHtml } from "../../helpers/dom";
import {
  expectDocumentStructure,
  expectResolvedReferences,
  expectSafeDocumentLinks
} from "../../helpers/pageAssertions";

const state = vi.hoisted(() => ({
  cases: [] as CaseStudy[],
  failure: undefined as Error | undefined
}));
vi.mock("../../../src/lib/content/loadPortfolioForBuild", () => ({
  loadPortfolioForBuild: vi.fn(async () => {
    if (state.failure) throw state.failure;
    return { caseStudies: state.cases };
  })
}));

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
async function renderIndex(): Promise<HTMLElement> {
  mountHtml(
    await container.renderToString(WorkIndex, {
      request: new Request("https://portfolio.test/work/"),
      partial: false
    })
  );
  return getByRole(document.body, "main");
}
async function renderCase(caseStudy = state.cases[0]): Promise<HTMLElement> {
  mountHtml(
    await container.renderToString(CaseStudyLayout, {
      request: new Request(`https://portfolio.test/work/${caseStudy.slug}/`),
      props: { caseStudy },
      partial: false
    })
  );
  return getByRole(document.body, "main");
}
function note(status = "published"): string {
  return `---
schemaVersion: 1
status: ${status}
slug: authored-tooling
title: Authored tooling reference
description: A synthetic published note travels through the real parser and templates.
organization: Example Organization
category: Developer tooling
role: Implementation and documentation
technologies:
  - Python
  - Markdown
workflow:
  section: approach
  steps:
    - Read source comments
    - Generate reference files
---

## The problem

Engineers needed to understand existing capabilities.

## My contribution

I implemented the reference generator.

## The approach

The generator reads documented source comments.

## The outcome

The team used the generated material to coordinate development.
`;
}

describe("case-study content to listing and detail DOM", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });
  beforeEach(() => {
    state.cases = [createCaseStudy()];
    state.failure = undefined;
  });

  it("renders the real parsed published note into a matching card and static route", async () => {
    const parsed = parseWorkMarkdown(note());
    expect(parsed).not.toBeNull();
    state.cases = [parsed!];
    const paths = await getStaticPaths();
    const main = await renderIndex();
    const link = within(main).getByRole("link", { name: parsed!.title });
    expect(
      new URL(link.getAttribute("href")!, "https://portfolio.test").pathname
    ).toBe(`/work/${paths[0].params.slug}`);
    expect(paths[0].props.caseStudy).toEqual(parsed);
    await renderCase(parsed!);
    expect(document.querySelector("h1")?.textContent).toBe(parsed!.title);
    expect(
      document.querySelector("#approach")?.closest("section")?.textContent
    ).toContain("Read source comments");
  });

  it("accepts publication capitalization without losing routes or content", async () => {
    for (const status of ["Published", "PUBLISHED", '" published "']) {
      const parsed = parseWorkMarkdown(note(status));
      expect(parsed).not.toBeNull();
      state.cases = [parsed!];
      const main = await renderIndex();
      expect(
        within(main).getByRole("link", { name: parsed!.title })
      ).not.toBeNull();
      expect(await getStaticPaths()).toHaveLength(1);
    }
  });

  it("keeps draft and unmarked authored notes out of both listing and route collection", async () => {
    for (const source of [
      note("draft"),
      note("Draft"),
      note("DRAFT"),
      note().replace("status: published\n", ""),
      "A private note without publication metadata."
    ]) {
      const parsed = parseWorkMarkdown(source);
      expect(parsed).toBeNull();
      state.cases = parsed ? [parsed] : [];
      const main = await renderIndex();
      expect(
        within(main).queryByRole("link", { name: "Authored tooling reference" })
      ).toBeNull();
      expect(await getStaticPaths()).toEqual([]);
      expect(main.textContent).toContain("Case studies in preparation");
    }
  });

  it("does not convert invalid published content into a successful empty listing", async () => {
    expect(() =>
      parseWorkMarkdown(
        note().replace("title: Authored tooling reference\n", "")
      )
    ).toThrow(WorkValidationError);
    state.failure = new Error("The work content could not be validated.");
    await expect(renderIndex()).rejects.toThrow(
      "The work content could not be validated."
    );
    await expect(getStaticPaths()).rejects.toThrow(
      "The work content could not be validated."
    );
  });

  it("preserves all entries and their authored order when the collection grows", async () => {
    state.cases = [
      createCaseStudy({ slug: "first-case", title: "First case" }),
      createCaseStudy({
        slug: "second-case",
        title: "Second case",
        organization: "Another organization"
      }),
      createCaseStudy({
        slug: "third-case",
        title: "Third case",
        technologies: ["Bash", "Git"]
      })
    ];
    const main = await renderIndex();
    const links = [
      ...main.querySelectorAll<HTMLAnchorElement>(".work-card h3 a")
    ];
    expect(
      links.map((link) => link.textContent?.trim().replace(/\s*↗$/, ""))
    ).toEqual(state.cases.map((entry) => entry.title));
    const paths = await getStaticPaths();
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      paths.map((entry) => `/work/${entry.params.slug}`)
    );
    expect(paths).toEqual(
      state.cases.map((caseStudy) => ({
        params: { slug: caseStudy.slug },
        props: { caseStudy }
      }))
    );
    expect(main.querySelectorAll(".work-card")).toHaveLength(3);
  });

  it("renders honest recovery routes when no case studies are published", async () => {
    state.cases = [];
    const main = await renderIndex();
    const empty = within(main).getByRole("heading", {
      name: "Case studies in preparation"
    }).parentElement!;
    expect(
      within(empty)
        .getByRole("link", { name: "View my resume" })
        .getAttribute("href")
    ).toBe("/resume");
    expect(main.querySelector(".work-list__items")).toBeNull();
    expect(main.querySelector(".work-card")).toBeNull();
    expect(await getStaticPaths()).toEqual([]);
    expect(main.textContent).not.toContain(createCaseStudy().title);
  });

  it("renders authored metadata, definition-list facts, and every section's content", async () => {
    const entry = state.cases[0];
    const main = await renderCase();
    const facts = main.querySelector("dl")!;
    const pairs = [...facts.querySelectorAll("div")].map((group) => [
      group.querySelector("dt")?.textContent,
      group.querySelector("dd")?.textContent?.trim()
    ]);
    expect(pairs[0]).toEqual(["Organization", entry.organization]);
    expect(pairs[1]).toEqual(["My role", entry.role]);
    expect(
      [...facts.querySelectorAll("li")].map((item) => item.textContent)
    ).toEqual(entry.technologies);
    expectDocumentStructure();
    expect(main.querySelector("h1")?.textContent).toBe(entry.title);
    expect(document.title).toContain(entry.title);
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
    ).toBe(entry.description);
    expect(main.querySelector(".page-eyebrow")?.textContent).toBe(
      entry.category
    );
    for (const section of entry.sections) {
      expect(main.textContent).toContain(section.title);
      for (const paragraph of section.paragraphs)
        expect(main.textContent).toContain(paragraph);
    }
  });

  it("keeps each content-section heading connected to exactly one table-of-contents link", async () => {
    const entry = createCaseStudy({
      sections: [
        {
          id: "context",
          title: "Project context",
          paragraphs: [
            "The team needed a common reference for its existing tools."
          ],
          workflow: ["Source comments", "Manual generation", "Markdown files"]
        },
        {
          id: "result",
          title: "Project result",
          paragraphs: [
            "Generated files made existing capabilities easier to find."
          ]
        }
      ]
    });
    const main = await renderCase(entry);
    const contents = within(main).getByRole("navigation", {
      name: "On this page"
    });
    expect(
      [...contents.querySelectorAll("a")].map((link) => link.textContent)
    ).toEqual(entry.sections.map((section) => section.title));
    for (const section of entry.sections) {
      const heading = document.getElementById(section.id)!;
      expect(heading.tagName).toBe("H2");
      expect(heading.closest("section")?.getAttribute("aria-labelledby")).toBe(
        section.id
      );
      expect(
        contents.querySelectorAll(`a[href="#${section.id}"]`)
      ).toHaveLength(1);
    }
    expectResolvedReferences();
    expect(
      main
        .querySelector("figure")
        ?.closest("section")
        ?.getAttribute("aria-labelledby")
    ).toBe("context");
    expect(main.querySelector("figure")?.textContent).toContain(
      "Manual generation"
    );
  });

  it("attaches the optional workflow only to its authored content section", async () => {
    const main = await renderCase();
    const workflows = main.querySelectorAll("figure.case-study__workflow");
    expect(workflows).toHaveLength(1);
    expect(
      workflows[0].closest("section")?.getAttribute("aria-labelledby")
    ).toBe("approach");
    expect(workflows[0].querySelector("figcaption")?.textContent).toBe(
      "Workflow"
    );
    expect(
      [...workflows[0].querySelectorAll("li")].map((li) => li.textContent)
    ).toEqual(state.cases[0].sections[2].workflow);
  });

  it("does not create an empty workflow figure when none is authored", async () => {
    const entry = createCaseStudy();
    entry.sections = entry.sections.map((section) => ({
      ...section,
      workflow: undefined
    }));
    const main = await renderCase(entry);
    expect(main.querySelector("figure.case-study__workflow")).toBeNull();
    expect(
      within(main)
        .getByRole("navigation", { name: "On this page" })
        .querySelectorAll("a")
    ).toHaveLength(4);
  });

  it("provides breadcrumb and continuation paths back into the professional site", async () => {
    const main = await renderCase();
    const breadcrumb = within(main).getByRole("navigation", {
      name: "Breadcrumb"
    });
    expect(
      within(breadcrumb)
        .getByRole("link", { name: "Work" })
        .getAttribute("href")
    ).toBe("/work");
    expect(breadcrumb.querySelector('[aria-current="page"]')?.textContent).toBe(
      "Case study"
    );
    for (const [label, path] of [
      ["Back to selected work", "/work"],
      ["View my resume", "/resume"],
      ["Contact me", "/contact"]
    ]) {
      expect(
        within(main).getByRole("link", { name: label }).getAttribute("href")
      ).toBe(path);
    }
    expectSafeDocumentLinks();
  });

  it("supports long localized prose and punctuation without truncating content", async () => {
    const paragraph =
      "Spolupráce týmu usnadnila práci s existujícími nástroji. "
        .repeat(30)
        .trim();
    const entry = createCaseStudy({
      title: "Dokumentace nástrojů — přehled možností",
      sections: [
        { id: "localized", title: "Výsledek", paragraphs: [paragraph] }
      ]
    });
    const main = await renderCase(entry);
    expect(main.querySelector("h1")?.textContent).toBe(entry.title);
    expect(
      main.querySelector(".case-study__body p:not([aria-hidden])")?.textContent
    ).toBe(paragraph);
    expectDocumentStructure();
    expectResolvedReferences();
  });

  it("escapes hostile strings in cards, metadata, facts, technologies, and prose", async () => {
    const entry = createCaseStudy({
      title:
        'Tools <strong>with markup</strong> <img src=x onerror="attack()">',
      description: '<script>attack()</script> <markup> & "quoted" description',
      organization: '<svg onload="attack()">',
      role: '<a href="javascript:attack()">role</a>',
      technologies: ['<iframe src="https://attacker.invalid">'],
      sections: [
        {
          id: "literal-content",
          title: "Literal content",
          paragraphs: ["<script>attack()</script>"],
          workflow: ['<img src=x onerror="attack()">']
        }
      ]
    });
    state.cases = [entry];
    const listing = await renderIndex();
    expect(
      listing.querySelector(
        ".work-card img,.work-card script,.work-card iframe,.work-card strong,.work-card markup,[onerror],[onload]"
      )
    ).toBeNull();
    expect(listing.querySelector(".work-card")?.textContent).toContain(
      entry.title
    );
    expect(listing.querySelector(".work-card")?.textContent).toContain(
      entry.description
    );
    const main = await renderCase(entry);
    expect(
      main.querySelector(
        "script,img,svg,iframe,strong,markup,[onerror],[onload]"
      )
    ).toBeNull();
    expect(main.textContent).toContain(entry.organization);
    expect(main.querySelector("h1")?.textContent).toBe(entry.title);
    expect(main.textContent).toContain(entry.sections[0].paragraphs[0]);
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
    ).toBe(entry.description);
    expect(document.title).toContain(entry.title);
  });
});
