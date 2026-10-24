import { resumeContentSource } from "./resumeContentSource";

/** Only notes in this vault directory are eligible for case-study publication. */
export const workContentSource = {
  owner: resumeContentSource.owner,
  repo: resumeContentSource.repo,
  directory: "portfolio/work"
} as const;
