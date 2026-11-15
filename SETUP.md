# Set up the /animatic skill on this machine

You are setting up a personal Claude Code skill called `animatic`. It turns a PR's UI change into a short demo video
and attaches the video to the PR as a playable embed.

This file sits in a folder (call it KIT) that also has `skill/` with `SKILL.md`, `scripts/` and `tools/`.
Find KIT from this file's own path. If `skill/` is missing, ask me where it is. Don't recreate the files.

Ground rules:
- Install **globally for me** in `~/.claude/skills/animatic/`. Nothing goes into my repo. Don't commit, don't stage,
  don't edit tracked files.
- Ask before installing system packages (e.g. `brew install ffmpeg`).
- Some steps need me at the keyboard (a browser sign-in, a `gh` authorization). Tell me what will happen before each
  one, then wait for my OK.
- Talk to me in the language I write to you in.

## Step 1: Preflight
1. Confirm the current directory is the root of a git repo (`git rev-parse --show-toplevel`) with a GitHub `origin`.
   If not, stop and tell me.
2. From `git remote get-url origin`, read the **host** (usually `github.com`) and the **owner/org**: `<HOST>`, `<ORG>`.
3. Check `node -v` (18+), `gh --version`, `ffmpeg -version`. Report anything missing and propose the install command.

## Step 2: Install the skill
```bash
mkdir -p ~/.claude/skills/animatic
cp -R "$KIT/skill/." ~/.claude/skills/animatic/
cd ~/.claude/skills/animatic
[ -f package.json ] || npm init -y >/dev/null
npm i playwright
npx playwright install chromium
chmod +x tools/*.sh
```

## Step 3: Repo hygiene (local only)
Add `.animatic/` to `.git/info/exclude` in this repo if it isn't there. That file is never committed.

## Step 4: Authorize gh
1. `gh auth status -h <HOST>`. If I'm not signed in, ask me to run `! gh auth login -h <HOST>`.
2. `gh api repos/<ORG>/<REPO> --jq .full_name`. If the error mentions SAML or SSO, ask me to run
   `! gh auth refresh -h <HOST> -s repo` and click **Authorize** next to the org on the page it opens. Retry.

## Step 5: Browser sign-in for uploads
Tell me a Chromium window is about to open where I sign in to GitHub (2FA included), and then the org's SSO page if
there is one. Run with a **10-minute timeout**:
```bash
node ~/.claude/skills/animatic/scripts/upload.mjs --login [--org <ORG>] [--host <HOST>]   # --org only for SAML/SSO orgs
```
It closes by itself. If it times out, ask me what I saw.

## Step 6: Smoke test (posts nothing)
1. `ffmpeg -y -f lavfi -i testsrc=size=1280x720:rate=30 -t 3 -pix_fmt yuv420p /tmp/animatic-test.mp4`
2. Pick one of my open PRs: `gh pr list --author @me --state open --limit 5`. None? Ask me for a PR number.
3. Run **headless** (that's how it runs for real):
   `node ~/.claude/skills/animatic/scripts/upload.mjs /tmp/animatic-test.mp4 --pr <N> --repo <ORG>/<REPO> [--org <ORG>] --dry-run`
4. Success = it prints a block with a `user-attachments` URL. Dry-run doesn't touch the PR.
5. If it fails, read the screenshot path it prints, diagnose (page layout, SSO state, the selectors in
   `findCommentBox` / `attach`), fix `upload.mjs` in the skill folder, retry, and tell me what you changed.

## Step 7: Optional auto mode
Ask me: "Make a video automatically for every PR you open, without asking?" Only if I say yes:
1. `mkdir -p ~/.animatic && date +%F > ~/.animatic/auto-since`
2. Merge these hooks into `~/.claude/settings.json` (read it first, keep everything that's there, back it up):
   - `PostToolUse`, matcher `Bash`: `node "$HOME/.claude/skills/animatic/scripts/auto-hook.mjs" post` (timeout 10)
   - `SessionStart`, matcher `startup|clear|resume`: `node "$HOME/.claude/skills/animatic/scripts/auto-hook.mjs" start` (timeout 20)
3. Test: run `echo "https://github.com/x/y/pull/1"  # gh pr create (hook test)` and confirm the hook message appears.
   Turning it off later = delete `~/.animatic/auto-since`.

## Step 8: Report
Briefly: what got installed and where, whether the smoke test passed, whether auto mode is on, and how to use it:
`/animatic`, `/animatic 482`, `/animatic 482 483`.
