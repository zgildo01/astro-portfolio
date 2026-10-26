/* global fetch, AbortSignal */
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { URL } from "node:url";
import { JSDOM } from "jsdom";

import {
  assetSecurityHeaders,
  apiSecurityHeaders
} from "../src/config/security.ts";
import { resolveSiteOrigin } from "../src/config/siteOrigin.ts";

async function collectFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    assert(!entry.isSymbolicLink(), `Unexpected build symlink: ${relative}`);
    if (entry.isDirectory())
      files.push(
        ...(await collectFiles(path.join(directory, entry.name), relative))
      );
    else if (entry.isFile()) files.push(relative);
  }
  return files;
}

/** Read JPEG frame dimensions without decoding or changing the image. */
export function jpegDimensions(bytes) {
  assert(bytes[0] === 0xff && bytes[1] === 0xd8, "Social image is not a JPEG.");
  let offset = 2;
  while (offset + 4 < bytes.length) {
    assert.equal(bytes[offset++], 0xff, "Invalid JPEG marker.");
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes.readUInt16BE(offset);
    assert(
      length >= 2 && offset + length <= bytes.length,
      "Truncated JPEG segment."
    );
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf
      ].includes(marker)
    ) {
      assert(length >= 7, "Truncated JPEG frame.");
      return {
        width: bytes.readUInt16BE(offset + 5),
        height: bytes.readUInt16BE(offset + 3)
      };
    }
    offset += length;
  }
  throw new Error("Social JPEG has no supported frame dimensions.");
}

function parseCsp(value) {
  return new Map(
    value.split(";").map((directive) => {
      const [name, ...sources] = directive.trim().split(/\s+/);
      return [name, sources];
    })
  );
}

function assertHeaders(response, expected, label) {
  for (const [name, value] of Object.entries(expected))
    assert.equal(response.headers.get(name), value, `${label}: ${name}`);
}

/**
 * Verify finished static artifacts through the same local Worker used in release.
 * External destinations are inspected as URLs only; no providers are contacted.
 * @param {{ distDirectory: string, origin: string, basePath?: string, siteOrigin?: string, outputDirectory?: string }} options
 */
