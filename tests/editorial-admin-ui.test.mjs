// Opt-in REAL development API/browser integration. Never pass production credentials.
// Parent creates and removes a disposable admin; fixture credentials are not logged.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { launchBrowser } from './helpers/browser.mjs';

test('editorial admin persists separate content and international moderated prices', {
  skip: !process.env.EDITORIAL_UI_FIXTURE,
  timeout: 180000,
}, async () => {
  const fixture = JSON.parse(await readFile(process.env.EDITORIAL_UI_FIXTURE, 'utf8'));
  const host = `https://${process.env.REPLIT_DEV_DOMAIN}`;
  const browser = await launchBrowser();
  const page = await browser.newPage();
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__editorialErrors=[];
    window.addEventListener('error',e=>window.__editorialErrors.push({
      message:e.message,file:e.filename,stack:e.error?.stack
    }));
    window.addEventListener('unhandledrejection',e=>window.__editorialErrors.push({
      rejection:String(e.reason),stack:e.reason?.stack
    }));
  ` });
  const errors = [];
  page.on('Runtime.exceptionThrown', e => errors.push(e.exceptionDetails.text));
  page.on('Page.javascriptDialogOpening', () => page.send('Page.handleJavaScriptDialog', { accept: true }));
  let suffix = randomUUID().slice(0, 8);
  let videoName = `E2E-EDITORIAL-Video-${suffix}`;
  let cheeseName = `E2E-EDITORIAL-Cheese-${suffix}`;
  async function navigate(path, heading) {
    await page.send('Page.navigate', { url: `${host}${path}` });
    await page.wait(`document.body?.innerText.includes(${JSON.stringify(heading)})`);
    await page.wait(`!document.querySelector('[aria-label="Загрузка записей"]')`);
  }
  async function button(text, scope = 'document') {
    const selector = '[data-editorial-test-target]';
    await page.wait(`!![...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled)`);
    await page.evaluate(`(() => {
      document.querySelectorAll(${JSON.stringify(selector)}).forEach(e=>e.removeAttribute('data-editorial-test-target'));
      [...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)} && !b.disabled).setAttribute('data-editorial-test-target','');
    })()`);
    // Radix exit animations may leave the previous overlay covering a newly
    // rendered list button. Wait for the real pointer target, not just the DOM.
    await page.wait(`(() => {
      const e=document.querySelector(${JSON.stringify(selector)});
      e.scrollIntoView({block:'center',behavior:'instant'});
      const r=e.getBoundingClientRect();
      return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));
    })()`, 5000).catch(async error => {
      console.log('Pointer diagnostic:', await page.evaluate(`(() => {
        const e=document.querySelector(${JSON.stringify(selector)}),r=e.getBoundingClientRect();
        return {errors:window.__editorialErrors,text:e.textContent,rect:{x:r.x,y:r.y,width:r.width,height:r.height},
          bodyPointer:getComputedStyle(document.body).pointerEvents,
          blocker:document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)?.outerHTML.slice(0,600)};
      })()`));
      await snapshot('pointer-failure');
      throw error;
    });
    await page.click(selector);
  }
  async function option(trigger, text) {
    if (await page.evaluate(`document.querySelector(${JSON.stringify(trigger)}) instanceof HTMLSelectElement`)) {
      await page.evaluate(`(() => {
        const select=document.querySelector(${JSON.stringify(trigger)});
        const option=[...select.options].find(o=>o.textContent.trim()===${JSON.stringify(text)});
        if(!option) throw new Error('Missing select option');
        select.value=option.value;
        select.dispatchEvent(new Event('change',{bubbles:true}));
      })()`);
      return;
    }
    await page.click(trigger);
    await page.wait(`!![...document.querySelectorAll('[role="option"]')].find(o=>o.textContent.trim()===${JSON.stringify(text)})`);
    await page.evaluate(`(() => {
      const o=[...document.querySelectorAll('[role="option"]')].find(o=>o.textContent.trim()===${JSON.stringify(text)});
      o.setAttribute('data-editorial-option','');
    })()`);
    await page.click('[data-editorial-option]');
    await page.wait(`!document.querySelector('[role="listbox"]')`);
  }
  async function field(name, value) {
    await page.wait(`!!document.querySelector(${JSON.stringify(`#ed-${name}`)})`);
    await page.fill(`#ed-${name}`, String(value));
  }
  async function openCreate() {
    await button('Новая запись');
    await page.wait(`!!document.querySelector('[role="dialog"]')`);
  }
  async function save() {
    await button('Сохранить', `document.querySelector('[role="dialog"]')`);
    await page.wait(`!document.querySelector('[role="dialog"]')`);
  }
  async function editFirst() {
    await button('Изменить');
    await page.wait(`!!document.querySelector('[role="dialog"]')`);
  }
  async function snapshot(name) {
    const image = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    await writeFile(`/tmp/editorial-${name}.jpg`, Buffer.from(image.data, 'base64'));
  }
  async function cleanup() {
    return page.evaluate(`(async () => {
      const headers={Authorization:'Bearer '+sessionStorage.getItem('dgs_web_access_token'),'Content-Type':'application/json'};
      let count=0;
      for(const kind of ['price','cheese','video']){
        const response=await fetch('/web-api/admin/editorial?kind='+kind+'&limit=200',{headers});
        const page=await response.json();
        for(const item of page.items.filter(i=>i.createdBy===${JSON.stringify(fixture.id)})){
          const deleted=await fetch('/web-api/admin/editorial/'+item.id+'?revision='+item.revision,{method:'DELETE',headers});
          if(!deleted.ok) throw new Error('Test cleanup failed: '+deleted.status);
          count++;
        }
      }
      return count;
    })()`);
  }
  try {
    await page.send('Page.navigate', { url: `${host}/web/admin/videos` });
    await page.wait(`!!document.querySelector('#admin-email')`);
    await page.fill('#admin-email', fixture.email);
    await page.fill('#admin-password', fixture.password);
    await page.click('[data-testid="button-admin-login"]');
    await page.wait(`document.body.innerText.includes('Видео и материалы')`);
    if (!process.env.EDITORIAL_UI_PRICES_ONLY) {
    await cleanup();
    await navigate('/web/admin/videos', 'Видео и материалы');
    await openCreate();
    await field('title', videoName);
    await field('url', 'https://www.youtube.com/playlist?list=PLr2lpSOEo-7IyZFeC_BR3xx5gox3EWDWZ');
    await option('#ed-category', 'Интервью');
    await save();
    await navigate('/web/admin/videos', videoName);
    await editFirst();
    assert.equal(await page.evaluate(`document.querySelector('#ed-title').value`), videoName);
    await field('description', 'Real development persistence check');
    await save();
    console.log('PASS: genuine admin login, independent video creation, reopen and update');

    await navigate('/web/admin/cheeses', 'Сырная энциклопедия');
    await openCreate();
    await field('title', cheeseName);
    await field('country', 'Италия');
    await field('productionCountry', 'Россия');
    await field('latitude', 45);
    await field('longitude', 9);
    await field('history', 'Test history');
    await field('characteristics', 'Test characteristics');
    await field('culinaryUses', 'Test culinary use');
    await field('sources', 'https://example.org/source-one\nhttps://example.org/source-two\n');
    assert.equal(await page.evaluate(`document.querySelector('#ed-sources').value.endsWith('\\n')`), true);
    await field('photos', 'https://example.org/cheese.jpg');
    await page.evaluate(`(() => {
      const labels=[...document.querySelectorAll('fieldset label')];
      const video=labels.find(l=>l.textContent.includes(${JSON.stringify(videoName)}));
      if(!video) throw new Error('Missing linked video option');
      video.querySelector('input').click();
      const product=[...document.querySelectorAll('fieldset')].find(f=>f.querySelector('legend')?.textContent.includes('товары'));
      if(product?.querySelector('input')) product.querySelector('input').click();
    })()`);
    await save();
    await navigate('/web/admin/cheeses', cheeseName);
    await editFirst();
    assert.equal(await page.evaluate(`document.querySelector('#ed-productionCountry').value`), 'Россия');
    assert.equal(await page.evaluate(`document.querySelector('#ed-sources').value.split('\\n').length`), 2);
    assert.equal(await page.evaluate(`!![...document.querySelectorAll('fieldset label')].find(l=>l.textContent.includes(${JSON.stringify(videoName)}))?.querySelector('input')?.checked`), true);
    await snapshot('cheese-desktop');
    await button('Отмена', `document.querySelector('[role="dialog"]')`);
    console.log('PASS: cheese origin/production, coordinates, multiline sources, catalogue/video links persist');
    } else {
      const existing = await page.evaluate(`(async () => {
        const headers={Authorization:'Bearer '+sessionStorage.getItem('dgs_web_access_token')};
        const results=await Promise.all(['cheese','video','price'].map(async kind=>{
          const response=await fetch('/web-api/admin/editorial?kind='+kind+'&limit=200',{headers});
          return [kind,(await response.json()).items.filter(i=>i.createdBy===${JSON.stringify(fixture.id)})];
        }));
        return Object.fromEntries(results);
      })()`);
      assert.equal(existing.cheese.length, 1);
      cheeseName = existing.cheese[0].data.title;
      videoName = existing.video[0].data.title;
      suffix = cheeseName.split('-').at(-1);
      for (const record of existing.price) {
        assert.equal(await page.evaluate(`(async () => (await fetch('/web-api/admin/editorial/${record.id}?revision=${record.revision}',
          {method:'DELETE',headers:{Authorization:'Bearer '+sessionStorage.getItem('dgs_web_access_token')}})).status)()`), 204);
      }
      console.log('Reusing already verified video and cheese; checking remaining price flow only');
    }

    await navigate('/web/admin/market-prices', 'Цены в мире');
    await openCreate();
    await option('#ed-cheeseId', cheeseName);
    await option('#ed-sourceType', 'Сообщение пользователя, зафиксированное вручную');
    await field('price', 12.5);
    await field('currency', 'EUR');
    await field('packageQuantity', 250);
    await option('#ed-packageUnit', 'г');
    await field('country', 'Италия');
    await field('store', `E2E-EDITORIAL-Shop-${suffix}`);
    await field('notes', 'Offline observation entered by operator, test only');
    await save();
    await page.wait(`document.body.innerText.includes('50 EUR/кг')`);
    await page.wait(`document.body.innerText.includes('На проверке')`);
    await button('Проверить');
    await field('moderation-note', 'Test source reviewed');
    await button('Сохранить решение');
    await page.wait(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Одобрено')`);
    await navigate('/web/admin/market-prices', 'Одобрено');
    await editFirst();
    await field('price', 15);
    await save();
    await page.wait(`document.body.innerText.includes('На проверке') && document.body.innerText.includes('60 EUR/кг')`);
    await button('Проверить');
    await option('#ed-moderation-decision', 'Отклонить');
    await field('moderation-note', 'Test rejection reason');
    await button('Сохранить решение');
    await page.wait(`!document.querySelector('[role="dialog"]') && document.body.innerText.includes('Отклонено')`);
    await navigate('/web/admin/market-prices', 'Отклонено');
    await snapshot('prices-desktop');
    console.log('PASS: international offline user observation, per-kg calculation, approve/edit-reset/reject persisted');

    await openCreate();
    await option('#ed-cheeseId', cheeseName);
    await field('price', 1000);
    await field('currency', 'RUB');
    await field('country', 'Россия');
    await field('store', `E2E-EDITORIAL-Internet-${suffix}`);
    await button('Сохранить', `document.querySelector('[role="dialog"]')`);
    await page.wait(`document.querySelector('[role="dialog"]').innerText.includes('Для интернет-цены нужна ссылка')`);
    await field('sourceUrl', 'https://example.org/price');
    await option('#ed-packageUnit', 'шт.');
    await page.wait(`document.querySelector('[role="dialog"]').innerText.includes('масса одной штуки неизвестна')`);
    await save();
    await page.wait(`document.body.innerText.includes(${JSON.stringify(`E2E-EDITORIAL-Internet-${suffix}`)})`);
    console.log('PASS: internet source required; piece observations do not invent per-kg conversion');

    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.wait(`document.documentElement.scrollWidth <= innerWidth + 1`);
    await openCreate();
    assert.equal(await page.evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), true);
    await snapshot('price-mobile');
    await button('Отмена', `document.querySelector('[role="dialog"]')`);
    await page.setViewport({ width: 1280, height: 1000 });
    await navigate('/web/admin/cheeses', cheeseName);
    await page.click(`button[aria-label=${JSON.stringify(`Удалить ${cheeseName}`)}]`);
    await page.wait(`document.body.innerText.includes('Сначала удалите связи')`);
    assert.equal(await page.evaluate(`document.body.innerText.includes(${JSON.stringify(cheeseName)})`), true);
    console.log('PASS: mobile no horizontal overflow, dependency deletion blocked with actual API reason');

    // Delete only fixture-owned content through authenticated real APIs; preserve no fake catalogue data.
    assert.equal(await cleanup(), 4);
    assert.deepEqual(errors, []);
    console.log('PASS: no browser exceptions; real test records removed');
  } finally {
    await page.close();
    await browser.close();
  }
});
