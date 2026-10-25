/* global fetch, AbortSignal */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, URL } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const temporary = await mkdtemp(
  path.join(tmpdir(), "portfolio-contact-runtime-")
);
const configuration = JSON.parse(
  await readFile(path.join(root, "wrangler.jsonc"), "utf8")
);
let server;
let serverOutput = "";
let checks = 0;

// Provider adapters run inside workerd. Native Request construction validates
// options that Node/jsdom fetch mocks cannot validate against Workers behavior.
const fixture = `
import { handleContactRequest } from ${JSON.stringify(path.join(root, "src/lib/contact/server.ts"))};

export default {
  async fetch(request: Request) {
    if (new URL(request.url).pathname === "/__ready") return new Response("ready");
    const mode = new URL(request.url).searchParams.get("mode");
    const calls: Array<{ url: string; method: string; redirect: string; authorization: boolean }> = [];
    const constructionErrors: string[] = [];
    const provider = async (input: RequestInfo | URL, init?: RequestInit) => {
      let outbound: Request;
      try {
        outbound = new Request(input, init);
      } catch (error) {
        constructionErrors.push(error instanceof Error ? error.message : "Native Request failed");
        throw error;
      }
      calls.push({ url: outbound.url, method: outbound.method, redirect: outbound.redirect,
        authorization: outbound.headers.has("Authorization") });
      if (outbound.url === "https://challenges.cloudflare.com/turnstile/v0/siteverify") {
        if (mode === "verification-redirect") return new Response(null, { status: 302,
          headers: { Location: "https://must-not-be-contacted.invalid/verification" } });
        if (mode === "verification-http") return new Response("unavailable", { status: 503 });
        if (mode === "verification-network") throw new TypeError("Synthetic verification failure");
        return Response.json({ success: mode !== "rejected", hostname: new URL(request.url).hostname,
          action: "contact", "error-codes": mode === "rejected" ? ["invalid-input-response"] : [] });
      }
      if (outbound.url === "https://api.resend.com/emails") {
        if (mode === "email-redirect") return new Response(null, { status: 307,
          headers: { Location: "https://must-not-be-contacted.invalid/email" } });
        if (mode === "email-http") return new Response("forbidden", { status: 403 });
        if (mode === "email-network") throw new TypeError("Synthetic email failure");
        return Response.json({ id: "synthetic-runtime-notification" });
      }
      throw new Error("Unexpected provider URL: real network access is forbidden.");
    };
    const response = await handleContactRequest(request, {
      TURNSTILE_SECRET_KEY: "synthetic-runtime-turnstile-secret",
      RESEND_API_KEY: "synthetic-runtime-resend-secret",
      CONTACT_FROM_EMAIL: "sender@example.test",
      CONTACT_TO_EMAIL: "owner@example.test",
      CONTACT_RATE_LIMITER: { limit: async () => ({ success: true }) }
    }, provider);
    return Response.json({ status: response.status, body: await response.json(), calls, constructionErrors });
  }
};
`;

async function stopServer() {
  if (!server?.pid || server.exitCode !== null || server.signalCode !== null)
    return;
  const exit = once(server, "exit");
  server.kill("SIGTERM");
  if (
    !(await Promise.race([
      exit.then(() => true),
      delay(5_000, undefined, { ref: false }).then(() => false)
    ]))
  ) {
    server.kill("SIGKILL");
    await exit;
  }
}

