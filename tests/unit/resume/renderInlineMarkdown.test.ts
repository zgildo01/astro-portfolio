import { describe, expect, it } from "vitest";

import { renderResumeInlineMarkdown } from "../../../src/lib/resume/renderInlineMarkdown";

describe("renderResumeInlineMarkdown", () => {
  it("renders narrative links and emphasis without block markup", () => {
    const html = renderResumeInlineMarkdown(
      "Built **release tools** with [documentation](https://example.com/docs)."
    );

    expect(html).toBe(
      'Built <strong>release tools</strong> with <a href="https://example.com/docs">documentation</a>.'
    );
  });

  it("escapes inline HTML and blocks dangerous link protocols", () => {
    const html = renderResumeInlineMarkdown(
      "Result <img src=x onerror=alert(1)> [unsafe](javascript:alert(1))"
    );

    expect(html).not.toContain("<img");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;img");
  });

  it("rejects raw block HTML", () => {
    expect(() =>
      renderResumeInlineMarkdown("<script>alert(1)</script>")
    ).toThrow("Resume narrative must use inline Markdown.");
  });

  it("rejects block Markdown in an inline narrative field", () => {
    expect(() => renderResumeInlineMarkdown("# Heading")).toThrow(
      "Resume narrative must use inline Markdown."
    );
  });
});
