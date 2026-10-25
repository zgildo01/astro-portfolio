import axe, { type AxeResults } from "axe-core";

/** Color, contrast and rendered glyphs require the real-browser checks. */
export function auditAccessibility(
  root: Document | HTMLElement = document
): Promise<AxeResults> {
  return axe.run(root, {
    runOnly: {
      type: "tag",
      values: [
        "wcag2a",
        "wcag2aa",
        "wcag21a",
        "wcag21aa",
        "wcag22aa",
        "best-practice"
      ]
    },
    rules: {
      "color-contrast": { enabled: false },
      // axe identifies icon-font ligatures by drawing text to a 2D canvas.
      // jsdom has no canvas rendering, so this visible-label check belongs
      // in the browser rather than receiving fabricated glyph measurements.
      "label-content-name-mismatch": { enabled: false }
    }
  });
}
