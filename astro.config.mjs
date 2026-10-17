// @ts-check
import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "astro/config";

const pdfGeneratorPath = fileURLToPath(
  new URL("./scripts/generate-resume-pdf.mjs", import.meta.url)
);
let configuredBasePath = "/";

export default defineConfig({
  ...(process.env.PORTFOLIO_SITE_URL
    ? { site: process.env.PORTFOLIO_SITE_URL }
    : {}),
  base: process.env.PORTFOLIO_BASE_PATH ?? "/",
  integrations: [
    {
      name: "resume-pdf",
      hooks: {
        "astro:config:done": ({ config }) => {
          configuredBasePath = config.base;
        },
        "astro:build:done": async ({ dir }) => {
          await new Promise((resolve, reject) => {
            const child = spawn(
              process.execPath,
              [pdfGeneratorPath, fileURLToPath(dir), configuredBasePath],
              { stdio: "inherit" }
            );

            child.once("error", reject);
            child.once("close", (code) => {
              if (code === 0) resolve(undefined);
              else
                reject(
                  new Error(`Resume PDF generation exited with code ${code}.`)
                );
            });
          });
        }
      }
    }
  ]
});
