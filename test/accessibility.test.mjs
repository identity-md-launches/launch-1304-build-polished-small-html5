import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createPreviewServer } from '../scripts/serve.mjs';

const { chromium } = await import(process.env.LILY_PLAYWRIGHT_MODULE ?? 'playwright');
const { default: AxeBuilder } = await import(process.env.LILY_AXE_MODULE ?? '@axe-core/playwright');
const server = createPreviewServer({ prefix: '/pond/' });
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let browser;
try {
  browser = await chromium.launch({ headless: true });
} catch (error) {
  await new Promise(resolve => server.close(resolve));
  throw error;
}
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const report = {
  tool: '@axe-core/playwright 4.13.0',
  browser: `Chromium ${browser.version()}`,
  date: new Date().toISOString(),
  tags,
  exportHashes: {},
  states: [],
  textEnlargement: [],
  limitations: [
    'An automated scan is not a screen-reader session or full accessibility certification.',
    'Canvas/gradient backgrounds, overlapping dialog elements and non-text keyboard glyphs require manual contrast review where listed as incomplete.',
    'Changing the root font size to 200% checks text enlargement; it is not native browser zoom.',
  ],
};

try {
  for (const path of ['index.html', 'assets/main.js', 'assets/styles.css']) {
    report.exportHashes[path] = createHash('sha256').update(await readFile(new URL(`../dist/${path}`, import.meta.url))).digest('hex');
  }
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${server.address().port}/pond/`);
  const run = async name => {
    const result = await new AxeBuilder({ page }).withTags(tags).analyze();
    const summarize = finding => ({
      id: finding.id,
      impact: finding.impact,
      nodes: finding.nodes.map(node => ({ target: node.target, reason: node.failureSummary })),
    });
    report.states.push({ name, violations: result.violations.map(summarize), incomplete: result.incomplete.map(summarize), passes: result.passes.length });
    console.log(`${name}: ${result.violations.length} violations; ${result.incomplete.length} incomplete rule groups; ${result.passes.length} rule groups passed.`);
  };

  await run('Desktop title, 1280×900');
  await page.setViewportSize({ width: 390, height: 844 });
  await run('Mobile title, 390×844');
  await page.locator('#play-button').click();
  await run('Mobile playing, 390×844');
  await page.locator('#help-button').click();
  await run('Mobile tutorial, 390×844');
  await page.locator('#help-done').click();
  await run('Mobile paused, 390×844');

  const checkEnlargement = async state => {
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 844 });
      const dimensions = await page.evaluate(() => {
        const content = document.querySelector('.overlay-content').getBoundingClientRect();
        const stage = document.querySelector('.pond-stage').getBoundingClientRect();
        return {
          viewport: innerWidth, body: document.body.scrollWidth, document: document.documentElement.scrollWidth,
          contentWithinStage: content.top >= stage.top - 1 && content.bottom <= stage.bottom + 1 && content.left >= stage.left - 1 && content.right <= stage.right + 1,
          contentHeight: Math.round(content.height), stageHeight: Math.round(stage.height),
        };
      });
      report.textEnlargement.push({ state, ...dimensions });
    }
  };
  await page.addStyleTag({ content: ':root { font-size: 32px !important; }' });
  await checkEnlargement('paused');
  await page.reload();
  await page.addStyleTag({ content: ':root { font-size: 32px !important; }' });
  await checkEnlargement('title');
  await page.locator('#play-button').click();
  await page.clock.fastForward(61_000);
  await page.locator('#game-shell[data-phase="over"]').waitFor();
  await checkEnlargement('over');
  await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
  await writeFile(new URL('../artifacts/accessibility.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  assert.ok(report.states.every(state => state.violations.length === 0), 'Resolve definite axe violations; see artifacts/accessibility.json.');
  const layoutFailures = report.textEnlargement.filter(value => value.body > value.viewport || value.document > value.viewport || !value.contentWithinStage);
  assert.deepEqual(layoutFailures, [], '200% text must fit horizontally and keep title/paused/over content inside the stage.');
  console.log('All scanned states have zero definite violations; title/paused/over overlays fit at 200% text and 320/390/768/1280px without horizontal overflow.');
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
