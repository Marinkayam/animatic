// node cards.mjs <dir>: renders title.png, end.png and cap-<scene>.png (transparent lower-third captions)
// from <dir>/cards.json, styled with YOUR design system's tokens (the "theme" block).
//
// cards.json:
// { "pr": 123, "date": "Jan 5, 2027", "kicker": "Checkout", "title": "...", "subtitle": "...",
//   "end": { "bullets": ["...", "..."], "branch": "feat/x" },
//   "captions": { "01-overview": "Caption text" },
//   "captionPos": { "01-overview": "right" },              // optional, default bottom-left
//   "theme": { "bg": "#f8fafc", "fg": "#1f2128", "muted": "#6b7280", "border": "#e5e7eb", "card": "#ffffff",
//              "accent": "#6366f1", "fontFamily": "Inter",
//              "fontFiles": { "400": "/abs/path/Font-Regular.woff2", "500": "...", "600": "..." } } }  // optional
import { chromium, W, H } from './rec-lib.mjs';
import fs from 'node:fs'; import path from 'node:path';
const dir = path.resolve(process.argv[2]);
const spec = JSON.parse(fs.readFileSync(path.join(dir, 'cards.json'), 'utf8'));
const t = { bg: '#f8fafc', fg: '#1f2128', muted: '#6b7280', border: '#e5e7eb', card: '#ffffff', accent: '#6366f1', fontFamily: 'system-ui', ...spec.theme };
const mime = f => ({ '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' }[path.extname(f)] ?? 'font/woff2');
const fmt = f => ({ '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' }[path.extname(f)] ?? 'woff2');
// fonts are embedded as data URLs (file:// fonts don't load in a blank page)
const faces = Object.entries(t.fontFiles ?? {}).map(([w, f]) =>
  `@font-face{font-family:K;font-weight:${w};src:url("data:${mime(f)};base64,${fs.readFileSync(f).toString('base64')}") format("${fmt(f)}")}`).join('');
const FONT = `${t.fontFiles ? 'K,' : ''}"${t.fontFamily}",system-ui,sans-serif`;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
const base = `${faces}
*{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;font-family:${FONT};color:${t.fg}}
.card{position:absolute;inset:0;background:${t.bg};display:flex;flex-direction:column;justify-content:center;padding:0 128px}
.kicker{display:inline-flex;align-items:center;gap:10px;font-size:20px;font-weight:500;color:${t.accent};margin-bottom:28px}
.dot{width:10px;height:10px;border-radius:50%;background:${t.accent}}
h1{font-size:60px;line-height:1.12;font-weight:600;letter-spacing:-.01em;max-width:1120px}
.sub{font-size:28px;line-height:1.4;color:${t.muted};margin-top:24px;max-width:1080px}
.meta{position:absolute;left:128px;bottom:80px;font-size:18px;color:${t.muted};display:flex;gap:12px;align-items:center}
.bar{position:absolute;left:0;top:0;bottom:0;width:8px;background:${t.accent}}
ul{list-style:none;padding:0;margin-top:36px;display:flex;flex-direction:column;gap:20px}
li{font-size:28px;line-height:1.35;display:flex;gap:18px;align-items:baseline;max-width:1120px}
li:before{content:"";flex:none;width:10px;height:10px;border-radius:3px;background:${t.accent};transform:translateY(-4px)}
code{font-family:ui-monospace,Menlo,monospace;font-size:17px;background:${t.card};border:1px solid ${t.border};border-radius:6px;padding:4px 10px;color:${t.fg}}`;

const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: W, height: H } });
const render = async (html, file, transparent = false) => {
  await p.setContent(`<html><head><style>${base}${transparent ? 'html,body{background:transparent}' : ''}</style></head><body>${html}</body></html>`, { waitUntil: 'load' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(dir, file), omitBackground: transparent });
};
const meta = spec.pr ? `PR #${spec.pr} · ` : '';
await render(`<div class="card"><div class="bar"></div><div class="kicker"><span class="dot"></span>${esc(spec.kicker ?? 'What changed for the user')}</div>
  <h1>${esc(spec.title)}</h1><div class="sub">${esc(spec.subtitle ?? '')}</div>
  <div class="meta">${meta}${esc(spec.date ?? '')}</div></div>`, 'title.png');
await render(`<div class="card"><div class="bar"></div><div class="kicker"><span class="dot"></span>What changed</div>
  <h1 style="font-size:48px">${esc(spec.title)}</h1><ul>${(spec.end?.bullets ?? []).map(x => `<li>${esc(x)}</li>`).join('')}</ul>
  <div class="meta">${meta}${spec.end?.branch ? `<code>${esc(spec.end.branch)}</code>` : ''}</div></div>`, 'end.png');
for (const [name, text] of Object.entries(spec.captions ?? {})) {
  const side = spec.captionPos?.[name] === 'right' ? 'right' : 'left';
  await render(`<div style="position:absolute;bottom:48px;${side}:48px;background:${t.card};border:1px solid ${t.border};border-radius:12px;
    box-shadow:0 8px 24px rgba(0,0,0,.12);padding:16px 22px;font-size:23px;font-weight:500;display:flex;gap:12px;align-items:center;max-width:820px">
    <span class="dot" style="flex:none"></span>${esc(text)}</div>`, `cap-${name}.png`, true);
}
await b.close(); console.log('cards ok:', Object.keys(spec.captions ?? {}).length, 'captions');
