# Component Consistency Matrix

## Purpose

Track where shared components are intentionally consistent or intentionally different.

## Matrix

| Concern | Canonical Component/Pattern | Where Used | Allowed Differences | Reason |
|---|---|---|---|---|
| User identity display | `UserPill` | Event pages, teams, admin/user surfaces | None (color/label only from props) | Identity recognition consistency |
| Event list tile | `EventCard` | Public event index, user profile event snippets | Admin events index uses denser row-card actions | Admin requires operational controls |
| Tabs/navigation | Existing nav-link/tab style | User profile, admin sections, event detail tabs | None unless route hierarchy requires | Reduce cognitive load |
| Markdown content | `MarkdownRenderer` | Long descriptions, CMS content pages | Optional truncation/preview behavior | Spoiler and information density controls |
| Badge visual | Saved SVG render | Badge pages, badge modals, index previews | Builder page composes editable preview | Preserve exact scalable output |
| Modal style | Mantine modal with theme-aligned surface | Global | None | Accessibility and theme consistency |

## Review Policy

- New reusable UI should be added to this matrix.
- Variance requires reason + owning page/module.
