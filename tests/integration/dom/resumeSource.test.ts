import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getByRole, within } from "@testing-library/dom";
import { beforeAll, describe, expect, it, vi } from "vitest";

import Resume from "../../../src/pages/resume.astro";
import { loadPortfolioForBuild } from "../../../src/lib/content/loadPortfolioForBuild";
import { parseResumeMarkdown } from "../../../src/lib/resume/parseResumeMarkdown";
import {
  ResumeValidationError,
  type ResumeDocument
} from "../../../src/lib/resume/types";
import { mountHtml } from "../../helpers/dom";
import {
  expectResolvedReferences,
  expectSafeDocumentLinks
} from "../../helpers/pageAssertions";

const state = vi.hoisted(() => ({
  resume: undefined as ResumeDocument | undefined
}));
vi.mock("../../../src/lib/content/loadPortfolioForBuild", () => ({
  loadPortfolioForBuild: vi.fn(async () => ({
    resume: state.resume,
    sourceCommitSha: "a".repeat(40),
    caseStudies: []
  }))
}));

const source = `---
schema_version: 1
headline: Platform Engineer
email: alex@example.test
---

# Alex Example

## Summary

I build shared delivery tooling and document how it works.

## Experience

### Platform Engineer

Employer: Example Organization
Start: 2025-06
End: present
Location: Remote

- Built release tooling used by multiple teams.

### Software Engineer

Employer: Earlier Organization
Start: 2023-02
End: 2025-06

- Maintained shared engineering workflows.

## Skills

### Platform tooling

- Git
- Python

### Documentation

- Sphinx
`;

const projects = `
## Selected Projects

### Documentation generator

Link: https://example.test/documentation

- Generated **Markdown** from documented Python comments.
- Published [usage guidance](https://example.test/docs?lang=en&version=2).

### Internal release helper

- Coordinated releases without a public repository.
`;

const education = `
## Education

### Engineering degree

Institution: Example University
Completed: 2020-05

### Continuing study

Institution: Example Academy
`;

const certifications = `
## Certifications

### Delivery credential

Issuer: Example Provider
Issued: 2024-01
Expires: 2027-01
Link: https://example.test/credentials/delivery

### Permanent credential

Issuer: Another Provider
Issued: 2023

### Renewable credential

Issuer: Example Foundation
Expires: 2028

### Undated credential

Issuer: Example Institute
`;

let container: Awaited<ReturnType<typeof AstroContainer.create>>;

/** Follow the publication boundary: validate the note before rendering it. */
async function publishSource(markdown: string): Promise<HTMLElement> {
  const resume = parseResumeMarkdown(markdown);
  state.resume = resume;
  mountHtml(
    await container.renderToString(Resume, {
      request: new Request("https://portfolio.test/resume/"),
      partial: false
    })
  );
  return getByRole(document.body, "main");
}

function namedSection(main: HTMLElement, name: string): HTMLElement {
  return within(main)
    .getByRole("heading", { level: 2, name })
    .closest("section")!;
}

