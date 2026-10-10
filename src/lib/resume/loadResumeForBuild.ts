import { loadValidatedResume, type LoadedResume } from "./loadValidatedResume";

export interface ResumeBuildSource {
  vaultDir?: string;
  token?: string;
}

/** Selects one explicit private source for a static resume build. */
export async function loadResumeForBuild({
  vaultDir,
  token
}: ResumeBuildSource): Promise<LoadedResume> {
  const checkoutPath = vaultDir?.trim();
  const accessToken = token?.trim();

  if (checkoutPath && accessToken) {
    throw new Error(
      "Choose one resume build source: RESUME_VAULT_DIR or RESUME_CONTENT_TOKEN."
    );
  }

  if (checkoutPath) {
    return loadValidatedResume({ mode: "local", checkoutPath });
  }

  if (accessToken) {
    return loadValidatedResume({ mode: "github", token: accessToken });
  }

  throw new Error(
    "Set RESUME_VAULT_DIR for a local resume build or RESUME_CONTENT_TOKEN for a hosted build."
  );
}
