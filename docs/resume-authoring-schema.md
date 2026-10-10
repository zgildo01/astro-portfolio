# Resume authoring schema — draft v1

Write one `resume.md` at the root of the separate content repository. The portfolio will validate it at build time and use the same facts for the web resume, print view, PDF, and relevant metadata. This is the v1 authoring contract for Pillar 4. The app-owned parser and validator are implemented; the external source connection and web, print, PDF, and metadata outputs are still in progress.

## Copyable template

Delete optional fields and sections you do not use. Replace every bracketed prompt with a real, public fact.

```md
---
schema_version: 1
headline: Platform Engineer
# Optional public contact fields: delete any you do not want published.
location: "[City, Region or Remote]"
email: "[public email address]"
website: "[live portfolio URL]"
linkedin: "[public LinkedIn URL]"
github: "[public GitHub URL]"
---

# Zeus Zaragoza

## Summary

[Two to four sentences describing your engineering focus, strengths, and the work you want to do.]

## Experience

### [Job title]

Employer: [Organization]
Start: [YYYY or YYYY-MM]
End: [YYYY or YYYY-MM or present]
Location: [Remote, hybrid, or city/region; delete this line if irrelevant]

- [What you built or improved, your contribution, and the result.]
- [Another concrete accomplishment; include a metric only if you can substantiate it.]

### [Another job title]

Employer: [Organization]
Start: [YYYY or YYYY-MM]
End: [YYYY or YYYY-MM]

- [Concrete accomplishment.]

## Skills

### [Category, such as Platform engineering]

- [Skill, tool, or practice]
- [Skill, tool, or practice]

### [Another category, such as Languages]

- [Skill, tool, or practice]

## Selected Projects

### [Project name]

Link: [Live public URL; delete this line if there is no live link]

- [Your contribution and the outcome.]

## Education

### [Degree, program, or training]

Institution: [School or provider]
Completed: [YYYY or YYYY-MM; delete this line if not applicable]

## Certifications

### [Credential name]

Issuer: [Issuing organization]
Issued: [YYYY or YYYY-MM; delete this line if unknown]
Expires: [YYYY or YYYY-MM; delete this line if not applicable]
Link: [Public verification URL; delete this line if unavailable]
```

## Rules for the first version

- Keep the exact heading names and order. `Summary`, `Experience`, and `Skills` are required. Delete `Selected Projects`, `Education`, or `Certifications` entirely when they have no real entries. Repeat level-three headings for multiple roles, skill categories, projects, qualifications, or credentials.
- The name is the single level-one heading. `headline` is the professional title. The renderer will use that name in the resume page heading and PDF; it will not print the source headings blindly into the existing page shell.
- For each experience entry, `Employer`, `Start`, and `End` are required, followed by at least one achievement bullet. `Location` is optional. List entries newest first; repeat an employer for distinct roles there.
- Dates are `YYYY` or `YYYY-MM`. Only `End` may be `present`, in lowercase. Use year-only dates when the month is unknown; never invent a month. `Completed`, `Issued`, and `Expires` are optional and use the same date formats when present.
- In `Skills`, each category is a level-three heading and each skill is its own bullet. For a project, `Link` is optional and must point to a live public destination. For education, `Institution` is required. For certifications, `Issuer` is required.
- Field labels (`Employer:`, `Start:`, and so on) are literal and case-sensitive. Put them on their own lines before any bullets. Keep metadata values plain text; standard Markdown links are allowed in narrative text and bullets.
- Use ordinary Markdown paragraphs, headings, and single-level bullets. Avoid tables, raw HTML, images, Obsidian wikilinks, and callouts in this canonical file so it can render consistently in HTML and print.
- Everything here will be public in both the site and PDF. Omit private phone numbers, home addresses, employer-confidential details, unverified metrics, and any credential or date you cannot substantiate. For recruiter contact, include at least one working public route such as email or LinkedIn.
- Bracketed prompts are authoring aids, not valid content. The future validator should reject any left in the completed file.
