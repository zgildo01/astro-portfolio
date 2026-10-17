# Developer Portfolio Implementation Plan

## Purpose

This document turns the approved portfolio architecture into a practical implementation sequence.

The original `developer-portfolio-architecture(1).md` specifies Cloudflare Workers for hosting. Later user decisions refine its content model by keeping the canonical resume in a separate private GitHub vault rather than the original single-repository sketch.

The plan will be developed one pillar at a time. Each pillar should remain small enough to complete and verify without introducing speculative features or unnecessary infrastructure.

## Planning conventions

Each pillar should document:

- the implementation goal;
- its major steps;
- important decisions made during discussion;
- dependencies on earlier pillars;
- a concise completion check.

The implementation plan should remain intentionally lighter than a task-by-task engineering specification. Detailed commands, file changes, and acceptance criteria can be added when a pillar is actively being implemented.

---

# Pillar 1: Development Foundation

**Status: Complete**

## Goal

Establish a stable local development foundation for the Astro portfolio before implementing application structure, professional content, or visual design.

## 1.1 Establish runtime and toolchain

**Status: Complete**

- Node.js
- npm
- Astro

### Recorded decisions

- Use Astro as the primary framework.
- Use the project-local dependency versions recorded in `package.json` and `package-lock.json`.
- Keep `package-lock.json` in source control.

## 1.2 Install development dependencies

**Status: Complete**

- ESLint
- Prettier
- Vitest

### Recorded decisions

- ESLint handles static analysis and code-quality rules.
- Prettier handles formatting.
- Vitest provides the initial unit-testing framework.

## 1.3 Configure tooling

**Status: Complete**

- ESLint configured
- Prettier configured
- Vitest configured

### Completion check

- Each tool has a project-level configuration.
- The configurations are compatible with the current Astro and TypeScript setup.
- Tool responsibilities do not overlap unnecessarily.

## 1.4 Establish npm commands

**Status: Complete**

The following package scripts are established for routine development and validation:

- `check` runs Astro and TypeScript diagnostics;
- `lint` runs ESLint across the project's JavaScript, TypeScript, and Astro files;
- `format` applies the project's Prettier configuration;
- `test` runs the Vitest test suite once.

### Recorded decisions

- Keep write-oriented development commands separate from non-mutating validation commands.
- Provide supporting commands for automatic lint fixes, formatting checks, test watch mode, and complete project validation.
- The aggregate validation command runs formatting checks, linting, type checking, tests, and the production build in sequence, stopping when a step fails.

### Completion check

- The core commands are defined in `package.json`.
- Each command has a clear, non-overlapping responsibility.
- Successful execution of the complete validation sequence remains part of step 1.5.

## 1.5 Verify foundation

**Status: Complete**

The development foundation has been verified successfully:

- formatting passes;
- linting passes;
- type checking passes;
- tests pass;
- the production build passes.

## Pillar 1 completion condition

**Pillar 1 is complete.** The project can be validated through repeatable npm commands and produces a successful production build.

---

# Pillar 2: Professional Information Architecture and Core Site Shell

**Status: Complete**

## Goal

Transform the completed Astro foundation into a low-fidelity, recruiter-first website shell. Pillar 2 establishes the site's professional user journeys, primary routes, shared structure, baseline presentation, and essential professional messaging without implementing the later feature pillars or final atmospheric design.

## Dependencies

- Pillar 1 must be complete.

## 2.1 Establish authoritative project directory structure

**Status: Complete**

All directory-placement guidance for the portfolio is centralized in this subphase. Later pillars may refer to these locations, but they should not duplicate or redefine directory trees elsewhere in the plan. If a new requirement changes file ownership, this section should be updated before the new path is adopted.

### Recorded decision: scaffold the full architecture up front

The project's long-term directory architecture is intentionally scaffolded during Pillar 2.1 rather than being created piecemeal as later pillars begin. This provides a stable ownership map for professional pages, shared shell code, tests, assets, and the optional React experience.

Scaffolding and implementation are separate states:

- creating a directory or reserved file path establishes where future work belongs;
- a scaffolded path does not mean its feature, route, dependency, test, or runtime behavior is implemented;
- later pillars should populate the existing architecture rather than reorganize it without a demonstrated ownership problem;
- future-facing source files must remain unimported and operationally inert until their assigned pillar;
- framework-active placeholders require special care because a filename alone may activate routing or test discovery.

The repository-level `tests/` directory is the authoritative test location. Test code must not be placed under `src/`, `src/pages/`, or `public/`.

### Scaffolded long-term project structure

The following structure records the architecture established during Pillar 2. Active professional-site files are implemented; future-experience paths remain reserved and operationally inactive until Pillar 10.

