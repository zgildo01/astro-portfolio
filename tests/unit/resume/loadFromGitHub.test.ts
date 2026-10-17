import { describe, expect, it, vi } from "vitest";

import { loadResumeFromGitHub } from "../../../src/lib/resume/loadFromGitHub";

const COMMIT_SHA = "a".repeat(40);
const TOKEN = "private-test-token";
const MARKDOWN = "# Zeus Zaragoza\n\n## Summary\n\nPlatform Engineer.\n";

const source = {
  owner: "zgildo01",
  repo: "Zeus-Vault",
  path: "career/resume.md",
  commitSha: COMMIT_SHA,
  token: TOKEN
};

function fileResponse(markdown = MARKDOWN) {
  return {
    type: "file",
    path: source.path,
    encoding: "base64",
    content: Buffer.from(markdown).toString("base64")
  };
}

describe("loadResumeFromGitHub", () => {
  it("loads one UTF-8 file at the exact pinned commit SHA", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://api.github.com");
        expect(url.pathname).toBe(
          "/repos/zgildo01/Zeus-Vault/contents/career/resume.md"
        );
        expect(url.searchParams.get("ref")).toBe(COMMIT_SHA);
        expect(init).toMatchObject({
          method: "GET",
          redirect: "error",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${TOKEN}`
          }
        });

        return Response.json(fileResponse());
      }
    );

    await expect(loadResumeFromGitHub({ ...source, fetcher })).resolves.toBe(
      MARKDOWN
    );

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("accepts line-wrapped Base64 content from GitHub", async () => {
    const encoded = Buffer.from(MARKDOWN).toString("base64");
    const wrapped = encoded.match(/.{1,20}/g)?.join("\n");
    const fetcher = vi.fn(async () =>
      Response.json({ ...fileResponse(), content: wrapped })
    );

    await expect(loadResumeFromGitHub({ ...source, fetcher })).resolves.toBe(
      MARKDOWN
    );
  });

  it.each(["", "main", COMMIT_SHA.slice(0, 7), `${COMMIT_SHA}x`])(
    "rejects an unpinned or invalid revision: %s",
    async (commitSha) => {
      const fetcher = vi.fn(async () => Response.json(fileResponse()));

      await expect(
        loadResumeFromGitHub({ ...source, commitSha, fetcher })
      ).rejects.toThrow("A full 40-character commit SHA is required");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each(["", " ", undefined])(
    "requires a token before making a request",
    async (token) => {
      const fetcher = vi.fn(async () => Response.json(fileResponse()));

      await expect(
        loadResumeFromGitHub({ ...source, token, fetcher })
      ).rejects.toThrow("A GitHub access token is required");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("does not expose GitHub's error body or the access token", async () => {
    const privateBody = `Private content: ${TOKEN}`;
    const fetcher = vi.fn(
      async () => new Response(privateBody, { status: 404 })
    );

    let caught: unknown;
    try {
      await loadResumeFromGitHub({ ...source, fetcher });
    } catch (error) {
      caught = error;
    }

    expect(String(caught)).toBe(
      "Error: Unable to load the GitHub resume source (HTTP 404)."
    );
    expect(String(caught)).not.toContain(TOKEN);
    expect(String(caught)).not.toContain(privateBody);
  });

  it("does not expose network error messages", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error(`Request failed for ${TOKEN}`);
    });

    await expect(loadResumeFromGitHub({ ...source, fetcher })).rejects.toThrow(
      "Unable to request the GitHub resume source."
    );
  });

  it.each([
    ["directory", []],
    ["wrong path", { ...fileResponse(), path: "another.md" }],
    ["unsupported encoding", { ...fileResponse(), encoding: "none" }],
    ["missing content", { type: "file", path: source.path, encoding: "base64" }]
  ])("rejects a %s response", async (_description, payload) => {
    const fetcher = vi.fn(async () => Response.json(payload));

    await expect(loadResumeFromGitHub({ ...source, fetcher })).rejects.toThrow(
      "The GitHub resume source is not a supported file."
    );
  });

  it.each([
    ["bad Base64", { ...fileResponse(), content: "this is not base64!" }],
    ["invalid UTF-8", { ...fileResponse(), content: "/w==" }],
    ["empty Markdown", fileResponse(" \n ")]
  ])("rejects %s", async (_description, payload) => {
    const fetcher = vi.fn(async () => Response.json(payload));

    await expect(loadResumeFromGitHub({ ...source, fetcher })).rejects.toThrow(
      "The GitHub resume source content is invalid."
    );
  });

  it("rejects invalid JSON without exposing the response body", async () => {
    const fetcher = vi.fn(async () => new Response(`private ${TOKEN}`));

    await expect(loadResumeFromGitHub({ ...source, fetcher })).rejects.toThrow(
      "The GitHub resume source response is invalid."
    );
  });
});
