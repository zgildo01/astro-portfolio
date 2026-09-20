const name = "Zeus Zaragoza";
const role = "Platform Engineer";

export const siteConfig = {
  name,
  role,

  defaultTitle: `${name} | ${role}`,

  defaultDescription: `The professional portfolio of ${name}, ${role}, focused on dependable development platforms, tooling, and engineering workflows.`,

  primaryNavigation: [
    {
      label: "Home",
      href: "/"
    },
    {
      label: "Resume",
      href: "/resume"
    },
    {
      label: "Work",
      href: "/work"
    },
    {
      label: "About",
      href: "/about"
    },
    {
      label: "Contact",
      href: "/contact"
    }
  ]
} as const;
