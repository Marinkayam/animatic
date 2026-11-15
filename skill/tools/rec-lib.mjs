// Shared recording helpers for an animatic record.mjs: one browser context per scene = one clip per scene,
// a visible cursor, smooth moves, highlight rings, and dev overlays hidden.
import { createRequire } from 'node:module'; import os from 'node:os'; import fs from 'node:fs'; import path from 'node:path';
export const SKILL_DIR = path.join(os.homedir(), '.claude', 'skills', 'animatic');
export const { chromium } = createRequire(path.join(SKILL_DIR, 'package.json'))('playwright');
import { loadBrand, hexToRgb } from './brand.mjs';
export const brand = loadBrand();
export const W = 1440, H = 900;
// Highlight colour "r,g,b": ANIMATIC_ACCENT_RGB, else the brand's accent, else indigo.
const ACCENT = process.env.ANIMATIC_ACCENT_RGB ?? hexToRgb(brand.colors?.accent) ?? '99,102,241';
// CSS selectors hidden while recording: common dev overlays + the brand's list + ANIMATIC_HIDE (comma separated).
const HIDE = ['.TanStackRouterDevtools', '#react-query-devtools', '.tsqd-parent-container', 'vercel-live-feedback',
  '[data-nextjs-toast]', 'nextjs-portal', ...(brand.record?.hide ?? []),
  ...(process.env.ANIMATIC_HIDE ?? '').split(',').filter(Boolean)].join(',');

const init = hide => {
  const css = document.createElement('style');
  css.textContent = `${hide}{display:none!important}`;
  const c = document.createElement('div'); c.id = '__cursor';
  Object.assign(c.style, { position:'fixed', zIndex:2147483647, width:'18px', height:'18px', borderRadius:'50%',
    background:'rgba(17,17,17,.85)', border:'2px solid #fff', boxShadow:'0 1px 4px rgba(0,0,0,.3)',
    pointerEvents:'none', transform:'translate(-50%,-50%)', transition:'width .12s,height .12s', left:'-40px', top:'-40px' });
  const add = () => { if (!document.body) return; if (!document.getElementById('__cursor')) document.body.appendChild(c); if (!css.isConnected) document.head.appendChild(css); };
  document.addEventListener('DOMContentLoaded', add); add();
  addEventListener('mousemove', e => { c.style.left = e.clientX+'px'; c.style.top = e.clientY+'px'; }, true);
  addEventListener('mousedown', () => { c.style.width = c.style.height = '12px'; }, true);
  addEventListener('mouseup',   () => { c.style.width = c.style.height = '18px'; }, true);
};

export function helpers(page, BASE) {
  const center = async loc => { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); return [b.x + b.width/2, b.y + b.height/2]; };
  return {
    // returns ms until the page was ready; the clip is trimmed to start there
    go: async (p, t0 = Date.now()) => { await page.goto(BASE + p, { waitUntil:'networkidle' }); await page.waitForTimeout(400); await page.mouse.move(W/2, H/2); return Date.now() - t0; },
    move: async loc => { const [x,y] = await center(loc); await page.mouse.move(x, y, { steps: 28 }); await page.waitForTimeout(200); },
    click: async function (loc) { await this.move(loc); await page.mouse.down(); await page.waitForTimeout(80); await page.mouse.up(); await page.waitForTimeout(500); },
    type: async (loc, text) => { await loc.click(); await loc.pressSequentially(text, { delay: 55 }); await page.waitForTimeout(300); },
    // smooth-scroll so the element's top sits `top` px below the top of the viewport
    scrollTo: async (loc, top = 120) => { await loc.evaluate((el, top) => window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - top, behavior: 'smooth' }), top); await page.waitForTimeout(900); },
    highlight: async (loc, ms = 1400) => {
      await loc.evaluate((el, [ms, rgb]) => { const o = el.style.boxShadow, t = el.style.transition;
        el.style.transition = 'box-shadow .2s'; el.style.boxShadow = `0 0 0 3px rgba(${rgb},.9), 0 0 0 8px rgba(${rgb},.18)`;
        setTimeout(() => { el.style.boxShadow = o; el.style.transition = t; }, ms); }, [ms, ACCENT]);
      await page.waitForTimeout(ms + 200);
    },
    pause: ms => page.waitForTimeout(ms),
  };
}

// scene(browser, outDir, baseUrl, '01-name', async (page, h) => { const ready = await h.go('/route'); ...; return ready; })
export async function scene(browser, OUT, BASE, name, fn) {
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await browser.newContext({ viewport:{width:W,height:H}, recordVideo:{ dir:OUT, size:{width:W,height:H} } });
  await ctx.addInitScript(init, HIDE);
  const page = await ctx.newPage();
  const t0 = Date.now();
  const readyAt = await fn(page, helpers(page, BASE)) ?? 0;
  await page.waitForTimeout(900);
  const total = Date.now() - t0;
  await ctx.close();
  await page.video().saveAs(`${OUT}/${name}.webm`);
  fs.rmSync(await page.video().path(), { force: true });
  fs.writeFileSync(`${OUT}/${name}.json`, JSON.stringify({ trimStart: readyAt / 1000, total: total / 1000 }));
  console.log(`scene ${name}: ready ${(readyAt/1000).toFixed(1)}s, total ${(total/1000).toFixed(1)}s`);
}