```text
my-portfolio/
├── .vscode/
│   ├── extensions.json
│   └── launch.json
├── public/
│   ├── favicon.ico
│   └── favicon.svg
├── src/
│   ├── assets/
│   │   └── experience/
│   │       ├── README.md
│   │       ├── audio/
│   │       ├── images/
│   │       └── textures/
│   ├── components/
│   │   └── site/
│   │       ├── MobileNavigation.astro
│   │       ├── MobileNavigation.module.css
│   │       ├── SiteFooter.astro
│   │       ├── SiteFooter.module.css
│   │       ├── SiteHeader.astro
│   │       ├── SiteHeader.module.css
│   │       ├── SiteNavigation.astro
│   │       ├── SiteNavigation.module.css
│   │       └── SkipLink/
│   │           ├── SkipLink.astro
│   │           ├── SkipLink.module.css
│   │           └── skipLink.ts
│   ├── config/
│   │   ├── pageMetadata.ts
│   │   └── site.ts
│   ├── features/
│   │   └── experience/
│   │       ├── README.md
│   │       ├── ExperienceRoot.tsx
│   │       ├── components/
│   │       ├── hooks/
│   │       ├── scenes/
│   │       ├── state/
│   │       ├── utilities/
│   │       └── experience.css
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── ExperienceLayout.astro
│   ├── lib/
│   │   └── routing.ts
│   ├── pages/
│   │   ├── index.astro
│   │   ├── resume.astro
│   │   ├── about.astro
│   │   ├── contact.astro
│   │   ├── experience.astro.placeholder
│   │   └── work/
│   │       └── index.astro
│   └── styles/
│       ├── global.css
│       └── shell.css
├── tests/
│   ├── unit/
│   │   ├── components/
│   │   │   └── site/
│   │   │       └── skipLink.test.ts
│   │   ├── config/
│   │   │   └── site.test.ts
│   │   └── features/
│   │       └── experience/
│   ├── integration/
│   │   ├── site/
│   │   │   └── shell.test.ts
│   │   └── experience/
│   ├── e2e/
│   ├── fixtures/
│   └── helpers/
├── .gitignore
├── .prettierrc.mjs
├── astro.config.mjs
├── eslint.config.mjs
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

The tree records the agreed ownership model. Because the full architecture was scaffolded in advance, reserved future paths may exist before they contain production behavior. Git does not track empty directories, so a concise `README.md` or `.gitkeep` may be used where the path itself needs to remain visible. Framework-active placeholders must remain non-routable and non-discoverable until their assigned pillar.

### Pillar 2 final implementation checkpoint

At the completion of Pillar 2:

| Area | Completed state |
|---|---|
| Professional routes | `/`, `/resume`, `/work`, `/about`, and `/contact` render independently through `BaseLayout.astro`. |
| Shared layout | `BaseLayout.astro` owns document metadata, the skip link, header, main-content target, page slot, and footer. |
| Navigation | Header, footer, and compact portrait-phone navigation reuse `SiteNavigation.astro`; current-page state is exposed with `aria-current="page"`. |
| Mobile navigation | `MobileNavigation.astro` uses native `details` and `summary` disclosure behavior and appears only on compact portrait viewports; landscape phones, tablets, laptops, and desktops use the standard navigation. |
| Skip link | A single shared skip link remains keyboard-accessible and progressively appears as a floating touch/pointer control when the start of main content leaves the viewport. Its styles and browser behavior are separated into a CSS Module and testable TypeScript module. |
| Metadata | `site.ts` owns stable site identity and navigation; `pageMetadata.ts` owns route-specific titles and descriptions. |
| Routing utility | `lib/routing.ts` centralizes route-path normalization used by shared navigation. |
| Styling | `global.css` owns document-wide foundations; `shell.css` owns shared layout and page rhythm; component CSS Modules own component-specific presentation. No route-specific stylesheet is required yet. |
| Content | All five pages contain one clear primary heading, introductory professional copy, honest incomplete-content states where appropriate, and useful cross-route calls to action. |
| Tests and validation | Repository-level unit and integration tests pass, keyboard and responsive behavior were manually verified, and the production build passes. |
| Optional experience | The complete future architecture is reserved but remains inactive, absent from primary navigation, and isolated from the professional site until Pillar 10. |

### Directory responsibilities

- `src/pages/` owns route entry points and route-specific semantic content. File placement must map clearly to the public URL.
- `src/pages/work/index.astro` represents `/work`. The directory also leaves a stable location for later case-study routes such as `src/pages/work/[slug].astro`.
- `src/layouts/` owns shared document structure. It must not contain page-specific professional content.
- `src/components/site/` owns reusable pieces of the professional shell. Component-only styles and browser behavior should remain colocated with their owning component when practical.
- `src/config/site.ts` owns stable shared site identity, role, default metadata, and primary navigation definitions. It must not become a general content database.
- `src/config/pageMetadata.ts` owns route-specific title and description objects consumed by the professional pages.
- `src/lib/` owns narrowly scoped shared utilities that are not components, such as route normalization.
- `src/styles/global.css` owns resets, base document behavior, baseline typography, shared tokens, focus visibility, and reduced-motion defaults.
- `src/styles/shell.css` owns only shared page-shell layout, container widths, main-region spacing, and route-level vertical rhythm. Header, footer, navigation, mobile disclosure, and skip-link presentation belong to their component CSS Modules.
- Page-specific CSS remains deferred until a page demonstrates a unique presentation responsibility. Route-specific class names may remain as future hooks.
- `src/features/experience/` owns the future isolated React application, including its components, state, hooks, scenes, utilities, and feature-specific styles.
- `src/assets/experience/` owns media used exclusively by the optional interactive experience.
- `tests/` owns all automated test code. Tests remain outside production source and public-asset directories.
- `public/` remains limited to files that should be copied without build-time processing. Processed imagery introduced later should generally enter through `src/assets/`.

### File responsibilities

| File or path | Responsibility |
|---|---|
| `src/config/site.ts` | Export the professional identity, role, default metadata, and five-item primary navigation model. |
| `src/config/pageMetadata.ts` | Export strongly typed metadata for Home, Resume, Work, About, and Contact without duplicating title construction in route files. |
| `src/lib/routing.ts` | Normalize route pathnames for reliable current-page comparisons. |
| `src/layouts/BaseLayout.astro` | Provide the shared HTML document, metadata props, skip link, header, main-content fragment target and nonvisual start marker, page slot, and footer. |
| `src/components/site/SiteHeader.astro` | Present the professional identity and compose standard and compact navigation placements. |
| `src/components/site/SiteNavigation.astro` | Render the shared five-link navigation model for header, footer, and mobile placements and expose the current route with `aria-current="page"`. |
| `src/components/site/MobileNavigation.astro` | Provide the native `details`/`summary` disclosure used only on compact portrait-phone layouts. |
| `src/components/site/SiteFooter.astro` | Provide restrained sitewide professional identity, navigation, and copyright information without duplicating route content. |
| `src/components/site/SkipLink/SkipLink.astro` | Render the single shared main-content bypass link and initialize its progressive browser behavior. |
| `src/components/site/SkipLink/skipLink.ts` | Own target resolution, observation of the main-start marker, and visibility data attributes for the skip link; the native anchor owns fragment navigation. |
| `src/components/site/*.module.css` and `src/components/site/SkipLink/SkipLink.module.css` | Own component-specific presentation without expanding the global shell stylesheet. |
| `src/styles/global.css` | Establish resets, baseline document behavior, low-fidelity tokens, typography, global links, focus visibility, and reduced-motion safeguards. |
| `src/styles/shell.css` | Establish reusable shell containers, main-region spacing, shared page width, and route-level vertical rhythm. |
| Professional route files under `src/pages/` | Select shared metadata, use `BaseLayout.astro`, and supply semantic route-specific headings, introductory copy, honest incomplete states, and calls to action. |
| `tests/unit/config/site.test.ts` | Verify the shared identity and five-item navigation model, including unique route targets and the absence of `/experience`. |
| `tests/unit/components/site/skipLink.test.ts` | Verify deterministic skip-link target and visibility-state behavior. |
| `tests/integration/site/shell.test.ts` | Render the composed Astro shell and verify metadata, shell landmarks, navigation, skip-link target, current-route state, slot content, and the absence of React hydration. |
| Future experience source, route, asset, and test paths | Remain reserved for Pillar 10 and must not become active, imported, discoverable, or publicly routed before then. |

### Framework activation rules for scaffolds

Some paths are not inert merely because their contents are incomplete:

- Astro treats a valid `.astro` file under `src/pages/` as a route. Until Pillar 10, the reserved experience route must be kept outside route discovery, for example by using a documentation placeholder or a non-route suffix such as `experience.astro.placeholder`.
- Vitest or a later browser runner may discover files ending in `.test.*` or `.spec.*`. Reserved future test files should remain non-discoverable until they contain meaningful tests and the matching runner is configured.
- `ExperienceRoot.tsx`, `ExperienceLayout.astro`, experience styles, and experience assets must not be imported by professional routes during Pillar 2.
- React, `react-dom`, and `@astrojs/react` must not be installed merely because their eventual source locations are scaffolded.
- Empty or documented future paths must not alter the production bundle, published routes, validation commands, or professional-site behavior.

### Project-wide test directory convention

The permanent test tree is:

```text
tests/
├── unit/
├── integration/
├── e2e/
├── fixtures/
└── helpers/
```

All five categories may be scaffolded during 2.1. They receive executable files only when a real test, fixture, or shared helper exists.

#### Test category responsibilities

- `tests/unit/` contains fast tests for pure or narrowly scoped behavior such as configuration models, validators, content transformations, resume transformations, utilities, and state reducers.
- `tests/integration/` contains tests that cross a meaningful application boundary, including multiple Astro components rendered together, content-loader integration, the contact endpoint and adapters, or the future React feature root. External services must be mocked or replaced by test adapters.
- `tests/e2e/` contains browser-level user journeys such as route loading, primary navigation, resume access, mobile navigation, contact submission, reduced-motion behavior, and the optional `/experience` route.
- `tests/fixtures/` contains stable, non-sensitive sample content or payloads shared by multiple tests. It must not contain production credentials, private resume drafts, employer-confidential material, or real contact-form PII.
- `tests/helpers/` contains test-only builders, adapters, setup code, and assertions. Code required by the production application does not belong here.

#### Naming and mirroring rules

- Vitest unit and integration files use `*.test.ts` or `*.test.tsx` only when they contain meaningful executable tests.
- Browser E2E files use `*.spec.ts` when the E2E runner is introduced.
- Test paths should mirror the production responsibility where useful rather than reproduce every source directory mechanically.
- Do not introduce a second convention such as colocated `__tests__/` directories unless this decision is explicitly revisited.
- `npm test` should discover both unit and integration tests. A separate `test:e2e` command should be added when browser E2E tooling is introduced, and the aggregate validation command should include it once the suite is stable.

Representative mappings:

| Production responsibility | Test location |
|---|---|
| `src/config/site.ts` | `tests/unit/config/site.test.ts` |
| Shared Astro shell | `tests/integration/site/shell.test.ts` |
| Resume parsing or transformations | `tests/unit/resume/` |
| Work-content parsing or transformations | `tests/unit/work/` |
| Contact validation utilities | `tests/unit/lib/contact/` |
| Contact endpoint plus provider adapters | `tests/integration/contact/` |
| React experience state and utilities | `tests/unit/features/experience/` |
| React experience integration boundary | `tests/integration/experience/` |
| Sitewide navigation journey | `tests/e2e/navigation.spec.ts` |
| Optional interactive route journey | `tests/e2e/experience.spec.ts` |

### Pillar 2 integration-test support

The existing Astro and Vitest toolchain supports a real integration test during Pillar 2. The planned `tests/integration/site/shell.test.ts` should use Astro's Container API through Vitest to render `BaseLayout.astro` with its child shell components and a test slot.

The test should verify behavior that only becomes meaningful when several pieces are composed:

- the skip link targets the shared main-content anchor;
- the header, five-item primary navigation, main region, and footer render together;
- the current route receives `aria-current="page"`;
- `/experience` remains absent from primary navigation;
- supplied page content renders through the layout slot;
- the rendered shell does not require browser hydration merely to produce its professional structure.

No additional test runner is required for this Pillar 2 integration test beyond Astro and Vitest. The Vitest configuration must load the Astro project configuration and discover both `tests/unit/**/*.test.*` and `tests/integration/**/*.test.*`. Because Astro's Container API is experimental, its use should remain narrow and localized rather than becoming a large custom testing abstraction.

Route loading in an actual browser, responsive navigation behavior, and keyboard traversal remain E2E concerns and are deferred until browser tooling is introduced. A component-render integration test is not a substitute for those later browser checks.

### Optional-experience architecture boundary

The complete experience architecture has been scaffolded to reserve ownership, but Pillar 10 remains responsible for all implementation and activation. The following constraints remain in force:

- `/experience` is not published as an unfinished route;
- the experience does not appear in primary navigation;
- no professional route imports its React root, styles, state, media, or layout;
- no React dependency or hydration directive is introduced during Pillar 2;
- experience unit, integration, and E2E tests remain inactive until meaningful behavior exists;
- the experience architecture may be refined during Pillar 10 if its final interaction model demonstrates a real need.

### Completion record

**Subphase 2.1 is complete.** The full intended architecture has been scaffolded, test ownership has been moved to the repository-level `tests/` directory, current and future responsibilities are documented, and the distinction between reserved paths and active implementation is explicit.

Completion of 2.1 does not imply that the five professional routes, full shared shell, styles, tests, or optional experience are implemented. Those outcomes remain assigned to the following subphases and later pillars.

## 2.2 Define professional user journeys

**Status: Complete**

The professional journeys are defined and require no additional implementation before route work begins.

Establish the primary paths through the portfolio:

- Home to Resume;
- Home to selected Work;
- sitewide access to Contact;
- direct access to every professional page.

### Recorded decisions

- Home, Resume, Work, About, and Contact are the five primary experiences.
- Recruiter access to professional content must remain direct and obvious.
- No introductory, immersive, or interactive experience may obstruct a professional route.

### Completion record

The five primary destinations and recruiter-first navigation constraints are accepted.

## 2.3 Establish primary routes

**Status: Complete**

The following professional routes are implemented and render independently:

- `/`;
- `/resume`;
- `/work`;
- `/about`;
- `/contact`.

Each route uses `BaseLayout.astro`, selects route-specific metadata from `pageMetadata.ts`, exposes one clear `<h1>`, and remains independent of React and the optional experience.

### Completion record

- direct URL loading works for all five routes;
- every route uses the shared document shell rather than duplicating it;
- route titles and descriptions are centralized and distinct;
- `/work` is represented by `src/pages/work/index.astro`, preserving room for future case-study routes;
- no professional route depends on unfinished later-pillar behavior.

## 2.4 Implement the shared site shell

**Status: Complete**

The professional routes share one Astro-first shell composed from:

- `BaseLayout.astro`;
- `SiteHeader.astro`;
- `SiteNavigation.astro`;
- `MobileNavigation.astro`;
- `SiteFooter.astro`;
- `SkipLink/SkipLink.astro`;
- `site.ts`, `pageMetadata.ts`, and `lib/routing.ts`.

### Recorded decisions

- The primary navigation contains only Home, Resume, Work, About, and Contact.
- Header, footer, and mobile navigation reuse the same navigation component and shared data model.
- Current-page state is represented semantically with `aria-current="page"`.
- Route paths are normalized through a shared utility rather than duplicated component logic.
- `BaseLayout.astro` owns the single `<main id="main-content">` fragment target without a `tabindex` attribute; pages do not render nested main landmarks.
- The skip link is inherited through `BaseLayout.astro`; route files must not render duplicate copies.
- The standard professional shell requires no React, client-side router, or framework-hydrated island.
- The small skip-link enhancement remains ordinary, isolated browser TypeScript.

### Completion record

All five professional pages receive the same semantic document structure, identity, navigation, accessibility controls, metadata contract, main-content target, and footer.

## 2.5 Establish baseline presentation

**Status: Complete**

The site now has a restrained low-fidelity visual foundation covering:

- document-wide reset and baseline typography;
- shared spacing and content-width tokens;
- readable route widths and vertical rhythm;
- reusable shell containers and main-region spacing;
- component-scoped header, navigation, mobile-navigation, footer, and skip-link styles;
- visible focus treatment;
- reduced-motion safeguards;
- responsive behavior across portrait phones, phone landscape, tablets, laptops, and desktop widths.

### Recorded decisions

- Use ordinary custom CSS rather than a UI framework.
- `global.css` owns document-wide foundations.
- `shell.css` stays intentionally small and owns only shared layout and page rhythm.
- Component CSS Modules own component-specific presentation.
- Route files do not require dedicated stylesheets during Pillar 2; shared `.page` structure and route-specific class hooks are sufficient.
- The compact disclosure uses native `details` and `summary` behavior.
- The hamburger presentation is limited to portrait viewports below `37.5rem` (`600px`). Landscape phones, tablets, laptops, and desktops retain the standard navigation.
- The single skip link remains keyboard-accessible and becomes a floating touch/pointer affordance when the start of main content leaves the viewport.
- This remains a usable wireframe. The Fogbound Institutional production design belongs to Pillar 3, while final atmospheric effects remain deferred to Pillar 9.

### Completion record

The shell is readable, responsive, focus-visible, reduced-motion aware, and organized so Pillar 3 can replace provisional presentation without changing the semantic architecture.

## 2.6 Add foundational professional content

**Status: Complete**

The site contains enough real professional content to make the shell understandable:

- Zeus Zaragoza's professional identity;
- Platform Engineer positioning;
- a concise homepage value proposition;
- direct Resume, Work, and Contact calls to action;
- one clear route heading and introductory copy on every professional page;
- honest in-progress states for Resume, Work, About, and Contact where later pillars own the complete experience;
- useful cross-route links without fake downloads, invented projects, nonfunctional forms, or confidential information.

Full resume content, completed case studies, contact-form behavior, and final long-form biography remain assigned to their later pillars.

### Completion record

The professional message is clear enough for navigation and UX/UI design work to proceed without fabricating later-pillar content.

## 2.7 Verify the core experience

**Status: Complete**

The completed Pillar 2 shell was verified against the following gate:

- all five primary routes render and load directly;
- header, footer, and compact mobile navigation resolve the shared route model correctly;
- direct links work;
- the current route is exposed with `aria-current="page"`;
- the skip link targets the shared main-content region, and native fragment navigation places the next keyboard Tab there;
- keyboard traversal and visible focus behavior work;
- the native mobile disclosure opens and closes through pointer, touch, Enter, and Space interaction;
- hidden navigation does not remain in the keyboard order;
- the shell remains usable across portrait-phone, landscape-phone, tablet, laptop, and desktop layouts;
- reduced-motion behavior remains usable;
- repository-level unit and integration tests pass;
- formatting, linting, Astro/TypeScript checks, tests, and the production build pass through the project validation workflow;
- `/experience` remains outside primary navigation and inactive as a public unfinished experience.

### Completion record

**Subphase 2.7 is complete.** The professional shell is coherent, responsive, keyboard-usable, test-covered at the established Pillar 2 boundaries, and production-buildable.

## 2.8 Define the optional React experience boundary

**Status: Complete — boundary and architecture only**

Reserve `/experience` for an entirely optional psychological-horror experience inspired by *Silent Hill* and *Jacob's Ladder*. Its purpose is to demonstrate substantial React knowledge through meaningful interactive behavior.

All current reservations, future source locations, asset ownership, and test placement for this experience are defined centrally in **2.1 Establish authoritative project directory structure**. This subsection defines product and integration boundaries only.

### Recorded decisions

- The experience is secondary and is not a sixth primary portfolio section.
- It will not appear in the primary navigation.
- When implemented, it may be entered through restrained secondary links from Home and Work.
- It must provide an obvious and consistently available route back to the professional portfolio.
- Resume, Work, About, Contact, and the main homepage must never depend on it.
- The portfolio remains Astro-first; React should be isolated to the experience rather than applied across the entire site.
- The experience may use a more aggressive visual and interaction language than the professional portfolio, but it must not leak bundle weight, state, failure modes, or navigation requirements into professional routes.
- Sound, if used, must be optional rather than required for comprehension or progress.
- Pillar 2 records and scaffolds the integration boundary only. It does not install React, build or import the experience, activate the public route, run placeholder experience tests, or publish unfinished experience content.
- The full experience will be designed and implemented in Pillar 10.

## Pillar 2 completion condition

**Pillar 2 is complete.**

The five professional routes now form a coherent, responsive, keyboard-usable site shell; the foundational professional message is clear; shared metadata, navigation, styles, and accessibility behavior have explicit ownership; validation passes; and the optional React experience remains a documented, scaffolded, but inactive boundary whose route, dependencies, imports, tests, and runtime behavior are deferred to Pillar 10.

### Current checkout variance (2026-09-26)

The completion record above describes the accepted Pillar 2 checkpoint. One known route exception remains: the zero-byte `src/pages/experience.astro` currently publishes an empty `/experience` route. The user accepted leaving this file in place. The experience itself remains unimplemented and absent from primary navigation.

The site shell and configuration tests were restored on 2026-09-26; their current validation result is recorded under Pillar 3.1.

---

# Pillar 3: Professional UX/UI System

**Status: Complete — responsive presentation accepted on 2026-09-26**

**Implementation handoff:** `pillar-3-ux-ui-designer-ai-handoff.md`

## Goal

Turn the low-fidelity site shell from Pillar 2 into a cohesive, polished, recruiter-facing interface that future feature pillars can build upon. This pillar establishes the professional visual system and interaction patterns without implementing the final psychological-horror atmosphere.

## Dependencies

- Pillar 2 must be complete.

## 3.1 Define the visual foundation

**Status: Complete — visual foundation accepted on 2026-09-26**

Establish the reusable design decisions for:

- typography;
- color palette;
- spacing and content widths;
- borders, surfaces, and visual layering;
- responsive breakpoints;
- motion timing;
- focus, hover, active, visited, error, success, and disabled states.

The values below are the provisional design baseline. They should be treated as implementation starting points rather than immutable specifications. They may be adjusted during Pillar 3 after testing real page compositions, accessibility, performance, font rendering, and responsive behavior.

### Design direction: Fogbound Institutional

The professional visual system will pursue a dark direction called **Fogbound Institutional**. Its emotional center is dream-like loneliness and isolation rather than violence, danger, or conventional horror.

The influence hierarchy is:

1. **Silent Hill 2** provides the emotional temperature: melancholy, obscured distance, weathered institutional color, deep fog, and isolated pools of light.
2. **Liminal-space imagery** guides composition: empty transitional areas, anonymous architecture, repetition, ambiguous time, and intentionally unused space.
3. **Weirdcore** contributes restrained anomalies: early-digital residue, slightly artificial color, contextless labels, and occasional details that feel familiar but subtly wrong.

These influences should not receive equal visual weight. Silent Hill 2 and liminal-space composition define the professional site. Weirdcore should appear as limited contamination rather than a dominant neon or collage aesthetic.

The intended impression is:

> A professional document discovered in an empty municipal building at an uncertain hour: clear enough to trust, distant enough to remember.

The site should evoke solitude and unease without appearing threatening, theatrical, or unprofessional. Recruiter comprehension remains the governing constraint.

### Typography

Use a restrained three-family system:

| Role | Provisional family | Primary use |
|---|---|---|
| Display | Source Serif 4 | Hero name, page titles, short quotations, and occasional emotionally weighted text |
| Body/UI | IBM Plex Sans | Navigation, body copy, resume content, buttons, forms, and most headings |
| Metadata | IBM Plex Mono | Dates, project metadata, route labels, technology labels, status markers, and file-format labels |

#### Typography rules

- Source Serif 4 should normally use weights 400 or 500 and should not be used for dense interface content.
- IBM Plex Sans should normally use weights 400 through 600; thin weights should be avoided on dark surfaces.
- IBM Plex Mono should be used sparingly and should not become the body font.
- Avoid distressed horror fonts, blackletter, faux handwriting, excessive typewriter styling, or deliberate illegibility.
- Avoid full paragraphs in uppercase and avoid center-aligned long-form content.
- Body text should generally use a line height between `1.6` and `1.7`.
- Large display headings should generally use a line height between `0.95` and `1.1`.
- Section headings should generally use a line height between `1.05` and `1.2`.
- Metadata may use uppercase lettering with approximately `0.1em` to `0.14em` tracking.
- Exact font-delivery and subsetting decisions will be made during implementation with performance and licensing in mind.

#### Provisional type scale

| Token | Value |
|---|---|
| Caption | `0.75rem` |
| Small | `0.875rem` |
| Body | `clamp(1rem, 0.96rem + 0.18vw, 1.125rem)` |
| Lede | `clamp(1.125rem, 1rem + 0.5vw, 1.5rem)` |
| Heading 3 | `clamp(1.25rem, 1.1rem + 0.7vw, 1.75rem)` |
| Heading 2 | `clamp(1.75rem, 1.35rem + 1.8vw, 3rem)` |
| Page title | `clamp(2.75rem, 1.8rem + 4vw, 6rem)` |
| Hero | `clamp(3.75rem, 2rem + 7vw, 9rem)` |

### Color palette: Fogbound Institutional

The palette should use blue-green charcoal rather than pure black, fog-colored text rather than pure white, and rare artificial-light accents. It should avoid both generic black-and-red horror and full neon weirdcore.

| Semantic role | Provisional token | Value | Intended use |
|---|---|---:|---|
| Deepest background | Void | `#090B0B` | Empty environmental space and deepest page background |
| Main background | Background | `#0E1212` | Ordinary page background |
| Recessed surface | Surface 1 | `#141A1A` | Inputs, code excerpts, and subdued regions |
| Raised surface | Surface 2 | `#1A2221` | Interactive cards and emphasized content |
| Selected surface | Surface 3 | `#222B2A` | Selected navigation or active regions |
| Primary text | Fog White | `#E5E2D8` | Important headings and primary text |
| Body text | Concrete | `#C3C5BE` | Normal readable copy |
| Secondary text | Distant Gray | `#959B95` | Metadata and subordinate information |
| Decorative rule | Recessed Line | `#39423F` | Nonessential separators and distant geometry |
| Functional border | Structural Line | `#66716D` | Controls and meaningful boundaries |
| Primary interaction | Hospital Green | `#A7C7BA` | Links, selected controls, and primary affordances |
| Hover interaction | Lit Green | `#C4DDD2` | Hovered interactive text and borders |
| Pressed interaction | Pressed Green | `#7F9E92` | Active or pressed states |
| Rare warm accent | Sodium Light | `#B99B68` | Isolated warm emphasis and distant-light motifs |
| Visited/dream accent | Memory Violet | `#8F869F` | Visited contextual links and rare dreamlike details |
| Error/decay accent | Oxidized Rust | `#B97A6B` | Errors and highly limited decay accents |
| Focus indicator | Focus Light | `#D7F0E4` | Keyboard focus ring |
| Success | Muted Success | `#9FBEA9` | Success feedback |
| Warning | Muted Warning | `#C2A76E` | Warning feedback |

