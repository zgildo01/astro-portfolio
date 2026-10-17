import { describe, expect, it, vi } from "vitest";

import { resolveGitHubResumeCommit } from "../../../src/lib/resume/resolveGitHubBranch";

const COMMIT_SHA = "a".repeat(40);
const TOKEN = "private-test-token";
const source = {
  owner: "zgildo01",
  repo: "Zeus-Vault",
  branch: "main",
  token: TOKEN
};

function refResponse(commitSha = COMMIT_SHA): Response {
  return Response.json({
    ref: "refs/heads/main",
    object: { type: "commit", sha: commitSha }
  });
}

describe("resolveGitHubResumeCommit", () => {
  it("resolves main using the private repository token", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://api.github.com");
        expect(url.pathname).toBe(
          "/repos/zgildo01/Zeus-Vault/git/ref/heads/main"
        );
        expect(url.search).toBe("");
        expect(init).toMatchObject({
          method: "GET",
          redirect: "error",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: "Bearer " + TOKEN
          }
        });
        return refResponse();
      }
    );

    await expect(
      resolveGitHubResumeCommit({ ...source, fetcher })
    ).resolves.toBe(COMMIT_SHA);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each(["", " ", undefined])(
    "requires a token before making a request",
    async (token) => {
      const fetcher = vi.fn(async () => refResponse());
      await expect(
        resolveGitHubResumeCommit({ ...source, token, fetcher })
      ).rejects.toThrow("A GitHub access token is required");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each(["", " ", "../main"])(
    "rejects an invalid branch before requesting GitHub: %s",
    async (branch) => {
      const fetcher = vi.fn(async () => refResponse());
      await expect(
        resolveGitHubResumeCommit({ ...source, branch, fetcher })
      ).rejects.toThrow("The GitHub resume source location is invalid.");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("does not expose GitHub's error body or the access token", async () => {
    const privateBody = "Private content: " + TOKEN;
    const fetcher = vi.fn(
      async () => new Response(privateBody, { status: 404 })
    );

    let caught: unknown;
    try {
      await resolveGitHubResumeCommit({ ...source, fetcher });
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toBe(
      "Error: Unable to resolve the GitHub resume branch (HTTP 404)."
    );
    expect(String(caught)).not.toContain(TOKEN);
    expect(String(caught)).not.toContain(privateBody);
  });

  it("does not expose network error messages", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Request failed for " + TOKEN);
    });

    await expect(
      resolveGitHubResumeCommit({ ...source, fetcher })
    ).rejects.toThrow("Unable to request the GitHub resume branch.");
  });

  it.each([
    ["missing object", { ref: "refs/heads/main" }],
    [
      "tag object",
      { ref: "refs/heads/main", object: { type: "tag", sha: COMMIT_SHA } }
    ],
    [
      "short SHA",
      { ref: "refs/heads/main", object: { type: "commit", sha: "abc123" } }
    ],
    [
      "wrong ref",
      { ref: "refs/heads/other", object: { type: "commit", sha: COMMIT_SHA } }
    ]
  ])("rejects a %s response", async (_description, payload) => {
    const fetcher = vi.fn(async () => Response.json(payload));
    await expect(
      resolveGitHubResumeCommit({ ...source, fetcher })
    ).rejects.toThrow("The GitHub resume branch response is invalid.");
  });

  it("rejects invalid JSON without showing the response body", async () => {
    const fetcher = vi.fn(async () => new Response("private " + TOKEN));
    let caught: unknown;
    try {
      await resolveGitHubResumeCommit({ ...source, fetcher });
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).toBe(
      "Error: The GitHub resume branch response is invalid."
    );
    expect(String(caught)).not.toContain(TOKEN);
  });
});
