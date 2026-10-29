import assert from 'node:assert/strict';
import { launchBrowser } from '../../../tests/helpers/browser.mjs';

const browser = await launchBrowser();
const page = await browser.newPage();
const root = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const apiRequests = [];
page.on('Network.requestWillBeSent', event => {
  if (/\/web-api\/|\/api\//.test(event.request.url)) apiRequests.push(event.request.url);
});
async function visit(name, query = '') {
  await page.send('Page.navigate', { url: `${root}/__mockup/preview/editorial/${name}${query}` });
  await page.wait(`!!document.querySelector('.dg-nav a.active[href$="/${name}"]') && !!document.querySelector('.dg h1')`);
  await page.evaluate('document.fonts.ready.then(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))');
}
try {
  for (const width of [1280, 390]) {
    await page.setViewport({ width, height: 900, mobile: width === 390 });
    for (const name of ['Videos', 'CheeseMap', 'CheeseStory', 'EditorialAdmin']) {
      await visit(name);
      assert.equal(await page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true, `Overflow: ${name}/${width}`);
      assert.equal(await page.evaluate('!!document.querySelector("vite-error-overlay")'), false);
      if (width === 390) {
        assert.equal(await page.evaluate('Array.from(document.querySelectorAll(".dg-split")).every(e => getComputedStyle(e).gridTemplateColumns.split(" ").length === 1)'), true, `Mobile columns: ${name}`);
      }
      console.log(`PASS ${name}: ${width}px, rendered, no overflow, mobile columns checked`);
    }
  }
  await visit('CheeseMap');
  await page.wait('document.querySelectorAll(".dg-photo-pin img").length === 2 && document.querySelectorAll("svg path[d]").length > 100');
  await page.click('button[aria-label^="Камамбер"]');
  await page.wait('!!document.querySelector(\'a[href*="cheese=camembert"]\')');
  await page.fill('input[placeholder="Название или регион"]', 'Горгонзола');
  await page.wait('document.querySelectorAll(".dg-photo-pin").length === 1');
  assert.equal(await page.evaluate('document.querySelector(".dg-photo-pin").getAttribute("aria-label").startsWith("Горгонзола")'), true);
  await page.fill('input[placeholder="Название или регион"]', 'несуществующий сыр');
  await page.wait('document.body.innerText.includes("Ничего не найдено")');
  console.log('PASS actual geography, photo selection, correct article link, search, empty state');

  await visit('CheeseStory', '?cheese=camembert');
  await page.wait('document.querySelector(".dg h1")?.innerText.includes("Камамбер")');
  assert.match(await page.evaluate('document.body.innerText'), /необязательн/i);
  assert.equal(await page.evaluate('document.querySelectorAll("iframe").length'), 0);
  console.log('PASS article corresponds to selected cheese');

  await visit('EditorialAdmin');
  assert.equal(await page.evaluate('document.querySelector("#video-cheese-link").value'), '');
  assert.equal(await page.evaluate('document.querySelector("#video-cheese-link").required'), false);
  await page.fill('#editor-title', 'Тест редактора — демо');
  await page.click('button[aria-label="Добавить источник"]');
  await page.wait('document.body.innerText.includes("Ссылка добавлена только")');
  assert.equal(await page.evaluate('document.querySelector("#editor-title").value'), 'Тест редактора — демо');
  await page.evaluate('Array.from(document.querySelectorAll("button")).find(e => /Статья атласа|История сыра/.test(e.textContent)).click()');
  await page.wait('!!document.querySelector("#article-related-video")');
  assert.equal(await page.evaluate('document.querySelector("#article-related-video").disabled'), true);
  console.log('PASS admin input and explicit local-only demo feedback');

  await visit('Videos');
  assert.equal(await page.evaluate('document.querySelectorAll("button[aria-pressed]").length'), 4);
  for (let i = 0; i < 4; i++) {
    await page.evaluate(`document.querySelectorAll('button[aria-pressed]')[${i}].click()`);
    await page.wait(`document.querySelectorAll('button[aria-pressed]')[${i}].getAttribute('aria-pressed') === 'true'`);
    assert.equal(await page.evaluate('document.querySelectorAll(\'button[aria-pressed="true"]\').length'), 1);
    assert.match(await page.evaluate('document.querySelector("p[aria-live]").textContent'), /нет проверенных роликов/);
  }
  console.log('PASS four independent video categories, honest unverified contents, optional cheese/media relations');
  assert.equal(await page.evaluate('document.querySelectorAll("iframe").length'), 0);
  await page.evaluate('Array.from(document.querySelectorAll("button")).find(e => e.textContent.includes("Открыть плейлист")).click()');
  await page.wait('!!document.querySelector("iframe")');
  assert.match(await page.evaluate('document.querySelector("iframe").src'), /embed\/videoseries\?list=PLr2lpSOEo-7IyZFeC_BR3xx5gox3EWDWZ/);
  assert.ok(await page.evaluate('document.querySelector("iframe").getBoundingClientRect().height >= 200'));
  assert.equal(await page.evaluate('!!document.querySelector(\'a[href="https://t.me/dongiulioselect/128"]\')'), true);
  assert.equal(apiRequests.length, 0);
  console.log('PASS click-to-load playlist, minimum player size, Telegram fallback, no store/admin API calls');
  console.log('Media playback itself is NOT verified by these interface checks.');
} finally {
  await page.close();
  await browser.close();
}
