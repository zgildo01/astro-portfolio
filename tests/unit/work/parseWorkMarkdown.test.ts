import { describe, expect, it } from "vitest";

import { parseWorkMarkdown } from "../../../src/lib/work/parseWorkMarkdown";
import { WorkValidationError } from "../../../src/lib/work/types";

const publishedNote = `---
schemaVersion: 1
status: published
slug: python-documentation-automation
title: Automating documentation for Python tooling
description: Generated documentation helps engineers understand internal tools.
organization: Example organization
category: Developer tooling
role: Extension design and development
technologies:
  - Python
  - Sphinx
  - Markdown
workflow:
  section: approach
  steps:
    - Python source and documentation comments
    - Manually invoked extension
    - Markdown organized by source file
---

## The problem

Documentation was maintained manually.
Engineers needed to read source code.

## My contribution

I implemented comment extraction and Markdown generation.

## The approach

The extension reads documentation comments from Python functions and classes.

Generation runs manually, with integration points for future CI use.

## The outcome

The team used the documentation to coordinate work and understand existing capabilities.
`;

function validationError(source: string): WorkValidationError {
  try {
    parseWorkMarkdown(source);
  } catch (error) {
    expect(error).toBeInstanceOf(WorkValidationError);
    return error as WorkValidationError;
  }
  throw new Error("Expected work validation to fail.");
}

