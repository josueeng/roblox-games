const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch(); const p = await b.newPage();
  await p.goto('file://' + process.cwd() + '/proposta.html', { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.pdf({ path: 'Proposta-Mandacodex-Terto.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true });
  await b.close();
})();
