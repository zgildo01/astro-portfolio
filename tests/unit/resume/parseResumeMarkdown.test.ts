import { describe, expect, it } from "vitest";

import {
  parseResumeMarkdown,
  ResumeValidationError
} from "../../../src/lib/resume";

const validResume = `---
schema_version: 1
headline: Platform Engineer
linkedin: https://www.linkedin.com/in/example/
---

# Example Engineer

## Summary

I build tools that help teams deliver software.

## Experience

### Platform Engineer

Employer: Example Co
Start: 2025-06
End: present

- Built a release tool used by multiple teams.

### Software Engineer

Employer: Example Co
Start: 2024-03
End: 2025-06

- Improved documentation workflows.

## Skills

### Platform tooling

- Git
- Python
`;

function messages(source: string): string[] {
  try {
    parseResumeMarkdown(source);
  } catch (error) {
    expect(error).toBeInstanceOf(ResumeValidationError);
    return (error as ResumeValidationError).issues.map(
      ({ line, message }) => `Line ${line}: ${message}`
    );
  }
  throw new Error("Expected resume validation to fail");
}

describe("parseResumeMarkdown", () => {
  it("parses the canonical required sections into typed data", () => {
    const resume = parseResumeMarkdown(validResume);

    expect(resume).toMatchObject({
      schemaVersion: 1,
      name: "Example Engineer",
      headline: "Platform Engineer",
      contact: { linkedin: "https://www.linkedin.com/in/example/" }
    });
    expect(resume.experience).toHaveLength(2);
    expect(resume.experience[0]).toMatchObject({
      employer: "Example Co",
      start: "2025-06",
      end: "present",
      achievements: ["Built a release tool used by multiple teams."]
    });
    expect(resume.skills).toEqual([
      { name: "Platform tooling", skills: ["Git", "Python"] }
    ]);
    expect(resume.selectedProjects).toBeUndefined();
  });

  it("allows year-only dates, same-month role transitions, and every optional section", () => {
    const source = validResume.replace("Start: 2024-03", "Start: 2024").replace(
      "- Python\n",
      `- Python

## Selected Projects

### Documentation generator

Link: https://example.com/project

- Published [usage guidance](https://example.com/docs) for users.

## Education

### Computer science degree

Institution: Example University
Completed: 2023

## Certifications

### Cloud credential

Issuer: Example Provider
Issued: 2023-06
Expires: 2026-06
Link: https://example.com/credential
`
    );
    const resume = parseResumeMarkdown(source);

    expect(resume.experience[1].start).toBe("2024");
    expect(resume.experience[1].end).toBe(resume.experience[0].start);
    expect(resume.selectedProjects?.[0].link).toBe(
      "https://example.com/project"
    );
    expect(resume.education?.[0].completed).toBe("2023");
    expect(resume.certifications?.[0].expires).toBe("2026-06");
  });

  it("reports malformed frontmatter with source lines", () => {
    const source = validResume
      .replace("schema_version: 1", "schema_version: 2")
      .replace("headline: Platform Engineer", 'headline: "[Your title]"');
    expect(messages(source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Line 2: schema_version must be the number 1"),
        expect.stringContaining(
          "Line 3: headline contains a bracketed template prompt"
        )
      ])
    );
  });

  it("requires a public recruiter contact route", () => {
    expect(
      messages(
        validResume.replace(
          "linkedin: https://www.linkedin.com/in/example/\n",
          ""
        )
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Provide at least one public recruiter contact route"
        )
      ])
    );
  });

  it("requires exact section headings in schema order", () => {
    const renamed = validResume.replace("## Experience", "## Employment");
    expect(messages(renamed)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Unknown section heading: Employment"),
        expect.stringContaining("Missing required section: Experience")
      ])
    );
    const reversed = validResume
      .replace("## Summary", "## Skills")
      .replace(
        "## Skills\n\n### Platform tooling",
        "## Summary\n\n### Platform tooling"
      );
    expect(messages(reversed)).toEqual(
      expect.arrayContaining([expect.stringContaining("out of schema order")])
    );
  });

  it("requires experience fields before at least one bullet", () => {
    const source = validResume.replace(
      "Employer: Example Co\nStart: 2025-06\nEnd: present",
      "Start: 2025-06\nEnd: present\n- Built a release tool.\nEmployer: Example Co"
    );
    expect(messages(source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Employer must appear before bullets")
      ])
    );
    expect(
      messages(validResume.replace("- Improved documentation workflows.", ""))
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Software Engineer needs at least 1 bullet")
      ])
    );
  });

  it("enforces field order and rejects unmodelled education bullets", () => {
    const outOfOrder = validResume.replace(
      "Employer: Example Co\nStart: 2025-06\nEnd: present",
      "Start: 2025-06\nEmployer: Example Co\nEnd: present"
    );
    expect(messages(outOfOrder)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Employer is out of field order")
      ])
    );

    const source =
      validResume +
      "\n## Education\n\n### Training\n\nInstitution: Example Academy\n\n- A bullet that the typed model cannot represent.\n";
    expect(messages(source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Bullets are not supported in Training")
      ])
    );
  });

  it("rejects invalid dates, reversed dates, and clearly out-of-order roles", () => {
    expect(
      messages(validResume.replace("Start: 2025-06", "Start: 2025-13"))
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Start must use YYYY or YYYY-MM")
      ])
    );
    expect(
      messages(validResume.replace("End: 2025-06", "End: 2024-02"))
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("End must be the same as or later than Start")
      ])
    );
    expect(
      messages(
        validResume
          .replace("Start: 2024-03", "Start: 2026-03")
          .replace("End: 2025-06", "End: 2026-04")
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining("List experience entries newest first")
      ])
    );
  });

  it("rejects unsafe and nonpublic URLs in metadata and narrative", () => {
    expect(
      messages(
        validResume.replace(
          "https://www.linkedin.com/in/example/",
          "javascript:alert(1)"
        )
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "linkedin must be an absolute public HTTP or HTTPS URL"
        )
      ])
    );
    expect(
      messages(
        validResume.replace(
          "https://www.linkedin.com/in/example/",
          "http://localhost/profile"
        )
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "linkedin must be an absolute public HTTP or HTTPS URL"
        )
      ])
    );
    expect(
      messages(
        validResume.replace(
          "- Built a release tool used by multiple teams.",
          "- Built a [release tool](javascript:alert(1))."
        )
      )
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Markdown link must be an absolute public HTTP or HTTPS URL"
        )
      ])
    );
  });

  it("rejects unsupported canonical Markdown constructs and leftover prompts", () => {
    const source = validResume.replace(
      "- Built a release tool used by multiple teams.",
      "- [What you built]\n- ![screenshot](https://example.com/a.png)\n- <script>alert(1)</script>"
    );
    expect(messages(source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Remove the bracketed template prompt"),
        expect.stringContaining("Images are not supported"),
        expect.stringContaining("Raw HTML is not supported")
      ])
    );
  });

  it("validates optional section fields and links", () => {
    const source =
      validResume +
      `
## Selected Projects

### Private demo

Link: file:///tmp/demo

- Shared a prototype.

## Certifications

### Certificate

Issued: 2025
Expires: 2024
`;
    expect(messages(source)).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Link must be an absolute public HTTP or HTTPS URL"
        ),
        expect.stringContaining("Certificate is missing required Issuer field"),
        expect.stringContaining(
          "Expires must be the same as or later than Issued"
        )
      ])
    );
  });
});
