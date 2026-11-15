# Brand profile (`brands/<owner>-<repo>.json`)

One file per repo, in `~/.claude/skills/animatic/brands/`. It makes every video for that repo look and sound like
its design system. Claude writes it during setup ("Adapt to your design system" in `SETUP.md`) and you can edit it
any time. `default.json` in the same folder is used for repos without their own file.

```json
{
  "name": "Acme Design System",
  "source": "Where each value came from, e.g. packages/ui/src/styles/tokens.css",
  "colors": {
    "background": "#f8fafc",   "foreground": "#111827",   "muted": "#6b7280",
    "border": "#e5e7eb",       "card": "#ffffff",         "accent": "#4f46e5"
  },
  "font": {
    "family": "Inter",
    "import": "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap",
    "files": { "400": "/abs/path/Inter-Regular.woff2", "600": "/abs/path/Inter-SemiBold.woff2" },
    "titleWeight": 600,
    "captionWeight": 500
  },
  "radius": 12,
  "cards": { "titleCase": "none" },
  "captions": {
    "language": "en",
    "voice": "Short, sentence case, the user's benefit, no jargon. Max 10 words.",
    "glossary": "docs/terminology.md",
    "avoid": ["click here", "simply"]
  },
  "record": {
    "where": [
      { "name": "Storybook", "start": "npm run storybook", "url": "http://localhost:6006", "note": "components" },
      { "name": "Demo app", "start": "npm run dev:demo", "url": "http://localhost:5173", "note": "mock data, no sign-in" }
    ],
    "hide": ["#intercom-container", ".dev-toolbar"],
    "never": ["staging.acme.com", "app.acme.com"]
  }
}
```

| Field | Used for | Where to find it in a project |
|---|---|---|
| `colors.*` | Card background, text, borders, accent bar, highlight ring | CSS variables (`--background`, `--foreground`, `--muted-foreground`, `--border`, `--card`, `--primary`), `tailwind.config.*` theme, `tokens.json` / Style Dictionary, `theme.ts` (MUI, Chakra, styled-components), Figma variables export |
| `font.*` | All card text | `@font-face` in global CSS, `next/font`, a Google Fonts `<link>`, font files under `assets/fonts` |
| `font.files` | Local/licensed fonts | Absolute paths to `.woff2`/`.woff`/`.ttf` files. Never copy fonts out of the repo |
| `radius` | Caption pill corners | `--radius`, Tailwind `borderRadius`, the Card component |
| `captions.*` | Caption wording | A content style guide, a glossary or terminology file, the product's own UI copy |
| `record.where` | Where it's safe to record | Storybook, a component catalog, a demo/mock app, `.env.example`, README "run locally" |
| `record.hide` | Selectors hidden while recording | Chat widgets, cookie banners, dev toolbars seen on a test screenshot |
| `record.never` | Hosts never to record | Production and staging URLs with real customer data |

Only `colors.accent` is really required; everything else falls back to neutral defaults. Values in a video's
`cards.json` `theme` override the profile for that one video.
