import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadWorkForBuild } from "../../../src/lib/work/loadWorkForBuild";

const execFileAsync = promisify(execFile);
const SHA = "a".repeat(40);
const TOKEN = "private-work-test-token";
const DIRECTORY = "portfolio/work";
const PRIVATE_TEXT = "Private material must not appear in an error.";
const temporaryCheckouts: string[] = [];

function publishedMarkdown(slug = "python-documentation"): string {
  return [
    "---",
    "schemaVersion: 1",
    "status: published",
    `slug: ${slug}`,
    "title: Python documentation automation",
    "description: Generated documentation from existing Python comments.",
    "organization: Example Co",
    "category: Developer tooling",
    "role: Software Engineer",
    "technologies: [Python, Sphinx]",
    "---",
    "",
    "## The problem",
    "",
    "Documentation was maintained manually.",
    "",
    "## My contribution",
    "",
    "I built the extraction and generation process.",
    "",
    "## The approach",
    "",
    "The extension generated Markdown from documentation comments.",
    "",
    "## The outcome",
    "",
    "Engineers used the documentation to coordinate development.",
    ""
  ].join("\n");
}

async function git(checkoutPath: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", checkoutPath, ...args]);
  return stdout.trim();
}

async function commit(checkoutPath: string): Promise<string> {
  await git(checkoutPath, "add", "-A");
  await git(
    checkoutPath,
    "-c",
    "user.name=Work Test",
    "-c",
    "user.email=work@example.test",
    "commit",
    "-q",
    "-m",
    "Commit synthetic content"
  );
  return git(checkoutPath, "rev-parse", "HEAD");
}

async function createCheckout(
  files: Record<string, string> = {}
): Promise<{ checkoutPath: string; sourceCommitSha: string }> {
  const checkoutPath = await mkdtemp(join(tmpdir(), "work-checkout-"));
  temporaryCheckouts.push(checkoutPath);
  await git(checkoutPath, "init", "-q", "-b", "master");
  await writeFile(join(checkoutPath, "unrelated.txt"), PRIVATE_TEXT);
  for (const [name, content] of Object.entries(files)) {
    await mkdir(join(checkoutPath, DIRECTORY), { recursive: true });
    await writeFile(join(checkoutPath, DIRECTORY, name), content);
  }
  return { checkoutPath, sourceCommitSha: await commit(checkoutPath) };
}

function noteSha(name: string): string {
  return createHash("sha1").update(name).digest("hex");
}

function directoryEntry(name: string, overrides: Record<string, unknown> = {}) {
  return {
    name,
    path: `${DIRECTORY}/${name}`,
    type: "file",
    sha: noteSha(name),
    size: Buffer.byteLength(publishedMarkdown()),
    download_url: "https://untrusted.example.test/do-not-request",
    ...overrides
  };
}

function fileResponse(name: string, markdown = publishedMarkdown()) {
  return Response.json({
    sha: noteSha(name),
    encoding: "base64",
    content: Buffer.from(markdown).toString("base64")
  });
}

