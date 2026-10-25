import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, URL } from "node:url";

import { assetSecurityHeaders } from "../src/config/security.ts";
import { withBasePath } from "../src/lib/routing.ts";

/**
 * @param {URL | string} directory Astro's completed static output directory.
 * @param {string} [basePath] Astro's deployment base path.
 */
export async function writeSecurityHeaders(directory, basePath = "/") {
  if (/[\s?#*]|\p{Cc}/u.test(basePath)) {
    throw new Error("The asset-header base path must be a plain URL path.");
  }
  const destination =
    directory instanceof URL ? fileURLToPath(directory) : directory;
  const rules = [
    "/*",
    ...Object.entries(assetSecurityHeaders).map(
      ([name, value]) => `  ${name}: ${value}`
    ),
    "",
    withBasePath("/_astro/*", basePath),
    "  Cache-Control: public, max-age=31536000, immutable",
    "",
    withBasePath("/experience", basePath),
    "  X-Robots-Tag: noindex, nofollow",
    "",
    withBasePath("/experience/", basePath),
    "  X-Robots-Tag: noindex, nofollow",
    ""
  ];
  await writeFile(path.join(destination, "_headers"), rules.join("\n"));
}
