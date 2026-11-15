# Set up animatic for me

You are Claude Code. The user pointed you at this repo (maybe with just its link). They want `animatic`: a short
demo video for every pull request that changes the UI, in **their** design system's look, attached to the PR,
**without them having to remember anything after today.**

The deal with the user: **you ask once, now. After that it runs by itself.**
Do everything below in order. The user may not be a developer: say what you're doing in one plain sentence per step,
in their language, and never make them choose something you can find out yourself.

Ground rules:
- Install **globally** in `~/.claude/skills/animatic/`. Nothing goes into the user's repo. Don't commit, don't stage,
  don't edit tracked files. Read their design system; never change it.
- Ask before installing system packages (e.g. `brew install ffmpeg`).
- The only things that need the user: the one round of questions (step 4) and one browser sign-in (step 6).

## 1. Get the kit
Only have the link? `git clone --depth 1 https://github.com/Marinkayam/animatic ~/.claude/animatic-kit`
(or `git -C ~/.claude/animatic-kit pull`). Call that folder KIT. Reading this from a local copy? KIT is its folder.

## 2. Preflight (don't ask, check)
1. The app's repo (REPO): the current directory should be the root of a git repo with a GitHub `origin`
   (`git rev-parse --show-toplevel`). If it isn't, ask which folder holds their app.
2. From `git remote get-url origin`: `<HOST>` (usually `github.com`) and `<OWNER>/<REPO>`.
3. `node -v` (18+), `gh --version`, `ffmpeg -version`, `gh auth status -h <HOST>`. Collect what's missing for step 4.

## 3. Install, and read their design system (still no questions)
```bash
mkdir -p ~/.claude/skills/animatic/brands ~/.animatic
cp -R "$KIT/skill/." ~/.claude/skills/animatic/
cd ~/.claude/skills/animatic
[ -f package.json ] || npm init -y >/dev/null
npm i playwright
npx playwright install chromium
chmod +x tools/*.sh
```
Add `.animatic/` to REPO's `.git/info/exclude` (a local file, never committed).

Then build the brand profile, `~/.claude/skills/animatic/brands/<owner>-<repo>.json` (schema: `skill/brand.schema.md`;
`node -e "import('$HOME/.claude/skills/animatic/tools/brand.mjs').then(m=>console.log(m.repoSlug()))"` prints the slug).
Search REPO, and any design-system package it uses, for:
- colours: CSS variables in global CSS, `tailwind.config.*`, `tokens.json` / Style Dictionary, `theme.ts`;
- fonts: `@font-face`, `next/font`, Google Fonts links, files under `assets/fonts`;
- radius, the Card component's look, and a content or terminology guide if there is one;
- where it's safe to record: Storybook, a component catalog, a demo or mock-data app, the README's "run locally".
Use the real values (resolve `var(--x)` chains; `hsl()`/`oklch()` → hex) and note in `source` where each came from.
Render the preview: `node ~/.claude/skills/animatic/tools/cards.mjs --preview /tmp/animatic-brand-preview`.

## 4. The one round of questions
Open `preview.png` for them and ask everything in **one** message (use a question tool if you have one). Offer your
recommendation first; skip any question you could already answer yourself.
1. **"Does this look like your product?"** (the preview). If not: what to change (colour, font, weight, corners).
2. **"Where can I record safely?"** Only if you found no Storybook / demo / mock-data app. Never production or
   staging with real customers; put those hosts in the profile's `record.never`.
3. **"How much do you want to see before a video goes on a PR?"**
   - *Nothing, just do it* (recommended): `"review": "none"`
   - *Show me the video first*: `"review": "video"`
   - *Show me the storyboard too*: `"review": "storyboard"`
4. Anything missing from step 2 (a tool to install, `gh auth login`), as one line each with the exact command.
If they only have a Figma file or a brand page instead of code, ask them to paste the main colours and the font name.
Adjust the profile and re-render the preview until they say yes. Offer to copy it to `brands/default.json` if their
other repos share the design system.

## 5. Make it autonomous (no question: this is the product)
1. Write `~/.animatic/settings.json`: `{ "auto": true, "since": "<today, YYYY-MM-DD>", "review": "<their answer>" }`
2. Merge these hooks into `~/.claude/settings.json` (read it first, keep everything in it, back it up):
   - `PostToolUse`, matcher `Bash`: `node "$HOME/.claude/skills/animatic/scripts/auto-hook.mjs" post` (timeout 10)
   - `SessionStart`, matcher `startup|clear|resume`: `node "$HOME/.claude/skills/animatic/scripts/auto-hook.mjs" start` (timeout 20)
3. Test: run `echo "https://github.com/x/y/pull/1"  # gh pr create (hook test)` and confirm the hook message appears.
From now on: a PR opened from Claude Code gets its video right away; a PR opened anywhere else, or changed after
its video was made, is picked up the next time Claude Code starts in the repo.

## 6. Connect GitHub (the one thing they do with their hands)
1. `gh api repos/<OWNER>/<REPO> --jq .full_name`. An error about SAML/SSO → ask them to run
   `! gh auth refresh -h <HOST> -s repo` and click **Authorize** next to the org. Retry.
2. Say: "A browser window will open. Sign in to GitHub there (2FA is fine) and approve your company's SSO page if one
   shows up. It closes by itself." Then, with a **10-minute timeout**:
   `node ~/.claude/skills/animatic/scripts/upload.mjs --login [--org <OWNER>] [--host <HOST>]`   (`--org` only for SSO orgs)
3. Prove the upload works, posting nothing, headless like the real runs:
   ```bash
   ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=30 -t 3 -pix_fmt yuv420p /tmp/animatic-test.mp4
   node ~/.claude/skills/animatic/scripts/upload.mjs /tmp/animatic-test.mp4 --pr <one of their open PRs> --repo <OWNER>/<REPO> [--org <OWNER>] --dry-run
   ```
   Success = a block with a `user-attachments` URL. If it fails, read the screenshot path it prints, fix the
   selectors in `upload.mjs` (`findCommentBox` / `attach`), retry, and say what you changed.

## 7. First video, then get out of the way
If they have an open PR that changes the UI, make its video now (run the skill), so they see the result today.
Then tell them, in three lines:
- it's on: every PR they open gets a video in their design system, by itself;
- how to steer it: "show me videos before attaching", "pause animatic", "skip this PR", "make the captions bolder",
  or `/animatic 482` to (re)make one by hand;
- where things live: the brand profile path, and `~/.animatic/settings.json`.
