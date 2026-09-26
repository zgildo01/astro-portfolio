import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const professionalFiles = [
  "src/layouts/BaseLayout.astro",
  "src/pages/index.astro",
  "src/pages/resume.astro",
  "src/pages/work/index.astro",
  "src/pages/about.astro",
  "src/pages/contact.astro"
];

describe("optional experience boundary", () => {
  it("keeps experience implementation out of the professional shell and routes", async () => {
    const sources = await Promise.all(
      professionalFiles.map((path) =>
        readFile(new URL(`../../../${path}`, import.meta.url), "utf8")
      )
    );

    for (const source of sources) {
      expect(source).not.toMatch(
        /ExperienceRoot|ExperienceLayout|features\/experience|client:/
      );
    }
  });

  it.todo(
    "renders an isolated experience shell when the experience is available"
  );
});
