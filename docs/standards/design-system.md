# Design System Standards

## Overview

`apps/web/src/design-system/` exports two tiers of components. Using the wrong tier, or bypassing the design system entirely with native HTML, is an error.

## Tier 1: First-Party Design System Components

Imported as plain names from `'../design-system'` (or relative equivalent):

```tsx
import { Button, Alert, Text, Input, Select } from '../design-system';
```

These are custom-built components with controlled prop surfaces. `Button` uses a generic `as` prop pattern and inherits native HTML attributes (including `type`, `disabled`, etc.) via `ComponentPropsWithoutRef<T>`.

Use Tier 1 components in page and feature code wherever they cover the use case.

## Tier 2: Core* Mantine Wrappers

Imported with the `Core` prefix from `'../../design-system'`:

```tsx
import {
  CoreButton as Button,
  CoreBox as Box,
  CoreText as Text,
  CoreAlert as Alert,
} from '../../design-system';
```

These are raw Mantine components re-exported through the design system boundary (to avoid direct `../mantine` imports in pages). Their TypeScript types are Mantine's own prop definitions, which differ from the first-party wrappers.

### Rules for Core* Components

- **Do not pass `type="button"` or `type="submit"`** to `CoreButton`. Mantine's `ButtonProps` does not include `type` in its public surface.
- **Do not pass `children` as a prop attribute** to `CoreBox`, `CoreText`, or similar layout primitives. Use JSX children syntax instead.
- **Do not pass `alt`** as a typed prop to `CoreImage`.
- **Do not pass `variant="light"`** to `CoreAlert`. Mantine uses its own `AlertVariant` union; check Mantine docs for valid values.
- Before adding any prop to a Core* component, verify it exists in Mantine's type definition for that component. When in doubt, look at how the same component is used elsewhere in the same file.

Admin pages (`apps/web/src/pages/admin/`) use Core* components. Non-admin pages generally use Tier 1 components.

## No Native HTML as Substitutes

Do not use raw HTML elements (`<button>`, `<input>`, `<select>`, `<div>`, `<p>`, `<span>`) where a design system component exists. This applies to both tiers.

**Wrong:**
```tsx
<button type="button" onClick={handleClick}>Cancel</button>
```

**Right (Tier 1):**
```tsx
<Button variant="secondary" onClick={handleClick}>Cancel</Button>
```

**Right (Core*, inside a Mantine-driven admin page):**
```tsx
<Button variant="default" onClick={handleClick}>Cancel</Button>
```

## No Inline Styles on Design-System Components

Do not pass `style={}` to Tier-1 design-system components (`Text`, `Heading`, `Badge`, `Button`, etc.) to override appearance, typography, or layout. Instead:

- **Layout constraints** (`flex`, `minWidth`, `margin`, `padding`) — use an enclosing `Stack`, `Inline`, or `Grid`.
- **Colour overrides** — all colours must reference design tokens (`var(--ds-color-…)`). Never hardcode hex values.
- **Typography overrides** (`fontWeight`, `fontSize`, `lineHeight`) — use the component's declared props (e.g., `weight="semibold"` on `Text`) or add a new prop/variant.
- **Text rendering modes** (`whiteSpace`, `overflow`, `-webkit-line-clamp`) — use `Text` props: `truncate`, `lineClamp`, `preWrap`.

Layout primitives (`Stack`, `Inline`, `Grid`) accept `style` as an extension mechanism for one-off structural constraints (e.g., `borderRight`, `flex: 1`) that cannot be expressed via their existing props. This is acceptable. Content components do not.

## No Structural CSS Class Files in Feature Code

Local `.css` files in feature or page components must not encode structural layout rules (display, flex, grid, gap, margin) that are expressible with design-system layout components. Permitted uses:

- Responsive breakpoint overrides requiring a media query (no DS equivalent).
- Visual chrome (box-shadow, border-radius) not covered by design tokens.
- Animation/transition rules.

When a CSS class only sets `display: flex; gap: …`, replace it with `Stack` or `Inline`.

## Atomicity

- Extract repeated UI patterns into shared components rather than copying markup.
- Page components orchestrate; they do not own business logic or repeated rendering primitives.
- New UI patterns should reuse or extend existing design system atoms before introducing variants.
- See [code-style.md](./code-style.md) for general atomicity expectations.

## Imports

- Always import through `'../../design-system'` (or relative equivalent), never directly from `'../../mantine'` or the Mantine package itself. This preserves the single UI boundary and ensures the design system can evolve independently.
