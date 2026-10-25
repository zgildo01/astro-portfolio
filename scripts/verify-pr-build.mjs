import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const fixtureDirectory = await mkdtemp(
  path.join(tmpdir(), "portfolio-pr-build-")
);
const vaultDirectory = path.join(fixtureDirectory, "vault");
const distDirectory = path.join(root, "dist");
const publishedSlug = "build-verification-case";
const publishedTitle = "Verifying a synthetic delivery workflow";
const draftSlug = "build-verification-draft";
const draftMarker = "PR_DRAFT_MUST_NOT_BE_PUBLISHED_3a012589";

const resume = `---
schema_version: 1
headline: Platform Engineer
linkedin: https://www.linkedin.com/in/example/
---

# Build Verification Engineer

## Summary

This synthetic resume exercises the production content renderer during pull-request validation.

## Experience

### Platform Engineer

Employer: Build Verification Organization
Start: 2025-01
End: present

- Created a synthetic workflow to verify document generation.

## Skills

### Delivery tooling

- Git
- TypeScript
`;

const publishedCase = `---
schemaVersion: 1
status: published
slug: ${publishedSlug}
title: ${publishedTitle}
description: Synthetic content verifies the case-study publication path during pull-request builds.
organization: Build Verification Organization
category: Developer tooling
role: Workflow implementation
technologies:
  - TypeScript
  - Git
workflow:
  section: approach
  steps:
    - Create synthetic content
    - Build the static portfolio
    - Verify generated artifacts
---

## The problem

Pull requests need to verify production builds without access to private source content.

## My contribution

I created a synthetic document set for the build verification process.

## The approach

The build reads committed notes from an isolated local repository and renders the ordinary site templates.

## The outcome

The check can verify published routes and generated documents without exposing private content.
`;

const env = {
  ...process.env,
  RESUME_VAULT_DIR: vaultDirectory,
  // Explicit empty values also prevent Astro from falling back to local .env files.
  RESUME_CONTENT_TOKEN: "",
  PUBLIC_TURNSTILE_SITE_KEY: "",
  PUBLIC_CONTACT_EMAIL: "",
  PORTFOLIO_BASE_PATH: "/",
  CLOUDFLARE_API_TOKEN: "",
  CLOUDFLARE_ACCOUNT_ID: "",
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
  WRANGLER_SEND_METRICS: "false"
};
for (const name of [
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_INDEX_FILE",
  "TURNSTILE_SECRET_KEY",
  "RESEND_API_KEY",
  "CONTACT_FROM_EMAIL",
  "CONTACT_TO_EMAIL"
]) {
  delete env[name];
}

function run(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(`Build verification command failed (${signal ?? code}).`)
        );
    });
  });
}

async function verifyDraftExclusion(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await verifyDraftExclusion(file);
    else if (entry.isFile()) {
      assert(
        !(await readFile(file)).includes(draftMarker),
        `Draft content appeared in ${path.relative(root, file)}.`
      );
    }
  }
}

try {
  const workDirectory = path.join(vaultDirectory, "portfolio", "work");
  const hooksDirectory = path.join(fixtureDirectory, "disabled-hooks");
  await mkdir(workDirectory, { recursive: true });
  await mkdir(hooksDirectory);
  await writeFile(path.join(vaultDirectory, "resume.md"), resume);
  await writeFile(
    path.join(workDirectory, `${publishedSlug}.md`),
    publishedCase
  );
  await writeFile(
    path.join(workDirectory, `${draftSlug}.md`),
    `---\nstatus: draft\nslug: ${draftSlug}\n---\n\n${draftMarker}\n`
  );
  const gitOptions = [
    "-c",
    "core.hooksPath=" + hooksDirectory,
    "-c",
    "commit.gpgsign=false",
    "-c",
    "user.name=Portfolio Build Verification",
    "-c",
    "user.email=build-verification@example.test"
  ];
  await run(
    "git",
    [...gitOptions, "init", "--quiet", "--initial-branch=master"],
    vaultDirectory
  );
  await run(
    "git",
    [...gitOptions, "add", "resume.md", "portfolio/work"],
    vaultDirectory
  );
  await run(
    "git",
    [
      ...gitOptions,
      "commit",
      "--quiet",
      "-m",
      "Add synthetic build-verification content"
    ],
    vaultDirectory
  );

  process.stdout.write(
    "Verifying the production build with temporary synthetic content. No private vault access is required.\n"
  );
  await run(process.execPath, [
    path.join(root, "node_modules", "astro", "bin", "astro.mjs"),
    "build"
  ]);

  const workHtml = await readFile(
    path.join(distDirectory, "work", "index.html"),
    "utf8"
  );
  const caseHtml = await readFile(
    path.join(distDirectory, "work", publishedSlug, "index.html"),
    "utf8"
  );
  const resumeHtml = await readFile(
    path.join(distDirectory, "resume", "index.html"),
    "utf8"
  );
  assert(
    workHtml.includes(publishedTitle),
    "The published case study is missing from Work."
  );
  assert(
    workHtml.includes(`/work/${publishedSlug}`),
    "The Work card has no case-study link."
  );
  assert(
    caseHtml.includes(publishedTitle),
    "The published case-study route did not render."
  );
  assert(
    resumeHtml.includes("Build Verification Engineer"),
    "The synthetic resume did not render."
  );
  assert(
    !workHtml.includes(draftSlug),
    "The draft case study appeared on Work."
  );
  let draftRouteExists = false;
  try {
    await access(path.join(distDirectory, "work", draftSlug, "index.html"));
    draftRouteExists = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  assert(!draftRouteExists, "The draft case study produced a public route.");
  await verifyDraftExclusion(distDirectory);

  const pdf = await readFile(
    path.join(distDirectory, "resume", "Zeus-Zaragoza-Resume.pdf")
  );
  assert(
    pdf.length > 1000 && pdf.subarray(0, 5).toString() === "%PDF-",
    "The build did not produce a valid resume PDF."
  );
  await run(process.execPath, [
    path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"),
    "deploy",
    "--dry-run",
    "--outdir",
    path.join(fixtureDirectory, "worker")
  ]);
  process.stdout.write(
    "PR build verification passed: static pages, published/draft boundaries, resume PDF, and Worker bundle. Synthetic output is for validation only.\n"
  );
} finally {
  await rm(fixtureDirectory, { recursive: true, force: true });
}
