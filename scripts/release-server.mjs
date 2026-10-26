import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

/** Start the actual Worker and asset router without loading private settings. */
export async function startReleaseServer(distDirectory) {
  const temporary = await mkdtemp(path.join(tmpdir(), "portfolio-release-"));
  let child;
  let output = "";
  async function stop() {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exit = once(child, "exit");
      child.kill("SIGTERM");
      const ended = await Promise.race([
        exit.then(() => true),
        delay(5_000, undefined, { ref: false }).then(() => false)
      ]);
      if (!ended) {
        child.kill("SIGKILL");
        await exit;
      }
    }
    await rm(temporary, { recursive: true, force: true });
  }
  try {
    const configuration = JSON.parse(
      await readFile(path.join(root, "wrangler.jsonc"), "utf8")
    );
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((resolve) => probe.close(resolve));
    const origin = `http://127.0.0.1:${port}`;
    const configFile = path.join(temporary, "wrangler.json");
    await writeFile(
      configFile,
      JSON.stringify({
        ...configuration,
        $schema: undefined,
        name: "portfolio-release-check",
        main: path.join(root, "worker/index.ts"),
        assets: { ...configuration.assets, directory: distDirectory },
        vars: {}
      })
    );
    await writeFile(path.join(temporary, ".dev.vars"), "");
    const env = { ...process.env };
    for (const name of Object.keys(env)) {
      if (
        /^(CLOUDFLARE_|TURNSTILE_|RESEND_|CONTACT_|RESUME_CONTENT_TOKEN$|PORTFOLIO_DISPATCH_TOKEN$|GH_TOKEN$|GITHUB_TOKEN$)/u.test(
          name
        )
      ) {
        delete env[name];
      }
    }
    Object.assign(env, {
      CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
      WRANGLER_SEND_METRICS: "false",
      WRANGLER_LOG_PATH: path.join(temporary, "wrangler.log")
    });
    child = spawn(
      process.execPath,
      [
        path.join(root, "node_modules/wrangler/bin/wrangler.js"),
        "dev",
        "--local",
        "--config",
        configFile,
        "--ip",
        "127.0.0.1",
        "--port",
        String(port),
        "--persist-to",
        path.join(temporary, "state")
      ],
      { cwd: temporary, env, stdio: ["ignore", "pipe", "pipe"] }
    );
    let spawnError;
    child.on("error", (error) => (spawnError = error));
    for (const stream of [child.stdout, child.stderr]) {
      stream.on("data", (chunk) => {
        output = (output + chunk).slice(-10_000);
      });
    }
    for (let attempt = 0; attempt < 100; attempt++) {
      if (spawnError) throw spawnError;
      if (child.exitCode !== null) throw new Error("Release Worker exited.");
      try {
        const response = await globalThis.fetch(`${origin}/api/contact`, {
          signal: globalThis.AbortSignal.timeout(1_000)
        });
        if (response.status === 405) return { origin, stop };
      } catch {
        // Local workerd and the asset manifest may still be starting.
      }
      await delay(200);
    }
    throw new Error("Release Worker did not become ready.");
  } catch (error) {
    await stop();
    throw new Error(`${error.message}\n${output}`, { cause: error });
  }
}