afterEach(async () => {
  await Promise.all(
    temporaryCheckouts
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe("loadWorkForBuild", () => {
  it("reads committed direct Markdown files in deterministic filename order", async () => {
    const { checkoutPath, sourceCommitSha } = await createCheckout({
      "z-last.md": publishedMarkdown("last-study"),
      "a-first.md": publishedMarkdown("first-study"),
      "draft.md": `---\nstatus: draft\n---\n${PRIVATE_TEXT}`,
      "planning.md": PRIVATE_TEXT,
      "notes.txt": PRIVATE_TEXT
    });
    await writeFile(join(checkoutPath, DIRECTORY, "a-first.md"), PRIVATE_TEXT);
    await writeFile(
      join(checkoutPath, DIRECTORY, "uncommitted.md"),
      publishedMarkdown("uncommitted-study")
    );
    await mkdir(join(checkoutPath, DIRECTORY, "nested"));
    await writeFile(
      join(checkoutPath, DIRECTORY, "nested", "hidden.md"),
      publishedMarkdown("nested-study")
    );

    const studies = await loadWorkForBuild({
      vaultDir: checkoutPath,
      sourceCommitSha
    });
    expect(studies.map(({ slug }) => slug)).toEqual([
      "first-study",
      "last-study"
    ]);
    await commit(checkoutPath);
    expect(
      await loadWorkForBuild({ vaultDir: checkoutPath, sourceCommitSha })
    ).toEqual(studies);
  });

  it("allows an absent work folder without reading other vault content", async () => {
    const { checkoutPath, sourceCommitSha } = await createCheckout();
    await expect(
      loadWorkForBuild({ vaultDir: checkoutPath, sourceCommitSha })
    ).resolves.toEqual([]);
  });

  it("rejects duplicate published slugs", async () => {
    const { checkoutPath, sourceCommitSha } = await createCheckout({
      "one.md": publishedMarkdown(),
      "two.md": publishedMarkdown()
    });
    await expect(
      loadWorkForBuild({ vaultDir: checkoutPath, sourceCommitSha })
    ).rejects.toThrow("unique slugs");
  });

  it("reports invalid published notes without private text, filenames, or causes", async () => {
    const { checkoutPath, sourceCommitSha } = await createCheckout({
      "private-customer-name.md": publishedMarkdown().replace(
        "slug: python-documentation",
        `slug: ${PRIVATE_TEXT}`
      )
    });
    let caught: unknown;
    try {
      await loadWorkForBuild({ vaultDir: checkoutPath, sourceCommitSha });
    } catch (error) {
      caught = error;
    }
    expect(String(caught)).toMatch(
      /Work note 1 failed validation at lines \d+/
    );
    expect(String(caught)).not.toContain(PRIVATE_TEXT);
    expect(String(caught)).not.toContain("private-customer-name");
    expect(String(caught)).not.toContain(checkoutPath);
    expect((caught as Error).cause).toBeUndefined();
  });

  it("rejects committed symlinks instead of reading their targets", async () => {
    const { checkoutPath } = await createCheckout();
    await mkdir(join(checkoutPath, DIRECTORY), { recursive: true });
    await symlink(
      "../../unrelated.txt",
      join(checkoutPath, DIRECTORY, "link.md")
    );
    const sourceCommitSha = await commit(checkoutPath);
    await expect(
      loadWorkForBuild({ vaultDir: checkoutPath, sourceCommitSha })
    ).rejects.toThrow("regular Markdown files");
  });

  it("rejects a symlink in place of the work directory", async () => {
    const { checkoutPath } = await createCheckout();
    await mkdir(join(checkoutPath, "portfolio"));
    await symlink("../unrelated.txt", join(checkoutPath, DIRECTORY));
    const sourceCommitSha = await commit(checkoutPath);
    await expect(
      loadWorkForBuild({ vaultDir: checkoutPath, sourceCommitSha })
    ).rejects.toThrow("regular directory");
  });

  it("rejects oversized committed notes without exposing their contents", async () => {
    const { checkoutPath, sourceCommitSha } = await createCheckout({
      "large.md": PRIVATE_TEXT.repeat(4000)
    });
    await expect(
      loadWorkForBuild({ vaultDir: checkoutPath, sourceCommitSha })
    ).rejects.toThrow("Unable to read a work note");
  });

  it("pins the GitHub folder and each note to the supplied commit", async () => {
    const fetcher = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://api.github.com");
        expect(init).toMatchObject({
          method: "GET",
          redirect: "error",
          headers: { Authorization: `Bearer ${TOKEN}` }
        });
        if (url.pathname.endsWith(`/contents/${DIRECTORY}`)) {
          expect(url.searchParams.get("ref")).toBe(SHA);
          return Response.json([
            directoryEntry("z-last.md"),
            directoryEntry("a-first.md"),
            directoryEntry("draft.md"),
            directoryEntry("nested", { type: "dir" }),
            directoryEntry("ignore.txt")
          ]);
        }
        expect(url.search).toBe("");
        if (url.pathname.endsWith(`/git/blobs/${noteSha("a-first.md")}`)) {
          return fileResponse("a-first.md", publishedMarkdown("first-study"));
        }
        if (url.pathname.endsWith(`/git/blobs/${noteSha("z-last.md")}`)) {
          return fileResponse("z-last.md", publishedMarkdown("last-study"));
        }
        expect(url.pathname).toBe(
          `/repos/zgildo01/Zeus-Vault/git/blobs/${noteSha("draft.md")}`
        );
        return fileResponse(
          "draft.md",
          "---\nstatus: draft\n---\nPrivate draft."
        );
      }
    );

    const studies = await loadWorkForBuild({
      token: TOKEN,
      sourceCommitSha: SHA,
      fetcher
    });
    expect(studies.map(({ slug }) => slug)).toEqual([
      "first-study",
      "last-study"
    ]);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("treats a GitHub folder 404 as an empty collection", async () => {
    const fetcher = vi.fn(
      async () => new Response(PRIVATE_TEXT, { status: 404 })
    );
    await expect(
      loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
    ).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("never dereferences a symlink that GitHub reports as a file", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith(`/contents/${DIRECTORY}`)) {
        return Response.json([directoryEntry("link.md")]);
      }
      expect(url.pathname).toBe(
        `/repos/zgildo01/Zeus-Vault/git/blobs/${noteSha("link.md")}`
      );
      return fileResponse("link.md", "../../journal/private.md");
    });
    await expect(
      loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
    ).resolves.toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([401, 403, 429, 500])(
    "fails closed on GitHub HTTP %s without exposing response text",
    async (status) => {
      const fetcher = vi.fn(
        async () => new Response(`${PRIVATE_TEXT} ${TOKEN}`, { status })
      );
      await expect(
        loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
      ).rejects.toThrow(
        `Unable to load the GitHub work directory (HTTP ${status}).`
      );
    }
  );

  it.each([
    ["path outside the work directory", { path: "journal/private.md" }],
    [
      "nested path",
      { name: "nested/private.md", path: `${DIRECTORY}/nested/private.md` }
    ],
    [
      "traversal",
      { name: "../private.md", path: `${DIRECTORY}/../private.md` }
    ],
    ["symlink", { type: "symlink", target: "../../private.md" }],
    ["symlink reported as file", { target: "../../private.md" }],
    [
      "submodule reported as file",
      { submodule_git_url: "https://example.test/private" }
    ],
    ["oversized note", { size: 128 * 1024 + 1 }],
    ["unpinned blob", { sha: "master" }]
  ])(
    "rejects a GitHub %s without fetching the note",
    async (_label, overrides) => {
      const fetcher = vi.fn(async () =>
        Response.json([directoryEntry("test.md", overrides)])
      );
      await expect(
        loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
      ).rejects.toThrow();
      expect(fetcher).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects ambiguous 1,000-entry directory responses", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        Array.from({ length: 1000 }, (_, index) =>
          directoryEntry(`${index}.txt`)
        )
      )
    );
    await expect(
      loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
    ).rejects.toThrow("invalid or incomplete");
  });

  it("caps all Markdown notes, including drafts, before fetching content", async () => {
    const fetcher = vi.fn(async () =>
      Response.json(
        Array.from({ length: 101 }, (_, index) => directoryEntry(`${index}.md`))
      )
    );
    await expect(
      loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
    ).rejects.toThrow("limit of 100 notes");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["wrong blob", { sha: "c".repeat(40) }],
    ["symlink target", { target: "private.md" }],
    ["malformed Base64", { content: "not base64!" }],
    ["invalid UTF-8", { content: "/w==" }],
    [
      "oversized content",
      { content: Buffer.alloc(128 * 1024 + 1).toString("base64") }
    ]
  ])("rejects GitHub content with %s", async (_label, overrides) => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.pathname.endsWith(`/contents/${DIRECTORY}`)
        ? Response.json([directoryEntry("test.md")])
        : Response.json({
            sha: noteSha("test.md"),
            encoding: "base64",
            content: Buffer.from(publishedMarkdown()).toString("base64"),
            ...overrides
          });
    });
    await expect(
      loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
    ).rejects.toThrow();
  });

  it("redacts network failures and malformed JSON", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error(`${PRIVATE_TEXT} ${TOKEN}`);
    });
    await expect(
      loadWorkForBuild({ token: TOKEN, sourceCommitSha: SHA, fetcher })
    ).rejects.toThrow("Unable to request the GitHub work source.");
    const invalidJson = vi.fn(async () => new Response(PRIVATE_TEXT));
    await expect(
      loadWorkForBuild({
        token: TOKEN,
        sourceCommitSha: SHA,
        fetcher: invalidJson
      })
    ).rejects.toThrow("response is invalid or too large");
  });

  it.each(["", "master", SHA.slice(0, 7), `${SHA}x`])(
    "rejects an invalid revision before reading GitHub: %s",
    async (sourceCommitSha) => {
      const fetcher = vi.fn(async () => Response.json([]));
      await expect(
        loadWorkForBuild({ token: TOKEN, sourceCommitSha, fetcher })
      ).rejects.toThrow("40-character commit SHA");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([
    {},
    { vaultDir: " ", token: " " },
    { vaultDir: "/private/vault", token: TOKEN }
  ])("requires exactly one source", async (source) => {
    const fetcher = vi.fn(async () => Response.json([]));
    await expect(
      loadWorkForBuild({ ...source, sourceCommitSha: SHA, fetcher })
    ).rejects.toThrow("Choose one work build source");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
