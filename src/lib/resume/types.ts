export interface ResumeContact {
  location?: string;
  email?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface ResumeExperience {
  title: string;
  employer: string;
  start: string;
  end: string;
  location?: string;
  achievements: string[];
}

export interface ResumeSkillCategory {
  name: string;
  skills: string[];
}

export interface ResumeProject {
  name: string;
  link?: string;
  achievements: string[];
}

export interface ResumeEducation {
  name: string;
  institution: string;
  completed?: string;
}

export interface ResumeCertification {
  name: string;
  issuer: string;
  issued?: string;
  expires?: string;
  link?: string;
}

export interface ResumeDocument {
  schemaVersion: 1;
  name: string;
  headline: string;
  contact: ResumeContact;
  summary: string;
  experience: ResumeExperience[];
  skills: ResumeSkillCategory[];
  selectedProjects?: ResumeProject[];
  education?: ResumeEducation[];
  certifications?: ResumeCertification[];
}

export interface ResumeValidationIssue {
  line: number;
  message: string;
}

export class ResumeValidationError extends Error {
  readonly issues: ResumeValidationIssue[];

  constructor(issues: ResumeValidationIssue[]) {
    super(
      `Invalid resume markdown:\n${issues.map(({ line, message }) => `Line ${line}: ${message}`).join("\n")}`
    );
    this.name = "ResumeValidationError";
    this.issues = issues;
  }
}
