import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import { createPreviewServer } from '../scripts/serve.mjs';

// The override lets restricted build machines keep all installed tools in /tmp.
const { chromium } = await import(process.env.LILY_PLAYWRIGHT_MODULE ?? 'playwright');
const expectedManifest = {
  schemaVersion: 'pepe-browser-game/1',
  title: 'Lily Hop',
  version: '1.0.0',
  summary: 'Hop across the pond, dodge the hazards, and bring home the coins.',
  description: 'A quick arcade pond run. Collect coins and survive for 60 seconds.',
  controls: 'Arrow keys or WASD to hop. Use the on-screen arrows on mobile. P pauses.',
  genre: 'arcade',
  players: 1,
  mobile: true,
  entry: 'index.html',
  cover: 'cover.svg',
};

assert.deepEqual(JSON.parse(await readFile(new URL('../dist/pepe-game.json', import.meta.url), 'utf8')), expectedManifest);
const cover = await readFile(new URL('../dist/cover.svg', import.meta.url), 'utf8');
assert.match(cover, /width=["']1200["']/);
assert.match(cover, /height=["']630["']/);

const preview = createPreviewServer({ prefix: '/pond/' });
const staticHandler = preview.listeners('request')[0];
const fixture = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Sandbox host test</title>
<link rel="icon" href="data:,">
<style>body {margin:0} iframe {width:900px;height:1000px;border:0}</style>
<iframe id="game" title="Lily Hop sandbox" sandbox="allow-scripts" src="./pond/"></iframe>
<iframe id="sibling" title="Untrusted sibling" sandbox="allow-scripts" srcdoc="<!doctype html><title>Sibling</title>"></iframe>
<script>window.messages=[];addEventListener('message',event=>{if(event.source===document.getElementById('game').contentWindow)window.messages.push(event.data)});</script>`;
const server = createServer((request, response) => {
  if (request.url === '/host.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(fixture);
    return;
  }
  staticHandler(request, response);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
const localExport = new URL('../dist/', import.meta.url).href;
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  await new Promise(resolve => server.close(resolve));
  throw error;
}
const errors = [];
const failures = [];
const requests = [];
let checks = 0;

function watch(page) {
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('requestfailed', request => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on('request', request => requests.push(request.url()));
  page.on('response', response => {
    if (response.status() >= 400) failures.push(`${response.status()} ${response.url()}`);
  });
}

function passed(name) {
  checks += 1;
  console.log(`PASS ${name}`);
}

async function phase(target, expected) {
  await target.locator(`#game-shell[data-phase="${expected}"]`).waitFor();
}

async function postToGame(page, data) {
  await page.evaluate(message => document.querySelector('#game').contentWindow.postMessage(message, '*'), data);
  // Flush asynchronous postMessage dispatch without spending real round time.
  await page.waitForTimeout(40);
}

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  watch(page);
  await page.clock.install();
  await page.goto(`${origin}/pond/`);
  await phase(page, 'title');
  assert.match(await page.title(), /Lily Hop/);
  for (const selector of ['meta[name="description"]', 'meta[property="og:title"]', 'meta[property="og:image"]']) {
    assert.ok((await page.locator(selector).getAttribute('content'))?.length, `${selector} must have content`);
  }
  assert.ok(await page.locator('link[rel="icon"]').getAttribute('href'));
  assert.equal(await page.locator('h1').count(), 1);
  assert.equal(await page.locator('main').count(), 1);
  passed('production export, exact manifest, cover dimensions, metadata and subpath asset loading');

  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    assert.ok(dimensions.document <= width && dimensions.body <= width, `No horizontal overflow at ${width}px: ${JSON.stringify(dimensions)}`);
    if (width === 390) {
      const action = await page.locator('#play-button').boundingBox();
      const heading = await page.locator('h1').boundingBox();
      assert.ok(action && action.y >= 0 && action.y + action.height <= 844, 'Main action must be visible on the first 390px screen');
      assert.ok(heading && heading.y >= 0 && heading.y + heading.height <= 844, 'Product title must be visible on the first 390px screen');
    }
  }
  passed('320/390/768/1280px layout reflow and 390px first-screen product/action');

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('#help-button').focus();
  await page.keyboard.press('Enter');
  await page.locator('#help-dialog[open]').waitFor();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#help-dialog').getAttribute('open'), null);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'help-button');
  passed('keyboard tutorial open, Escape close and focus restoration');

  const soundBefore = await page.locator('#sound-button').getAttribute('aria-pressed');
  assert.ok(soundBefore === 'false' || soundBefore === 'true', 'Sound exposes its toggle state');
  await page.locator('#sound-button').click();
  assert.notEqual(await page.locator('#sound-button').getAttribute('aria-pressed'), soundBefore);
  await page.locator('#sound-button').click();
  assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), soundBefore);
  passed('gesture-enabled sound control toggles and restores mute state');

  await context.setOffline(true);
  await page.locator('#play-button').focus();
  await page.keyboard.press('Enter');
  await phase(page, 'playing');
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'game-canvas');
  assert.equal(Number(await page.locator('#score-value').textContent()), 0);
  await page.keyboard.press('ArrowUp');
  await page.clock.runFor(250);
  assert.equal(Number(await page.locator('#score-value').textContent()), 10, 'Arrow key hop collects the first coin');
  for (const key of ['ArrowDown', 'ArrowRight', 'a', 'w', 's']) {
    await page.keyboard.press(key);
    await page.clock.runFor(250);
  }
  await page.clock.runFor(1_100);
  await page.keyboard.press('p');
  await phase(page, 'paused');
  const pausedTime = await page.locator('#time-value').textContent();
  await page.clock.runFor(5_000);
  assert.equal(await page.locator('#time-value').textContent(), pausedTime);
  await page.locator('#play-button').click();
  await phase(page, 'playing');
  await page.clock.runFor(1_100);
  assert.notEqual(await page.locator('#time-value').textContent(), pausedTime);
  await page.keyboard.press('p');
  await phase(page, 'paused');
  await page.keyboard.press('p');
  await phase(page, 'playing');
  passed('keyboard start, arrow/WASD hops, coin scoring, canvas focus, P/button pause-resume and frozen timer');

  // Engine tests cover every timed step; one long frame also checks the UI's elapsed-time handling.
  await page.clock.fastForward(61_000);
  await phase(page, 'over');
  const finalScore = Number(await page.locator('#score-value').textContent());
  assert.ok(Number.isInteger(finalScore) && finalScore >= 0);
  const stored = await page.evaluate(() => ({ keys: Object.keys(localStorage), best: localStorage.getItem('lily-hop.best.v1') }));
  assert.ok(stored.keys.every(key => key === 'lily-hop.best.v1'), 'The game only stores its local best score');
  if (stored.best !== null) assert.ok(Number(stored.best) >= finalScore);
  await page.locator('#play-button').click();
  await phase(page, 'playing');
  assert.equal(Number(await page.locator('#score-value').textContent()), 0);
  passed('offline round completion, integer score, restricted best-score storage and restart');
  await context.close();

  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, reducedMotion: 'reduce' });
  const mobile = await mobileContext.newPage();
  watch(mobile);
  await mobile.clock.install();
  await mobile.goto(`${origin}/pond/`);
  await phase(mobile, 'title');
  await mobile.locator('#play-button').tap();
  await phase(mobile, 'playing');
  for (const direction of ['up', 'right', 'down', 'left']) {
    const button = mobile.locator(`#move-${direction}`);
    const box = await button.boundingBox();
    assert.ok(box && box.width >= 44 && box.height >= 44, `${direction} touch target is at least 44×44px`);
    await button.tap();
    await mobile.clock.runFor(300);
    if (direction === 'up') assert.equal(Number(await mobile.locator('#score-value').textContent()), 10, 'Touch hop collects the first coin');
  }
  await mobile.locator('#pause-button').tap();
  await phase(mobile, 'paused');
  await mobile.locator('#play-button').tap();
  await phase(mobile, 'playing');
  assert.equal(await mobile.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  passed('emulated touch controls, 44px targets, pause/resume and reduced-motion mode');
  await mobileContext.close();

  const embeddedContext = await browser.newContext({ viewport: { width: 1000, height: 1050 } });
  const host = await embeddedContext.newPage();
  watch(host);
  await host.clock.install();
  await host.goto(`${origin}/host.html`);
  const frame = host.frameLocator('#game');
  await phase(frame, 'title');
  const gameFrame = host.frames().find(candidate => candidate.url() === `${origin}/pond/`);
  assert.ok(gameFrame);
  assert.equal(await gameFrame.evaluate(() => {
    try { localStorage.getItem('lily-hop.best.v1'); return 'available'; } catch (error) { return error.name; }
  }), 'SecurityError');
  await postToGame(host, { protocol: 'pepe-game/1', type: 'init', channel: 42 });
  assert.equal(await host.evaluate(() => window.messages.length), 0);
  const channel = 'browser-test-channel';
  await postToGame(host, { protocol: 'pepe-game/1', type: 'init', channel });
  assert.deepEqual(await host.evaluate(() => window.messages), [{ protocol: 'pepe-game/1', type: 'ready', channel }]);
  await frame.locator('#play-button').click();
  await phase(frame, 'playing');
  await frame.locator('#game-canvas').press('ArrowUp');
  await host.clock.runFor(250);
  assert.equal(Number(await frame.locator('#score-value').textContent()), 10);
  await frame.locator('#game-canvas').press('ArrowDown');
  await host.clock.runFor(250);
  for (const invalid of [
    { protocol: 'wrong', type: 'pause', channel },
    { protocol: 'pepe-game/1', type: 'pause', channel: 'wrong' },
  ]) {
    await postToGame(host, invalid);
    await phase(frame, 'playing');
  }
  const sibling = host.frames().find(candidate => candidate.url() === 'about:srcdoc');
  assert.ok(sibling);
  await sibling.evaluate(message => parent.frames[0].postMessage(message, '*'), { protocol: 'pepe-game/1', type: 'pause', channel });
  await host.waitForTimeout(40);
  await phase(frame, 'playing');
  await postToGame(host, { protocol: 'pepe-game/1', type: 'pause', channel });
  await phase(frame, 'paused');
  const embeddedPausedTime = await frame.locator('#time-value').textContent();
  await host.clock.runFor(3_000);
  assert.equal(await frame.locator('#time-value').textContent(), embeddedPausedTime);
  await postToGame(host, { protocol: 'pepe-game/1', type: 'resume', channel });
  await phase(frame, 'playing');
  await host.clock.fastForward(61_000);
  await phase(frame, 'over');
  const messages = await host.evaluate(() => window.messages);
  const scores = messages.filter(message => message.type === 'score');
  assert.equal(scores.length, 1);
  assert.deepEqual(scores[0], {
    protocol: 'pepe-game/1', type: 'score', channel,
    score: Number(await frame.locator('#score-value').textContent()),
  });
  assert.ok(Number.isInteger(scores[0].score));
  await frame.locator('#play-button').click();
  await phase(frame, 'playing');
  passed('opaque-origin storage read/write SecurityError, parent-only bridge, channel/protocol guards, pause/resume, score and restart');
  await embeddedContext.close();

  const fileContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const filePage = await fileContext.newPage();
  watch(filePage);
  await filePage.clock.install();
  await filePage.goto(`${localExport}index.html`);
  await phase(filePage, 'title');
  await filePage.locator('#play-button').click();
  await phase(filePage, 'playing');
  await filePage.keyboard.press('ArrowUp');
  await filePage.clock.runFor(250);
  assert.equal(Number(await filePage.locator('#score-value').textContent()), 10);
  passed('direct file:// export opens, starts and collects a coin without a server');
  await fileContext.close();

  assert.deepEqual(errors, [], 'No browser console errors or unhandled exceptions');
  assert.deepEqual(failures, [], 'No failed resource requests');
  assert.ok(requests.every(url => url.startsWith(origin) || url.startsWith(localExport) || url.startsWith('data:')), `No external runtime requests: ${requests.filter(url => !url.startsWith(origin) && !url.startsWith(localExport)).join(', ')}`);
  passed('zero runtime console/resource failures and zero external network dependencies');
  console.log(`\n${checks} browser checks passed in Chromium ${browser.version()}.`);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
  preview.close();
}
