import { resumeContentSource } from "../../config/resumeContentSource";
import {
  loadResumeForBuild,
  type ResumeBuildSource
} from "../resume/loadResumeForBuild";
import type { LoadedResume } from "../resume/loadValidatedResume";
import { loadWorkForBuild } from "../work/loadWorkForBuild";
import type { CaseStudy } from "../work/types";

export interface LoadedPortfolioContent extends LoadedResume {
  caseStudies: readonly CaseStudy[];
}

let buildContent:
  | {
      vaultDir: string | undefined;
      token: string | undefined;
      promise: Promise<LoadedPortfolioContent>;
    }
  | undefined;

async function loadContent(
  source: ResumeBuildSource
): Promise<LoadedPortfolioContent> {
  const loadedResume = await loadResumeForBuild(source);
  const caseStudies = await loadWorkForBuild({
    ...source,
    sourceCommitSha: loadedResume.sourceCommitSha
  });

  console.info(
    `Portfolio content source ${resumeContentSource.owner}/${resumeContentSource.repo}@${resumeContentSource.branch}: ${loadedResume.sourceCommitSha}`
  );

  return { ...loadedResume, caseStudies };
}

/** All production pages share one validated snapshot; dev requests reload it. */
export function loadPortfolioForBuild(
  source: ResumeBuildSource
): Promise<LoadedPortfolioContent> {
  const vaultDir = source.vaultDir?.trim() || undefined;
  const token = source.token?.trim() || undefined;

  if (!import.meta.env.PROD) {
    return loadContent({ vaultDir, token });
  }

  if (!buildContent) {
    buildContent = {
      vaultDir,
      token,
      promise: loadContent({ vaultDir, token })
    };
  } else if (
    buildContent.vaultDir !== vaultDir ||
    buildContent.token !== token
  ) {
    throw new Error(
      "The portfolio content source must remain consistent throughout a build."
    );
  }

  return buildContent.promise;
}
