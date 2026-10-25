import type { LoadedPortfolioContent } from "../../src/lib/content/loadPortfolioForBuild";
import type { ResumeDocument } from "../../src/lib/resume/types";
import type { CaseStudy } from "../../src/lib/work/types";

export function createResume(
  overrides: Partial<ResumeDocument> = {}
): ResumeDocument {
  return {
    schemaVersion: 1,
    name: "Alex Example",
    headline: "Platform Engineer",
    contact: {
      location: "Example City",
      email: "alex@example.test",
      website: "https://example.test/",
      linkedin: "https://www.linkedin.com/in/example/",
      github: "https://github.com/example"
    },
    summary:
      "I build dependable delivery tooling.\n\nI document capabilities so teams can work together.",
    experience: [
      {
        title: "Platform Engineer",
        employer: "Example Organization",
        start: "2024-01",
        end: "present",
        location: "Remote",
        achievements: [
          "Built **shared tooling** for engineering teams.",
          "Made existing capabilities easier to discover."
        ]
      }
    ],
    skills: [
      { name: "Delivery", skills: ["TypeScript", "Git", "CI pipelines"] },
      { name: "Documentation", skills: ["Python", "Markdown"] }
    ],
    ...overrides
  };
}

export function createCaseStudy(overrides: Partial<CaseStudy> = {}): CaseStudy {
  return {
    slug: "shared-tooling",
    title: "Making shared tooling easier to understand",
    description: "A synthetic professional case study for integration testing.",
    organization: "Example Organization",
    category: "Developer tooling",
    role: "Implementation and documentation",
    technologies: ["Python", "TypeScript", "Markdown"],
    sections: [
      {
        id: "problem",
        title: "The problem",
        paragraphs: ["Engineers needed a common reference for internal tools."]
      },
      {
        id: "contribution",
        title: "My contribution",
        paragraphs: ["I implemented the documentation workflow."]
      },
      {
        id: "approach",
        title: "The approach",
        paragraphs: [
          "The workflow reads documented source and produces files."
        ],
        workflow: ["Read source", "Generate documentation", "Review output"]
      },
      {
        id: "outcome",
        title: "The outcome",
        paragraphs: ["Teams could find and understand existing capabilities."]
      }
    ],
    ...overrides
  };
}

export function createPortfolioContent(): LoadedPortfolioContent {
  return {
    resume: createResume(),
    sourceCommitSha: "a".repeat(40),
    caseStudies: [createCaseStudy()]
  };
}

export const testContactProps = {
  siteKey: "1x00000000000000000000AA",
  endpoint: "/api/contact",
  linkedin: "https://www.linkedin.com/in/example/",
  github: "https://github.com/example"
};
