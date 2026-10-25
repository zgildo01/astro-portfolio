import { experimental_AstroContainer as AstroContainer } from "astro/container";
import { getByRole, within } from "@testing-library/dom";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi
} from "vitest";

import Resume from "../../../src/pages/resume.astro";
import type { ResumeDocument } from "../../../src/lib/resume/types";
import { createResume } from "../../fixtures/portfolio";
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

let container: Awaited<ReturnType<typeof AstroContainer.create>>;
async function render(resume = state.resume!): Promise<HTMLElement> {
  state.resume = resume;
  mountHtml(
    await container.renderToString(Resume, {
      request: new Request("https://portfolio.test/resume/"),
      partial: false
    })
  );
  return getByRole(document.body, "main");
}

describe("resume content rendered into the professional DOM", () => {
  beforeAll(async () => {
    container = await AstroContainer.create();
  });
  beforeEach(() => {
    state.resume = createResume();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the authored identity consistently in heading and metadata", async () => {
    const resume = createResume({
      name: "Žofie Nováková",
      headline: "Developer Experience Engineer"
    });
    const main = await render(resume);
    expect(within(main).getByRole("heading", { level: 1 }).textContent).toBe(
      resume.name
    );
    expect(document.title).toBe(`${resume.name} | Resume`);
    expect(
      document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content")
    ).toContain(`${resume.name}, ${resume.headline}`);
    expect(main.textContent).toContain(resume.headline);
  });

  it("retains paragraph boundaries and normalizes authored line wrapping", async () => {
    const main = await render(
      createResume({
        summary:
          "First line\ncontinues here.\n\nSecond paragraph\ncontinues too."
      })
    );
    expect(
      [...main.querySelectorAll(".resume-page__summary p")].map((p) =>
        p.textContent?.trim()
      )
    ).toEqual([
      "First line continues here.",
      "Second paragraph continues too."
    ]);
  });

  it("retains semantic emphasis, code and links in approved narrative Markdown", async () => {
    const main = await render(
      createResume({
        summary:
          "Built **shared tooling**, *clear documentation*, and `Python` helpers. See [the reference](https://example.test/reference)."
      })
    );
    const summary = main.querySelector(".resume-page__summary")!;
    expect(summary.querySelector("strong")?.textContent).toBe("shared tooling");
    expect(summary.querySelector("em")?.textContent).toBe(
      "clear documentation"
    );
    expect(summary.querySelector("code")?.textContent).toBe("Python");
    expect(
      within(summary as HTMLElement)
        .getByRole("link", { name: "the reference" })
        .getAttribute("href")
    ).toBe("https://example.test/reference");
  });

  it("keeps employer, role and achievements in authored order", async () => {
    const resume = createResume({
      experience: [
        {
          title: "Current role",
          employer: "Current employer",
          start: "2025-01",
          end: "present",
          achievements: ["First achievement.", "Second achievement."]
        },
        {
          title: "Earlier role",
          employer: "Earlier employer",
          start: "2021-03",
          end: "2024-12",
          location: "Hybrid",
          achievements: ["Earlier achievement."]
        }
      ]
    });
    const main = await render(resume);
    const entries = main.querySelectorAll(".resume-page__experience-item");
    expect(
      [...entries].map((entry) => entry.querySelector("h3")?.textContent)
    ).toEqual(["Current role", "Earlier role"]);
    expect(
      [...entries[0].querySelectorAll("li")].map((li) => li.textContent?.trim())
    ).toEqual(["First achievement.", "Second achievement."]);
    expect(entries[1].textContent).toContain("Earlier employer");
    expect(entries[1].textContent).toContain("Hybrid");
    expect(entries[0].textContent).not.toContain("undefined");
  });

  it("renders every month using a machine-readable time and the matching human label", async () => {
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec"
    ];
    for (const [index, month] of months.entries()) {
      const date = `2024-${String(index + 1).padStart(2, "0")}`;
      const resume = createResume();
      resume.experience[0].start = date;
      const main = await render(resume);
      const time = main.querySelector(`time[datetime="${date}"]`)!;
      expect(time.textContent).toBe(`${month} 2024`);
    }
  });

  it("renders year-only dates and Present without inventing a month or invalid time", async () => {
    const resume = createResume();
    resume.experience[0] = {
      ...resume.experience[0],
      start: "2016",
      end: "present"
    };
    const main = await render(resume);
    expect(main.querySelector('time[datetime="2016"]')?.textContent).toBe(
      "2016"
    );
    expect(main.querySelector('time[datetime="present"]')).toBeNull();
    expect(main.querySelector(".resume-page__metadata")?.textContent).toContain(
      "Present"
    );
  });

  it("shows a closed role's end date as a time element", async () => {
    const resume = createResume();
    resume.experience[0].end = "2025-09";
    const main = await render(resume);
    expect(main.querySelector('time[datetime="2025-09"]')?.textContent).toBe(
      "Sep 2025"
    );
    expect(
      main.querySelector(".resume-page__metadata")?.textContent
    ).not.toContain("Present");
  });

  it("renders each skills category as a named section and each skill as its own item", async () => {
    const resume = createResume();
    const main = await render(resume);
    for (const category of resume.skills) {
      const heading = within(main).getByRole("heading", {
        name: category.name,
        level: 3
      });
      const section = heading.closest("section")!;
      expect(section.getAttribute("aria-labelledby")).toBe(heading.id);
      expect(
        [...section.querySelectorAll("li")].map((li) => li.textContent)
      ).toEqual(category.skills);
    }
    expectResolvedReferences();
  });

  it("omits unauthored projects, education and certifications", async () => {
    const main = await render();
    for (const name of ["Selected projects", "Education", "Certifications"]) {
      expect(within(main).queryByRole("heading", { name })).toBeNull();
    }
  });

  it("renders linked and unlinked selected projects with their achievements", async () => {
    const main = await render(
      createResume({
        selectedProjects: [
          {
            name: "Linked project",
            link: "https://example.test/project",
            achievements: ["Built **shared capabilities**."]
          },
          {
            name: "Unlinked project",
            achievements: [
              "A private demonstration described without a public URL."
            ]
          }
        ]
      })
    );
    expect(
      within(main)
        .getByRole("link", { name: "Linked project" })
        .getAttribute("href")
    ).toBe("https://example.test/project");
    expect(
      within(main)
        .getByRole("heading", { name: "Unlinked project" })
        .querySelector("a")
    ).toBeNull();
    expect(
      main
        .querySelector("#resume-projects-heading")
        ?.closest("section")
        ?.querySelector("strong")?.textContent
    ).toBe("shared capabilities");
  });

  it("renders education with optional completion dates", async () => {
    const main = await render(
      createResume({
        education: [
          {
            name: "Engineering degree",
            institution: "Example University",
            completed: "2020-05"
          },
          { name: "Continuing study", institution: "Example Academy" }
        ]
      })
    );
    const section = main
      .querySelector("#resume-education-heading")!
      .closest("section")!;
    expect(section.textContent).toContain("Example University");
    expect(section.querySelector('time[datetime="2020-05"]')?.textContent).toBe(
      "May 2020"
    );
    expect(section.querySelectorAll("time")).toHaveLength(1);
    expect(section.textContent).not.toMatch(/undefined|null/);
  });

  it.each([
    {
      name: "Both dates",
      issued: "2024-01",
      expires: "2027-01",
      expectedTimes: 2
    },
    { name: "Issue date only", issued: "2024", expectedTimes: 1 },
    { name: "Expiry only", expires: "2027", expectedTimes: 1 },
    { name: "No dates", expectedTimes: 0 }
  ])(
    "renders certification metadata without empty separators: $name",
    async ({ expectedTimes, ...entry }) => {
      const main = await render(
        createResume({
          certifications: [{ ...entry, issuer: "Example Issuer" }]
        })
      );
      const section = main
        .querySelector("#resume-certifications-heading")!
        .closest("section")!;
      expect(section.querySelectorAll("time")).toHaveLength(expectedTimes);
      expect(section.textContent).toContain(entry.name);
      expect(section.textContent).toContain("Example Issuer");
      expect(section.textContent).not.toMatch(/undefined|null/);
      expect(section.querySelectorAll('[aria-hidden="true"]')).toHaveLength(
        expectedTimes === 2 ? 1 : 0
      );
    }
  );

  it("renders certification verification links", async () => {
    const main = await render(
      createResume({
        certifications: [
          {
            name: "Verified skill",
            issuer: "Example Issuer",
            link: "https://example.test/certificate"
          }
        ]
      })
    );
    expect(
      within(main)
        .getByRole("link", { name: "Verified skill" })
        .getAttribute("href")
    ).toBe("https://example.test/certificate");
  });

  it("includes all supplied public contact routes with correct schemes", async () => {
    const resume = createResume();
    const main = await render(resume);
    const address = main.querySelector("address")!;
    expect(address.textContent).toContain(resume.contact.location);
    expect(
      within(address).getByRole("link", { name: "Email" }).getAttribute("href")
    ).toBe(`mailto:${resume.contact.email}`);
    for (const [label, property] of [
      ["Website", "website"],
      ["LinkedIn", "linkedin"],
      ["GitHub", "github"]
    ] as const) {
      expect(
        within(address).getByRole("link", { name: label }).getAttribute("href")
      ).toBe(resume.contact[property]);
    }
    expectSafeDocumentLinks();
  });

  it.each(["email", "website", "linkedin", "github"] as const)(
    "does not invent an unavailable %s link",
    async (key) => {
      const resume = createResume();
      delete resume.contact[key];
      const main = await render(resume);
      expect(main.querySelectorAll("address a")).toHaveLength(3);
      expect(main.querySelector("address")?.innerHTML).not.toContain(
        "undefined"
      );
    }
  );

  it("supports a location-only contact record without empty links", async () => {
    const main = await render(
      createResume({ contact: { location: "Prague, Czechia" } })
    );
    expect(main.querySelector("address")?.textContent).toContain(
      "Prague, Czechia"
    );
    expect(main.querySelectorAll("address a")).toHaveLength(0);
  });

  it("offers the named PDF download in a production render", async () => {
    vi.stubEnv("PROD", true);
    const main = await render();
    const download = within(main).getByRole("link", {
      name: "Download PDF resume"
    });
    expect(download.getAttribute("href")).toBe(
      "/resume/Zeus-Zaragoza-Resume.pdf"
    );
    expect(download.getAttribute("download")).toBe("Zeus-Zaragoza-Resume.pdf");
  });

  it("does not advertise a generated PDF in the development render", async () => {
    vi.stubEnv("PROD", false);
    const main = await render();
    expect(
      within(main).queryByRole("link", { name: "Download PDF resume" })
    ).toBeNull();
  });

  it("uses the deployment prefix for the generated production PDF", async () => {
    vi.stubEnv("PROD", true);
    vi.stubEnv("BASE_URL", "/portfolio/");
    const main = await render();
    expect(
      within(main)
        .getByRole("link", { name: "Download PDF resume" })
        .getAttribute("href")
    ).toBe("/portfolio/resume/Zeus-Zaragoza-Resume.pdf");
  });

  it("escapes authored markup in identity, roles, employers, skills and narrative", async () => {
    const resume = createResume({
      name: 'Alex <img src=x onerror="bad()">',
      summary:
        "Literal <script>bad()</script> text and [unsafe](javascript:alert(1))."
    });
    resume.experience[0].title = '<img src=x onerror="bad()">';
    resume.experience[0].employer = "<script>bad()</script>";
    resume.skills[0].skills = ['<svg onload="bad()">'];
    const main = await render(resume);
    expect(main.querySelector("script,img,svg,[onerror],[onload]")).toBeNull();
    expect(main.textContent).toContain("<script>bad()</script>");
    expect(main.textContent).toContain('<svg onload="bad()">');
    expect(
      [...main.querySelectorAll("a")].some((a) => a.protocol === "javascript:")
    ).toBe(false);
    expect(document.title).toContain("<img src=x");
  });
});
