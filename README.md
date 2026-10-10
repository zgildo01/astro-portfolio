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

See `.env.example` for the variable names. A build fails when neither source is available or the selected resume is invalid.

## Commands

| Command            | Action                                                              |
| :----------------- | :------------------------------------------------------------------ |
| `npm run dev`      | Start the local Astro server                                        |
| `npm run build`    | Build `dist/`, including `dist/resume/Zeus-Zaragoza-Resume.pdf`     |
| `npm run preview`  | Preview the production build                                        |
| `npm run validate` | Run formatting, lint, Astro checks, tests, and the production build |

The PDF is printed from the built `/resume` page. Every Astro production build, including `npm run build` and direct `npx astro build`, generates it in the build completion hook. A build resolves the vault branch once, and PDF generation does not read the vault again. Run a build before `npm run preview`; preview serves the existing `dist/` files.