describe("parseWorkMarkdown", () => {
  it("parses published metadata, wrapped paragraphs, and workflow into presentation data", () => {
    const result = parseWorkMarkdown(publishedNote);

    expect(result).toMatchObject({
      slug: "python-documentation-automation",
      title: "Automating documentation for Python tooling",
      description:
        "Generated documentation helps engineers understand internal tools.",
      organization: "Example organization",
      category: "Developer tooling",
      role: "Extension design and development",
      technologies: ["Python", "Sphinx", "Markdown"]
    });
    expect(result?.sections).toHaveLength(4);
    expect(result?.sections[0]).toEqual({
      id: "problem",
      title: "The problem",
      paragraphs: [
        "Documentation was maintained manually. Engineers needed to read source code."
      ]
    });
    expect(result?.sections[2]).toEqual({
      id: "approach",
      title: "The approach",
      paragraphs: [
        "The extension reads documentation comments from Python functions and classes.",
        "Generation runs manually, with integration points for future CI use."
      ],
      workflow: [
        "Python source and documentation comments",
        "Manually invoked extension",
        "Markdown organized by source file"
      ]
    });
    expect(result).not.toHaveProperty("status");
    expect(result).not.toHaveProperty("schemaVersion");
  });

  it("supports a published note without the optional workflow", () => {
    const source = publishedNote.replace(/workflow:\n[\s\S]*?---/, "---");
    const result = parseWorkMarkdown(source);
    expect(result?.sections.every((section) => !("workflow" in section))).toBe(
      true
    );
  });

  it("accepts UTF-8 BOM and Windows line endings", () => {
    expect(
      parseWorkMarkdown(`\uFEFF${publishedNote.replace(/\n/g, "\r\n")}`)
    ).toEqual(parseWorkMarkdown(publishedNote));
  });

  it.each([
    "Private planning material without frontmatter.\n\n# Notes\n<script>secret</script>",
    "---\n---\nPrivate planning material.",
    "---\ntitle: Private planning material\n---\n[[Private note]]",
    "---\nstatus: draft\n---\n# Private material\n\n- Incomplete narrative\n<script>secret</script>",
    publishedNote.replace("status: published", "status: draft"),
    publishedNote.replace("status: published\n", "")
  ])(
    "never returns unpublished or incomplete planning content (%#)",
    (source) => {
      expect(parseWorkMarkdown(source)).toBeNull();
    }
  );

  it.each(["Published", "PUBLISHED", '" published "', '" Published "'])(
    "accepts explicit publication with capitalization or surrounding whitespace (%s)",
    (status) => {
      expect(
        parseWorkMarkdown(
          publishedNote.replace("status: published", `status: ${status}`)
        )
      ).toEqual(parseWorkMarkdown(publishedNote));
    }
  );

  it.each(["Draft", "DRAFT", '" draft "', '" Draft "'])(
    "never exposes incomplete draft content with capitalization or surrounding whitespace (%s)",
    (status) => {
      expect(
        parseWorkMarkdown(
          `---\nstatus: ${status}\n---\n# Private material\n\n- Incomplete narrative\n<script>secret</script>`
        )
      ).toBeNull();
    }
  );

  it.each([
    ["organization: Example organization\n", "organization"],
    [
      "## The outcome\n\nThe team used the documentation to coordinate work and understand existing capabilities.",
      "Missing required section: The outcome."
    ]
  ])(
    "still validates capitalized published metadata and narrative (%#)",
    (removedContent, expectedIssue) => {
      const source = publishedNote
        .replace("status: published", "status: Published")
        .replace(removedContent, "");
      expect(validationError(source).message).toContain(expectedIssue);
    }
  );

  it.each(["ready", "publish", "true", "null", "[published]", '" "'])(
    "rejects an explicitly invalid publication status (%s)",
    (status) => {
      expect(
        validationError(
          publishedNote.replace("status: published", `status: ${status}`)
        ).message
      ).toContain("status must be draft or published.");
    }
  );

  it.each([
    ["schemaVersion: 1\n", "schemaVersion"],
    ["slug: python-documentation-automation\n", "slug"],
    ["title: Automating documentation for Python tooling\n", "title"],
    [
      "description: Generated documentation helps engineers understand internal tools.\n",
      "description"
    ],
    ["organization: Example organization\n", "organization"],
    ["category: Developer tooling\n", "category"],
    ["role: Extension design and development\n", "role"]
  ])("requires published metadata field %s", (field, name) => {
    expect(validationError(publishedNote.replace(field, "")).message).toContain(
      name
    );
  });

  it.each([
    "Python-Docs",
    "../private",
    "nested/path",
    "python_docs",
    "-python",
    "python--docs"
  ])(
    "rejects a slug that cannot be a single safe route segment (%s)",
    (slug) => {
      expect(
        validationError(
          publishedNote.replace(
            "slug: python-documentation-automation",
            `slug: ${slug}`
          )
        ).message
      ).toContain("slug must use lowercase kebab-case.");
    }
  );

  it.each([
    ["schemaVersion: 1", 'schemaVersion: "1"'],
    [
      "organization: Example organization",
      "organization: [Example organization]"
    ],
    ["role: Extension design and development", "role: null"],
    [
      "title: Automating documentation for Python tooling",
      'title: "<script>private</script>"'
    ],
    ["category: Developer tooling", 'category: "Developer\\ntooling"'],
    [
      "description: Generated documentation helps engineers understand internal tools.",
      'description: ""'
    ]
  ])(
    "rejects invalid metadata types and unsafe plain text (%#)",
    (before, after) => {
      expect(
        validationError(publishedNote.replace(before, after)).issues.length
      ).toBeGreaterThan(0);
    }
  );

  it.each([
    "technologies: Python",
    "technologies: []",
    "technologies: [Python, 42]",
    "technologies: [Python, Python]",
    "technologies: [Python, '<b>HTML</b>']"
  ])(
    "requires a distinct nonempty list of technologies (%s)",
    (technologies) => {
      const source = publishedNote.replace(
        /technologies:\n(?: {2}- [^\n]+\n)+/,
        `${technologies}\n`
      );
      expect(validationError(source).message).toMatch(/technolog/);
    }
  );

  it("rejects duplicate YAML keys, including nested workflow keys", () => {
    for (const source of [
      publishedNote.replace(
        "status: published",
        "status: draft\nstatus: published"
      ),
      publishedNote.replace(
        "  section: approach",
        "  section: approach\n  section: problem"
      )
    ]) {
      expect(validationError(source).message).toContain(
        "Invalid YAML frontmatter."
      );
    }
  });

  it("rejects unknown published fields without echoing their names or contents", () => {
    const source = publishedNote.replace(
      "status: published",
      "status: published\nprivate_secret_field: private_secret_value"
    );
    const error = validationError(source);
    expect(error.message).toContain("Unknown frontmatter field.");
    expect(error.message).not.toContain("private_secret");
  });

  it("reports YAML syntax problems without copying source text into diagnostics", () => {
    const error = validationError(
      "---\nstatus: published\nprivate_secret: [private_value\n---"
    );
    expect(error.message).toContain("Invalid YAML frontmatter.");
    expect(error.message).not.toContain("private_");
    expect(
      error.issues.every(({ line }) => Number.isInteger(line) && line > 0)
    ).toBe(true);
  });

  it("rejects an unclosed frontmatter fence", () => {
    expect(validationError("---\nstatus: draft").message).toContain(
      "Close the YAML frontmatter"
    );
  });

  it("requires YAML frontmatter to be a mapping", () => {
    expect(validationError("---\n- published\n---").message).toContain(
      "key-value map"
    );
  });

  it.each([
    ["## The problem", "## A different heading"],
    ["## My contribution", "## The outcome"],
    ["## The approach", "### The approach"],
    ["## The problem", "# Case study title\n\n## The problem"],
    ["## My contribution", "## The problem\n\n## My contribution"]
  ])(
    "requires exactly the four ordered section headings (%#)",
    (before, after) => {
      expect(
        validationError(publishedNote.replace(before, after)).message
      ).toContain("required level-two section headings");
    }
  );

  it("requires nonempty content in all four sections", () => {
    const source = publishedNote.replace(
      "I implemented comment extraction and Markdown generation.",
      ""
    );
    expect(validationError(source).message).toContain(
      "My contribution must contain at least one prose paragraph."
    );
  });

  it.each([
    "<script>private_payload</script>",
    "<!-- private_payload -->",
    "[private_payload](javascript:alert(1))",
    "[[private_payload]]",
    "![private_payload](image.png)",
    "**private_payload**",
    "_private_payload_",
    "`private_payload`",
    "```python",
    "~~~python",
    "- private_payload",
    "1. private_payload",
    "> private_payload",
    "    private_payload",
    "private_payload | another column",
    "---",
    "%%private_payload%%"
  ])(
    "rejects unsupported prose syntax without echoing authored content (%#)",
    (content) => {
      const error = validationError(
        publishedNote.replace("Documentation was maintained manually.", content)
      );
      expect(error.message).toContain("plain prose paragraphs only");
      expect(error.message).not.toContain("private_payload");
    }
  );

  it("rejects content outside sections", () => {
    const error = validationError(
      publishedNote.replace(
        "## The problem",
        "An unsectioned paragraph.\n\n## The problem"
      )
    );
    expect(error.message).toContain(
      "Place prose under a required section heading."
    );
  });

  it.each([
    "workflow: invalid",
    "workflow: {}",
    "workflow:\n  section: unknown\n  steps: [First, Second]",
    "workflow:\n  section: approach\n  steps: [Only]",
    "workflow:\n  section: approach\n  steps: [First, null]",
    "workflow:\n  section: approach\n  steps: [First, Second]\n  private_key: private_value"
  ])(
    "validates workflow structure, section, and safe steps (%#)",
    (workflow) => {
      const error = validationError(
        publishedNote.replace(/workflow:\n[\s\S]*?---/, `${workflow}\n---`)
      );
      expect(error.message).toMatch(/workflow/);
      expect(error.message).not.toContain("private_");
    }
  );

  it("rejects oversized documents before YAML processing", () => {
    expect(validationError("é".repeat(128 * 1024)).message).toContain(
      "128 KiB"
    );
  });
});
