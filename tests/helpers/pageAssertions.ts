import { expect } from "vitest";

/** DOM contracts shared by the professional pages, independent of their copy. */
export function expectDocumentStructure(root: Document = document): void {
  expect(root.documentElement.lang).toBe("en");
  expect(root.title.trim()).not.toBe("");
  expect(
    root
      .querySelector('meta[name="description"]')
      ?.getAttribute("content")
      ?.trim()
  ).toBeTruthy();
  expect(root.querySelectorAll("main")).toHaveLength(1);
  expect(root.querySelectorAll("h1")).toHaveLength(1);
  expect(root.querySelector("main h1")).not.toBeNull();
  expect(root.querySelector("main[tabindex]")).toBeNull();
  expect(root.querySelector("body > header")).not.toBeNull();
  expect(root.querySelector("body > footer")).not.toBeNull();
  expect(root.querySelector("[autofocus]")).toBeNull();
  for (const element of root.querySelectorAll("[tabindex]")) {
    expect(Number(element.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  }
}

export function expectResolvedReferences(root: Document = document): void {
  const ids = [...root.querySelectorAll("[id]")].map((element) => element.id);
  expect(new Set(ids).size).toBe(ids.length);

  for (const element of root.querySelectorAll(
    "[aria-labelledby], [aria-describedby], [aria-controls]"
  )) {
    for (const attribute of [
      "aria-labelledby",
      "aria-describedby",
      "aria-controls"
    ]) {
      for (const id of element
        .getAttribute(attribute)
        ?.split(/\s+/)
        .filter(Boolean) ?? []) {
        expect(
          root.getElementById(id),
          `${attribute} target ${id}`
        ).not.toBeNull();
      }
    }
  }
  for (const label of root.querySelectorAll<HTMLLabelElement>("label[for]")) {
    expect(
      root.getElementById(label.htmlFor),
      `label target ${label.htmlFor}`
    ).not.toBeNull();
  }
  for (const link of root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]')) {
    const id = decodeURIComponent(link.getAttribute("href")!.slice(1));
    expect(id).not.toBe("");
    expect(root.getElementById(id), `fragment target ${id}`).not.toBeNull();
  }
}

export function expectSafeDocumentLinks(root: Document = document): void {
  for (const element of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const destination = new URL(
      element.getAttribute("href")!,
      "https://portfolio.test/"
    );
    expect(["https:", "http:", "mailto:"], element.outerHTML).toContain(
      destination.protocol
    );
    expect(
      element.textContent?.trim() || element.getAttribute("aria-label")
    ).toBeTruthy();
    if (element.target === "_blank") {
      expect(element.rel.split(/\s+/)).toContain("noopener");
    }
  }
}
