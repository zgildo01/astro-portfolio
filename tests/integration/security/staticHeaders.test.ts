import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

import { writeSecurityHeaders } from "../../../scripts/security-headers.mjs";
import { assetSecurityHeaders } from "../../../src/config/security";

const directories: string[] = [];

async function directory() {
  const result = await mkdtemp(path.join(tmpdir(), "portfolio-headers-"));
  directories.push(result);
  return result;
}

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((dir) => rm(dir, { recursive: true }))
  );
});

describe("Cloudflare static asset header generation", () => {
  it("writes framing protections for every asset and long caching only for fingerprinted assets", async () => {
    const dir = await directory();
    await writeSecurityHeaders(dir);
    const text = await readFile(path.join(dir, "_headers"), "utf8");
    const [global, fingerprinted, experience, experienceSlash] = text
      .trim()
      .split("\n\n");

    expect(global.split("\n")[0]).toBe("/*");
    for (const [name, value] of Object.entries(assetSecurityHeaders)) {
      expect(global).toContain(`  ${name}: ${value}`);
    }
    expect(global).not.toContain("Cache-Control");
    expect(fingerprinted).toBe(
      "/_astro/*\n  Cache-Control: public, max-age=31536000, immutable"
    );
    expect(experience).toBe("/experience\n  X-Robots-Tag: noindex, nofollow");
    expect(experienceSlash).toBe(
      "/experience/\n  X-Robots-Tag: noindex, nofollow"
    );
    // Cloudflare allows 100 rules and limits each header line to 2,000 chars.
    expect(text.split("\n").every((line) => line.length <= 2000)).toBe(true);
    expect(text.match(/^\//gm)).toHaveLength(4);
  });

  it("accepts Astro output URLs and prefixes only route-specific header rules", async () => {
    const dir = await directory();
    await writeSecurityHeaders(pathToFileURL(`${dir}/`), "/portfolio/");
    const text = await readFile(path.join(dir, "_headers"), "utf8");

    expect(text).toMatch(/^\/\*\n/);
    expect(text).toContain("\n/portfolio/_astro/*\n");
    expect(text).toContain("\n/portfolio/experience\n");
    expect(text).toContain("\n/portfolio/experience/\n");
    expect(text).not.toContain("\n/_astro/*\n");
  });

  it.each([
    "/site\n/*",
    "/site\rInjected: header",
    "/site?x",
    "/site#x",
    "/site/*"
  ])(
    "rejects a base path that can alter the header rule format: %j",
    async (base) => {
      const dir = await directory();
      await expect(writeSecurityHeaders(dir, base)).rejects.toThrow(
        "plain URL path"
      );
      await expect(readFile(path.join(dir, "_headers"))).rejects.toMatchObject({
        code: "ENOENT"
      });
    }
  );
});
