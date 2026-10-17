import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

const sourceState = vi.hoisted(() => ({ branch: "main" }));

vi.mock("../../../src/config/resumeContentSource", () => ({
  resumeContentSource: {
    owner: "zgildo01",
    repo: "Zeus-Vault",
    path: "resume.md",
    get branch() {
      return sourceState.branch;
    }
  }
}));

import { loadValidatedResume } from "../../../src/lib/resume/loadValidatedResume";

const execFileAsync = promisify(execFile);
const TOKEN = "private-test-token";
const FIRST_SHA = "a".repeat(40);
const SECOND_SHA = "b".repeat(40);
const VALID_MARKDOWN = [
  "---",
  "schema_version: 1",
  "headline: Platform Engineer",
  "linkedin: https://www.linkedin.com/in/example/",
  "---",
  "",
  "# Example Engineer",
  "",
  "## Summary",
  "",
  "I build tools that help teams deliver software.",
  "",
  "## Experience",
  "",
  "### Platform Engineer",
  "",
  "Employer: Example Co",
  "Start: 2025-06",
  "End: present",
  "",
  "- Built a release tool for the team.",
  "",
  "## Skills",
  "",
  "### Tools",
  "",
  "- Git",
  ""
].join("\n");
const UPDATED_MARKDOWN = VALID_MARKDOWN.replace(
  "# Example Engineer",
  "# Updated Engineer"
);
const PRIVATE_INVALID_MARKDOWN = "Secret vault material, not a resume.";
const temporaryCheckouts: string[] = [];

async function git(checkoutPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", checkoutPath, ...args]);
  return stdout.trim();
}

async function commit(checkoutPath: string, message: string): Promise<string> {
  await git(checkoutPath, "add", "-A");
  await git(
    checkoutPath,
    "-c",
    "user.name=Resume Test",
    "-c",
    "user.email=resume@example.test",
    "commit",
    "-q",
    "-m",
    message
  );
  return git(checkoutPath, "rev-parse", "refs/heads/main");
}

async function createCheckout(markdown: string): Promise<{
  checkoutPath: string;
  commitSha: string;
}> {
  const checkoutPath = await mkdtemp(join(tmpdir(), "resume-checkout-"));
  temporaryCheckouts.push(checkoutPath);
  await git(checkoutPath, "init", "-q", "-b", "main");
  await writeFile(join(checkoutPath, "resume.md"), markdown);
  return {
    checkoutPath,
    commitSha: await commit(checkoutPath, "Add synthetic resume")
  };
}

function githubResponse(markdown: string): Response {
  return Response.json({
    type: "file",
    path: "resume.md",
    encoding: "base64",
    content: Buffer.from(markdown).toString("base64")
  });
}

