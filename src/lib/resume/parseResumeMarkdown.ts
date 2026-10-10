import { isMap, isScalar, LineCounter, parseDocument } from "yaml";

import {
  ResumeValidationError,
  type ResumeCertification,
  type ResumeContact,
  type ResumeDocument,
  type ResumeEducation,
  type ResumeExperience,
  type ResumeProject,
  type ResumeSkillCategory,
  type ResumeValidationIssue
} from "./types";

interface SourceLine {
  number: number;
  text: string;
}

interface Section {
  title: string;
  line: number;
  lines: SourceLine[];
}

interface Entry {
  title: string;
  line: number;
  lines: SourceLine[];
}

interface FieldValue {
  value: string;
  line: number;
}

interface ParsedEntry {
  fields: Map<string, FieldValue>;
  bullets: string[];
}

interface DateRange {
  first: number;
  last: number;
}

const SECTION_NAMES = [
  "Summary",
  "Experience",
  "Skills",
  "Selected Projects",
  "Education",
  "Certifications"
] as const;

const FRONTMATTER_KEYS = new Set([
  "schema_version",
  "headline",
  "location",
  "email",
  "website",
  "linkedin",
  "github"
]);

const HEADING = /^(#{1,6})[ \t]+(.+?)\s*$/;
const BULLET = /^([-*+])\s+(.+)$/;
const FIELD = /^([A-Za-z]+):(?:\s*(.*))?$/;
const PLACEHOLDER = /\[[^\]\n]+\](?!\()/;

class Issues {
  readonly values: ResumeValidationIssue[] = [];

  add(line: number, message: string): void {
    this.values.push({ line, message });
  }

  throwIfAny(): void {
    if (this.values.length > 0) {
      throw new ResumeValidationError(this.values);
    }
  }
}

function validatePlainText(
  value: string,
  line: number,
  label: string,
  issues: Issues
): string {
  const trimmed = value.trim();
  if (!trimmed) issues.add(line, `${label} must not be empty.`);
  if (PLACEHOLDER.test(trimmed))
    issues.add(line, `${label} contains a bracketed template prompt.`);
  if (/\p{Cc}/u.test(trimmed))
    issues.add(line, `${label} contains a control character.`);
  if (/<\/?[A-Za-z!][^>]*>/.test(trimmed))
    issues.add(line, `${label} must not contain HTML.`);
  return trimmed;
}

function validatePublicUrl(
  value: string,
  line: number,
  label: string,
  issues: Issues
): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    issues.add(line, `${label} must be an absolute public HTTP or HTTPS URL.`);
    return;
  }

  const hostname = url.hostname.toLowerCase();
  const isIpAddress =
    /^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.startsWith("[");
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !hostname.includes(".") ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    isIpAddress ||
    url.username ||
    url.password ||
    /\s/.test(value)
  ) {
    issues.add(
      line,
      `${label} must be an absolute public HTTP or HTTPS URL without credentials.`
    );
  }
}

function validateFieldUrl(
  value: string,
  line: number,
  label: string,
  issues: Issues
): void {
  validatePublicUrl(value, line, label, issues);
  if (label === "linkedin" || label === "github") {
    try {
      const hostname = new URL(value).hostname.toLowerCase();
      const expected = label === "linkedin" ? "linkedin.com" : "github.com";
      if (hostname !== expected && hostname !== `www.${expected}`) {
        issues.add(line, `${label} must use ${expected}.`);
      }
    } catch {
      // The general URL validator already reports the malformed value.
    }
  }
}

