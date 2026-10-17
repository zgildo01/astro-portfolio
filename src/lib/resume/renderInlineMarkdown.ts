import { micromark } from "micromark";

/** Renders one validated narrative field as safe inline CommonMark. */
export function renderResumeInlineMarkdown(text: string): string {
  const html = micromark(text, {
    allowDangerousHtml: false,
    allowDangerousProtocol: false
  }).trim();

  if (!html.startsWith("<p>") || !html.endsWith("</p>")) {
    throw new Error("Resume narrative must use inline Markdown.");
  }

  const inner = html.slice(3, -4);
  if (inner.includes("</p>")) {
    throw new Error("Resume narrative must use inline Markdown.");
  }

  return inner;
}
