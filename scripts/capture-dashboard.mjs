import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

// Set CHROME_PATH when using an installed browser instead of Playwright Chromium.
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 1 });
  const issues = [];
  page.on('pageerror', error => issues.push(error.message));
  const base = process.env.GRAFANA_URL ?? 'http://127.0.0.1:4311';
  await page.goto(base + '/d/incident-desk?from=now-5m&to=now&refresh=5s&kiosk', { waitUntil: 'networkidle' });
  await page.getByText('Completed executions', { exact: true }).waitFor();
  await page.waitForTimeout(1500);
  await mkdir('docs/assets', { recursive: true });
  await page.screenshot({ path: 'docs/assets/dashboard-overview.png' });
  // Grafana virtualizes off-screen panels; scroll them into the DOM first.
  await page.mouse.move(1400, 800);
  for (let step = 0; step < 4; step++) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(300);
  }
  await page.getByText('Fixture p95 latency · before / after', { exact: true }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/assets/dashboard-evidence.png' });
  const errors = await page.getByText(/^(Query error|Panel plugin not found|Datasource.*not found)$/).allTextContents();
  if (errors.length || issues.length) throw new Error(JSON.stringify({ errors, issues }));
  await writeFile('docs/examples/browser-verification.json', JSON.stringify({
    checkedAt: new Date().toISOString(), browser: await browser.version(),
    url: base + '/d/incident-desk', pageErrors: issues, visiblePanelErrors: errors,
    screenshots: ['docs/assets/dashboard-overview.png', 'docs/assets/dashboard-evidence.png'],
  }, null, 2) + '\n');
  process.stdout.write('Captured Grafana overview and evidence panels without browser errors.\n');
} finally {
  await browser.close();
}
