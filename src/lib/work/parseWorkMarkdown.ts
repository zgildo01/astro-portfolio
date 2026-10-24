import { isMap, isScalar, isSeq, LineCounter, parseDocument } from "yaml";

import {
  WorkValidationError,
  type CaseStudy,
  type CaseStudySection,
  type WorkValidationIssue
} from "./types";

const MAX_DOCUMENT_BYTES = 128 * 1024;
const TEXT_FIELDS = [
  "slug",
  "title",
  "description",
  "organization",
  "category",
  "role"
] as const;
const FRONTMATTER_FIELDS = new Set<string>([
  "schemaVersion",
  "status",
  ...TEXT_FIELDS,
  "technologies",
  "workflow"
]);
const SECTIONS = [
  { id: "problem", title: "The problem" },
  { id: "contribution", title: "My contribution" },
  { id: "approach", title: "The approach" },
  { id: "outcome", title: "The outcome" }
] as const;

function plainText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 4000 &&
    !/[<>\r\n]|\p{Cc}|\p{Cf}/u.test(value)
  );
}

function unsupportedProse(text: string): boolean {
  return (
    /[<>[\]`*|]|\p{Cc}|\p{Cf}/u.test(text) ||
    /(?:__|~~|%%)|(?:^|\s)_[^\n]+_(?=\s|[.,!?;:]|$)/.test(text) ||
    /^\s*(?:#|>|[-+]\s|\d+[.)]\s|~{3,})/.test(text) ||
    /^\s*(?:-\s*){3,}$|^\s*(?:_\s*){3,}$/.test(text) ||
    /^(?: {4}|\t)/.test(text)
  );
}

export function parseWorkMarkdown(markdown: string): CaseStudy | null {
  const issues: WorkValidationIssue[] = [];
  const add = (line: number, message: string): void => {
    issues.push({ line, message });
  };
  const throwIfAny = (): void => {
    if (issues.length > 0) throw new WorkValidationError(issues);
  };

  if (new TextEncoder().encode(markdown).byteLength > MAX_DOCUMENT_BYTES) {
    throw new WorkValidationError([
      { line: 1, message: "Work notes must not exceed 128 KiB." }
    ]);
  }

  const lines = markdown
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  if (lines[0]?.trim() !== "---") return null;
  const closingFence = lines.findIndex(
    (line, index) => index > 0 && line.trim() === "---"
  );
  if (closingFence < 0) {
    throw new WorkValidationError([
      { line: 1, message: "Close the YAML frontmatter with a second --- line." }
    ]);
  }

  const counter = new LineCounter();
  const document = parseDocument(lines.slice(1, closingFence).join("\n"), {
    lineCounter: counter,
    uniqueKeys: true,
    strict: true
  });
  for (const issue of [...document.errors, ...document.warnings]) {
    add(
      (issue.linePos?.[0].line ?? 1) + 1,
      "Invalid YAML frontmatter. Check syntax, duplicate keys, and value types."
    );
  }
  throwIfAny();
  if (document.contents === null) return null;
  if (!isMap(document.contents)) {
    throw new WorkValidationError([
      { line: 2, message: "YAML frontmatter must be a key-value map." }
    ]);
  }

  const fields = new Map<string, { value: unknown; line: number }>();
  for (const item of document.contents.items) {
    const line = counter.linePos(item.key?.range?.[0] ?? 0).line + 1;
    if (!isScalar(item.key) || typeof item.key.value !== "string") {
      add(line, "Frontmatter keys must be plain text.");
      continue;
    }
    fields.set(item.key.value, { value: item.value, line });
  }
  throwIfAny();

  const status = fields.get("status");
  if (!status) return null;
  if (
    !isScalar(status.value) ||
    !["draft", "published"].includes(status.value.value as string)
  ) {
    throw new WorkValidationError([
      { line: status.line, message: "status must be draft or published." }
    ]);
  }
  if (status.value.value === "draft") return null;

  for (const [key, field] of fields) {
    if (!FRONTMATTER_FIELDS.has(key)) {
      add(field.line, "Unknown frontmatter field. Check the authoring schema.");
    }
  }
  const schema = fields.get("schemaVersion");
  if (!schema || !isScalar(schema.value) || schema.value.value !== 1) {
    add(schema?.line ?? 2, "schemaVersion must be the number 1.");
  }

  const metadata = {} as Record<(typeof TEXT_FIELDS)[number], string>;
  for (const key of TEXT_FIELDS) {
    const field = fields.get(key);
    const value =
      field && isScalar(field.value) ? field.value.value : undefined;
    if (!plainText(value)) {
      add(field?.line ?? 2, `${key} must be nonempty, single-line plain text.`);
    } else {
      metadata[key] = value.trim();
    }
  }
  if (metadata.slug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.slug)) {
    add(fields.get("slug")?.line ?? 2, "slug must use lowercase kebab-case.");
  }

  const technologyField = fields.get("technologies");
  const technologies: string[] = [];
  if (
    !technologyField ||
    !isSeq(technologyField.value) ||
    technologyField.value.items.length === 0
  ) {
    add(
      technologyField?.line ?? 2,
      "technologies must be a nonempty list of plain-text values."
    );
  } else {
    for (const item of technologyField.value.items) {
      const value = isScalar(item) ? item.value : undefined;
      if (!plainText(value)) {
        add(
          technologyField.line,
          "Each technology must be nonempty, single-line plain text."
        );
      } else if (technologies.includes(value.trim())) {
        add(
          technologyField.line,
          "technologies must not contain duplicate values."
        );
      } else {
        technologies.push(value.trim());
      }
    }
  }

  let workflow: { section: string; steps: string[] } | undefined;
  const workflowField = fields.get("workflow");
  if (workflowField) {
    if (!isMap(workflowField.value)) {
      add(
        workflowField.line,
        "workflow must contain section and steps fields."
      );
    } else {
      const workflowValues = new Map<string, unknown>();
      for (const item of workflowField.value.items) {
        if (
          !isScalar(item.key) ||
          !["section", "steps"].includes(item.key.value as string)
        ) {
          add(
            workflowField.line,
            "workflow supports only section and steps fields."
          );
          continue;
        }
        workflowValues.set(item.key.value as string, item.value);
      }
      const sectionNode = workflowValues.get("section");
      const section = isScalar(sectionNode) ? sectionNode.value : undefined;
      const stepsNode = workflowValues.get("steps");
      const steps: string[] = [];
      if (
        typeof section !== "string" ||
        !SECTIONS.some(({ id }) => id === section)
      ) {
        add(
          workflowField.line,
          "workflow.section must be problem, contribution, approach, or outcome."
        );
      }
      if (
        !isSeq(stepsNode) ||
        stepsNode.items.length < 2 ||
        stepsNode.items.length > 8
      ) {
        add(
          workflowField.line,
          "workflow.steps must contain between two and eight plain-text steps."
        );
      } else {
        for (const item of stepsNode.items) {
          const value = isScalar(item) ? item.value : undefined;
          if (!plainText(value)) {
            add(
              workflowField.line,
              "Each workflow step must be nonempty, single-line plain text."
            );
          } else {
            steps.push(value.trim());
          }
        }
      }
      if (typeof section === "string") workflow = { section, steps };
    }
  }

  const sections: CaseStudySection[] = [];
  let current: { id: string; title: string; paragraphs: string[] } | undefined;
  let paragraph: string[] = [];
  const flush = (): void => {
    if (current && paragraph.length > 0) {
      current.paragraphs.push(paragraph.join(" "));
    }
    paragraph = [];
  };
  for (let index = closingFence + 1; index < lines.length; index += 1) {
    const text = lines[index];
    const trimmed = text.trim();
    const line = index + 1;
    if (!trimmed) {
      flush();
      continue;
    }
    if (/^\s*#/.test(text)) {
      flush();
      const expected = SECTIONS[sections.length];
      if (!expected || trimmed !== `## ${expected.title}`) {
        add(
          line,
          "Use the four required level-two section headings in schema order, without a body title."
        );
        continue;
      }
      current = { ...expected, paragraphs: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      add(line, "Place prose under a required section heading.");
      continue;
    }
    if (unsupportedProse(text)) {
      add(
        line,
        "Section content supports plain prose paragraphs only; formatting, HTML, links, lists, and code are not supported."
      );
      continue;
    }
    paragraph.push(trimmed);
  }
  flush();
  for (const expected of SECTIONS) {
    const section = sections.find(({ id }) => id === expected.id);
    if (!section) {
      add(closingFence + 2, `Missing required section: ${expected.title}.`);
    } else if (section.paragraphs.length === 0) {
      add(
        closingFence + 2,
        `${expected.title} must contain at least one prose paragraph.`
      );
    }
  }
  throwIfAny();

  return {
    ...metadata,
    technologies,
    sections: sections.map((section) =>
      workflow?.section === section.id
        ? { ...section, workflow: workflow.steps }
        : section
    )
  };
}