#### Color-use rules

- Approximately 80 to 85 percent of the interface should remain in dark blue-green neutrals.
- Approximately 10 to 15 percent should use fog and concrete text tones.
- Hospital Green should remain a limited interaction color rather than a decorative wash.
- Sodium Light, Memory Violet, and Oxidized Rust should be rare anomalies and should not compete in the same viewport without a specific reason.
- Red should not become the site’s primary horror signal.
- Bright cyan, magenta, and acid green may be explored later inside the optional React experience, but not as the professional site’s dominant palette.
- Normal text must meet WCAG 2.2 AA contrast requirements after all backgrounds and overlays are composited.
- Meaningful controls and focus states must remain distinguishable without relying only on color.

### Spacing and composition

Use a conventional four-pixel base scale, but employ larger gaps more generously than a typical dashboard or SaaS interface.

| Token | Value |
|---|---:|
| Space 1 | `0.25rem` |
| Space 2 | `0.5rem` |
| Space 3 | `0.75rem` |
| Space 4 | `1rem` |
| Space 5 | `1.5rem` |
| Space 6 | `2rem` |
| Space 7 | `3rem` |
| Space 8 | `4rem` |
| Space 9 | `6rem` |
| Space 10 | `8rem` |
| Standard section gap | `clamp(4.5rem, 8vw, 8rem)` |
| Large section gap | `clamp(6rem, 12vw, 11rem)` |

