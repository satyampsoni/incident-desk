import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const response = await fetch('https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.min.js');
if (!response.ok) throw new Error(`Mermaid download failed: ${response.status}`);
const bundle = await response.text();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});

try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1600 }, deviceScaleFactor: 2 });
  await page.setContent('<html><body style="margin:0;background:#fff"><div id="diagram" style="padding:32px;width:max-content"></div></body></html>');
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: 'base',
    themeVariables: {
      fontFamily: 'Arial, sans-serif', fontSize: '17px',
      primaryColor: '#f8fafc', primaryTextColor: '#172033', primaryBorderColor: '#475569',
      actorBkg: '#f8fafc', actorBorder: '#475569', actorTextColor: '#172033',
      noteBkgColor: '#fff1f2', noteBorderColor: '#be123c', noteTextColor: '#172033',
      signalColor: '#334155', signalTextColor: '#172033',
      labelBoxBkgColor: '#f8fafc', labelBoxBorderColor: '#94a3b8',
      loopTextColor: '#172033',
    },
    sequence: { useMaxWidth: false, actorMargin: 80, messageMargin: 36, noteMargin: 16 },
  }));

  for (const name of ['direct-tool-calls', 'code-mode-execution']) {
    const file = new URL(`../docs/assets/${name}.mmd`, import.meta.url);
    const definition = await readFile(file, 'utf8');
    const svg = await page.evaluate(async ({ definition, name }) => {
      const { svg } = await window.mermaid.render(name, definition);
      document.getElementById('diagram').innerHTML = svg;
      return svg;
    }, { definition, name });
    await writeFile(new URL(`../docs/assets/${name}.svg`, import.meta.url), svg + '\n');
    await page.locator('#diagram').screenshot({ path: new URL(`../docs/assets/${name}.png`, import.meta.url).pathname });
    process.stdout.write(`Rendered ${name}\n`);
  }
} finally {
  await browser.close();
}
