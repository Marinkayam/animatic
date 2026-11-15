// Brand profile: how videos look and sound for one repo's design system.
// Lives at ~/.claude/skills/animatic/brands/<owner>-<repo>.json (made during setup, see SETUP.md "Adapt to your design
// system"). ANIMATIC_BRAND=/path/to/brand.json overrides it. Schema: skill/brand.schema.md
import { execFileSync } from 'node:child_process';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';

export const BRANDS_DIR = path.join(os.homedir(), '.claude', 'skills', 'animatic', 'brands');

export function repoSlug(cwd = process.cwd()) {
  try {
    const url = execFileSync('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const m = url.match(/[:/]([^/:]+)\/([^/]+?)(\.git)?$/);
    return m ? `${m[1]}-${m[2]}`.toLowerCase() : null;
  } catch { return null; }
}

export function brandPath(cwd = process.cwd()) {
  if (process.env.ANIMATIC_BRAND) return path.resolve(process.env.ANIMATIC_BRAND);
  const slug = repoSlug(cwd);
  const own = slug && path.join(BRANDS_DIR, `${slug}.json`);
  if (own && fs.existsSync(own)) return own;
  const def = path.join(BRANDS_DIR, 'default.json');
  return fs.existsSync(def) ? def : null;
}

export function loadBrand(cwd = process.cwd()) {
  const p = brandPath(cwd);
  if (!p) return {};
  try { return { ...JSON.parse(fs.readFileSync(p, 'utf8')), _path: p }; } catch (e) { throw new Error(`Brand profile ${p} is not valid JSON: ${e.message}`); }
}

// brand -> the theme cards.mjs understands
export function themeFromBrand(b = {}) {
  const c = b.colors ?? {}, f = b.font ?? {};
  const t = { bg: c.background, fg: c.foreground, muted: c.muted, border: c.border, card: c.card, accent: c.accent,
    fontFamily: f.family, fontFiles: f.files, fontImport: f.import, radius: b.radius, captionWeight: f.captionWeight,
    titleWeight: f.titleWeight, titleCase: b.cards?.titleCase };
  return Object.fromEntries(Object.entries(t).filter(([, v]) => v != null));
}

export function hexToRgb(hex) {
  const m = String(hex ?? '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map(x => x + x).join('') : m[1];
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(',');
}