#### Spatial rules

- Closely related elements should remain grouped conventionally.
- Major ideas should be separated by unusually generous, intentional space.
- Content should not be distributed evenly merely to fill the viewport.
- Important content should generally remain left-aligned or slightly off-center.
- Desktop hero content may occupy approximately five or six columns of a twelve-column grid while other columns remain intentionally empty.
- Avoid placing every section inside a card.
- Avoid dense grids of technology badges.
- Empty space must appear deliberate rather than unfinished.
- Mobile layouts should preserve clarity instead of reproducing desktop emptiness mechanically.

### Content widths

| Role | Provisional value |
|---|---:|
| Standard copy | `68ch` |
| Narrow copy | `52ch` |
| Lede or hero statement | `48ch` |
| Standard site shell | `80rem` |
| Wide media/case-study shell | `92rem` |
| Horizontal page gutter | `clamp(1.25rem, 3vw, 3.5rem)` |

#### Width rules

- Standard paragraphs should not exceed approximately `68ch`.
- Hero and introductory statements should generally remain between `38ch` and `48ch`.
- Resume and case-study bullets should remain readable rather than stretching across wide monitors.
- Navigation should align with the standard shell instead of the raw viewport edge.
- On very wide screens, surplus space should become environmental emptiness rather than wider prose.

### Borders and geometry

- Use `1px` borders by default.
- Reserve `2px` borders for selected, focused, or strongly emphasized states.
- Use squared or nearly squared geometry.
- Provisional radii are `0`, `2px`, and `4px`.
- Avoid large rounded cards, widespread pill-shaped controls, bubbly dashboard styling, neon glows, and decorative borders around every section.
- Pill shapes should be used only when they communicate a meaningful compact status.
- Technology labels should resemble restrained catalog or institutional labels rather than soft badges.

Decorative boundaries and functional boundaries should be treated differently:

- **Recessed Line** may be low contrast because it is not required to communicate interaction.
- **Structural Line** must remain visible around controls and meaningful regions.
- **Focus Light** is reserved for unmistakable keyboard focus.

### Surfaces and elevation

Use a shallow surface hierarchy:

1. **Void** for deepest empty space.
2. **Background** for the ordinary page plane.
3. **Surface 1** for recessed content such as inputs or code excerpts.
4. **Surface 2** for interactive or emphasized content.
5. **Surface 3** for selected states.

Surface rules:

- Negative space, typography, alignment, and hairline separators should do more work than cards.
- Avoid glassmorphism and widespread backdrop blur.
- Avoid fashionable gradients that undermine the institutional mood.
- A minimal radial or vertical value shift may imply distant fluorescent or sodium light.
- Shadows should be reserved for genuine elevation and should remain broad, dark, and restrained.

A provisional elevated shadow may resemble:

```css
box-shadow:
  inset 0 1px 0 rgb(255 255 255 / 0.025),
  0 18px 48px rgb(0 0 0 / 0.28);
```

### Visual layering

The visual system should reserve clear conceptual layers:

1. **Void**: deepest background and unused space.
2. **Distant light**: very low-opacity green-gray or sodium illumination.
3. **Architecture**: rules, frames, columns, repetition, and surface boundaries.
4. **Professional content**: text, navigation, resume content, projects, and controls.
5. **Interaction**: hover, focus, active, selected, and validation states.
6. **Atmosphere**: fog, grain, distortion, and environmental effects added in a later pillar.

Pillar 3 may prepare stable attachment points for the atmospheric layer, but professional content must never depend on that layer.

Use a small semantic stacking scale instead of arbitrary `z-index` values:

| Layer | Provisional value |
|---|---:|
| Background | `0` |
| Environment | `10` |
| Surface | `20` |
| Content | `30` |
| Sticky navigation | `40` |
| Overlay | `50` |
| Focus | `60` |
| Skip link | `70` |

Color and layer variables should use semantic names so later Professional, Immersive, and Minimal modes can override presentation without rewriting components.

### Environmental imagery and asset strategy

Environmental imagery should establish the world of the portfolio without becoming a requirement for every page or component. The professional site should not depend on a large library of perfectly coordinated cinematic photography.

#### Initial master asset set

The provisional launch target is a small, reusable set of source assets:

1. **One wide exterior hero image** featuring an empty rainy or foggy transitional space, such as a bus shelter, walkway, underpass, platform, parking structure, or roadside. The composition should reserve a comparatively quiet region for hero text.
2. **One vertical interior image** featuring an empty hallway, stairwell, waiting room, utility corridor, doorway, or similarly anonymous institutional environment.
3. **Two or three environmental textures**, such as wet glass, concrete, peeling paint, dirty fluorescent ceilings, or rain on a window.

These sources may produce multiple responsive crops, blurred variants, monochrome variants, or small fragments. Resume and Work should remain primarily typographic; project imagery should favor real diagrams, screenshots, architecture illustrations, or restrained environmental fragments rather than unrelated cinematic backgrounds.

The current generated site mockup is an art-direction reference, not a final production asset or a requirement to reproduce every depicted scene.

#### Preferred sourcing order

Use a hybrid sourcing strategy, in this order where practical:

1. **Self-photographed environments** for the most personal and defensible visual identity. Ordinary locations can work when they provide empty space, repetition, rain, weak artificial light, or anonymous transitional architecture.
2. **Bespoke generated environmental plates** when a precise composition, text-safe region, weather condition, aspect ratio, or consistent visual family is otherwise difficult to obtain. Generated assets must be reviewed, retouched where needed, and treated as original production inputs rather than unquestioned final output.
3. **Clearly licensed stock photography** from reputable libraries when it provides a strong source image. Candidate free sources may include Unsplash and Pexels, but the license and restrictions applicable at the time of use must be checked and recorded for each selected asset.
4. **Open-license archives** such as Wikimedia Commons or Openverse for textures, architecture, and historical environmental material. Asset-specific attribution, ShareAlike, or other license obligations must be followed.

Do not use actual *Silent Hill* screenshots, official concept art, fan art, Pinterest or Tumblr reposts, random image-search results, or wallpaper collections with unclear rights as production assets. Those sources may inform a private mood board only. The goal is emotional similarity, not visual copying or franchise imitation.

#### Art-direction and finishing workflow

Regardless of source, environmental images should pass through one consistent finishing workflow:

```text
Source image
    -> composition crop
    -> distraction, logo, plate, and unintended-text cleanup
    -> restrained desaturation
    -> blue-green shadow grade
    -> controlled fluorescent or sodium highlight
    -> contrast and fog or dirty-glass treatment
    -> subtle grain
    -> responsive exports
```

The treatment should create a coherent visual family without making the page unreadable. Text-safe gradients and overlays may be used to protect content contrast, but most color grading should be baked into the exported asset instead of relying on expensive real-time filters. The final site should still feel complete when an image fails to load or is intentionally omitted.

#### Rights and provenance

Maintain a small source-of-truth asset register in the repository. At minimum, record:

- asset filename and purpose;
- source and creator;
- license or ownership basis;
- original source reference;
- whether generative tools were used;
- material edits or derivatives created;
- any attribution or disclosure requirement.

No asset should enter production with unknown provenance. Generated environmental artwork should be disclosed where appropriate and must not be represented as traditional photography created by Zeus if it was not.

#### Responsive delivery and performance

- Prefer AVIF with WebP fallback where supported by the implementation.
- Generate multiple responsive widths rather than serving one oversized source to every device.
- Create a deliberate mobile crop instead of relying only on desktop center-cropping.
- Declare intrinsic dimensions or aspect ratios to prevent layout shift.
- Eagerly load only the actual above-the-fold hero asset when testing confirms it is part of the Largest Contentful Paint path.
- Lazy-load below-the-fold imagery.
- Avoid launch-time looping background video.
- Avoid large unoptimized images and continuous runtime filter effects.
- Ensure the hero and all professional content degrade cleanly to the Fogbound Institutional background and remain understandable without imagery.

Exact images, export widths, quality settings, and file-size budgets will be tuned during implementation against real layouts and performance measurements.

### Responsive breakpoints

Use a small set of content-driven breakpoints rather than device-specific layouts:

| Token | Width | Expected change |
|---|---:|---|
| Base | Below `36rem` | Single-column mobile layout |
| Small | `36rem` / `576px` | Horizontal CTA groups when space permits |
| Medium | `48rem` / `768px` | Tablet navigation and simple two-column regions |
| Large | `64rem` / `1024px` | Full desktop navigation and asymmetric grid |
| Extra large | `80rem` / `1280px` | Larger gutters and full shell width |
| Wide | `96rem` / `1536px` | Additional environmental space, not wider prose |

Responsive rules:

- Mobile should be designed intentionally rather than treated as compressed desktop.
- Do not hide professional information at narrow widths.
- Do not introduce horizontal overflow as an atmospheric effect.
- Large widths should gain negative space rather than longer line lengths.
- Prefer intrinsic layout, CSS Grid, and flexible sizing over excessive breakpoint-specific overrides.
- Container queries may be introduced for components when they solve a demonstrated layout problem.

### Motion timing

Motion should feel quiet, deliberate, and slightly delayed without becoming sluggish.

| Token | Value | Intended use |
|---|---:|---|
| Instant | `0ms` | Reduced-motion replacement and immediate state changes |
| Press | `80ms` | Mechanical pressed feedback |
| Fast | `120ms` | Underlines, border changes, and small icon movement |
| Interaction | `180ms` | Hover and focus surface transitions |
| Standard | `240ms` | Navigation opening and compact layout changes |
| Deliberate | `420ms` | Rare professional section reveals |
| Scene | `700ms` | Reserved for later immersive scene transitions |

Provisional easing:

```css
--ease-out: cubic-bezier(0.16, 1, 0.3, 1);
--ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
```

Motion rules:

