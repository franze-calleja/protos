# protos — Design Brief

For Google Stitch (UI), and any image tool for the logo/mascot. Each block below
is written to be pasted directly.

---

## 1. What protos is — paste this first

> **protos** is a web app where developers configure and generate a new codebase.
> You pick your stack, language, architecture, folder structure, database, and
> whether it's containerised — and protos hands you a complete, working project
> as a downloadable ZIP. Not a starting point that needs fixing: the generated
> project installs, builds, lints, and passes its own tests on the first try.
>
> The whole product is one screen. On the left you make choices; on the right a
> file tree updates live, showing exactly which files you're about to get.
> Toggle Docker and a `Dockerfile` and `docker-compose.yml` appear in the tree.
> Switch from type-based to feature-based architecture and the folders visibly
> reorganise. The URL rewrites as you go, so sharing a setup is copying the
> address bar.
>
> The name is Greek — *protos*, "first". It makes the first version.
>
> Tagline: **Start from first principles.**

## 2. Tone and positioning

protos is **not** a neon-on-charcoal hacker tool and **not** a rounded, pastel
SaaS product. It sits somewhere more considered: a **precision instrument with
an editorial, archival feel** — closer to letterpress, technical drawing, and
well-set print than to a dashboard.

| It should feel | It should not feel |
|---|---|
| Calm, deliberate, exact | Loud, gamified, playful |
| Paper, ink, typesetting, blueprints | Neon, glassmorphism, gradients-on-gradients |
| Dense with information, but quiet | Sparse and empty, or busy and cluttered |
| Made by someone with taste | Generated from a template |

The irony to avoid: a tool that generates projects must not itself look
generated. No stock "developer" imagery, no floating 3D cubes, no rocket ships.

## 3. Colour

Two brand colours, given. Everything else is derived from them and
contrast-checked (WCAG AA, ratio in brackets).

**Core**

| Token | Light mode | Dark mode |
|---|---|---|
| `background` (paper / ink) | `#F3EFDD` | `#0E100F` |
| `foreground` | `#0E100F` (16.55:1) | `#F3EFDD` (16.55:1) |

`#F3EFDD` is a warm parchment, not white. `#0E100F` is a near-black with a
faint green cast. Both are slightly off-neutral — keep that warmth; do not
"correct" them toward pure white or pure black.

**Supporting**

| Token | Light mode | Dark mode |
|---|---|---|
| `muted` (secondary text) | `#6B6558` (5.02:1) | `#8E948F` (6.17:1) |
| `border` / rules | `#DDD6BE` | `#232725` |
| `accent` (primary action, active state) | `#A8491A` (5.01:1) | `#E08A57` (7.22:1) |
| `added` (new file in the preview) | `#3A6E4E` (5.17:1) | `#4E8A66` (4.68:1) |

The accent is a **terracotta / ink-stamp red-orange**. It is the only saturated
colour in the interface — used for the primary button, the active selection,
and nothing else. Restraint is the point.

Both themes are first-class. Neither is "the dark version of" the other.

## 4. Logo and icon

**Recommended direction: a chambered nautilus.**

The reasoning is not decorative. A nautilus grows by adding one chamber at a
time, each built on the shape of the last — which is exactly how protos works
(a base template plus composable layers). It is also among the oldest surviving
forms on earth, which lands the "*protos* = first" meaning without being
literal about it. And the logarithmic spiral is legible down to 16px, which a
detailed mascot never is.

> **Logo prompt:** A minimal geometric mark of a chambered nautilus shell in
> cross-section, showing 5–7 internal chambers spiralling inward. Single-weight
> line work, no shading, no gradient. Drawn like a woodcut or a scientific
> engraving in an old natural-history plate. Solid `#0E100F` on a `#F3EFDD`
> background. Balanced enough to sit inside a square app icon, and readable at
> 16×16. Flat vector, no 3D, no bevel, no drop shadow.

**Alternative direction: stacked plates.** Three or four offset rectangles seen
in slight perspective, like letterpress plates or sheets of paper — layers
literally stacking into one artifact. More abstract, more corporate, less
memorable. Use if the nautilus reads too organic.

**Wordmark:** lowercase `protos`, always. A humanist or transitional serif with
real character (think Spectral, Source Serif, or Freight) — the serif is what
keeps it away from generic dev-tool sans. Generous letter-spacing.

## 5. Mascot

Optional, and only if it stays subtle. If you want one:

> **Mascot prompt:** A friendly chambered nautilus character, drawn as a
> flat two-colour vector illustration in `#0E100F` and `#A8491A` on a `#F3EFDD`
> background. Calm and curious rather than cute or cartoonish — closer to a
> vintage scientific illustration that happens to have a personality than to a
> mascot sticker. Simple dot eyes, no mouth, no limbs. Its spiral shell is the
> hero shape. Clean line work, no gradients, no outlines around the whole
> figure.

