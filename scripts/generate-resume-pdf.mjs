import { createServer } from "node:http";
import process from "node:process";
import {
  access,
  readFile,
  realpath,
  rename,
  rm,
  writeFile
} from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { chromium } from "playwright";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const distDirectory = resolve(process.argv[2] ?? join(projectRoot, "dist"));
const basePath = normalizeBasePath(process.argv[3] ?? "/");
const resumeHtmlPath = join(distDirectory, "resume", "index.html");
const pdfPath = join(distDirectory, "resume", "Zeus-Zaragoza-Resume.pdf");
const temporaryPdfPath = `${pdfPath}.tmp-${process.pid}`;

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"]
]);

function normalizeBasePath(value) {
  if (
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.includes("\0") ||
    value.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error(`Invalid portfolio base path: ${value}`);
  }

  return value === "/" ? "/" : value.replace(/\/+$/, "");
}

function isWithinDirectory(directory, candidate) {
  const pathFromDirectory = relative(directory, candidate);
  return (
    pathFromDirectory !== ".." &&
    !pathFromDirectory.startsWith(`..${sep}`) &&
    !isAbsolute(pathFromDirectory)
  );
}

function sendStatus(response, statusCode) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end();
}

async function serveBuiltFile(request, response, distRealPath) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendStatus(response, 405);
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(
      new URL(request.url ?? "/", "http://localhost").pathname
    );
  } catch {
    sendStatus(response, 400);
    return;
  }

  if (
    !pathname.startsWith("/") ||
    pathname.includes("\\") ||
    pathname.includes("\0") ||
    pathname.split("/").some((part) => part === ".." || part === ".")
  ) {
    sendStatus(response, 403);
    return;
  }

  const pathWithinBase =
    basePath === "/"
      ? pathname
      : pathname === basePath
        ? "/"
        : pathname.startsWith(`${basePath}/`)
          ? pathname.slice(basePath.length)
          : null;

  if (pathWithinBase === null) {
    sendStatus(response, 404);
    return;
  }

  const requestedPath = pathWithinBase.endsWith("/")
    ? `${pathWithinBase}index.html`
    : pathWithinBase;
  const filePath = resolve(distRealPath, `.${requestedPath}`);

  if (!isWithinDirectory(distRealPath, filePath)) {
    sendStatus(response, 403);
    return;
  }

  let fileRealPath;
  try {
    fileRealPath = await realpath(filePath);
  } catch {
    sendStatus(response, 404);
    return;
  }

  if (!isWithinDirectory(distRealPath, fileRealPath)) {
    sendStatus(response, 403);
    return;
  }

  try {
    const contents = await readFile(fileRealPath);
    response.writeHead(200, {
      "Content-Type":
        contentTypes.get(extname(fileRealPath)) ?? "application/octet-stream",
      "Cache-Control": "no-store"
    });
    response.end(request.method === "HEAD" ? undefined : contents);
  } catch {
    sendStatus(response, 404);
  }
}

async function startServer(distRealPath) {
  const server = createServer((request, response) => {
    void serveBuiltFile(request, response, distRealPath).catch(() => {
      if (!response.headersSent) sendStatus(response, 500);
      else response.end();
    });
  });

  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });

  return server;
}

async function closeServer(server) {
  await new Promise((resolveClose, rejectClose) => {
    server.close((error) => (error ? rejectClose(error) : resolveClose()));
  });
}

async function main() {
  let browser;
  let server;

  try {
    await access(resumeHtmlPath);
    const distRealPath = await realpath(distDirectory);
    server = await startServer(distRealPath);

    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not start the local resume preview server.");
    }

    const origin = `http://127.0.0.1:${address.port}`;

    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      throw new Error(
        "Playwright Chromium could not start. Run `npx playwright install chromium` and check its system dependencies."
      );
    }

    const page = await browser.newPage();
    let failedLocalAsset = false;
    page.on("requestfailed", (request) => {
      if (request.url().startsWith(`${origin}/`)) failedLocalAsset = true;
    });
    page.on("response", (response) => {
      if (response.url().startsWith(`${origin}/`) && response.status() >= 400) {
        failedLocalAsset = true;
      }
    });

    try {
      const resumeUrl = `${origin}${basePath === "/" ? "" : basePath}/resume/`;
      await page.goto(resumeUrl, { waitUntil: "networkidle" });
      await page.emulateMedia({ media: "print" });
      await page.evaluate(async () => {
        await globalThis.document.fonts.ready;
      });

      const heading = page.locator("main .resume-page h1");
      if (
        (await heading.count()) !== 1 ||
        !(await heading.textContent())?.trim()
      ) {
        throw new Error("Resume heading was not found.");
      }

      if (failedLocalAsset) {
        throw new Error("One or more built resume assets could not be loaded.");
      }

      const pdf = await page.pdf({
        format: "Letter",
        preferCSSPageSize: true,
        printBackground: true,
        tagged: true,
        outline: true
      });

      if (failedLocalAsset || pdf.subarray(0, 5).toString() !== "%PDF-") {
        throw new Error("The built resume did not produce a valid PDF.");
      }

      await writeFile(temporaryPdfPath, pdf, { flag: "wx" });
      await rename(temporaryPdfPath, pdfPath);
    } catch (error) {
      if (
        error.message === "Resume heading was not found." ||
        error.message ===
          "One or more built resume assets could not be loaded." ||
        error.message === "The built resume did not produce a valid PDF."
      ) {
        throw error;
      }
      throw new Error("Could not render the built resume in Chromium.", {
        cause: error
      });
    }

    process.stdout.write(`Generated ${relative(projectRoot, pdfPath)}.\n`);
  } catch (error) {
    const message =
      error.code === "ENOENT" && !server
        ? "Built resume page is missing. Run `npm run build` first."
        : error.message;
    process.stderr.write(`Resume PDF generation failed: ${message}\n`);
    process.exitCode = 1;
  } finally {
    await rm(temporaryPdfPath, { force: true });
    if (browser) await browser.close();
    if (server) await closeServer(server);
  }
}

await main();