- Professional-page movement should generally remain within `4px` to `8px`.
- Prefer opacity, border, and minor positional changes over large transforms.
- Avoid bounce easing, spring-like controls, large zooms, spinning elements, continuous floating, scroll-jacking, and professional-page parallax.
- No content may become understandable or reachable only after animation.
- Under `prefers-reduced-motion: reduce`, remove spatial entrances, parallax, continuous decorative motion, and smooth scrolling while preserving clear state changes.

### Interaction states

#### Focus

- Use `:focus-visible` rather than indiscriminately styling all pointer clicks.
- Use an approximately `2px` Focus Light outline with a `3px` offset.
- Where backgrounds vary, use a dark separator plus a pale outer focus ring.
- Never remove the browser focus indicator without supplying an equally visible replacement.

Provisional pattern:

```css
:focus-visible {
  outline: 2px solid var(--color-focus);
  outline-offset: 3px;
}
```

#### Hover

- Hover should clarify affordance rather than create spectacle.
- Text links should brighten, retain or gain an underline, and may adjust underline offset slightly.
- Buttons should brighten their border or surface without scaling.
- Clickable cards may strengthen their border and shift no more than `1px` to `2px`, if they move at all.
- Noninteractive surfaces must not display misleading hover behavior.
- Hover-specific effects should be restricted to devices that actually support hover.

#### Active and current

- Pressed controls may translate downward by approximately `1px`, darken slightly, and reduce their elevation for approximately `80ms`.
- Current navigation should use `aria-current="page"` plus a persistent visual indicator.
- Current-location styling and momentary pressed styling should remain distinct concepts.

#### Visited

- Contextual text links may use Memory Violet to indicate visited destinations.
- Do not apply visited styling to primary navigation, buttons, card containers, or primary calls to action.

#### Disabled

- Use dedicated disabled background, border, and text tokens rather than applying very low opacity to an entire control.
- Remove hover and active responses.
- Preserve the control’s recognizable shape and label.
- Use the semantic `disabled` attribute where available.
- Use `cursor: not-allowed` only where it improves clarity.

Provisional disabled values:

| Token | Value |
|---|---:|
| Disabled surface | `#111515` |
| Disabled border | `#2A302E` |
| Disabled text | `#656B68` |

#### Error, warning, and success

- Status must never be communicated by color alone.
- Pair status colors with explanatory text and, where useful, an icon or boundary change.
- Form errors should be associated programmatically with their corresponding fields.
- Error styling should use muted rust rather than bright alarm red unless testing shows stronger contrast is required.

### Pillar 3.1 decision checkpoint

This subsection is considered sufficiently defined for implementation planning when:

- the Fogbound Institutional direction is accepted as the provisional visual baseline;
- typography roles and fallback strategies are clear;
- semantic color, spacing, width, geometry, layer, breakpoint, motion, and interaction tokens are identified;
- the environmental imagery strategy, sourcing hierarchy, rights record, finishing workflow, and responsive delivery rules are documented;
- the system maintains recruiter readability and WCAG 2.2 AA as nonnegotiable constraints;
- later fog, grain, distortion, immersive modes, and React-experience styling remain clearly outside this subsection;
- the team understands that exact values may be tuned against real components during Pillar 3.

### Implementation progress (2026-09-26)

The current checkout contains the initial Fogbound Institutional foundation:

- `src/styles/global.css` defines semantic dark colors, typography roles and scale, spacing, widths, geometry, motion, layers, and interaction-state tokens. It documents the dedicated portrait-only `37.5rem` navigation threshold alongside the general layout breakpoint scale.
- `src/styles/shell.css` uses the new type and spacing tokens for shared page rhythm. `BaseLayout.astro` imports `src/styles/fonts.css`, which declares local WOFF2 faces for Source Serif 4, IBM Plex Sans, and IBM Plex Mono. The required Fontsource packages are declared in `package.json` and locked; font license notices are under `public/fonts/licenses/`.
- The professional routes remain Astro-first. Shared navigation, the skip link, and the semantic main-content target remain in place. Page-specific hero and reusable pattern styling belong to later Pillar 3 subphases.

Font delivery passed a clean `npm ci` and `npm run build` in a temporary checkout using Node 22.22.3 on 2026-09-26. The build emitted six local WOFF2 assets for the declared faces. The visual foundation was accepted by the user. The main checkout still contained empty discovered test files, so its full validation result is recorded with the 3.2 repair below rather than attributed to the 3.1 checkpoint.

### Completion record

The user reviewed the visual foundation and accepted it on 2026-09-26. Font delivery passed a clean production build. The complete repository validation gate passed at the 3.2 test-repair checkpoint. A later formatting variance and its 3.6 resolution are recorded below. **Pillar 3.1 is complete.** Deeper responsive, keyboard, 200% zoom, contrast, and layout-stability checks remain part of 3.4 and the final 3.6 gate.

## 3.2 Style the shared site shell

**Status: Complete — shared presentation accepted across later visual reviews**

Apply the visual foundation to the shared professional interface:

- header;
- primary navigation;
- mobile navigation;
- footer;
- page containers;
- common links, buttons, and calls to action.

The shared shell should feel production-quality before specialized pages are implemented.

### Implementation progress (2026-09-26)

- Applied Fogbound Institutional typography and surfaces to the shared header, primary navigation, compact portrait navigation, footer, and floating skip link. Current-page navigation has a persistent surface and border marker; the native mobile disclosure and established portrait-only breakpoint remain intact.
- Added a restrained divider to each shared `.page` header while retaining the existing readable container width and section rhythm.
- Compared action links across Home, Resume, Work, About, and Contact, then styled those existing cross-route lists with one shared `page-actions` class. Links retain anchor semantics, gain a minimum 44px target, and wrap as space allows. A generic button component remains unnecessary until a real button use case exists.
- Checked representative new text and state color pairs: header navigation 10.11:1, selected navigation 11.20:1, footer metadata 6.95:1, and pressed interaction text 4.98:1. Broader contrast and responsive audits remain in 3.4.
- Restored the missing site configuration and Astro Container shell tests, added a professional-route isolation guard, and moved the future `/experience` browser spec to a non-discoverable TODO note. `vitest.config.ts` now loads Astro's Vite configuration for component rendering. The user-accepted empty `experience.astro` route was left untouched.
- The complete `npm run validate` gate passed at the earlier 3.2 test-repair checkpoint with Node 22.22.3: formatting, linting, Astro/TypeScript checking, 32 tests, and the production build. At later styling checkpoints, `format:check` stopped on the untracked plan and supplied handoff. Pillar 3.6 resolved this by excluding only those two documents from Prettier; the current full validation gate passes. For the main-start marker correction, all changed source and test files pass targeted Prettier; lint, Astro/TypeScript checking, all 34 tests, and the production build pass separately.
- At the user’s request, removed the static `tabindex="-1"` from the shared `<main>` and the redundant JavaScript focus call. The skip link remains a native `href="#main-content"` anchor; browser verification of the next keyboard Tab starting point at the main region remains in 3.4 and 3.6. The shell integration test now checks that the rendered main has no `tabindex` while preserving the skip-link target.
- Corrected the initial floating skip-link trigger after confirming that observing the entire long `<main>` kept it hidden on ordinary page lengths. A 1px, `aria-hidden` marker was added at the start of main content. The later 3.4/3.6 zoom review replaced the marker-only observer rule with visual-viewport and main-heading geometry: the button can appear when meaningful main content is below the fold, after scrolling, or on keyboard focus, while avoiding visible header controls. The native fragment link and no-`tabindex` main contract remain unchanged.
- The user repeatedly approved the site presentation during the 3.3–3.5 visual reviews, including the shared shell. **Pillar 3.2 is complete.** Formal responsive, keyboard, 200% zoom, and layout checks remain in 3.4 and 3.6.

## 3.3 Establish reusable interface patterns

**Status: Complete — shared patterns accepted after visual review**

Create the small set of presentation patterns needed across the site, such as:

- section headings;
- content and project-summary cards;
- metadata rows;
- call-to-action groups;
- technology or status labels;
- honest incomplete-content states where a later pillar has not yet been implemented.

### Recorded decisions

- Build only patterns with a demonstrated use in the portfolio.
- Do not turn the site into a generic component library or design-system product.
- Shared patterns should remain usable without unnecessary client-side JavaScript.

### Implementation progress (2026-09-26)

- Added `src/styles/patterns.css` and loaded it through `BaseLayout.astro`. It defines three repeated patterns: a restrained metadata eyebrow, a readable introductory lede, and an honest incomplete-content section with a vertical rule rather than a card enclosure.
- Applied the eyebrow and introduction classes to Home, Resume, Work, About, and Contact. Applied the incomplete-state class to the four existing placeholder sections. Existing copy, headings, route-specific class hooks, and accessibility attributes remain intact.
- The cross-route action links already use the shared `page-actions` pattern from 3.2. Project cards, metadata rows, technology labels, and form patterns await real content that demonstrates their use; no placeholder components or client-side JavaScript were added.
- Targeted Prettier for all changed source files, lint, Astro/TypeScript checks, all 34 tests, and the production build pass with Node 22.22.3. The earlier reference-Markdown formatting caveat was resolved during 3.6; the current full validation result is recorded there.
- Contact page visual review revealed that the incomplete-state top rule repeated the page-header divider, leaving two horizontal lines around an empty band. Changed the shared incomplete-state pattern to use a vertical rule beside its content; this also corrects the same pattern on Resume, Work, and About.
- The user reviewed the corrected incomplete-state presentation on 2026-09-26 and accepted it. **Pillar 3.3 is complete.** Patterns without real content remain deferred to their respective feature pillars.

## 3.4 Refine interaction and responsive behavior

**Status: Complete — interaction and responsive behavior accepted after browser verification**

Define and verify behavior across:

- desktop, tablet, and mobile layouts;
- keyboard and pointer navigation;
- touch devices;
- browser zoom and responsive text;
- reduced-motion preferences;
- visible and consistent interaction states.

Accessibility is part of the professional UI system rather than a later cosmetic addition.

### Implementation progress (2026-09-26)

