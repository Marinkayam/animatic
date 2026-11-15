#!/usr/bin/env node
// animatic-upload — attach a demo video to a GitHub PR as a real, playable embed.
//
// GitHub has no public API for comment/PR attachments, so this drives the same
// upload the web UI uses (drag a file into the comment box) in a Playwright
// browser that keeps your GitHub sign-in in a local profile. It grabs the
// resulting attachment URL, clears the draft, and writes the
// video into the PR description (or a comment) with `gh`.
//
// Unofficial: GitHub has no API for this, so it automates the web UI and may break when GitHub changes it.
//
// Usage:
//   node upload.mjs --login                       # once: sign in to GitHub (2FA ok)
//   node upload.mjs .animatic/my-feature/animatic.mp4   # PR of the current branch
//   node upload.mjs video.mp4 --pr 482            # specific PR
//   node upload.mjs video.mp4 --pr 482 --comment  # post as a comment instead
//   node upload.mjs video.mp4 --pr 482 --dry-run  # upload only, print markdown
//
// Options: --repo owner/name  --title "How it works"  --headed  --profile <dir>
//
// Organization accounts:
//   --org acme-inc        SAML/SSO-protected org: --login also walks you through the
//                         org's SSO page, and uploads check the SSO session is alive.
//   --host <hostname>     GitHub Enterprise Server (e.g. github.company.com).
//                         Also sets GH_HOST for gh. Default: github.com
//   --login-url <url>     Custom sign-in page, e.g. an Enterprise Managed Users SSO
//                         link (https://github.com/enterprises/<name>/sso).
// Defaults can live in env: ANIMATIC_GH_HOST, ANIMATIC_GH_ORG, ANIMATIC_GH_LOGIN_URL.
// Needs: Node 18+, playwright (+ `npx playwright install chromium`), gh (signed in).

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const START = '<!-- animatic:start -->';
const END = '<!-- animatic:end -->';
const URL_RE = /https?:\/\/[^\s<>()\[\]"']+/g; // any URL; the new one after upload is the asset
const TYPES = { '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm', '.gif': 'image/gif' };

// ---------- pure helpers (exported for tests) ----------
export function parseArgs(argv) {
  const o = { file: null, pr: null, repo: null, comment: false, login: false, headed: false, dryRun: false,
    title: '🎬 How it works', profile: null,
    host: process.env.ANIMATIC_GH_HOST || 'github.com', org: process.env.ANIMATIC_GH_ORG || null,
    loginUrl: process.env.ANIMATIC_GH_LOGIN_URL || null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') o.pr = argv[++i];
    else if (a === '--repo') o.repo = argv[++i];
    else if (a === '--title') o.title = argv[++i];
    else if (a === '--profile') o.profile = argv[++i];
    else if (a === '--host') o.host = argv[++i];
    else if (a === '--org') o.org = argv[++i];
    else if (a === '--login-url') o.loginUrl = argv[++i];
    else if (a === '--comment') o.comment = true;
    else if (a === '--login') o.login = true;
    else if (a === '--headed') o.headed = true;
    else if (a === '--dry-run') o.dryRun = true;
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else o.file = a;
  }
  o.host = o.host.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  o.profile ??= path.join(os.homedir(), '.animatic', `profile-${o.host}`); // one sign-in per host
  o.loginUrl ??= `https://${o.host}/login`;
  return o;
}

export function animaticBlock(url, title) {
  return `${START}\n### ${title}\n\n${url}\n${END}`;
}

// Replace an existing animatic block, or put a new one at the top of the body.
export function mergeBody(body, block) {
  body = body ?? '';
  const s = body.indexOf(START), e = body.indexOf(END);
  if (s !== -1 && e > s) return body.slice(0, s) + block + body.slice(e + END.length);
  return body.trim() ? `${block}\n\n${body}` : block;
}

export function newAssetUrl(before, after) {
  const old = new Set(before.match(URL_RE) ?? []);
  return (after.match(URL_RE) ?? []).find(u => !old.has(u)) ?? null;
}

// ---------- gh ----------
let GH_ENV = process.env;
const gh = (...a) => {
  try { return execFileSync('gh', a, { encoding: 'utf8', env: GH_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
  catch (e) {
    const msg = String(e.stderr || e.message);
    if (/SAML|SSO/i.test(msg)) throw new Error(`gh's token isn't authorized for the org's SSO. Run: gh auth refresh -h ${GH_ENV.GH_HOST || 'github.com'} -s repo  — then authorize the org on the page it opens.\n${msg}`);
    throw new Error(msg);
  }
};

function resolveTarget(o) {
  const repo = o.repo ?? gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
  const pr = o.pr ?? gh('pr', 'view', '--repo', repo, '--json', 'number', '-q', '.number');
  if (!pr) throw new Error('No PR for this branch. Pass --pr <number>.');
  return { repo, pr: String(pr) };
}

function writeToPr({ repo, pr }, md, asComment) {
  const tmp = path.join(os.tmpdir(), `animatic-${process.pid}.md`);
  if (asComment) {
    fs.writeFileSync(tmp, md);
    gh('pr', 'comment', pr, '--repo', repo, '--body-file', tmp);
  } else {
    const body = gh('pr', 'view', pr, '--repo', repo, '--json', 'body', '-q', '.body');
    fs.writeFileSync(tmp, mergeBody(body, md));
    gh('pr', 'edit', pr, '--repo', repo, '--body-file', tmp);
  }
  fs.rmSync(tmp, { force: true });
}

// Remember which commit the video shows, so the SessionStart hook can tell when a PR has moved on.
function rememberVideo({ repo, pr }) {
  try {
    const sha = gh('pr', 'view', pr, '--repo', repo, '--json', 'headRefOid', '-q', '.headRefOid');
    const dir = path.join(os.homedir(), '.animatic'), file = path.join(dir, 'state.json');
    fs.mkdirSync(dir, { recursive: true });
    let state = {}; try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
    state[`${repo}#${pr}`] = { sha, at: new Date().toISOString() };
    fs.writeFileSync(file, JSON.stringify(state, null, 1));
  } catch { /* the video is attached either way */ }
}

// ---------- browser ----------
// The skill's own Playwright first (its browser matches the saved sign-in profile), then wherever else it is.
async function loadPlaywright() {
  const here = path.dirname(new URL(import.meta.url).pathname);
  const roots = [path.join(here, '..'), path.join(os.homedir(), '.claude', 'skills', 'animatic'), process.cwd()];
  for (const root of roots) {
    if (!fs.existsSync(path.join(root, 'node_modules', 'playwright'))) continue;   // only a Playwright installed right there
    try { const m = await import(pathToFileURL(createRequire(path.join(root, 'package.json')).resolve('playwright')).href); return m.chromium ? m : m.default; } catch {}
  }
  try { const m = await import('playwright'); return m.chromium ? m : m.default; }
  catch { throw new Error('Playwright is not installed. Run: cd ~/.claude/skills/animatic && npm i playwright && npx playwright install chromium'); }
}

async function signedInUser(page) {
  try { return await page.evaluate(() => document.querySelector('meta[name="user-login"]')?.content || ''); }
  catch { return ''; } // page mid-navigation
}

const onSsoPage = (page, host) => { const u = new URL(page.url()); return u.hostname !== host || /\/sso\b/.test(u.pathname); };

async function login(chromium, o) {
  fs.mkdirSync(o.profile, { recursive: true });
  const ctx = await chromium.launchPersistentContext(o.profile, { headless: false, viewport: null });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  const wait = async (done, what) => {
    const until = Date.now() + 5 * 60_000;
    while (Date.now() < until) { await page.waitForTimeout(1000); if (await done()) return; }
    await ctx.close(); throw new Error(`Timed out waiting for ${what}.`);
  };
  await page.goto(o.loginUrl);
  console.log(`Sign in on ${o.host} in the browser window (company SSO / 2FA included). It closes by itself.`);
  let user = '';
  await wait(async () => !onSsoPage(page, o.host) && (user = await signedInUser(page)), 'sign-in');
  if (o.org) {
    // SAML orgs need a separate SSO session on top of the GitHub sign-in.
    const resp = await page.goto(`https://${o.host}/orgs/${o.org}/sso`).catch(() => null);
    await page.waitForTimeout(1500);
    if (resp?.status() === 404 || !onSsoPage(page, o.host)) {
      console.log(`${o.org}: no SSO step needed (none required, or already authorized).`);
    } else {
      console.log(`Now authorize the ${o.org} organization (SSO) in the same window.`);
    }
    if (onSsoPage(page, o.host) && resp?.status() !== 404) await wait(async () => {
      if (onSsoPage(page, o.host)) return false;
      await page.goto(`https://${o.host}/${o.org}`).catch(() => {});
      return !onSsoPage(page, o.host) && !!(await signedInUser(page));
    }, `${o.org} SSO`);
  }
  await ctx.close();
  console.log(`Signed in as ${user}${o.org ? ` with ${o.org} SSO` : ''}. Session kept in ${o.profile}`);
}

const BOX_SELECTORS = [
  'textarea#new_comment_field',
  'textarea[name="comment[body]"]',
  'textarea[aria-label*="comment" i]',
  'textarea[placeholder*="comment" i]',
];

async function findCommentBox(page) {
  for (let t = 0; t < 20; t++) {
    for (const sel of BOX_SELECTORS) {
      const loc = page.locator(sel);
      for (let i = 0, n = await loc.count(); i < n; i++) {
        if (await loc.nth(i).isVisible()) return loc.nth(i);
      }
    }
    await page.mouse.wheel(0, 4000); // the new-comment box sits at the bottom of the timeline
    await page.waitForTimeout(750);
  }
  throw new Error('Could not find the PR comment box.');
}

async function attach(page, box, file) {
  const input = box.locator('xpath=ancestor::form[1]//input[@type="file"]').first();
  if (await input.count()) { await input.setInputFiles(file); return; }
  // React UI fallback: drop the file onto the textarea, like a real drag-and-drop.
  const payload = { b64: fs.readFileSync(file).toString('base64'), name: path.basename(file),
    type: TYPES[path.extname(file).toLowerCase()] };
  await box.evaluate((el, { b64, name, type }) => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], name, { type }));
    for (const ev of ['dragenter', 'dragover', 'drop'])
      el.dispatchEvent(new DragEvent(ev, { bubbles: true, cancelable: true, dataTransfer: dt }));
  }, payload);
}

