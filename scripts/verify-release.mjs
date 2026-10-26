import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";

import { checkBuiltSite } from "./check-built-site.mjs";
import { startReleaseServer } from "./release-server.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const distDirectory = path.join(root, "dist");
const outputDirectory = path.resolve(
  process.env.PORTFOLIO_AUDIT_OUTPUT_DIR ?? path.join(root, "reports/release")
);
await mkdir(outputDirectory, { recursive: true });
await writeFile(
  path.join(outputDirectory, "release.json"),
  JSON.stringify({ passed: false, status: "running" }, null, 2) + "\n"
);
let server;
const basePath = process.env.PORTFOLIO_BASE_PATH ?? "/";

function run(script, paths) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, script)], {
      cwd: root,
      env: {
        ...process.env,
        PORTFOLIO_AUDIT_URL: server.origin,
        PORTFOLIO_AUDIT_PATHS: JSON.stringify(paths),
        PORTFOLIO_AUDIT_OUTPUT_DIR: outputDirectory
      },
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("close", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${script} failed (${signal ?? code}).`));
    });
  });
}

try {
  await access(path.join(distDirectory, "index.html"));
  server = await startReleaseServer(distDirectory);
  const result = await checkBuiltSite({
    distDirectory,
    origin: server.origin,
    basePath,
    outputDirectory
  });
  await run("tests/e2e/accessibility.mjs", result.auditPaths ?? result.paths);
  await run("tests/e2e/security.mjs", result.paths);
  await run("tests/e2e/performance.mjs", result.paths);
  await writeFile(
    path.join(outputDirectory, "release.json"),
    JSON.stringify({ passed: true, ...result }, null, 2) + "\n"
  );
  process.stdout.write(
    "Release checks passed: links, assets, metadata, security policy, browser accessibility, and performance budgets.\n"
  );
} catch (error) {
  await writeFile(
    path.join(outputDirectory, "release.json"),
    JSON.stringify({ passed: false, status: "failed" }, null, 2) + "\n"
  );
  throw error;
} finally {
  await server?.stop();
}