- Reviewed shared CSS for narrow-width and enlarged-text behavior. The header identity and native menu control can wrap when they cannot share a row, with the menu end-aligned. After user review at 600–767px, the compact menu now appears below `48rem` (`768px`) in both orientations; the full navigation begins at `48rem`. This user-directed revision supersedes the earlier portrait-only breakpoint in the Pillar 2 and 3.1–3.2 checkpoints.
- Increased the header identity link and footer navigation link targets to at least 44px high, with a 44px minimum inline size for footer links. Added footer end padding to give the fixed skip link clearance from the final content row.
- Gave the footer navigation a distinct accessible label instead of announcing both visible navigation landmarks as “Primary”; the shell integration test now checks the labels. Existing focus-visible, hover, active, and reduced-motion treatments remain in place. Component-specific visited, error, success, and disabled treatments await live content or controls that use those states.
- Targeted formatting, lint, Astro/TypeScript checking, all 34 tests, and the production build pass with Node 22.22.3. The earlier reference-Markdown formatting caveat was resolved during 3.6; the current full validation result is recorded there.
- The user accepted the earlier 3.4 presentation on 2026-09-26, then reported responsive issues at 600–767px, 599px, 511px, below 100px, and 200% browser zoom. The full header navigation now gives way to the compact menu below 768px. Footer links wrap in centered rows at every width; narrow `page-actions` rows center below 36rem. Local Edge measurements confirm the compact menu through 767px, the full menu at 768px, centered footer rows at 320px, a centered final action at 511px, and no horizontal overflow at the tested widths from 320–768px. The skip link now responds to visual-viewport, main-heading, scroll, and visible-control geometry. It uses shorter visible labels on short landscape and very narrow screens while keeping the same accessible name. Production Edge confirmed a visible floating link at 320×200 when the heading is below the fold, a 49×44px link fully inside the visual viewport at true 90px width after scrolling, and a focused keyboard link even when the pointer state is hidden. The open compact menu suppresses the floating link to prevent overlap. The page as a whole still has 201px intrinsic document width at a 90px viewport; that extreme-width page reflow is outside the skip-link fix. The user reviewed the responsive changes on 2026-09-26 and accepted them. **Pillar 3.4 is complete.**

## 3.5 Establish page presentation templates

**Status: Complete — landing and informational templates accepted after visual review**

Create the reusable visual structures that later pillars can use for:

- landing-page sections;
- standard informational pages;
- long-form professional content;
- resume sections;
- case-study pages;
- form layouts.

This step defines the presentation framework only. It does not complete the Resume, Work, or Contact experiences.

### Implementation progress (2026-09-26)

- Added a Home landing layout within the shared shell: the page can use the full shell width, while its actual text and actions remain in a readable left column. At desktop widths, the content occupies six of twelve grid columns and leaves intentional empty space. Tuned the responsive hero type token and retained the existing Home copy and links.
- Narrowed the shared page-section spacing selector to direct sections so future nested long-form or case-study sections can define their own rhythm without inheriting page-level spacing.
- Extracted the repeated informational header into `PageIntro.astro` for About, Resume, Work, and Contact. It owns the eyebrow, one `<h1>`, and introductory paragraph while each route still owns its copy, metadata, wrapper element, and following sections. The Home header remains distinct.
- The presentation contract for later long-form, resume, case-study, and form pages is the shared `BaseLayout` shell, readable `.page` width, direct page-section rhythm, and semantic route-owned sections. Wide media may use the existing `--shell-width-wide` token while prose stays narrow. Detailed resume data, project cards, media, and form controls wait for real content and behavior in their later pillars, as the supplied wireframe directs.
- Targeted formatting, lint, Astro/TypeScript checks, all 34 tests, and the production build pass with Node 22.22.3. Inspection of the built Home, About, Resume, Work, and Contact pages confirms one `<h1>`, one introductory paragraph, and the original `div` or `article` wrapper per route. The earlier reference-Markdown formatting caveat was resolved during 3.6; the current full validation result is recorded there.
- The user reviewed the new Home landing composition on 2026-09-26 and accepted it. **Pillar 3.5 is complete.** Specialized resume, case-study, and form presentation details remain assigned to the feature pillars that supply their real content.

## 3.6 Verify the professional UI system

**Status: Complete — browser, repository, and visual checks accepted**

Pillar 3 should satisfy the following checks:

- the site no longer resembles an unfinished wireframe;
- the shared professional interface is visually coherent;
- typography and content hierarchy are clear;
- desktop and mobile layouts work;
- keyboard focus is visible and navigation remains usable;
- contrast and zoom behavior are acceptable;
- reduced-motion preferences are respected;
- no major layout instability is introduced;
- formatting, linting, type checking, tests, and production build pass.

### Verification progress (2026-09-26)

- Added exact Prettier exclusions for the supplied design handoff and living implementation plan. This resolves the earlier reference-Markdown formatting blocker without reformatting the supplied documents. The final `npm run validate` gate passes on the current source with Node 22.22.3: formatting, linting, Astro/TypeScript checking (zero issues), all 35 tests, and the production build.
- Calculated contrast for active body, heading, metadata, link, navigation, focus, and control-border pairs. All sampled text pairs exceed 4.5:1, including the lowest pressed-navigation pair at 4.98:1; focus and control-border samples exceed 3:1. Decorative rules are nonessential.
- Inspected the built Home, About, Resume, Work, and Contact pages: each has one main landmark, one `<h1>`, and one page frame; no Astro islands, remote assets, incomplete links, or undimensioned images were found. Source review confirms native compact navigation, visible focus styling, reduced-motion handling, and minimum 44px primary interaction targets.
- Replaced the interim marker-only skip-link observer after the 200% zoom report. The current geometry rule reveals the floating link when the main heading is effectively out of view, when the main-start marker leaves the visual viewport, or after 48px of scrolling; it avoids visible header controls and the open compact menu. Keyboard focus remains an independent visibility path. Unit tests cover below-fold, above-fold, horizontal visual-viewport offset, modest scrolling, menu state, and header overlap; the shell integration test checks that each responsive visible label remains within the accessible name.
- Local Edge checks confirm keyboard traversal of the native skip link into main content, touch and keyboard operation of the compact disclosure, and reduced-motion transition removal. Exact-width measurements confirm no horizontal overflow at 320, 511, 599, 600, 767, and 768 CSS pixels; the updated footer and action rows center when they wrap. Production Edge checks confirm the floating link at a 320×200 CSS-pixel viewport (the reflow equivalent of a 640×400 window at 200% zoom), the compact link inside a true 90px visual viewport after scrolling, and focus visibility regardless of pointer state. With cache disabled and a throttled font connection on the production build, Home and Contact at 320px each recorded zero layout-shift entries while used fonts loaded. The user accepted the final responsive presentation on 2026-09-26. **Pillar 3.6 is complete.**

## Excluded from Pillar 3

- final resume content and resume artifact generation;
- completed Work case studies;
- contact-form backend behavior;
- fog, film grain, environmental decay, dreamlike transitions, or immersive modes;
- the optional React psychological-horror experience;
- Czech localization.

## Pillar 3 completion condition

Pillar 3 is complete when the site has a polished, restrained, responsive, and accessible professional interface that future feature pillars can extend without inventing unrelated visual rules. The site should no longer look like a wireframe, but the later atmospheric layer should still be absent.

**Completion recorded 2026-09-26:** The user accepted the final responsive presentation. The 3.6 browser checks and full repository validation gate passed, so all Pillar 3 subphases are complete.

---

# Future Pillar Roadmap

The following order records the current agreed direction. Each future pillar will be discussed and expanded before implementation rather than treated as a complete engineering specification now.

## Pillar 4: Resume System and Recruiter Experience

**Status: In progress — 4.1, 4.3, and 4.4 complete; 4.2 local source integrated, with hosted access and 4.5 final verification pending**

Create the canonical resume content model and derive a complete HTML resume, print presentation, downloadable PDF, and relevant structured metadata from it.

### Recorded direction

- The canonical resume will be schema-constrained Markdown stored in a separate GitHub content repository and edited primarily through Obsidian.
- The portfolio will consume that content at build time rather than fetching it during visitor requests.
- The application repository will own validation, transformations, rendering, print behavior, and PDF generation.

### Planning progress (2026-09-26)

- Prepared `docs/resume-authoring-schema.md` as a proposed v1 contract for one `resume.md` in the separate content repository. It uses a small YAML header for public contact fields and exact Markdown headings and labels for summary, experience, skills, and optional projects, education, and certifications. It permits year-only dates when months are unknown and instructs the author to omit invented or private claims.
- At this point, the proposed next step was a pinned build-time content contract and app-owned validation before implementing HTML, print, PDF, and metadata outputs. The user later chose the branch-following build contract recorded below. The public Resume page and renderer remained unchanged.

### Resume content progress (2026-10-04)

- Created `docs/resume-draft.md` from the employment screenshot using the v1 authoring structure. It records two Finys roles and two General Motors roles, the screenshot's month dates and role-specific locations, and the two visible Junior Associate Programmer accomplishments. The twelve visible General Motors DevOps bullets are preserved in `docs/resume-screenshot-source-notes.md`; the draft now focuses on three platform examples chosen by the user.
- The user confirmed `Platform Engineer` as the headline and supplied LinkedIn and GitHub as the only public contact links for now. A two-sentence summary based on the supplied facts is drafted for author voice review. Selected Projects, Education, and Certifications are omitted at the user's request; projects can be added later.
- The Finys Software Engineer role ended in September 2026 when the Lead role began. The earlier role records assistance migrating more than 30 clients and their repositories, work items, area paths, iteration paths, and related data from TFS to Azure DevOps and Git. Its qualitative outcomes are easier teamwork, quicker delivery, and more efficient workflows; no time-savings metric was supplied. The Lead role records the ongoing search for a standardized pipeline approach and a created YAML step that moves work items between states during releases.
- The three selected General Motors DevOps examples are a Python Sphinx documentation extension, AEM content synchronization automation using Bash and GitHub Actions, and contribution to a visual site regression tool. The draft limits the last example to contribution because no implementation details were supplied.
- The user reviewed the current draft on 2026-10-04 and accepted it. The draft remains unpublished until the Pillar 4 content integration and resume presentation are implemented. No resume renderer or public page was changed. The screenshot's relative tenure counters, unnamed “+22 skills,” and content cropped after the second Junior Associate Programmer bullet were not treated as canonical facts.

### Pillar 4 implementation sequence

1. **4.1 — Validate the authoring contract.** Turn the v1 Markdown rules into an app-owned, typed parser with useful line-numbered errors. Cover required and optional sections, field order, dates, contact URLs, unsupported syntax, and bracketed prompts. Validate the accepted draft locally; committed tests use synthetic content, and the draft is not a production fallback.
2. **4.2 — Follow the vault branch head and load the external source.** The user identified the private `zgildo01/Zeus-Vault` repository as the content source and confirmed canonical `resume.md` is at the repository root. At the start of each hosted build, resolve the configured remote branch, currently `master`, to one full commit SHA, then retrieve and validate only `resume.md` at that resolved revision using read-only build credentials. Record the resolved SHA for build traceability; keep no hardcoded source commit in the application contract. An explicit local preview resolves the same branch in the sibling checkout and reads that commit's file. Fail the build if the branch, file, or content is missing or invalid; production must not silently use the app repository draft. Local page wiring is complete; hosted authentication and CI verification remain to be established.
3. **4.3 — Render the recruiter-facing page.** Replace the `/resume` placeholder with accessible HTML generated from the validated model. Present experience, skills, and the approved public contact links using the existing page shell and typography; omit optional sections until authored. Derive relevant page metadata from the same model.
4. **4.4 — Deliver print and PDF.** Build a light, legible US Letter print stylesheet that exposes contact destinations, and a downloadable PDF from the same validated resume content, with working links and consistent section order. Generate the PDF from the built `/resume` HTML after Astro finishes, so the HTML and PDF use the exact same validated source revision without a second vault read. Make PDF generation part of the required production build. Show the download link only when the PDF is produced by that build.
5. **4.5 — Verify the complete system.** Test valid and invalid content, resolution of the selected moving branch with one exact revision per build, HTML and PDF content parity, responsive and print layouts, link behavior, accessibility, and a clean production build. Pillar 5 will then automate publishing for content-only changes.

