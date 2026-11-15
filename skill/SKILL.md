---
name: animatic
description: Turn a PR or feature change into a short demo video (animatic) and attach it to the PR as a playable embed. Use for /animatic, "make a video for this PR", or a walkthrough of a UI change.
---

# /animatic: a demo video for every PR that changes the UI

Goal: a 30–75 second MP4 that shows a reviewer **what changed for the user**, not what changed in the code.
Structure: a title card, 3–6 recorded scenes with short captions, an end card. Then it's attached to the PR.

Args (all optional): a PR number, several PR numbers, or a branch. With no args, compare the current branch with the
default branch. Talk to the user in their language. Captions follow the brand profile's `captions` (language, voice,
glossary); English by default.

## Paths and tools
- `SKILL_DIR` = `~/.claude/skills/animatic/`. Playwright is installed **here**, never in the user's repo.
- `SKILL_DIR/scripts/upload.mjs`: attaches the video to the PR. `SKILL_DIR/tools/`: `rec-lib.mjs` (recording helpers),
  `cards.mjs` (title/end/caption cards), `compose.sh` (ffmpeg), `wt.sh` (throwaway worktree of a PR branch).
- Per-run work folder: `<repo>/.animatic/<slug>/` (git-excluded via `.git/info/exclude`). Storyboard, scripts, clips,
  cards and the final video go there. **Never commit anything as part of this skill.**
- Host and org: read them from `git remote get-url origin`.

## 0. Load the brand profile (every run)
The look and voice of the video come from this repo's brand profile:
`node -e "import('$HOME/.claude/skills/animatic/tools/brand.mjs').then(m=>console.log(m.brandPath()))"`.
- Found → read it. `cards.mjs` and `rec-lib.mjs` apply it automatically (colours, font, radius, highlight colour,
  hidden overlays). Use its `captions` for wording and its `record.where` / `record.never` for where to record.
