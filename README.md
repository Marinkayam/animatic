# animatic 🎬 — a demo video for every PR, made by Claude Code

Reviewers read code. Designers and PMs want to **see** the change.
`animatic` is a [Claude Code](https://claude.com/claude-code) skill that turns a pull request's UI change into a
30–75 second demo video (title card, recorded scenes with captions, end card, in your design system's look) and
attaches it to the PR as a playable video, at the top of the description.

<!-- Add a GIF or video of an example here -->

```
/animatic 482
```
1. Reads the PR and lists only what changed **for the user** (screens, states, copy, interactions).
2. Writes a storyboard (3–6 scenes) and shows it to you.
3. Records each scene with Playwright from the PR's own code, with a visible cursor and highlights.
4. Renders title, end and caption cards from your design tokens and fonts.
5. Composes the video with ffmpeg and checks a frame from every scene.
6. Shows you the video, and on your OK puts it in the PR description.

Optional **auto mode**: every PR you open gets its video without you asking.

## Install (one prompt)
Needs macOS or Linux, Node 18+, [`gh`](https://cli.github.com) signed in, `ffmpeg`, and Claude Code.

1. Download this folder (or `git clone` it) anywhere, for example `~/Downloads/animatic-kit`.
2. Open Claude Code in the root of your app's repo and say:
   ```
   Follow the instructions in ~/Downloads/animatic-kit/SETUP.md step by step.
   ```
It installs the skill in `~/.claude/skills/animatic/` (nothing goes into your repo), asks before installing system
packages, opens a browser once for you to sign in to GitHub, and runs a dry-run upload that posts nothing.

## Use
- `/animatic` — the current branch vs the default branch
- `/animatic 482` — a PR
- `/animatic 482 483` — several PRs
- "make a video for this PR" works too.

Everything for a run stays in `<repo>/.animatic/<slug>/` (git-excluded): `storyboard.md`, `record.mjs`, the clips and
`animatic.mp4`. After review fixes, ask Claude to re-record: it reruns `record.mjs` and replaces the video in the PR.

## What's inside
| File | What it does |
|---|---|
| `SETUP.md` | The setup instructions Claude follows |
| `skill/SKILL.md` | The skill itself: how Claude scopes, storyboards, records, checks and attaches |
| `skill/tools/rec-lib.mjs` | Playwright helpers: one clip per scene, cursor, smooth moves, highlights, hides dev overlays |
| `skill/tools/cards.mjs` | Title, end and caption cards from your tokens (colours, font files) |
| `skill/tools/compose.sh` | ffmpeg: trims, overlays captions, joins everything into `animatic.mp4` |
| `skill/tools/wt.sh` | A throwaway git worktree of the PR branch that reuses your `node_modules` (no second install) |
| `skill/scripts/upload.mjs` | Attaches the video to the PR (description or comment) |
| `skill/scripts/auto-hook.mjs` | Optional auto mode (Claude Code hooks) |

## How the upload works (and its limits)
GitHub has **no public API** for video attachments. `upload.mjs` does what you'd do by hand: it opens the PR in a
Playwright browser that keeps your own GitHub sign-in in a local profile (`~/.animatic/`), drops the file into the
comment box, takes the resulting `user-attachments` URL, clears the draft, and writes the link into the PR with `gh`.
- It's unofficial and may break when GitHub changes its page. If it does, Claude can usually fix the selectors.
- It works with SSO/SAML orgs (`--org`) and GitHub Enterprise Server (`--host`).
- Video size limits are GitHub's: 10 MB on free plans, 100 MB on paid plans. The skill aims for under 10 MB.
- Your sign-in stays on your machine. Nothing is sent anywhere except GitHub.

## Safety
- Record **only** demo, mock-data, Storybook or local environments. Never real customer data, never production.
- Nothing is committed. Nothing is posted without your OK (unless you turned on auto mode).
- No credentials in recording scripts.

## License
MIT
