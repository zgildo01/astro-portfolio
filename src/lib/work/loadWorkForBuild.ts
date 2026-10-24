import { Buffer } from "node:buffer";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { workContentSource } from "../../config/workContentSource";
import { parseWorkMarkdown } from "./parseWorkMarkdown";
import { WorkValidationError, type CaseStudy } from "./types";

const execFileAsync = promisify(execFile);
const FULL_COMMIT_SHA = /^[0-9a-fA-F]{40}$/;
const MAX_NOTES = 100;
const MAX_NOTE_BYTES = 128 * 1024;
const MAX_LISTING_BYTES = 2 * 1024 * 1024;
const MAX_FILE_RESPONSE_BYTES = Math.ceil((MAX_NOTE_BYTES * 4) / 3) + 16384;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface WorkBuildSource {
  sourceCommitSha: string;
  vaultDir?: string;
  token?: string;
  fetcher?: typeof fetch;
}

interface NoteSource {
  path: string;
  read: () => Promise<string>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isDirectName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value !== "" &&
    value !== "." &&
    value !== ".." &&
    !/[/\\]|\p{Cc}/u.test(value)
  );
}

function isMarkdown(name: string): boolean {
  return /\.md$/i.test(name);
}

function requireNoteLimit(notes: NoteSource[]): NoteSource[] {
  if (notes.length > MAX_NOTES) {
    throw new Error(`The work source exceeds the limit of ${MAX_NOTES} notes.`);
  }
  return notes.sort((left, right) =>
    left.path < right.path ? -1 : left.path > right.path ? 1 : 0
  );
}

async function readLocalNotes(
  checkoutPath: string,
  commitSha: string,
  directory: string
): Promise<NoteSource[]> {
  const runGit = async (...args: string[]): Promise<Buffer> => {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["-C", checkoutPath, ...args],
        { encoding: "buffer", maxBuffer: MAX_LISTING_BYTES }
      );
      return stdout;
    } catch {
      throw new Error(
        "Unable to load work from the selected local vault commit."
      );
    }
  };

  const directoryEntry = (
    await runGit("ls-tree", "-z", commitSha, "--", directory)
  ).toString("utf8");
  if (!directoryEntry) {
    return [];
  }
  if (!/^040000 tree [0-9a-f]{40}\t/.test(directoryEntry)) {
    throw new Error("The local work source must be a regular directory.");
  }

  const listing = (
    await runGit("ls-tree", "-z", `${commitSha}:${directory}`)
  ).toString("utf8");
  const notes: NoteSource[] = [];
  for (const entry of listing.split("\0").filter(Boolean)) {
    const match = /^(\d{6}) (blob|tree|commit) ([0-9a-f]{40})\t([\s\S]+)$/.exec(
      entry
    );
    if (!match || !isDirectName(match[4])) {
      throw new Error("The local work directory listing is invalid.");
    }
    const [, mode, type, , name] = match;
    if (type === "tree" || !isMarkdown(name)) {
      continue;
    }
    if (type !== "blob" || (mode !== "100644" && mode !== "100755")) {
      throw new Error("Work notes must be regular Markdown files.");
    }
    const path = `${directory}/${name}`;
    notes.push({
      path,
      read: async () => {
        let content: Buffer;
        try {
          const { stdout } = await execFileAsync(
            "git",
            ["-C", checkoutPath, "show", `${commitSha}:${path}`],
            { encoding: "buffer", maxBuffer: MAX_NOTE_BYTES }
          );
          content = stdout;
        } catch {
          throw new Error(
            "Unable to read a work note from the local vault commit."
          );
        }
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(content);
        } catch {
          throw new Error("A work note is not valid UTF-8 text.");
        }
      }
    });
  }
  return requireNoteLimit(notes);
}

async function readBoundedJson(
  response: Response,
  limit: number
): Promise<unknown> {
  if (!response.body) {
    throw new Error("The GitHub work source response is invalid.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error("Work source response exceeds its size limit.");
      }
      chunks.push(value);
    }
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks))
    ) as unknown;
  } catch {
    throw new Error("The GitHub work source response is invalid or too large.");
  } finally {
    reader.releaseLock();
  }
}

