import { withBasePath } from "../../lib/routing";

export function experiencePaths(baseUrl: string) {
  return {
    portfolio: withBasePath("/#observation-entry", baseUrl),
    company: withBasePath("/experience/", baseUrl),
    confidence: withBasePath("/experience/confidence/", baseUrl),
    investigation: withBasePath("/experience/investigation/", baseUrl),
    explainer: withBasePath("/experience/data-and-rights/", baseUrl),
    console: withBasePath("/experience/console/", baseUrl)
  };
}
