#!/usr/bin/env node
// animatic runs by itself. These Claude Code hooks (installed by SETUP.md) are what make it autonomous:
//   node auto-hook.mjs post    PostToolUse(Bash): a PR was just created            -> make its video now
//   node auto-hook.mjs start   SessionStart: my open PRs with no video, or whose code
//                              changed since the video was made                    -> make / refresh them
// Settings (written once, during setup): ~/.animatic/settings.json
//   { "auto": true, "since": "2027-01-05", "review": "none" | "video" | "storyboard" }
//   review: "none"  = make and attach without asking (the default)
//           "video" = make it, show it, attach on my yes        "storyboard" = also show the storyboard first
// Never blocks anything: any error prints nothing.   Pause: set "auto": false.   Skip one PR: add "owner/repo#N"
// as a line in ~/.animatic/skip.txt
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const HOME = process.env.ANIMATIC_HOME ?? path.join(os.homedir(), '.animatic');   // ANIMATIC_HOME: for tests
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(HOME, f), 'utf8')); } catch { return d; } };
const SET = read('settings.json', null);
const STATE = read('state.json', {});            // "owner/repo#n" -> { sha } written by upload.mjs after each attach
const PR_RE = /https:\/\/[\w.-]+\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
const skipped = () => { try { return new Set(fs.readFileSync(path.join(HOME, 'skip.txt'), 'utf8').split('\n').map(s => s.trim()).filter(Boolean)); } catch { return new Set(); } };

const HOW = {
  none: 'Do not ask anything: no storyboard approval, attach to the PR yourself, then report the PR link in one line.',
  video: 'Make the video without asking, then show it and attach only on their yes.',
  storyboard: 'Show the storyboard and wait for a yes, make the video, show it, and attach on their yes.',
};
const instruction = (make, refresh) => [
  `ANIMATIC (the user set this up to run by itself; they never need to ask):`,
  ...(make.length ? [`These PRs have no demo video yet:`, ...make.map(p => `- ${p.repo}#${p.n}${p.title ? ` "${p.title}"` : ''}`)] : []),
  ...(refresh.length ? [`These PRs changed since their video was made; refresh the video (rerun .animatic/<slug>/record.mjs, re-record only the scenes the new commits touch):`, ...refresh.map(p => `- ${p.repo}#${p.n}${p.title ? ` "${p.title}"` : ''}`)] : []),
  `Run the animatic skill for each one now (~/.claude/skills/animatic/SKILL.md), in this repo's brand profile.`,
  HOW[SET?.review] ?? HOW.none,
  `Finish what the user asked for first if you are mid-task, then do this before ending the turn.`,
  `If you are a subagent without the Skill tool, write "animatic pending: <repo>#<n>" in your final report.`,
  `No user-visible change (docs, tooling, types only)? Add "<repo>#<n>" to ~/.animatic/skip.txt and say so in one line.`,
].join('\n');
const emit = (event, text) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));

function post(input) {
  if (!/\bgh\s+pr\s+create\b/.test(String(input?.tool_input?.command ?? ''))) return;
  const s = skipped(), seen = new Map();
  for (const m of JSON.stringify(input?.tool_response ?? '').matchAll(PR_RE))
    if (!s.has(`${m[1]}#${m[2]}`)) seen.set(`${m[1]}#${m[2]}`, { repo: m[1], n: m[2] });
  if (seen.size) emit('PostToolUse', instruction([...seen.values()], []));
}

function start() {
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
  const repo = gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
  const prs = JSON.parse(gh('pr', 'list', '--repo', repo, '--author', '@me', '--state', 'open', '--limit', '30', '--json', 'number,title,body,createdAt,isDraft,headRefOid'));
  const s = skipped(), make = [], refresh = [];
  for (const p of prs) {
    const id = `${repo}#${p.number}`, item = { repo, n: String(p.number), title: p.title };
    if (p.isDraft || s.has(id)) continue;
    const has = (p.body ?? '').includes('<!-- animatic:start -->');
    if (!has) { if (p.createdAt.slice(0, 10) >= (SET.since ?? '0000')) make.push(item); }
    else if (STATE[id]?.sha && p.headRefOid && STATE[id].sha !== p.headRefOid) refresh.push(item);
  }
  if (make.length || refresh.length) emit('SessionStart', instruction(make, refresh));
}

try {
  if (SET?.auto) { const m = process.argv[2]; if (m === 'post') post(JSON.parse(fs.readFileSync(0, 'utf8') || '{}')); else if (m === 'start') start(); }
} catch { /* never break the session */ }