try {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const configFile = path.join(temporary, "wrangler.json");
  await writeFile(path.join(temporary, "worker.ts"), fixture);
  await writeFile(
    configFile,
    JSON.stringify({
      name: "portfolio-contact-runtime-check",
      main: "./worker.ts",
      compatibility_date: configuration.compatibility_date
    })
  );
  const env = {
    ...process.env,
    CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: "false",
    WRANGLER_SEND_METRICS: "false",
    WRANGLER_LOG_PATH: path.join(temporary, "wrangler.log")
  };
  for (const name of [
    "TURNSTILE_SECRET_KEY",
    "RESEND_API_KEY",
    "CONTACT_FROM_EMAIL",
    "CONTACT_TO_EMAIL",
    "RESUME_CONTENT_TOKEN",
    "PORTFOLIO_DISPATCH_TOKEN",
    "PUBLIC_TURNSTILE_SITE_KEY",
    "PUBLIC_CONTACT_EMAIL",
    "CLOUDFLARE_API_TOKEN",
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_KEY",
    "CLOUDFLARE_EMAIL",
    "GITHUB_TOKEN",
    "GH_TOKEN"
  ])
    delete env[name];
  server = spawn(
    process.execPath,
    [
      path.join(root, "node_modules/wrangler/bin/wrangler.js"),
      "dev",
      "--config",
      configFile,
      "--local",
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
  server.on("error", (error) => {
    spawnError = error;
  });
  for (const stream of [server.stdout, server.stderr]) {
    stream.on("data", (chunk) => {
      serverOutput = (serverOutput + chunk).slice(-8_000);
    });
  }
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (spawnError) throw spawnError;
    if (server.exitCode !== null) throw new Error("Worker test server exited.");
    try {
      const response = await fetch(`${origin}/__ready`, {
        signal: AbortSignal.timeout(1_000)
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* The local Worker runtime may still be starting. */
    }
    await delay(200);
  }
  assert(ready, "Worker test server did not become ready.");

  const cases = [
    { mode: "success", status: 200, calls: 2 },
    { mode: "rejected", status: 422, calls: 1 },
    { mode: "verification-redirect", status: 503, calls: 1 },
    { mode: "email-redirect", status: 503, calls: 2 },
    { mode: "verification-http", status: 503, calls: 1 },
    { mode: "email-http", status: 503, calls: 2 },
    { mode: "verification-network", status: 503, calls: 1 },
    { mode: "email-network", status: 503, calls: 2 }
  ];
  for (const test of cases) {
    const response = await fetch(`${origin}/api/contact?mode=${test.mode}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        "CF-Connecting-IP": "192.0.2.50"
      },
      body: JSON.stringify({
        name: "Synthetic Runtime Visitor",
        email: "visitor@example.test",
        message: "A synthetic contact runtime verification message.",
        honeypot: "",
        turnstileToken: "synthetic-runtime-token"
      }),
      signal: AbortSignal.timeout(5_000)
    });
    assert.equal(response.status, 200, "Local test envelope failed.");
    const result = await response.json();
    assert.deepEqual(
      result.constructionErrors,
      [],
      `Native Workers Request failed: ${JSON.stringify(result)}`
    );
    assert.equal(result.status, test.status, test.mode);
    assert.equal(result.body.ok, test.status === 200, test.mode);
    assert.equal(result.calls.length, test.calls, test.mode);
    assert.equal(
      result.calls[0].url,
      "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    );
    for (const call of result.calls) {
      assert.equal(call.method, "POST");
      assert.equal(
        call.redirect,
        "manual",
        "Provider redirects must not forward credentials."
      );
    }
    assert.equal(result.calls[0].authorization, false);
    if (test.calls === 2) {
      assert.equal(result.calls[1].url, "https://api.resend.com/emails");
      assert.equal(result.calls[1].authorization, true);
    }
    const publicBody = JSON.stringify(result.body);
    for (const value of [
      "synthetic-runtime-turnstile-secret",
      "synthetic-runtime-resend-secret",
      "owner@example.test",
      "visitor@example.test",
      "synthetic-runtime-token",
      "Synthetic verification failure",
      "Synthetic email failure"
    ]) {
      assert(
        !publicBody.includes(value),
        "Private test information appeared in a public response."
      );
    }
    checks++;
    process.stdout.write(`PASS Workers runtime: ${test.mode}\n`);
  }
  process.stdout.write(
    `Contact Workers runtime verification: ${checks} checks passed; providers were simulated, no email was sent.\n`
  );
} catch (error) {
  if (serverOutput) process.stderr.write(serverOutput);
  throw error;
} finally {
  await stopServer();
  await rm(temporary, { recursive: true, force: true });
}