- Not found (a new repo) → before anything else, do "Step 3: Adapt to their design system" from the kit's `SETUP.md`
  (it's in `~/.claude/animatic-kit/SETUP.md`, or ask where the kit is) and show the preview for approval.
  When a hook started this run, don't interrupt: use `brands/default.json` if it exists, otherwise neutral
  defaults, make the video, and offer once, in one line, to adapt to this repo's design system.

## It runs by itself (the default)
The user set this up once and should never have to remember it. Hooks run `scripts/auto-hook.mjs`: right after
`gh pr create`, and at session start for their open PRs that have no `<!-- animatic:start -->` block yet or whose
code changed since the video was made. When that hook message appears, do the work **in the same turn**, after
finishing what they asked for:
- `~/.animatic/settings.json` `"review"` decides how much they see first:
  `"none"` (default): no storyboard approval, attach it yourself, report the PR link in one line ·
  `"video"`: show the video, attach on their yes · `"storyboard"`: show the storyboard first too.
- Always write `storyboard.md` and do every check in step 7. A check that fails and can't be fixed → don't attach;
  say in one line what blocked it.
- No user-visible change (docs, tooling, types, CI only) → no video; add `<repo>#<n>` to `~/.animatic/skip.txt`.
- A refresh (the PR changed): rerun `.animatic/<slug>/record.mjs`, re-record only the scenes the new commits touch,
  recompose, and run the uploader again (it replaces the video in place).
- The only time to stop for the user: the GitHub upload session expired (they sign in again).

Things they may say, and what to do (no menus, just do it and confirm in one line):
| They say | Do |
|---|---|
| "pause animatic" / "turn it back on" | set `"auto"` to `false` / `true` in `~/.animatic/settings.json` |
| "show me videos before attaching" / "just attach them" | set `"review"` to `"video"` / `"none"` |
| "skip this PR" | add `<repo>#<n>` to `~/.animatic/skip.txt` |
| "make the captions bolder", "use our dark theme", "we changed our font" | edit this repo's brand profile, re-render the preview, show it |
| "redo the video for 482" | run the skill for that PR |

## 1. Scope the change
- PR: `gh pr view <n> --json title,body,headRefName,files` and `gh pr diff <n>`. Otherwise `git diff <default>...HEAD`.
- List only **user-visible** changes: screens, flows, states (empty, loading, error, success), copy, interactions.
  Map each changed component to its route by reading the app's router. Ignore refactors with no visible effect.

## 2. Storyboard
3–6 scenes, one idea per scene, 5–12 seconds each. Write `storyboard.md`:

| # | Caption (≤ 10 words, the user benefit) | App + route | Actions | Highlight |

Plus a title (the PR in plain language) and a one-line subtitle. Show it and wait only when `review` is
`"storyboard"`, or when the user ran the skill by hand and asked to see it.

## 3. Where to record (safety first)
- Start from the brand profile's `record.where`; never record a host in `record.never`.
- **Only demo, mock-data, Storybook or local environments.** Never record staging or production with real customer
  data, and never put credentials in scripts. If the only way to see the screen is behind a real sign-in, record the
  component's Storybook/catalog page instead and say so in the storyboard.
- Record the PR's own code, not the user's checkout: `bash SKILL_DIR/tools/wt.sh add <slug> <branch>` makes
  `<repo>/.animatic/wt-<slug>` with `node_modules` linked from the main checkout (no second install) and local `.env`
  files copied. Start the app's dev server from there **on a free port** in the background (check the port is free;
  never stop a server you didn't start). `wt.sh rm <slug>` when done.
- A Vercel/Netlify preview of the branch is fine too, if it runs on mock data and needs no sign-in.

## 4. Record with Playwright
Write `.animatic/<slug>/record.mjs` using the shared helpers. One `scene()` per storyboard row = one clip each:

```js
import os from 'node:os';
const { chromium, scene } = await import(os.homedir() + '/.claude/skills/animatic/tools/rec-lib.mjs');
const OUT = new URL('.', import.meta.url).pathname, BASE = process.env.ANIMATIC_URL ?? 'http://localhost:5199';
const b = await chromium.launch();
await scene(b, OUT, BASE, '01-overview', async (page, h) => {
  const ready = await h.go('/settings/billing');            // clip is trimmed to start here
  await h.highlight(page.getByRole('tab', { name: 'Usage' }));
  await h.click(page.getByRole('button', { name: 'Upgrade' }));
  return ready;
});
await b.close();
```
Helpers: `go(path)`, `move(loc)`, `click(loc)`, `type(loc, text)`, `scrollTo(loc, topPx)`, `highlight(loc, ms)`, `pause(ms)`.
Env: `ANIMATIC_ACCENT_RGB="r,g,b"` (highlight colour = the design system's primary), `ANIMATIC_HIDE=".sel1,.sel2"`
(extra dev overlays to hide; check a screenshot for floating dev toolbars and add their selectors).

Rules: role and text locators, not CSS classes. Slow and deliberate: ~0.5 s after each click, ~1 s hold on every result.
Show the states a reviewer would otherwise miss (validation, empty, toasts, hover, focus). Close onboarding popovers
off camera before `ready`. If a scene needs data the demo lacks, add it to the demo's mock data; don't fake the DOM.

## 5. Cards and captions in the design system's look
The look comes from the brand profile (step 0). Write only the content in `.animatic/<slug>/cards.json`:
```json
{ "pr": 123, "date": "Jan 5, 2027", "kicker": "Billing", "title": "…", "subtitle": "…",
  "end": { "bullets": ["…", "…"], "branch": "feat/…" },
  "captions": { "01-overview": "…" }, "captionPos": { "01-overview": "right" } }
```
Then `node SKILL_DIR/tools/cards.mjs .animatic/<slug>`. Write captions in the profile's voice and glossary.
Captions sit bottom-left by default; use `"right"`, `"top-left"` or `"top-right"` when the subject of that scene
(a table footer, a toast) is where the caption would go. A `"theme"` block in `cards.json` overrides the profile for
one video only (same keys as `cards.mjs` documents).

## 6. Compose
`bash SKILL_DIR/tools/compose.sh .animatic/<slug> [crf]` → title 2.5 s + each scene (trimmed to `ready`, caption
faded in) + end 3.5 s → `animatic.mp4`. Optional Slack GIF:
`ffmpeg -i animatic.mp4 -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" animatic.gif`

## 7. Verify before delivering
- Duration 30–75 s (cut scenes rather than speeding up). Under 10 MB (raise the CRF to 26–28 if needed).
- Extract a frame from the middle of each scene (`ffmpeg -ss <t> -i NN-x.mp4 -frames:v 1 f.png`) and **look at it**:
  the right screen, a readable caption that doesn't cover the subject, no blank/loading frames, no error overlays,
  no dev toolbars, no real data. Fix and re-render only the affected scene.

## 8. Attach to the PR
Follow `review` in `~/.animatic/settings.json`: `"none"` → attach and report; otherwise show the video and ask.
When the user runs the skill by hand with no settings file, show the video and ask.
```bash
node ~/.claude/skills/animatic/scripts/upload.mjs .animatic/<slug>/animatic.mp4 --pr <n> --repo <owner>/<repo> [--org <org>] [--host <ghe-host>]
```
- Goes to the top of the PR description between `<!-- animatic:start/end -->` markers; re-running replaces it.
  `--comment` posts it as a comment instead. `--dry-run` uploads and prints the markdown without touching the PR.
- "Session expired" → the user signs in again: `node upload.mjs --login [--org <org>]` (needs them at the browser
  window; give it a 10-minute timeout).
- Keep `record.mjs`: after review fixes, rerun it, `compose.sh` and the uploader to refresh the video.
