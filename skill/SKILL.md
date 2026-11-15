---
name: animatic
description: Turn a PR or feature change into a short demo video (animatic) and attach it to the PR as a playable embed. Use for /animatic, "make a video for this PR", or a walkthrough of a UI change.
---

# /animatic: a demo video for every PR that changes the UI

Goal: a 30–75 second MP4 that shows a reviewer **what changed for the user**, not what changed in the code.
Structure: a title card, 3–6 recorded scenes with short captions, an end card. Then it's attached to the PR.

Args (all optional): a PR number, several PR numbers, or a branch. With no args, compare the current branch with the
default branch. Talk to the user in their language; video captions are in English unless they ask otherwise.

## Paths and tools
- `SKILL_DIR` = `~/.claude/skills/animatic/`. Playwright is installed **here**, never in the user's repo.
- `SKILL_DIR/scripts/upload.mjs`: attaches the video to the PR. `SKILL_DIR/tools/`: `rec-lib.mjs` (recording helpers),
  `cards.mjs` (title/end/caption cards), `compose.sh` (ffmpeg), `wt.sh` (throwaway worktree of a PR branch).
- Per-run work folder: `<repo>/.animatic/<slug>/` (git-excluded via `.git/info/exclude`). Storyboard, scripts, clips,
  cards and the final video go there. **Never commit anything as part of this skill.**
- Host and org: read them from `git remote get-url origin`.

## Auto mode (only if the user turned it on during setup)
Hooks run `scripts/auto-hook.mjs` right after `gh pr create`, and at session start for the user's open PRs (opened
since auto mode was turned on) that have no `<!-- animatic:start -->` block yet. When that hook message appears:
- Run this whole skill without asking. Skip the storyboard approval (still write `storyboard.md`) and skip
  "ask before attaching": attach directly, then report the PR link in one line.
- Still do every check in step 7. If one fails and can't be fixed, don't attach; say what blocked it.
- No user-visible change (docs, tooling, types, CI only): no video. Add `<repo>#<n>` to `~/.animatic/skip.txt`.

## 1. Scope the change
- PR: `gh pr view <n> --json title,body,headRefName,files` and `gh pr diff <n>`. Otherwise `git diff <default>...HEAD`.
- List only **user-visible** changes: screens, flows, states (empty, loading, error, success), copy, interactions.
  Map each changed component to its route by reading the app's router. Ignore refactors with no visible effect.

## 2. Storyboard (show it before recording, except in Auto mode)
3–6 scenes, one idea per scene, 5–12 seconds each. Write `storyboard.md`:

| # | Caption (≤ 10 words, the user benefit) | App + route | Actions | Highlight |

Plus a title (the PR in plain language) and a one-line subtitle. Show it and wait for a go-ahead.

## 3. Where to record (safety first)
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
Find the project's real tokens first (CSS variables such as `--background`, `--foreground`, `--border`,
`--muted-foreground`, `--primary`, and the font files). Write `.animatic/<slug>/cards.json`:
```json
{ "pr": 123, "date": "Jan 5, 2027", "kicker": "Billing", "title": "…", "subtitle": "…",
  "end": { "bullets": ["…", "…"], "branch": "feat/…" },
  "captions": { "01-overview": "…" }, "captionPos": { "01-overview": "right" },
  "theme": { "bg": "#…", "fg": "#…", "muted": "#…", "border": "#…", "card": "#fff", "accent": "#…",
             "fontFamily": "…", "fontFiles": { "400": "/abs/…-Regular.woff2", "500": "…", "600": "…" } } }
```
Then `node SKILL_DIR/tools/cards.mjs .animatic/<slug>`. Captions sit bottom-left by default; use `"right"` when the
subject of that scene (e.g. a table footer) is bottom-left.

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
Show the video first and ask before attaching (except in Auto mode).
```bash
node ~/.claude/skills/animatic/scripts/upload.mjs .animatic/<slug>/animatic.mp4 --pr <n> --repo <owner>/<repo> [--org <org>] [--host <ghe-host>]
```
- Goes to the top of the PR description between `<!-- animatic:start/end -->` markers; re-running replaces it.
  `--comment` posts it as a comment instead. `--dry-run` uploads and prints the markdown without touching the PR.
- "Session expired" → the user signs in again: `node upload.mjs --login [--org <org>]` (needs them at the browser
  window; give it a 10-minute timeout).
- Keep `record.mjs`: after review fixes, rerun it, `compose.sh` and the uploader to refresh the video.