Use it in empty states, the 404, and the loading moment. Keep it off the main
generator screen — that screen is a tool, not a personality.

## 6. UI screens

### 6a. The generator — the main screen (highest priority)

> Design a single-page web app called **protos**, a project scaffolding tool for
> developers. Warm parchment background `#F3EFDD`, near-black text `#0E100F`,
> a single terracotta accent `#A8491A`. Editorial and precise, like a
> well-set technical document — serif headings, monospace for anything that is
> code or a file path, generous whitespace, thin `#DDD6BE` hairline rules
> instead of heavy cards and shadows.
>
> A slim top bar holds the lowercase wordmark "protos" on the left, a
> "Copy share link" button and a light/dark toggle on the right.
>
> Below it, a **two-column layout, roughly 45% / 55%**.
>
> The **left column** is a scrollable form of configuration choices, grouped
> under small uppercase serif section labels with hairline rules between them:
> - **Project** — a text input for the project name, and a segmented control
>   for folder layout: "Siblings", "Separate", "Monorepo".
> - **Apps** — a card for one app showing a framework selector (Next.js,
>   Vite + React, Express, Expo) as selectable tiles, and a segmented control
>   for architecture: "Type-based" / "Feature-based". A subtle
>   "+ Add another app" button underneath.
> - **Data** — a Prisma toggle, and when on, a PostgreSQL / MySQL choice.
> - **Quality** — toggle rows for Tailwind CSS, TanStack Query, Zustand, Zod,
>   React Hook Form, ESLint + Prettier, Vitest. Each row is a label, a one-line
>   grey description, and a small switch on the right.
> - **Deploy** — toggles for Docker and GitHub Actions, and a package manager
>   choice: npm / pnpm.
>
> Unavailable options are visibly disabled with a short reason in grey, not
> hidden.
>
> The **right column** is sticky and does not scroll away. At the top, a
> **live file tree preview** in monospace — a real folder hierarchy with
> indent guides, showing folders like `hrims-web/`, `src/app/`,
> `src/components/`, `prisma/`, and files like `package.json`, `Dockerfile`,
> `docker-compose.yml`, `schema.prisma`. Newly added files are marked with a
> small terracotta dot. Below the tree, a dark `#0E100F` block showing the
> shell commands the developer will run next, in monospace.
>
> Fixed at the bottom right, a solid terracotta `#A8491A` primary button
> reading **"Generate project"** with a download icon, and next to it in small
> grey text: "17 files · 4.6 KB".
>
> No drop shadows. No rounded pill buttons — slight 4px radius at most. No
> gradients anywhere.

### 6b. Landing page

> Design a landing page for **protos**, a developer tool that generates
> complete, working project scaffolds. Warm parchment `#F3EFDD`, near-black
> `#0E100F`, single terracotta accent `#A8491A`. Editorial, print-like,
> confident. Serif headings, monospace for code.
>
> Hero: the lowercase wordmark "protos" with a small chambered-nautilus mark,
> a large serif headline **"Start from first principles."**, and one line of
> supporting text: "Pick your stack, architecture, and folder structure. Get a
> project that installs, builds, and passes its tests — on the first try." A
> single terracotta button, "Open the generator", and a quiet secondary link,
> "See what it generates".
>
> Below the fold, a wide monospace panel showing a generated file tree on the
> left and the matching `package.json` on the right, as if peering into the
> output.
>
> Then a three-column row with small serif headings and short grey body text:
> **"Composable, not copy-pasted"** — a small base plus independent layers, so
> every combination is maintained, not duplicated. **"Verified nightly"** —
> every generated project is really installed and built in CI, so templates
> can't quietly rot. **"Stores nothing"** — your configuration lives in the URL.
> protos has no database and keeps no record of you.
>
> Close with a thin footer: wordmark, GitHub link, and the line "protos — Greek
> *prōtos*, 'first'."

### 6c. Smaller states

> Design three small states for **protos**, in warm parchment `#F3EFDD` /
> near-black `#0E100F` with a terracotta `#A8491A` accent, editorial and
> minimal:
> 1. **Generating** — a centred monospace line "Assembling 17 files…" with a
>    thin terracotta progress rule, and a small nautilus mark above it.
> 2. **Invalid share link** — a short serif heading "That link doesn't decode",
>    a line of grey explanation, and a "Start fresh" button.
> 3. **Empty preview** — the right-hand column before any framework is chosen,
>    showing a faint outlined nautilus and the line "Choose a framework to see
>    your project take shape."

## 7. Things to reject

If Stitch returns any of these, regenerate:

- Purple/indigo gradients, glassmorphism, or a dark-navy "SaaS dashboard" look
- Pure `#FFFFFF` or pure `#000000` anywhere — the warmth is the brand
- More than one saturated colour in the interface
- Heavy card shadows, large border radii, pill-shaped buttons
- Rocket ships, gears, floating 3D cubes, generic "code" wallpaper
- A sans-serif wordmark — the serif is the whole differentiator