function githubRefResponse(commitSha: string): Response {
  return Response.json({
    ref: "refs/heads/" + sourceState.branch,
    object: { type: "commit", sha: commitSha }
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryCheckouts
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
  sourceState.branch = "main";
});

describe("loadValidatedResume", () => {
  it("reads committed local main, ignores edits, and follows later commits", async () => {
    const { checkoutPath, commitSha } = await createCheckout(VALID_MARKDOWN);

    const first = await loadValidatedResume({ mode: "local", checkoutPath });
    expect(first.sourceCommitSha).toBe(commitSha);
    expect(first.resume.name).toBe("Example Engineer");
    expect(first.resume.experience[0].achievements).toEqual([
      "Built a release tool for the team."
    ]);

    await writeFile(join(checkoutPath, "resume.md"), PRIVATE_INVALID_MARKDOWN);
    expect(await loadValidatedResume({ mode: "local", checkoutPath })).toEqual(
      first
    );

    await writeFile(join(checkoutPath, "resume.md"), UPDATED_MARKDOWN);
    const nextCommitSha = await commit(checkoutPath, "Update synthetic resume");
    const second = await loadValidatedResume({ mode: "local", checkoutPath });
    expect(nextCommitSha).not.toBe(commitSha);
    expect(second.sourceCommitSha).toBe(nextCommitSha);
    expect(second.resume.name).toBe("Updated Engineer");
  });

  it("reads the configured local branch instead of assuming main", async () => {
    const { checkoutPath, commitSha } = await createCheckout(VALID_MARKDOWN);
    await git(checkoutPath, "branch", "-m", "release");
    sourceState.branch = "release";

    const loaded = await loadValidatedResume({ mode: "local", checkoutPath });
    expect(loaded.sourceCommitSha).toBe(commitSha);
    expect(loaded.resume.name).toBe("Example Engineer");
  });

  it("rejects missing local main without showing private checkout data", async () => {
    const { checkoutPath } = await createCheckout(VALID_MARKDOWN);
    await git(checkoutPath, "branch", "-m", "other");

    let caught: unknown;
    try {
      await loadValidatedResume({ mode: "local", checkoutPath });
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toContain("local vault branch");
    expect(String(caught)).not.toContain(checkoutPath);
    expect(String(caught)).not.toContain(VALID_MARKDOWN);
  });

  it("rejects a missing root resume file at local main", async () => {
    const { checkoutPath } = await createCheckout(VALID_MARKDOWN);
    await git(checkoutPath, "mv", "resume.md", "other.md");
    await commit(checkoutPath, "Move synthetic resume");

    await expect(
      loadValidatedResume({ mode: "local", checkoutPath })
    ).rejects.toThrow("local vault branch");
  });

  it("resolves GitHub main once and fetches the exact selected commit", async () => {
    let headSha = FIRST_SHA;
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(init?.headers).toMatchObject({
          Authorization: "Bearer " + TOKEN
        });

        if (url.pathname === "/repos/zgildo01/Zeus-Vault/git/ref/heads/main") {
          expect(url.search).toBe("");
          return githubRefResponse(headSha);
        }

        expect(url.pathname).toBe(
          "/repos/zgildo01/Zeus-Vault/contents/resume.md"
        );
        expect(url.searchParams.get("ref")).toBe(FIRST_SHA);
        // A later push cannot change the selected file within this build.
        headSha = SECOND_SHA;
        return githubResponse(VALID_MARKDOWN);
      }
    );

    const loaded = await loadValidatedResume({
      mode: "github",
      token: TOKEN,
      fetcher
    });
    expect(loaded.sourceCommitSha).toBe(FIRST_SHA);
    expect(loaded.resume.name).toBe("Example Engineer");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("resolves the configured GitHub branch instead of assuming main", async () => {
    sourceState.branch = "release";
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/repos/zgildo01/Zeus-Vault/git/ref/heads/release") {
        return githubRefResponse(FIRST_SHA);
      }
      expect(url.pathname).toBe(
        "/repos/zgildo01/Zeus-Vault/contents/resume.md"
      );
      expect(url.searchParams.get("ref")).toBe(FIRST_SHA);
      return githubResponse(VALID_MARKDOWN);
    });

    const loaded = await loadValidatedResume({
      mode: "github",
      token: TOKEN,
      fetcher
    });
    expect(loaded.sourceCommitSha).toBe(FIRST_SHA);
    expect(loaded.resume.name).toBe("Example Engineer");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("uses the new GitHub main commit on a later build", async () => {
    let headSha = FIRST_SHA;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/git/ref/heads/main")) {
        return githubRefResponse(headSha);
      }
      expect(url.searchParams.get("ref")).toBe(headSha);
      return githubResponse(
        headSha === FIRST_SHA ? VALID_MARKDOWN : UPDATED_MARKDOWN
      );
    });

    const first = await loadValidatedResume({
      mode: "github",
      token: TOKEN,
      fetcher
    });
    headSha = SECOND_SHA;
    const second = await loadValidatedResume({
      mode: "github",
      token: TOKEN,
      fetcher
    });

    expect(first).toMatchObject({
      sourceCommitSha: FIRST_SHA,
      resume: { name: "Example Engineer" }
    });
    expect(second).toMatchObject({
      sourceCommitSha: SECOND_SHA,
      resume: { name: "Updated Engineer" }
    });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("fails closed when the GitHub token is absent", async () => {
    const fetcher = vi.fn(async () => githubRefResponse(FIRST_SHA));

    await expect(
      loadValidatedResume({ mode: "github", token: undefined, fetcher })
    ).rejects.toThrow("A GitHub access token is required");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("reports invalid source content without exposing it or the token", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.pathname.endsWith("/git/ref/heads/main")
        ? githubRefResponse(FIRST_SHA)
        : githubResponse(PRIVATE_INVALID_MARKDOWN);
    });
    let caught: unknown;

    try {
      await loadValidatedResume({ mode: "github", token: TOKEN, fetcher });
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toContain(
      "resume from the selected branch failed validation"
    );
    expect(String(caught)).not.toContain(PRIVATE_INVALID_MARKDOWN);
    expect(String(caught)).not.toContain(TOKEN);
  });
});
