import { Buffer } from "node:buffer";

export interface GitHubResumeSource {
  owner: string;
  repo: string;
  path: string;
  commitSha: string;
  token: string | undefined;
  fetcher?: typeof fetch;
}

const FULL_COMMIT_SHA = /^[0-9a-fA-F]{40}$/;
const BASE64 =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function isFileResponse(value: unknown): value is {
  type: "file";
  path: string;
  encoding: "base64";
  content: string;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const file = value as Record<string, unknown>;

  return (
    file.type === "file" &&
    typeof file.path === "string" &&
    file.encoding === "base64" &&
    typeof file.content === "string"
  );
}

/** Loads one private Markdown file from a pinned GitHub commit during the build. */
export async function loadResumeFromGitHub({
  owner,
  repo,
  path,
  commitSha,
  token,
  fetcher = fetch
}: GitHubResumeSource): Promise<string> {
  if (!FULL_COMMIT_SHA.test(commitSha)) {
    throw new Error(
      "A full 40-character commit SHA is required for the resume source."
    );
  }

  if (!token?.trim()) {
    throw new Error("A GitHub access token is required for the resume source.");
  }

  if (
    !/^[A-Za-z0-9-]+$/.test(owner) ||
    !/^[A-Za-z0-9._-]+$/.test(repo) ||
    !path ||
    path
      .split("/")
      .some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("The GitHub resume source location is invalid.");
  }

  const filePath = path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`
  );
  url.searchParams.set("ref", commitSha);

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token.trim()}`,
        "X-GitHub-Api-Version": "2026-03-10"
      },
      redirect: "error"
    });
  } catch {
    throw new Error("Unable to request the GitHub resume source.");
  }

  if (!response.ok) {
    throw new Error(
      `Unable to load the GitHub resume source (HTTP ${response.status}).`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The GitHub resume source response is invalid.");
  }

  if (!isFileResponse(payload) || payload.path !== path) {
    throw new Error("The GitHub resume source is not a supported file.");
  }

  const encoded = payload.content.replace(/\r?\n/g, "");
  if (!encoded || !BASE64.test(encoded)) {
    throw new Error("The GitHub resume source content is invalid.");
  }

  try {
    const markdown = new TextDecoder("utf-8", { fatal: true }).decode(
      Buffer.from(encoded, "base64")
    );
    if (markdown.trim()) {
      return markdown;
    }
  } catch {
    // Invalid UTF-8 is reported with the same safe error as other malformed content.
  }

  throw new Error("The GitHub resume source content is invalid.");
}
