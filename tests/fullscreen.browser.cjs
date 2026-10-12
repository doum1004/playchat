const { pathToFileURL } = require('url');

(async () => {
  const { default: puppeteer } = await import('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-web-security'] });
  try {
    const allStates = [];
    for (const htmlPath of process.argv.slice(2)) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: 960, height: 540 });
        await page.evaluateOnNewDocument('window.__TIMELINE__ = [0, 3000, 6000, 9000]');
        await page.goto(pathToFileURL(htmlPath).href + '?autoplay=0');
        const states = [];
        for (const ms of [0, 1100, 3000, 6000, 9000]) {
          await page.evaluate(ms => window.__SCRUB__(ms), ms);
          await page.evaluate(() => window.__IMAGES_READY__());
          states.push(await page.evaluate(() => ({
            texts: Array.from(document.querySelectorAll('.msg-row .bubble-text'), el => el.textContent),
            annotation: document.querySelector('.msg-row .bubble-annotation')?.textContent,
            mediaSrc: document.getElementById('pc-media-img')?.getAttribute('src'),
            mediaRect: document.getElementById('pc-media-pane')?.getBoundingClientRect().toJSON(),
            sectionTitle: document.getElementById('pc-section-title')?.textContent,
            sectionTitleRect: document.getElementById('pc-section-title')?.getBoundingClientRect().toJSON(),
            bubbleBottom: document.querySelector('.msg-row')?.getBoundingClientRect().bottom,
            bubbleLeft: document.querySelector('.msg-row .bubble')?.getBoundingClientRect().left,
            bubbleRight: document.querySelector('.msg-row .bubble')?.getBoundingClientRect().right,
            rowClass: document.querySelector('.msg-row')?.className,
            avatarLeft: document.querySelector('.msg-row .avatar')?.getBoundingClientRect().left,
            avatarRight: document.querySelector('.msg-row .avatar')?.getBoundingClientRect().right,
            avatarImageLoaded: (() => {
              const image = document.querySelector('.msg-row .avatar-image');
              return Boolean(image && image.complete && image.naturalWidth > 0);
            })(),
          })));
        }
        allStates.push(states);
      } finally {
        await page.close();
      }
    }
    process.stdout.write(JSON.stringify(allStates));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