describe("resume authoring Markdown through validation and the actual page", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });

  it("publishes a minimal valid note with ordered roles, skills and no invented sections", async () => {
    const main = await publishSource(source);
    expect(within(main).getByRole("heading", { level: 1 }).textContent).toBe(
      "Alex Example"
    );
    expect(document.title).toBe("Alex Example | Resume");
    expect(
      [...main.querySelectorAll(".resume-page__experience-item h3")].map(
        (heading) => heading.textContent
      )
    ).toEqual(["Platform Engineer", "Software Engineer"]);
    expect(
      [...namedSection(main, "Skills").querySelectorAll("li")].map(
        (item) => item.textContent
      )
    ).toEqual(["Git", "Python", "Sphinx"]);
    for (const name of ["Selected projects", "Education", "Certifications"]) {
      expect(within(main).queryByRole("heading", { name })).toBeNull();
    }
    expectResolvedReferences();
  });

  it("publishes quoted YAML contact values and retains public URL query strings", async () => {
    const main = await publishSource(
      source.replace(
        "email: alex@example.test",
        `location: "Prague: Czechia & remote"
email: "alex+portfolio@example.test"
website: "https://example.test/profile?source=resume&lang=cs#work"
linkedin: https://www.linkedin.com/in/example/
github: https://github.com/example`
      )
    );
    const address = main.querySelector("address")!;
    expect(address.textContent).toContain("Prague: Czechia & remote");
    expect(
      [...address.querySelectorAll("a")].map((link) => [
        link.textContent,
        link.getAttribute("href")
      ])
    ).toEqual([
      ["Email", "mailto:alex+portfolio@example.test"],
      ["Website", "https://example.test/profile?source=resume&lang=cs#work"],
      ["LinkedIn", "https://www.linkedin.com/in/example/"],
      ["GitHub", "https://github.com/example"]
    ]);
    expectSafeDocumentLinks();
  });

  it.each([
    {
      field: "email: alex@example.test",
      label: "Email",
      href: "mailto:alex@example.test"
    },
    {
      field: "linkedin: https://linkedin.com/in/example/",
      label: "LinkedIn",
      href: "https://linkedin.com/in/example/"
    }
  ])("supports $label as the sole authored contact route", async (contact) => {
    const main = await publishSource(
      source.replace("email: alex@example.test", contact.field)
    );
    const address = main.querySelector("address")!;
    const links = within(address).getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].textContent).toBe(contact.label);
    expect(links[0].getAttribute("href")).toBe(contact.href);
    expect(address.querySelector("p")).toBeNull();
  });

  it("normalizes Windows and legacy Mac line endings without losing note content", async () => {
    for (const lineEnding of ["\r\n", "\r"]) {
      const main = await publishSource(source.replaceAll("\n", lineEnding));
      expect(within(main).getByRole("heading", { level: 1 }).textContent).toBe(
        "Alex Example"
      );
      expect(namedSection(main, "Summary").textContent).toContain(
        "I build shared delivery tooling and document how it works."
      );
      expect(
        main.querySelectorAll(".resume-page__experience-item")
      ).toHaveLength(2);
    }
  });

  it("carries wrapped paragraphs, emphasis, code and titled links into semantic markup", async () => {
    const main = await publishSource(
      source.replace(
        "I build shared delivery tooling and document how it works.",
        `I build **shared tooling** with *clear ownership* and \`Python\`
for engineering teams.

See [the reference](https://example.test/docs?topic=ci&edition=2 "Platform reference").`
      )
    );
    const paragraphs = main.querySelectorAll<HTMLParagraphElement>(
      ".resume-page__summary p"
    );
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].textContent).toBe(
      "I build shared tooling with clear ownership and Python for engineering teams."
    );
    expect(paragraphs[0].querySelector("strong")?.textContent).toBe(
      "shared tooling"
    );
    expect(paragraphs[0].querySelector("em")?.textContent).toBe(
      "clear ownership"
    );
    expect(paragraphs[0].querySelector("code")?.textContent).toBe("Python");
    const link = within(paragraphs[1]).getByRole("link", {
      name: "the reference"
    });
    expect(link.getAttribute("href")).toBe(
      "https://example.test/docs?topic=ci&edition=2"
    );
    expect(link.getAttribute("title")).toBe("Platform reference");
  });

  it("accepts all single-level bullet markers and joins wrapped achievement text", async () => {
    const main = await publishSource(
      source
        .replace(
          "- Built release tooling used by multiple teams.",
          `- Built **release tooling**
  used by multiple teams.
* Documented the release process.
+ Shared [the runbook](https://example.test/runbook).`
        )
        .replace("- Git\n- Python", "* Git\n+ Python")
    );
    const bullets = main.querySelectorAll<HTMLLIElement>(
      ".resume-page__experience-item:first-child .resume-page__achievements li"
    );
    expect([...bullets].map((item) => item.textContent?.trim())).toEqual([
      "Built release tooling used by multiple teams.",
      "Documented the release process.",
      "Shared the runbook."
    ]);
    expect(bullets[0].querySelector("strong")?.textContent).toBe(
      "release tooling"
    );
    expect(
      within(bullets[2])
        .getByRole("link", { name: "the runbook" })
        .getAttribute("href")
    ).toBe("https://example.test/runbook");
    expect(namedSection(main, "Skills").textContent).toContain("Python");
  });

  it("retains year-only dates without inventing month precision", async () => {
    const main = await publishSource(
      source
        .replace("Start: 2025-06", "Start: 2025")
        .replace("Start: 2023-02", "Start: 2016")
        .replace("End: 2025-06", "End: 2024")
    );
    expect(
      [...namedSection(main, "Experience").querySelectorAll("time")].map(
        (time) => [time.dateTime, time.textContent]
      )
    ).toEqual([
      ["2025", "2025"],
      ["2016", "2016"],
      ["2024", "2024"]
    ]);
    expect(main.querySelector('time[datetime="present"]')).toBeNull();
    expect(namedSection(main, "Experience").textContent).toContain("Present");
  });

  it("publishes a same-month promotion without dropping either role", async () => {
    const main = await publishSource(source);
    const entries = main.querySelectorAll(".resume-page__experience-item");
    expect(
      entries[0].querySelector('time[datetime="2025-06"]')?.textContent
    ).toBe("Jun 2025");
    expect(
      entries[1].querySelector('time[datetime="2025-06"]')?.textContent
    ).toBe("Jun 2025");
    expect(entries[0].textContent).toContain("Remote");
    expect(entries[1].textContent).not.toContain("Remote");
  });

  it("publishes linked and private projects with Markdown achievements", async () => {
    const main = await publishSource(source + projects);
    const section = namedSection(main, "Selected projects");
    expect(
      within(section)
        .getByRole("link", { name: "Documentation generator" })
        .getAttribute("href")
    ).toBe("https://example.test/documentation");
    expect(
      within(section)
        .getByRole("heading", { name: "Internal release helper" })
        .querySelector("a")
    ).toBeNull();
    expect(section.querySelector("strong")?.textContent).toBe("Markdown");
    expect(
      within(section)
        .getByRole("link", { name: "usage guidance" })
        .getAttribute("href")
    ).toBe("https://example.test/docs?lang=en&version=2");
    expectResolvedReferences();
  });

  it("publishes education both with and without a completion date", async () => {
    const main = await publishSource(source + education);
    const entries = namedSection(main, "Education").querySelectorAll(
      ".resume-page__entry"
    );
    expect(entries).toHaveLength(2);
    expect(entries[0].querySelector("time")?.dateTime).toBe("2020-05");
    expect(entries[0].querySelector("time")?.textContent).toBe("May 2020");
    expect(entries[1].querySelector("time")).toBeNull();
    expect(entries[1].textContent).toContain("Example Academy");
    expect(entries[1].textContent).not.toMatch(/Completed|undefined|null/);
  });

  it("publishes credential date combinations and optional verification links", async () => {
    const main = await publishSource(source + certifications);
    const section = namedSection(main, "Certifications");
    const entries = section.querySelectorAll(".resume-page__entry");
    expect(
      [...entries].map((entry) =>
        [...entry.querySelectorAll("time")].map((time) => time.dateTime)
      )
    ).toEqual([["2024-01", "2027-01"], ["2023"], ["2028"], []]);
    expect(
      within(section)
        .getByRole("link", { name: "Delivery credential" })
        .getAttribute("href")
    ).toBe("https://example.test/credentials/delivery");
    expect(entries[1].textContent).toContain("Issued 2023");
    expect(entries[2].textContent).toContain("Expires 2028");
    expect(entries[3].querySelector(".resume-page__metadata")).toBeNull();
    expect(section.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
  });

  it("removes optional sections when a later approved note no longer authors them", async () => {
    let main = await publishSource(
      source + projects + education + certifications
    );
    for (const name of ["Selected projects", "Education", "Certifications"]) {
      expect(within(main).getByRole("heading", { name })).toBeTruthy();
    }
    main = await publishSource(source);
    for (const name of ["Selected projects", "Education", "Certifications"]) {
      expect(within(main).queryByRole("heading", { name })).toBeNull();
    }
    expect(main.querySelectorAll(".resume-page__experience-item")).toHaveLength(
      2
    );
    expectResolvedReferences();
  });

  it("preserves Unicode, punctuation and escaped text without creating executable markup", async () => {
    const main = await publishSource(
      source
        .replace("# Alex Example", '# Žofie "Zo" Nováková & Team')
        .replace(
          "Employer: Example Organization",
          "Employer: Research & Development"
        )
        .replace("- Git\n- Python", "- C++ & C#\n- Python")
        .replace(
          "I build shared delivery tooling and document how it works.",
          String.raw`I document \*literal markers\* and &lt;script&gt; as text; 2 < 3 & 5 > 4. Žádný problém.`
        )
    );
    expect(within(main).getByRole("heading", { level: 1 }).textContent).toBe(
      'Žofie "Zo" Nováková & Team'
    );
    expect(document.title).toBe('Žofie "Zo" Nováková & Team | Resume');
    const summary = main.querySelector(".resume-page__summary")!;
    expect(summary.textContent).toBe(
      "I document *literal markers* and <script> as text; 2 < 3 & 5 > 4. Žádný problém."
    );
    expect(summary.querySelector("em,script")).toBeNull();
    expect(main.textContent).toContain("Research & Development");
    expect(main.textContent).toContain("C++ & C#");
    expect(
      main.querySelector("script,img,iframe,[onload],[onerror]")
    ).toBeNull();
    expectSafeDocumentLinks();
  });

  it.each([
    {
      name: "unfinished authoring prompts",
      markdown: source.replace(
        "Built release tooling used by multiple teams.",
        "[Describe the impact here]"
      )
    },
    {
      name: "Obsidian-only wiki references",
      markdown: source.replace(
        "Built release tooling used by multiple teams.",
        "Documented the process in [[Private release runbook]]."
      )
    },
    {
      name: "unsafe narrative destinations",
      markdown: source.replace(
        "I build shared delivery tooling and document how it works.",
        "Read [the runbook](javascript:alert(1))."
      )
    },
    {
      name: "raw HTML copied into a note",
      markdown: source.replace(
        "I build shared delivery tooling and document how it works.",
        '<img src=x onerror="bad()">'
      )
    },
    {
      name: "nested achievement lists",
      markdown: source.replace(
        "- Built release tooling used by multiple teams.",
        "- Built release tooling.\n  - A nested achievement."
      )
    },
    {
      name: "private network project URLs",
      markdown:
        source +
        projects.replace(
          "https://example.test/documentation",
          "https://127.0.0.1/internal"
        )
    }
  ])(
    "rejects $name before changing a previously rendered page",
    async ({ markdown }) => {
      await publishSource(source);
      const previousHtml = document.documentElement.outerHTML;
      const previousResume = state.resume;
      const previousCalls = vi.mocked(loadPortfolioForBuild).mock.calls.length;
      const mutations: MutationRecord[] = [];
      const observer = new MutationObserver((records) =>
        mutations.push(...records)
      );
      observer.observe(document.documentElement, {
        attributes: true,
        childList: true,
        characterData: true,
        subtree: true
      });
      try {
        await expect(publishSource(markdown)).rejects.toBeInstanceOf(
          ResumeValidationError
        );
        await Promise.resolve();
        expect(document.documentElement.outerHTML).toBe(previousHtml);
        expect(state.resume).toBe(previousResume);
        expect(vi.mocked(loadPortfolioForBuild).mock.calls).toHaveLength(
          previousCalls
        );
        expect(mutations).toHaveLength(0);
      } finally {
        observer.disconnect();
      }
    }
  );
});
