# animatic 🎬 — a demo video for every PR, made by Claude Code

Reviewers read code. Designers and PMs want to **see** the change.
`animatic` is a [Claude Code](https://claude.com/claude-code) skill that turns a pull request's UI change into a
30–75 second demo video (title card, recorded scenes with captions, end card, in your design system's look) and
attaches it to the PR as a playable video, at the top of the description.

![An example animatic: a fictional role-matching app](example/animatic.gif)

<sub>An example made with this kit on a fictional app (`example/`). The full video: [example/animatic.mp4](example/animatic.mp4).</sub>

**You set it up once. After that it runs by itself:** open a pull request, and its video is there.

For every pull request that changes the UI, Claude:
1. Reads the PR and lists only what changed **for the user** (screens, states, copy, interactions).
2. Writes a storyboard (3–6 scenes) in your product's voice.
3. Records each scene with Playwright from the PR's own code, with a visible cursor and highlights.
4. Renders title, end and caption cards in **your design system**: your colours, fonts, radius and copy style.
5. Composes the video with ffmpeg and checks a frame from every scene.
6. Puts it at the top of the PR description, and refreshes it when the PR changes.

## Get it: one sentence, then nothing to remember
Open [Claude Code](https://claude.com/claude-code) in your app's repo and say:

> **Set up https://github.com/Marinkayam/animatic for me.**

**Claude asks once.** It installs the skill (nothing goes into your repo), reads your design system on its own
(colour tokens, fonts, radius, your content guide, where it's safe to record) and comes back with one short round of
questions: *does this preview look like your product?* and *how much do you want to see before a video goes on a PR?*
Then you sign in to GitHub once, in a browser window.

**After that it runs by itself.**
- You open a pull request → its video is made in your design system and attached. No command.
- A PR you opened somewhere else, or one that changed after review → picked up the next time Claude Code starts.
- PRs with nothing to see (docs, tooling) are skipped.

Steer it in plain words, any time: *"show me videos before attaching"*, *"pause animatic"*, *"skip this PR"*,
*"make the captions bolder"*, *"redo the video for 482"*. `/animatic 482` still works by hand.

Needs macOS or Linux, Node 18+, [`gh`](https://cli.github.com), `ffmpeg` and Claude Code. Claude checks these for you.

Your design system lives in a small **brand profile**, one per repo:
`~/.claude/skills/animatic/brands/<owner>-<repo>.json` ([schema](skill/brand.schema.md)). Everything for a video stays
in `<repo>/.animatic/<slug>/`, which git ignores: the storyboard, the recording script, the clips and the video.

## Try the example (2 minutes, no app needed)
`example/` has a small fictional app (`app/index.html`), its brand profile, the storyboard, the cards spec and the recording script
Claude would write for a PR. After setup, from this folder:
```bash
export ANIMATIC_BRAND=example/brand.json                    # the example's brand profile
node example/record.mjs                                      # records 5 scenes into example/out/
cp example/cards.json example/out/ && node skill/tools/cards.mjs example/out
bash skill/tools/compose.sh example/out                       # -> example/out/animatic.mp4
```

## What's inside
| File | What it does |
|---|---|
| `SETUP.md` | The setup instructions Claude follows |
| `skill/SKILL.md` | The skill itself: how Claude scopes, storyboards, records, checks and attaches |
| `skill/tools/rec-lib.mjs` | Playwright helpers: one clip per scene, cursor, smooth moves, highlights, hides dev overlays |
| `skill/tools/brand.mjs`, `skill/brand.schema.md` | Your design system's brand profile: how it's found and what's in it |
| `skill/tools/cards.mjs` | Title, end and caption cards in your brand (`--preview` shows a sample) |
| `skill/tools/compose.sh` | ffmpeg: trims, overlays captions, joins everything into `animatic.mp4` |
| `skill/tools/wt.sh` | A throwaway git worktree of the PR branch that reuses your `node_modules` (no second install) |
| `skill/scripts/upload.mjs` | Attaches the video to the PR (description or comment) and remembers which commit it shows |
| `skill/scripts/auto-hook.mjs` | What makes it autonomous: Claude Code hooks for new and changed PRs |
| `example/` | A fictional app with its storyboard, cards and recording script, plus the finished video |

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
- Nothing is committed to your repo. You choose at setup whether videos are attached on their own or only after you've seen them.
- No credentials in recording scripts.

## License
MIT