async function readGitHubNotes(
  token: string,
  commitSha: string,
  directory: string,
  fetcher: typeof fetch
): Promise<NoteSource[]> {
  const request = async (path: string, blob = false): Promise<Response> => {
    const encodedPath = path.split("/").map(encodeURIComponent).join("/");
    const url = new URL(
      `https://api.github.com/repos/${workContentSource.owner}/${workContentSource.repo}/${blob ? "git/blobs" : "contents"}/${encodedPath}`
    );
    if (!blob) {
      url.searchParams.set("ref", commitSha);
    }
    try {
      return await fetcher(url, {
        method: "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2026-03-10"
        },
        redirect: "error"
      });
    } catch {
      throw new Error("Unable to request the GitHub work source.");
    }
  };

  const directoryResponse = await request(directory);
  if (directoryResponse.status === 404) {
    return [];
  }
  if (!directoryResponse.ok) {
    throw new Error(
      `Unable to load the GitHub work directory (HTTP ${directoryResponse.status}).`
    );
  }
  const entries = await readBoundedJson(directoryResponse, MAX_LISTING_BYTES);
  // GitHub caps the Contents directory API at 1,000 entries. A full response is
  // ambiguous, so fail rather than silently publishing an incomplete listing.
  if (!Array.isArray(entries) || entries.length >= 1000) {
    throw new Error(
      "The GitHub work directory listing is invalid or incomplete."
    );
  }

  const notes: NoteSource[] = [];
  const paths = new Set<string>();
  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      !isDirectName(entry.name) ||
      entry.path !== `${directory}/${entry.name}` ||
      typeof entry.type !== "string" ||
      paths.has(entry.path)
    ) {
      throw new Error("The GitHub work directory listing is invalid.");
    }
    paths.add(entry.path);
    if (entry.type === "dir" || !isMarkdown(entry.name)) {
      continue;
    }
    if (
      entry.type !== "file" ||
      "target" in entry ||
      "submodule_git_url" in entry ||
      typeof entry.sha !== "string" ||
      !FULL_COMMIT_SHA.test(entry.sha) ||
      !Number.isSafeInteger(entry.size) ||
      (entry.size as number) < 0 ||
      (entry.size as number) > MAX_NOTE_BYTES
    ) {
      throw new Error(
        "Work notes must be regular Markdown files within the size limit."
      );
    }
    const path = entry.path;
    const objectSha = entry.sha;
    notes.push({
      path,
      read: async () => {
        // Contents responses can dereference symlinks. Reading the immutable
        // object listed at this commit never follows a target outside this folder.
        const response = await request(objectSha, true);
        if (!response.ok) {
          throw new Error(
            `Unable to load a GitHub work note (HTTP ${response.status}).`
          );
        }
        const file = await readBoundedJson(response, MAX_FILE_RESPONSE_BYTES);
        if (
          !isRecord(file) ||
          file.sha !== objectSha ||
          file.encoding !== "base64" ||
          typeof file.content !== "string" ||
          "target" in file ||
          "submodule_git_url" in file
        ) {
          throw new Error("The GitHub work note is not a supported file.");
        }
        const encoded = file.content.replace(/\r?\n/g, "");
        if (!BASE64.test(encoded)) {
          throw new Error("The GitHub work note content is invalid.");
        }
        const content = Buffer.from(encoded, "base64");
        if (content.byteLength > MAX_NOTE_BYTES) {
          throw new Error("A work note exceeds its size limit.");
        }
        try {
          return new TextDecoder("utf-8", { fatal: true }).decode(content);
        } catch {
          throw new Error("A work note is not valid UTF-8 text.");
        }
      }
    });
  }
  return requireNoteLimit(notes);
}

/** Loads only the work folder at the same committed revision as the resume. */
export async function loadWorkForBuild({
  sourceCommitSha,
  vaultDir,
  token,
  fetcher = fetch
}: WorkBuildSource): Promise<readonly CaseStudy[]> {
  if (!FULL_COMMIT_SHA.test(sourceCommitSha)) {
    throw new Error(
      "A full 40-character commit SHA is required for the work source."
    );
  }
  const checkoutPath = vaultDir?.trim();
  const accessToken = token?.trim();
  if (Boolean(checkoutPath) === Boolean(accessToken)) {
    throw new Error(
      "Choose one work build source: RESUME_VAULT_DIR or RESUME_CONTENT_TOKEN."
    );
  }
  const directory = workContentSource.directory;
  if (
    !directory ||
    directory.split("/").some((segment) => !isDirectName(segment))
  ) {
    throw new Error("The work source directory is invalid.");
  }
  const notes = checkoutPath
    ? await readLocalNotes(checkoutPath, sourceCommitSha, directory)
    : await readGitHubNotes(accessToken!, sourceCommitSha, directory, fetcher);
  const studies: CaseStudy[] = [];
  const slugs = new Set<string>();
  for (const [index, note] of notes.entries()) {
    const markdown = await note.read();
    let study: CaseStudy | null;
    try {
      study = parseWorkMarkdown(markdown);
    } catch (error) {
      if (error instanceof WorkValidationError) {
        const lines = [...new Set(error.issues.map(({ line }) => line))];
        const location = lines.length
          ? ` at lines ${lines.slice(0, 10).join(", ")}`
          : "";
        // Omit private note text, filenames, parser messages, and error causes.
        // eslint-disable-next-line preserve-caught-error
        throw new Error(`Work note ${index + 1} failed validation${location}.`);
      }
      // eslint-disable-next-line preserve-caught-error
      throw new Error(`Unable to validate work note ${index + 1}.`);
    }
    if (!study) {
      continue;
    }
    if (slugs.has(study.slug)) {
      throw new Error("Published work notes must have unique slugs.");
    }
    slugs.add(study.slug);
    studies.push(study);
  }
  return studies;
}