function validateNarrative(line: SourceLine, issues: Issues): void {
  const text = line.text;
  if (/\p{Cc}/u.test(text))
    issues.add(line.number, "Control characters are not supported.");
  if (PLACEHOLDER.test(text))
    issues.add(line.number, "Remove the bracketed template prompt.");
  if (/!\[/.test(text))
    issues.add(line.number, "Images are not supported in resume markdown.");
  if (/\[\[/.test(text))
    issues.add(line.number, "Obsidian wikilinks are not supported.");
  if (/<\/?[A-Za-z!][^>]*>/.test(text))
    issues.add(line.number, "Raw HTML is not supported.");
  if (/^\s*>\s*\[!/.test(text))
    issues.add(line.number, "Callouts are not supported.");
  if (/^\s*\|.*\|\s*$/.test(text) || /^\s*\|?\s*:?-{3,}:?\s*\|/.test(text)) {
    issues.add(line.number, "Tables are not supported.");
  }
  if (/^\s*(?:```|~~~)/.test(text))
    issues.add(line.number, "Code fences are not supported.");

  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const destination = match[1].trim().split(/\s+/)[0].replace(/^<|>$/g, "");
    validatePublicUrl(destination, line.number, "Markdown link", issues);
  }
}

function parseFrontmatter(
  lines: string[],
  issues: Issues
): { values: Map<string, FieldValue>; bodyStart: number } {
  const values = new Map<string, FieldValue>();
  if (lines[0] !== "---") {
    issues.add(1, "Start resume.md with a YAML frontmatter fence (---).");
    return { values, bodyStart: 0 };
  }

  const closingFence = lines.findIndex(
    (line, index) => index > 0 && line === "---"
  );
  if (closingFence < 0) {
    issues.add(
      lines.length,
      "Close the YAML frontmatter with a second --- line."
    );
    return { values, bodyStart: lines.length };
  }

  const counter = new LineCounter();
  const document = parseDocument(lines.slice(1, closingFence).join("\n"), {
    lineCounter: counter,
    uniqueKeys: true,
    strict: true
  });
  for (const error of document.errors) {
    issues.add(
      (error.linePos?.[0].line ?? 1) + 1,
      `Invalid YAML frontmatter: ${error.message.split("\n")[0]}`
    );
  }
  if (!isMap(document.contents)) {
    issues.add(2, "YAML frontmatter must be a key-value map.");
    return { values, bodyStart: closingFence + 1 };
  }

  for (const item of document.contents.items) {
    const line = counter.linePos(item.key?.range?.[0] ?? 0).line + 1;
    if (!isScalar(item.key) || typeof item.key.value !== "string") {
      issues.add(line, "Frontmatter keys must be plain text.");
      continue;
    }
    const key = item.key.value;
    if (!FRONTMATTER_KEYS.has(key)) {
      issues.add(line, `Unknown frontmatter field: ${key}.`);
      continue;
    }
    if (values.has(key)) {
      issues.add(line, `Duplicate frontmatter field: ${key}.`);
      continue;
    }
    if (!isScalar(item.value)) {
      issues.add(line, `${key} must be a single value.`);
      continue;
    }
    const raw = item.value.value;
    if (key === "schema_version") {
      if (raw !== 1) issues.add(line, "schema_version must be the number 1.");
      values.set(key, { value: String(raw), line });
      continue;
    }
    if (typeof raw !== "string") {
      issues.add(line, `${key} must be text.`);
      continue;
    }
    const value = validatePlainText(raw, line, key, issues);
    values.set(key, { value, line });
  }

  for (const required of ["schema_version", "headline"]) {
    if (!values.has(required))
      issues.add(2, `Missing required frontmatter field: ${required}.`);
  }
  if (!values.has("email") && !values.has("linkedin")) {
    issues.add(
      2,
      "Provide at least one public recruiter contact route: email or linkedin."
    );
  }
  const email = values.get("email");
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
    issues.add(
      email.line,
      "email must be a public email address, without mailto:."
    );
  }
  for (const key of ["website", "linkedin", "github"]) {
    const field = values.get(key);
    if (field) validateFieldUrl(field.value, field.line, key, issues);
  }
  return { values, bodyStart: closingFence + 1 };
}

function parseSections(
  lines: SourceLine[],
  issues: Issues
): { name: string; sections: Map<string, Section> } {
  let name = "";
  const sections = new Map<string, Section>();
  let current: Section | undefined;
  let sawName = false;
  let lastSectionIndex = -1;

  for (const line of lines) {
    validateNarrative(line, issues);
    if (!line.text.trim()) continue;
    const heading = line.text.match(HEADING);
    if (heading?.[1] === "#") {
      if (sawName)
        issues.add(line.number, "Use exactly one level-one name heading.");
      else if (current)
        issues.add(line.number, "Place the name before all sections.");
      name = validatePlainText(heading[2], line.number, "Name", issues);
      sawName = true;
      continue;
    }
    if (!sawName) {
      issues.add(
        line.number,
        "The first body content must be the level-one name heading."
      );
      sawName = true;
    }
    if (heading?.[1] === "##") {
      const title = heading[2];
      const sectionIndex = SECTION_NAMES.findIndex((value) => value === title);
      if (sectionIndex < 0)
        issues.add(line.number, `Unknown section heading: ${title}.`);
      else {
        if (sections.has(title))
          issues.add(line.number, `Duplicate section heading: ${title}.`);
        if (sectionIndex <= lastSectionIndex)
          issues.add(line.number, `${title} is out of schema order.`);
        lastSectionIndex = sectionIndex;
      }
      current = { title, line: line.number, lines: [] };
      if (!sections.has(title)) sections.set(title, current);
      continue;
    }
    if (heading && heading[1] !== "###") {
      issues.add(
        line.number,
        "Only level-one, level-two, and level-three headings are supported."
      );
    }
    if (!current)
      issues.add(line.number, "Content must appear inside a named section.");
    else current.lines.push(line);
  }

  if (!name)
    issues.add(lines[0]?.number ?? 1, "Missing level-one name heading.");
  for (const required of ["Summary", "Experience", "Skills"]) {
    if (!sections.has(required))
      issues.add(
        lines.at(-1)?.number ?? 1,
        `Missing required section: ${required}.`
      );
  }
  return { name, sections };
}

function parseEntries(section: Section | undefined, issues: Issues): Entry[] {
  if (!section) return [];
  const entries: Entry[] = [];
  let current: Entry | undefined;
  for (const line of section.lines) {
    if (!line.text.trim()) continue;
    const heading = line.text.match(HEADING);
    if (heading?.[1] === "###") {
      current = {
        title: validatePlainText(
          heading[2],
          line.number,
          "Entry heading",
          issues
        ),
        line: line.number,
        lines: []
      };
      entries.push(current);
    } else if (!current) {
      issues.add(
        line.number,
        `${section.title} content must start with a level-three entry heading.`
      );
    } else {
      current.lines.push(line);
    }
  }
  if (entries.length === 0)
    issues.add(section.line, `${section.title} needs at least one entry.`);
  return entries;
}

function parseEntry(
  entry: Entry,
  allowedFields: readonly string[],
  minBullets: number,
  issues: Issues
): ParsedEntry {
  const fields = new Map<string, FieldValue>();
  const bullets: string[] = [];
  let startedBullets = false;
  let lastFieldIndex = -1;
  for (const line of entry.lines) {
    const text = line.text;
    if (/^\s+[-*+]\s+/.test(text)) {
      issues.add(line.number, "Nested or indented bullets are not supported.");
      continue;
    }
    const bullet = text.match(BULLET);
    if (bullet) {
      if (minBullets === 0) {
        issues.add(line.number, `Bullets are not supported in ${entry.title}.`);
        continue;
      }
      startedBullets = true;
      bullets.push(validatePlainText(bullet[2], line.number, "Bullet", issues));
      continue;
    }
    const field = text.match(FIELD);
    if (field) {
      const label = field[1];
      if (!allowedFields.includes(label))
        issues.add(line.number, `Unknown field in ${entry.title}: ${label}.`);
      else if (fields.has(label))
        issues.add(line.number, `Duplicate ${label} field in ${entry.title}.`);
      else if (startedBullets)
        issues.add(line.number, `${label} must appear before bullets.`);
      else {
        const fieldIndex = allowedFields.indexOf(label);
        if (fieldIndex < lastFieldIndex) {
          issues.add(
            line.number,
            `${label} is out of field order; follow the authoring schema.`
          );
        }
        lastFieldIndex = fieldIndex;
        fields.set(label, {
          value: validatePlainText(field[2] ?? "", line.number, label, issues),
          line: line.number
        });
      }
      continue;
    }
    if (/^\s{2,}\S/.test(text) && startedBullets && bullets.length > 0) {
      bullets[bullets.length - 1] += ` ${text.trim()}`;
      continue;
    }
    issues.add(
      line.number,
      `Unsupported content in ${entry.title}; use fields and single-level bullets.`
    );
  }
  if (bullets.length < minBullets)
    issues.add(
      entry.line,
      `${entry.title} needs at least ${minBullets} bullet${minBullets === 1 ? "" : "s"}.`
    );
  return { fields, bullets };
}

function requireField(
  entry: Entry,
  fields: Map<string, FieldValue>,
  key: string,
  issues: Issues
): string {
  const field = fields.get(key);
  if (!field)
    issues.add(entry.line, `${entry.title} is missing required ${key} field.`);
  return field?.value ?? "";
}

function parseDate(
  value: string,
  line: number,
  label: string,
  issues: Issues,
  allowPresent = false
): DateRange | undefined {
  if (allowPresent && value === "present") return undefined;
  const match = value.match(/^([1-9]\d{3})(?:-(0[1-9]|1[0-2]))?$/);
  if (!match) {
    issues.add(
      line,
      `${label} must use YYYY or YYYY-MM${allowPresent ? ", or lowercase present" : ""}.`
    );
    return undefined;
  }
  const year = Number(match[1]);
  const month = match[2] ? Number(match[2]) : undefined;
  return { first: year * 12 + (month ?? 1), last: year * 12 + (month ?? 12) };
}

function validateDateField(
  fields: Map<string, FieldValue>,
  key: string,
  issues: Issues,
  allowPresent = false
): DateRange | undefined {
  const field = fields.get(key);
  return field
    ? parseDate(field.value, field.line, key, issues, allowPresent)
    : undefined;
}

function parseExperience(
  section: Section | undefined,
  issues: Issues
): ResumeExperience[] {
  const entries = parseEntries(section, issues);
  const experience: ResumeExperience[] = [];
  let previousStart: DateRange | undefined;
  for (const entry of entries) {
    const { fields, bullets } = parseEntry(
      entry,
      ["Employer", "Start", "End", "Location"],
      1,
      issues
    );
    const employer = requireField(entry, fields, "Employer", issues);
    const start = requireField(entry, fields, "Start", issues);
    const end = requireField(entry, fields, "End", issues);
    const startDate = validateDateField(fields, "Start", issues);
    const endDate = validateDateField(fields, "End", issues, true);
    if (startDate && endDate && startDate.first > endDate.last) {
      issues.add(
        fields.get("End")?.line ?? entry.line,
        "End must be the same as or later than Start."
      );
    }
    if (startDate && previousStart && previousStart.last < startDate.first) {
      issues.add(
        fields.get("Start")?.line ?? entry.line,
        "List experience entries newest first by Start date."
      );
    }
    previousStart = startDate;
    experience.push({
      title: entry.title,
      employer,
      start,
      end,
      ...(fields.get("Location") && {
        location: fields.get("Location")!.value
      }),
      achievements: bullets
    });
  }
  return experience;
}

function parseSkills(
  section: Section | undefined,
  issues: Issues
): ResumeSkillCategory[] {
  return parseEntries(section, issues).map((entry) => {
    const { bullets } = parseEntry(entry, [], 1, issues);
    return { name: entry.title, skills: bullets };
  });
}

function parseProjects(
  section: Section | undefined,
  issues: Issues
): ResumeProject[] | undefined {
  if (!section) return undefined;
  return parseEntries(section, issues).map((entry) => {
    const { fields, bullets } = parseEntry(entry, ["Link"], 1, issues);
    const link = fields.get("Link");
    if (link) validatePublicUrl(link.value, link.line, "Link", issues);
    return {
      name: entry.title,
      ...(link && { link: link.value }),
      achievements: bullets
    };
  });
}

function parseEducation(
  section: Section | undefined,
  issues: Issues
): ResumeEducation[] | undefined {
  if (!section) return undefined;
  return parseEntries(section, issues).map((entry) => {
    const { fields } = parseEntry(
      entry,
      ["Institution", "Completed"],
      0,
      issues
    );
    const institution = requireField(entry, fields, "Institution", issues);
    validateDateField(fields, "Completed", issues);
    const completed = fields.get("Completed")?.value;
    return { name: entry.title, institution, ...(completed && { completed }) };
  });
}

function parseCertifications(
  section: Section | undefined,
  issues: Issues
): ResumeCertification[] | undefined {
  if (!section) return undefined;
  return parseEntries(section, issues).map((entry) => {
    const { fields } = parseEntry(
      entry,
      ["Issuer", "Issued", "Expires", "Link"],
      0,
      issues
    );
    const issuer = requireField(entry, fields, "Issuer", issues);
    const issuedDate = validateDateField(fields, "Issued", issues);
    const expiresDate = validateDateField(fields, "Expires", issues);
    if (issuedDate && expiresDate && issuedDate.first > expiresDate.last) {
      issues.add(
        fields.get("Expires")?.line ?? entry.line,
        "Expires must be the same as or later than Issued."
      );
    }
    const link = fields.get("Link");
    if (link) validatePublicUrl(link.value, link.line, "Link", issues);
    return {
      name: entry.title,
      issuer,
      ...(fields.get("Issued") && { issued: fields.get("Issued")!.value }),
      ...(fields.get("Expires") && { expires: fields.get("Expires")!.value }),
      ...(link && { link: link.value })
    };
  });
}

export function parseResumeMarkdown(source: string): ResumeDocument {
  const issues = new Issues();
  const rawLines = source.replace(/\r\n?/g, "\n").split("\n");
  const { values, bodyStart } = parseFrontmatter(rawLines, issues);
  const bodyLines = rawLines
    .slice(bodyStart)
    .map((text, index) => ({ number: bodyStart + index + 1, text }));
  const { name, sections } = parseSections(bodyLines, issues);
  const summarySection = sections.get("Summary");
  const summary =
    summarySection?.lines
      .map((line) => line.text)
      .join("\n")
      .trim() ?? "";
  if (!summary)
    issues.add(
      summarySection?.line ?? bodyStart + 1,
      "Summary needs at least one paragraph."
    );
  if (summarySection) {
    for (const line of summarySection.lines) {
      if (/^\s*[-*+]\s+/.test(line.text) || HEADING.test(line.text)) {
        issues.add(line.number, "Summary supports paragraphs only.");
      }
    }
  }

  const experience = parseExperience(sections.get("Experience"), issues);
  const skills = parseSkills(sections.get("Skills"), issues);
  const selectedProjects = parseProjects(
    sections.get("Selected Projects"),
    issues
  );
  const education = parseEducation(sections.get("Education"), issues);
  const certifications = parseCertifications(
    sections.get("Certifications"),
    issues
  );
  issues.throwIfAny();

  const contact: ResumeContact = {};
  for (const key of [
    "location",
    "email",
    "website",
    "linkedin",
    "github"
  ] as const) {
    const field = values.get(key);
    if (field) contact[key] = field.value;
  }
  return {
    schemaVersion: 1,
    name,
    headline: values.get("headline")!.value,
    contact,
    summary,
    experience,
    skills,
    ...(selectedProjects && { selectedProjects }),
    ...(education && { education }),
    ...(certifications && { certifications })
  };
}
