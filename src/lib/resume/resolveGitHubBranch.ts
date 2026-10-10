export interface GitHubResumeBranch {
  owner: string;
  repo: string;
  branch: string;
  token: string | undefined;
  fetcher?: typeof fetch;
}

const FULL_COMMIT_SHA = /^[0-9a-fA-F]{40}$/;

function isBranchResponse(
  value: unknown,
  branch: string
): value is {
  ref: string;
  object: { type: "commit"; sha: string };
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const response = value as Record<string, unknown>;
  if (
    response.ref !== `refs/heads/${branch}` ||
    typeof response.object !== "object" ||
    response.object === null ||
    Array.isArray(response.object)
  ) {
    return false;
  }

  const object = response.object as Record<string, unknown>;
  return (
    object.type === "commit" &&
    typeof object.sha === "string" &&
    FULL_COMMIT_SHA.test(object.sha)
  );
}

/** Resolves the private vault branch to one immutable commit for this build. */
export async function resolveGitHubResumeCommit({
  owner,
  repo,
  branch,
  token,
  fetcher = fetch
}: GitHubResumeBranch): Promise<string> {
  if (!token?.trim()) {
    throw new Error("A GitHub access token is required for the resume source.");
  }

  if (
    !/^[A-Za-z0-9-]+$/.test(owner) ||
    !/^[A-Za-z0-9._-]+$/.test(repo) ||
    !/^[A-Za-z0-9._-]+$/.test(branch) ||
    branch === "." ||
    branch === ".."
  ) {
    throw new Error("The GitHub resume source location is invalid.");
  }

  const url = new URL(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/heads/${encodeURIComponent(branch)}`
  );

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
    throw new Error("Unable to request the GitHub resume branch.");
  }

  if (!response.ok) {
    throw new Error(
      `Unable to resolve the GitHub resume branch (HTTP ${response.status}).`
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The GitHub resume branch response is invalid.");
  }

  if (!isBranchResponse(payload, branch)) {
    throw new Error("The GitHub resume branch response is invalid.");
  }

  return payload.object.sha;
}
