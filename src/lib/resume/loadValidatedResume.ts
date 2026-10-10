import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { resumeContentSource } from "../../config/resumeContentSource";
import { loadResumeFromGitHub } from "./loadFromGitHub";
import { parseResumeMarkdown } from "./parseResumeMarkdown";
import { resolveGitHubResumeCommit } from "./resolveGitHubBranch";
import { ResumeValidationError, type ResumeDocument } from "./types";

const execFileAsync = promisify(execFile);
const MAX_RESUME_BYTES = 2 * 1024 * 1024;
const FULL_COMMIT_SHA = /^[0-9a-fA-F]{40}$/;

export interface LoadedResume {
  resume: ResumeDocument;
  sourceCommitSha: string;
}

export type ResumeLoadOptions =
  | { mode: "github"; token: string | undefined; fetcher?: typeof fetch }
  | { mode: "local"; checkoutPath: string };

/** Resolves the configured branch once, then validates that revision at build time. */
export async function loadValidatedResume(
  options: ResumeLoadOptions
): Promise<LoadedResume> {
  let markdown: string;
  let sourceCommitSha: string;

  if (options.mode === "github") {
    sourceCommitSha = await resolveGitHubResumeCommit({
      ...resumeContentSource,
      token: options.token,
      fetcher: options.fetcher
    });
    markdown = await loadResumeFromGitHub({
      owner: resumeContentSource.owner,
      repo: resumeContentSource.repo,
      path: resumeContentSource.path,
      commitSha: sourceCommitSha,
      token: options.token,
      fetcher: options.fetcher
    });
  } else {
    if (!options.checkoutPath.trim()) {
      throw new Error("A local vault checkout path is required.");
    }

    try {
      const { stdout: revision } = await execFileAsync(
        "git",
        [
          "-C",
          options.checkoutPath,
          "rev-parse",
          "--verify",
          `refs/heads/${resumeContentSource.branch}^{commit}`
        ],
        { encoding: "utf8", maxBuffer: 1024 }
      );
      sourceCommitSha = revision.trim();
      if (!FULL_COMMIT_SHA.test(sourceCommitSha)) {
        throw new Error(
          "The local branch did not resolve to a full commit SHA."
        );
      }

      const { stdout } = await execFileAsync(
        "git",
        [
          "-C",
          options.checkoutPath,
          "show",
          `${sourceCommitSha}:${resumeContentSource.path}`
        ],
        { encoding: "buffer", maxBuffer: MAX_RESUME_BYTES }
      );
      markdown = new TextDecoder("utf-8", { fatal: true }).decode(stdout);
    } catch {
      throw new Error("Unable to load the resume from the local vault branch.");
    }
  }

  try {
    return { resume: parseResumeMarkdown(markdown), sourceCommitSha };
  } catch (error) {
    if (error instanceof ResumeValidationError) {
      const lines = [...new Set(error.issues.map(({ line }) => line))];
      const location = lines.length
        ? ` at line${lines.length === 1 ? "" : "s"} ${lines.slice(0, 10).join(", ")}`
        : "";
      // The parser error can contain private resume text, so omit its cause.
      // eslint-disable-next-line preserve-caught-error
      throw new Error(
        `The resume from the selected branch failed validation${location}.`
      );
    }
    // Do not retain an unexpected error that might include private source text.
    // eslint-disable-next-line preserve-caught-error
    throw new Error("Unable to validate the resume from the selected branch.");
  }
}