async function uploadViaBrowser(chromium, o, { repo, pr }) {
  const relogin = `node upload.mjs --login${o.org ? ` --org ${o.org}` : ''}${o.host !== 'github.com' ? ` --host ${o.host}` : ''}`;
  if (!fs.existsSync(o.profile)) throw new Error(`Not signed in yet. Run once: ${relogin}`);
  // channel 'chromium' = the full browser in new headless mode. The default headless shell uses a mock keychain on
  // macOS, so it can't decrypt the cookies the headed --login saved and every headless run looks signed out.
  const ctx = await chromium.launchPersistentContext(o.profile, { channel: 'chromium', headless: !o.headed, viewport: { width: 1400, height: 1000 } });
  const page = ctx.pages()[0] ?? await ctx.newPage();
  try {
    await page.goto(`https://${o.host}/${repo}/pull/${pr}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500); // let SSO redirects settle
    if (onSsoPage(page, o.host)) throw new Error(`The organization's SSO session expired. Run: ${relogin}`);
    if (!(await signedInUser(page))) throw new Error(`Session expired. Run: ${relogin}`);
    const box = await findCommentBox(page);
    await box.scrollIntoViewIfNeeded();
    await box.click();
    const before = await box.inputValue();
    await attach(page, box, o.file);

    const until = Date.now() + 10 * 60_000; // big videos take a while
    let url = null;
    while (!url && Date.now() < until) {
      await page.waitForTimeout(1500);
      const now = await box.inputValue();
      url = newAssetUrl(before, now);
      const rejected = await page.getByText(/(file is too big|not supported|something went (really )?wrong)/i).first().isVisible().catch(() => false);
      if (!url && rejected) throw new Error('GitHub rejected the upload (size or type).');
    }
    if (!url) throw new Error('Upload did not finish within 10 minutes.');
    await box.fill(before); // leave no draft comment behind
    return url;
  } catch (err) {
    const shot = path.join(os.tmpdir(), 'animatic-upload-error.png'); // never inside the repo
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    err.message += `\nScreenshot of the page: ${shot}`;
    throw err;
  } finally {
    await ctx.close();
  }
}

// ---------- main ----------
async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.host !== 'github.com') GH_ENV = { ...process.env, GH_HOST: o.host };
  const { chromium } = await loadPlaywright();
  if (o.login) { await login(chromium, o); if (!o.file) return; }
  if (!o.file) throw new Error('Pass a video file, e.g. node upload.mjs .animatic/my-feature/animatic.mp4');
  if (!fs.existsSync(o.file)) throw new Error(`File not found: ${o.file}`);
  const ext = path.extname(o.file).toLowerCase();
  if (!TYPES[ext]) throw new Error(`Unsupported type ${ext}. Use .mp4, .mov, .webm or .gif`);
  const mb = fs.statSync(o.file).size / 1e6;
  if (mb > 100) throw new Error(`${mb.toFixed(1)} MB is over GitHub's 100 MB video limit. Re-encode with a higher CRF.`);
  if (mb > 10) console.warn(`Note: ${mb.toFixed(1)} MB. Free GitHub plans cap videos at 10 MB; paid plans allow 100 MB.`);

  const target = resolveTarget(o);
  console.log(`Uploading ${path.basename(o.file)} to ${target.repo}#${target.pr}…`);
  const url = await uploadViaBrowser(chromium, o, target);
  const md = animaticBlock(url, o.title);
  if (o.dryRun) { console.log(`\n${md}\n`); return; }
  writeToPr(target, md, o.comment);
  rememberVideo(target);
  console.log(`Done: video ${o.comment ? 'posted as a comment on' : 'added to the description of'} https://${o.host}/${target.repo}/pull/${target.pr}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => { console.error(`✖ ${err.message}`); process.exit(1); });
}
