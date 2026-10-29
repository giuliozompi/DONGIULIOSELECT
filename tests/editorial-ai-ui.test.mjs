// Explicit opt-in: this end-to-end check makes two real, bounded AI requests.
// Only disposable DEVELOPMENT accounts may be used. Never enabled in regular CI.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { launchBrowser } from './helpers/browser.mjs';

const path = process.env.EDITORIAL_AI_UI_FIXTURE;
if (!path || process.env.ALLOW_EDITORIAL_LIVE_AI !== '1') {
  console.log('Skipped live AI UI check: requires disposable development fixture and explicit opt-in.');
} else {
  const fixture = JSON.parse(await readFile(path, 'utf8'));
  assert.match(fixture.email, /^editorial-.*@example\.invalid$/);
  const source = (await readFile('/tmp/editorial-ai-source-url.txt', 'utf8')).trim();
  const browser = await launchBrowser(), page = await browser.newPage();
  const exceptions = []; const calls = { catalog: 0, draft: 0 };
  await page.send('Network.enable');
  page.on('Runtime.exceptionThrown', event => exceptions.push(event.exceptionDetails?.text || 'Runtime error'));
  page.on('Network.requestWillBeSent', ({ request }) => {
    for (const kind of ['catalog', 'draft']) if (request.method === 'POST' && request.url.endsWith(`/admin/editorial-ai/${kind}`)) calls[kind]++;
  });
  page.on('Page.javascriptDialogOpening', () => page.send('Page.handleJavaScriptDialog', { accept: true }));
  const api = async (path, method = 'GET', body) => page.evaluate(`(async()=>{
    const token=sessionStorage.getItem('dgs_web_access_token');
    const res=await fetch('/web-api'+${JSON.stringify(path)}, {method:${JSON.stringify(method)},
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      ${body === undefined ? '' : `body:JSON.stringify(${JSON.stringify(body)}),`}
    });const value=await res.json();if(!res.ok)throw Error('API '+res.status+': '+(value.error||'failed'));return value;
  })()`);
  const clickText = async (selector, text) => {
    await page.evaluate(`(()=>{const button=[...document.querySelectorAll(${JSON.stringify(selector)})].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!button)throw Error('Button missing');button.setAttribute('data-ai-e2e-action','1')})()`);
    await page.click('[data-ai-e2e-action="1"]');
    await page.evaluate(`document.querySelector('[data-ai-e2e-action="1"]')?.removeAttribute('data-ai-e2e-action')`);
  };
  try {
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses` });
    await page.wait(`!!document.querySelector('#admin-email')`, 30000);
    await page.fill('#admin-email', fixture.email); await page.fill('#admin-password', fixture.password);
    await page.click('[data-testid="button-admin-login"]');
    await page.wait(`!!document.querySelector('[data-testid="editorial-ai-catalog"]')`, 30000);
    await clickText('[data-testid="editorial-ai-catalog"] button', 'Открыть каталог');
    await page.evaluate(`(()=>{const s=document.querySelector('select[aria-label="Добавить страну"]');s.value='FR';s.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    await page.fill('#ai-catalog-limit', '4');
    if (fixture.catalogRunId) {
      await page.click('[data-testid="ai-catalog-history"]');
      await page.click(`[data-testid="ai-catalog-history-run-${fixture.catalogRunId}"]`);
    } else {
      await page.evaluate(`(()=>{const b=document.querySelector('[data-testid="ai-catalog-generate"]');b.click();b.click()})()`);
    }
    await page.wait(`!!document.querySelector('[data-testid^="ai-catalog-item-"]') || !!document.querySelector('[role="alert"]')`, 90000);
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="editorial-ai-catalog"] [role="alert"]')?.textContent||''`), '');
    assert.equal(calls.catalog, fixture.catalogRunId ? 0 : 1);
    let run = (await api('/admin/editorial-ai/runs?kind=catalog')).items.find(row => row.status === 'ready');
    assert.ok(run);
    run = await api(`/admin/editorial-ai/runs/${run.id}`);
    const items = run.result.items;
    assert.ok(items.some(item => item.countryCode === 'IT') && items.some(item => item.countryCode === 'FR'));
    // Unknown regions must remain unknown, not be invented merely to satisfy a UI test.
    assert.ok(items.some(item => ['IT', 'FR'].includes(item.countryCode) && item.regions.length));
    assert.equal(await page.evaluate(`!!document.querySelector('#catalog-region-filter')`), true);
    const rank = items.find(item => !item.matches.length) || items[0];
    assert.ok(rank);
    const score = rank.importance === 99 ? 98 : 99;
    await page.fill(`#rank-${rank.id}`, String(score));
    await clickText(`[data-testid="ai-catalog-item-${rank.id}"] button`, 'Сохранить');
    await page.wait(`document.querySelector('[data-testid="ai-catalog-item-${rank.id}"]')?.textContent.includes('Сейчас: ${score}/100')`);
    run = await api(`/admin/editorial-ai/runs/${run.id}`);
    assert.equal(run.result.items.find(item => item.id === rank.id).importance, score);
    const selected = [
      items.find(item => item.countryCode === 'IT' && !item.matches.length),
      items.find(item => item.countryCode === 'FR' && !item.matches.length),
    ].filter(Boolean);
    if (selected.length) {
      for (const item of selected) await page.click(`[data-testid="ai-catalog-item-${item.id}"] input[type="checkbox"]`);
      await page.click('[data-testid="ai-catalog-import"]');
      await page.wait(`document.querySelector('[data-testid="editorial-ai-catalog"]')?.textContent.includes('черновиков создано')`);
    }
    run = await api(`/admin/editorial-ai/runs/${run.id}`);
    assert.ok(selected.every(item => run.result.items.find(row => row.id === item.id).matches.length));
    const recheck = selected.length ? selected : items.slice(0, 2);
    const repeated = await api(`/admin/editorial-ai/runs/${run.id}/import`, 'POST', { revision: run.revision, itemIds: recheck.map(item => item.id) });
    assert.equal(repeated.created.length, 0); assert.equal(repeated.skipped.length, recheck.length);
    const parmesan = run.result.items.find(item => /parmigiano/i.test(item.nameOriginal) && item.matches.length);
    let entry;
    if (parmesan) entry = (await api('/admin/editorial?kind=cheese&limit=200')).items.find(item => item.id === parmesan.matches[0].id);
    if (!entry || entry.createdBy !== fixture.id) entry = await api('/admin/editorial', 'POST', { kind: 'cheese', data: {
      title: 'Пармиджано Реджано · проверка AI', country: 'Италия', region: 'Эмилия-Романья, Ломбардия', status: 'draft',
    } });
    assert.ok(entry?.id);
    assert.equal(entry.createdBy, fixture.id, 'Never modify existing real editorial content');
    // Deep link used by duplicate cards must open the existing editor, not a missing route.
    await page.send('Page.navigate', { url: `https://${process.env.REPLIT_DEV_DOMAIN}/web/admin/cheeses?entry=${entry.id}` });
    await page.wait(`!!document.querySelector('#ed-title')`, 30000);
    assert.equal(await page.evaluate(`document.querySelector('#ed-title').value`), entry.data.title);
    await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape' });
    await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape' });
    await page.wait(`!document.querySelector('#ed-title')`);
    const scope = `[data-testid="ai-draft-entry-${entry.id}"]`;
    await clickText(`${scope} button`, 'Подготовить с ИИ');
    await page.fill(`#ai-sources-${entry.id}`, source);
    await page.evaluate(`(()=>{const b=document.querySelector('${scope} [data-testid="ai-draft-generate"]');b.click();b.click()})()`);
    await page.wait(`!!document.querySelector('${scope} [data-testid="ai-proposal-history"]') || !!document.querySelector('${scope} [role="alert"]')`, 90000);
    assert.equal(await page.evaluate(`document.querySelector('${scope} [role="alert"]')?.textContent||''`), '');
    assert.equal(calls.draft, 1);
    const before = (await api('/admin/editorial?kind=cheese&limit=200')).items.find(item => item.id === entry.id);
    assert.equal(before.revision, entry.revision);
    assert.equal(before.data.history, '');
    const editorialText = 'Тест редакторской правки. ' + await page.evaluate(`document.querySelector('${scope} [data-testid="ai-proposal-history"]').value`);
    await page.fill(`${scope} [data-testid="ai-proposal-history"]`, editorialText);
    await page.evaluate(`(()=>{const area=document.querySelector('${scope} [data-testid="ai-proposal-history"]');const checkbox=area.closest('article').querySelector('input[type="checkbox"]');if(!checkbox.checked)checkbox.click()})()`);
    await page.click(`${scope} [data-testid="ai-draft-apply"]`);
    await page.wait(`document.querySelector('${scope} [data-testid="ai-draft-apply"]')?.disabled && document.querySelector('${scope}')?.textContent.includes('Уже применено')`, 30000);
    const after = (await api('/admin/editorial?kind=cheese&limit=200')).items.find(item => item.id === entry.id);
    assert.equal(after.data.history, editorialText); assert.equal(after.data.status, 'draft'); assert.equal(after.publication, null);
    assert.equal(after.revision, entry.revision + 1); assert.deepEqual(after.data.photos, before.data.photos);
    assert.equal(after.data.productionCountry, before.data.productionCountry); assert.ok(after.data.sources.includes(source));
    await page.setViewport({ width: 390, height: 844, mobile: true });
    await page.evaluate(`document.querySelector('${scope}').scrollIntoView({block:'start'})`);
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 75 });
    await writeFile('/tmp/editorial-ai-mobile.jpg', Buffer.from(shot.data, 'base64'));
    assert.equal(await page.evaluate('document.documentElement.scrollWidth>innerWidth+2'), false);
    assert.equal(await page.evaluate(`!!document.querySelector('vite-error-overlay')`), false);
    assert.equal(exceptions.length, 0, 'Browser runtime exceptions detected');
    console.log(JSON.stringify({ passed: true, realGenerations: calls, importedDrafts: selected.length, countries: ['IT', 'FR'],
      verified: ['ranking', 'regional filters present', 'imports', 'duplicates', 'existing-entry link', 'source quotes', 'editable preview', 'selected apply', 'no publication', 'mobile fit', 'no runtime errors'] }));
  } catch (error) {
    const shot = await page.send('Page.captureScreenshot', { format: 'jpeg', quality: 70 }).catch(() => null);
    if (shot) await writeFile('/tmp/editorial-ai-ui-failure.jpg', Buffer.from(shot.data, 'base64'));
    throw error;
  } finally { await page.close(); await browser.close(); }
}
