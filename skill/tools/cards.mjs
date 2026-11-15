// node cards.mjs <dir>            renders title.png, end.png and cap-<scene>.png (transparent lower-third captions)
//                                  from <dir>/cards.json
// node cards.mjs --preview <dir>  renders sample cards + preview.png, to check a brand profile during setup
//
// The look comes from the repo's brand profile (see brand.mjs / brand.schema.md), then cards.json "theme" overrides.
//
// cards.json:
// { "pr": 123, "date": "Jan 5, 2027", "kicker": "Checkout", "title": "...", "subtitle": "...",
//   "end": { "bullets": ["...", "..."], "branch": "feat/x" },
//   "captions": { "01-overview": "Caption text" },
//   "captionPos": { "01-overview": "right" },              // optional: left (default) | right | top-left | top-right
//   "theme": { optional per-video overrides of the brand profile:
//              "bg": "#f8fafc", "fg": "#1f2128", "muted": "#6b7280", "border": "#e5e7eb", "card": "#ffffff",
//              "accent": "#6366f1", "fontFamily": "Inter",
//              "fontImport": "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600",   // optional, a web font
//              "fontFiles": { "400": "/abs/path/Font-Regular.woff2", "500": "...", "600": "..." } } }  // optional
import { chromium, W, H } from './rec-lib.mjs';
import { loadBrand, themeFromBrand } from './brand.mjs';
import fs from 'node:fs'; import path from 'node:path';
const preview = process.argv[2] === '--preview';
const dir = path.resolve(process.argv[preview ? 3 : 2]);
fs.mkdirSync(dir, { recursive: true });
const SAMPLE = { pr: 128, date: 'Preview', kicker: 'Checkout · Payments', title: 'Pay in one step, with saved cards',
  subtitle: 'Returning customers pick a saved card and pay without leaving the cart.',
  end: { bullets: ['Saved cards right in the cart', 'One tap to pay', 'Clear errors when a card is declined'], branch: 'feat/one-step-pay' },
  captions: { '01-sample': 'Pick a saved card and pay in one tap' } };
const spec = preview ? SAMPLE : JSON.parse(fs.readFileSync(path.join(dir, 'cards.json'), 'utf8'));
const brand = loadBrand(dir);
const t = { bg: '#f8fafc', fg: '#1f2128', muted: '#6b7280', border: '#e5e7eb', card: '#ffffff', accent: '#6366f1', fontFamily: 'system-ui',
  radius: 12, titleWeight: 600, captionWeight: 500, titleCase: 'none', ...themeFromBrand(brand), ...spec.theme };
if (brand._path) console.log('brand:', brand._path);
const mime = f => ({ '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf' }[path.extname(f)] ?? 'font/woff2');
const fmt = f => ({ '.woff2': 'woff2', '.woff': 'woff', '.ttf': 'truetype', '.otf': 'opentype' }[path.extname(f)] ?? 'woff2');
// fonts are embedded as data URLs (file:// fonts don't load in a blank page)
const faces = Object.entries(t.fontFiles ?? {}).map(([w, f]) =>
  `@font-face{font-family:K;font-weight:${w};src:url("data:${mime(f)};base64,${fs.readFileSync(f).toString('base64')}") format("${fmt(f)}")}`).join('');
const FONT = `${t.fontFiles ? 'K,' : ''}"${t.fontFamily}",system-ui,sans-serif`;
const esc = s => String(s).replace(/[&<>]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;' }[c]));
const imp = t.fontImport ? `@import url("${t.fontImport}");` : '';
const base = `${imp}${faces}
*{box-sizing:border-box;margin:0}html,body{width:${W}px;height:${H}px;font-family:${FONT};color:${t.fg}}
.card{position:absolute;inset:0;background:${t.bg};display:flex;flex-direction:column;justify-content:center;padding:0 128px}
.kicker{display:inline-flex;align-items:center;gap:10px;font-size:20px;font-weight:500;color:${t.accent};margin-bottom:28px}
.dot{width:10px;height:10px;border-radius:50%;background:${t.accent}}
h1{font-size:60px;line-height:1.12;font-weight:${t.titleWeight};text-transform:${t.titleCase};letter-spacing:-.01em;max-width:1120px}
.sub{font-size:28px;line-height:1.4;color:${t.muted};margin-top:24px;max-width:1080px}
.meta{position:absolute;left:128px;bottom:80px;font-size:18px;color:${t.muted};display:flex;gap:12px;align-items:center}
.bar{position:absolute;left:0;top:0;bottom:0;width:8px;background:${t.accent}}
ul{list-style:none;padding:0;margin-top:36px;display:flex;flex-direction:column;gap:20px}
li{font-size:28px;line-height:1.35;display:flex;gap:18px;align-items:baseline;max-width:1120px}
li:before{content:"";flex:none;width:10px;height:10px;border-radius:3px;background:${t.accent};transform:translateY(-4px)}
code{font-family:ui-monospace,Menlo,monospace;font-size:17px;background:${t.card};border:1px solid ${t.border};border-radius:${Math.min(t.radius, 8)}px;padding:4px 10px;color:${t.fg}}`;

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
  const pos = spec.captionPos?.[name] ?? 'left';               // left | right | top-left | top-right
  const side = pos.endsWith('right') ? 'right' : 'left', edge = pos.startsWith('top') ? 'top:104px' : 'bottom:48px';
  await render(`<div style="position:absolute;${edge};${side}:48px;background:${t.card};border:1px solid ${t.border};border-radius:${t.radius}px;
    box-shadow:0 8px 24px rgba(0,0,0,.12);padding:16px 22px;font-size:23px;font-weight:${t.captionWeight};display:flex;gap:12px;align-items:center;max-width:820px">
    <span class="dot" style="flex:none"></span>${esc(text)}</div>`, `cap-${name}.png`, true);
}
if (preview) { // title + a caption over a neutral frame, side by side, for the designer to approve
  await p.setContent(`<html><body style="margin:0;background:#111;display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px;width:${W}px;height:${H / 2 + 32}px;box-sizing:border-box">
    <img src="data:image/png;base64,${fs.readFileSync(path.join(dir, 'title.png')).toString('base64')}" style="width:100%">
    <div style="position:relative;background:repeating-linear-gradient(45deg,#e9e9e9 0 12px,#f3f3f3 12px 24px)"><img src="data:image/png;base64,${fs.readFileSync(path.join(dir, 'cap-01-sample.png')).toString('base64')}" style="position:absolute;inset:0;width:100%"></div></body></html>`);
  await p.screenshot({ path: path.join(dir, 'preview.png'), clip: { x: 0, y: 0, width: W, height: Math.round((W - 48) / 2 * H / W) + 32 } });
  console.log('preview:', path.join(dir, 'preview.png'));
}
await b.close(); console.log('cards ok:', Object.keys(spec.captions ?? {}).length, 'captions');
