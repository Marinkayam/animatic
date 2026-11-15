#!/usr/bin/env node
// Optional auto mode: every PR you open gets a video without asking. Wired as Claude Code hooks (see SETUP.md).
//   node auto-hook.mjs post    PostToolUse(Bash): a PR was just created -> tell Claude to make its video now
//   node auto-hook.mjs start   SessionStart: your open PRs (opened since auto mode was turned on) with no video yet
// Never blocks anything: any error prints nothing.
// Skip a PR for good: add "owner/repo#N" as a line in ~/.animatic/skip.txt
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

const HOME = path.join(os.homedir(), '.animatic');
const SINCE = (() => { try { return fs.readFileSync(path.join(HOME, 'auto-since'), 'utf8').trim(); } catch { return null; } })();
const SKIP_FILE = path.join(HOME, 'skip.txt');
const PR_RE = /https:\/\/[\w.-]+\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
const skipped = () => { try { return new Set(fs.readFileSync(SKIP_FILE, 'utf8').split('\n').map(s => s.trim()).filter(Boolean)); } catch { return new Set(); } };

const instruction = prs => [
  `ANIMATIC AUTO MODE (the user's standing rule; they never need to ask): ${prs.length === 1 ? 'this PR has' : 'these PRs have'} no demo video yet:`,
  ...prs.map(p => `- ${p.repo}#${p.n}${p.title ? ` "${p.title}"` : ''}`),
  `Run the animatic skill for each one now in Auto mode (see "Auto mode" in ~/.claude/skills/animatic/SKILL.md):`,
  `no storyboard approval, attach to the PR without asking, then report the PR link in one line.`,
  `If you are a subagent without the Skill tool, write "animatic pending: <repo>#<n>" in your final report.`,
  `No user-visible change (docs, tooling, types only)? Add "<repo>#<n>" to ~/.animatic/skip.txt and say so in one line.`,
].join('\n');
const emit = (event, text) => process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: event, additionalContext: text } }));

function post(input) {
  if (!SINCE || !/\bgh\s+pr\s+create\b/.test(String(input?.tool_input?.command ?? ''))) return;
  const s = skipped(), seen = new Map();
  for (const m of JSON.stringify(input?.tool_response ?? '').matchAll(PR_RE))
    if (!s.has(`${m[1]}#${m[2]}`)) seen.set(`${m[1]}#${m[2]}`, { repo: m[1], n: m[2] });
  if (seen.size) emit('PostToolUse', instruction([...seen.values()]));
}

function start() {
  if (!SINCE) return;
  const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).trim();
  const repo = gh('repo', 'view', '--json', 'nameWithOwner', '-q', '.nameWithOwner');
  const prs = JSON.parse(gh('pr', 'list', '--repo', repo, '--author', '@me', '--state', 'open', '--limit', '30', '--json', 'number,title,body,createdAt,isDraft'));
  const s = skipped();
  const todo = prs.filter(p => !p.isDraft && p.createdAt.slice(0, 10) >= SINCE && !(p.body ?? '').includes('<!-- animatic:start -->') && !s.has(`${repo}#${p.number}`))
    .map(p => ({ repo, n: String(p.number), title: p.title }));
  if (todo.length) emit('SessionStart', instruction(todo));
}

try { const m = process.argv[2]; if (m === 'post') post(JSON.parse(fs.readFileSync(0, 'utf8') || '{}')); else if (m === 'start') start(); } catch { /* never break the session */ }