export async function checkBuiltSite({
  distDirectory,
  origin,
  basePath = "/",
  siteOrigin,
  outputDirectory
}) {
  const local = new URL(origin);
  assert(
    ["127.0.0.1", "localhost", "[::1]"].includes(local.hostname),
    "Release checks require a local Worker origin."
  );
  assert(
    ["http:", "https:"].includes(local.protocol) &&
      !local.username &&
      !local.password,
    "Invalid local Worker origin."
  );
  assert(
    basePath.startsWith("/") && !/[\\\s?#]/.test(basePath),
    "Invalid deployment base path."
  );
  const base = basePath.replace(/\/+$/, "");
  const root = path.resolve(distDirectory);
  const files = new Set(await collectFiles(root));
  const documents = new Map();
  const doms = [];
  const requests = new Map();
  const externalOrigins = new Set();
  const assetPaths = new Set();
  const linkTargets = [];
  const formActions = new Set();

  function publicPath(relative) {
    return `${base}/${relative}`;
  }

  function artifactFor(pathname) {
    let decoded;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new Error(`Malformed local path: ${pathname}`);
    }
    assert(
      !decoded.includes("\\") && !decoded.includes("\0"),
      `Invalid local path: ${pathname}`
    );
    assert(
      !decoded
        .split("/")
        .some((segment) => segment === ".." || segment === "."),
      `Unsafe local path: ${pathname}`
    );
    assert(
      decoded === base || decoded.startsWith(`${base}/`),
      `Link escapes deployment base: ${pathname}`
    );
    const relative = decoded.slice(base.length).replace(/^\/+/, "");
    const candidates = [
      relative,
      `${relative.replace(/\/+$/, "")}/index.html`,
      `${relative.replace(/\/+$/, "")}.html`
    ];
    if (!relative) candidates.push("index.html");
    const result = candidates.find((candidate) => files.has(candidate));
    assert(result, `Missing local artifact: ${pathname}`);
    const resolved = path.resolve(root, result);
    assert(
      resolved.startsWith(`${root}${path.sep}`),
      `Artifact escapes build directory: ${pathname}`
    );
    return result;
  }

  async function requestLocal(pathname) {
    const address = new URL(pathname, local.origin);
    assert.equal(
      address.origin,
      local.origin,
      "A release check attempted an external network request."
    );
    address.hash = "";
    if (!requests.has(address.href))
      requests.set(
        address.href,
        (async () => {
          let target = address;
          for (let hop = 0; hop < 6; hop++) {
            const response = await fetch(target, {
              redirect: "manual",
              signal: AbortSignal.timeout(10_000)
            });
            if ([301, 302, 303, 307, 308].includes(response.status)) {
              const location = response.headers.get("Location");
              assert(
                location,
                `Redirect has no destination: ${target.pathname}`
              );
              target = new URL(location, target);
              assert.equal(
                target.origin,
                local.origin,
                "Local redirect escaped to an external origin."
              );
              await response.body?.cancel();
              continue;
            }
            return {
              status: response.status,
              headers: response.headers,
              body: Buffer.from(await response.arrayBuffer()),
              url: target
            };
          }
          throw new Error(`Redirect loop: ${address.pathname}`);
        })()
      );
    return requests.get(address.href);
  }

  try {
    for (const file of files) {
      if (!file.endsWith(".html")) continue;
      const html = await readFile(path.join(root, file), "utf8");
      const pathname =
        file === "index.html"
          ? `${base}/`
          : file.endsWith("/index.html")
            ? publicPath(file.slice(0, -10))
            : publicPath(file);
      const dom = new JSDOM(html, {
        url: new URL(pathname, local.origin).href
      });
      doms.push(dom);
      documents.set(file, { file, pathname, document: dom.window.document });
    }
    const home = documents.get("index.html");
    assert(home, "The production homepage is missing.");
    const homeCanonical = home.document
      .querySelector('link[rel="canonical"]')
      ?.getAttribute("href");
    assert(homeCanonical, "The homepage has no canonical URL.");
    const canonicalOrigin = resolveSiteOrigin(
      siteOrigin ?? new URL(homeCanonical).origin
    );
    const professional = [...documents.values()].filter(
      ({ file, pathname }) =>
        !/(?:^|\/)404(?:\.html|\/index\.html)$/.test(file) &&
        pathname !== `${base}/experience/`
    );
    const paths = professional.map(({ pathname }) => pathname).sort();
    for (const required of ["", "about/", "resume/", "work/", "contact/"])
      assert(
        paths.includes(`${base}/${required}`),
        `Missing professional route: ${required || "Home"}`
      );
    const expectedCanonicals = new Set();

    function localReference(raw, fromPath, kind) {
      if (!raw) return;
      if (raw.startsWith("data:")) {
        assert(
          /^data:image\//i.test(raw),
          `Unexpected embedded ${kind} resource at ${fromPath}`
        );
        return;
      }
      const url = new URL(raw, new URL(fromPath, canonicalOrigin));
      assert(
        ["https:", "http:", "mailto:"].includes(url.protocol),
        `Unsafe ${kind} protocol at ${fromPath}`
      );
      assert(
        !url.username && !url.password,
        `Credentials in ${kind} URL at ${fromPath}`
      );
      if (
        url.protocol === "mailto:" ||
        (url.origin !== canonicalOrigin && url.origin !== local.origin)
      ) {
        externalOrigins.add(
          url.protocol === "mailto:" ? "mailto:" : url.origin
        );
        return;
      }
      const file = artifactFor(url.pathname);
      if (kind === "link") linkTargets.push({ url, file, fromPath });
      else assetPaths.add(url.pathname);
      return { url, file };
    }

    for (const page of professional) {
      const { document, pathname } = page;
      assert(document.title.trim(), `${pathname}: missing title`);
      const description = document
        .querySelector('meta[name="description"]')
        ?.getAttribute("content");
      assert(description?.trim(), `${pathname}: missing description`);
      assert.equal(
        document.querySelectorAll("main").length,
        1,
        `${pathname}: main landmark count`
      );
      assert.equal(
        document.querySelectorAll("h1").length,
        1,
        `${pathname}: H1 count`
      );
      const canonical = document
        .querySelector('link[rel="canonical"]')
        ?.getAttribute("href");
      assert.equal(
        canonical,
        new URL(pathname, canonicalOrigin).href,
        `${pathname}: canonical mismatch`
      );
      expectedCanonicals.add(canonical);
      assert(
        !/noindex/i.test(
          document
            .querySelector('meta[name="robots"]')
            ?.getAttribute("content") ?? ""
        ),
        `${pathname}: professional page is noindex`
      );
      for (const selector of [
        'meta[property="og:title"]',
        'meta[name="twitter:title"]'
      ])
        assert.equal(
          document.querySelector(selector)?.getAttribute("content"),
          document.title,
          `${pathname}: share title mismatch`
        );
      for (const selector of [
        'meta[property="og:description"]',
        'meta[name="twitter:description"]'
      ])
        assert.equal(
          document.querySelector(selector)?.getAttribute("content"),
          description,
          `${pathname}: share description mismatch`
        );
      assert.equal(
        document
          .querySelector('meta[property="og:url"]')
          ?.getAttribute("content"),
        canonical,
        `${pathname}: share URL mismatch`
      );
      const image = document
        .querySelector('meta[property="og:image"]')
        ?.getAttribute("content");
      assert(image, `${pathname}: missing share image`);
      const imageReference = localReference(image, pathname, "image");
      assert(
        imageReference,
        `${pathname}: share image must be a local build asset`
      );
      assert(
        !image.includes("@fs") && !image.includes("/_image/"),
        `${pathname}: development image URL escaped into production`
      );
      const dimensions = jpegDimensions(
        await readFile(path.join(root, imageReference.file))
      );
      assert.deepEqual(
        dimensions,
        { width: 1200, height: 630 },
        `${pathname}: social image geometry`
      );
      assert.equal(
        Number(
          document
            .querySelector('meta[property="og:image:width"]')
            ?.getAttribute("content")
        ),
        dimensions.width,
        `${pathname}: declared social image width`
      );
      assert.equal(
        Number(
          document
            .querySelector('meta[property="og:image:height"]')
            ?.getAttribute("content")
        ),
        dimensions.height,
        `${pathname}: declared social image height`
      );
      assert.equal(
        document
          .querySelector('meta[name="twitter:card"]')
          ?.getAttribute("content"),
        "summary_large_image",
        `${pathname}: social card type`
      );
      assert.equal(
        document
          .querySelector('meta[name="twitter:image"]')
          ?.getAttribute("content"),
        image
      );
      assert.equal(
        document
          .querySelector('meta[property="og:image:type"]')
          ?.getAttribute("content"),
        "image/jpeg"
      );
      assert(
        document
          .querySelector('meta[property="og:image:alt"]')
          ?.getAttribute("content"),
        `${pathname}: share image alt`
      );
      const structured = document.querySelectorAll(
        'script[type="application/ld+json"]'
      );
      assert.equal(structured.length, 1, `${pathname}: structured data count`);
      const graph = JSON.parse(structured[0].textContent)["@graph"];
      assert.equal(graph[2].url, canonical, `${pathname}: schema URL mismatch`);
      assert.equal(
        graph[2].isPartOf["@id"],
        graph[1]["@id"],
        `${pathname}: disconnected schema`
      );
      assert(
        !Object.hasOwn(graph[0], "email"),
        `${pathname}: structured data exposes a mailbox`
      );
      const policy = parseCsp(
        document
          .querySelector('meta[http-equiv="Content-Security-Policy" i]')
          ?.getAttribute("content") ?? ""
      );
      assert(
        policy.get("default-src")?.includes("'none'"),
        `${pathname}: restrictive document CSP missing`
      );
      const scriptSources = policy.get("script-src") ?? [];
      assert(
        scriptSources.includes("'self'") &&
          scriptSources.includes("https://challenges.cloudflare.com"),
        `${pathname}: application/verification scripts missing from CSP`
      );
      assert(
        !scriptSources.some((source) =>
          ["*", "'unsafe-inline'", "'unsafe-eval'"].includes(source)
        ),
        `${pathname}: unsafe script policy`
      );
      assert(
        policy.get("frame-src")?.includes("https://challenges.cloudflare.com"),
        `${pathname}: verification frame policy missing`
      );
      assert(
        policy.get("connect-src")?.includes("'self'"),
        `${pathname}: same-origin form policy missing`
      );
      for (const script of document.querySelectorAll("script:not([src])")) {
        if (!script.textContent.trim()) continue;
        const hash = `'sha256-${createHash("sha256").update(script.textContent).digest("base64")}'`;
        assert(
          scriptSources.includes(hash),
          `${pathname}: inline script missing its CSP hash`
        );
      }
      const response = await requestLocal(pathname);
      assert.equal(response.status, 200, `${pathname}: HTTP status`);
      assertHeaders(response, assetSecurityHeaders, pathname);
    }

    for (const { document, pathname } of documents.values()) {
      const ids = [...document.querySelectorAll("[id]")].map(
        (element) => element.id
      );
      assert.equal(new Set(ids).size, ids.length, `${pathname}: duplicate IDs`);
      for (const link of document.querySelectorAll("a[href]"))
        localReference(link.getAttribute("href"), pathname, "link");
      for (const element of document.querySelectorAll(
        "img[src],script[src],source[src],link[href]"
      )) {
        if (
          element.tagName === "LINK" &&
          !["stylesheet", "preload", "icon"].includes(
            element.getAttribute("rel")
          )
        )
          continue;
        localReference(
          element.getAttribute("src") ?? element.getAttribute("href"),
          pathname,
          "asset"
        );
      }
      for (const element of document.querySelectorAll("[srcset]"))
        for (const candidate of element.getAttribute("srcset").split(","))
          localReference(candidate.trim().split(/\s+/)[0], pathname, "asset");
      for (const element of document.querySelectorAll("[style]"))
        for (const match of element
          .getAttribute("style")
          .matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g))
          localReference(match[1], pathname, "asset");
      for (const form of document.querySelectorAll("form[action]")) {
        assert.equal(
          form.getAttribute("method")?.toLowerCase(),
          "post",
          `${pathname}: unexpected form method`
        );
        const target = new URL(
          form.getAttribute("action"),
          new URL(pathname, canonicalOrigin)
        );
        assert.equal(
          target.origin,
          canonicalOrigin,
          `${pathname}: external form action`
        );
        formActions.add(target.pathname);
      }
    }
    for (const file of files) {
      if (!/\.(css|m?js)$/.test(file)) continue;
      const source = await readFile(path.join(root, file), "utf8");
      const matches = file.endsWith(".css")
        ? source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)
        : source.matchAll(
            /(?:\bfrom\s*|\bimport\s*\(?\s*)["']((?:\.|\/)[^"']+)["']/g
          );
      for (const match of matches)
        localReference(match[1], publicPath(file), "asset");
    }
    for (const { url, file, fromPath } of linkTargets) {
      const response = await requestLocal(`${url.pathname}${url.search}`);
      assert.equal(
        response.status,
        200,
        `${fromPath}: broken link ${url.pathname}`
      );
      if (url.hash && documents.has(file)) {
        let id;
        try {
          id = decodeURIComponent(url.hash.slice(1));
        } catch {
          throw new Error(`Malformed fragment at ${fromPath}`);
        }
        assert(
          documents.get(file).document.getElementById(id),
          `${fromPath}: missing fragment ${url.hash} in ${url.pathname}`
        );
      }
    }
    for (const pathname of assetPaths) {
      const response = await requestLocal(pathname);
      assert.equal(response.status, 200, `Broken asset: ${pathname}`);
      assert(
        response.body.equals(
          await readFile(path.join(root, artifactFor(pathname)))
        ),
        `Worker asset differs from build artifact: ${pathname}`
      );
      if (pathname.startsWith(`${base}/_astro/`))
        assert.match(
          response.headers.get("Cache-Control") ?? "",
          /max-age=31536000.*immutable/,
          `${pathname}: fingerprinted asset cache policy`
        );
    }

    const sitemapResponse = await requestLocal(`${base}/sitemap.xml`);
    assert.equal(sitemapResponse.status, 200, "Sitemap HTTP status");
    assert.match(
      sitemapResponse.headers.get("Content-Type") ?? "",
      /(?:application|text)\/xml/
    );
    const sitemapDom = new JSDOM(sitemapResponse.body.toString(), {
      contentType: "application/xml"
    });
    doms.push(sitemapDom);
    const locations = [
      ...sitemapDom.window.document.querySelectorAll("loc")
    ].map((element) => element.textContent);
    assert.equal(
      locations.length,
      new Set(locations).size,
      "Duplicate sitemap locations"
    );
    assert.deepEqual(
      new Set(locations),
      expectedCanonicals,
      "Sitemap must contain exactly the indexable professional HTML routes"
    );
    const robots = await requestLocal(`${base}/robots.txt`);
    assert.equal(robots.status, 200, "Robots HTTP status");
    assert.match(robots.headers.get("Content-Type") ?? "", /text\/plain/);
    assert(
      robots.body
        .toString()
        .includes(`Sitemap: ${canonicalOrigin}${base}/sitemap.xml`),
      "Robots sitemap origin/base mismatch"
    );
    assert(
      robots.body.toString().includes(`Disallow: ${base}/api/`),
      "Robots API exclusion missing"
    );
    for (const pathname of new Set([
      ...formActions,
      `${base}/api/contact`,
      `${base}/api/contact/`
    ])) {
      const response = await requestLocal(pathname);
      assert.equal(
        response.status,
        405,
        `${pathname}: form API must reject GET`
      );
      assert.equal(response.headers.get("Allow"), "POST");
      assert.equal(response.headers.get("Cache-Control"), "no-store");
      assertHeaders(response, apiSecurityHeaders, pathname);
    }
    for (const pathname of [
      `${base}/api`,
      `${base}/api/`,
      `${base}/api/__release_missing__`
    ]) {
      const unknownApi = await requestLocal(pathname);
      assert.equal(
        unknownApi.status,
        404,
        `${pathname}: API route must return 404`
      );
      assert.match(
        unknownApi.headers.get("Content-Type") ?? "",
        /application\/json/,
        `${pathname}: API failures must remain JSON`
      );
      assert.equal(unknownApi.headers.get("Cache-Control"), "no-store");
      assertHeaders(unknownApi, apiSecurityHeaders, pathname);
    }
    const missing = await requestLocal(`${base}/__release_missing_page__`);
    assert.equal(
      missing.status,
      404,
      "A missing page must retain real HTTP 404"
    );
    assertHeaders(missing, assetSecurityHeaders, "Missing page");
    const missingDom = new JSDOM(missing.body.toString());
    doms.push(missingDom);
    assert(
      /noindex/.test(
        missingDom.window.document
          .querySelector('meta[name="robots"]')
          ?.getAttribute("content") ?? ""
      ),
      "404 recovery must be noindex"
    );
    assert.equal(
      missingDom.window.document.querySelectorAll("main h1").length,
      1,
      "404 recovery heading"
    );
    const experience = await requestLocal(`${base}/experience/`);
    assert.equal(experience.status, 200, "Experience placeholder HTTP status");
    assert.match(
      experience.headers.get("X-Robots-Tag") ?? "",
      /noindex/,
      "Experience placeholder must remain noindex"
    );
    const report = {
      paths,
      auditPaths: [...paths, `${base}/__release_missing_page__`],
      canonicalOrigin,
      htmlPages: professional.length,
      localLinks: linkTargets.length,
      localAssets: assetPaths.size,
      localRequests: requests.size,
      externalOrigins: [...externalOrigins].sort(),
      sitemapEntries: locations.length
    };
    if (outputDirectory) {
      await mkdir(outputDirectory, { recursive: true });
      await writeFile(
        path.join(outputDirectory, "check-built-site.json"),
        `${JSON.stringify(report, null, 2)}\n`
      );
    }
    return report;
  } finally {
    for (const dom of doms) dom.window.close();
  }
}
