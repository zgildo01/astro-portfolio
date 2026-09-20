import { siteConfig } from "./site";

export interface PageMetadata {
  title: string;
  description: string;
}

function createPageMetadata(
  pageName: string,
  description: string
): PageMetadata {
  return {
    title: `${pageName} | ${siteConfig.name}`,
    description
  };
}

export const pageMetadata = {
  home: {
    title: siteConfig.defaultTitle,
    description: siteConfig.defaultDescription
  },

  resume: createPageMetadata(
    "Resume",
    `Professional resume for ${siteConfig.name}, ${siteConfig.role}.`
  ),

  contact: createPageMetadata(
    "Contact",
    `Contact ${siteConfig.name}, ${siteConfig.role}, about professional opportunities, platform engineering, or developer tooling.`
  ),

  about: createPageMetadata(
    "About",
    `Learn more about ${siteConfig.name}, ${siteConfig.role}, and their professional background and approach to platform engineering.`
  ),

  work: createPageMetadata(
    "Work",
    `Selected professional and personal engineering work from ${siteConfig.name}, ${siteConfig.role}.`
  )
} as const;