### First implementation slice (2026-10-04)

- **4.1 complete:** Added an app-owned TypeScript parser and typed resume model for the v1 Markdown contract. It reports line-numbered validation errors for frontmatter, exact section and field order, required entry content, dates, links, unsupported syntax, and template prompts. Optional projects, education, and certifications are supported when authored. The approved draft parsed successfully in a local check; committed unit tests use synthetic content so the app repository does not depend on the private vault or an untracked draft.
- **4.2 partial:** Added a build-only GitHub Contents API reader for one file at a full commit SHA. It accepts an injected read credential, returns UTF-8 Markdown, and keeps private response data and credentials out of errors. The user confirmed the private vault root file `resume.md`. Its committed content at `8cc9ae97713b0075e02a6f2162cb192e71aefce4` has no local changes and passed the v1 validator. That full revision was pinned in `src/config/resumeContentSource.ts` at this checkpoint. At this checkpoint, the page had not yet been wired to the reader; hosted builds would also need authenticated access to the private vault. The `.gitignore` now excludes `.env` variants used for local credentials.
- Targeted formatting, lint, Astro checks, all 71 tests, and a production build pass on Node 22.22.3. The repository-wide formatting command still flags pre-existing formatting in this long-form plan and the Pillar 3 handoff; no unrelated document-wide reformat was applied. The `/resume` route remained a placeholder at this checkpoint, before the validated private source was connected.

### Private source connection progress (2026-10-04)

- Added `loadValidatedResume()` to compose the pinned source and v1 parser. At this checkpoint, its GitHub mode fetched only `resume.md` at the configured commit with an injected credential. Its explicit local mode read `resume.md` from that same Git commit with `git show`, so later vault edits or a newer checkout HEAD could not alter the selected version. Neither mode falls back to the app repository draft.
- Synthetic tests cover the local and GitHub modes, missing credentials, missing pinned content, invalid Markdown, and GitHub's line-wrapped Base64 responses. A one-off local check loaded and validated the actual sibling `Zeus-Vault` file at the pinned commit without printing its contents. Added `.env.example` with names only; `.env` variants remain ignored.
- At this checkpoint, the next planned connection was to call the pinned loader from the static `/resume` page when its renderer was built. Locally, `RESUME_VAULT_DIR=../Zeus-Vault` identifies the sibling checkout; hosted builds need an unprefixed `RESUME_CONTENT_TOKEN` from the build secret store with read access to the private vault. The portfolio repository's default GitHub Actions token does not cover a sibling private repository. The current public page and production build remained unchanged.

### Source revision decision (2026-10-04)

- The user asked to follow the vault branch head instead of a hardcoded commit SHA, referring to `main`. The vault currently uses `master` as its default branch, so the implemented source follows `master` for now. Each build resolves the configured branch once and uses that full SHA for all resume reads and outputs. Recording the SHA preserves traceability without requiring a source-code edit whenever the vault changes.
- The implemented hosted loader resolves the configured remote branch through authenticated GitHub access. Local preview resolves that branch in the sibling checkout, so it reflects the checkout's branch state; syncing the checkout is a separate action. Both modes validate committed `resume.md` and fail on missing or invalid content rather than falling back to a draft or uncommitted working file.
- The earlier pinned loader and its tests remain recorded above as historical progress. The branch-following implementation is recorded below. The real local source read and `/resume` page wiring are now verified; complete 4.2 after hosted credential and CI verification. If the vault branch is renamed to `main`, update the configured branch at the same time.
- The site is statically built: a vault commit becomes visible on the deployed portfolio after a successful rebuild and deployment. Pillar 5 must trigger that pipeline for valid changes to the selected vault branch and keep the previous deployment when validation or build fails.

### Branch-following loader progress (2026-10-04)

- Replaced the configured commit pin with a branch name, initially `main`, then `master` to match the vault's current default branch. GitHub mode resolves that branch to a full commit SHA before requesting `resume.md` at the exact SHA. Local mode resolves the matching local branch to a commit SHA before reading that commit's file. The loader returns the validated resume and `sourceCommitSha` so a build can record the selected revision.
- Synthetic tests cover a branch advancing between builds, one exact revision per build, and error paths. The 23 focused source tests and all 88 repository tests pass. At this checkpoint, the page had not yet been wired to the loader, so the production build still used the placeholder resume page.
- A direct `git ls-remote --symref origin HEAD refs/heads/main refs/heads/master` check confirmed the private remote's `HEAD` points to `refs/heads/master`, `master` is at `8cc9ae97713b0075e02a6f2162cb192e71aefce4`, and no `main` ref exists. The sibling checkout also has local `master`. The portfolio now follows that existing `master` branch. The user's original `main` wording remains a branch-name clarification; a future vault rename to `main` would also require updating the configured branch. No vault branch rename was performed.

### Resume build and page progress (2026-10-04)

- Added an explicit build-source selector. A local build uses `RESUME_VAULT_DIR`; a hosted build uses `RESUME_CONTENT_TOKEN`. Missing both or providing both fails with a clear error, so there is no silent source fallback. This workspace now has an ignored `.env` pointing to the approved sibling vault for ordinary local development; `.env.example` documents the setting without a credential.
- Wired `/resume` to the validated loader. It now renders one page heading, the summary, experience, skills, public contact links, and optional projects, education, and certifications only when present in the model. The page title and description come from that model. Inline narrative Markdown uses `micromark` with dangerous HTML and protocols disabled. The selected source SHA is logged during the build and is not rendered into the page.
- A local production build succeeded from the sibling vault's committed `master` revision `8cc9ae97713b0075e02a6f2162cb192e71aefce4` and logged that source SHA. An audit of the generated HTML found one main landmark and one `<h1>`, Summary, Experience, Skills, and Contact, the approved LinkedIn and GitHub domains, and no placeholder text or vault SHA. This verifies the local path; the hosted token and CI path have not been configured or exercised.
- The full `RESUME_VAULT_DIR=../Zeus-Vault npm run validate` gate passes: repository formatting, ESLint, Astro check with zero issues across 44 files, all 98 tests across 11 files, and the local production build. The supplied long-form implementation plan and Pillar 3 handoff are now excluded from Prettier to preserve their authored formatting while keeping source files in the gate.
- The user reviewed the web resume and accepted the presentation apart from a Home-heading size mismatch. Removed the Home-only hero type override and its now-unused token, so Home uses the same page-title scale as Resume and Work. Built-site Edge screenshots at 1024px and 1150px show the name on one line at the shared scale. **4.3 is complete.** Print styling and a downloadable PDF remain assigned to 4.4; hosted content publishing remains a Pillar 5 task. Pillar 4 is still in progress.

### Print and PDF completion (2026-10-04)

- **4.4 complete:** Added a light US Letter print layout with readable page breaks and visible public contact destinations. The downloadable PDF is generated with Playwright Chromium from the already built `/resume` HTML through a temporary local server. The build uses the same validated vault revision for HTML and PDF without a second vault read, and `npm run build` requires PDF generation to succeed. The production-only download link points to the generated artifact.
- The final PDF fits on one US Letter page with a compact print-only skills list, 0.5-inch vertical margins, and 10-point body text; it passed visual review. All 45 selected resume content nodes from the HTML appear in the PDF; both contact-link annotations have the expected destinations. The page's download label is excluded from the PDF.
- The full `npm run validate` gate passes, including formatting, lint, Astro check with zero diagnostics, all 98 tests, and the production PDF build. Hosted vault credentials and verification remain open in 4.2; 4.5 still owns final accessibility, responsive, link, and failure-behavior checks. Pillar 5 still needs CI browser setup for automated deployment.

### Preview PDF route correction (2026-10-04)

- The user found that the PDF link in `npm run preview` returned 404. Inspection showed production resume HTML in `dist/resume/index.html` but no PDF alongside it. Astro preview serves the existing build output; it does not create the PDF. A direct `astro build` could previously replace `dist/` without running the `npm run build` PDF step.
- Moved PDF generation into Astro's `astro:build:done` hook, using the output directory supplied by Astro. Both direct `npx astro build` and `npm run build` now generate the PDF once from the completed HTML. A direct Astro build succeeded, and the running preview server returned HTTP 200 with `application/pdf` for `/resume/Zeus-Zaragoza-Resume.pdf`. The required browser dependencies remain documented in the README.

## Pillar 5: CI/CD and External Content Publishing

**Status: In progress — Obsidian-to-vault sync is established; hosted vault sourcing and dispatch remain unverified; Cloudflare Workers deployment is not configured**

Automate validation, builds, artifact generation, and deployment for both application-code changes and external content-only changes.

### Recorded direction

- Each build should resolve the selected content-repository branch once, use that exact commit revision throughout the build, and record it for traceability; the application should not carry a hardcoded source SHA. The branch is currently configured as `master`, matching the vault's current default branch.
- A valid content-only change should be able to trigger a portfolio deployment.
- Invalid content or a failed build must not replace the last successful production deployment.
- The original architecture selects Cloudflare Workers: prerendered static site assets, with a Worker handling the future contact endpoint. Start on the free deployment address; use protected `main` for production after the site work is merged. Complete and verify the private vault → hosted portfolio build path before wiring deployment.

### Implementation progress (2026-10-10; corrected 2026-10-17)

