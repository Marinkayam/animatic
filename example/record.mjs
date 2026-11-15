// The recording script Claude writes for a PR. This one records the Orbit example app (example/app/index.html).
// Run from the kit folder: ANIMATIC_BRAND=example/brand.json node example/record.mjs
import { chromium, scene } from '../skill/tools/rec-lib.mjs';
const OUT = new URL('./out/', import.meta.url).pathname;
const BASE = new URL('./app', import.meta.url).href; // file:// here; for a real app use http://localhost:<port>
const b = await chromium.launch();
const card = (page, name) => page.getByRole('article', { name });

await scene(b, OUT, BASE, '01-overview', async (page, h) => {
  const t0 = Date.now(); await page.goto(BASE + '/index.html', { waitUntil: 'domcontentloaded' });
  const ready = Date.now() - t0;                       // start before networkidle, so the chart's rise is on camera
  await page.waitForLoadState('networkidle'); await page.mouse.move(720, 450);
  await h.pause(1600);
  await h.move(page.getByRole('figure', { name: 'Roles posted on the platform' })); await h.pause(1800);
  return ready;
});
await scene(b, OUT, BASE, '02-filters', async (page, h) => {
  const ready = await h.go('/index.html'); await h.pause(500);
  await h.highlight(page.getByRole('group', { name: 'Active filters' }), 1000);
  await h.click(page.getByRole('button', { name: 'Remove Mid–Senior' })); await h.pause(900);
  await h.move(page.locator('#total')); await h.highlight(page.locator('#total').locator('xpath=../..'), 1300);
  return ready;
});
await scene(b, OUT, BASE, '03-match', async (page, h) => {
  const ready = await h.go('/index.html'); await h.pause(600);
  await h.click(card(page, 'Fernway')); await h.pause(1500);
  await h.click(card(page, 'Kitebase')); await h.pause(1600);
  return ready;
});
await scene(b, OUT, BASE, '04-browse', async (page, h) => {
  const ready = await h.go('/index.html'); await h.pause(400);
  await h.click(page.getByRole('button', { name: 'Next matches' })); await h.pause(1000);
  await h.click(page.getByRole('button', { name: 'Next matches' })); await h.pause(1200);
  await h.click(card(page, 'Pebble')); await h.pause(1400);
  return ready;
});
await scene(b, OUT, BASE, '05-insights', async (page, h) => {
  const ready = await h.go('/index.html'); await h.pause(400);
  await h.click(page.getByRole('button', { name: 'Pulse index' })); await h.pause(1300);
  await h.click(page.getByRole('button', { name: 'Salary trends' })); await h.pause(700);
  await h.highlight(page.getByRole('button', { name: 'Salary trends' }).locator('xpath=..'), 1800);
  return ready;
});
await b.close();
