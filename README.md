# Zeus Zaragoza portfolio

Astro site with a resume built from the approved `resume.md` in the private `zgildo01/Zeus-Vault` repository. The site validates that Markdown at build time, then generates the HTML resume and a downloadable PDF from the same build output.

## Local setup

Use a Node version supported by `package.json` (Node 22.22.3 works here), then install dependencies and the PDF browser:

```sh
npm ci
npx playwright install --only-shell chromium
```

On Linux, Chromium also needs system libraries. Install them with `npx playwright install --with-deps --only-shell chromium` if they are missing. The browser is needed for production builds and `npm run validate`, not for `npm run dev`.

Choose one resume source for development and builds:

- For a local sibling checkout, set `RESUME_VAULT_DIR=../Zeus-Vault` in an ignored `.env` file. The configured `master` branch must contain a committed root `resume.md`.
- For a hosted build, set `RESUME_CONTENT_TOKEN` as a build secret with read access to the private vault. Do not set `RESUME_VAULT_DIR` in that environment.

See `.env.example` for the variable names. Keep real token values out of that committed template. The current ignored `.env` needs only `RESUME_VAULT_DIR=../Zeus-Vault`; add `RESUME_CONTENT_TOKEN` to `.env` only if intentionally testing the GitHub API source locally, after removing `RESUME_VAULT_DIR`. A build fails when neither source is available, both sources are selected, or the selected resume is invalid.

## Commands

| Command            | Action                                                              |
| :----------------- | :------------------------------------------------------------------ |
| `npm run dev`      | Start the local Astro server                                        |
| `npm run build`    | Build `dist/`, including `dist/resume/Zeus-Zaragoza-Resume.pdf`     |
| `npm run preview`  | Preview the production build                                        |
| `npm run validate` | Run formatting, lint, Astro checks, tests, and the production build |

The PDF is printed from the built `/resume` page. Every Astro production build, including `npm run build` and direct `npx astro build`, generates it in the build completion hook. A build resolves the vault branch once, and PDF generation does not read the vault again. Run a build before `npm run preview`; preview serves the existing `dist/` files.

## CI and external content setup

The original architecture selects **Cloudflare Workers**: prerendered assets for the site and, later, a Worker endpoint for the contact form. Deployment is not configured yet; the first CI milestone is to prove the private resume can be read and built remotely. `.github/workflows/portfolio-build.yml` runs credential-free formatting, lint, Astro checks, and tests on pull requests to `develop` and `main`. Trusted pushes and dispatches build the site and PDF from the private vault and upload `dist/` as a build artifact once the workflow is committed to those branches. PR build, accessibility, link, and E2E checks from the original architecture remain open.

Obsidian already commits and pushes to the private `Zeus-Vault` repository; the remaining source connection is from a hosted portfolio build back to that repository. The current local build reads the sibling checkout through `RESUME_VAULT_DIR`. The hosted build will instead use `RESUME_CONTENT_TOKEN` to read the committed `master` branch head. These are two separate GitHub fine-grained personal access tokens, stored as GitHub Actions secrets in different repositories:

| Repository                 | Secret                     | Scope                                                                                      |
| :------------------------- | :------------------------- | :----------------------------------------------------------------------------------------- |
| `zgildo01/astro-portfolio` | `RESUME_CONTENT_TOKEN`     | Fine-grained token with **Contents: read** on the private `zgildo01/Zeus-Vault` repository |
| `zgildo01/Zeus-Vault`      | `PORTFOLIO_DISPATCH_TOKEN` | Fine-grained token with **Contents: read and write** on `zgildo01/astro-portfolio`         |

Generate the values in GitHub **Settings → Developer settings → Personal access tokens → Fine-grained tokens**. For each token, select only the repository named in its scope column and grant that repository's Contents permission. Save the generated value in the repository named in the first column under **Settings → Secrets and variables → Actions → New repository secret**. Use **repository secrets** for both tokens; neither workflow currently selects a GitHub Actions environment. The tokens are not Cloudflare credentials. GitHub Actions handles the build and notification; Cloudflare Workers will host the deployed result after the deployment step is implemented.

First, land the portfolio workflow on `develop` and inspect its trusted `push` build for the logged vault commit SHA and generated PDF. The portfolio workflow must also be on its GitHub default branch (`main`) before it can receive a `repository_dispatch` event. Then commit `Zeus-Vault/.github/workflows/notify-portfolio.yml` to the vault's `master` branch and run it manually to confirm that a portfolio Actions run starts. Its `push` trigger applies to later changes to root `resume.md`; adding the workflow alone does not trigger that path. The receiving build resolves the current vault branch head; it does not pin the dispatch payload SHA. A pull request currently runs formatting, lint, Astro checks, and tests; the full site/PDF build runs on trusted pushes or dispatches, not pull requests.

Local builds remain at `/` by default. The optional `PORTFOLIO_SITE_URL` and `PORTFOLIO_BASE_PATH` settings are available if a future deployment needs a different URL or base path. Cloudflare Workers deployment will be wired after the hosted content path is verified. The original architecture's single-repository sketch predates the later decision to keep canonical `resume.md` in the separate private vault.
