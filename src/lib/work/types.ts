export interface CaseStudySection {
  id: string;
  title: string;
  paragraphs: readonly string[];
  workflow?: readonly string[];
}

export interface CaseStudy {
  slug: string;
  title: string;
  description: string;
  organization: string;
  category: string;
  role: string;
  technologies: readonly string[];
  sections: readonly CaseStudySection[];
}

export interface WorkValidationIssue {
  line: number;
  message: string;
}

export class WorkValidationError extends Error {
  readonly issues: readonly WorkValidationIssue[];

  constructor(issues: readonly WorkValidationIssue[]) {
    super(
      `Invalid work markdown:\n${issues.map(({ line, message }) => `Line ${line}: ${message}`).join("\n")}`
    );
    this.name = "WorkValidationError";
    this.issues = issues;
  }
}