- The user approved moving to Pillar 5 while hosted access under 4.2 and final checks under 4.5 remain open. Those checks are still required before calling Pillar 4 or a production release complete.
- The public portfolio repository currently has `main` as its GitHub default branch, while the completed site code is on `develop` and this work is on `feature/automated-builds-and-publishing`. `main` is still at the initial commit. Both new workflow files remain untracked local files, so they cannot run on GitHub yet.
- Added a portfolio GitHub Actions workflow that runs formatting, lint, Astro checks, and tests on pull requests without the private vault credential. Trusted pushes to `develop` or `main`, plus manual and `resume_changed` dispatch runs, are prepared to install Playwright Chromium with Linux dependencies, build the site and PDF using a read-only `RESUME_CONTENT_TOKEN`, verify the PDF file, and upload `dist/` as a build artifact. It does not deploy and has not run on GitHub.
- Added a local workflow to the sibling private `Zeus-Vault` checkout for committed `master` changes to root `resume.md`. It sends a `resume_changed` repository dispatch with the vault commit as diagnostic payload. The portfolio build still resolves the vault branch head at build time; the payload does not pin content. Activation requires a separate portfolio-scoped `PORTFOLIO_DISPATCH_TOKEN` secret in the vault, the read token in the portfolio, and the receiving workflow on the portfolio's default branch. The user reports that both repository Actions secrets are now configured; their presence and function remain unverified from this workspace.
- Added the missing `.env.example` referenced by the README and documented the two repository secrets and activation order. No remote deployment or repository-setting change was made.
- An interim GitHub Pages target was prepared locally on 2026-10-10. The user corrected the target to Cloudflare on 2026-10-17 and clarified that the portfolio has only consumed vault content through its local sibling checkout. The GitHub Pages artifact and deployment job, along with Pages-specific build URL settings, were removed. No GitHub Pages site was deployed.
- The supplied original architecture resolves the Cloudflare product choice to **Workers**, not Pages. Its single-repository resume sketch predates the later approved private `Zeus-Vault` source and does not undo that decision. The original PR gate also includes a build, accessibility checks, link checks, and E2E smoke tests, with preview deployments desirable; the current local workflow has only formatting, lint, Astro checks, and tests on PRs. Those additional gates remain open.
- The user confirmed on 2026-10-17 that Obsidian already commits and pushes to `Zeus-Vault` as part of their established journaling workflow. Do not treat that connection as an open test. The remaining integration begins with the hosted portfolio build reading the private vault and the vault workflow notifying the portfolio of resume changes.
- Earlier on 2026-10-17, the user clarified that `RESUME_CONTENT_TOKEN` was only in the portfolio's ignored local `.env`. The user subsequently reported placing `RESUME_CONTENT_TOKEN` in `astro-portfolio` repository Actions secrets and `PORTFOLIO_DISPATCH_TOKEN` in `Zeus-Vault` repository Actions secrets. The current local `.env` contains only the `RESUME_VAULT_DIR` key, matching the selected local source; no token value was read or recorded. Secret names and permissions have not been independently verified on GitHub.
- The optional Astro site/base settings and matching link and PDF-server handling remain generic and default to `/`; they do not configure a host or publish the site. The `/experience` file was left unchanged as requested.
- Local `master` in `Zeus-Vault` and the remote `master` ref both resolve to `8cc9ae97713b0075e02a6f2162cb192e71aefce4`, and root `resume.md` is committed. Portfolio local builds still read the sibling checkout via `RESUME_VAULT_DIR`; the hosted GitHub API mode has not been exercised with a build secret.
- A local prefixed-path production build and preview passed as an exploratory routing check, but that path is not the Cloudflare release URL. The full root-mode `npm run validate` gate passed on Node 22.22.3 with formatting, lint, Astro check at zero diagnostics, 107 tests, and the production PDF build. Both workflow files parse as YAML, and the vault dispatch shell passes `bash -n`.

### Next integration and release checks

- Commit and push the portfolio workflow with the site code to `develop`, then inspect its trusted `push` run to verify the reported `RESUME_CONTENT_TOKEN` secret reads the private vault branch head, records its SHA, validates `resume.md`, and generates the PDF. For local builds, select either the sibling checkout with `RESUME_VAULT_DIR` or token mode with `RESUME_CONTENT_TOKEN`; `.env.example` never contains a real token.
- Promote the portfolio receiver workflow to default branch `main` when site work is ready, then commit and push the notifier workflow to vault `master`. Verify its manual dispatch reaches a portfolio Actions run; a subsequent real change to root `resume.md` should exercise the automatic path. Verify that invalid content fails the build. The vault notifier's path filter means adding the workflow alone will not dispatch a resume change.
- After the source chain is proven, configure Cloudflare Workers to serve the validated static build, verify a successful content-only build publishes the expected revision, and confirm a failed build preserves the previous deployment. Add the remaining PR build, accessibility, link, and E2E gates and preview behavior before launch. The contact Worker belongs to Pillar 7. Complete hosted-source and final Pillar 4 checks before marking Pillars 4 or 5 complete.

## Pillar 6: Work and Case Studies

Implement the Work index and complete sanitized professional and personal case-study experiences using structured, source-controlled content.

## Pillar 7: Contact Experience

Implement the accessible contact form and Cloudflare Worker endpoint with server-side validation, Turnstile verification, rate limiting, Resend notifications, and failure behavior without introducing a database.

## Pillar 8: Accessibility, Performance, Security, and SEO Hardening

Apply the project-wide release gates for WCAG 2.2 AA, performance targets, security controls, metadata, link integrity, and production readiness.

## Pillar 9: Artistic Atmosphere and Experience Modes

Add the progressive psychological-horror visual layer and the Professional, Immersive, and Minimal modes without weakening recruiter comprehension or core-site reliability.

## Pillar 10: Optional React Psychological-Horror Experience

### Goal

Implement the isolated `/experience` route as an entirely optional, substantial React project with meaningful interaction, state, accessibility, performance safeguards, and an obvious return path to the professional portfolio. The experience should demonstrate genuine React capability without converting the Astro-first professional site into a single-page application.

### Dependencies

- Pillar 2 must have established the route and repository boundaries.
- Pillar 3 must have completed the professional site's shared UX/UI system.
- Pillar 6 should provide a Work entry through which the experience can be presented as a substantial personal project.
- Pillar 8 must establish the project-wide accessibility, performance, security, and SEO release gates.
- Pillar 9 must define how professional-site atmosphere ends and the isolated interactive experience begins.

### 10.1 Define the experience concept and interaction model

Document the experience before building it:

- emotional and narrative premise;
- expected duration and scope;
- scene or state progression;
- primary interaction verbs;
- keyboard, pointer, and touch behavior;
- whether audio is used and how it remains optional;
- completion, exit, restart, and failure paths;
- reduced-motion and low-capability alternatives.

The experience should be small enough to finish. It should demonstrate meaningful state and component behavior rather than becoming an open-ended game project.

### 10.2 Introduce the isolated React integration

Install and configure React only after the interaction model proves that it is required:

- `react`;
- `react-dom`;
- `@astrojs/react`.

React should remain confined to the `/experience` feature boundary. The professional portfolio must not acquire sitewide hydration or React-owned navigation merely because this route exists.

### 10.3 Implement the Astro route shell

Implement the route shell and optional experience-specific layout in the locations already allocated by Pillar 2.1. The route boundary should own:

- page title and metadata;
- initial semantic HTML;
- the React mount point;
- a useful loading and failure state;
- a non-JavaScript fallback;
- an obvious return-to-portfolio control;
- any route-level accessibility instructions.

Introduce the separate experience layout only when the experience genuinely requires a full-screen or structurally distinct shell. The layout must not hide the exit path or weaken accessibility protections.

### 10.4 Build the feature-oriented React application

Use the feature boundary and corresponding unit, integration, and E2E locations defined by Pillar 2.1. Potential responsibilities include:

- the experience root coordinating initialization, active scene, global settings, and the top-level error boundary;
- bounded scene compositions rather than one monolithic component;
- interaction prompts, dialogue, accessible controls, and pause or settings UI;
- scene progression, discovered clues, branching conditions, and session settings;
- keyboard input, reduced-motion detection, optional audio preferences, and session persistence where justified;
- pure transition, guard, parsing, and state-derivation logic that can be unit tested.

Create only the source and test subdirectories that the final design needs. Unit tests cover pure transitions, guards, parsing, and state derivation. Integration tests cover the React root and feature boundaries using mocked media or browser capabilities. E2E coverage verifies the complete route behavior in a browser.

### 10.5 Add experience-specific presentation and media

Place experience-owned presentation and media in the feature and asset boundaries defined by Pillar 2.1, organizing subdirectories only as requirements emerge.

The experience may use more aggressive distortion, color anomalies, spatial transitions, and psychological-horror presentation than the professional site. It must still avoid copyrighted franchise assets, inaccessible contrast, mandatory audio, uncontrolled motion, and performance-heavy effects without fallbacks.

### 10.6 Implement accessibility, settings, and safe failure behavior

The experience must provide:

- complete keyboard access for required interactions;
- visible focus where conventional controls are present;
- reduced-motion behavior that preserves progress and comprehension;
- optional rather than mandatory sound;
- captions or textual equivalents for meaningful audio;
- understandable controls and instructions;
- an exit path that remains available during normal operation and failure;
- recovery or restart behavior for invalid state;
- a static fallback when the React application cannot initialize.

### 10.7 Integrate optional discovery

After the experience is complete enough to represent honestly:

- add a restrained secondary entry point from Home where appropriate;
- add a Work project card describing the engineering and interaction design;
- keep it out of the five-item primary navigation;
- ensure direct professional links never route through it;
- ensure returning to the professional site does not require completing the experience.

### 10.8 Verify isolation and quality

Pillar 10 should satisfy the following checks:

- `/experience` loads directly and can be exited immediately;
- professional routes remain fully functional when the experience bundle fails;
- professional routes do not download the React experience bundle unnecessarily;
- React state, styles, and errors do not leak into the professional site;
- keyboard, pointer, and touch interactions work where supported;
- reduced-motion and no-audio paths remain complete;
- loading, failure, restart, and non-JavaScript states are usable;
- experience assets are optimized and provenance is documented;
- interaction logic has appropriate unit tests;
- critical route behavior has integration or end-to-end coverage;
- performance remains within the project-wide budgets or has an explicitly justified route-specific exception;
- formatting, linting, type checking, tests, and the production build pass.

### Recorded decisions

- `/experience` is an optional secondary project, not a gate or sixth primary portfolio section.
- Astro owns the route and document boundary; React owns the isolated interactive application inside it.
- React is introduced because the experience requires meaningful component composition, state, effects, and event handling—not merely to place React on the resume.
- The professional site remains understandable and navigable when JavaScript or the experience fails.
- Entry points are added only after the experience is complete enough to avoid advertising an unfinished placeholder.

### Pillar 10 completion condition

Pillar 10 is complete when `/experience` functions as a finished, optional React project that demonstrates real interactive engineering, remains accessible and performance-conscious, exits cleanly to the professional portfolio, and introduces no runtime dependency or reliability regression to the five primary professional experiences.

## Pillar 11: Czech Localization

Add Czech content through language-specific routes after the English experience is stable and production-ready.

## Pillar 12: Production Launch

Complete final launch verification, production deployment, domain readiness, content review, and release checks.

---

# Pillar Decision Record Template

## Goal

Describe the outcome this pillar must produce.

## Major steps

List the small number of implementation stages required.

## Decisions

Record selected approaches, rejected alternatives where relevant, and any architectural constraints.

## Dependencies

Identify which earlier pillars must be complete first.

## Completion check

Define the concise conditions that indicate the pillar is finished.
